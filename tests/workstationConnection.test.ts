import { describe, expect, it, vi } from 'vitest'
import {
  createVkWorkstationHandshake,
  requestWorkstationSignedUrl,
  WorkstationConnectionService,
  type WorkstationSignedUrl,
} from '../electron/main/services/WorkstationConnectionService'

const identity = {
  workstationId: 'workstation-001',
  machineLabel: '直播间 1',
}

const signed: WorkstationSignedUrl = {
  url: 'wss://example.com/socket',
  cloudObjectUrl: 'workstation/pub.connection',
  appid: 'oba-live-tool',
  channel: 'workstation',
}

function createLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }
}

class FakeSocket {
  private openListeners: Array<() => void> = []
  private closeListeners: Array<(code: number, reason: Buffer) => void> = []
  private errorListeners: Array<(error: Error) => void> = []
  readonly send = vi.fn()
  readonly close = vi.fn()
  readonly removeAllListeners = vi.fn(() => {
    this.openListeners = []
    this.closeListeners = []
    this.errorListeners = []
    return this
  })

  on(event: 'open', listener: () => void): this
  on(event: 'close', listener: (code: number, reason: Buffer) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  on(
    event: 'open' | 'close' | 'error',
    listener: (() => void) | ((code: number, reason: Buffer) => void) | ((error: Error) => void),
  ): this {
    if (event === 'open') this.openListeners.push(listener as () => void)
    if (event === 'close') {
      this.closeListeners.push(listener as (code: number, reason: Buffer) => void)
    }
    if (event === 'error') this.errorListeners.push(listener as (error: Error) => void)
    return this
  }

  emitOpen(): void {
    for (const listener of this.openListeners) listener()
  }

  emitClose(code = 1000, reason = ''): void {
    for (const listener of this.closeListeners) listener(code, Buffer.from(reason))
  }
}

async function waitForAsyncWork(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('requestWorkstationSignedUrl', () => {
  it('sends the shared key, 工作机 ID and machine label', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 0,
            ...signed,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )

    await expect(
      requestWorkstationSignedUrl(
        { signUrl: 'https://example.com/signedURL', accessKey: 'shared-key' },
        identity,
        fetchImpl,
      ),
    ).resolves.toEqual(signed)

    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://example.com/signedURL')
    expect(JSON.parse(String(init?.body))).toEqual({
      accessKey: 'shared-key',
      workstationId: 'workstation-001',
      machineLabel: '直播间 1',
    })
  })
})

describe('createVkWorkstationHandshake', () => {
  it('uses the 工作机 ID in both VK device fields and includes the machine label', () => {
    const handshake = createVkWorkstationHandshake(identity, signed)

    expect(handshake.deviceId).toBe(identity.workstationId)
    expect(handshake.data.clientInfo.deviceId).toBe(identity.workstationId)
    expect(handshake.data.data.vkWebSocket.data.machineLabel).toBe(identity.machineLabel)
    expect(handshake.data.url).toBe('workstation/pub.connection')
  })
})

