import { randomUUID } from 'node:crypto'
import type { PopupAlarmConfig } from 'shared/popupAlarm'
import type { PopupAlarmStateMessage } from './PopupAlarmNetworkClient'

export interface PopupWindowSource {
  name: string
}
export interface DouyinPopupAlarmLogger {
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
  debug?(message: string, ...args: unknown[]): void
}
export interface PopupAlarmReporter {
  sendAlarmState(message: PopupAlarmStateMessage): Promise<void>
  stop?(): void
}
export interface DouyinPopupAlarmServiceOptions {
  windowProvider: () => Promise<PopupWindowSource[]>
  stopWindowProvider?: () => void
  getConfig: () => PopupAlarmConfig
  getClientId: () => string
  reporter: PopupAlarmReporter
  logger: DouyinPopupAlarmLogger
  platform?: NodeJS.Platform
  scanIntervalMs?: number
  heartbeatIntervalMs?: number
  now?: () => number
  createAlarmId?: () => string
}

interface Endpoint {
  serverHost: string
  serverPort: number
}

export class DouyinPopupAlarmService {
  private readonly platform: NodeJS.Platform
  private readonly scanIntervalMs: number
  private readonly heartbeatIntervalMs: number
  private readonly now: () => number
  private readonly createAlarmId: () => string
  private timer: ReturnType<typeof setInterval> | null = null
  private started = false
  private generation = 0
  private scanning = false
  private popupPresent = false
  private alarmId: string | null = null
  private lastReportAttemptAt: number | null = null
  private activeEndpoint: Endpoint | null = null
  private reportChain: Promise<void> = Promise.resolve()
  private warnedUnconfigured = false

  constructor(private readonly options: DouyinPopupAlarmServiceOptions) {
    this.platform = options.platform ?? process.platform
    this.scanIntervalMs = options.scanIntervalMs ?? 1_000
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5_000
    this.now = options.now ?? Date.now
    this.createAlarmId = options.createAlarmId ?? randomUUID
  }

  start(): void {
    if (this.started) return
    this.started = true
    const generation = ++this.generation
    if (this.platform !== 'win32') {
      this.options.logger.warn('当前系统不是 Windows，抖音验证弹窗监控已禁用')
      return
    }
    this.timer = setInterval(() => void this.scan(generation), this.scanIntervalMs)
    this.options.logger.info('抖音验证弹窗监控及局域网上报已启动')
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.generation += 1
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.scanning = false
    this.popupPresent = false
    this.alarmId = null
    this.activeEndpoint = null
    this.options.stopWindowProvider?.()
    this.options.reporter.stop?.()
  }

  private async scan(generation: number): Promise<void> {
    if (this.scanning) return
    this.scanning = true
    try {
      const sources = await this.options.windowProvider()
      if (!this.started || generation !== this.generation) return
      this.handleDetection(sources.some(source => source.name.trim().includes('人机交互')))
    } catch (error) {
      if (this.started && generation === this.generation) {
        this.options.logger.error('扫描 Windows 顶层窗口失败，下一轮将继续重试', error)
      }
    } finally {
      if (generation === this.generation) this.scanning = false
    }
  }

  private handleDetection(hasMatchingPopup: boolean): void {
    if (!hasMatchingPopup) {
      if (this.popupPresent && this.alarmId && this.activeEndpoint) {
        this.options.logger.info('抖音验证弹窗已消失，向报警服务器发送解除状态')
        this.enqueueReport(false, this.activeEndpoint, this.alarmId, 3)
      }
      this.popupPresent = false
      this.alarmId = null
      this.lastReportAttemptAt = null
      this.activeEndpoint = null
      return
    }

    const config = this.options.getConfig()
    const endpoint = config.serverHost
      ? { serverHost: config.serverHost, serverPort: config.serverPort }
      : null
    const currentTime = this.now()

    if (!this.popupPresent) {
      this.popupPresent = true
      this.alarmId = this.createAlarmId()
      this.lastReportAttemptAt = null
      this.activeEndpoint = endpoint
      this.options.logger.info('发现抖音验证弹窗，准备向报警服务器上报')
    } else if (!this.sameEndpoint(this.activeEndpoint, endpoint)) {
      if (this.activeEndpoint && this.alarmId)
        this.enqueueReport(false, this.activeEndpoint, this.alarmId, 2)
      this.activeEndpoint = endpoint
      this.lastReportAttemptAt = null
    }

    if (!endpoint || !this.alarmId) {
      if (!this.warnedUnconfigured) {
        this.warnedUnconfigured = true
        this.options.logger.warn('尚未配置报警服务器地址，弹窗状态不会播放本机语音')
      }
      return
    }
    this.warnedUnconfigured = false

    if (
      this.lastReportAttemptAt === null ||
      currentTime - this.lastReportAttemptAt >= this.heartbeatIntervalMs
    ) {
      this.lastReportAttemptAt = currentTime
      this.enqueueReport(true, endpoint, this.alarmId, 0)
    }
  }

  private enqueueReport(
    popupActive: boolean,
    endpoint: Endpoint,
    alarmId: string,
    retriesRemaining: number,
  ): void {
    const config = this.options.getConfig()
    const message: PopupAlarmStateMessage = {
      ...endpoint,
      clientId: this.options.getClientId(),
      alarmId,
      machineLabel: config.machineLabel,
      popupActive,
    }
    this.reportChain = this.reportChain
      .catch(() => undefined)
      .then(async () => {
        try {
          await this.options.reporter.sendAlarmState(message)
        } catch (error) {
          this.options.logger.error(
            popupActive ? '向报警服务器上报弹窗状态失败' : '向报警服务器发送解除状态失败',
            error,
          )
          if (!popupActive && retriesRemaining > 0 && this.started) {
            setTimeout(
              () => this.enqueueReport(false, endpoint, alarmId, retriesRemaining - 1),
              2_000,
            )
          }
        }
      })
  }

  private sameEndpoint(left: Endpoint | null, right: Endpoint | null): boolean {
    return left?.serverHost === right?.serverHost && left?.serverPort === right?.serverPort
  }
}
