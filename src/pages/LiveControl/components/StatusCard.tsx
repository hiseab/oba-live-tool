import { useMemoizedFn } from 'ahooks'
import { CheckIcon, CircleAlert, GlobeIcon, XIcon } from 'lucide-react'
import React, { useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useAccounts } from '@/hooks/useAccounts'
import { useAutoMessageStore } from '@/hooks/useAutoMessage'
import { useAutoPopUpStore } from '@/hooks/useAutoPopUp'
import { useAutoReplyStore } from '@/hooks/useAutoReply'
import { useAutoReplyConfigStore } from '@/hooks/useAutoReplyConfig'
import { runAutoStart, summarizeAutoStart, supportsAutoStart } from '@/hooks/useAutoStart'
import { useCurrentChromeConfig, useCurrentChromeConfigActions } from '@/hooks/useChromeConfig'
import { useCurrentLiveControl, useCurrentLiveControlActions } from '@/hooks/useLiveControl'
import { useToast } from '@/hooks/useToast'
import PlatformSelect from './PlatformSelect'

const StatusAlert = React.memo(() => {
  const platform = useCurrentLiveControl(state => state.platform)
  if (platform === 'wxchannel') {
    return (
      <Alert>
        <CircleAlert className="h-4 w-4" />
        <AlertTitle>你选择了视频号平台，请注意以下事项：</AlertTitle>
        <AlertDescription>
          <ol className="list-decimal list-inside">
            <li>
              请先确认<strong>开播后</strong>再连接中控台
            </li>
            <li>
              视频号助手无法<strong>一号多登</strong>，在别处登录视频号助手会
              <strong>中断连接</strong>!
            </li>
          </ol>
        </AlertDescription>
      </Alert>
    )
  }
  if (platform === 'taobao') {
    return (
      <Alert>
        <CircleAlert className="h-4 w-4" />
        <AlertTitle>你选择了淘宝平台，请注意以下事项：</AlertTitle>
        <AlertDescription>
          <ol className="list-decimal list-inside">
            <li>
              请先确认<strong>开播后</strong>
              再连接中控台，因为进入淘宝中控台需要获取<strong>直播间ID</strong>
            </li>
            <li>
              目前淘宝会触发人机验证，所以将<strong>强制关闭无头模式</strong>
              ，除了登录和人机验证之外请尽量不要操作浏览器
            </li>
          </ol>
        </AlertDescription>
      </Alert>
    )
  }
  return null
})

const StatusCard = React.memo(() => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>控制台状态</CardTitle>
        <CardDescription>查看并管理直播控制台的连接状态</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <ConnectState />
            <div className="flex items-center gap-2">
              <PlatformSelect />
              <ConnectToLiveControl />
            </div>
          </div>
          <StatusAlert />
          <Separator />
          <HeadlessSetting />
          <AutoStartSetting />
        </div>
      </CardContent>
    </Card>
  )
})

/**
 * 连接成功后自动启动直播任务（ADR-0007）。
 * 配置一律从 store 快照读取，避免把 StatusCard 订阅到四个 store 上。
 */
const useAutoStartOnConnect = () => {
  const { toast } = useToast()

  return useMemoizedFn(async (accountId: string) => {
    const invoke = window.ipcRenderer.invoke.bind(window.ipcRenderer)

    const results = await runAutoStart({
      autoMessage: async () => {
        const config = useAutoMessageStore.getState().contexts[accountId]?.config
        if (!config) throw new Error('尚未配置自动发言')
        const ok = await invoke(IPC_CHANNELS.tasks.autoMessage.start, accountId, config)
        if (!ok) throw new Error('启动失败，请检查话术配置')
        useAutoMessageStore.getState().setIsRunning(accountId, true)
      },
      autoPopUp: async () => {
        const config = useAutoPopUpStore.getState().contexts[accountId]?.config
        if (!config) throw new Error('尚未配置自动弹窗')
        const ok = await invoke(IPC_CHANNELS.tasks.autoPopUp.start, accountId, config)
        if (!ok) throw new Error('启动失败，请检查商品配置')
        useAutoPopUpStore.getState().setIsRunning(accountId, true)
      },
      commentListener: async () => {
        const config = useAutoReplyConfigStore.getState().contexts[accountId]?.config
        const replyStore = useAutoReplyStore.getState()
        replyStore.setIsListening(accountId, 'waiting')
        try {
          const ok = await invoke(IPC_CHANNELS.tasks.autoReply.startCommentListener, accountId, {
            source: config?.entry ?? 'control',
            ws: config?.ws?.enable ? { port: config.ws.port } : undefined,
          })
          if (!ok) throw new Error('监听评论失败')
          replyStore.setIsListening(accountId, 'listening')
        } catch (error) {
          replyStore.setIsListening(accountId, 'error')
          throw error
        }
      },
      // 自动回复纯渲染层，只置标志位；必须在评论监听之后
      autoReply: async () => {
        useAutoReplyStore.getState().setIsRunning(accountId, true)
      },
    })

    const { succeeded, failed } = summarizeAutoStart(results)
    if (succeeded.length > 0) toast.success(`已自动启动：${succeeded.join('、')}`)
    for (const { name, error } of failed) {
      toast.error(error ? `${name}自动启动失败：${error}` : `${name}自动启动失败`)
    }
  })
}

