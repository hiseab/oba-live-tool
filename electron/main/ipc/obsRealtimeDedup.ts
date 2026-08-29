import { IPC_CHANNELS } from 'shared/ipcChannels'
import { obsRealtimeDedupService } from '#/services/obsRealtimeDedup'
import { typedIpcMainHandle } from '#/utils/ipc'
import windowManager from '#/windowManager'

let eventsRegistered = false

export function setupObsRealtimeDedupIpcHandlers(): void {
  typedIpcMainHandle(IPC_CHANNELS.obsRealtimeDedup.connect, () => obsRealtimeDedupService.connect())
  typedIpcMainHandle(IPC_CHANNELS.obsRealtimeDedup.refreshSources, () =>
    obsRealtimeDedupService.refreshSources(),
  )
  typedIpcMainHandle(IPC_CHANNELS.obsRealtimeDedup.start, (_event, sourceUuid, config) =>
    obsRealtimeDedupService.start(sourceUuid, config),
  )
  typedIpcMainHandle(IPC_CHANNELS.obsRealtimeDedup.updateConfig, (_event, config) =>
    obsRealtimeDedupService.updateConfig(config),
  )
  typedIpcMainHandle(IPC_CHANNELS.obsRealtimeDedup.stop, () => obsRealtimeDedupService.stop())
  typedIpcMainHandle(IPC_CHANNELS.obsRealtimeDedup.getState, () =>
    obsRealtimeDedupService.getState(),
  )

  if (eventsRegistered) return
  eventsRegistered = true
  obsRealtimeDedupService.onState(state => {
    windowManager.send(IPC_CHANNELS.obsRealtimeDedup.stateChanged, state)
  })
  obsRealtimeDedupService.onStatus(status => {
    windowManager.send(IPC_CHANNELS.obsRealtimeDedup.statusChanged, status)
  })
}
