import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  parseLiveSessionDetail,
  parseLiveSessionPage,
} from '../electron/main/platforms/buyin/liveDetailsParser'
import detailFixture from './fixtures/buyin-live-session-detail.json'
import listFixture from './fixtures/buyin-live-session-list.json'

test('parseLiveSessionPage normalizes rows and pagination', () => {
  const page = parseLiveSessionPage(listFixture)

  assert.equal(page.total, 1)
  assert.equal(page.page, 1)
  assert.equal(page.pageSize, 20)
  assert.equal(page.items[0]?.id, '7345000000000000000')
  assert.equal(page.items[0]?.title, '测试直播间')
  assert.equal(page.items[0]?.startTime, '2026/07/15 19:30')
  assert.equal(page.items[0]?.duration, '2小时15分30秒')
  assert.equal(page.items[0]?.viewerCount, '12,345')
  assert.equal(page.items[0]?.avgWatchDuration, '1分28秒')
  assert.equal(page.items[0]?.avgOnlineCount, '678')
  assert.equal(page.items[0]?.productClickRate, '23.45%')
  assert.equal(page.items[0]?.gmv, '¥45,678.90')
  assert.equal(page.items[0]?.orderCount, 321)
  assert.equal(page.items[0]?.hourlyGmv, '¥20,301.73')
  assert.equal(page.items[0]?.estimatedCommission, '¥3,456.78')
  assert.equal(page.items[0]?.metrics.pay_gmv, '¥45,678.90')
})

test('parseLiveSessionPage keeps compatibility with flat time fields', () => {
  const response = structuredClone(listFixture) as unknown as {
    data: { data_result: Array<Record<string, unknown>> }
  }
  const row = response.data.data_result[0]
  assert.ok(row)
  row.start_time = '2026/07/15 19:30'
  row.live_duration = '2小时15分30秒'

  const page = parseLiveSessionPage(response)

  assert.equal(page.items[0]?.startTime, '2026/07/15 19:30')
  assert.equal(page.items[0]?.duration, '2小时15分30秒')
})

test('parseLiveSessionDetail keeps core groups and product metrics', () => {
  const detail = parseLiveSessionDetail('7345000000000000000', detailFixture)

  assert.equal(detail.sessionId, '7345000000000000000')
  assert.equal(detail.title, '测试直播间')
  assert.equal(detail.metricGroups[0]?.title, '交易数据')
  assert.equal(detail.metricGroups[1]?.title, '流量表现')
  assert.equal(detail.products[0]?.title, '测试商品')
  assert.equal(detail.products[0]?.metrics.pay_amt, '¥12,345.00')
  assert.equal(detail.products[0]?.metrics.product_click_ucnt, '456')
  assert.equal(detail.products[0]?.metrics.product_show_ucnt, '1,234')
  assert.equal(detail.products[0]?.metricLabels.product_click_ucnt, '商品点击人数')
})

test('parseLiveSessionPage includes safe business error messages', () => {
  assert.throws(
    () => parseLiveSessionPage({ st: 100003, msg: '请求参数不正确' }),
    /百应历史直播列表接口返回失败状态：100003（请求参数不正确）/,
  )
})
