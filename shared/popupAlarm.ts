export interface PopupAlarmConfig {
  machineLabel: string
  serverHost: string
  serverPort: number
}

export interface PopupAlarmConnectionTarget {
  serverHost: string
  serverPort: number
}

export interface PopupAlarmConnectionTestResult {
  success: boolean
  message: string
  serverVersion?: string
}

export interface StoredPopupAlarmConfig extends PopupAlarmConfig {
  clientId: string
}

export const DEFAULT_POPUP_ALARM_CONFIG: PopupAlarmConfig = {
  machineLabel: '1',
  serverHost: '',
  serverPort: 17891,
}

export function normalizeMachineLabel(value: unknown): string {
  if (typeof value !== 'string') throw new Error('机器标识必须是字符串')
  const normalized = value.trim()
  const length = Array.from(normalized).length
  if (length === 0) throw new Error('机器标识不能为空')
  if (length > 20) throw new Error('机器标识不能超过 20 个字符')
  return normalized
}

export function normalizeServerHost(value: unknown): string {
  if (typeof value !== 'string') throw new Error('报警服务器地址必须是字符串')
  const normalized = value.trim()
  if (Array.from(normalized).length > 255) throw new Error('报警服务器地址不能超过 255 个字符')
  if (/\s|[/:\\]/.test(normalized)) {
    throw new Error('报警服务器地址应填写 IP 或主机名，不要包含协议、端口或路径')
  }
  return normalized
}

export function normalizeServerPort(value: unknown): number {
  const normalized = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof normalized !== 'number' || !Number.isInteger(normalized)) {
    throw new Error('报警服务器端口必须是整数')
  }
  if (normalized < 1 || normalized > 65535) throw new Error('报警服务器端口必须在 1～65535 之间')
  return normalized
}

export function normalizePopupAlarmConnectionTarget(
  value: unknown,
  requireHost = false,
): PopupAlarmConnectionTarget {
  if (!value || typeof value !== 'object') throw new Error('报警服务器配置格式无效')
  const source = value as { serverHost?: unknown; serverPort?: unknown }
  const serverHost = normalizeServerHost(source.serverHost)
  if (requireHost && !serverHost) throw new Error('请填写报警服务器地址')
  return { serverHost, serverPort: normalizeServerPort(source.serverPort) }
}

export function normalizePopupAlarmConfig(value: unknown): PopupAlarmConfig {
  if (!value || typeof value !== 'object') throw new Error('抖音弹窗报警配置格式无效')
  const source = value as { machineLabel?: unknown; serverHost?: unknown; serverPort?: unknown }
  const connection = normalizePopupAlarmConnectionTarget({
    serverHost: source.serverHost ?? '',
    serverPort: source.serverPort ?? DEFAULT_POPUP_ALARM_CONFIG.serverPort,
  })
  return { machineLabel: normalizeMachineLabel(source.machineLabel), ...connection }
}

export function formatPopupAlarmSpeech(machineLabel: string): string {
  const normalized = normalizeMachineLabel(machineLabel)
  return /^[0-9]+$/.test(normalized)
    ? `${normalized}号机器发现抖音验证弹窗`
    : `${normalized}发现抖音验证弹窗`
}
