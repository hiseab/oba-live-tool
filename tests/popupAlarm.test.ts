import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DouyinPopupAlarmService } from '../electron/main/services/DouyinPopupAlarmService'
import { PopupAlarmConfigStore } from '../electron/main/services/PopupAlarmConfigStore'
import type { PopupAlarmSpeaker } from '../electron/main/services/PowerShellSpeechSynthesizer'
import {
  DEFAULT_POPUP_ALARM_CONFIG,
  formatPopupAlarmSpeech,
  normalizeMachineLabel,
} from '../shared/popupAlarm'

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

function createSpeaker(): PopupAlarmSpeaker & {
  speak: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
} {
  return {
    speak: vi.fn().mockResolvedValue(true),
    stop: vi.fn(),
  }
}

async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('popup alarm shared rules', () => {
  it('formats numeric and custom machine labels', () => {
    expect(formatPopupAlarmSpeech('3')).toBe('3号机器发现抖音验证弹窗')
    expect(formatPopupAlarmSpeech('直播间A')).toBe('直播间A发现抖音验证弹窗')
  })

  it('trims and validates machine labels', () => {
    expect(normalizeMachineLabel(' 直播间A ')).toBe('直播间A')
    expect(() => normalizeMachineLabel('')).toThrow('机器标识不能为空')
    expect(() => normalizeMachineLabel('   ')).toThrow('机器标识不能为空')
    expect(() => normalizeMachineLabel('123456789012345678901')).toThrow(
      '机器标识不能超过 20 个字符',
    )
  })
})

describe('PopupAlarmConfigStore', () => {
  let directory: string
  let configPath: string

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'oba-popup-alarm-'))
    configPath = path.join(directory, 'popup-alarm-config.json')
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true })
  })

  it('uses the default machine label when the config does not exist', async () => {
    const store = new PopupAlarmConfigStore(configPath, logger)
    await expect(store.initialize()).resolves.toEqual(DEFAULT_POPUP_ALARM_CONFIG)
    expect(logger.warn).toHaveBeenCalled()
  })

  it('persists a normalized label and reloads it', async () => {
    const store = new PopupAlarmConfigStore(configPath, logger)
    await store.initialize()
    await expect(store.updateConfig({ machineLabel: ' 直播间A ' })).resolves.toEqual({
      machineLabel: '直播间A',
    })

    const reloaded = new PopupAlarmConfigStore(configPath, logger)
    await expect(reloaded.initialize()).resolves.toEqual({ machineLabel: '直播间A' })
  })

  it('rejects invalid renderer input in the main-process store', async () => {
    const store = new PopupAlarmConfigStore(configPath, logger)
    await store.initialize()

    await expect(store.updateConfig({ machineLabel: '   ' })).rejects.toThrow('机器标识不能为空')
    await expect(store.updateConfig({ machineLabel: '123456789012345678901' })).rejects.toThrow(
      '机器标识不能超过 20 个字符',
    )
  })

  it('falls back to defaults when the config file is damaged', async () => {
    await fs.writeFile(configPath, '{not-json', 'utf8')
    const store = new PopupAlarmConfigStore(configPath, logger)

    await expect(store.initialize()).resolves.toEqual(DEFAULT_POPUP_ALARM_CONFIG)
    expect(logger.warn).toHaveBeenCalled()
  })
})

