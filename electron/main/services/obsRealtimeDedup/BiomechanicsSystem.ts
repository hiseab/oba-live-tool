import type {
  ObsGroundType,
  ObsRealtimeDedupConfig,
  ObsRealtimeDedupStatus,
} from 'shared/obsRealtimeDedup'

export interface RandomSource {
  next(): number
}

export interface BiomechanicsDependencies {
  now?: () => number
  random?: RandomSource
}

export interface MotionOutput {
  x: number
  y: number
  rotation: number
  status: ObsRealtimeDedupStatus['systemStatus']
}

class MathRandomSource implements RandomSource {
  next(): number {
    return Math.random()
  }
}

class LowPassFilter {
  private value = 0
  private initialized = false

  constructor(private readonly cutoff: number) {}

  update(input: number, deltaTime: number): number {
    if (!this.initialized) {
      this.initialized = true
      this.value = input
      return input
    }
    const rc = 1 / (Math.PI * 2 * this.cutoff)
    const alpha = deltaTime / (rc + deltaTime)
    this.value += alpha * (input - this.value)
    return this.value
  }
}

class BandPassFilter {
  private readonly lowEdge: LowPassFilter
  private readonly highEdge: LowPassFilter

  constructor(low: number, high: number) {
    this.lowEdge = new LowPassFilter(low)
    this.highEdge = new LowPassFilter(high)
  }

  update(input: number, deltaTime: number): number {
    return this.highEdge.update(input, deltaTime) - this.lowEdge.update(input, deltaTime)
  }
}

const GROUND_FACTOR: Record<ObsGroundType, number> = {
  concrete: 0.3,
  carpet: 0.6,
  grass: 0.8,
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount
}

function fade(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10)
}

function hashNoise(seed: number, index: number): number {
  const value = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453
  return (value - Math.floor(value)) * 2 - 1
}

function smoothNoise(seed: number, x: number): number {
  const left = Math.floor(x)
  const amount = fade(x - left)
  return lerp(hashNoise(seed, left), hashNoise(seed, left + 1), amount)
}

function octaveNoise(seed: number, x: number): number {
  const first = smoothNoise(seed, x)
  const second = smoothNoise(seed + 31, x * 2) * 0.5
  return (first + second) / 1.5
}

function shannonEntropy(history: Array<{ x: number; y: number }>): number {
  if (history.length < 2) return 0
  const bins = new Array<number>(10).fill(0)
  for (const point of history) {
    const magnitude = clamp(Math.hypot(point.x, point.y), 0, 1)
    const index = Math.min(bins.length - 1, Math.floor(magnitude * bins.length))
    bins[index] += 1
  }
  let entropy = 0
  for (const count of bins) {
    if (count === 0) continue
    const probability = count / history.length
    entropy -= probability * Math.log2(probability)
  }
  return entropy
}

export class BiomechanicsSystem {
  private config: ObsRealtimeDedupConfig
  private readonly now: () => number
  private readonly random: RandomSource
  private readonly startedAt: number
  private heartRate: number
  private heartbeatPhase: number
  private breathPhase: number
  private fatigueLevel: number
  private readonly groundType: ObsGroundType
  private readonly heelHeight: number
  private readonly holdingStyle: 'left' | 'right'
  private batteryLevel: number
  private temperature: number
  private lastMajorMovement: number
  private nextMajorMovementDelay: number
  private motionState: 'normal' | 'burst' = 'normal'
  private motionHistory: Array<{ x: number; y: number }> = []
  private lowPassX = new LowPassFilter(0.1)
  private lowPassY = new LowPassFilter(0.1)
  private bandPassX = new BandPassFilter(0.1, 0.3)
  private bandPassY = new BandPassFilter(0.1, 0.3)
  private spareNormal: number | null = null

