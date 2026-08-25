import type {
  ProductChangeClientState,
  ProductChangeErrorMessage,
  ProductChangeRecord,
  ProductChangeSnapshot,
} from 'shared/productChange'
import WebSocket from 'ws'
import type { ScopedLogger } from '#/logger'

export interface WorkstationConnectionConfig {
  signUrl: string
  accessKey: string
}

export interface WorkstationIdentity {
  workstationId: string
  machineLabel: string
}

export interface WorkstationSignedUrl {
  url: string
  cloudObjectUrl: string
  appid: string
  channel: string
}

interface SocketLike {
  on(event: 'open', listener: () => void): this
  on(event: 'close', listener: (code: number, reason: Buffer) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  on(event: 'message', listener: (data: unknown) => void): this
  send(data: string): void
  close(): void
  removeAllListeners(): this
}

type ConnectionLogger = Pick<ScopedLogger, 'debug' | 'info' | 'warn' | 'error' | 'success'>
type RequestSignedUrl = (
  config: WorkstationConnectionConfig,
  identity: WorkstationIdentity,
) => Promise<WorkstationSignedUrl>
type StateListener = (state: ProductChangeClientState) => void
type ErrorListener = (error: ProductChangeErrorMessage) => void

export interface WorkstationConnectionDependencies {
  config: WorkstationConnectionConfig
  getIdentity: () => WorkstationIdentity
  logger: ConnectionLogger
  requestSignedUrl?: RequestSignedUrl
  createSocket?: (url: string) => SocketLike
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
}

const RECONNECT_DELAYS = [1_000, 2_000, 4_000, 8_000, 15_000]
const EMPTY_SNAPSHOT: ProductChangeSnapshot = {
  currentStatus: 'normal',
  activeChangeId: '',
  changes: [],
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}缺失`)
  return value.trim()
}

function nullableTime(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseRecord(value: unknown): ProductChangeRecord | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (
    typeof record.id !== 'string' ||
    typeof record.workstationId !== 'string' ||
    !['requested', 'assigned', 'completed'].includes(String(record.status))
  ) {
    return null
  }
  const product = record.product && typeof record.product === 'object' ? record.product : null
  return {
    id: record.id,
    workstationId: record.workstationId,
    status: record.status as ProductChangeRecord['status'],
    productId: typeof record.productId === 'string' ? record.productId : '',
    assignedBy: typeof record.assignedBy === 'string' ? record.assignedBy : '',
    requestedAt: nullableTime(record.requestedAt),
    assignedAt: nullableTime(record.assignedAt),
    completedAt: nullableTime(record.completedAt),
    product: product as ProductChangeRecord['product'],
  }
}

export function parseProductChangeSnapshot(value: unknown): ProductChangeSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  const currentStatus = String(input.currentStatus || '')
  if (!['normal', 'requested', 'assigned', 'completed'].includes(currentStatus)) return null
  const changes = Array.isArray(input.changes)
    ? input.changes.map(parseRecord).filter((item): item is ProductChangeRecord => Boolean(item))
    : []
  return {
    currentStatus: currentStatus as ProductChangeSnapshot['currentStatus'],
    activeChangeId: typeof input.activeChangeId === 'string' ? input.activeChangeId : '',
    changes,
  }
}

function messageToString(value: unknown): string {
  if (typeof value === 'string') return value
  if (Buffer.isBuffer(value)) return value.toString('utf8')
  if (value instanceof ArrayBuffer) return Buffer.from(value).toString('utf8')
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('utf8')
  }
  return String(value ?? '')
}

export function getWorkstationConnectionBuildConfig(): WorkstationConnectionConfig {
  const signUrl =
    typeof __OBA_WORKSTATION_WS_SIGN_URL__ !== 'undefined'
      ? __OBA_WORKSTATION_WS_SIGN_URL__
      : process.env.OBA_WORKSTATION_WS_SIGN_URL || ''
  const accessKey =
    typeof __OBA_WORKSTATION_WS_ACCESS_KEY__ !== 'undefined'
      ? __OBA_WORKSTATION_WS_ACCESS_KEY__
      : process.env.OBA_WORKSTATION_WS_ACCESS_KEY || ''
  return { signUrl: signUrl.trim(), accessKey }
}

export async function requestWorkstationSignedUrl(
  config: WorkstationConnectionConfig,
  identity: WorkstationIdentity,
  fetchImpl: typeof fetch = fetch,
): Promise<WorkstationSignedUrl> {
  const response = await fetchImpl(config.signUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json;charset=utf-8' },
    body: JSON.stringify({
      accessKey: config.accessKey,
      workstationId: identity.workstationId,
      machineLabel: identity.machineLabel,
    }),
  })

  if (!response.ok) throw new Error(`签名地址请求失败（HTTP ${response.status}）`)
  const body = (await response.json()) as Record<string, unknown>
  const payload =
    body.data && typeof body.data === 'object' && 'code' in body.data
      ? (body.data as Record<string, unknown>)
      : body
  if (payload.code !== 0) {
    throw new Error(typeof payload.msg === 'string' ? payload.msg : '签名地址请求失败')
  }

  return {
    url: requiredString(payload.url, 'WebSocket 地址'),
    cloudObjectUrl: requiredString(payload.cloudObjectUrl, '云对象地址'),
    appid: requiredString(payload.appid, 'appid'),
    channel: requiredString(payload.channel, '连接频道'),
  }
}

function createVkEnvelope(
  identity: WorkstationIdentity,
  signed: WorkstationSignedUrl,
  businessPayload: Record<string, unknown>,
) {
  return {
    deviceId: identity.workstationId,
    data: {
      url: signed.cloudObjectUrl,
      channel: signed.channel,
      clientInfo: {
        deviceId: identity.workstationId,
        appid: signed.appid,
        platform: 'windows',
        locale: 'zh-CN',
        os: 'windows',
        userAgent: 'oba-live-tool',
      },
      data: businessPayload,
    },
  }
}

export function createVkWorkstationHandshake(
  identity: WorkstationIdentity,
  signed: WorkstationSignedUrl,
) {
  return createVkEnvelope(identity, signed, {
    vkWebSocket: {
      type: 'connect',
      data: { machineLabel: identity.machineLabel },
    },
  })
}

export function createVkWorkstationBusinessMessage(
  identity: WorkstationIdentity,
  signed: WorkstationSignedUrl,
  businessPayload: Record<string, unknown>,
) {
  return createVkEnvelope(identity, signed, businessPayload)
}

export class WorkstationConnectionService {
  private active = false
  private connecting = false
  private connected = false
  private socket: SocketLike | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private generation = 0
  private currentIdentity: WorkstationIdentity | null = null
  private currentSigned: WorkstationSignedUrl | null = null
  private snapshot: ProductChangeSnapshot = EMPTY_SNAPSHOT
  private readonly stateListeners = new Set<StateListener>()
  private readonly errorListeners = new Set<ErrorListener>()
  private readonly requestSignedUrl: RequestSignedUrl
  private readonly createSocket: (url: string) => SocketLike
  private readonly setTimeoutFn: typeof setTimeout
  private readonly clearTimeoutFn: typeof clearTimeout

  constructor(private readonly dependencies: WorkstationConnectionDependencies) {
    this.requestSignedUrl = dependencies.requestSignedUrl || requestWorkstationSignedUrl
    this.createSocket = dependencies.createSocket || (url => new WebSocket(url))
    this.setTimeoutFn = dependencies.setTimeoutFn || setTimeout
    this.clearTimeoutFn = dependencies.clearTimeoutFn || clearTimeout
  }

  start(): void {
    if (this.active || this.connecting || this.socket) return
    const { signUrl, accessKey } = this.dependencies.config
    if (!signUrl || !accessKey) {
      this.dependencies.logger.warn(
        '未配置 OBA_WORKSTATION_WS_SIGN_URL 或 OBA_WORKSTATION_WS_ACCESS_KEY，工作机连接已停用',
      )
      return
    }

    this.active = true
    this.generation += 1
    void this.connect(this.generation)
  }

  stop(): void {
    if (!this.active && !this.connecting && !this.socket && !this.reconnectTimer) return
    this.active = false
    this.connecting = false
    this.connected = false
    this.currentIdentity = null
    this.currentSigned = null
    this.generation += 1
    this.reconnectAttempt = 0
    if (this.reconnectTimer) {
      this.clearTimeoutFn(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.socket) {
      const socket = this.socket
      this.socket = null
      socket.removeAllListeners()
      socket.close()
    }
    this.emitState()
    this.dependencies.logger.info('工作机连接已停止')
  }

  isConnected(): boolean {
    return this.connected
  }

  getState(): ProductChangeClientState {
    return { connected: this.connected, snapshot: this.snapshot }
  }

  getSnapshot(): ProductChangeSnapshot {
    return this.snapshot
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  onProductChangeError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }

  requestProductChange(): void {
    this.sendBusinessMessage({ type: 'product_change.request' })
    this.dependencies.logger.info('已上报商品更换请求')
  }

  completeProductChange(changeId: string): void {
    const normalizedId = requiredString(changeId, '商品更换记录 ID')
    this.sendBusinessMessage({ type: 'product_change.complete', changeId: normalizedId })
    this.dependencies.logger.info(`已上报商品更换成功：${normalizedId}`)
  }

  syncProductChanges(): void {
    this.sendBusinessMessage({ type: 'product_change.sync' })
  }

  sendBusinessMessage(payload: Record<string, unknown>): void {
    if (!this.connected || !this.socket || !this.currentIdentity || !this.currentSigned) {
      throw new Error('工作机 WebSocket 未连接')
    }
    this.socket.send(
      JSON.stringify(
        createVkWorkstationBusinessMessage(this.currentIdentity, this.currentSigned, payload),
      ),
    )
  }

  private emitState(): void {
    const state = this.getState()
    for (const listener of this.stateListeners) listener(state)
  }

  private emitError(error: ProductChangeErrorMessage): void {
    for (const listener of this.errorListeners) listener(error)
  }

  private handleMessage(raw: unknown): void {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(messageToString(raw)) as Record<string, unknown>
    } catch {
      this.dependencies.logger.warn('收到无法解析的工作机服务消息')
      return
    }

    if (message.vkWebSocket) {
      this.dependencies.logger.debug('收到 VK WebSocket 系统消息', message.vkWebSocket)
      return
    }

    if (message.type === 'product_change.snapshot') {
      const nextSnapshot = parseProductChangeSnapshot(message.data)
      if (!nextSnapshot) {
        this.dependencies.logger.warn('收到无效的商品更换状态快照')
        return
      }
      const previousAssigned = this.snapshot.changes.find(item => item.status === 'assigned')
      const nextAssigned = nextSnapshot.changes.find(item => item.status === 'assigned')
      this.snapshot = nextSnapshot
      if (
        nextAssigned &&
        (!previousAssigned ||
          previousAssigned.id !== nextAssigned.id ||
          previousAssigned.productId !== nextAssigned.productId)
      ) {
        this.dependencies.logger.success(
          `收到商品关联：${nextAssigned.product?.name || nextAssigned.productId || nextAssigned.id}`,
        )
      } else {
        this.dependencies.logger.debug('商品更换状态已同步')
      }
      this.emitState()
      return
    }

    if (message.type === 'product_change.error') {
      const data = message.data && typeof message.data === 'object' ? message.data : {}
      const error = {
        operation:
          typeof (data as Record<string, unknown>).operation === 'string'
            ? String((data as Record<string, unknown>).operation)
            : '',
        message:
          typeof (data as Record<string, unknown>).message === 'string'
            ? String((data as Record<string, unknown>).message)
            : '商品更换操作失败',
      }
      this.dependencies.logger.error(`商品更换操作失败：${error.message}`)
      this.emitError(error)
      return
    }

    this.dependencies.logger.debug('收到未处理的工作机服务消息', message)
  }

  private async connect(generation: number): Promise<void> {
    if (!this.active || this.connecting || this.socket || generation !== this.generation) return
    this.connecting = true

    let identity: WorkstationIdentity
    try {
      identity = this.dependencies.getIdentity()
      this.dependencies.logger.info(
        `正在连接工作机服务：${identity.machineLabel}（${identity.workstationId}）`,
      )
      const signed = await this.requestSignedUrl(this.dependencies.config, identity)
      if (!this.active || generation !== this.generation) return

      const socket = this.createSocket(signed.url)
      this.socket = socket

      socket.on('open', () => {
        if (!this.active || generation !== this.generation || this.socket !== socket) {
          socket.close()
          return
        }
        this.connecting = false
        this.connected = true
        this.currentIdentity = identity
        this.currentSigned = signed
        this.reconnectAttempt = 0
        socket.send(JSON.stringify(createVkWorkstationHandshake(identity, signed)))
        this.dependencies.logger.success(
          `工作机连接成功：${identity.machineLabel}（${identity.workstationId}）`,
        )
        this.emitState()
        this.syncProductChanges()
      })

      socket.on('message', data => this.handleMessage(data))

      socket.on('error', error => {
        this.dependencies.logger.error('工作机连接错误', error)
      })

      socket.on('close', (code, reason) => {
        if (this.socket === socket) this.socket = null
        this.connecting = false
        this.connected = false
        this.currentIdentity = null
        this.currentSigned = null
        this.emitState()
        const reasonText = reason?.toString() || ''
        this.dependencies.logger.warn(
          `工作机连接已断开（${code}${reasonText ? `: ${reasonText}` : ''}）`,
        )
        this.scheduleReconnect(generation)
      })
    } catch (error) {
      this.connecting = false
      this.connected = false
      this.emitState()
      this.dependencies.logger.error('工作机连接失败', error)
      this.scheduleReconnect(generation)
    }
  }

  private scheduleReconnect(generation: number): void {
    if (!this.active || generation !== this.generation || this.reconnectTimer) return
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)]
    this.reconnectAttempt += 1
    this.dependencies.logger.info(`${delay / 1000} 秒后重新连接工作机服务`)
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = null
      void this.connect(generation)
    }, delay)
  }
}