describe('DouyinPopupAlarmService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not speak when no matching window exists', async () => {
    const speaker = createSpeaker()
    const service = new DouyinPopupAlarmService({
      windowProvider: vi.fn().mockResolvedValue([{ name: '普通窗口' }]),
      getConfig: () => ({ machineLabel: '1' }),
      speaker,
      logger,
      platform: 'win32',
    })

    service.start()
    await advance(5_000)
    expect(speaker.speak).not.toHaveBeenCalled()
    service.stop()
  })

  it('speaks immediately on detection and repeats after 10 seconds', async () => {
    const speaker = createSpeaker()
    const service = new DouyinPopupAlarmService({
      windowProvider: vi.fn().mockResolvedValue([{ name: '  人机交互 - 抖音  ' }]),
      getConfig: () => ({ machineLabel: '3' }),
      speaker,
      logger,
      platform: 'win32',
    })

    service.start()
    await advance(1_000)
    expect(speaker.speak).toHaveBeenCalledTimes(1)
    expect(speaker.speak).toHaveBeenLastCalledWith('3号机器发现抖音验证弹窗')

    await advance(9_000)
    expect(speaker.speak).toHaveBeenCalledTimes(1)
    await advance(1_000)
    expect(speaker.speak).toHaveBeenCalledTimes(2)
    service.stop()
  })

  it('uses one alarm cycle for multiple matching windows', async () => {
    const speaker = createSpeaker()
    const service = new DouyinPopupAlarmService({
      windowProvider: vi
        .fn()
        .mockResolvedValue([{ name: '人机交互' }, { name: '另一个人机交互窗口' }]),
      getConfig: () => ({ machineLabel: '1' }),
      speaker,
      logger,
      platform: 'win32',
    })

    service.start()
    await advance(10_000)
    expect(speaker.speak).toHaveBeenCalledTimes(1)
    await advance(1_000)
    expect(speaker.speak).toHaveBeenCalledTimes(2)
    service.stop()
  })

  it('resets after disappearance and alarms immediately when the popup returns', async () => {
    const speaker = createSpeaker()
    const windows = vi
      .fn()
      .mockResolvedValueOnce([{ name: '人机交互' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ name: '人机交互' }])
    const service = new DouyinPopupAlarmService({
      windowProvider: windows,
      getConfig: () => ({ machineLabel: '1' }),
      speaker,
      logger,
      platform: 'win32',
    })

    service.start()
    await advance(3_000)
    expect(speaker.speak).toHaveBeenCalledTimes(2)
    service.stop()
  })

  it('continues scanning after one provider failure', async () => {
    const speaker = createSpeaker()
    const windows = vi
      .fn()
      .mockRejectedValueOnce(new Error('capture failed'))
      .mockResolvedValueOnce([{ name: '人机交互' }])
    const service = new DouyinPopupAlarmService({
      windowProvider: windows,
      getConfig: () => ({ machineLabel: '1' }),
      speaker,
      logger,
      platform: 'win32',
    })

    service.start()
    await advance(2_000)
    expect(logger.error).toHaveBeenCalled()
    expect(speaker.speak).toHaveBeenCalledTimes(1)
    service.stop()
  })

  it('prevents overlapping asynchronous scans', async () => {
    const speaker = createSpeaker()
    let resolveScan: ((sources: { name: string }[]) => void) | undefined
    const windows = vi.fn(
      () =>
        new Promise<{ name: string }[]>(resolve => {
          resolveScan = resolve
        }),
    )
    const service = new DouyinPopupAlarmService({
      windowProvider: windows,
      getConfig: () => ({ machineLabel: '1' }),
      speaker,
      logger,
      platform: 'win32',
    })

    service.start()
    await advance(3_000)
    expect(windows).toHaveBeenCalledTimes(1)
    resolveScan?.([])
    await Promise.resolve()
    await advance(1_000)
    expect(windows).toHaveBeenCalledTimes(2)
    service.stop()
  })

  it('uses an updated machine label on the next repeated alarm', async () => {
    const speaker = createSpeaker()
    let machineLabel = '1'
    const service = new DouyinPopupAlarmService({
      windowProvider: vi.fn().mockResolvedValue([{ name: '人机交互' }]),
      getConfig: () => ({ machineLabel }),
      speaker,
      logger,
      platform: 'win32',
    })

    service.start()
    await advance(1_000)
    machineLabel = '直播间A'
    await advance(10_000)

    expect(speaker.speak).toHaveBeenNthCalledWith(1, '1号机器发现抖音验证弹窗')
    expect(speaker.speak).toHaveBeenNthCalledWith(2, '直播间A发现抖音验证弹窗')
    service.stop()
  })

  it('keeps start and stop idempotent and disables itself outside Windows', async () => {
    const speaker = createSpeaker()
    const windows = vi.fn().mockResolvedValue([{ name: '人机交互' }])
    const stopWindowProvider = vi.fn()
    const service = new DouyinPopupAlarmService({
      windowProvider: windows,
      stopWindowProvider,
      getConfig: () => ({ machineLabel: '1' }),
      speaker,
      logger,
      platform: 'darwin',
    })

    service.start()
    service.start()
    await advance(5_000)
    expect(windows).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
    service.stop()
    service.stop()
    expect(stopWindowProvider).toHaveBeenCalledTimes(1)
    expect(speaker.stop).toHaveBeenCalledTimes(1)
  })
})
