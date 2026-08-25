import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { createLogger } from '#/logger'
import { downloadProductMaterials } from '#/services/ProductMaterialDownloadService'
import { workstationConnectionService } from '#/services/workstationConnection'

const logger = createLogger('商品素材下载')

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }
}

export function setupProductChangeIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.productChange.getState, () => workstationConnectionService.getState())

  ipcMain.handle(IPC_CHANNELS.productChange.request, () => {
    workstationConnectionService.requestProductChange()
  })

  ipcMain.handle(IPC_CHANNELS.productChange.complete, (_event, changeId: string) => {
    workstationConnectionService.completeProductChange(changeId)
  })

  ipcMain.handle(IPC_CHANNELS.productChange.download, async (_event, changeId: string) => {
    const record = workstationConnectionService
      .getSnapshot()
      .changes.find(item => item.id === changeId)
    if (!record?.product || !['assigned', 'completed'].includes(record.status)) {
      throw new Error('当前商品更换记录不可下载')
    }
    logger.info(`开始下载商品素材：${record.product.name}`)
    const result = await downloadProductMaterials(record.product)
    if (result.failed.length) {
      logger.warn(
        `商品素材下载完成：成功 ${result.successCount} 个，失败 ${result.failed.length} 个，目录 ${result.directory}`,
      )
      for (const failure of result.failed) {
        logger.warn(`素材下载失败：${failure.name || failure.materialId}（${failure.message}）`)
      }
    } else {
      logger.success(`商品素材下载完成：${result.successCount} 个，目录 ${result.directory}`)
    }
    return result
  })

  workstationConnectionService.onState(state => {
    broadcast(IPC_CHANNELS.productChange.updated, state)
  })
  workstationConnectionService.onProductChangeError(error => {
    broadcast(IPC_CHANNELS.productChange.error, error)
  })
}
