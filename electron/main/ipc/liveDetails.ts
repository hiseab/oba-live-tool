import { Result } from '@praha/byethrow'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import type { LiveDetailsErrorCode, LiveDetailsResult } from 'shared/liveDetails'
import { createLogger } from '#/logger'
import { accountManager } from '#/managers/AccountManager'
import { typedIpcMainHandle } from '#/utils'

const TASK_NAME = '直播明细'

function mapError(error: unknown): { code: LiveDetailsErrorCode; message: string } {
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
    return { code: 'FORBIDDEN', message: '当前账号没有查看直播明细的权限' }
  }
  if (normalized.includes('404') || normalized.includes('not found')) {
    return { code: 'NOT_FOUND', message: '未找到直播场次或直播数据' }
  }
  if (
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('abort')
  ) {
    return { code: 'TIMEOUT', message: '获取直播明细超时，请稍后重试' }
  }
  if (normalized.includes('响应结构已变化') || normalized.includes('schema')) {
    return { code: 'SCHEMA_CHANGED', message: '百应直播明细接口结构已变化，请升级应用' }
  }
  return { code: 'UNKNOWN', message: message || '获取直播明细失败' }
}

async function run<T>(
  accountId: string,
  request: (session: import('#/services/AccountSession').AccountSession) => Promise<T>,
): Promise<LiveDetailsResult<T>> {
  const sessionResult = accountManager.getSession(accountId)
  if (Result.isFailure(sessionResult)) {
    return { ok: false, code: 'NOT_CONNECTED', message: sessionResult.error.message }
  }

  try {
    return { ok: true, data: await request(sessionResult.value) }
  } catch (error) {
    const mapped = mapError(error)
    createLogger(`@${accountManager.getAccountName(accountId)}`)
      .scope(TASK_NAME)
      .error(mapped.message)
    return { ok: false, ...mapped }
  }
}

export function setupLiveDetailsIpcHandlers() {
  typedIpcMainHandle(IPC_CHANNELS.tasks.liveDetails.list, async (_, accountId, params) => {
    return await run(accountId, session => session.getLiveSessionList(params))
  })

  typedIpcMainHandle(IPC_CHANNELS.tasks.liveDetails.detail, async (_, accountId, params) => {
    return await run(accountId, session => session.getLiveSessionDetail(params))
  })
}