describe('WorkstationConnectionService', () => {
  it('only logs a warning when build-time connection config is missing', async () => {
    const logger = createLogger()
    const createSocket = vi.fn(() => new FakeSocket())
    const service = new WorkstationConnectionService({
      config: { signUrl: '', accessKey: '' },
      getIdentity: () => identity,
      logger,
      requestSignedUrl: vi.fn(async () => signed),
      createSocket,
    })

    expect(() => service.start()).not.toThrow()
    await waitForAsyncWork()

    expect(logger.warn).toHaveBeenCalledOnce()
    expect(createSocket).not.toHaveBeenCalled()
  })

  it('sends the VK handshake after the socket opens', async () => {
    const logger = createLogger()
    const socket = new FakeSocket()
    const createSocket = vi.fn(() => socket)
    const requestSignedUrl = vi.fn(async () => signed)
    const service = new WorkstationConnectionService({
      config: { signUrl: 'https://example.com/signedURL', accessKey: 'shared-key' },
      getIdentity: () => identity,
      logger,
      requestSignedUrl,
      createSocket,
    })

    service.start()
    await waitForAsyncWork()
    socket.emitOpen()

    expect(requestSignedUrl).toHaveBeenCalledWith(
      { signUrl: 'https://example.com/signedURL', accessKey: 'shared-key' },
      identity,
    )
    expect(createSocket).toHaveBeenCalledWith(signed.url)
    expect(logger.info).toHaveBeenCalledWith('正在连接工作机服务：直播间 1（workstation-001）')
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify(createVkWorkstationHandshake(identity, signed)),
    )
    service.stop()
  })

  it('reconnects after close and bounds the retry delay at 15 seconds', async () => {
    const logger = createLogger()
    const timers: Array<{ callback: () => void; delay: number }> = []
    const setTimeoutFn = vi.fn((callback: (...args: never[]) => void, delay?: number) => {
      timers.push({ callback: () => callback(), delay: Number(delay) })
      return timers.length as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout
    const clearTimeoutFn = vi.fn() as unknown as typeof clearTimeout
    const requestSignedUrl = vi.fn(async () => {
      throw new Error('temporary failure')
    })
    const service = new WorkstationConnectionService({
      config: { signUrl: 'https://example.com/signedURL', accessKey: 'shared-key' },
      getIdentity: () => identity,
      logger,
      requestSignedUrl,
      createSocket: () => new FakeSocket(),
      setTimeoutFn,
      clearTimeoutFn,
    })

    service.start()
    await waitForAsyncWork()

    const delays: number[] = []
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const timer = timers.shift()
      expect(timer).toBeDefined()
      delays.push(timer?.delay ?? -1)
      timer?.callback()
      await waitForAsyncWork()
    }

    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 15_000, 15_000, 15_000])
    expect(requestSignedUrl).toHaveBeenCalledTimes(8)
    service.stop()
  })

  it('starts a new connection attempt after the socket closes', async () => {
    const logger = createLogger()
    let reconnectCallback: (() => void) | undefined
    const setTimeoutFn = vi.fn((callback: (...args: never[]) => void) => {
      reconnectCallback = () => callback()
      return 1 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout
    const sockets: FakeSocket[] = []
    const createSocket = vi.fn(() => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    })
    const requestSignedUrl = vi.fn(async () => signed)
    const service = new WorkstationConnectionService({
      config: { signUrl: 'https://example.com/signedURL', accessKey: 'shared-key' },
      getIdentity: () => identity,
      logger,
      requestSignedUrl,
      createSocket,
      setTimeoutFn,
      clearTimeoutFn: vi.fn() as unknown as typeof clearTimeout,
    })

    service.start()
    await waitForAsyncWork()
    sockets[0]?.emitOpen()
    sockets[0]?.emitClose(1006, 'reset')

    expect(setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), 1_000)
    reconnectCallback?.()
    await waitForAsyncWork()

    expect(requestSignedUrl).toHaveBeenCalledTimes(2)
    expect(createSocket).toHaveBeenCalledTimes(2)
    service.stop()
  })

  it('cancels a pending reconnect and prevents further connection attempts after stop', async () => {
    const logger = createLogger()
    let pendingCallback: (() => void) | undefined
    const timerToken = 101 as unknown as ReturnType<typeof setTimeout>
    const setTimeoutFn = vi.fn((callback: (...args: never[]) => void) => {
      pendingCallback = () => callback()
      return timerToken
    }) as typeof setTimeout
    const clearTimeoutFn = vi.fn() as unknown as typeof clearTimeout
    const socket = new FakeSocket()
    const requestSignedUrl = vi.fn(async () => signed)
    const service = new WorkstationConnectionService({
      config: { signUrl: 'https://example.com/signedURL', accessKey: 'shared-key' },
      getIdentity: () => identity,
      logger,
      requestSignedUrl,
      createSocket: () => socket,
      setTimeoutFn,
      clearTimeoutFn,
    })

    service.start()
    await waitForAsyncWork()
    socket.emitOpen()
    socket.emitClose(1006, 'reset')
    expect(setTimeoutFn).toHaveBeenCalledOnce()

    service.stop()
    expect(clearTimeoutFn).toHaveBeenCalledWith(timerToken)
    pendingCallback?.()
    await waitForAsyncWork()

    expect(requestSignedUrl).toHaveBeenCalledOnce()
  })
})
