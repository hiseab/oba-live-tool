import { IPC_CHANNELS } from 'shared/ipcChannels'
import { popupAlarmConfigService } from '#/services/PopupAlarmConfigService'
import { typedIpcMainHandle } from '#/utils'

export function setupPopupAlarmIpcHandlers() {
  typedIpcMainHandle(IPC_CHANNELS.popupAlarm.getConfig, () => {
    return popupAlarmConfigService.getConfig()
  })

  typedIpcMainHandle(IPC_CHANNELS.popupAlarm.updateConfig, (_, config) => {
    // 渲染进程输入不可信，持久化服务会再次执行完整校验和 trim。
    return popupAlarmConfigService.updateConfig(config)
  })
}
