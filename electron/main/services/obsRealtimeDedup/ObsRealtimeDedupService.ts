import type {
  ObsBlurSettings,
  ObsColorSettings,
  ObsConnectionSnapshot,
  ObsRealtimeDedupConfig,
  ObsRealtimeDedupState,
  ObsRealtimeDedupStatus,
  ObsSceneItemTransform,
  ObsSourceInfo,
} from 'shared/obsRealtimeDedup'
import {
  DEFAULT_OBS_REALTIME_DEDUP_CONFIG,
  normalizeObsRealtimeDedupConfig,
} from 'shared/obsRealtimeDedup'
import { BiomechanicsSystem, type RandomSource } from './BiomechanicsSystem'
import type { ObsRealtimeDedupAdapter } from './ObsWebSocketAdapter'
import { ZOOM_BLUR_SHADER } from './zoomBlurShader'

const COLOR_FILTER_NAME = 'Color'
const ZOOM_BLUR_FILTER_NAME = 'Zoom Blur'
const COLOR_FILTER_KIND = 'color_filter'
const ZOOM_BLUR_FILTER_KIND = 'shader_filter'

const NEUTRAL_COLOR_SETTINGS: ObsColorSettings = {
  gamma: 0,
  contrast: 0,
  brightness: 0,
  saturation: 0,
  hue_shift: 0,
  opacity: 100,
}

const NEUTRAL_BLUR_SETTINGS: ObsBlurSettings = {
  samples: 32,
  magnitude: 0.5,
  speed_percent: 0,
}

