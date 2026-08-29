import { setupAIChatIpcHandlers } from './aichat'
import { setupAppIpcHandlers } from './app'
import { setupAutoMessageIpcHandlers } from './autoMessage'
import { setupAutoPopUpIpcHandlers } from './autoPopUp'
import { setupBrowserIpcHandlers } from './browser'
import { setupAutoReplyIpcHandlers } from './commentListener'
import { setupLiveControlIpcHandlers } from './connection'
import { setupLiveDetailsIpcHandlers } from './liveDetails'
import { setupLiveReviewIpcHandlers } from './liveReview'
import { setupObsRealtimeDedupIpcHandlers } from './obsRealtimeDedup'
import { setupPinCommentIpcHandler } from './pinComment'
import { setupPopupAlarmIpcHandlers } from './popupAlarm'
import { setupProductChangeIpcHandlers } from './productChange'
import { setupRedPacketIpcHandlers } from './redPacket'
import { setupUpdateIpcHandlers } from './update'

setupLiveControlIpcHandlers()
setupLiveDetailsIpcHandlers()
setupLiveReviewIpcHandlers()
setupObsRealtimeDedupIpcHandlers()
setupAIChatIpcHandlers()
setupAutoPopUpIpcHandlers()
setupAutoReplyIpcHandlers()
setupAutoMessageIpcHandlers()
setupBrowserIpcHandlers()
setupAppIpcHandlers()
setupUpdateIpcHandlers()
setupPinCommentIpcHandler()
setupPopupAlarmIpcHandlers()
setupProductChangeIpcHandlers()
setupRedPacketIpcHandlers()
