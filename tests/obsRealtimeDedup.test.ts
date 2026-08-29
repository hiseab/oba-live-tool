import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BiomechanicsSystem } from '../electron/main/services/obsRealtimeDedup/BiomechanicsSystem'
import { ObsRealtimeDedupService } from '../electron/main/services/obsRealtimeDedup/ObsRealtimeDedupService'
import type {
  ObsAdapterEvent,
  ObsAdapterEventPayload,
  ObsRealtimeDedupAdapter,
} from '../electron/main/services/obsRealtimeDedup/ObsWebSocketAdapter'
import type { ObsConnectionSnapshot, ObsSceneItemTransform } from '../shared/obsRealtimeDedup'
import {
  DEFAULT_OBS_REALTIME_DEDUP_CONFIG,
  normalizeObsRealtimeDedupConfig,
} from '../shared/obsRealtimeDedup'

class ConstantRandom {
  constructor(private readonly value = 0.5) {}

  next(): number {
    return this.value
  }
}

const source = {
  sceneName: '直播场景',
  sourceName: '主播',
  sourceUuid: 'source-1',
  sourceType: 'OBS_SOURCE_TYPE_INPUT',
  inputKind: 'ffmpeg_source',
  sceneItemId: 12,
  sceneItemTransform: {
    positionX: 100,
    positionY: 200,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    boundsWidth: 1920,
    boundsHeight: 1080,
  },
}

class FakeObsAdapter implements ObsRealtimeDedupAdapter {
  snapshot: ObsConnectionSnapshot = {
    currentScene: '直播场景',
    sources: [source],
    capabilities: { colorFilter: true, shaderFilter: true },
  }
  calls: Array<{ name: string; args: unknown[] }> = []
  private readonly listeners: Record<ObsAdapterEvent, Set<(payload: unknown) => void>> = {
    sceneChanged: new Set(),
    sceneItemRemoved: new Set(),
    disconnected: new Set(),
  }

  async connect(): Promise<ObsConnectionSnapshot> {
    this.calls.push({ name: 'connect', args: [] })
    return structuredClone(this.snapshot)
  }

  async disconnect(): Promise<void> {
    this.calls.push({ name: 'disconnect', args: [] })
  }

  async refreshSources(): Promise<ObsConnectionSnapshot> {
    this.calls.push({ name: 'refreshSources', args: [] })
    return structuredClone(this.snapshot)
  }

  async setSceneItemTransform(
    sceneName: string,
    sceneItemId: number,
    transform: ObsSceneItemTransform,
  ): Promise<void> {
    this.calls.push({ name: 'setSceneItemTransform', args: [sceneName, sceneItemId, transform] })
  }

  async removeSourceFilter(sourceName: string, filterName: string): Promise<void> {
    this.calls.push({ name: 'removeSourceFilter', args: [sourceName, filterName] })
  }

  async createSourceFilter(
    sourceName: string,
    filterName: string,
    filterKind: string,
    settings: Record<string, unknown>,
  ): Promise<void> {
    this.calls.push({
      name: 'createSourceFilter',
      args: [sourceName, filterName, filterKind, settings],
    })
  }

  async setSourceFilterSettings(
    sourceName: string,
    filterName: string,
    settings: Record<string, unknown>,
  ): Promise<void> {
    this.calls.push({ name: 'setSourceFilterSettings', args: [sourceName, filterName, settings] })
  }

  on<Event extends ObsAdapterEvent>(
    event: Event,
    listener: (payload: ObsAdapterEventPayload[Event]) => void,
  ): () => void {
    const listeners = this.listeners[event]
    const genericListener = listener as (payload: unknown) => void
    listeners.add(genericListener)
    return () => listeners.delete(genericListener)
  }

  emit<Event extends ObsAdapterEvent>(event: Event, payload: ObsAdapterEventPayload[Event]): void {
    for (const listener of this.listeners[event]) listener(payload)
  }
}

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve()
}

describe('OBS 实时去重配置', () => {
  it('提供原规格默认值并把零频率钳制为 0.1', () => {
    expect(DEFAULT_OBS_REALTIME_DEDUP_CONFIG).toMatchObject({
      amplitude: 4,
      frequency: 5,
      heartRateRange: [60, 100],
      colorProbability: 5,
      zoomBlurProbability: 5,
      samplesRange: [31, 33],
    })
    expect(
      normalizeObsRealtimeDedupConfig({
        ...DEFAULT_OBS_REALTIME_DEDUP_CONFIG,
        frequency: 0,
      }).frequency,
    ).toBe(0.1)
  })

  it('拒绝无效概率、反向范围和非整数采样', () => {
    expect(() =>
      normalizeObsRealtimeDedupConfig({
        ...DEFAULT_OBS_REALTIME_DEDUP_CONFIG,
        colorProbability: 101,
      }),
    ).toThrow()
    expect(() =>
      normalizeObsRealtimeDedupConfig({
        ...DEFAULT_OBS_REALTIME_DEDUP_CONFIG,
        safetyMinOffset: 60,
        safetyMaxOffset: 50,
      }),
    ).toThrow()
    expect(() =>
      normalizeObsRealtimeDedupConfig({
        ...DEFAULT_OBS_REALTIME_DEDUP_CONFIG,
        samplesRange: [31.5, 33],
      }),
    ).toThrow()
  })
})

