export const LIVE_REVIEW_DATE_TYPES = {
  sevenDays: 21,
  thirtyDays: 23,
  naturalWeek: 3,
  naturalMonth: 4,
  promotion: 100,
  custom: 999,
} as const

export type LiveReviewDateType =
  (typeof LIVE_REVIEW_DATE_TYPES)[keyof typeof LIVE_REVIEW_DATE_TYPES]

export interface LiveReviewParams {
  dateType?: LiveReviewDateType
  beginDate?: string
  endDate?: string
  activityId?: string | number
  trendIndexCode?: string
  forceRefresh?: boolean
}

export interface LiveReviewMetricValue {
  value: number | string | null
  unit: string
  display: string
}

export interface LiveReviewActivity {
  id: string
  name: string
  startTime?: number
  endTime?: number
}

export interface LiveReviewDateConfig {
  maxDate?: number
  commonUseTypes: number[]
  otherTypes: number[]
  rangeMap: Record<string, { minDate?: number; maxDate?: number; maxRange?: number }>
  activities: LiveReviewActivity[]
  benefits: number[]
}

export interface LiveReviewRange {
  dateType: LiveReviewDateType
  beginDate?: string
  endDate?: string
  activityId?: string
  activityName?: string
  isActivity: boolean
}

export interface LiveReviewAccountInfo {
  imageUrl?: string
  name?: string
  level?: number
  awemeId?: string
  industryName?: string
}

export interface LiveReviewIndexMetric {
  key: string
  label: string
  tip?: string
  value: LiveReviewMetricValue
  change?: LiveReviewMetricValue
  excellentCompared?: LiveReviewMetricValue
  extras?: Record<string, unknown>
}

export interface LiveReviewAccountSection {
  info: LiveReviewAccountInfo
  metrics: LiveReviewIndexMetric[]
}

export interface LiveReviewFormulaSection {
  cards: LiveReviewIndexMetric[]
  tip?: { content?: string; text?: string; url?: string }
}

export interface LiveReviewProblemRoomInfo {
  roomId?: string
  startTime?: number | string
  endTime?: number | string
  problemIndex?: unknown
}

export interface LiveReviewTrendPoint {
  horizontal: string | number
  vertical: number
  pointName?: string
  displayName?: string
  dateTime?: number
  problemRoom?: LiveReviewProblemRoomInfo
}

export interface LiveReviewProblemSection {
  daysCount: number
  flowFluctuateCount: number
  flowLowCount: number
  room?: LiveReviewProblemRoomInfo
  indexOptions: Array<{ code: string; name: string }>
  selectedIndex: string
  units: Record<string, string>
  trend: LiveReviewTrendPoint[]
}

export interface LiveReviewChannelHeader {
  key: string
  label: string
  sortable: boolean
  tip?: string
}

export interface LiveReviewChannelCell {
  value?: LiveReviewMetricValue
  change?: LiveReviewMetricValue
  excellent?: LiveReviewMetricValue
  raw?: unknown
}

export interface LiveReviewChannelRow {
  id: string
  channelName: string
  firstChannelName?: string
  firstChannelCode?: string
  channelCode?: string
  isDiagnosis?: boolean
  diagnosisScene?: string
  cells: Record<string, LiveReviewChannelCell>
  children: LiveReviewChannelRow[]
  extras?: Record<string, unknown>
}

export interface LiveReviewChannelSection {
  headers: LiveReviewChannelHeader[]
  rows: LiveReviewChannelRow[]
}

export interface LiveReviewProductItem {
  id: string
  name: string
  imageUrl?: string
  metrics: Record<string, LiveReviewMetricValue>
  extras?: Record<string, unknown>
}

export interface LiveReviewProductSection {
  payAmount: LiveReviewProductItem[]
  gpm: LiveReviewProductItem[]
  newCustomers: LiveReviewProductItem[]
}

export interface LiveReviewComplianceItem {
  id: string
  date?: number
  reason?: string
  videoUrl?: string
  products: Array<{ id: string; name: string; imageUrl?: string }>
}

export interface LiveReviewComplianceSection {
  penalizeCount?: LiveReviewMetricValue
  items: LiveReviewComplianceItem[]
  total: number
  page: number
  pageSize: number
}

export interface LiveReviewSectionError {
  section: string
  message: string
}

export interface LiveReviewOverview {
  range: LiveReviewRange
  dateConfig?: LiveReviewDateConfig
  account?: LiveReviewAccountSection
  formula?: LiveReviewFormulaSection
  problems?: LiveReviewProblemSection
  channels?: LiveReviewChannelSection
  products?: LiveReviewProductSection
  compliance?: LiveReviewComplianceSection
  roiVersion?: number
  errors: LiveReviewSectionError[]
  fetchedAt: string
}

export type LiveReviewErrorCode =
  | 'NOT_CONNECTED'
  | 'NOT_SUPPORTED'
  | 'LOGIN_EXPIRED'
  | 'FORBIDDEN'
  | 'TIMEOUT'
  | 'SCHEMA_CHANGED'
  | 'UNKNOWN'

export type LiveReviewResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: LiveReviewErrorCode; message: string }

export function getLiveReviewTransportErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return '获取直播复盘失败，请稍后重试'
}
