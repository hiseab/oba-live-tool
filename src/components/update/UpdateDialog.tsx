import { useMemoizedFn } from 'ahooks'
import { Download, RefreshCw, Rocket } from 'lucide-react'
import { useEffect, useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useIpcListener } from '@/hooks/useIpc'
import { useUpdateStore } from '@/hooks/useUpdate'

export function UpdateDialog() {
  const status = useUpdateStore.use.status()
  const setStatus = useUpdateStore.use.setStatus()
  const progress = useUpdateStore.use.progress()
  const setProgress = useUpdateStore.use.setProgress()
  const updateInfo = useUpdateStore.use.versionInfo()
  const startDownload = useUpdateStore.use.startDownload()
  const reset = useUpdateStore.use.reset()
  const error = useUpdateStore.use.error()
  const handleError = useUpdateStore.use.handleError()
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    if (status !== 'idle' && status !== 'checking') {
      setDialogOpen(true)
    }
  }, [status])

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // 先播放关闭动画
      setDialogOpen(false)
      // 等动画关闭后再 reset
      setTimeout(() => reset(), 300)
    }
  }

  const quitAndInstall = async () => {
    try {
      await window.ipcRenderer.invoke(IPC_CHANNELS.updater.quitAndInstall)
    } catch (error) {
      handleError({ message: error instanceof Error ? error.message : String(error) })
    }
  }

  const handleStartDownload = useMemoizedFn(() => {
    startDownload()
  })

  useIpcListener(IPC_CHANNELS.updater.downloadProgress, info => {
    setStatus('downloading')
    setProgress(info.percent)
  })

  useIpcListener(IPC_CHANNELS.updater.updateDownloaded, () => {
    setStatus('ready')
    setProgress(100)
  })

  useIpcListener(IPC_CHANNELS.updater.updateError, handleError)

  const openDownloadURL = (downloadUrl: string) => {
    window.open(downloadUrl, '_blank')
  }

  const buttonModal = useMemoizedFn(() => {
    if (status === 'downloading' || status === 'preparing') {
      return (
        <Button disabled variant="default">
          <RefreshCw className="mr-2 h-4 w-4 animate-bounce" />
          正在更新...
        </Button>
      )
    }
    if (status === 'ready') {
      return (
        <Button onClick={quitAndInstall} variant="default">
          <Rocket className="mr-2 h-4 w-4" />
          马上安装
        </Button>
      )
    }
    if (status === 'error' && error?.downloadURL) {
      const url = error.downloadURL // 添加一步修复类型推断
      return (
        <Button onClick={() => openDownloadURL(url)} variant="default">
          <Download className="mr-2 h-4 w-4" />
          手动下载
        </Button>
      )
    }
    return (
      <Button onClick={handleStartDownload} variant="default">
        <Download className="mr-2 h-4 w-4" />
        立即更新
      </Button>
    )
  })

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogTitle>有新版本可用</DialogTitle>
        <DialogDescription>现在更新以体验最新功能。</DialogDescription>

        {status !== 'error' && (
          <div className="space-y-1 rounded-md border bg-muted/30 px-4 py-3 text-sm">
            <p>当前版本：v{updateInfo?.currentVersion}</p>
            <p className="text-muted-foreground">
              内部版本：{updateInfo?.currentInternalVersion} →{' '}
              <span className="font-semibold text-foreground">
                {updateInfo?.latestInternalVersion}
              </span>
            </p>
          </div>
        )}
        {/* 出错信息 */}
        {status === 'error' && error?.message && (
          <ScrollArea className="text-sm text-destructive whitespace-pre-line max-h-64">
            <h3 className="text-lg font-bold">错误</h3>
            {error?.downloadURL && (
              <h4 className="text-md font-bold">可点击下方按钮尝试通过浏览器下载</h4>
            )}
            {error.message}
          </ScrollArea>
        )}
        {/* 进度条 */}
        {(status === 'downloading' || status === 'ready' || status === 'preparing') && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {status === 'preparing' ? '准备中' : '下载进度'}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              关闭
            </Button>
            {buttonModal()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
