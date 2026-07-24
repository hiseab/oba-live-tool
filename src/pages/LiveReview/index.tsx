import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  RadioTower,
  RefreshCw,
  TrendingUp,
} from 'lucide-react'
import {
  LIVE_REVIEW_DATE_TYPES,
  type LiveReviewMetricValue,
  type LiveReviewTrendPoint,
} from 'shared/liveReview'
import { Button } from '@/components/ui/button'
import { useLiveReview } from '@/hooks/useLiveReview'
import { cn } from '@/lib/utils'

const DATE_OPTIONS = [
  { label: '近7天', value: LIVE_REVIEW_DATE_TYPES.sevenDays },
  { label: '近30天', value: LIVE_REVIEW_DATE_TYPES.thirtyDays },
  { label: '自然周', value: LIVE_REVIEW_DATE_TYPES.naturalWeek },
  { label: '自然月', value: LIVE_REVIEW_DATE_TYPES.naturalMonth },
  { label: '大促', value: LIVE_REVIEW_DATE_TYPES.promotion },
  { label: '自定义', value: LIVE_REVIEW_DATE_TYPES.custom },
] as const

function MetricValue({ metric }: { metric?: LiveReviewMetricValue }) {
  return <>{metric?.display ?? '--'}</>
}

function ChangeValue({ metric, prefix }: { metric?: LiveReviewMetricValue; prefix: string }) {
  if (!metric || metric.value === null)
    return <span className="text-muted-foreground">{prefix} --</span>
  const numeric = Number(metric.value)
  const positive = Number.isFinite(numeric) && numeric > 0
  const negative = Number.isFinite(numeric) && numeric < 0
  return (
    <span className={cn(positive && 'text-red-500', negative && 'text-emerald-600')}>
      {prefix} {positive ? '+' : ''}
      {metric.display}
    </span>
  )
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border bg-card px-6 text-center">
      <RadioTower className="mb-4 h-12 w-12 text-muted-foreground/50" />
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">{detail}</p>
    </div>
  )
}