const ConnectToLiveControl = React.memo(() => {
  const { setIsConnected } = useCurrentLiveControlActions()
  const platform = useCurrentLiveControl(context => context.platform)
  const isConnected = useCurrentLiveControl(context => context.isConnected)
  const chromePath = useCurrentChromeConfig(context => context.path)
  const storageState = useCurrentChromeConfig(context => context.storageState)
  let headless = useCurrentChromeConfig(context => context.headless)
  const account = useAccounts(store => store.getCurrentAccount())
  const autoStart = useCurrentLiveControl(context => context.autoStart)
  const runAutoStartTasks = useAutoStartOnConnect()

  if (platform === 'taobao') {
    headless = false
  }

  const { toast } = useToast()

  const connectLiveControl = useMemoizedFn(async () => {
    try {
      if (!account) {
        toast.error('找不到对应账号')
        return
      }
      setIsConnected('connecting')
      const result = await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.liveControl.connect, {
        headless,
        chromePath,
        storageState,
        platform,
        account,
      })

      if (result) {
        setIsConnected('connected')
        toast.success('已连接到直播控制台')
        if (autoStart && supportsAutoStart(platform)) {
          await runAutoStartTasks(account.id)
        }
      } else {
        throw new Error('连接直播控制台失败')
      }
    } catch (error) {
      setIsConnected('disconnected')
      toast.error(error instanceof Error ? error.message : '连接直播控制台失败')
    }
  })

  const disconnectLiveControl = useMemoizedFn(async () => {
    if (!account) {
      toast.error('找不到对应账号')
      return
    }
    try {
      await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.liveControl.disconnect, account.id)
      toast.success('已断开连接')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '断开连接失败')
    } finally {
      setIsConnected('disconnected')
    }
  })

  const handleButtonClick = useMemoizedFn(() => {
    if (isConnected === 'connected') {
      disconnectLiveControl()
    } else {
      connectLiveControl()
    }
  })

  return isConnected === 'connected' ? (
    <DisconnectButton handleButtonClick={handleButtonClick} />
  ) : (
    <ConnectButton isLoading={isConnected === 'connecting'} handleButtonClick={handleButtonClick} />
  )
})

const ConnectButton = React.memo(
  ({ isLoading, handleButtonClick }: { isLoading: boolean; handleButtonClick: () => void }) => {
    return (
      <Button variant={'default'} onClick={handleButtonClick} disabled={isLoading} size="sm">
        <GlobeIcon className="mr-2 h-4 w-4" />
        {isLoading ? '连接中...' : '连接直播控制台'}
      </Button>
    )
  },
)

const DisconnectButton = React.memo(({ handleButtonClick }: { handleButtonClick: () => void }) => {
  const [isHovered, setIsHovered] = useState(false)
  return (
    <Button
      variant="secondary"
      onClick={handleButtonClick}
      size="sm"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isHovered ? (
        <>
          <XIcon className="mr-2 h-4 w-4" />
          断开连接
        </>
      ) : (
        <>
          <CheckIcon className="mr-2 h-4 w-4" />
          已连接
        </>
      )}
    </Button>
  )
})

const ConnectState = React.memo(() => {
  const isConnected = useCurrentLiveControl(context => context.isConnected)
  const accountName = useCurrentLiveControl(context => context.accountName)
  return (
    <div className="flex items-center gap-4">
      <div
        className={`w-2 h-2 rounded-full ${isConnected === 'connected' ? 'bg-green-500' : 'bg-gray-300'}`}
      />
      <span className="text-sm text-muted-foreground">
        {isConnected === 'connected' ? `已连接${accountName ? ` (${accountName})` : ''}` : '未连接'}
      </span>
    </div>
  )
})

const HeadlessSetting = () => {
  const headless = useCurrentChromeConfig(context => context.headless ?? false)
  const platform = useCurrentLiveControl(context => context.platform)
  const isConnected = useCurrentLiveControl(context => context.isConnected)
  const { setHeadless } = useCurrentChromeConfigActions()
  return (
    <div className="flex justify-between items-center">
      <div>
        <div className="text-sm">无头模式</div>
        <div className="text-muted-foreground text-xs">
          开启后浏览器将在后台运行，不会在桌面显示
        </div>
      </div>
      <Switch
        checked={headless && platform !== 'taobao'}
        disabled={platform === 'taobao' || isConnected !== 'disconnected'}
        onCheckedChange={v => setHeadless(v)}
      />
    </div>
  )
}

const AutoStartSetting = () => {
  const autoStart = useCurrentLiveControl(context => context.autoStart)
  const platform = useCurrentLiveControl(context => context.platform)
  const isConnected = useCurrentLiveControl(context => context.isConnected)
  const { setAutoStart } = useCurrentLiveControlActions()
  const supported = supportsAutoStart(platform)

  return (
    <div className="flex justify-between items-center">
      <div>
        <div className="text-sm">连接后自动启动任务</div>
        <div className="text-muted-foreground text-xs">
          {supported
            ? '连接成功后依次开启自动发言、自动弹窗、评论监听和自动回复'
            : '当前平台不支持自动回复，无法使用自动启动'}
        </div>
      </div>
      <Switch
        checked={supported && autoStart}
        disabled={!supported || isConnected === 'connecting'}
        onCheckedChange={v => setAutoStart(v)}
      />
    </div>
  )
}

export default StatusCard
