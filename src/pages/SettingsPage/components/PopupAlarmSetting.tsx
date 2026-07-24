import { BellRingIcon, SaveIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import {
  formatPopupAlarmSpeech,
  normalizeMachineLabel,
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
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.ipcRenderer
      .invoke(IPC_CHANNELS.popupAlarm.getConfig)
      .then(config => {
        if (!cancelled) setMachineLabel(config.machineLabel)
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
      const normalized = normalizeMachineLabel(machineLabel)
      return {
        normalized,
        error: null,
        preview: formatPopupAlarmSpeech(normalized),
      }
    } catch (error) {
      return {
        normalized: '',
        error: getErrorMessage(error),
        preview: '请输入有效的机器标识后查看报警语音',
      }
    }
  }, [machineLabel])

  const handleSave = async () => {
    if (validation.error) return

    setIsSaving(true)
    try {
      const config: PopupAlarmConfig = { machineLabel: validation.normalized }
      const saved = await window.ipcRenderer.invoke(IPC_CHANNELS.popupAlarm.updateConfig, config)
      setMachineLabel(saved.machineLabel)
      toast.success('抖音弹窗报警设置已保存')
    } catch (error) {
      console.error('Failed to save popup alarm config:', error)
      toast.error(`保存失败：${getErrorMessage(error)}`)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card id="popup-alarm-setting">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BellRingIcon className="h-5 w-5" />
          <CardTitle>抖音弹窗报警</CardTitle>
        </div>
        <CardDescription>
          检测到标题包含“人机交互”的验证弹窗后自动语音提醒，并每 10 秒重复播报
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="popup-alarm-machine-label">机器标识</Label>
          <div className="flex gap-2">
            <Input
              id="popup-alarm-machine-label"
              value={machineLabel}
              disabled={isLoading || isSaving}
              placeholder="例如：3 或 直播间A"
              onChange={event => setMachineLabel(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') void handleSave()
              }}
            />
            <Button
              className="shrink-0"
              disabled={isLoading || isSaving || !!validation.error}
              onClick={handleSave}
            >
              <SaveIcon className="mr-2 h-4 w-4" />
              {isSaving ? '保存中...' : '保存'}
            </Button>
          </div>
          <div className="flex justify-between gap-4 text-sm">
            <p className={validation.error ? 'text-destructive' : 'text-muted-foreground'}>
              {validation.error ?? '去除首尾空格后需为 1～20 个字符；纯数字会自动加“号机器”'}
            </p>
            <span className="shrink-0 text-muted-foreground">
              {Array.from(machineLabel.trim()).length}/20
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <Label>当前报警语音预览</Label>
          <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm">
            {validation.preview}
          </div>
          <p className="text-sm text-muted-foreground">
            设置仅保存在当前电脑，保存后无需重启，下一次报警会直接使用新标识。
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
