export type ObsGroundType = 'concrete' | 'carpet' | 'grass'

export type NumberRange = readonly [number, number]

export interface ObsSceneItemTransform {
  positionX?: number
  positionY?: number
  rotation?: number
  scaleX?: number
  scaleY?: number
  width?: number
  height?: number
  sourceWidth?: number
  sourceHeight?: number
  boundsType?: string
  boundsAlignment?: number
  boundsWidth?: number
  boundsHeight?: number
  alignment?: number
  cropLeft?: number
  cropRight?: number
  cropTop?: number
  cropBottom?: number
  [key: string]: unknown
}

export interface ObsSourceInfo {
  sceneName: string
  sourceName: string
  sourceUuid: string
  sourceType: string
  inputKind: string | null
  sceneItemId: number
  sceneItemTransform: ObsSceneItemTransform
}

export interface ObsRealtimeDedupCapabilities {
  colorFilter: boolean
  shaderFilter: boolean
}

export interface ObsConnectionSnapshot {
  currentScene: string
  sources: ObsSourceInfo[]
  capabilities: ObsRealtimeDedupCapabilities
}

export interface ObsRealtimeDedupConfig {
  amplitude: number
  frequency: number
  rotationAmplitude: number
  safetyMinOffset: number
  safetyMaxOffset: number
  safetyVerticalArea: number
  safetyCooldownMin: number
  safetyCooldownMax: number
  focusWeight: number
  heartRateRange: NumberRange
  breathRatio: number
  oxygenImpact: number
  muscleFatigue: number
  spasmProbability: number
  handDominance: NumberRange
  floorMaterials: ObsGroundType[]
  heelHeightRange: NumberRange
  windSeed: number
  trajectoryConfuser: boolean
  heartbeatSimulator: boolean
  entropyController: number
  phaseRandomization: NumberRange
  humanFactor: number
  imperfectFactor: number
  platformMode: string
  entropyWindow: number
  heartbeatCoupling: number
  colorProbability: number
  gammaRange: NumberRange
  contrastRange: NumberRange
  brightnessRange: NumberRange
  saturationRange: NumberRange
  hueShiftRange: NumberRange
  opacityRange: NumberRange
  zoomBlurProbability: number
  samplesRange: NumberRange
  blurMagnitudeRange: NumberRange
  speedPercentRange: NumberRange
}

export interface ObsColorSettings {
  gamma: number
  contrast: number
  brightness: number
  saturation: number
  hue_shift: number
  opacity: number
}

export interface ObsBlurSettings {
  samples: number
  magnitude: number
  speed_percent: number
}

export interface ObsRealtimeDedupStatus {
  position: { x: number; y: number; rotation: number }
  colorSettings: ObsColorSettings
  blurSettings: ObsBlurSettings
  systemStatus: {
    biologicalClock: { heartRate: number; fatigueLevel: number }
    environment: { groundType: ObsGroundType; heelHeight: number }
    device: { holdingStyle: 'left' | 'right'; batteryLevel: number; temperature: number }
    motion: { entropy: number; motionState: 'normal' | 'burst' }
  }
}

export type ObsRealtimeDedupPhase = 'disconnected' | 'connected' | 'running' | 'stopping' | 'error'

export interface ObsRealtimeDedupState {
  phase: ObsRealtimeDedupPhase
  connected: boolean
  running: boolean
  currentScene: string | null
  selectedSourceUuid: string | null
  capabilities: ObsRealtimeDedupCapabilities
  message: string | null
}

