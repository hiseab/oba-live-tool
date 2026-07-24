import type { Page } from 'playwright'
import type {
  LiveSessionDetail,
  LiveSessionDetailParams,
  LiveSessionListParams,
  LiveSessionPage,
} from 'shared/liveDetails'
import { URLS } from './constant'
import { parseLiveSessionDetail, parseLiveSessionPage } from './liveDetailsParser'

const HISTORY_LIVE_API = '/compass_api/content_live/author/live_detail/history_live'
const BASIC_INFO_API = '/compass_api/author/live/live_room_detail/basic_info'
const TRADE_INFO_API = '/compass_api/author/live/live_room_detail/trade_info'
const CORE_GROUP_INFO_API = '/compass_api/author/live/live_room_detail/core_group_info'
const PRODUCTS_API = '/compass_api/author/live/live_room_detail/products_card_detail'
const REQUEST_TIMEOUT = 30_000
const CACHE_TTL = 30_000
const COMPASS_TIME_ZONE_OFFSET_HOURS = 8
const HISTORY_LIVE_INDEX_SELECTED = [
  'watch_ucnt',
  'avg_watch_duration',
  'acu',
  'product_click_rate',
  'pay_gmv',
  'pay_order_cnt',
  'avg_hour_pay_amt',
  'predict_commission',
].join(',')

const DATE_RANGE_CONFIG = {
  7: { apiDateType: 21, days: 7 },
  30: { apiDateType: 23, days: 30 },
  90: { apiDateType: 24, days: 90 },
} as const

export interface HistoryLiveApiParams extends Record<string, unknown> {
  page_no: number
  page_size: number
  date_type: number
  begin_date: number
  begin_date_format: string
  index_selected: string
  filter_type: number
  is_asc: boolean
  sort_field?: string
  query_condition?: string
}

interface CacheEntry<T> {
  expiresAt: number
  value: T
}

interface PageFetchResult {
  ok: boolean
  status: number
  statusText: string
  data?: unknown
}

export class LiveDetailsCache<T> {
  private entries = new Map<string, CacheEntry<T>>()

  constructor(
    private readonly ttl: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttl })
  }

  delete(key: string): void {
    this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
  }
}

export function serializeRequestParams(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) search.set(key, String(value))
  }
  return search.toString()
}

export function isCompassPageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.hostname === 'compass.jinritemai.com' && !url.pathname.startsWith('/login')
  } catch {
    return false
  }
}

function getCompassDateParts(now: Date): { day: number; month: number; year: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  }
}

