import type {
  LiveMetric,
  LiveMetricGroup,
  LiveMetricValue,
  LiveProductMetric,
  LiveSessionDetail,
  LiveSessionPage,
  LiveSessionSummary,
} from 'shared/liveDetails'

type UnknownRecord = Record<string, unknown>

const LIST_RESERVED_KEYS = new Set(['operation'])
const BASIC_RESERVED_KEYS = new Set([
  'live_room_id',
  'live_id',
  'live_room_title',
  'live_room',
  'title',
  'name',
  'cover_img_uri',
  'cover_url',
  'start_time',
  'live_duration',
])
const PRODUCT_RESERVED_KEYS = new Set([
  'product_id',
  'id',
  'product_name',
  'title',
  'name',
  'product_img',
  'product_image',
  'image_url',
  'products_card',
])

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown, description: string): UnknownRecord {
  if (!isRecord(value)) {
    throw new Error(`百应直播明细响应结构已变化：缺少${description}`)
  }
  return value
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  return undefined
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function asMetricValue(value: unknown): LiveMetricValue | undefined {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
    return value as LiveMetricValue
  }
  if (isRecord(value)) {
    for (const key of ['value', 'format_value', 'display_value']) {
      const nested = value[key]
      if (nested === null || ['string', 'number', 'boolean'].includes(typeof nested)) {
        return nested as LiveMetricValue
      }
    }
  }
  return undefined
}

function asDisplayString(value: unknown): string | undefined {
  const metricValue = asMetricValue(value)
  if (metricValue === undefined || metricValue === null) return undefined
  return String(metricValue)
}

function collectScalarMetrics(
  source: UnknownRecord,
  excludedKeys: Set<string> = new Set(),
): Record<string, LiveMetricValue> {
  const metrics: Record<string, LiveMetricValue> = {}
  for (const [key, rawValue] of Object.entries(source)) {
    if (excludedKeys.has(key)) continue
    const value = asMetricValue(rawValue)
    if (value !== undefined) metrics[key] = value
  }
  return metrics
}

function getSafeBusinessErrorMessage(response: UnknownRecord): string | undefined {
  for (const key of ['msg', 'message', 'status_message']) {
    const message = asString(response[key])?.replace(/\s+/g, ' ').trim()
    if (message) return message.slice(0, 160)
  }
  return undefined
}

function assertSuccess(response: UnknownRecord, description: string): UnknownRecord {
  const status = response.st
  if (typeof status === 'number' && status !== 0) {
    const message = getSafeBusinessErrorMessage(response)
    const suffix = message ? `（${message}）` : ''
    throw new Error(`百应${description}接口返回失败状态：${status}${suffix}`)
  }
  return asRecord(response.data, `${description}.data`)
}

function metricFromItem(value: unknown, fallbackKey: string): LiveMetric | null {
  if (!isRecord(value)) return null
  const key = asString(value.index_name ?? value.key ?? value.name) ?? fallbackKey
  const label =
    asString(value.index_display ?? value.display_name ?? value.label ?? value.title) ?? key
  const metricValue = asMetricValue(value.value ?? value.index_value ?? value.display_value)
  if (metricValue === undefined) return null
  return { key, label, value: metricValue }
}

function metricsFromUnknown(value: unknown): LiveMetric[] {
  if (Array.isArray(value)) {
    return value
      .map((item, index) => metricFromItem(item, `metric_${index}`))
      .filter((item): item is LiveMetric => item !== null)
  }
  if (!isRecord(value)) return []
  return Object.entries(collectScalarMetrics(value)).map(([key, metricValue]) => ({
    key,
    label: key,
    value: metricValue,
  }))
}

