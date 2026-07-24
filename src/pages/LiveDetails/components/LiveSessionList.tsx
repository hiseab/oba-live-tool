import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { LiveSessionSummary } from 'shared/liveDetails'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatMetricValue } from './MetricGroup'

const SKELETON_ROWS = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5', 'row-6']

interface Props {
  items: LiveSessionSummary[]
  total: number
  page: number
  pageSize: number
  selectedSessionId: string | null
  loading: boolean
  onSelect: (session: LiveSessionSummary) => void
  onPageChange: (page: number) => void
}

export default function LiveSessionList({
  items,
  total,
  page,
  pageSize,
  selectedSessionId,
  loading,
  onSelect,
  onPageChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>历史直播场次</CardTitle>
        <span className="text-sm text-muted-foreground">共 {total} 场</span>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1760px] text-sm">
            <thead className="border-y bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">直播间</th>
                <th className="px-3 py-3 font-medium">开播时间</th>
                <th className="px-3 py-3 font-medium">开播时长</th>
                <th className="px-3 py-3 text-right font-medium">直播间观看人数</th>
                <th className="px-3 py-3 text-right font-medium">人均观看时长</th>
                <th className="px-3 py-3 text-right font-medium">平均在线人数</th>
                <th className="px-3 py-3 text-right font-medium">商品点击率(人数)</th>
                <th className="px-3 py-3 text-right font-medium">直播间成交金额</th>
                <th className="px-3 py-3 text-right font-medium">直播间成交订单数</th>
                <th className="px-3 py-3 text-right font-medium">单小时GMV</th>
                <th className="px-5 py-3 text-right font-medium">预估佣金收入</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0
                ? SKELETON_ROWS.map(row => (
                    <tr key={row} className="border-b">
                      <td className="px-5 py-4" colSpan={11}>
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                : items.map(item => (
                    <tr
                      key={item.id}
                      className={cn(
                        'cursor-pointer border-b transition-colors hover:bg-muted/50',
                        selectedSessionId === item.id && 'bg-primary/5',
                      )}
                      onClick={() => onSelect(item)}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {item.coverUrl ? (
                            <img
                              src={item.coverUrl}
                              alt=""
                              className="h-10 w-10 rounded-md object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-md bg-muted" />
                          )}
                          <div className="max-w-52 truncate font-medium" title={item.title}>
                            {item.title}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">{item.startTime ?? '--'}</td>
                      <td className="px-3 py-4 whitespace-nowrap">{item.duration ?? '--'}</td>
                      <td className="px-3 py-4 text-right">
                        {formatMetricValue(item.viewerCount ?? null)}
                      </td>
                      <td className="px-3 py-4 text-right">
                        {formatMetricValue(item.avgWatchDuration ?? null)}
                      </td>
                      <td className="px-3 py-4 text-right">
                        {formatMetricValue(item.avgOnlineCount ?? null)}
                      </td>
                      <td className="px-3 py-4 text-right">
                        {formatMetricValue(item.productClickRate ?? null)}
                      </td>
                      <td className="px-3 py-4 text-right">
                        {formatMetricValue(item.gmv ?? null)}
                      </td>
                      <td className="px-3 py-4 text-right">
                        {formatMetricValue(item.orderCount ?? null)}
                      </td>
                      <td className="px-3 py-4 text-right">
                        {formatMetricValue(item.hourlyGmv ?? null)}
                      </td>
                      <td className="px-5 py-4 text-right font-medium">
                        {formatMetricValue(item.estimatedCommission ?? null)}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {!loading && items.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            当前筛选范围内没有历史直播场次
          </div>
        )}

        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-sm text-muted-foreground">
            第 {page} / {totalPages} 页
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft />
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              下一页
              <ChevronRight />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
