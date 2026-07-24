import { formatPopupAlarmSpeech, type PopupAlarmConfig } from 'shared/popupAlarm'
import type { PopupAlarmSpeaker } from './PowerShellSpeechSynthesizer'

export interface PopupWindowSource {
  name: string
}

export interface DouyinPopupAlarmLogger {
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
  debug?(message: string, ...args: unknown[]): void
}

export interface DouyinPopupAlarmServiceOptions {
  windowProvider: () => Promise<PopupWindowSource[]>
  stopWindowProvider?: () => void
  getConfig: () => PopupAlarmConfig
  speaker: PopupAlarmSpeaker
  logger: DouyinPopupAlarmLogger
  platform?: NodeJS.Platform
  scanIntervalMs?: number
  repeatIntervalMs?: number
  now?: () => number
}

export class DouyinPopupAlarmService {
  private readonly platform: NodeJS.Platform
  private readonly scanIntervalMs: number
  private readonly repeatIntervalMs: number
  private readonly now: () => number
  private timer: ReturnType<typeof setInterval> | null = null
  private started = false
  private generation = 0
  private scanning = false
  private popupPresent = false
  private lastAlarmAt: number | null = null

  constructor(private readonly options: DouyinPopupAlarmServiceOptions) {
    this.platform = options.platform ?? process.platform
    this.scanIntervalMs = options.scanIntervalMs ?? 1_000
    this.repeatIntervalMs = options.repeatIntervalMs ?? 10_000
    this.now = options.now ?? Date.now
  }

  start(): void {
    if (this.started) return
    this.started = true
    const generation = ++this.generation

    if (this.platform !== 'win32') {
      this.options.logger.warn('当前系统不是 Windows，抖音验证弹窗语音报警已禁用')
      return
    }

    this.timer = setInterval(() => {
      void this.scan(generation)
    }, this.scanIntervalMs)
    this.options.logger.info('抖音验证弹窗监控已启动')
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.generation += 1
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.scanning = false
    this.resetAlarmState()
    this.options.stopWindowProvider?.()
    this.options.speaker.stop()
  }

  private async scan(generation: number): Promise<void> {
    if (this.scanning) return
    this.scanning = true

    try {
      const sources = await this.options.windowProvider()
      if (!this.started || generation !== this.generation) return
      const hasMatchingPopup = sources.some(source => source.name.trim().includes('人机交互'))
      this.handleDetection(hasMatchingPopup)
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
      if (this.popupPresent) this.options.logger.info('抖音验证弹窗已消失，停止重复报警')
      this.resetAlarmState()
      return
    }

    const currentTime = this.now()
    const shouldSpeakImmediately = !this.popupPresent
    const shouldRepeat =
      this.lastAlarmAt !== null && currentTime - this.lastAlarmAt >= this.repeatIntervalMs

    this.popupPresent = true
    if (!shouldSpeakImmediately && !shouldRepeat) return

    this.lastAlarmAt = currentTime
    const speech = formatPopupAlarmSpeech(this.options.getConfig().machineLabel)
    void this.options.speaker.speak(speech).catch(error => {
      this.options.logger.error('播放抖音验证弹窗语音报警失败', error)
    })
  }

  private resetAlarmState(): void {
    this.popupPresent = false
    this.lastAlarmAt = null
  }
}
