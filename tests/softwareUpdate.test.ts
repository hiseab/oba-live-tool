import { describe, expect, it } from 'vitest'
import { isSoftwareUpdateAvailable, parseSoftwareUpdateManifest } from '../shared/softwareUpdate'

describe('软件内部版本升级', () => {
  it('只在服务器内部版本更高时提示升级', () => {
    expect(isSoftwareUpdateAvailable(1, 2)).toBe(true)
    expect(isSoftwareUpdateAvailable(2, 2)).toBe(false)
    expect(isSoftwareUpdateAvailable(3, 2)).toBe(false)
  })

  it('读取内部版本号和安装包地址', () => {
    expect(
      parseSoftwareUpdateManifest({
        internalVersion: 2,
        downloadUrl: 'https://example.com/oba-live-tool.exe',
      }),
    ).toEqual({
      internalVersion: 2,
      downloadUrl: 'https://example.com/oba-live-tool.exe',
    })
  })

  it('拒绝无效内部版本号', () => {
    expect(() =>
      parseSoftwareUpdateManifest({
        internalVersion: 1.5,
        downloadUrl: 'https://example.com/oba-live-tool.exe',
      }),
    ).toThrow('internalVersion')
  })
})
