export type LiveMetricValue = string | number | boolean | null

export interface LiveMetric {
  key: string
  label: string
  value: LiveMetricValue
}

export interface LiveMetricGroup {
  key: string
  title: string
  metrics: LiveMetric[]
}

export interface LiveProductMetric {
  id: string
  title: string
  imageUrl?: string
  metrics: Record<string, LiveMetricValue>
  metricLabels: Record<string, string>
}

export interface LiveSessionSummary {
  id: string
  liveAppId?: string
  title: string
  coverUrl?: string
  startTime?: string
  duration?: string
  viewerCount?: LiveMetricValue
  avgWatchDuration?: LiveMetricValue
  avgOnlineCount?: LiveMetricValue
  productClickRate?: LiveMetricValue
  orderCount?: LiveMetricValue
  gmv?: LiveMetricValue
  hourlyGmv?: LiveMetricValue
  estimatedCommission?: LiveMetricValue
  metrics: Record<string, LiveMetricValue>
}

export interface LiveSessionPage {
  items: LiveSessionSummary[]
  total: number
  page: number
  pageSize: number
}

export interface LiveSessionDetail {
  sessionId: string
  title: string
  coverUrl?: string
  startTime?: string
  duration?: string
  baseMetrics: Record<string, LiveMetricValue>
  metricGroups: LiveMetricGroup[]
  products: LiveProductMetric[]
  productTotal: number
}

export interface LiveSessionListParams {
  page?: number
  pageSize?: number
  dateType?: number
  query?: string
  sortField?: string
  isAsc?: boolean
  forceRefresh?: boolean
}

export interface LiveSessionDetailParams {
  sessionId: string
  productPage?: number
  productPageSize?: number
  forceRefresh?: boolean
}

export type LiveDetailsErrorCode =
  | 'NOT_CONNECTED'
  | 'NOT_SUPPORTED'
  | 'LOGIN_EXPIRED'
  | 'FORBIDDEN'
  | 'TIMEOUT'
  | 'NOT_FOUND'
  | 'SCHEMA_CHANGED'
  | 'UNKNOWN'

export type LiveDetailsResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: LiveDetailsErrorCode; message: string }

export function getLiveDetailsTransportErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return '获取直播明细失败，请稍后重试'
}
