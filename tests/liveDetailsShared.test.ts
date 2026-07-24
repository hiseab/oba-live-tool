import assert from 'node:assert/strict'
import test from 'node:test'
import * as liveDetails from '../shared/liveDetails'

test('getLiveDetailsTransportErrorMessage normalizes renderer IPC failures', () => {
  const getMessage = (
    liveDetails as typeof liveDetails & {
      getLiveDetailsTransportErrorMessage?: (error: unknown) => string
    }
  ).getLiveDetailsTransportErrorMessage

  assert.equal(typeof getMessage, 'function')
  assert.equal(getMessage?.(new Error('IPC channel unavailable')), 'IPC channel unavailable')
  assert.equal(getMessage?.('窗口已关闭'), '窗口已关闭')
  assert.equal(getMessage?.(null), '获取直播明细失败，请稍后重试')
})
