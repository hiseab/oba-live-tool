import path from 'node:path'
import { app } from 'electron'
import type { PopupAlarmConfig } from 'shared/popupAlarm'
import { createLogger } from '#/logger'
import { PopupAlarmConfigStore } from './PopupAlarmConfigStore'

const logger = createLogger('抖音弹窗报警配置')
let store: PopupAlarmConfigStore | null = null

function getStore(): PopupAlarmConfigStore {
  if (!store) {
    store = new PopupAlarmConfigStore(
      path.join(app.getPath('userData'), 'popup-alarm-config.json'),
      logger,
    )
  }
  return store
}

export const popupAlarmConfigService = {
  initialize(): Promise<PopupAlarmConfig> {
    return getStore().initialize()
  },
  getConfig(): PopupAlarmConfig {
    return getStore().getConfig()
  },
  updateConfig(config: unknown): Promise<PopupAlarmConfig> {
    return getStore().updateConfig(config)
  },
}