export interface ObsRealtimeDedupLogger {
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

export interface ObsRealtimeDedupServiceDependencies {
  adapter: ObsRealtimeDedupAdapter
  logger: ObsRealtimeDedupLogger
  now?: () => number
  random?: RandomSource
  setIntervalFn?: typeof setInterval
  clearIntervalFn?: typeof clearInterval
}

interface ActiveEffect {
  source: ObsSourceInfo
  originalTransform: ObsSceneItemTransform
  config: ObsRealtimeDedupConfig
  system: BiomechanicsSystem
  colorSettings: ObsColorSettings
  blurSettings: ObsBlurSettings
  lastUpdateAt: number
  lastReportAt: number
}

type StateListener = (state: ObsRealtimeDedupState) => void
type StatusListener = (status: ObsRealtimeDedupStatus) => void

class MathRandomSource implements RandomSource {
  next(): number {
    return Math.random()
  }
}

function cloneTransform(transform: ObsSceneItemTransform): ObsSceneItemTransform {
  return structuredClone(transform)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export class ObsRealtimeDedupService {
  private readonly adapter: ObsRealtimeDedupAdapter
  private readonly logger: ObsRealtimeDedupLogger
  private readonly now: () => number
  private readonly random: RandomSource
  private readonly setIntervalFn: typeof setInterval
  private readonly clearIntervalFn: typeof clearInterval
  private readonly stateListeners = new Set<StateListener>()
  private readonly statusListeners = new Set<StatusListener>()
  private operationChain: Promise<unknown> = Promise.resolve()
  private active: ActiveEffect | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private tickPromise: Promise<void> | null = null
  private state: ObsRealtimeDedupState = {
    phase: 'disconnected',
    connected: false,
    running: false,
    currentScene: null,
    selectedSourceUuid: null,
    capabilities: { colorFilter: false, shaderFilter: false },
    message: null,
  }

  constructor(dependencies: ObsRealtimeDedupServiceDependencies) {
    this.adapter = dependencies.adapter
    this.logger = dependencies.logger
    this.now = dependencies.now ?? (() => performance.now() / 1000)
    this.random = dependencies.random ?? new MathRandomSource()
    this.setIntervalFn = dependencies.setIntervalFn ?? setInterval
    this.clearIntervalFn = dependencies.clearIntervalFn ?? clearInterval

    this.adapter.on('sceneChanged', event => {
      if (this.active && event.sceneName !== this.active.source.sceneName) {
        void this.stop(`OBS 已切换到场景“${event.sceneName}”，实时去重已安全停止`)
      }
    })
    this.adapter.on('sceneItemRemoved', event => {
      if (
        this.active &&
        event.sceneName === this.active.source.sceneName &&
        (event.sceneItemId === this.active.source.sceneItemId ||
          event.sourceUuid === this.active.source.sourceUuid)
      ) {
        void this.stop('目标源已从 OBS 场景中移除，实时去重已停止')
      }
    })
    this.adapter.on('disconnected', event => {
      this.setState({
        ...this.state,
        phase: this.active ? 'stopping' : 'disconnected',
        connected: false,
        running: false,
        currentScene: null,
        capabilities: { colorFilter: false, shaderFilter: false },
        message: event.message,
      })
      if (this.active) {
        void this.stop(`OBS 连接已断开：${event.message}`)
      }
    })
  }

  connect(): Promise<ObsConnectionSnapshot> {
    return this.enqueue(async () => {
      try {
        const snapshot = await this.adapter.connect()
        this.applySnapshot(snapshot)
        this.logger.info(`已连接 OBS，当前场景：${snapshot.currentScene}`)
        return snapshot
      } catch (error) {
        this.setState({
          ...this.state,
          phase: 'error',
          connected: false,
          running: false,
          message: errorMessage(error),
        })
        throw error
      }
    })
  }

  refreshSources(): Promise<ObsConnectionSnapshot> {
    return this.enqueue(async () => {
      const snapshot = await this.adapter.refreshSources()
      this.applySnapshot(snapshot)
      return snapshot
    })
  }

  start(sourceUuid: string, value: unknown): Promise<ObsRealtimeDedupState> {
    return this.enqueue(async () => {
      const config = normalizeObsRealtimeDedupConfig(value)
      if (this.active) {
        if (this.active.source.sourceUuid !== sourceUuid)
          throw new Error('已有另一个 OBS 源正在运行实时去重')
        this.active.config = config
        this.active.system.updateConfig(config)
        return this.getState()
      }
      if (!this.state.connected) throw new Error('请先连接 OBS')

      const snapshot = await this.adapter.refreshSources()
      this.applySnapshot(snapshot)
      if (!snapshot.capabilities.colorFilter)
        throw new Error('当前 OBS 不支持 color_filter，无法启动实时去重')
      if (!snapshot.capabilities.shaderFilter)
        throw new Error('未检测到 OBS ShaderFilter 插件，请安装后重试')

      const source = snapshot.sources.find(item => item.sourceUuid === sourceUuid)
      if (!source) throw new Error('当前节目场景中未找到选中的 OBS 源')

      const originalTransform = cloneTransform(source.sceneItemTransform)
      try {
        await this.adapter.removeSourceFilter(source.sourceName, COLOR_FILTER_NAME)
        await this.adapter.removeSourceFilter(source.sourceName, ZOOM_BLUR_FILTER_NAME)
        await this.adapter.createSourceFilter(
          source.sourceName,
          COLOR_FILTER_NAME,
          COLOR_FILTER_KIND,
          { ...NEUTRAL_COLOR_SETTINGS },
        )
        await this.adapter.createSourceFilter(
          source.sourceName,
          ZOOM_BLUR_FILTER_NAME,
          ZOOM_BLUR_FILTER_KIND,
          {
            shader_text: ZOOM_BLUR_SHADER,
            ...NEUTRAL_BLUR_SETTINGS,
            ease: false,
            glitch: false,
          },
        )
      } catch (error) {
        await Promise.allSettled([
          this.adapter.removeSourceFilter(source.sourceName, COLOR_FILTER_NAME),
          this.adapter.removeSourceFilter(source.sourceName, ZOOM_BLUR_FILTER_NAME),
        ])
        throw error
      }

      const now = this.now()
      this.active = {
        source,
        originalTransform,
        config,
        system: new BiomechanicsSystem(config, { now: this.now, random: this.random }),
        colorSettings: { ...NEUTRAL_COLOR_SETTINGS },
        blurSettings: { ...NEUTRAL_BLUR_SETTINGS },
        lastUpdateAt: now,
        lastReportAt: now - 0.5,
      }
      this.startTimer()
      this.setState({
        phase: 'running',
        connected: true,
        running: true,
        currentScene: source.sceneName,
        selectedSourceUuid: source.sourceUuid,
        capabilities: snapshot.capabilities,
        message: null,
      })
      this.logger.info(`OBS 实时去重已启动：${source.sourceName}`)
      return this.getState()
    }).catch(error => {
      this.setState({
        ...this.state,
        phase: this.state.connected ? 'error' : 'disconnected',
        running: false,
        message: errorMessage(error),
      })
      throw error
    })
  }

  updateConfig(value: unknown): Promise<ObsRealtimeDedupConfig> {
    return this.enqueue(async () => {
      const config = normalizeObsRealtimeDedupConfig(value)
      if (this.active) {
        this.active.config = config
        this.active.system.updateConfig(config)
      }
      return config
    })
  }

  stop(reason: string | null = null): Promise<ObsRealtimeDedupState> {
    return this.enqueue(() => this.stopInternal(reason))
  }

  async shutdown(): Promise<void> {
    await this.stop('应用正在退出')
    await this.adapter.disconnect()
    this.setState({
      phase: 'disconnected',
      connected: false,
      running: false,
      currentScene: null,
      selectedSourceUuid: null,
      capabilities: { colorFilter: false, shaderFilter: false },
      message: null,
    })
  }

  getState(): ObsRealtimeDedupState {
    return structuredClone(this.state)
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  private async stopInternal(reason: string | null): Promise<ObsRealtimeDedupState> {
    const active = this.active
    if (!active) {
      if (!this.state.connected) {
        this.setState({ ...this.state, phase: 'disconnected', running: false, message: reason })
      } else if (this.state.phase !== 'error') {
        this.setState({ ...this.state, phase: 'connected', running: false, message: reason })
      }
      return this.getState()
    }

    this.stopTimer()
    this.setState({ ...this.state, phase: 'stopping', running: false, message: reason })
    if (this.tickPromise) await this.tickPromise.catch(() => undefined)
    this.active = null

    const cleanupErrors: string[] = []
    const cleanup = async (operation: () => Promise<void>): Promise<void> => {
      try {
        await operation()
      } catch (error) {
        cleanupErrors.push(errorMessage(error))
      }
    }
    await cleanup(() =>
      this.adapter.removeSourceFilter(active.source.sourceName, COLOR_FILTER_NAME),
    )
    await cleanup(() =>
      this.adapter.removeSourceFilter(active.source.sourceName, ZOOM_BLUR_FILTER_NAME),
    )
    await cleanup(() =>
      this.adapter.setSceneItemTransform(
        active.source.sceneName,
        active.source.sceneItemId,
        this.restorableTransform(active.originalTransform),
      ),
    )

    const connected = this.state.connected
    const message = cleanupErrors.length
      ? `${reason ? `${reason}；` : ''}恢复 OBS 状态时发生错误：${cleanupErrors.join('；')}`
      : reason
    this.setState({
      ...this.state,
      phase: connected ? (cleanupErrors.length ? 'error' : 'connected') : 'disconnected',
      running: false,
      selectedSourceUuid: null,
      message,
    })
    this.logger.info('OBS 实时去重已停止', message ?? '')
    return this.getState()
  }

  private startTimer(): void {
    this.stopTimer()
    this.timer = this.setIntervalFn(() => this.scheduleTick(), 10)
  }

  private stopTimer(): void {
    if (!this.timer) return
    this.clearIntervalFn(this.timer)
    this.timer = null
  }

  private scheduleTick(): void {
    if (!this.active || this.tickPromise) return
    const now = this.now()
    if (now - this.active.lastUpdateAt < 1 / this.active.config.frequency) return
    let tickError: unknown = null
    this.tickPromise = this.performTick(now)
      .catch(error => {
        tickError = error
        this.logger.error('OBS 实时去重更新失败', error)
      })
      .finally(() => {
        this.tickPromise = null
        if (tickError) void this.stop(`OBS 实时去重更新失败：${errorMessage(tickError)}`)
      })
  }

  private async performTick(now: number): Promise<void> {
    const active = this.active
    if (!active) return
    const deltaTime = now - active.lastUpdateAt
    active.lastUpdateAt = now
    active.system.updateConfig(active.config)
    const motion = active.system.update(deltaTime)
    const transform: ObsSceneItemTransform = {
      positionX: finite(active.originalTransform.positionX) + motion.x * active.config.amplitude,
      positionY: finite(active.originalTransform.positionY) + motion.y * active.config.amplitude,
      rotation:
        finite(active.originalTransform.rotation) +
        motion.rotation * active.config.rotationAmplitude,
    }

    await this.adapter.setSceneItemTransform(
      active.source.sceneName,
      active.source.sceneItemId,
      transform,
    )

    if (this.chance(active.config.colorProbability)) {
      active.colorSettings = {
        gamma: this.uniform(active.config.gammaRange),
        contrast: this.uniform(active.config.contrastRange),
        brightness: this.uniform(active.config.brightnessRange),
        saturation: this.uniform(active.config.saturationRange),
        hue_shift: this.uniform(active.config.hueShiftRange),
        opacity: this.uniform(active.config.opacityRange),
      }
      await this.adapter.setSourceFilterSettings(active.source.sourceName, COLOR_FILTER_NAME, {
        ...active.colorSettings,
      })
    }

    if (this.chance(active.config.zoomBlurProbability)) {
      active.blurSettings = {
        samples: this.randomInteger(active.config.samplesRange),
        magnitude: this.uniform(active.config.blurMagnitudeRange),
        speed_percent: this.uniform(active.config.speedPercentRange),
      }
      await this.adapter.setSourceFilterSettings(active.source.sourceName, ZOOM_BLUR_FILTER_NAME, {
        ...active.blurSettings,
      })
    }

    if (now - active.lastReportAt >= 0.5) {
      active.lastReportAt = now
      this.emitStatus({
        position: {
          x: finite(transform.positionX),
          y: finite(transform.positionY),
          rotation: finite(transform.rotation),
        },
        colorSettings: { ...active.colorSettings },
        blurSettings: { ...active.blurSettings },
        systemStatus: motion.status,
      })
    }
  }

  private applySnapshot(snapshot: ObsConnectionSnapshot): void {
    if (!this.active) {
      this.setState({
        phase: 'connected',
        connected: true,
        running: false,
        currentScene: snapshot.currentScene,
        selectedSourceUuid: null,
        capabilities: snapshot.capabilities,
        message: null,
      })
    }
  }

  private restorableTransform(transform: ObsSceneItemTransform): ObsSceneItemTransform {
    const restored = cloneTransform(transform)
    delete restored.boundsWidth
    delete restored.boundsHeight
    delete restored.width
    delete restored.height
    delete restored.sourceWidth
    delete restored.sourceHeight
    return restored
  }

  private chance(percent: number): boolean {
    return this.random.next() * 100 < percent
  }

  private uniform(range: readonly [number, number]): number {
    return range[0] + (range[1] - range[0]) * this.random.next()
  }

  private randomInteger(range: readonly [number, number]): number {
    return Math.floor(this.uniform([range[0], range[1] + 1]))
  }

  private setState(state: ObsRealtimeDedupState): void {
    this.state = structuredClone(state)
    for (const listener of this.stateListeners) listener(this.getState())
  }

  private emitStatus(status: ObsRealtimeDedupStatus): void {
    for (const listener of this.statusListeners) listener(structuredClone(status))
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationChain.then(operation, operation)
    this.operationChain = result.catch(() => undefined)
    return result
  }
}

export const OBS_REALTIME_DEDUP_DEFAULT_CONFIG = DEFAULT_OBS_REALTIME_DEDUP_CONFIG
