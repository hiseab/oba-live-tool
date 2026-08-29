import { once } from 'node:events'
import { createWriteStream, existsSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { finished } from 'node:stream/promises'
import { app, net, shell } from 'electron'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import {
  isSoftwareUpdateAvailable,
  parseSoftwareUpdateManifest,
  type SoftwareUpdateManifest,
  type SoftwareUpdateProgressInfo,
  type SoftwareUpdateVersionInfo,
} from 'shared/softwareUpdate'
import windowManager from '#/windowManager'
import packageJson from '../../../package.json'
import { createLogger } from '../logger'
import { errorMessage, sleep } from '../utils'

const UPDATE_MANIFEST_URL =
  'https://env-00jy6l3d88f9-static.normal.cloudstatic.cn/admin/static/update.json'
const CURRENT_INTERNAL_VERSION = packageJson.internalVersion
const logger = createLogger('update')

async function timeoutFetch(url: string | URL, timeout = 15_000): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    return await net.fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache',
        'User-Agent': 'oba-live-tool-updater',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('请求升级服务器超时')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

async function fetchUpdateManifest(retries = 3): Promise<SoftwareUpdateManifest> {
  let lastError: unknown
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const manifestUrl = new URL(UPDATE_MANIFEST_URL)
      manifestUrl.searchParams.set('_', Date.now().toString())
      const response = await timeoutFetch(manifestUrl)
      if (!response.ok) throw new Error(`升级服务器返回 HTTP ${response.status}`)
      return parseSoftwareUpdateManifest(await response.json())
    } catch (error) {
      lastError = error
      if (attempt < retries) await sleep(500)
    }
  }
  throw lastError
}

class UpdateManager {
  private installerPath: string | null = null
  private downloadTask: Promise<void> | null = null

  public async checkUpdateVersion(): Promise<SoftwareUpdateVersionInfo | undefined> {
    const manifest = await fetchUpdateManifest()
    logger.debug(
      `内部版本检查完成：本地 ${CURRENT_INTERNAL_VERSION}，服务器 ${manifest.internalVersion}`,
    )
    if (!isSoftwareUpdateAvailable(CURRENT_INTERNAL_VERSION, manifest.internalVersion)) {
      return undefined
    }

    logger.info(
      `检查到可用更新：内部版本 ${CURRENT_INTERNAL_VERSION} -> ${manifest.internalVersion}`,
    )
    return {
      currentVersion: app.getVersion(),
      currentInternalVersion: CURRENT_INTERNAL_VERSION,
      latestInternalVersion: manifest.internalVersion,
    }
  }

  public async silentCheckForUpdate(): Promise<void> {
    try {
      const result = await this.checkUpdateVersion()
      if (result) windowManager.send(IPC_CHANNELS.app.notifyUpdate, result)
    } catch (error) {
      logger.debug(`静默检查更新失败：${errorMessage(error)}`)
    }
  }

  public async checkForUpdates(): Promise<void> {
    if (this.downloadTask) return this.downloadTask
    this.downloadTask = this.downloadLatestInstaller().finally(() => {
      this.downloadTask = null
    })
    return this.downloadTask
  }

  public async quitAndInstall(): Promise<void> {
    if (!this.installerPath || !existsSync(this.installerPath)) {
      throw new Error('升级安装包不存在，请重新下载')
    }

    logger.info(`启动升级安装包：${this.installerPath}`)
    const openError = await shell.openPath(this.installerPath)
    if (openError) throw new Error(`启动升级安装包失败：${openError}`)
    await sleep(1500)
    app.quit()
  }

  private async downloadLatestInstaller(): Promise<void> {
    let downloadUrl: string | undefined
    let fileWriter: ReturnType<typeof createWriteStream> | null = null

    try {
      if (process.platform !== 'win32') {
        throw new Error('当前服务器升级方式仅支持 Windows')
      }

      const manifest = await fetchUpdateManifest()
      downloadUrl = manifest.downloadUrl
      if (!isSoftwareUpdateAvailable(CURRENT_INTERNAL_VERSION, manifest.internalVersion)) {
        throw new Error('当前已经是最新内部版本')
      }

      const response = await timeoutFetch(downloadUrl, 30_000)
      if (!response.ok) throw new Error(`下载安装包失败：HTTP ${response.status}`)
      const reader = response.body?.getReader()
      if (!reader) throw new Error('升级服务器没有返回安装包文件流')

      const total = Number.parseInt(response.headers.get('Content-Length') ?? '0', 10) || 0
      const startedAt = Date.now()
      let transferred = 0
      this.installerPath = path.join(
        app.getPath('temp'),
        `oba-live-tool-update-${manifest.internalVersion}.exe`,
      )
      if (existsSync(this.installerPath)) unlinkSync(this.installerPath)
      fileWriter = createWriteStream(this.installerPath)

      this.sendProgress({
        delta: 0,
        percent: 0,
        bytesPerSecond: 0,
        transferred: 0,
        total,
      })

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!fileWriter.write(value)) await once(fileWriter, 'drain')
        transferred += value.length
        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001)
        this.sendProgress({
          delta: value.length,
          percent: total > 0 ? (transferred / total) * 100 : 0,
          bytesPerSecond: Math.round(transferred / elapsedSeconds),
          transferred,
          total,
        })
      }

      fileWriter.end()
      await finished(fileWriter)
      fileWriter = null
      logger.info(`内部版本 ${manifest.internalVersion} 下载完成`)
      windowManager.send(IPC_CHANNELS.updater.updateDownloaded)
    } catch (error) {
      if (fileWriter) {
        fileWriter.destroy()
        if (!fileWriter.closed) await once(fileWriter, 'close').catch(() => undefined)
      }
      if (this.installerPath && existsSync(this.installerPath)) unlinkSync(this.installerPath)
      this.installerPath = null
      const message = errorMessage(error)
      logger.error(`更新出错：${message}`)
      windowManager.send(IPC_CHANNELS.updater.updateError, { message, downloadURL: downloadUrl })
    }
  }

  private sendProgress(progress: SoftwareUpdateProgressInfo): void {
    windowManager.send(IPC_CHANNELS.updater.downloadProgress, progress)
  }
}

export const updateManager = new UpdateManager()
