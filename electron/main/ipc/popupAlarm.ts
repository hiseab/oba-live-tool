import { ipcMain } from 'electron'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { normalizePopupAlarmConnectionTarget } from 'shared/popupAlarm'
import { popupAlarmConfigService } from '#/services/PopupAlarmConfigService'
import { PopupAlarmNetworkClient } from '#/services/PopupAlarmNetworkClient'

const testClient = new PopupAlarmNetworkClient()

export function setupPopupAlarmIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.popupAlarm.getConfig, () => popupAlarmConfigService.getConfig())
  ipcMain.handle(IPC_CHANNELS.popupAlarm.updateConfig, (_event, config: unknown) =>
    popupAlarmConfigService.updateConfig(config),
  )
  ipcMain.handle(IPC_CHANNELS.popupAlarm.testConnection, async (_event, target: unknown) => {
    const normalized = normalizePopupAlarmConnectionTarget(target, true)
    return testClient.testConnection(normalized, popupAlarmConfigService.getClientId())
  })
}
