import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DouyinPopupAlarmService,
  type PopupAlarmReporter,
} from '../electron/main/services/DouyinPopupAlarmService'
import { PopupAlarmConfigStore } from '../electron/main/services/PopupAlarmConfigStore'
import type { PopupAlarmStateMessage } from '../electron/main/services/PopupAlarmNetworkClient'
import {
  DEFAULT_POPUP_ALARM_CONFIG,
  formatPopupAlarmSpeech,
  normalizeMachineLabel,
  normalizePopupAlarmConfig,
} from '../shared/popupAlarm'

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
function reporter(): PopupAlarmReporter & { sendAlarmState: ReturnType<typeof vi.fn> } {
  return { sendAlarmState: vi.fn().mockResolvedValue(undefined), stop: vi.fn() }
}
async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
  await Promise.resolve()
}

describe('popup alarm shared rules', () => {
  it('formats numeric and custom labels', () => {
    expect(formatPopupAlarmSpeech('3')).toBe('3号机器发现抖音验证弹窗')
    expect(formatPopupAlarmSpeech('直播间A')).toBe('直播间A发现抖音验证弹窗')
  })
  it('validates the full config', () => {
    expect(
      normalizePopupAlarmConfig({
        machineLabel: ' 3 ',
        serverHost: ' 192.168.1.2 ',
        serverPort: '17891',
      }),
    ).toEqual({ machineLabel: '3', serverHost: '192.168.1.2', serverPort: 17891 })
    expect(() => normalizeMachineLabel(' '.repeat(3))).toThrow()
    expect(() => normalizeMachineLabel('a'.repeat(21))).toThrow()
    expect(() =>
      normalizePopupAlarmConfig({ machineLabel: '1', serverHost: 'http://x', serverPort: 1 }),
    ).toThrow()
    expect(() =>
      normalizePopupAlarmConfig({ machineLabel: '1', serverHost: 'x', serverPort: 65536 }),
    ).toThrow()
  })
})

describe('PopupAlarmConfigStore', () => {
  let dir: string
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'popup-alarm-'))
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })
  it('creates defaults and a stable client id when missing', async () => {
    const file = path.join(dir, 'config.json')
    const first = new PopupAlarmConfigStore(file, logger, () => 'client-1')
    expect(await first.initialize()).toEqual(DEFAULT_POPUP_ALARM_CONFIG)
    expect(first.getClientId()).toBe('client-1')
    const second = new PopupAlarmConfigStore(file, logger, () => 'client-2')
    await second.initialize()
    expect(second.getClientId()).toBe('client-1')
  })
  it('migrates old config and persists updates', async () => {
    const file = path.join(dir, 'config.json')
    await fs.writeFile(file, JSON.stringify({ machineLabel: ' 直播间A ' }))
    const store = new PopupAlarmConfigStore(file, logger, () => 'client-x')
    expect(await store.initialize()).toEqual(
      DEFAULT_POPUP_ALARM_CONFIG.machineLabel === '1'
        ? { machineLabel: '直播间A', serverHost: '', serverPort: 17891 }
        : DEFAULT_POPUP_ALARM_CONFIG,
    )
    expect(
      await store.updateConfig({ machineLabel: '3', serverHost: 'server', serverPort: 19000 }),
    ).toEqual({ machineLabel: '3', serverHost: 'server', serverPort: 19000 })
    expect(JSON.parse(await fs.readFile(file, 'utf8')).clientId).toBe('client-x')
  })
  it('falls back from damaged config', async () => {
    const file = path.join(dir, 'config.json')
    await fs.writeFile(file, '{bad')
    const store = new PopupAlarmConfigStore(file, logger, () => 'fallback')
    expect(await store.initialize()).toEqual(DEFAULT_POPUP_ALARM_CONFIG)
  })
})

describe('DouyinPopupAlarmService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })
  afterEach(() => vi.useRealTimers())
  const config = { machineLabel: '3', serverHost: '10.0.0.5', serverPort: 17891 }
  function create(windows: () => Promise<{ name: string }[]>, r = reporter()) {
    return {
      r,
      service: new DouyinPopupAlarmService({
        windowProvider: windows,
        getConfig: () => config,
        getClientId: () => 'client-1',
        reporter: r,
        logger,
        platform: 'win32',
        createAlarmId: () => 'alarm-1',
      }),
    }
  }
  it('sends immediately, heartbeats every 5 seconds, then clears', async () => {
    let active = true
    const { service, r } = create(vi.fn(async () => (active ? [{ name: '人机交互' }] : [])))
    service.start()
    await advance(1_000)
    expect(r.sendAlarmState).toHaveBeenCalledWith(
      expect.objectContaining({ popupActive: true, alarmId: 'alarm-1', machineLabel: '3' }),
    )
    await advance(4_000)
    expect(r.sendAlarmState).toHaveBeenCalledTimes(1)
    await advance(1_000)
    expect(r.sendAlarmState).toHaveBeenCalledTimes(2)
    active = false
    await advance(1_000)
    expect(r.sendAlarmState).toHaveBeenLastCalledWith(
      expect.objectContaining({ popupActive: false, alarmId: 'alarm-1' }),
    )
    service.stop()
  })
  it('uses one cycle for multiple windows and recovers after scan failure', async () => {
    const windows = vi
      .fn()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValue([{ name: '人机交互' }, { name: '另一个人机交互' }])
    const { service, r } = create(windows)
    service.start()
    await advance(2_000)
    expect(logger.error).toHaveBeenCalled()
    expect(r.sendAlarmState).toHaveBeenCalledTimes(1)
    service.stop()
  })
  it('does not overlap asynchronous scans', async () => {
    let resolve!: (v: { name: string }[]) => void
    const windows = vi.fn(
      () =>
        new Promise<{ name: string }[]>(r => {
          resolve = r
        }),
    )
    const { service } = create(windows)
    service.start()
    await advance(3_000)
    expect(windows).toHaveBeenCalledTimes(1)
    resolve([])
    await Promise.resolve()
    await advance(1_000)
    expect(windows).toHaveBeenCalledTimes(2)
    service.stop()
  })
  it('does nothing outside Windows and keeps lifecycle idempotent', async () => {
    const r = reporter()
    const stop = vi.fn()
    const windows = vi.fn().mockResolvedValue([{ name: '人机交互' }])
    const service = new DouyinPopupAlarmService({
      windowProvider: windows,
      stopWindowProvider: stop,
      getConfig: () => config,
      getClientId: () => 'c',
      reporter: r,
      logger,
      platform: 'darwin',
    })
    service.start()
    service.start()
    await advance(5_000)
    expect(windows).not.toHaveBeenCalled()
    service.stop()
    service.stop()
    expect(stop).toHaveBeenCalledTimes(1)
    expect(r.stop).toHaveBeenCalledTimes(1)
  })
})
