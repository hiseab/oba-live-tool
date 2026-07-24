import type { LiveMetricGroup } from 'shared/liveDetails'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function formatMetricValue(value: string | number | boolean | null): string {
  if (value === null) return '--'
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
}

export default function MetricGroup({ group }: { group: LiveMetricGroup }) {
  return (
    <Card className="shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{group.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3">
        {group.metrics.map(metric => (
          <div key={metric.key} className="min-w-0">
            <div className="text-xs text-muted-foreground truncate" title={metric.label}>
              {metric.label}
            </div>
            <div className="mt-1 font-semibold break-words">{formatMetricValue(metric.value)}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