  constructor(config: ObsRealtimeDedupConfig, dependencies: BiomechanicsDependencies = {}) {
    this.config = config
    this.now = dependencies.now ?? (() => performance.now() / 1000)
    this.random = dependencies.random ?? new MathRandomSource()
    this.startedAt = this.now()
    this.heartRate = this.uniform(config.heartRateRange[0], config.heartRateRange[1])
    this.heartbeatPhase = this.uniform(config.phaseRandomization[0], config.phaseRandomization[1])
    this.breathPhase = this.uniform(0, Math.PI * 2)
    this.fatigueLevel = config.muscleFatigue
    this.groundType = this.pick(config.floorMaterials)
    this.heelHeight = this.uniform(config.heelHeightRange[0], config.heelHeightRange[1])
    this.holdingStyle =
      this.random.next() <
      config.handDominance[0] / Math.max(0.001, config.handDominance[0] + config.handDominance[1])
        ? 'left'
        : 'right'
    this.batteryLevel = this.uniform(60, 100)
    this.temperature = this.uniform(29, 34)
    this.lastMajorMovement = this.startedAt
    this.nextMajorMovementDelay = this.uniform(config.safetyCooldownMin, config.safetyCooldownMax)
  }

  updateConfig(config: ObsRealtimeDedupConfig): void {
    this.config = config
  }

  update(deltaTime: number): MotionOutput {
    const safeDelta = clamp(deltaTime, 0.001, 10)
    this.updateBiologicalClock(safeDelta)
    this.updateDeviceState(safeDelta)

    const high = this.calculateHighFrequencyNoise(safeDelta)
    const biological = this.calculateBiologicalMotion(safeDelta)
    const environmental = this.calculateEnvironmentalMotion()

    let x = high.x + biological.x + environmental.x
    let y = high.y + biological.y + environmental.y
    ;({ x, y } = this.applySpasm(x, y, safeDelta))
    ;({ x, y } = this.applySafetyLimits(x, y))
    ;({ x, y } = this.adjustForEntropy(x, y))

    x = this.lowPassX.update(x, safeDelta)
    y = this.lowPassY.update(y, safeDelta)
    const magnitude = Math.hypot(x, y)
    if (magnitude > 1) {
      x /= magnitude
      y /= magnitude
    }

    const maximumHistory = Math.max(20, Math.round(this.config.entropyWindow * 20))
    this.motionHistory.push({ x, y })
    if (this.motionHistory.length > maximumHistory) {
      this.motionHistory.splice(0, this.motionHistory.length - maximumHistory)
    }

    return {
      x,
      y,
      rotation: Math.atan2(y, x) / Math.PI,
      status: {
        biologicalClock: {
          heartRate: this.heartRate,
          fatigueLevel: this.fatigueLevel,
        },
        environment: {
          groundType: this.groundType,
          heelHeight: this.heelHeight,
        },
        device: {
          holdingStyle: this.holdingStyle,
          batteryLevel: this.batteryLevel,
          temperature: this.temperature,
        },
        motion: {
          entropy: shannonEntropy(this.motionHistory),
          motionState: this.motionState,
        },
      },
    }
  }

  private updateBiologicalClock(deltaTime: number): void {
    this.fatigueLevel = clamp(
      this.fatigueLevel + this.config.muscleFatigue * 0.001 * deltaTime,
      0,
      1,
    )
    const target = (this.config.heartRateRange[0] + this.config.heartRateRange[1]) / 2
    this.heartRate += (target - this.heartRate) * 0.01 * deltaTime + this.normal(0, 0.01)
    this.heartRate = clamp(
      this.heartRate,
      this.config.heartRateRange[0],
      this.config.heartRateRange[1],
    )
  }

  private updateDeviceState(deltaTime: number): void {
    this.batteryLevel = clamp(this.batteryLevel - deltaTime * 0.0005, 0, 100)
    this.temperature = clamp(this.temperature + this.normal(0, 0.005), 20, 45)
  }

