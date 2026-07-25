import net from 'node:net'
import type { PopupAlarmConnectionTarget, PopupAlarmConnectionTestResult } from 'shared/popupAlarm'

const MAX_RESPONSE_BYTES = 4_096
const DEFAULT_TIMEOUT_MS = 5_000

export interface PopupAlarmStateMessage extends PopupAlarmConnectionTarget {
  clientId: string
  alarmId: string
  machineLabel: string
  popupActive: boolean
}

interface ServerResponse {
  ok?: boolean
  message?: string
  serverVersion?: string
}

export class PopupAlarmNetworkClient {
  private sockets = new Set<net.Socket>()

  constructor(private readonly timeoutMs = DEFAULT_TIMEOUT_MS) {}

  async sendAlarmState(message: PopupAlarmStateMessage): Promise<void> {
    const { serverHost, serverPort, ...payload } = message
    await this.request(serverHost, serverPort, { version: 1, type: 'alarmState', ...payload })
  }

  async testConnection(
    target: PopupAlarmConnectionTarget,
    clientId: string,
  ): Promise<PopupAlarmConnectionTestResult> {
    try {
      const response = await this.request(target.serverHost, target.serverPort, {
        version: 1,
        type: 'ping',
        clientId,
      })
      return {
        success: true,
        message: `已连接报警服务器 ${target.serverHost}:${target.serverPort}`,
        serverVersion: response.serverVersion,
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  stop(): void {
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()
  }

  private request(host: string, port: number, payload: object): Promise<ServerResponse> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port })
      this.sockets.add(socket)
      let settled = false
      let response = ''

      const finish = (error?: Error, result?: ServerResponse) => {
        if (settled) return
        settled = true
        this.sockets.delete(socket)
        socket.destroy()
        if (error) reject(error)
        else resolve(result ?? {})
      }

      socket.setTimeout(this.timeoutMs)
      socket.setEncoding('utf8')
      socket.once('connect', () => socket.write(`${JSON.stringify(payload)}\n`))
      socket.on('data', chunk => {
        response += chunk
        if (Buffer.byteLength(response, 'utf8') > MAX_RESPONSE_BYTES) {
          finish(new Error('报警服务器返回内容过大'))
          return
        }
        const lineEnd = response.indexOf('\n')
        if (lineEnd < 0) return
        try {
          const parsed = JSON.parse(response.slice(0, lineEnd)) as ServerResponse
          if (!parsed.ok) finish(new Error(parsed.message || '报警服务器拒绝了请求'))
          else finish(undefined, parsed)
        } catch {
          finish(new Error('报警服务器返回了无效数据'))
        }
      })
      socket.once('timeout', () => finish(new Error('连接报警服务器超时')))
      socket.once('error', error => finish(new Error(`连接报警服务器失败：${error.message}`)))
      socket.once('close', () => {
        if (!settled) finish(new Error('报警服务器在应答前关闭了连接'))
      })
    })
  }
}
