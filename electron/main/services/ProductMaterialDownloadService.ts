import { createWriteStream } from 'node:fs'
import { access, mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app } from 'electron'
import type {
  AssignedProduct,
  ProductMaterial,
  ProductMaterialDownloadResult,
} from 'shared/productChange'

export interface ProductMaterialDownloadOptions {
  rootDirectory?: string
  fetchImpl?: typeof fetch
}

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

export function sanitizeWindowsName(value: string, fallback = '未命名'): string {
  let name = String(value || '').replace(/[<>:"/\\|?*]/g, '_')
  name = Array.from(name, character => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f ? '_' : character
  })
    .join('')
    .trim()
    .slice(0, 120)
    .replace(/[. ]+$/g, '')
  if (!name) name = fallback
  if (WINDOWS_RESERVED_NAMES.test(name)) name = `_${name}`
  return name
}

function extensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const extension = path.extname(decodeURIComponent(pathname))
    return /^\.[a-zA-Z0-9]{1,10}$/.test(extension) ? extension : ''
  } catch {
    return ''
  }
}

function materialFileName(material: ProductMaterial): string {
  const rawName = material.name || `${material.type}-${material.id}`
  const sanitized = sanitizeWindowsName(rawName, `${material.type}-${material.id}`)
  if (path.extname(sanitized)) return sanitized
  return `${sanitized}${extensionFromUrl(material.url)}`
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function uniqueFilePath(directory: string, fileName: string): Promise<string> {
  const extension = path.extname(fileName)
  const baseName = path.basename(fileName, extension)
  let index = 0
  while (true) {
    const suffix = index === 0 ? '' : `(${index})`
    const candidate = path.join(directory, `${baseName}${suffix}${extension}`)
    if (!(await pathExists(candidate))) return candidate
    index += 1
  }
}

async function downloadOne(
  material: ProductMaterial,
  directory: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const response = await fetchImpl(material.url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}`)
  }
  const targetPath = await uniqueFilePath(directory, materialFileName(material))
  const temporaryPath = `${targetPath}.part-${Date.now()}-${Math.random().toString(16).slice(2)}`
  try {
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(temporaryPath))
    await rename(temporaryPath, targetPath)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

export async function downloadProductMaterials(
  product: AssignedProduct,
  options: ProductMaterialDownloadOptions = {},
): Promise<ProductMaterialDownloadResult> {
  const rootDirectory = options.rootDirectory || app.getPath('downloads')
  const fetchImpl = options.fetchImpl || fetch
  const directory = path.join(
    rootDirectory,
    'OBA商品素材',
    sanitizeWindowsName(product.name, `商品-${product.id}`),
  )
  await mkdir(directory, { recursive: true })

  const result: ProductMaterialDownloadResult = {
    directory,
    successCount: 0,
    failed: [],
  }
  for (const material of product.materials) {
    try {
      await downloadOne(material, directory, fetchImpl)
      result.successCount += 1
    } catch (error) {
      result.failed.push({
        materialId: material.id,
        name: material.name,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return result
}