export function parseLiveSessionPage(response: unknown): LiveSessionPage {
  const root = asRecord(response, '列表响应')
  const data = assertSuccess(root, '历史直播列表')
  const rows = asArray(data.data_result)
  const pageResult = isRecord(data.page_result) ? data.page_result : {}

  const items = rows.flatMap<LiveSessionSummary>(rawRow => {
    if (!isRecord(rawRow)) return []
    const operation = isRecord(rawRow.operation) ? rawRow.operation : {}
    const liveTime = isRecord(rawRow.start_time) ? rawRow.start_time : {}
    const id = asString(operation.live_id ?? rawRow.live_room_id ?? rawRow.live_id)
    if (!id) return []

    return [
      {
        id,
        liveAppId: asString(operation.live_app_id ?? rawRow.live_app_id),
        title:
          asString(rawRow.live_room ?? rawRow.live_room_title ?? rawRow.title) ?? '未命名直播间',
        coverUrl: asString(rawRow.cover_img_uri ?? rawRow.cover_url),
        startTime: asDisplayString(liveTime.start_time ?? rawRow.start_time),
        duration: asDisplayString(liveTime.live_duration ?? rawRow.live_duration),
        viewerCount: asMetricValue(rawRow.watch_ucnt),
        avgWatchDuration: asMetricValue(rawRow.avg_watch_duration),
        avgOnlineCount: asMetricValue(rawRow.acu),
        productClickRate: asMetricValue(rawRow.product_click_rate),
        orderCount: asMetricValue(rawRow.pay_order_cnt),
        gmv: asMetricValue(rawRow.pay_gmv),
        hourlyGmv: asMetricValue(rawRow.avg_hour_pay_amt),
        estimatedCommission: asMetricValue(rawRow.predict_commission),
        metrics: collectScalarMetrics(rawRow, LIST_RESERVED_KEYS),
      },
    ]
  })

  return {
    items,
    total: asNumber(pageResult.total, items.length),
    page: asNumber(pageResult.page_no, 1),
    pageSize: asNumber(pageResult.page_size, Math.max(items.length, 1)),
  }
}

export function parseLiveSessionDetail(sessionId: string, response: unknown): LiveSessionDetail {
  const root = asRecord(response, '详情聚合响应')
  const basicData = assertSuccess(asRecord(root.basic, 'basic'), '直播基础信息')
  const tradeData = assertSuccess(asRecord(root.trade, 'trade'), '直播交易信息')
  const coreData = assertSuccess(asRecord(root.core, 'core'), '直播核心指标')
  const productsData = assertSuccess(asRecord(root.products, 'products'), '直播商品信息')

  const basicInfo = asRecord(basicData.live_room_base_info ?? basicData, 'live_room_base_info')
  const tradeMetrics = metricsFromUnknown(tradeData.trade_list ?? tradeData)
  const metricGroups: LiveMetricGroup[] = []
  if (tradeMetrics.length > 0) {
    metricGroups.push({ key: 'trade', title: '交易数据', metrics: tradeMetrics })
  }

  const coreGroups = asArray(coreData.index_group ?? coreData.index_groups)
  coreGroups.forEach((rawGroup, groupIndex) => {
    if (!isRecord(rawGroup)) return
    const key = asString(rawGroup.group_name ?? rawGroup.key) ?? `core_${groupIndex}`
    const title =
      asString(rawGroup.group_display ?? rawGroup.group_name ?? rawGroup.title) ?? '核心指标'
    const metrics = metricsFromUnknown(
      rawGroup.index_list ?? rawGroup.list ?? rawGroup.metrics ?? rawGroup.indexes,
    )
    if (metrics.length > 0) metricGroups.push({ key, title, metrics })
  })

  const products = asArray(productsData.products_detail).flatMap<LiveProductMetric>(
    (rawProduct, index) => {
      if (!isRecord(rawProduct)) return []
      const id = asString(rawProduct.product_id ?? rawProduct.id) ?? `product_${index}`
      const metrics = collectScalarMetrics(rawProduct, PRODUCT_RESERVED_KEYS)
      const metricLabels: Record<string, string> = {}
      for (const [metricIndex, rawMetric] of asArray(rawProduct.products_card).entries()) {
        const metric = metricFromItem(rawMetric, `product_metric_${metricIndex}`)
        if (!metric) continue
        metrics[metric.key] = metric.value
        metricLabels[metric.key] = metric.label
      }
      return [
        {
          id,
          title:
            asString(rawProduct.product_name ?? rawProduct.title ?? rawProduct.name) ??
            '未命名商品',
          imageUrl: asString(
            rawProduct.product_img ?? rawProduct.product_image ?? rawProduct.image_url,
          ),
          metrics,
          metricLabels,
        },
      ]
    },
  )
  const productPageResult = isRecord(productsData.page_result) ? productsData.page_result : {}

  return {
    sessionId,
    title:
      asString(
        basicInfo.live_room_title ?? basicInfo.live_room ?? basicInfo.title ?? basicInfo.name,
      ) ?? '未命名直播间',
    coverUrl: asString(basicInfo.cover_img_uri ?? basicInfo.cover_url),
    startTime: asString(basicInfo.start_time),
    duration: asString(basicInfo.live_duration),
    baseMetrics: collectScalarMetrics(basicInfo, BASIC_RESERVED_KEYS),
    metricGroups,
    products,
    productTotal: asNumber(productPageResult.total, products.length),
  }
}
