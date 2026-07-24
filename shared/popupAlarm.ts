export interface PopupAlarmConfig {
  machineLabel: string
}

export const DEFAULT_POPUP_ALARM_CONFIG: PopupAlarmConfig = {
  machineLabel: '1',
}

export function normalizeMachineLabel(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('机器标识必须是字符串')
  }

  const normalized = value.trim()
  const length = Array.from(normalized).length
  if (length === 0) {
    throw new Error('机器标识不能为空')
  }
  if (length > 20) {
    throw new Error('机器标识不能超过 20 个字符')
  }

  return normalized
}

export function normalizePopupAlarmConfig(value: unknown): PopupAlarmConfig {
  if (!value || typeof value !== 'object') {
    throw new Error('抖音弹窗报警配置格式无效')
  }

  return {
    machineLabel: normalizeMachineLabel((value as { machineLabel?: unknown }).machineLabel),
  }
}

export function formatPopupAlarmSpeech(machineLabel: string): string {
  const normalized = normalizeMachineLabel(machineLabel)
  return /^\d+$/.test(normalized)
    ? `${normalized}号机器发现抖音验证弹窗`
    : `${normalized}发现抖音验证弹窗`
}