export const DEFAULT_OBS_REALTIME_DEDUP_CONFIG: ObsRealtimeDedupConfig = {
  amplitude: 4,
  frequency: 5,
  rotationAmplitude: 0,
  safetyMinOffset: 30,
  safetyMaxOffset: 50,
  safetyVerticalArea: 0.85,
  safetyCooldownMin: 8,
  safetyCooldownMax: 15,
  focusWeight: 0.7,
  heartRateRange: [60, 100],
  breathRatio: 1.618,
  oxygenImpact: 0.2,
  muscleFatigue: 0.05,
  spasmProbability: 0.07,
  handDominance: [0.6, 0.4],
  floorMaterials: ['concrete', 'carpet', 'grass'],
  heelHeightRange: [0, 5],
  windSeed: 0,
  trajectoryConfuser: true,
  heartbeatSimulator: true,
  entropyController: 3.8,
  phaseRandomization: [0, 6.28],
  humanFactor: 0.75,
  imperfectFactor: 0.3,
  platformMode: '抖音夜间',
  entropyWindow: 5,
  heartbeatCoupling: 0.85,
  colorProbability: 5,
  gammaRange: [0, 0.01],
  contrastRange: [-0.1, 0.1],
  brightnessRange: [-0.1, 0.1],
  saturationRange: [-0.1, 0.1],
  hueShiftRange: [-0.1, 0.1],
  opacityRange: [98, 100],
  zoomBlurProbability: 5,
  samplesRange: [31, 33],
  blurMagnitudeRange: [0.3, 0.8],
  speedPercentRange: [0, 10],
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('OBS 实时去重配置必须是对象')
  }
  return value as Record<string, unknown>
}

function numberValue(
  source: Record<string, unknown>,
  key: keyof ObsRealtimeDedupConfig,
  fallback: number,
  options: { min?: number; max?: number; integer?: boolean } = {},
): number {
  const raw = source[key]
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isFinite(value)) throw new Error(`${String(key)} 必须是有限数字`)
  if (options.min !== undefined && value < options.min)
    throw new Error(`${String(key)} 不能小于 ${options.min}`)
  if (options.max !== undefined && value > options.max)
    throw new Error(`${String(key)} 不能大于 ${options.max}`)
  if (options.integer && !Number.isInteger(value)) throw new Error(`${String(key)} 必须是整数`)
  return value
}

function booleanValue(
  source: Record<string, unknown>,
  key: keyof ObsRealtimeDedupConfig,
  fallback: boolean,
): boolean {
  const raw = source[key]
  if (raw === undefined) return fallback
  if (typeof raw !== 'boolean') throw new Error(`${String(key)} 必须是布尔值`)
  return raw
}

function rangeValue(
  source: Record<string, unknown>,
  key: keyof ObsRealtimeDedupConfig,
  fallback: NumberRange,
  options: { min?: number; max?: number; integer?: boolean } = {},
  ordered = true,
): NumberRange {
  const raw = source[key]
  if (raw === undefined) return [...fallback]
  if (!Array.isArray(raw) || raw.length !== 2) throw new Error(`${String(key)} 必须包含两个数字`)
  const rangeSource = { min: raw[0], max: raw[1] }
  const minimum = numberValue(
    rangeSource,
    'min' as keyof ObsRealtimeDedupConfig,
    fallback[0],
    options,
  )
  const maximum = numberValue(
    rangeSource,
    'max' as keyof ObsRealtimeDedupConfig,
    fallback[1],
    options,
  )
  if (ordered && minimum > maximum) throw new Error(`${String(key)} 的最小值不能大于最大值`)
  return [minimum, maximum]
}

