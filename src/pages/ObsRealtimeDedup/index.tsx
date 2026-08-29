import { ChevronDown, PlugZap, RefreshCw, Square, WandSparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { NumberRange, ObsGroundType, ObsRealtimeDedupConfig } from 'shared/obsRealtimeDedup'
import { Title } from '@/components/common/Title'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useObsRealtimeDedupStore } from '@/hooks/useObsRealtimeDedup'
import { useToast } from '@/hooks/useToast'

type NumberConfigKey = {
  [Key in keyof ObsRealtimeDedupConfig]: ObsRealtimeDedupConfig[Key] extends number ? Key : never
}[keyof ObsRealtimeDedupConfig]

type RangeConfigKey = {
  [Key in keyof ObsRealtimeDedupConfig]: ObsRealtimeDedupConfig[Key] extends NumberRange
    ? Key
    : never
}[keyof ObsRealtimeDedupConfig]

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function NumberSetting({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 0.01,
  disabled,
}: {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={event => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
      />
    </div>
  )
}

function RangeSetting({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 0.01,
  disabled,
}: {
  id: string
  label: string
  value: NumberRange
  onChange: (value: NumberRange) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid grid-cols-2 gap-2">
        <Input
          id={`${id}-min`}
          aria-label={`${label}最小值`}
          type="number"
          value={value[0]}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={event => {
            const next = Number(event.target.value)
            if (Number.isFinite(next) && next <= value[1]) onChange([next, value[1]])
          }}
        />
        <Input
          id={`${id}-max`}
          aria-label={`${label}最大值`}
          type="number"
          value={value[1]}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={event => {
            const next = Number(event.target.value)
            if (Number.isFinite(next) && next >= value[0]) onChange([value[0], next])
          }}
        />
      </div>
    </div>
  )
}

function BooleanSetting({
  id,
  label,
  checked,
  onChange,
  disabled,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

const groundNames: Record<ObsGroundType, string> = {
  concrete: '水泥',
  carpet: '地毯',
  grass: '草地',
}

export default function ObsRealtimeDedup() {
  const { toast } = useToast()
  const config = useObsRealtimeDedupStore.use.config()
  const sourceUuid = useObsRealtimeDedupStore.use.sourceUuid()
  const snapshot = useObsRealtimeDedupStore.use.snapshot()
  const runtime = useObsRealtimeDedupStore.use.runtime()
  const status = useObsRealtimeDedupStore.use.status()
  const busy = useObsRealtimeDedupStore.use.busy()
  const patchConfig = useObsRealtimeDedupStore.use.patchConfig()
  const setSourceUuid = useObsRealtimeDedupStore.use.setSourceUuid()
  const connect = useObsRealtimeDedupStore.use.connect()
  const refreshSources = useObsRealtimeDedupStore.use.refreshSources()
  const start = useObsRealtimeDedupStore.use.start()
  const stop = useObsRealtimeDedupStore.use.stop()
  const syncConfig = useObsRealtimeDedupStore.use.syncConfig()
  const [advancedOpen, setAdvancedOpen] = useState(false)

  useEffect(() => {
    if (!runtime.running) return
    const timer = window.setTimeout(() => {
      void syncConfig(config).catch(error =>
        toast.error(`更新 OBS 实时去重参数失败：${message(error)}`),
      )
    }, 250)
    return () => window.clearTimeout(timer)
  }, [config, runtime.running, syncConfig, toast])

  const setNumber = (key: NumberConfigKey, value: number) => patchConfig({ [key]: value })
  const setRange = (key: RangeConfigKey, value: NumberRange) => patchConfig({ [key]: value })

  const handleConnect = async () => {
    try {
      const next = await connect()
      if (!sourceUuid && next.sources[0]) setSourceUuid(next.sources[0].sourceUuid)
      toast.success(`已连接 OBS，当前场景：${next.currentScene}`)
    } catch (error) {
      toast.error(`连接 OBS 失败：${message(error)}`)
    }
  }

  const handleRefresh = async () => {
    try {
      await refreshSources()
      toast.success('OBS 源列表已刷新')
    } catch (error) {
      toast.error(`刷新 OBS 源失败：${message(error)}`)
    }
  }

  const handleStart = async () => {
    try {
      await start()
      toast.success('OBS 实时去重已启动')
    } catch (error) {
      toast.error(`启动失败：${message(error)}`)
    }
  }

  const handleStop = async () => {
    try {
      await stop()
      toast.success('OBS 实时去重已停止并恢复原始画面')
    } catch (error) {
      toast.error(`停止失败：${message(error)}`)
    }
  }

  const toggleGround = (ground: ObsGroundType) => {
    const selected = config.floorMaterials.includes(ground)
    if (selected && config.floorMaterials.length === 1) return
    patchConfig({
      floorMaterials: selected
        ? config.floorMaterials.filter(item => item !== ground)
        : [...config.floorMaterials, ground],
    })
  }

  const disabled = busy || runtime.phase === 'stopping'
  const canStart =
    runtime.connected &&
    !runtime.running &&
    Boolean(sourceUuid) &&
    runtime.capabilities.colorFilter &&
    runtime.capabilities.shaderFilter

  return (
    <div className="container space-y-6 py-8">
      <Title
        title="OBS 实时去重"
        description="对当前节目场景中的指定源持续施加位移、色彩和径向模糊扰动"
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PlugZap className="h-5 w-5" /> OBS 连接
              </CardTitle>
              <CardDescription>固定连接本机 ws://127.0.0.1:4455，不使用密码认证</CardDescription>
            </div>
            <Badge variant={runtime.connected ? 'default' : 'secondary'}>
              {runtime.running ? '运行中' : runtime.connected ? '已连接' : '未连接'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button disabled={disabled || runtime.running} onClick={handleConnect}>
              <PlugZap className="mr-2 h-4 w-4" />
              {runtime.connected ? '重新连接' : '连接 OBS'}
            </Button>
            <Button
              variant="outline"
              disabled={disabled || !runtime.connected || runtime.running}
              onClick={handleRefresh}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> 刷新源
            </Button>
          </div>

          {runtime.message && (
            <Alert variant={runtime.phase === 'error' ? 'destructive' : 'default'}>
              <AlertTitle>运行状态</AlertTitle>
              <AlertDescription>{runtime.message}</AlertDescription>
            </Alert>
          )}

          {runtime.connected && !runtime.capabilities.shaderFilter && (
            <Alert variant="destructive">
              <AlertTitle>缺少 OBS ShaderFilter 插件</AlertTitle>
              <AlertDescription>
                当前 OBS 没有提供 shader_filter。请安装 obs-shaderfilter 插件并重启 OBS 后再连接。
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>当前节目场景</Label>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {snapshot?.currentScene ?? runtime.currentScene ?? '尚未连接'}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="obs-realtime-dedup-source">目标源</Label>
              <select
                id="obs-realtime-dedup-source"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                value={sourceUuid}
                disabled={disabled || runtime.running || !runtime.connected}
                onChange={event => setSourceUuid(event.target.value)}
              >
                <option value="">请选择 OBS 源</option>
                {snapshot?.sources.map(source => (
                  <option
                    key={`${source.sourceUuid}-${source.sceneItemId}`}
                    value={source.sourceUuid}
                  >
                    {source.sourceName} {source.inputKind ? `(${source.inputKind})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Alert>
            <AlertTitle>固定滤镜名</AlertTitle>
            <AlertDescription>
              启动会删除目标源上已有的 Color 和 Zoom Blur 同名滤镜，再创建本模块滤镜。
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>核心参数</CardTitle>
          <CardDescription>运行期间修改后会在下一个更新周期生效</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <NumberSetting
              id="obs-amplitude"
              label="位移幅度（px）"
              value={config.amplitude}
              min={0}
              step={0.1}
              onChange={value => setNumber('amplitude', value)}
            />
            <NumberSetting
              id="obs-frequency"
              label="更新频率（次/秒）"
              value={config.frequency}
              min={0.1}
              step={0.1}
              onChange={value => setNumber('frequency', value)}
            />
            <NumberSetting
              id="obs-rotation"
              label="旋转幅度（度）"
              value={config.rotationAmplitude}
              min={0}
              step={0.1}
              onChange={value => setNumber('rotationAmplitude', value)}
            />
            <NumberSetting
              id="obs-color-probability"
              label="色彩更新概率（%）"
              value={config.colorProbability}
              min={0}
              max={100}
              step={0.1}
              onChange={value => setNumber('colorProbability', value)}
            />
            <NumberSetting
              id="obs-blur-probability"
              label="模糊更新概率（%）"
              value={config.zoomBlurProbability}
              min={0}
              max={100}
              step={0.1}
              onChange={value => setNumber('zoomBlurProbability', value)}
            />
          </div>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                高级参数
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-6 pt-5">
              <section className="space-y-4">
                <h3 className="font-medium">安全运动</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <NumberSetting
                    id="safety-min"
                    label="最小突发偏移"
                    value={config.safetyMinOffset}
                    min={0}
                    onChange={value => setNumber('safetyMinOffset', value)}
                  />
                  <NumberSetting
                    id="safety-max"
                    label="最大突发偏移"
                    value={config.safetyMaxOffset}
                    min={config.safetyMinOffset}
                    onChange={value => setNumber('safetyMaxOffset', value)}
                  />
                  <NumberSetting
                    id="safety-vertical"
                    label="垂直活动系数"
                    value={config.safetyVerticalArea}
                    min={0}
                    max={1}
                    onChange={value => setNumber('safetyVerticalArea', value)}
                  />
                  <NumberSetting
                    id="cooldown-min"
                    label="最短冷却（秒）"
                    value={config.safetyCooldownMin}
                    min={0}
                    onChange={value => setNumber('safetyCooldownMin', value)}
                  />
                  <NumberSetting
                    id="cooldown-max"
                    label="最长冷却（秒）"
                    value={config.safetyCooldownMax}
                    min={config.safetyCooldownMin}
                    onChange={value => setNumber('safetyCooldownMax', value)}
                  />
                  <NumberSetting
                    id="focus-weight"
                    label="中心回归权重"
                    value={config.focusWeight}
                    min={0}
                    max={1}
                    onChange={value => setNumber('focusWeight', value)}
                  />
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="font-medium">生物特征与环境</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <RangeSetting
                    id="heart-rate"
                    label="心率范围"
                    value={config.heartRateRange}
                    min={1}
                    step={1}
                    onChange={value => setRange('heartRateRange', value)}
                  />
                  <NumberSetting
                    id="breath-ratio"
                    label="呼吸比"
                    value={config.breathRatio}
                    min={0.001}
                    onChange={value => setNumber('breathRatio', value)}
                  />
                  <NumberSetting
                    id="oxygen-impact"
                    label="氧气影响"
                    value={config.oxygenImpact}
                    min={0}
                    onChange={value => setNumber('oxygenImpact', value)}
                  />
                  <NumberSetting
                    id="muscle-fatigue"
                    label="肌肉疲劳"
                    value={config.muscleFatigue}
                    min={0}
                    onChange={value => setNumber('muscleFatigue', value)}
                  />
                  <NumberSetting
                    id="spasm-probability"
                    label="痉挛概率（每秒）"
                    value={config.spasmProbability}
                    min={0}
                    max={1}
                    onChange={value => setNumber('spasmProbability', value)}
                  />
                  <RangeSetting
                    id="hand-dominance"
                    label="左右手权重"
                    value={config.handDominance}
                    min={0}
                    max={1}
                    onChange={value => setRange('handDominance', value)}
                  />
                  <RangeSetting
                    id="heel-height"
                    label="鞋跟高度范围"
                    value={config.heelHeightRange}
                    min={0}
                    onChange={value => setRange('heelHeightRange', value)}
                  />
                  <NumberSetting
                    id="wind-seed"
                    label="风力随机种子"
                    value={config.windSeed}
                    step={1}
                    onChange={value => setNumber('windSeed', Math.round(value))}
                  />
                  <NumberSetting
                    id="human-factor"
                    label="人性化系数"
                    value={config.humanFactor}
                    min={0}
                    onChange={value => setNumber('humanFactor', value)}
                  />
                  <NumberSetting
                    id="imperfect-factor"
                    label="不完美系数"
                    value={config.imperfectFactor}
                    min={0}
                    onChange={value => setNumber('imperfectFactor', value)}
                  />
                  <NumberSetting
                    id="heartbeat-coupling"
                    label="心跳耦合"
                    value={config.heartbeatCoupling}
                    min={0}
                    onChange={value => setNumber('heartbeatCoupling', value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>地面材质候选</Label>
                  <div className="flex gap-2">
                    {(Object.keys(groundNames) as ObsGroundType[]).map(ground => (
                      <Button
                        key={ground}
                        type="button"
                        size="sm"
                        variant={config.floorMaterials.includes(ground) ? 'default' : 'outline'}
                        onClick={() => toggleGround(ground)}
                      >
                        {groundNames[ground]}
                      </Button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="font-medium">轨迹与熵</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <BooleanSetting
                    id="trajectory-confuser"
                    label="轨迹扰动"
                    checked={config.trajectoryConfuser}
                    onChange={checked => patchConfig({ trajectoryConfuser: checked })}
                  />
                  <BooleanSetting
                    id="heartbeat-simulator"
                    label="心跳模拟"
                    checked={config.heartbeatSimulator}
                    onChange={checked => patchConfig({ heartbeatSimulator: checked })}
                  />
                  <NumberSetting
                    id="entropy-controller"
                    label="目标熵"
                    value={config.entropyController}
                    min={0.001}
                    onChange={value => setNumber('entropyController', value)}
                  />
                  <NumberSetting
                    id="entropy-window"
                    label="熵窗口（秒）"
                    value={config.entropyWindow}
                    min={1}
                    onChange={value => setNumber('entropyWindow', value)}
                  />
                  <RangeSetting
                    id="phase-randomization"
                    label="相位随机范围"
                    value={config.phaseRandomization}
                    onChange={value => setRange('phaseRandomization', value)}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="platform-mode">平台模式</Label>
                    <Input
                      id="platform-mode"
                      value={config.platformMode}
                      onChange={event =>
                        patchConfig({ platformMode: event.target.value || '抖音夜间' })
                      }
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="font-medium">色彩范围</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <RangeSetting
                    id="gamma-range"
                    label="Gamma"
                    value={config.gammaRange}
                    onChange={value => setRange('gammaRange', value)}
                  />
                  <RangeSetting
                    id="contrast-range"
                    label="对比度"
                    value={config.contrastRange}
                    onChange={value => setRange('contrastRange', value)}
                  />
                  <RangeSetting
                    id="brightness-range"
                    label="亮度"
                    value={config.brightnessRange}
                    onChange={value => setRange('brightnessRange', value)}
                  />
                  <RangeSetting
                    id="saturation-range"
                    label="饱和度"
                    value={config.saturationRange}
                    onChange={value => setRange('saturationRange', value)}
                  />
                  <RangeSetting
                    id="hue-range"
                    label="色相"
                    value={config.hueShiftRange}
                    onChange={value => setRange('hueShiftRange', value)}
                  />
                  <RangeSetting
                    id="opacity-range"
                    label="透明度（%）"
                    value={config.opacityRange}
                    min={0}
                    max={100}
                    onChange={value => setRange('opacityRange', value)}
                  />
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="font-medium">Zoom Blur 范围</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <RangeSetting
                    id="samples-range"
                    label="采样数"
                    value={config.samplesRange}
                    min={2}
                    max={100}
                    step={1}
                    onChange={value =>
                      setRange('samplesRange', [Math.round(value[0]), Math.round(value[1])])
                    }
                  />
                  <RangeSetting
                    id="magnitude-range"
                    label="模糊强度"
                    value={config.blurMagnitudeRange}
                    min={0}
                    max={1}
                    onChange={value => setRange('blurMagnitudeRange', value)}
                  />
                  <RangeSetting
                    id="speed-range"
                    label="动画速度（%）"
                    value={config.speedPercentRange}
                    min={0}
                    max={100}
                    onChange={value => setRange('speedPercentRange', value)}
                  />
                </div>
              </section>
            </CollapsibleContent>
          </Collapsible>

          <div className="flex gap-2">
            {runtime.running ? (
              <Button variant="destructive" disabled={disabled} onClick={handleStop}>
                <Square className="mr-2 h-4 w-4" /> 停止并恢复
              </Button>
            ) : (
              <Button disabled={disabled || !canStart} onClick={handleStart}>
                <WandSparkles className="mr-2 h-4 w-4" /> 启动实时去重
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>实时状态</CardTitle>
          <CardDescription>每 500ms 从主进程更新一次，合法的 0 值会原样显示</CardDescription>
        </CardHeader>
        <CardContent>
          {status ? (
            <div className="grid gap-4 text-sm md:grid-cols-4">
              <div className="rounded-md border p-3">
                <div className="font-medium">位置</div>
                <div className="text-muted-foreground">X {status.position.x.toFixed(3)}</div>
                <div className="text-muted-foreground">Y {status.position.y.toFixed(3)}</div>
                <div className="text-muted-foreground">
                  旋转 {status.position.rotation.toFixed(3)}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="font-medium">色彩</div>
                <div className="text-muted-foreground">
                  Gamma {status.colorSettings.gamma.toFixed(4)}
                </div>
                <div className="text-muted-foreground">
                  透明度 {status.colorSettings.opacity.toFixed(2)}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="font-medium">Zoom Blur</div>
                <div className="text-muted-foreground">采样 {status.blurSettings.samples}</div>
                <div className="text-muted-foreground">
                  强度 {status.blurSettings.magnitude.toFixed(3)}
                </div>
                <div className="text-muted-foreground">
                  速度 {status.blurSettings.speed_percent.toFixed(3)}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="font-medium">运动系统</div>
                <div className="text-muted-foreground">
                  心率 {status.systemStatus.biologicalClock.heartRate.toFixed(1)}
                </div>
                <div className="text-muted-foreground">
                  熵 {status.systemStatus.motion.entropy.toFixed(3)}
                </div>
                <div className="text-muted-foreground">
                  状态 {status.systemStatus.motion.motionState}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">启动后显示实时参数。</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
