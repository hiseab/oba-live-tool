import { createLogger } from '#/logger'
import { popupAlarmConfigService } from './PopupAlarmConfigService'
import {
  getWorkstationConnectionBuildConfig,
  WorkstationConnectionService,
} from './WorkstationConnectionService'

export const workstationConnectionService = new WorkstationConnectionService({
  config: getWorkstationConnectionBuildConfig(),
  getIdentity: () => ({
    workstationId: popupAlarmConfigService.getClientId(),
    machineLabel: popupAlarmConfigService.getConfig().machineLabel,
  }),
  logger: createLogger('工作机连接'),
})
