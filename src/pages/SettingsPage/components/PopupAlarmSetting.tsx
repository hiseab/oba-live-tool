import { BellRingIcon, SaveIcon, WifiIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import {
  formatPopupAlarmSpeech,
  normalizeMachineLabel,
  normalizePopupAlarmConnectionTarget,
  type PopupAlarmConfig,
} from 'shared/popupAlarm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/useToast'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function PopupAlarmSetting() {
  const { toast } = useToast()
  const [machineLabel, setMachineLabel] = useState('1')
  const [serverHost, setServerHost] = useState('')
  const [serverPort, setServerPort] = useState('17891')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.ipcRenderer
      .invoke(IPC_CHANNELS.popupAlarm.getConfig)
      .then(config => {
        if (cancelled) return
        setMachineLabel(config.machineLabel)
        setServerHost(config.serverHost)
        setServerPort(String(config.serverPort))
      })
      .catch(error => {
        console.error('Failed to load popup alarm config:', error)
        if (!cancelled) toast.error(`读取抖音弹窗报警设置失败：${getErrorMessage(error)}`)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  const validation = useMemo(() => {
    try {
      const normalizedMachineLabel = normalizeMachineLabel(machineLabel)
      const target = normalizePopupAlarmConnectionTarget({ serverHost, serverPort })
      return {
        config: { machineLabel: normalizedMachineLabel, ...target } satisfies PopupAlarmConfig,
        error: null,
        preview: formatPopupAlarmSpeech(normalizedMachineLabel),
      }
    } catch (error) {
      return {
        config: null,
        error: getErrorMessage(error),
        preview: '请输入有效的机器标识后查看报警语音',
      }
    }
  }, [machineLabel, serverHost, serverPort])

  const handleSave = async () => {
    if (!validation.config) return
    setIsSaving(true)
    try {
      const saved = await window.ipcRenderer.invoke(
        IPC_CHANNELS.popupAlarm.updateConfig,
        validation.config,
      )
      setMachineLabel(saved.machineLabel)
      setServerHost(saved.serverHost)
      setServerPort(String(saved.serverPort))
      toast.success('抖音弹窗报警设置已保存')
    } catch (error) {
      toast.error(`保存失败：${getErrorMessage(error)}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleTest = async () => {
    try {
      const target = normalizePopupAlarmConnectionTarget({ serverHost, serverPort }, true)
      setIsTesting(true)
      const result = await window.ipcRenderer.invoke(IPC_CHANNELS.popupAlarm.testConnection, target)
      if (result.success)
        toast.success(
          result.serverVersion ? `${result.message}（v${result.serverVersion}）` : result.message,
        )
      else toast.error(`连接测试失败：${result.message}`)
    } catch (error) {
      toast.error(`连接测试失败：${getErrorMessage(error)}`)
    } finally {
      setIsTesting(false)
    }
  }

  const disabled = isLoading || isSaving || isTesting

  return (
    <Card id="popup-alarm-setting">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BellRingIcon className="h-5 w-5" />
          <CardTitle>抖音弹窗报警</CardTitle>
        </div>
        <CardDescription>
          检测到“人机交互”验证弹窗后，将状态发送到局域网报警服务器统一语音提醒
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="popup-alarm-machine-label">机器标识</Label>
          <Input
            id="popup-alarm-machine-label"
            value={machineLabel}
            disabled={disabled}
            placeholder="例如：3 或 直播间A"
            onChange={event => setMachineLabel(event.target.value)}
          />
          <div className="flex justify-between gap-4 text-sm">
            <p className={validation.error ? 'text-destructive' : 'text-muted-foreground'}>
              {validation.error ?? '去除首尾空格后需为 1～20 个字符；纯数字会自动加“号机器”'}
            </p>
            <span className="shrink-0 text-muted-foreground">
              {Array.from(machineLabel.trim()).length}/20
            </span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
          <div className="space-y-2">
            <Label htmlFor="popup-alarm-server-host">报警服务器地址</Label>
            <Input
              id="popup-alarm-server-host"
              value={serverHost}
              disabled={disabled}
              placeholder="例如：192.168.1.100"
              onChange={event => setServerHost(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="popup-alarm-server-port">端口</Label>
            <Input
              id="popup-alarm-server-port"
              type="number"
              min={1}
              max={65535}
              value={serverPort}
              disabled={disabled}
              onChange={event => setServerPort(event.target.value)}
            />
          </div>
        </div>

        {!serverHost.trim() && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            尚未配置报警服务器。工作机不会在本地播放语音，配置服务器地址后才会发送报警。
          </p>
        )}

        <div className="space-y-2">
          <Label>服务器实际播报内容</Label>
          <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm">
            {validation.preview}
          </div>
          <p className="text-sm text-muted-foreground">
            弹窗存在期间每 5 秒发送心跳；服务器 15 秒未收到心跳会自动解除报警。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={disabled || !validation.config} onClick={handleSave}>
            <SaveIcon className="mr-2 h-4 w-4" />
            {isSaving ? '保存中...' : '保存设置'}
          </Button>
          <Button variant="outline" disabled={disabled || !serverHost.trim()} onClick={handleTest}>
            <WifiIcon className="mr-2 h-4 w-4" />
            {isTesting ? '测试中...' : '测试连接'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
