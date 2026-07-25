import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_POPUP_ALARM_CONFIG,
  normalizePopupAlarmConfig,
  type PopupAlarmConfig,
  type StoredPopupAlarmConfig,
} from 'shared/popupAlarm'

export interface PopupAlarmConfigLogger {
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

export class PopupAlarmConfigStore {
  private config: StoredPopupAlarmConfig = {
    ...DEFAULT_POPUP_ALARM_CONFIG,
    clientId: randomUUID(),
  }

  constructor(
    private readonly configPath: string,
    private readonly logger: PopupAlarmConfigLogger,
    private readonly createClientId: () => string = randomUUID,
  ) {}

  async initialize(): Promise<PopupAlarmConfig> {
    let shouldPersist = false
    try {
      const content = await fs.readFile(this.configPath, 'utf8')
      const source = JSON.parse(content) as Record<string, unknown>
      const publicConfig = normalizePopupAlarmConfig({
        machineLabel: source.machineLabel,
        serverHost: source.serverHost ?? '',
        serverPort: source.serverPort ?? DEFAULT_POPUP_ALARM_CONFIG.serverPort,
      })
      const clientId =
        typeof source.clientId === 'string' && source.clientId.trim()
          ? source.clientId.trim()
          : this.createClientId()
      shouldPersist =
        !source.clientId || source.serverHost === undefined || source.serverPort === undefined
      this.config = { ...publicConfig, clientId }
      this.logger.info('已加载抖音弹窗报警配置')
    } catch (error) {
      this.config = { ...DEFAULT_POPUP_ALARM_CONFIG, clientId: this.createClientId() }
      shouldPersist = true
      this.logger.warn('抖音弹窗报警配置不存在或损坏，已回退默认配置', error)
    }

    if (shouldPersist) {
      try {
        await this.persist(this.config)
      } catch (error) {
        this.logger.error('持久化抖音弹窗报警默认配置失败，程序将继续启动', error)
      }
    }
    return this.getConfig()
  }

  getConfig(): PopupAlarmConfig {
    const { clientId: _clientId, ...config } = this.config
    return { ...config }
  }

  getClientId(): string {
    return this.config.clientId
  }

  async updateConfig(value: unknown): Promise<PopupAlarmConfig> {
    const nextConfig = normalizePopupAlarmConfig(value)
    this.config = { ...nextConfig, clientId: this.config.clientId }
    await this.persist(this.config)
    this.logger.info('已保存抖音弹窗报警配置')
    return this.getConfig()
  }

  private async persist(config: StoredPopupAlarmConfig): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true })
    const temporaryPath = `${this.configPath}.tmp`
    await fs.writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
    await fs.rename(temporaryPath, this.configPath)
  }
}
