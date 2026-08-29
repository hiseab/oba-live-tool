import OBSWebSocket from 'obs-websocket-js'
import type {
  ObsConnectionSnapshot,
  ObsRealtimeDedupCapabilities,
  ObsSceneItemTransform,
  ObsSourceInfo,
} from 'shared/obsRealtimeDedup'

export type ObsAdapterEvent = 'sceneChanged' | 'sceneItemRemoved' | 'disconnected'

export interface ObsAdapterEventPayload {
  sceneChanged: { sceneName: string }
  sceneItemRemoved: { sceneName: string; sceneItemId: number; sourceUuid: string }
  disconnected: { message: string }
}

export interface ObsRealtimeDedupAdapter {
  connect(): Promise<ObsConnectionSnapshot>
  disconnect(): Promise<void>
  refreshSources(): Promise<ObsConnectionSnapshot>
  setSceneItemTransform(
    sceneName: string,
    sceneItemId: number,
    transform: ObsSceneItemTransform,
  ): Promise<void>
  removeSourceFilter(sourceName: string, filterName: string): Promise<void>
  createSourceFilter(
    sourceName: string,
    filterName: string,
    filterKind: string,
    settings: Record<string, unknown>,
  ): Promise<void>
  setSourceFilterSettings(
    sourceName: string,
    filterName: string,
    settings: Record<string, unknown>,
  ): Promise<void>
  on<Event extends ObsAdapterEvent>(
    event: Event,
    listener: (payload: ObsAdapterEventPayload[Event]) => void,
  ): () => void
}

type ListenerMap = {
  [Event in ObsAdapterEvent]: Set<(payload: ObsAdapterEventPayload[Event]) => void>
}

const OBS_URL = 'ws://127.0.0.1:4455'

type ObsJsonValue = string | number | boolean | null | ObsJsonValue[] | ObsJsonObject
type ObsJsonObject = { [key: string]: ObsJsonValue }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function toJsonObject(value: unknown): ObsJsonObject {
  return JSON.parse(JSON.stringify(value)) as ObsJsonObject
}

function isMissingResource(error: unknown): boolean {
  const code = asNumber(asRecord(error).code)
  return code === 600 || /not found|does not exist/i.test(String(asRecord(error).message ?? error))
}

export class ObsWebSocketAdapter implements ObsRealtimeDedupAdapter {
  private readonly client = new OBSWebSocket()
  private connected = false
  private manualDisconnect = false
  private readonly listeners: ListenerMap = {
    sceneChanged: new Set(),
    sceneItemRemoved: new Set(),
    disconnected: new Set(),
  }

  constructor() {
    this.client.on('CurrentProgramSceneChanged', event => {
      this.emit('sceneChanged', { sceneName: event.sceneName })
    })
    this.client.on('SceneItemRemoved', event => {
      this.emit('sceneItemRemoved', {
        sceneName: event.sceneName,
        sceneItemId: event.sceneItemId,
        sourceUuid: event.sourceUuid,
      })
    })
    this.client.on('ConnectionClosed', error => {
      this.connected = false
      if (!this.manualDisconnect) this.emit('disconnected', { message: error.message })
    })
    this.client.on('ConnectionError', error => {
      this.connected = false
      if (!this.manualDisconnect) this.emit('disconnected', { message: error.message })
    })
  }

  async connect(): Promise<ObsConnectionSnapshot> {
    if (!this.connected) {
      this.manualDisconnect = false
      await this.client.connect(OBS_URL, '')
      this.connected = true
    }
    return this.refreshSources()
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return
    this.manualDisconnect = true
    try {
      await this.client.disconnect()
    } finally {
      this.connected = false
      this.manualDisconnect = false
    }
  }

  async refreshSources(): Promise<ObsConnectionSnapshot> {
    if (!this.connected) throw new Error('尚未连接 OBS')
    const scene = await this.client.call('GetCurrentProgramScene')
    const [itemList, filterKinds] = await Promise.all([
      this.client.call('GetSceneItemList', { sceneName: scene.sceneName }),
      this.client.call('GetSourceFilterKindList'),
    ])
    const sources = itemList.sceneItems
      .map(item => this.toSource(scene.sceneName, item))
      .filter((item): item is ObsSourceInfo => item !== null)
    const capabilities: ObsRealtimeDedupCapabilities = {
      colorFilter: filterKinds.sourceFilterKinds.includes('color_filter'),
      shaderFilter: filterKinds.sourceFilterKinds.includes('shader_filter'),
    }
    return { currentScene: scene.sceneName, sources, capabilities }
  }

  async setSceneItemTransform(
    sceneName: string,
    sceneItemId: number,
    transform: ObsSceneItemTransform,
  ): Promise<void> {
    await this.client.call('SetSceneItemTransform', {
      sceneName,
      sceneItemId,
      sceneItemTransform: toJsonObject(transform),
    })
  }

  async removeSourceFilter(sourceName: string, filterName: string): Promise<void> {
    try {
      await this.client.call('RemoveSourceFilter', { sourceName, filterName })
    } catch (error) {
      if (!isMissingResource(error)) throw error
    }
  }

  async createSourceFilter(
    sourceName: string,
    filterName: string,
    filterKind: string,
    settings: Record<string, unknown>,
  ): Promise<void> {
    await this.client.call('CreateSourceFilter', {
      sourceName,
      filterName,
      filterKind,
      filterSettings: toJsonObject(settings),
    })
  }

  async setSourceFilterSettings(
    sourceName: string,
    filterName: string,
    settings: Record<string, unknown>,
  ): Promise<void> {
    await this.client.call('SetSourceFilterSettings', {
      sourceName,
      filterName,
      filterSettings: toJsonObject(settings),
      overlay: true,
    })
  }

  on<Event extends ObsAdapterEvent>(
    event: Event,
    listener: (payload: ObsAdapterEventPayload[Event]) => void,
  ): () => void {
    const listeners = this.listeners[event] as Set<(payload: ObsAdapterEventPayload[Event]) => void>
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  private toSource(sceneName: string, value: unknown): ObsSourceInfo | null {
    const item = asRecord(value)
    const sourceUuid = asString(item.sourceUuid)
    const sourceName = asString(item.sourceName)
    const sceneItemId = asNumber(item.sceneItemId)
    if (!sourceUuid || !sourceName || sceneItemId < 0) return null
    return {
      sceneName,
      sourceName,
      sourceUuid,
      sourceType: asString(item.sourceType),
      inputKind: asString(item.inputKind) || null,
      sceneItemId,
      sceneItemTransform: asRecord(item.sceneItemTransform) as ObsSceneItemTransform,
    }
  }

  private emit<Event extends ObsAdapterEvent>(
    event: Event,
    payload: ObsAdapterEventPayload[Event],
  ): void {
    const listeners = this.listeners[event] as Set<(payload: ObsAdapterEventPayload[Event]) => void>
    for (const listener of listeners) listener(payload)
  }
}
