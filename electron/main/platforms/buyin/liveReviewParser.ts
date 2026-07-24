import type {
  LiveReviewAccountSection,
  LiveReviewChannelCell,
  LiveReviewChannelRow,
  LiveReviewChannelSection,
  LiveReviewComplianceSection,
  LiveReviewDateConfig,
  LiveReviewFormulaSection,
  LiveReviewMetricValue,
  LiveReviewProblemRoomInfo,
  LiveReviewProblemSection,
  LiveReviewProductItem,
  LiveReviewProductSection,
  LiveReviewTrendPoint,
} from 'shared/liveReview'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value)))
    return Number(value)
  return undefined
}

function unwrapData(response: unknown): UnknownRecord {
  const root = asRecord(response)
  const data = asRecord(root.data)
  return Object.keys(data).length > 0 ? data : root
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const rest = safeSeconds % 60
  if (hours > 0) return `${hours}小时${minutes}分${rest}秒`
  if (minutes > 0) return `${minutes}分${rest}秒`
  return `${rest}秒`
}

function formatMetric(value: number | string | null, unit: string): string {
  if (value === null || value === '' || unit === 'nan') return '--'
  if (typeof value === 'string' && !Number.isFinite(Number(value))) return value
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  if (unit === 'percent') return `${numeric.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%`
  if (unit === 'price') {
    return `¥${numeric.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  if (unit === 'duration') return formatDuration(numeric)
  return numeric.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

export function parseMetricValue(value: unknown): LiveReviewMetricValue {
  const source = asRecord(value)
  const nested = asRecord(source.value)
  const rawValue =
    Object.keys(nested).length > 0
      ? (nested.value ?? null)
      : (source.value ?? (typeof value === 'number' || typeof value === 'string' ? value : null))
  const normalizedValue =
    typeof rawValue === 'number' || typeof rawValue === 'string' ? rawValue : null
  const unit =
    asString(Object.keys(nested).length > 0 ? nested.unit : source.unit) ??
    (typeof normalizedValue === 'number' ? 'number' : 'nan')
  return {
    value: normalizedValue,
    unit,
    display: asString(source.display) ?? formatMetric(normalizedValue, unit),
  }
}

export function parseLiveReviewDateConfig(response: unknown): LiveReviewDateConfig {
  const data = unwrapData(response)
  const rawMap = asRecord(data.data_range_map)
  const rangeMap: LiveReviewDateConfig['rangeMap'] = {}
  for (const [key, rawRange] of Object.entries(rawMap)) {
    const range = asRecord(rawRange)
    rangeMap[key] = {
      minDate: asNumber(range.min_date),
      maxDate: asNumber(range.max_date),
      maxRange: asNumber(range.max_range),
    }
  }
  return {
    maxDate: asNumber(data.max_date),
    commonUseTypes: asArray(data.common_use_type).flatMap(value => {
      const item = asNumber(value)
      return item === undefined ? [] : [item]
    }),
    otherTypes: asArray(data.no_common_use_type).flatMap(value => {
      const item = asNumber(value)
      return item === undefined ? [] : [item]
    }),
    rangeMap,
    activities: asArray(data.activity_info).map((raw, index) => {
      const item = asRecord(raw)
      return {
        id: asString(item.project_id) ?? `activity-${index}`,
        name: asString(item.project_name) ?? `大促活动 ${index + 1}`,
        startTime: asNumber(item.start_date),
        endTime: asNumber(item.end_date),
      }
    }),
    benefits: asArray(data.benefits).flatMap(value => {
      const item = asNumber(value)
      return item === undefined ? [] : [item]
    }),
  }
}

export function parseLiveReviewAccount(response: unknown): LiveReviewAccountSection {
  const data = unwrapData(response)
  const info = asRecord(data.author_info)
  return {
    info: {
      imageUrl: asString(info.author_img),
      name: asString(info.author_name),
      level: asNumber(info.author_level),
      awemeId: asString(info.aweme_id),
      industryName: asString(info.industry_name),
    },
    metrics: asArray(data.index_data).map((raw, index) => {
      const metric = asRecord(raw)
      return {
        key: asString(metric.index_name) ?? `metric-${index}`,
        label: asString(metric.index_display) ?? asString(metric.index_name) ?? `指标 ${index + 1}`,
        tip: asString(metric.index_tip),
        value: parseMetricValue(metric.value),
        change:
          metric.change_value === undefined ? undefined : parseMetricValue(metric.change_value),
        extras: metric,
      }
    }),
  }
}

export function parseLiveReviewFormula(response: unknown): LiveReviewFormulaSection {
  const data = unwrapData(response)
  const tip = asRecord(data.tip_info)
  const jump = asRecord(tip.jump_info)
  return {
    cards: asArray(data.card_list).map((raw, index) => {
      const card = asRecord(raw)
      return {
        key: asString(card.index_name) ?? `formula-${index}`,
        label: asString(card.index_display) ?? asString(card.index_name) ?? `指标 ${index + 1}`,
        tip: asString(card.index_tip),
        value: parseMetricValue(card.index_value),
        change: card.change === undefined ? undefined : parseMetricValue(card.change),
        excellentCompared:
          card.excellent_compared === undefined
            ? undefined
            : parseMetricValue(card.excellent_compared),
        extras: card,
      }
    }),
    tip:
      Object.keys(tip).length > 0
        ? { content: asString(tip.content), text: asString(jump.text), url: asString(jump.url) }
        : undefined,
  }
}

function parseProblemRoom(value: unknown): LiveReviewProblemRoomInfo | undefined {
  const room = asRecord(value)
  if (Object.keys(room).length === 0) return undefined
  return {
    roomId: asString(room.room_id),
    startTime: asNumber(room.start_time) ?? asString(room.start_time),
    endTime: asNumber(room.end_time) ?? asString(room.end_time),
    problemIndex: room.problem_index,
  }
}

export function parseLiveReviewProblems(
  abnormalResponse: unknown,
  queryIndexResponse: unknown,
  trendResponse: unknown,
  requestedIndex?: string,
): LiveReviewProblemSection {
  const abnormal = unwrapData(abnormalResponse)
  const query = unwrapData(queryIndexResponse)
  const trend = unwrapData(trendResponse)
  const trendData = asRecord(trend.index_trend)
  const indexOptions = asArray(query.index_list).map((raw, index) => {
    const item = asRecord(raw)
    return {
      code: asString(item.index_code) ?? `index-${index}`,
      name:
        asString(item.display_name) ??
        asString(item.index_name) ??
        asString(item.index_code) ??
        `指标 ${index + 1}`,
    }
  })
  const selectedIndex =
    requestedIndex && indexOptions.some(item => item.code === requestedIndex)
      ? requestedIndex
      : (indexOptions[0]?.code ?? requestedIndex ?? 'watch_ucnt')
  return {
    daysCount: asNumber(abnormal.days_cnt) ?? 0,
    flowFluctuateCount: asNumber(abnormal.flow_fluctuate_cnt) ?? 0,
    flowLowCount: asNumber(abnormal.flow_low_cnt) ?? 0,
    room: parseProblemRoom(abnormal.problem_room_info),
    indexOptions,
    selectedIndex,
    units: Object.fromEntries(
      Object.entries(asRecord(trendData.unit)).map(([key, value]) => [key, asString(value) ?? '']),
    ),
    trend: asArray(trendData.trends).flatMap((raw): LiveReviewTrendPoint[] => {
      const point = asRecord(raw)
      const horizontal = asString(point.horizontal) ?? asNumber(point.horizontal)
      const vertical = asNumber(point.vertical)
      if (horizontal === undefined || vertical === undefined) return []
      return [
        {
          horizontal,
          vertical,
          pointName: asString(point.point_name),
          displayName: asString(point.display_name),
          dateTime: asNumber(point.date_time),
          problemRoom: parseProblemRoom(point.problem_room_info),
        },
      ]
    }),
  }
}

function parseChannelCell(value: unknown): LiveReviewChannelCell {
  const cell = asRecord(value)
  if (Object.keys(cell).length === 0) return { raw: value }
  return {
    value: cell.value === undefined ? undefined : parseMetricValue(cell.value),
    change: cell.change_value === undefined ? undefined : parseMetricValue(cell.change_value),
    excellent:
      cell.excellent_value === undefined ? undefined : parseMetricValue(cell.excellent_value),
    raw: value,
  }
}

function parseChannelRow(value: unknown, headers: string[], index: number): LiveReviewChannelRow {
  const row = asRecord(value)
  const source = asRecord(row.source)
  const firstCode = asString(source.first_channel_code)
  const channelCode = asString(source.channel_code)
  return {
    id: channelCode ?? firstCode ?? `channel-${index}`,
    channelName:
      asString(source.channel_display) ??
      asString(source.first_channel_name) ??
      `渠道 ${index + 1}`,
    firstChannelName: asString(source.first_channel_name),
    firstChannelCode: firstCode,
    channelCode,
    isDiagnosis: typeof row.is_diagnosis === 'boolean' ? row.is_diagnosis : undefined,
    diagnosisScene: asString(row.diagnosis_scene),
    cells: Object.fromEntries(headers.map(key => [key, parseChannelCell(row[key])])),
    children: asArray(row.children).map((child, childIndex) =>
      parseChannelRow(child, headers, childIndex),
    ),
    extras: row,
  }
}

export function parseLiveReviewChannels(response: unknown): LiveReviewChannelSection {
  const data = unwrapData(response)
  const headers = asArray(data.data_head).map((raw, index) => {
    const item = asRecord(raw)
    return {
      key: asString(item.index_name) ?? `index-${index}`,
      label: asString(item.index_display) ?? asString(item.index_name) ?? `指标 ${index + 1}`,
      sortable: item.sorted !== undefined && item.sorted !== null,
      tip: asString(item.hover_tip),
    }
  })
  const keys = headers.map(item => item.key)
  return {
    headers,
    rows: asArray(data.data_result).map((row, index) => parseChannelRow(row, keys, index)),
  }
}

function parseProductItem(value: unknown, index: number): LiveReviewProductItem {
  const item = asRecord(value)
  const knownMetricKeys = ['pay_amt', 'gpm', 'new_pay_ucnt', 'ecom_live_cnt']
  const metrics: LiveReviewProductItem['metrics'] = {}
  for (const key of knownMetricKeys) {
    if (item[key] !== undefined) metrics[key] = parseMetricValue(item[key])
  }
  return {
    id: asString(item.product_id) ?? `product-${index}`,
    name: asString(item.product_name) ?? `商品 ${index + 1}`,
    imageUrl: asString(item.product_img),
    metrics,
    extras: item,
  }
}

export function parseLiveReviewProducts(response: unknown): LiveReviewProductSection {
  const data = unwrapData(response)
  return {
    payAmount: asArray(data.pay_amt_board).map(parseProductItem),
    gpm: asArray(data.gpm_board).map(parseProductItem),
    newCustomers: asArray(data.new_pay_ucnt_board).map(parseProductItem),
  }
}

export function parseLiveReviewCompliance(response: unknown): LiveReviewComplianceSection {
  const data = unwrapData(response)
  const page = asRecord(data.page_result)
  return {
    penalizeCount:
      data.penalize_cnt === undefined ? undefined : parseMetricValue(data.penalize_cnt),
    items: asArray(data.data_result).map((raw, index) => {
      const item = asRecord(raw)
      const videoProduct = asRecord(item.video_product)
      return {
        id: asString(item.penalize_id) ?? `penalize-${index}`,
        date: asNumber(item.penalize_date),
        reason: asString(item.penalize_reason),
        videoUrl: asString(videoProduct.video_url),
        products: asArray(videoProduct.product_list).map((rawProduct, productIndex) => {
          const product = asRecord(rawProduct)
          return {
            id: asString(product.product_id) ?? `product-${productIndex}`,
            name: asString(product.product_name) ?? `商品 ${productIndex + 1}`,
            imageUrl: asString(product.product_img),
          }
        }),
      }
    }),
    total: asNumber(page.total) ?? 0,
    page: asNumber(page.page_no) ?? 1,
    pageSize: asNumber(page.page_size) ?? 10,
  }
}

export function parseLiveReviewRoiVersion(response: unknown): number | undefined {
  const data = unwrapData(response)
  return asNumber(data.roi_version) ?? asNumber(data.version) ?? asNumber(data.roi_info)
}