function TrendChart({ points }: { points: LiveReviewTrendPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        暂无趋势数据
      </div>
    )
  }
  const width = 900
  const height = 260
  const padding = { top: 20, right: 24, bottom: 42, left: 58 }
  const values = points.map(point => point.vertical)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const x = (index: number) =>
    padding.left + (index / Math.max(1, points.length - 1)) * (width - padding.left - padding.right)
  const y = (value: number) =>
    padding.top + ((max - value) / range) * (height - padding.top - padding.bottom)
  const polyline = points.map((point, index) => `${x(index)},${y(point.vertical)}`).join(' ')
  const labelStep = Math.max(1, Math.ceil(points.length / 7))

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-64 min-w-[720px] w-full"
        role="img"
        aria-label="直播指标趋势图"
      >
        <title>直播指标趋势图</title>
        {[0, 1, 2, 3, 4].map(index => {
          const lineY = padding.top + (index / 4) * (height - padding.top - padding.bottom)
          const labelValue = max - (index / 4) * range
          return (
            <g key={index}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={lineY}
                y2={lineY}
                stroke="currentColor"
                className="text-border"
              />
              <text
                x={padding.left - 10}
                y={lineY + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[11px]"
              >
                {labelValue.toLocaleString('zh-CN', { maximumFractionDigits: 1 })}
              </text>
            </g>
          )
        })}
        <polyline fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" points={polyline} />
        {points.map((point, index) => (
          <g
            key={`${point.horizontal}-${point.vertical}-${point.dateTime ?? point.pointName ?? 'point'}`}
          >
            <circle cx={x(index)} cy={y(point.vertical)} r="3.5" fill="hsl(var(--primary))">
              <title>{`${point.horizontal}: ${point.vertical}`}</title>
            </circle>
            {index % labelStep === 0 && (
              <text
                x={x(index)}
                y={height - 16}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {String(point.horizontal).slice(0, 10)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

function ProductBoard({
  title,
  subtitle,
  items,
  metricKey,
}: {
  title: string
  subtitle: string
  items: Array<{
    id: string
    name: string
    imageUrl?: string
    metrics: Record<string, LiveReviewMetricValue>
  }>
  metricKey: string
}) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="mb-4">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="space-y-3">
        {items.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">暂无商品数据</p>
        )}
        {items.slice(0, 5).map((item, index) => (
          <div key={item.id} className="flex items-center gap-3 rounded-lg border p-3">
            <span className="w-5 shrink-0 text-center text-sm font-semibold text-primary">
              {index + 1}
            </span>
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt=""
                className="h-11 w-11 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="h-11 w-11 shrink-0 rounded-md bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={item.name}>
                {item.name}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                <MetricValue metric={item.metrics[metricKey]} />
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function LiveReview() {
  const review = useLiveReview()
  const data = review.data

  if (!review.supported) {
    return (
      <EmptyState
        title="当前平台暂不支持直播复盘"
        detail="直播复盘目前仅支持已连接的巨量百应账号。"
      />
    )
  }
  if (!review.connected) {
    return (
      <EmptyState
        title="请先连接巨量百应中控台"
        detail="连接后会复用项目保存的账号登录态，在后台读取抖音电商罗盘直播复盘数据。"
      />
    )
  }

  const dateRangeText = data?.range.isActivity
    ? (data.range.activityName ?? '大促活动')
    : [data?.range.beginDate, data?.range.endDate].filter(Boolean).join(' - ')

  return (
    <main className="min-w-0 flex-1 space-y-5 overflow-y-auto bg-muted/30 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">直播复盘</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            完整查看账号直播表现、问题场次、流量渠道与热卖商品
          </p>
        </div>
        <Button
          variant="outline"
          disabled={review.loading}
          onClick={() => void review.load({ forceRefresh: true })}
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', review.loading && 'animate-spin')} />
          刷新数据
        </Button>
      </header>

      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays className="mr-1 h-4 w-4 text-muted-foreground" />
          {DATE_OPTIONS.map(option => (
            <button
              type="button"
              key={option.value}
              onClick={() => review.selectDateType(option.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                review.dateType === option.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
          {review.dateType === LIVE_REVIEW_DATE_TYPES.custom && (
            <>
              <input
                type="date"
                value={review.beginDate}
                onChange={event => review.setBeginDate(event.target.value)}
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
              />
              <span className="text-muted-foreground">至</span>
              <input
                type="date"
                value={review.endDate}
                onChange={event => review.setEndDate(event.target.value)}
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
              />
              <Button size="sm" onClick={() => void review.load()}>
                查询
              </Button>
            </>
          )}
          {review.dateType === LIVE_REVIEW_DATE_TYPES.promotion && (
            <select
              value={review.activityId}
              onChange={event => {
                review.setActivityId(event.target.value)
                void review.load({ activityId: event.target.value })
              }}
              className="min-w-48 rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              <option value="">选择大促活动</option>
              {data?.dateConfig?.activities.map(activity => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
            </select>
          )}
          {dateRangeText && (
            <span className="ml-auto text-xs text-muted-foreground">数据区间：{dateRangeText}</span>
          )}
        </div>
      </section>

      {review.error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">获取直播复盘失败</p>
            <p className="mt-1">{review.error.message}</p>
          </div>
        </div>
      )}

      {review.loading && !data && (
        <div className="flex h-80 items-center justify-center rounded-xl border bg-card text-muted-foreground">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> 正在通过项目账号会话读取罗盘数据…
        </div>
      )}

      {data && (
        <>
          {data.errors.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium text-amber-700">
                <AlertCircle className="h-4 w-4" />
                部分数据暂时未能获取
              </div>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                {data.errors.map(item => (
                  <li key={`${item.section}-${item.message}`}>
                    {item.section}：{item.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <section className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-center gap-4 border-b pb-5">
              {data.account?.info.imageUrl ? (
                <img
                  src={data.account.info.imageUrl}
                  alt=""
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-muted" />
              )}
              <div>
                <h2 className="text-lg font-semibold">{data.account?.info.name ?? '达人账号'}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  抖音号：{data.account?.info.awemeId ?? '--'} · 等级：
                  {data.account?.info.level ?? '--'} ·{' '}
                  {data.account?.info.industryName ?? '行业未知'}
                </p>
              </div>
              <span className="ml-auto text-xs text-muted-foreground">
                更新于 {new Date(data.fetchedAt).toLocaleString('zh-CN')}
              </span>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {data.account?.metrics.map(metric => (
                <div key={metric.key} className="rounded-lg bg-muted/50 p-4">
                  <p className="text-sm text-muted-foreground" title={metric.tip}>
                    {metric.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold">
                    <MetricValue metric={metric.value} />
                  </p>
                  <p className="mt-2 text-xs">
                    <ChangeValue metric={metric.change} prefix="较上周期" />
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">核心经营指标</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.formula?.cards.map(card => (
                <div key={card.key} className="rounded-xl border bg-card p-5">
                  <p className="text-sm text-muted-foreground" title={card.tip}>
                    {card.label}
                  </p>
                  <p className="mt-3 text-2xl font-semibold">
                    <MetricValue metric={card.value} />
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <ChangeValue metric={card.change} prefix="较上周期" />
                    <ChangeValue metric={card.excellentCompared} prefix="较同行优秀值" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">问题场次概览及趋势</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  问题天数 {data.problems?.daysCount ?? 0} · 流量波动{' '}
                  {data.problems?.flowFluctuateCount ?? 0} · 流量偏低{' '}
                  {data.problems?.flowLowCount ?? 0}
                </p>
              </div>
              <select
                value={review.trendIndexCode || data.problems?.selectedIndex || ''}
                onChange={event => review.selectTrendIndex(event.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              >
                {data.problems?.indexOptions.map(option => (
                  <option key={option.code} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-5">
              <TrendChart points={data.problems?.trend ?? []} />
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">渠道分析</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                展示曝光、观看、成交与商品转化等渠道指标
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="sticky left-0 bg-muted px-3 py-3 text-left">流量渠道</th>
                    {data.channels?.headers.map(header => (
                      <th
                        key={header.key}
                        className="whitespace-nowrap px-3 py-3 text-right"
                        title={header.tip}
                      >
                        {header.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.channels?.rows.map(row => (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="sticky left-0 bg-card px-3 py-3 font-medium">
                        {row.channelName}
                      </td>
                      {data.channels?.headers.map(header => (
                        <td key={header.key} className="whitespace-nowrap px-3 py-3 text-right">
                          <MetricValue metric={row.cells[header.key]?.value} />
                          {row.cells[header.key]?.change && (
                            <div className="mt-1 text-[11px]">
                              <ChangeValue metric={row.cells[header.key]?.change} prefix="环比" />
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!data.channels?.rows.length && (
                    <tr>
                      <td
                        colSpan={(data.channels?.headers.length ?? 0) + 1}
                        className="py-12 text-center text-muted-foreground"
                      >
                        暂无渠道数据
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">热卖商品榜 Top 5</h2>
            <div className="grid gap-4 xl:grid-cols-3">
              <ProductBoard
                title="成交高"
                subtitle="按成交金额排序"
                items={data.products?.payAmount ?? []}
                metricKey="pay_amt"
              />
              <ProductBoard
                title="转化多"
                subtitle="按千次观看成交金额排序"
                items={data.products?.gpm ?? []}
                metricKey="gpm"
              />
              <ProductBoard
                title="新客多"
                subtitle="按新成交客户数排序"
                items={data.products?.newCustomers ?? []}
                metricKey="new_pay_ucnt"
              />
            </div>
          </section>

          {data.compliance && (data.compliance.total > 0 || data.compliance.penalizeCount) && (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="text-lg font-semibold">合规处置明细</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                处置次数：
                <MetricValue metric={data.compliance.penalizeCount} />
              </p>
              <div className="mt-4 space-y-3">
                {data.compliance.items.map(item => (
                  <div key={item.id} className="rounded-lg border p-3">
                    <p className="text-sm font-medium">{item.reason ?? '平台处置'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.date ? new Date(item.date * 1000).toLocaleString('zh-CN') : '--'}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}
