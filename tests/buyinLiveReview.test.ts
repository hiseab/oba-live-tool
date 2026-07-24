import assert from 'node:assert/strict'
import { test } from 'vitest'
import { buildLiveReviewApiParams } from '../electron/main/platforms/buyin/liveReview'
import {
  parseLiveReviewAccount,
  parseLiveReviewChannels,
  parseLiveReviewProblems,
  parseLiveReviewProducts,
} from '../electron/main/platforms/buyin/liveReviewParser'
import { LIVE_REVIEW_DATE_TYPES } from '../shared/liveReview'

test('buildLiveReviewApiParams creates official seven-day date parameters', () => {
  const { apiParams, range } = buildLiveReviewApiParams(
    { dateType: LIVE_REVIEW_DATE_TYPES.sevenDays },
    {
      maxDate: 1784131200,
      commonUseTypes: [],
      otherTypes: [],
      rangeMap: {},
      activities: [],
      benefits: [],
    },
    new Date('2026-07-17T04:00:00.000Z'),
  )
  assert.equal(apiParams.date_type, 21)
  assert.equal(apiParams.begin_date, '2026/07/10 00:00:00')
  assert.equal(apiParams.end_date, '2026/07/16 00:00:00')
  assert.equal(apiParams.p_date, 1784131200)
  assert.equal(range.isActivity, false)
})

test('buildLiveReviewApiParams uses previous complete natural week and month', () => {
  const week = buildLiveReviewApiParams(
    { dateType: LIVE_REVIEW_DATE_TYPES.naturalWeek },
    undefined,
    new Date('2026-07-17T04:00:00.000Z'),
  )
  assert.equal(week.apiParams.begin_date, '2026/07/06 00:00:00')
  assert.equal(week.apiParams.end_date, '2026/07/12 00:00:00')

  const month = buildLiveReviewApiParams(
    { dateType: LIVE_REVIEW_DATE_TYPES.naturalMonth },
    undefined,
    new Date('2026-07-17T04:00:00.000Z'),
  )
  assert.equal(month.apiParams.begin_date, '2026/06/01 00:00:00')
  assert.equal(month.apiParams.end_date, '2026/06/30 00:00:00')
})

test('live review parsers normalize account, trend, channel and product sections', () => {
  const account = parseLiveReviewAccount({
    data: {
      author_info: { author_name: '测试达人', aweme_id: 'test-001', author_level: 5 },
      index_data: [
        {
          index_name: 'live_cnt',
          index_display: '直播场次',
          value: { value: 8, unit: 'number' },
          change_value: { value: 12.5, unit: 'percent' },
        },
      ],
    },
  })
  assert.equal(account.info.name, '测试达人')
  assert.equal(account.metrics[0]?.value.display, '8')
  assert.equal(account.metrics[0]?.change?.display, '12.5%')

  const problems = parseLiveReviewProblems(
    { data: { days_cnt: 2, flow_fluctuate_cnt: 1, flow_low_cnt: 1 } },
    { data: { index_list: [{ index_code: 'watch_ucnt', display_name: '观看人数' }] } },
    {
      data: {
        index_trend: {
          unit: { watch_ucnt: 'number' },
          trends: [{ horizontal: '07/16', vertical: 1024, point_name: '观看人数' }],
        },
      },
    },
  )
  assert.equal(problems.selectedIndex, 'watch_ucnt')
  assert.equal(problems.trend[0]?.vertical, 1024)

  const channels = parseLiveReviewChannels({
    data: {
      data_head: [{ index_name: 'watch_cnt', index_display: '观看次数', sorted: 1 }],
      data_result: [
        {
          source: { channel_display: '推荐', channel_code: 'recommend' },
          watch_cnt: { value: { value: 3000, unit: 'number' } },
        },
      ],
    },
  })
  assert.equal(channels.rows[0]?.channelName, '推荐')
  assert.equal(channels.rows[0]?.cells.watch_cnt?.value?.display, '3,000')

  const products = parseLiveReviewProducts({
    data: {
      pay_amt_board: [
        { product_id: 'p1', product_name: '测试商品', pay_amt: { value: 199.9, unit: 'price' } },
      ],
    },
  })
  assert.equal(products.payAmount[0]?.name, '测试商品')
  assert.equal(products.payAmount[0]?.metrics.pay_amt?.display, '¥199.90')
})
