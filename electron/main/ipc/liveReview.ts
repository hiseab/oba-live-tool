import { Result } from '@praha/byethrow'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import type { LiveReviewErrorCode, LiveReviewResult } from 'shared/liveReview'
import { createLogger } from '#/logger'
import { accountManager } from '#/managers/AccountManager'
import { typedIpcMainHandle } from '#/utils'

const TASK_NAME = '直播复盘'

function mapError(error: unknown): { code: LiveReviewErrorCode; message: string } {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  if (normalized.includes('暂不支持') || normalized.includes('notsupported')) {
    return { code: 'NOT_SUPPORTED', message }
  }
  if (
    normalized.includes('账号不存在') ||
    normalized.includes('找不到页面') ||
    normalized.includes('closed')
  ) {
    return { code: 'NOT_CONNECTED', message: '账号未连接巨量百应中控台' }
  }
  if (normalized.includes('登录') || normalized.includes('401')) {
    return { code: 'LOGIN_EXPIRED', message: '巨量百应登录状态已失效，请重新连接中控台' }
  }
  if (normalized.includes('403') || normalized.includes('forbidden')) {
    return { code: 'FORBIDDEN', message: '当前账号没有查看直播复盘的权限' }
  }
  if (
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('abort')
  ) {
    return { code: 'TIMEOUT', message: '获取直播复盘超时，请稍后重试' }
  }
  if (normalized.includes('响应结构已变化') || normalized.includes('schema')) {
    return { code: 'SCHEMA_CHANGED', message: '百应直播复盘接口结构已变化，请升级应用' }
  }
  return { code: 'UNKNOWN', message: message || '获取直播复盘失败' }
}

export function setupLiveReviewIpcHandlers() {
  typedIpcMainHandle(
    IPC_CHANNELS.tasks.liveReview.overview,
    async (
      _,
      accountId,
      params,
    ): Promise<
      LiveReviewResult<
        Awaited<
          ReturnType<import('#/services/AccountSession').AccountSession['getLiveReviewOverview']>
        >
      >
    > => {
      const sessionResult = accountManager.getSession(accountId)
      if (Result.isFailure(sessionResult)) {
        return { ok: false, code: 'NOT_CONNECTED', message: sessionResult.error.message }
      }
      try {
        return { ok: true, data: await sessionResult.value.getLiveReviewOverview(params) }
      } catch (error) {
        const mapped = mapError(error)
        createLogger(`@${accountManager.getAccountName(accountId)}`)
          .scope(TASK_NAME)
          .error(mapped.message)
        return { ok: false, ...mapped }
      }
    },
  )
}
