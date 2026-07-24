import { AlertCircle, RefreshCw, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Title } from '@/components/common/Title'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLiveDetails } from '@/hooks/useLiveDetails'
import LiveSessionDetailPanel from './components/LiveSessionDetail'
import LiveSessionList from './components/LiveSessionList'

export default function LiveDetails() {
  const liveDetails = useLiveDetails()
  const [queryDraft, setQueryDraft] = useState(liveDetails.query)

  useEffect(() => setQueryDraft(liveDetails.query), [liveDetails.query])

  if (!liveDetails.supported) {
    return (
      <div className="container space-y-4 py-8">
        <Title title="直播明细" description="查看巨量百应历史直播场次和单场核心指标" />
        <Alert>
          <AlertCircle />
          <AlertTitle>当前平台不支持</AlertTitle>
          <AlertDescription>请在“打开中控台”中选择并连接巨量百应账号。</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!liveDetails.connected) {
    return (
      <div className="container space-y-4 py-8">
        <Title title="直播明细" description="查看巨量百应历史直播场次和单场核心指标" />
        <Alert>
          <AlertCircle />
          <AlertTitle>尚未连接中控台</AlertTitle>
          <AlertDescription>
            连接巨量百应中控台后，应用会复用当前登录状态读取直播明细。
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="container space-y-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Title
          title="直播明细"
          description="历史直播场次列表与单场基础、交易、核心指标和商品数据"
        />
        <Button variant="outline" disabled={liveDetails.listLoading} onClick={liveDetails.refresh}>
          <RefreshCw className={liveDetails.listLoading ? 'animate-spin' : ''} />
          刷新数据
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        <Select
          value={String(liveDetails.dateType)}
          onValueChange={value => liveDetails.changeDateType(Number(value))}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">最近 7 天</SelectItem>
            <SelectItem value="30">最近 30 天</SelectItem>
            <SelectItem value="90">最近 90 天</SelectItem>
          </SelectContent>
        </Select>
        <form
          className="flex min-w-64 flex-1 gap-2"
          onSubmit={event => {
            event.preventDefault()
            liveDetails.search(queryDraft)
          }}
        >
          <Input
            value={queryDraft}
            onChange={event => setQueryDraft(event.target.value)}
            placeholder="搜索直播间名称"
          />
          <Button type="submit" variant="secondary">
            <Search />
            搜索
          </Button>
        </form>
      </div>

      {liveDetails.listError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>获取历史直播失败</AlertTitle>
          <AlertDescription>{liveDetails.listError.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <LiveSessionList
          items={liveDetails.pageData?.items ?? []}
          total={liveDetails.pageData?.total ?? 0}
          page={liveDetails.page}
          pageSize={liveDetails.pageSize}
          selectedSessionId={liveDetails.selectedSessionId}
          loading={liveDetails.listLoading}
          onSelect={liveDetails.selectSession}
          onPageChange={liveDetails.changePage}
        />
        <LiveSessionDetailPanel
          detail={liveDetails.detail}
          loading={liveDetails.detailLoading}
          error={liveDetails.detailError?.message}
        />
      </div>
    </div>
  )
}