function buildCompassBeginDate(
  days: number,
  now: Date,
): {
  timestamp: number
  formatted: string
} {
  const current = getCompassDateParts(now)
  const startDate = new Date(Date.UTC(current.year, current.month - 1, current.day - days + 1))
  const year = startDate.getUTCFullYear()
  const month = String(startDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(startDate.getUTCDate()).padStart(2, '0')
  const timestamp = startDate.getTime() / 1000 - COMPASS_TIME_ZONE_OFFSET_HOURS * 60 * 60
  return {
    timestamp,
    formatted: `${year}-${month}-${day}T00:00:00+08:00`,
  }
}

export function buildHistoryLiveParams(
  params: LiveSessionListParams,
  now: Date = new Date(),
): HistoryLiveApiParams {
  const requestedDateType = params.dateType ?? 30
  const range =
    DATE_RANGE_CONFIG[requestedDateType as keyof typeof DATE_RANGE_CONFIG] ?? DATE_RANGE_CONFIG[30]
  const beginDate = buildCompassBeginDate(range.days, now)
  const result: HistoryLiveApiParams = {
    page_no: params.page ?? 1,
    page_size: params.pageSize ?? 10,
    date_type: range.apiDateType,
    begin_date: beginDate.timestamp,
    begin_date_format: beginDate.formatted,
    index_selected: HISTORY_LIVE_INDEX_SELECTED,
    filter_type: 0,
    is_asc: params.isAsc ?? false,
  }
  if (params.sortField) result.sort_field = params.sortField
  if (params.query?.trim()) result.query_condition = params.query.trim()
  return result
}

export class BuyinLiveDetailsSource {
  private compassPage: Page | null = null
  private readonly listCache = new LiveDetailsCache<LiveSessionPage>(CACHE_TTL)
  private readonly detailCache = new LiveDetailsCache<LiveSessionDetail>(CACHE_TTL)

  constructor(private readonly mainPage: Page) {}

  async list(params: LiveSessionListParams = {}): Promise<LiveSessionPage> {
    const apiParams = buildHistoryLiveParams(params)
    const cacheKey = JSON.stringify(apiParams)
    if (!params.forceRefresh) {
      const cached = this.listCache.get(cacheKey)
      if (cached) return cached
    }

    const response = await this.fetchJson(HISTORY_LIVE_API, apiParams)
    const page = parseLiveSessionPage(response)
    this.listCache.set(cacheKey, page)
    return page
  }

  async detail(params: LiveSessionDetailParams): Promise<LiveSessionDetail> {
    const productPage = params.productPage ?? 1
    const productPageSize = params.productPageSize ?? 20
    const cacheKey = JSON.stringify({
      sessionId: params.sessionId,
      productPage,
      productPageSize,
    })
    if (!params.forceRefresh) {
      const cached = this.detailCache.get(cacheKey)
      if (cached) return cached
    }

    const commonParams = { live_room_id: params.sessionId }
    const [basic, trade, core, products] = await Promise.all([
      this.fetchJson(BASIC_INFO_API, commonParams),
      this.fetchJson(TRADE_INFO_API, commonParams),
      this.fetchJson(CORE_GROUP_INFO_API, commonParams),
      this.fetchJson(PRODUCTS_API, {
        ...commonParams,
        page_no: productPage,
        page_size: productPageSize,
        sort_field: 'pay_amt',
        is_asc: false,
      }),
    ])
    const detail = parseLiveSessionDetail(params.sessionId, { basic, trade, core, products })
    this.detailCache.set(cacheKey, detail)
    return detail
  }

  async close(): Promise<void> {
    this.listCache.clear()
    this.detailCache.clear()
    const page = this.compassPage
    this.compassPage = null
    if (page && !page.isClosed()) await page.close()
  }

  private async ensureCompassPage(): Promise<Page> {
    if (this.compassPage && !this.compassPage.isClosed()) {
      if (!isCompassPageUrl(this.compassPage.url())) {
        throw new Error('巨量百应登录状态已失效，请重新连接中控台')
      }
      return this.compassPage
    }

    const page = await this.mainPage.context().newPage()
    try {
      const officialHistoryReady = page.waitForResponse(
        response => {
          try {
            return new URL(response.url()).pathname === HISTORY_LIVE_API
          } catch {
            return false
          }
        },
        { timeout: REQUEST_TIMEOUT },
      )
      await Promise.all([
        officialHistoryReady,
        page.goto(URLS.LIVE_DETAILS_PAGE, {
          waitUntil: 'domcontentloaded',
          timeout: REQUEST_TIMEOUT,
        }),
      ])
      if (!isCompassPageUrl(page.url())) {
        throw new Error('巨量百应登录状态已失效，请重新连接中控台')
      }
      this.compassPage = page
      return page
    } catch (error) {
      const loginExpired = !isCompassPageUrl(page.url())
      if (!page.isClosed()) await page.close().catch(() => undefined)
      if (loginExpired) {
        throw new Error('巨量百应登录状态已失效，请重新连接中控台')
      }
      throw error
    }
  }

  private async fetchJson(path: string, params: Record<string, unknown>): Promise<unknown> {
    const page = await this.ensureCompassPage()
    const query = serializeRequestParams(params)
    const result = await page.evaluate(
      async ({ requestPath, requestQuery, timeout }) => {
        const controller = new AbortController()
        const timer = window.setTimeout(() => controller.abort(), timeout)
        try {
          const response = await fetch(`${requestPath}?${requestQuery}`, {
            credentials: 'include',
            signal: controller.signal,
          })
          const data = await response.json().catch(() => undefined)
          return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            data,
          }
        } finally {
          window.clearTimeout(timer)
        }
      },
      { requestPath: path, requestQuery: query, timeout: REQUEST_TIMEOUT },
    )

    const fetchResult = result as PageFetchResult
    if (!fetchResult.ok) {
      throw new Error(
        `百应直播明细请求失败（HTTP ${fetchResult.status} ${fetchResult.statusText}）`,
      )
    }
    return fetchResult.data
  }
}
