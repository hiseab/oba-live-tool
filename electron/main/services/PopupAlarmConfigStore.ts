import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_POPUP_ALARM_CONFIG,
  normalizePopupAlarmConfig,
  type PopupAlarmConfig,
} from 'shared/popupAlarm'

export interface PopupAlarmConfigLogger {
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

export class PopupAlarmConfigStore {
  private config: PopupAlarmConfig = { ...DEFAULT_POPUP_ALARM_CONFIG }

  constructor(
    private readonly configPath: string,
    private readonly logger: PopupAlarmConfigLogger,
  ) {}

  async initialize(): Promise<PopupAlarmConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf8')
      this.config = normalizePopupAlarmConfig(JSON.parse(content))
      this.logger.info('已加载抖音弹窗报警配置')
    } catch (error) {
      this.config = { ...DEFAULT_POPUP_ALARM_CONFIG }
      this.logger.warn('抖音弹窗报警配置不存在或损坏，使用默认机器标识 1', error)
    }

    return this.getConfig()
  }

  getConfig(): PopupAlarmConfig {
    return { ...this.config }
  }

  async updateConfig(value: unknown): Promise<PopupAlarmConfig> {
    const nextConfig = normalizePopupAlarmConfig(value)
    await fs.mkdir(path.dirname(this.configPath), { recursive: true })

    const temporaryPath = `${this.configPath}.tmp`
    await fs.writeFile(temporaryPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8')
    await fs.rename(temporaryPath, this.configPath)

    this.config = nextConfig
    this.logger.info('已保存抖音弹窗报警配置')
    return this.getConfig()
  }
}
