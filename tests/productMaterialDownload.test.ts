import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  downloadProductMaterials,
  sanitizeWindowsName,
} from '../electron/main/services/ProductMaterialDownloadService'
import type { AssignedProduct, ProductMaterial } from '../shared/productChange'

const temporaryDirectories: string[] = []

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'oba-product-materials-'))
  temporaryDirectories.push(directory)
  return directory
}

function createMaterial(
  id: string,
  name: string,
  url: string,
  type: ProductMaterial['type'] = 'image',
): ProductMaterial {
  return {
    id,
    associationId: `association-${id}`,
    type,
    name,
    url,
    size: 1,
    role: 'normal',
    sort: 0,
  }
}

function createProduct(materials: ProductMaterial[]): AssignedProduct {
  return {
    id: 'product-1',
    name: '商品:一*',
    platform: 'douyin',
    platformProductId: 'platform-product-1',
    coverUrl: '',
    materialCount: materials.length,
    materials,
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => rm(directory, { recursive: true, force: true })),
  )
})

describe('sanitizeWindowsName', () => {
  it('removes illegal characters and protects Windows reserved names', () => {
    expect(sanitizeWindowsName('商品:主图?.jpg')).toBe('商品_主图_.jpg')
    expect(sanitizeWindowsName('CON')).toBe('_CON')
    expect(sanitizeWindowsName('...')).toBe('未命名')
    expect(sanitizeWindowsName(`${'a'.repeat(119)}.`)).toBe('a'.repeat(119))
  })
})

describe('downloadProductMaterials', () => {
  it('downloads all materials and appends a suffix for duplicate file names', async () => {
    const rootDirectory = await createTemporaryDirectory()
    const materials = [
      createMaterial('image-1', '主图?.jpg', 'https://example.com/main.jpg'),
      createMaterial('image-2', '主图?.jpg', 'https://example.com/main-copy.jpg'),
      createMaterial('video-1', '片段:预告', 'https://example.com/clip.mp4?token=1', 'video'),
    ]
    const fetchImpl = vi.fn(
      async (url: string | URL | Request) =>
        new Response(`downloaded:${String(url)}`, { status: 200 }),
    ) as typeof fetch

    const result = await downloadProductMaterials(createProduct(materials), {
      rootDirectory,
      fetchImpl,
    })

    expect(result).toMatchObject({ successCount: 3, failed: [] })
    expect(result.directory).toBe(path.join(rootDirectory, 'OBA商品素材', '商品_一_'))
    expect((await readdir(result.directory)).sort()).toEqual(
      ['主图_.jpg', '主图_(1).jpg', '片段_预告.mp4'].sort(),
    )
    await expect(readFile(path.join(result.directory, '主图_.jpg'), 'utf8')).resolves.toContain(
      'https://example.com/main.jpg',
    )
  })

  it('keeps successful files and removes temporary files when one material fails', async () => {
    const rootDirectory = await createTemporaryDirectory()
    const materials = [
      createMaterial('ok', '成功.jpg', 'https://example.com/ok.jpg'),
      createMaterial('failed', '失败.jpg', 'https://example.com/failed.jpg'),
    ]
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('failed')) {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('partial'))
            controller.error(new Error('stream failed'))
          },
        })
        return new Response(body, { status: 200 })
      }
      return new Response('complete', { status: 200 })
    }) as typeof fetch

    const result = await downloadProductMaterials(createProduct(materials), {
      rootDirectory,
      fetchImpl,
    })

    expect(result.successCount).toBe(1)
    expect(result.failed).toEqual([
      { materialId: 'failed', name: '失败.jpg', message: 'stream failed' },
    ])
    const files = await readdir(result.directory)
    expect(files).toEqual(['成功.jpg'])
    expect(files.some(fileName => fileName.includes('.part-'))).toBe(false)
  })
})
