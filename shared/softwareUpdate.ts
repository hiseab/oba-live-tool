export interface SoftwareUpdateManifest {
  internalVersion: number
  downloadUrl: string
}

export interface SoftwareUpdateVersionInfo {
  currentVersion: string
  currentInternalVersion: number
  latestInternalVersion: number
}

export interface SoftwareUpdateProgressInfo {
  delta: number
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export interface SoftwareUpdateError {
  message: string
  downloadURL?: string
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('升级配置必须是 JSON 对象')
  }
  return value as Record<string, unknown>
}

export function parseSoftwareUpdateManifest(value: unknown): SoftwareUpdateManifest {
  const source = asRecord(value)
  const internalVersion = Number(source.internalVersion)
  if (!Number.isInteger(internalVersion) || internalVersion < 1) {
    throw new Error('internalVersion 必须是正整数')
  }
  if (typeof source.downloadUrl !== 'string' || !source.downloadUrl.trim()) {
    throw new Error('downloadUrl 不能为空')
  }
  const downloadUrl = new URL(source.downloadUrl).href
  return { internalVersion, downloadUrl }
}

export function isSoftwareUpdateAvailable(
  currentInternalVersion: number,
  latestInternalVersion: number,
): boolean {
  return latestInternalVersion > currentInternalVersion
}