export function normalizeObsRealtimeDedupConfig(value: unknown): ObsRealtimeDedupConfig {
  const source = asRecord(value)
  const defaults = DEFAULT_OBS_REALTIME_DEDUP_CONFIG
  const floorMaterials = source.floorMaterials ?? defaults.floorMaterials
  if (
    !Array.isArray(floorMaterials) ||
    floorMaterials.length === 0 ||
    floorMaterials.some(item => !['concrete', 'carpet', 'grass'].includes(String(item)))
  ) {
    throw new Error('floorMaterials 至少要包含一种有效地面材质')
  }
  const platformMode = source.platformMode ?? defaults.platformMode
  if (typeof platformMode !== 'string' || !platformMode.trim())
    throw new Error('platformMode 不能为空')

  const normalized: ObsRealtimeDedupConfig = {
    amplitude: numberValue(source, 'amplitude', defaults.amplitude, { min: 0 }),
    frequency: Math.max(0.1, numberValue(source, 'frequency', defaults.frequency, { min: 0 })),
    rotationAmplitude: numberValue(source, 'rotationAmplitude', defaults.rotationAmplitude, {
      min: 0,
    }),
    safetyMinOffset: numberValue(source, 'safetyMinOffset', defaults.safetyMinOffset, { min: 0 }),
    safetyMaxOffset: numberValue(source, 'safetyMaxOffset', defaults.safetyMaxOffset, { min: 0 }),
    safetyVerticalArea: numberValue(source, 'safetyVerticalArea', defaults.safetyVerticalArea, {
      min: 0,
      max: 1,
    }),
    safetyCooldownMin: numberValue(source, 'safetyCooldownMin', defaults.safetyCooldownMin, {
      min: 0,
    }),
    safetyCooldownMax: numberValue(source, 'safetyCooldownMax', defaults.safetyCooldownMax, {
      min: 0,
    }),
    focusWeight: numberValue(source, 'focusWeight', defaults.focusWeight, { min: 0, max: 1 }),
    heartRateRange: rangeValue(source, 'heartRateRange', defaults.heartRateRange, { min: 1 }),
    breathRatio: numberValue(source, 'breathRatio', defaults.breathRatio, { min: 0.001 }),
    oxygenImpact: numberValue(source, 'oxygenImpact', defaults.oxygenImpact, { min: 0 }),
    muscleFatigue: numberValue(source, 'muscleFatigue', defaults.muscleFatigue, { min: 0 }),
    spasmProbability: numberValue(source, 'spasmProbability', defaults.spasmProbability, {
      min: 0,
      max: 1,
    }),
    handDominance: rangeValue(
      source,
      'handDominance',
      defaults.handDominance,
      { min: 0, max: 1 },
      false,
    ),
    floorMaterials: floorMaterials.map(item => String(item) as ObsGroundType),
    heelHeightRange: rangeValue(source, 'heelHeightRange', defaults.heelHeightRange, { min: 0 }),
    windSeed: numberValue(source, 'windSeed', defaults.windSeed, { integer: true }),
    trajectoryConfuser: booleanValue(source, 'trajectoryConfuser', defaults.trajectoryConfuser),
    heartbeatSimulator: booleanValue(source, 'heartbeatSimulator', defaults.heartbeatSimulator),
    entropyController: numberValue(source, 'entropyController', defaults.entropyController, {
      min: 0.001,
    }),
    phaseRandomization: rangeValue(source, 'phaseRandomization', defaults.phaseRandomization),
    humanFactor: numberValue(source, 'humanFactor', defaults.humanFactor, { min: 0 }),
    imperfectFactor: numberValue(source, 'imperfectFactor', defaults.imperfectFactor, { min: 0 }),
    platformMode: platformMode.trim(),
    entropyWindow: numberValue(source, 'entropyWindow', defaults.entropyWindow, { min: 1 }),
    heartbeatCoupling: numberValue(source, 'heartbeatCoupling', defaults.heartbeatCoupling, {
      min: 0,
    }),
    colorProbability: numberValue(source, 'colorProbability', defaults.colorProbability, {
      min: 0,
      max: 100,
    }),
    gammaRange: rangeValue(source, 'gammaRange', defaults.gammaRange),
    contrastRange: rangeValue(source, 'contrastRange', defaults.contrastRange),
    brightnessRange: rangeValue(source, 'brightnessRange', defaults.brightnessRange),
    saturationRange: rangeValue(source, 'saturationRange', defaults.saturationRange),
    hueShiftRange: rangeValue(source, 'hueShiftRange', defaults.hueShiftRange),
    opacityRange: rangeValue(source, 'opacityRange', defaults.opacityRange, { min: 0, max: 100 }),
    zoomBlurProbability: numberValue(source, 'zoomBlurProbability', defaults.zoomBlurProbability, {
      min: 0,
      max: 100,
    }),
    samplesRange: rangeValue(source, 'samplesRange', defaults.samplesRange, {
      min: 2,
      max: 100,
      integer: true,
    }),
    blurMagnitudeRange: rangeValue(source, 'blurMagnitudeRange', defaults.blurMagnitudeRange, {
      min: 0,
      max: 1,
    }),
    speedPercentRange: rangeValue(source, 'speedPercentRange', defaults.speedPercentRange, {
      min: 0,
      max: 100,
    }),
  }
  if (normalized.safetyMinOffset > normalized.safetyMaxOffset)
    throw new Error('safetyMinOffset 不能大于 safetyMaxOffset')
  if (normalized.safetyCooldownMin > normalized.safetyCooldownMax)
    throw new Error('safetyCooldownMin 不能大于 safetyCooldownMax')
  if (normalized.handDominance[0] + normalized.handDominance[1] <= 0)
    throw new Error('handDominance 至少要有一个正权重')
  return normalized
}
