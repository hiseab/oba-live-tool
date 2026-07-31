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
  send(data: string): void
  close(): void
  removeAllListeners(): this
}

type ConnectionLogger = Pick<ScopedLogger, 'debug' | 'info' | 'warn' | 'error' | 'success'>
type RequestSignedUrl = (
  config: WorkstationConnectionConfig,
  identity: WorkstationIdentity,
) => Promise<WorkstationSignedUrl>

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

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}缺失`)
  return value.trim()
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

export function createVkWorkstationHandshake(
  identity: WorkstationIdentity,
  signed: WorkstationSignedUrl,
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
      data: {
        vkWebSocket: {
          type: 'connect',
          data: {
            machineLabel: identity.machineLabel,
          },
        },
      },
    },
  }
}

export class WorkstationConnectionService {
  private active = false
  private connecting = false
  private socket: SocketLike | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private generation = 0
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
    this.dependencies.logger.info('工作机连接已停止')
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
        this.reconnectAttempt = 0
        socket.send(JSON.stringify(createVkWorkstationHandshake(identity, signed)))
        this.dependencies.logger.success(
          `工作机连接成功：${identity.machineLabel}（${identity.workstationId}）`,
        )
      })

      socket.on('error', error => {
        this.dependencies.logger.error('工作机连接错误', error)
      })

      socket.on('close', (code, reason) => {
        if (this.socket === socket) this.socket = null
        this.connecting = false
        const reasonText = reason?.toString() || ''
        this.dependencies.logger.warn(
          `工作机连接已断开（${code}${reasonText ? `: ${reasonText}` : ''}）`,
        )
        this.scheduleReconnect(generation)
      })
    } catch (error) {
      this.connecting = false
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
