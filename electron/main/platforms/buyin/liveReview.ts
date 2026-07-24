import type { Page } from 'playwright'
import {
  LIVE_REVIEW_DATE_TYPES,
  type LiveReviewDateConfig,
  type LiveReviewDateType,
  type LiveReviewOverview,
  type LiveReviewParams,
  type LiveReviewRange,
  type LiveReviewSectionError,
} from 'shared/liveReview'
import { URLS } from './constant'
import { isCompassPageUrl, LiveDetailsCache, serializeRequestParams } from './liveDetails'
import {
  parseLiveReviewAccount,
  parseLiveReviewChannels,
  parseLiveReviewCompliance,
  parseLiveReviewDateConfig,
  parseLiveReviewFormula,
  parseLiveReviewProblems,
  parseLiveReviewProducts,
  parseLiveReviewRoiVersion,
} from './liveReviewParser'

const API_PREFIX = '/compass_api/content_live/author/live_review/'
const DATE_CONFIG_API = '/compass_api/config_center/data_range_v2'
const API = {
  account: `${API_PREFIX}account_overview`,
  formula: `${API_PREFIX}formula_info`,
  abnormal: `${API_PREFIX}abnormal_overview`,
  queryIndex: `${API_PREFIX}query_index`,
  roi: `${API_PREFIX}roi_info`,
  products: `${API_PREFIX}product_board_v2`,
  trend: `${API_PREFIX}live_trend`,
  channels: `${API_PREFIX}trend_analysis_table`,
  compliance: `${API_PREFIX}compliance_detail`,
} as const

const REQUEST_TIMEOUT = 30_000
const CACHE_TTL = 30_000
const DEFAULT_CHANNEL_INDEXES = [
  'watch_cnt',
  'live_show_cnt',
  'watch_live_show_cnt_ratio',
  'pay_amt',
  'pay_cnt',
  'product_click_show_cnt_ratio',
  'product_click_pay_cnt_ratio',
].join(',')

interface PageFetchResult {
  ok: boolean
  status: number
  statusText: string
  data?: unknown
}

interface DateParts {
  year: number
  month: number
  day: number
}

export interface LiveReviewApiParams extends Record<string, unknown> {
  date_type: LiveReviewDateType
  is_activity: boolean
  begin_date?: string
  end_date?: string
  p_date?: number
  activity_id?: string
}

function normalizeEpochSeconds(value?: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  return value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value)
}

function shanghaiToday(now: Date): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) }
}

function dateFromParts(parts: DateParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
}

function partsFromDate(date: Date): DateParts {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

function addDays(parts: DateParts, days: number): DateParts {
  const date = dateFromParts(parts)
  date.setUTCDate(date.getUTCDate() + days)
  return partsFromDate(date)
}

function parseDateInput(value?: string): DateParts | undefined {
  if (!value) return undefined
  const match = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (!match) return undefined
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  const normalized = partsFromDate(dateFromParts(parts))
  if (
    normalized.year !== parts.year ||
    normalized.month !== parts.month ||
    normalized.day !== parts.day
  ) {
    return undefined
  }
  return parts
}

function formatDate(parts: DateParts): string {
  return `${parts.year}/${String(parts.month).padStart(2, '0')}/${String(parts.day).padStart(2, '0')} 00:00:00`
}

function toShanghaiEpoch(parts: DateParts): number {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day, -8) / 1000)
}

function partsFromEpoch(seconds: number): DateParts {
  const date = new Date(seconds * 1000 + 8 * 60 * 60 * 1000)
  return partsFromDate(date)
}

function resolveEndDate(config: LiveReviewDateConfig | undefined, now: Date): DateParts {
  const maxDate = normalizeEpochSeconds(config?.maxDate)
  return maxDate ? partsFromEpoch(maxDate) : addDays(shanghaiToday(now), -1)
}