describe('BiomechanicsSystem', () => {
  it('在固定时钟和随机源下产生有限且受限的运动', () => {
    let now = 0
    const system = new BiomechanicsSystem(DEFAULT_OBS_REALTIME_DEDUP_CONFIG, {
      now: () => now,
      random: new ConstantRandom(),
    })
    now = 0.2
    const first = system.update(0.2)
    now = 0.4
    const second = system.update(0.2)

    expect(Number.isFinite(first.x)).toBe(true)
    expect(Number.isFinite(first.y)).toBe(true)
    expect(Math.hypot(second.x, second.y)).toBeLessThanOrEqual(1)
    expect(second.status.biologicalClock.heartRate).toBeGreaterThanOrEqual(60)
    expect(second.status.biologicalClock.heartRate).toBeLessThanOrEqual(100)
    expect(second.status.motion.entropy).toBeGreaterThanOrEqual(0)
  })
})

describe('ObsRealtimeDedupService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function createService(adapter = new FakeObsAdapter()) {
    let now = 0
    const service = new ObsRealtimeDedupService({
      adapter,
      logger,
      now: () => now,
      random: new ConstantRandom(),
    })
    return {
      adapter,
      service,
      setNow: (value: number) => {
        now = value
      },
    }
  }

  it('按固定顺序替换滤镜、更新画面并在停止时恢复', async () => {
    const { adapter, service, setNow } = createService()
    const statuses = vi.fn()
    service.onStatus(statuses)
    await service.connect()
    await service.start('source-1', {
      ...DEFAULT_OBS_REALTIME_DEDUP_CONFIG,
      colorProbability: 100,
      zoomBlurProbability: 100,
      gammaRange: [0, 0],
      blurMagnitudeRange: [0, 0],
      speedPercentRange: [0, 0],
    })

    expect(adapter.calls.slice(2, 6).map(call => call.name)).toEqual([
      'removeSourceFilter',
      'removeSourceFilter',
      'createSourceFilter',
      'createSourceFilter',
    ])
    expect(adapter.calls[2]?.args.slice(0, 2)).toEqual(['主播', 'Color'])
    expect(adapter.calls[3]?.args.slice(0, 2)).toEqual(['主播', 'Zoom Blur'])

    setNow(0.2)
    await vi.advanceTimersByTimeAsync(10)
    expect(adapter.calls.some(call => call.name === 'setSceneItemTransform')).toBe(true)
    expect(statuses).toHaveBeenCalledOnce()
    const status = statuses.mock.calls[0]?.[0]
    expect(status.colorSettings.gamma).toBe(0)
    expect(status.blurSettings.magnitude).toBe(0)
    expect(status.blurSettings.speed_percent).toBe(0)

    await service.stop()
    const transforms = adapter.calls.filter(call => call.name === 'setSceneItemTransform')
    const restored = transforms.at(-1)?.args[2] as ObsSceneItemTransform
    expect(restored.positionX).toBe(100)
    expect(restored.positionY).toBe(200)
    expect(restored).not.toHaveProperty('boundsWidth')
    expect(restored).not.toHaveProperty('boundsHeight')
    expect(service.getState()).toMatchObject({ phase: 'connected', running: false })
  })

  it('缺少 ShaderFilter 时不产生任何滤镜副作用', async () => {
    const adapter = new FakeObsAdapter()
    adapter.snapshot.capabilities.shaderFilter = false
    const { service } = createService(adapter)
    await service.connect()

    await expect(service.start('source-1', DEFAULT_OBS_REALTIME_DEDUP_CONFIG)).rejects.toThrow(
      'ShaderFilter',
    )
    expect(adapter.calls.some(call => call.name === 'createSourceFilter')).toBe(false)
    expect(service.getState()).toMatchObject({ phase: 'error', running: false })
  })

  it('场景切换时自动停止并恢复原始变换', async () => {
    const { adapter, service } = createService()
    await service.connect()
    await service.start('source-1', DEFAULT_OBS_REALTIME_DEDUP_CONFIG)

    adapter.emit('sceneChanged', { sceneName: '备用场景' })
    await flushAsyncWork()

    expect(service.getState()).toMatchObject({ phase: 'connected', running: false })
    expect(service.getState().message).toContain('安全停止')
    expect(adapter.calls.filter(call => call.name === 'removeSourceFilter')).toHaveLength(4)
  })

  it('重复启动同一源只更新配置，不创建第二组滤镜', async () => {
    const { adapter, service } = createService()
    await service.connect()
    await service.start('source-1', DEFAULT_OBS_REALTIME_DEDUP_CONFIG)
    await service.start('source-1', {
      ...DEFAULT_OBS_REALTIME_DEDUP_CONFIG,
      amplitude: 8,
    })

    expect(adapter.calls.filter(call => call.name === 'createSourceFilter')).toHaveLength(2)
    await service.stop()
  })
})