  private calculateBiologicalMotion(deltaTime: number): { x: number; y: number } {
    const breathsPerMinute = this.heartRate / this.config.breathRatio
    const breathFrequency = breathsPerMinute / 60
    this.breathPhase += Math.PI * 2 * breathFrequency * deltaTime
    this.heartbeatPhase += Math.PI * 2 * (this.heartRate / 60) * deltaTime

    const breathX = Math.sin(this.breathPhase) * 0.3
    const breathY = Math.cos(this.breathPhase) * 0.6
    const heartbeat = this.config.heartbeatSimulator
      ? Math.sin(this.heartbeatPhase) * this.config.oxygenImpact * this.config.heartbeatCoupling
      : 0
    const fatigueFactor = 1 + this.fatigueLevel
    return {
      x: breathX * fatigueFactor,
      y: (breathY + heartbeat) * fatigueFactor,
    }
  }

  private calculateHighFrequencyNoise(deltaTime: number): { x: number; y: number } {
    const tremorStrength =
      0.01 + this.config.muscleFatigue * 0.1 + this.config.imperfectFactor * 0.05
    let x = this.normal(0, tremorStrength)
    let y = this.normal(0, tremorStrength)
    if (this.config.trajectoryConfuser) {
      x += this.bandPassX.update(this.uniform(-0.1, 0.1), deltaTime)
      y += this.bandPassY.update(this.uniform(-0.1, 0.1), deltaTime)
    }
    return { x, y }
  }

  private calculateEnvironmentalMotion(): { x: number; y: number } {
    const elapsed = this.now() - this.startedAt
    const groundFactor = GROUND_FACTOR[this.groundType]
    const heelFactor = 1 + this.heelHeight / 20
    const windX = octaveNoise(this.config.windSeed, elapsed * 0.1)
    const windY = octaveNoise(this.config.windSeed + 50, elapsed * 0.1)
    return {
      x: windX * groundFactor * heelFactor,
      y: windY * groundFactor,
    }
  }

  private applySpasm(x: number, y: number, deltaTime: number): { x: number; y: number } {
    const now = this.now()
    const cooldownReady = now - this.lastMajorMovement >= this.nextMajorMovementDelay
    let nextX = x
    let nextY = y
    this.motionState = 'normal'
    if (cooldownReady && this.random.next() < this.config.spasmProbability * deltaTime) {
      const direction = this.random.next() < 0.5 ? -1 : 1
      const burst = this.uniform(this.config.safetyMinOffset, this.config.safetyMaxOffset)
      nextX += direction * burst
      nextY += this.uniform(-1, 1) * burst * this.config.safetyVerticalArea
      this.lastMajorMovement = now
      this.nextMajorMovementDelay = this.uniform(
        this.config.safetyCooldownMin,
        this.config.safetyCooldownMax,
      )
      this.motionState = 'burst'
    }
    return {
      x: nextX * this.config.focusWeight,
      y: nextY * this.config.focusWeight,
    }
  }

  private applySafetyLimits(x: number, y: number): { x: number; y: number } {
    const maximum = Math.max(1, this.config.safetyMaxOffset)
    return {
      x: clamp(x / maximum, -1, 1),
      y: clamp(y / maximum, -1, 1),
    }
  }

  private adjustForEntropy(x: number, y: number): { x: number; y: number } {
    const entropy = shannonEntropy(this.motionHistory)
    const target = this.config.entropyController
    if (entropy < target) {
      const strength = Math.min((target - entropy) / target, 1)
      return {
        x: x + this.normal(0, 0.1 * strength),
        y: y + this.normal(0, 0.1 * strength),
      }
    }
    if (entropy > target * 1.2) return { x: x * 0.9, y: y * 0.9 }
    return { x, y }
  }

  private uniform(minimum: number, maximum: number): number {
    return minimum + (maximum - minimum) * this.random.next()
  }

  private pick<T>(items: T[]): T {
    return items[Math.min(items.length - 1, Math.floor(this.random.next() * items.length))] as T
  }

  private normal(mean: number, deviation: number): number {
    if (this.spareNormal !== null) {
      const value = this.spareNormal
      this.spareNormal = null
      return mean + value * deviation
    }
    const first = Math.max(Number.EPSILON, this.random.next())
    const second = this.random.next()
    const magnitude = Math.sqrt(-2 * Math.log(first))
    const angle = Math.PI * 2 * second
    this.spareNormal = magnitude * Math.sin(angle)
    return mean + magnitude * Math.cos(angle) * deviation
  }
}
