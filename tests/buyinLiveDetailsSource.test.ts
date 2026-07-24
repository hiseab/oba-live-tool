import assert from 'node:assert/strict'
import test from 'node:test'
import type { Page, Response } from 'playwright'
import * as liveDetailsSource from '../electron/main/platforms/buyin/liveDetails'
import listFixture from './fixtures/buyin-live-session-list.json'

const { buildHistoryLiveParams, BuyinLiveDetailsSource, LiveDetailsCache } = liveDetailsSource

const fixedNow = new Date('2026-07-16T08:00:00.000Z')
const requiredHistoryMetrics =
  'watch_ucnt,avg_watch_duration,acu,product_click_rate,pay_gmv,pay_order_cnt,avg_hour_pay_amt,predict_commission'

test('buildHistoryLiveParams maps 7/30/90 day ranges to official Compass queries', () => {
  assert.deepEqual(buildHistoryLiveParams({ page: 2, pageSize: 20, dateType: 7 }, fixedNow), {
    page_no: 2,
    page_size: 20,
    date_type: 21,
    begin_date: Date.parse('2026-07-10T00:00:00+08:00') / 1000,
    begin_date_format: '2026-07-10T00:00:00+08:00',
    index_selected: requiredHistoryMetrics,
    filter_type: 0,
    is_asc: false,
  })
  assert.deepEqual(buildHistoryLiveParams({ dateType: 30 }, fixedNow), {
    page_no: 1,
    page_size: 10,
    date_type: 23,
    begin_date: Date.parse('2026-06-17T00:00:00+08:00') / 1000,
    begin_date_format: '2026-06-17T00:00:00+08:00',
    index_selected: requiredHistoryMetrics,
    filter_type: 0,
    is_asc: false,
  })
  assert.deepEqual(buildHistoryLiveParams({ dateType: 90 }, fixedNow), {
    page_no: 1,
    page_size: 10,
    date_type: 24,
    begin_date: Date.parse('2026-04-18T00:00:00+08:00') / 1000,
    begin_date_format: '2026-04-18T00:00:00+08:00',
    index_selected: requiredHistoryMetrics,
    filter_type: 0,
    is_asc: false,
  })
})

test('serializeRequestParams preserves official empty string and numeric zero parameters', () => {
  const serializeRequestParams = (
    liveDetailsSource as typeof liveDetailsSource & {
      serializeRequestParams?: (params: Record<string, unknown>) => string
    }
  ).serializeRequestParams

  assert.equal(typeof serializeRequestParams, 'function')
  assert.equal(
    serializeRequestParams?.({
      index_selected: '',
      filter_type: 0,
      is_asc: false,
      page_no: 1,
      optional: undefined,
      nullable: null,
    }),
    'index_selected=&filter_type=0&is_asc=false&page_no=1',
  )
})

test('isCompassPageUrl rejects external and same-host login redirects', () => {
  const isCompassPageUrl = (
    liveDetailsSource as typeof liveDetailsSource & {
      isCompassPageUrl?: (url: string) => boolean
    }
  ).isCompassPageUrl

  assert.equal(typeof isCompassPageUrl, 'function')
  assert.equal(
    isCompassPageUrl?.('https://compass.jinritemai.com/talent/live-detail?from=baiying_console'),
    true,
  )
  assert.equal(isCompassPageUrl?.('https://compass.jinritemai.com/login'), false)
  assert.equal(isCompassPageUrl?.('https://login.jinritemai.com/login'), false)
  assert.equal(isCompassPageUrl?.('not-a-url'), false)
})

test('BuyinLiveDetailsSource waits for the official history response before page fetch', async () => {
  const calls: string[] = []
  const officialResponse = {
    url: () =>
      'https://compass.jinritemai.com/compass_api/content_live/author/live_detail/history_live?page_no=1',
  } as Response
  const compassPage = {
    waitForResponse: async (predicate: (response: Response) => boolean) => {
      calls.push('waitForResponse')
      assert.equal(predicate(officialResponse), true)
      return officialResponse
    },
    goto: async () => {
      calls.push('goto')
      return null
    },
    url: () => 'https://compass.jinritemai.com/talent/live-detail',
    isClosed: () => false,
    close: async () => undefined,
    evaluate: async () => {
      calls.push('evaluate')
      return { ok: true, status: 200, statusText: 'OK', data: listFixture }
    },
  } as unknown as Page
  const mainPage = {
    context: () => ({ newPage: async () => compassPage }),
  } as unknown as Page

  const source = new BuyinLiveDetailsSource(mainPage)
  const result = await source.list({ dateType: 7, pageSize: 10 })

  assert.equal(result.total, 1)
  assert.deepEqual(calls, ['waitForResponse', 'goto', 'evaluate'])
})

test('LiveDetailsCache expires entries after ttl and supports bypass invalidation', () => {
  let now = 1000
  const cache = new LiveDetailsCache<number>(30_000, () => now)

  cache.set('key', 1)
  assert.equal(cache.get('key'), 1)

  now += 30_001
  assert.equal(cache.get('key'), undefined)

  cache.set('key', 2)
  cache.delete('key')
  assert.equal(cache.get('key'), undefined)
})
