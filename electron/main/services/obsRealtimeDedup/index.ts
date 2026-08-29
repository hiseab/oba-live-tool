import { createLogger } from '#/logger'
import { ObsRealtimeDedupService } from './ObsRealtimeDedupService'
import { ObsWebSocketAdapter } from './ObsWebSocketAdapter'

export const obsRealtimeDedupService = new ObsRealtimeDedupService({
  adapter: new ObsWebSocketAdapter(),
  logger: createLogger('OBS 实时去重'),
})

export { BiomechanicsSystem } from './BiomechanicsSystem'
export { ObsRealtimeDedupService } from './ObsRealtimeDedupService'
export type { ObsRealtimeDedupAdapter } from './ObsWebSocketAdapter'
