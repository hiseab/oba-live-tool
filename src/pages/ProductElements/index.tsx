import { Download, PackageCheck, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import type {
  ProductChangeClientState,
  ProductChangeRecord,
  ProductChangeStatus,
} from 'shared/productChange'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/useToast'

const INITIAL_STATE: ProductChangeClientState = {
  connected: false,
  snapshot: { currentStatus: 'normal', activeChangeId: '', changes: [] },
}

const STATUS_TEXT: Record<ProductChangeStatus | 'normal', string> = {
  normal: '正常',
  requested: '待关联商品',
  assigned: '待工作机更换',
  completed: '更换成功',
}

function formatTime(value: number | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function statusBadge(status: ProductChangeStatus) {
  if (status === 'completed') return <Badge className="bg-emerald-600">更换成功</Badge>
  if (status === 'assigned') return <Badge>待工作机更换</Badge>
  return <Badge variant="secondary">待关联商品</Badge>
}

function ProductCard({
  record,
  downloading,
  completing,
  onDownload,
  onComplete,
}: {
  record: ProductChangeRecord
  downloading: boolean
  completing: boolean
  onDownload: () => void
  onComplete: () => void
}) {
  const product = record.product
  if (!product) return null
  return (
    <Card>
      <CardContent className="flex gap-5 p-5">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-lg border bg-muted">
          {product.coverUrl ? (
            <img src={product.coverUrl} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              暂无主图
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold">{product.name}</h3>
            {statusBadge(record.status)}
          </div>
          <p className="text-sm text-muted-foreground">
            平台商品 ID：{product.platformProductId || '-'}
          </p>
          <p className="text-sm text-muted-foreground">素材数量：{product.materialCount}</p>
          <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
            <span>请求：{formatTime(record.requestedAt)}</span>
            <span>关联：{formatTime(record.assignedAt)}</span>
            <span>完成：{formatTime(record.completedAt)}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col justify-center gap-2">
          <Button variant="outline" disabled={downloading} onClick={onDownload}>
            <Download className={downloading ? 'animate-pulse' : ''} />
            {downloading ? '下载中...' : '下载素材'}
          </Button>
          {record.status === 'assigned' && (
            <Button disabled={completing} onClick={onComplete}>
              <PackageCheck />
              {completing ? '上报中...' : '更换成功'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function ProductElements() {
  const { toast } = useToast()
  const [state, setState] = useState<ProductChangeClientState>(INITIAL_STATE)
  const [requesting, setRequesting] = useState(false)
  const [completingId, setCompletingId] = useState('')
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    let mounted = true
    window.ipcRenderer
      .invoke(IPC_CHANNELS.productChange.getState)
      .then(next => mounted && setState(next))
      .catch(
        error => mounted && toast.error(error instanceof Error ? error.message : String(error)),
      )
    const removeUpdated = window.ipcRenderer.on(IPC_CHANNELS.productChange.updated, setState)
    const removeError = window.ipcRenderer.on(IPC_CHANNELS.productChange.error, error => {
      toast.error(error.message)
      setRequesting(false)
      setCompletingId('')
    })
    return () => {
      mounted = false
      removeUpdated()
      removeError()
    }
  }, [toast])

  useEffect(() => {
    if (!state.connected) {
      setRequesting(false)
      setCompletingId('')
      return
    }
    if (
      state.snapshot.currentStatus === 'requested' ||
      state.snapshot.currentStatus === 'assigned'
    ) {
      setRequesting(false)
    }
    if (
      completingId &&
      state.snapshot.changes.some(
        record => record.id === completingId && record.status === 'completed',
      )
    ) {
      setCompletingId('')
    }
  }, [state.connected, state.snapshot, completingId])

  const productRecords = useMemo(
    () => state.snapshot.changes.filter(record => record.product && record.status !== 'requested'),
    [state.snapshot.changes],
  )
  const hasPendingChange = ['requested', 'assigned'].includes(state.snapshot.currentStatus)
  const statusText = STATUS_TEXT[state.snapshot.currentStatus]
  const statusHint = !state.connected
    ? '工作机 WebSocket 连接异常，请检查运行日志和连接配置。'
    : state.snapshot.currentStatus === 'requested'
      ? '已上报，等待管理员关联商品。'
      : state.snapshot.currentStatus === 'assigned'
        ? '管理员已关联商品，请下载素材并在实际更换完成后确认。'
        : '当前可以发起新的商品更换请求。'

  const requestChange = async () => {
    setRequesting(true)
    try {
      await window.ipcRenderer.invoke(IPC_CHANNELS.productChange.request)
      toast.success('商品更换请求已发送')
    } catch (error) {
      setRequesting(false)
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const completeChange = async (record: ProductChangeRecord) => {
    setCompletingId(record.id)
    try {
      await window.ipcRenderer.invoke(IPC_CHANNELS.productChange.complete, record.id)
      toast.success('更换成功状态已发送')
    } catch (error) {
      setCompletingId('')
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const downloadMaterials = async (record: ProductChangeRecord) => {
    setDownloadingIds(previous => new Set(previous).add(record.id))
    try {
      const result = await window.ipcRenderer.invoke(IPC_CHANNELS.productChange.download, record.id)
      if (result.failed.length) {
        toast.error(
          `素材下载完成：成功 ${result.successCount} 个，失败 ${result.failed.length} 个。保存目录：${result.directory}`,
        )
      } else {
        toast.success(`已下载 ${result.successCount} 个素材。保存目录：${result.directory}`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setDownloadingIds(previous => {
        const next = new Set(previous)
        next.delete(record.id)
        return next
      })
    }
  }

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>商品元素</CardTitle>
            <CardDescription className="mt-2">
              向管理员申请更换商品，并下载已关联商品的全部素材。
            </CardDescription>
          </div>
          <Button
            disabled={!state.connected || hasPendingChange || requesting}
            onClick={requestChange}
          >
            <RefreshCw className={requesting ? 'animate-spin' : ''} />
            {requesting ? '上报中...' : '更换商品'}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-4">
            <Badge variant={state.connected ? 'outline' : 'destructive'}>
              {state.connected ? 'WebSocket 已连接' : 'WebSocket 未连接'}
            </Badge>
            <span className="font-medium">当前状态：{statusText}</span>
            <span className="text-sm text-muted-foreground">{statusHint}</span>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">关联商品</h2>
          <p className="text-sm text-muted-foreground">最新记录排在前面，已完成记录会继续保留。</p>
        </div>
        {productRecords.length ? (
          productRecords.map(record => (
            <ProductCard
              key={record.id}
              record={record}
              downloading={downloadingIds.has(record.id)}
              completing={completingId === record.id}
              onDownload={() => downloadMaterials(record)}
              onComplete={() => completeChange(record)}
            />
          ))
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              暂无已关联商品
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
