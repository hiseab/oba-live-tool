import type { LiveSessionDetail } from 'shared/liveDetails'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import MetricGroup, { formatMetricValue } from './MetricGroup'

const SKELETON_CARDS = ['card-1', 'card-2', 'card-3', 'card-4', 'card-5']

const METRIC_LABELS: Record<string, string> = {
  anchor_name: '主播名称',
  pay_amt: '成交金额',
  pay_gmv: '成交金额',
  pay_order_cnt: '成交订单数',
  product_show_ucnt: '商品曝光人数',
  product_click_ucnt: '商品点击人数',
  create_order_cnt: '创建订单数',
  refund_amt: '退款金额',
}

interface Props {
  detail: LiveSessionDetail | null
  loading: boolean
  error?: string
}

export default function LiveSessionDetailPanel({ detail, loading, error }: Props) {
  if (loading && !detail) {
    return (
      <Card className="min-h-[520px]">
        <CardHeader>
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent className="space-y-4">
          {SKELETON_CARDS.map(card => (
            <Skeleton key={card} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="min-h-[320px]">
        <CardContent className="flex min-h-[320px] items-center justify-center p-8 text-center text-sm text-destructive">
          {error}
        </CardContent>
      </Card>
    )
  }

  if (!detail) {
    return (
      <Card className="min-h-[320px]">
        <CardContent className="flex min-h-[320px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
          选择左侧直播场次后查看单场指标
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="min-h-[520px] xl:sticky xl:top-0 xl:max-h-[calc(100vh-4rem)]">
      <ScrollArea className="xl:h-[calc(100vh-4rem)]">
        <CardHeader>
          <div className="flex items-start gap-3">
            {detail.coverUrl && (
              <img
                src={detail.coverUrl}
                alt=""
                className="h-14 w-14 rounded-lg object-cover"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="min-w-0">
              <CardTitle className="break-words text-xl">{detail.title}</CardTitle>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                <div>{detail.startTime ?? '开播时间未知'}</div>
                <div>直播时长：{detail.duration ?? '--'}</div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pb-8">
          {Object.keys(detail.baseMetrics).length > 0 && (
            <Card className="shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">基础信息</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3">
                {Object.entries(detail.baseMetrics).map(([key, value]) => (
                  <div key={key} className="min-w-0">
                    <div className="truncate text-xs text-muted-foreground" title={key}>
                      {METRIC_LABELS[key] ?? key}
                    </div>
                    <div className="mt-1 break-words font-semibold">{formatMetricValue(value)}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {detail.metricGroups.map(group => (
            <MetricGroup key={group.key} group={group} />
          ))}

          <Card className="shadow-none">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">商品数据</CardTitle>
              <span className="text-xs text-muted-foreground">共 {detail.productTotal} 件</span>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.products.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">暂无商品数据</div>
              ) : (
                detail.products.map(product => (
                  <div key={product.id} className="rounded-lg border p-3">
                    <div className="flex gap-3">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt=""
                          className="h-12 w-12 rounded-md object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-md bg-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-sm font-medium">{product.title}</div>
                        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                          {Object.entries(product.metrics).map(([key, value]) => (
                            <div key={key} className="min-w-0">
                              <div className="truncate text-xs text-muted-foreground" title={key}>
                                {product.metricLabels[key] ?? METRIC_LABELS[key] ?? key}
                              </div>
                              <div className="mt-0.5 truncate text-sm font-medium">
                                {formatMetricValue(value)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </CardContent>
      </ScrollArea>
    </Card>
  )
}