export function buildLiveReviewApiParams(
  params: LiveReviewParams = {},
  dateConfig?: LiveReviewDateConfig,
  now: Date = new Date(),
): { apiParams: LiveReviewApiParams; range: LiveReviewRange } {
  const dateType = params.dateType ?? LIVE_REVIEW_DATE_TYPES.sevenDays
  const endLimit = resolveEndDate(dateConfig, now)

  if (dateType === LIVE_REVIEW_DATE_TYPES.promotion) {
    const activity = dateConfig?.activities.find(item => item.id === String(params.activityId))
    const activityId = String(
      params.activityId ?? activity?.id ?? dateConfig?.activities[0]?.id ?? '',
    )
    if (!activityId) throw new Error('当前账号暂无可用的大促活动')
    return {
      apiParams: { date_type: dateType, is_activity: true, activity_id: activityId },
      range: {
        dateType,
        activityId,
        activityName:
          activity?.name ?? dateConfig?.activities.find(item => item.id === activityId)?.name,
        isActivity: true,
      },
    }
  }

  let begin: DateParts
  let end: DateParts
  if (dateType === LIVE_REVIEW_DATE_TYPES.custom) {
    const customBegin = parseDateInput(params.beginDate)
    const customEnd = parseDateInput(params.endDate)
    if (!customBegin || !customEnd) throw new Error('请选择有效的自定义开始和结束日期')
    if (dateFromParts(customBegin) > dateFromParts(customEnd)) {
      throw new Error('自定义开始日期不能晚于结束日期')
    }
    begin = customBegin
    end = customEnd
  } else if (dateType === LIVE_REVIEW_DATE_TYPES.naturalWeek) {
    const today = shanghaiToday(now)
    const weekday = dateFromParts(today).getUTCDay() || 7
    end = addDays(today, -weekday)
    begin = addDays(end, -6)
  } else if (dateType === LIVE_REVIEW_DATE_TYPES.naturalMonth) {
    const today = shanghaiToday(now)
    const firstThisMonth = { year: today.year, month: today.month, day: 1 }
    end = addDays(firstThisMonth, -1)
    begin = { year: end.year, month: end.month, day: 1 }
  } else {
    end = endLimit
    begin = addDays(end, dateType === LIVE_REVIEW_DATE_TYPES.thirtyDays ? -29 : -6)
  }

  const pDate = normalizeEpochSeconds(dateConfig?.maxDate) ?? toShanghaiEpoch(endLimit)
  return {
    apiParams: {
      date_type: dateType,
      begin_date: formatDate(begin),
      end_date: formatDate(end),
      p_date: pDate,
      is_activity: false,
    },
    range: {
      dateType,
      beginDate: formatDate(begin),
      endDate: formatDate(end),
      isActivity: false,
    },
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class BuyinLiveReviewSource {
  private compassPage: Page | null = null
  private readonly cache = new LiveDetailsCache<LiveReviewOverview>(CACHE_TTL)

  constructor(private readonly mainPage: Page) {}

  async overview(params: LiveReviewParams = {}): Promise<LiveReviewOverview> {
    const cacheKey = JSON.stringify({ ...params, forceRefresh: undefined })
    if (!params.forceRefresh) {
      const cached = this.cache.get(cacheKey)
      if (cached) return cached
    }

    const errors: LiveReviewSectionError[] = []
    let dateConfig: LiveReviewDateConfig | undefined
    try {
      dateConfig = parseLiveReviewDateConfig(
        await this.fetchJson(DATE_CONFIG_API, {
          data_type: 'author_live_review',
          path: '/talent/live-overview',
        }),
      )
    } catch (error) {
      errors.push({ section: 'dateConfig', message: errorMessage(error) })
    }

    const { apiParams, range } = buildLiveReviewApiParams(params, dateConfig)
    const requests = {
      account: this.fetchJson(API.account, apiParams),
      formula: this.fetchJson(API.formula, apiParams),
      abnormal: this.fetchJson(API.abnormal, apiParams),
      queryIndex: this.fetchJson(API.queryIndex, apiParams),
      roi: this.fetchJson(API.roi, apiParams),
      products: this.fetchJson(API.products, apiParams),
      channels: this.fetchJson(API.channels, {
        ...apiParams,
        index_selected: DEFAULT_CHANNEL_INDEXES,
        sort_field: '',
        is_asc: false,
      }),
      compliance: this.fetchJson(API.compliance, { ...apiParams, page_no: 1, page_size: 10 }),
    }
    const keys = Object.keys(requests) as Array<keyof typeof requests>
    const settled = await Promise.allSettled(keys.map(key => requests[key]))
    const values: Partial<Record<keyof typeof requests, unknown>> = {}
    settled.forEach((result, index) => {
      const key = keys[index]
      if (result.status === 'fulfilled') values[key] = result.value
      else errors.push({ section: key, message: errorMessage(result.reason) })
    })

    let requestedTrendIndex = params.trendIndexCode
    if (values.queryIndex) {
      const queryPreview = parseLiveReviewProblems({}, values.queryIndex, {}, requestedTrendIndex)
      requestedTrendIndex = queryPreview.selectedIndex
    }

    let trendResponse: unknown = {}
    try {
      trendResponse = await this.fetchJson(API.trend, {
        ...apiParams,
        index_code: requestedTrendIndex ?? 'watch_ucnt',
      })
    } catch (error) {
      errors.push({ section: 'trend', message: errorMessage(error) })
    }

    const overview: LiveReviewOverview = {
      range,
      dateConfig,
      account: values.account ? parseLiveReviewAccount(values.account) : undefined,
      formula: values.formula ? parseLiveReviewFormula(values.formula) : undefined,
      problems:
        values.abnormal || values.queryIndex
          ? parseLiveReviewProblems(
              values.abnormal ?? {},
              values.queryIndex ?? {},
              trendResponse,
              requestedTrendIndex,
            )
          : undefined,
      channels: values.channels ? parseLiveReviewChannels(values.channels) : undefined,
      products: values.products ? parseLiveReviewProducts(values.products) : undefined,
      compliance: values.compliance ? parseLiveReviewCompliance(values.compliance) : undefined,
      roiVersion: values.roi ? parseLiveReviewRoiVersion(values.roi) : undefined,
      errors,
      fetchedAt: new Date().toISOString(),
    }
    this.cache.set(cacheKey, overview)
    return overview
  }

  async close(): Promise<void> {
    this.cache.clear()
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
      const officialRequestReady = page.waitForResponse(
        response => {
          try {
            return new URL(response.url()).pathname === API.account
          } catch {
            return false
          }
        },
        { timeout: REQUEST_TIMEOUT },
      )
      await Promise.all([
        officialRequestReady,
        page.goto(URLS.LIVE_REVIEW_PAGE, {
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
      if (loginExpired) throw new Error('巨量百应登录状态已失效，请重新连接中控台')
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
        `百应直播复盘请求失败（HTTP ${fetchResult.status} ${fetchResult.statusText}）`,
      )
    }
    const envelope =
      fetchResult.data && typeof fetchResult.data === 'object'
        ? (fetchResult.data as Record<string, unknown>)
        : undefined
    const code = typeof envelope?.code === 'number' ? envelope.code : 0
    if (code !== 0) {
      const message =
        typeof envelope?.message === 'string'
          ? envelope.message
          : typeof envelope?.msg === 'string'
            ? envelope.msg
            : `接口返回错误码 ${code}`
      throw new Error(message)
    }
    return fetchResult.data
  }
}
