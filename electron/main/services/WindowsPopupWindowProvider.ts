import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'

const WINDOW_ENUMERATION_SCRIPT = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class PopupWindowDetector
{
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxLength);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int GetWindowTextLength(IntPtr hWnd);

    public static bool HasMatchingWindow()
    {
        bool found = false;
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam)
        {
            if (!IsWindowVisible(hWnd)) return true;

            int length = GetWindowTextLength(hWnd);
            if (length <= 0) return true;

            StringBuilder title = new StringBuilder(length + 1);
            GetWindowText(hWnd, title, title.Capacity);
            if (title.ToString().Trim().Contains("人机交互"))
            {
                found = true;
                return false;
            }

            return true;
        }, IntPtr.Zero);
        return found;
    }
}
"@

while (($command = [Console]::In.ReadLine()) -ne $null) {
  if ($command -eq 'scan') {
    try {
      if ([PopupWindowDetector]::HasMatchingWindow()) {
        [Console]::Out.WriteLine('1')
      }
      else {
        [Console]::Out.WriteLine('0')
      }
      [Console]::Out.Flush()
    }
    catch {
      [Console]::Error.WriteLine($_.Exception.ToString())
      [Console]::Out.WriteLine('E')
      [Console]::Out.Flush()
    }
  }
  elseif ($command -eq 'quit') {
    break
  }
}
`.trim()

const ENCODED_WINDOW_ENUMERATION_SCRIPT = Buffer.from(
  WINDOW_ENUMERATION_SCRIPT,
  'utf16le',
).toString('base64')

export interface WindowsPopupWindowProviderLogger {
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
  debug?(message: string, ...args: unknown[]): void
}

interface PendingScan {
  resolve(sources: { name: string }[]): void
  reject(error: Error): void
  timeout: ReturnType<typeof setTimeout>
}

export class WindowsPopupWindowProvider {
  private child: ChildProcessWithoutNullStreams | null = null
  private pendingScan: PendingScan | null = null
  private stdoutBuffer = ''
  private stderrBuffer = ''

  constructor(
    private readonly logger: WindowsPopupWindowProviderLogger,
    private readonly scanTimeoutMs = 5_000,
  ) {}

  scan(): Promise<{ name: string }[]> {
    if (this.pendingScan) {
      return Promise.reject(new Error('上一轮窗口标题扫描尚未完成'))
    }

    const child = this.ensureChild()
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.pendingScan) return
        this.pendingScan = null
        reject(new Error('Windows 窗口标题扫描超时'))
        this.terminateChild(child)
      }, this.scanTimeoutMs)

      this.pendingScan = { resolve, reject, timeout }
      child.stdin.write('scan\n', 'ascii', error => {
        if (!error || this.child !== child) return
        this.rejectPending(error)
        this.terminateChild(child)
      })
    })
  }

  stop(): void {
    const child = this.child
    if (!child) return

    this.rejectPending(new Error('Windows 窗口标题扫描已停止'))
    child.stdin.write('quit\n', 'ascii', () => {
      this.terminateChild(child)
    })
    setTimeout(() => this.terminateChild(child), 500).unref()
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child && this.child.exitCode === null && !this.child.killed) return this.child

    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', ENCODED_WINDOW_ENUMERATION_SCRIPT],
      {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    this.child = child
    this.stdoutBuffer = ''
    this.stderrBuffer = ''

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => this.handleStdout(child, String(chunk)))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => {
      if (this.stderrBuffer.length < 4_000) this.stderrBuffer += String(chunk)
    })
    child.on('error', error => {
      if (this.child !== child) return
      this.rejectPending(error)
      this.terminateChild(child)
    })
    child.on('close', code => {
      if (this.child !== child) return
      const details = this.stderrBuffer.trim()
      this.rejectPending(
        new Error(`Windows 窗口标题监控进程已退出，代码 ${code}${details ? `：${details}` : ''}`),
      )
      this.child = null
      this.stdoutBuffer = ''
      this.stderrBuffer = ''
    })

    return child
  }

  private handleStdout(child: ChildProcessWithoutNullStreams, chunk: string): void {
    if (this.child !== child) return
    this.stdoutBuffer += chunk

    let newlineIndex = this.stdoutBuffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1)
      this.handleProtocolLine(line)
      newlineIndex = this.stdoutBuffer.indexOf('\n')
    }
  }

  private handleProtocolLine(line: string): void {
    const pending = this.pendingScan
    if (!pending) {
      if (line) this.logger.debug?.('窗口标题监控收到非预期输出', line)
      return
    }

    if (line !== '0' && line !== '1' && line !== 'E') {
      this.logger.debug?.('窗口标题监控忽略非协议输出', line)
      return
    }

    this.pendingScan = null
    clearTimeout(pending.timeout)
    if (line === '1') {
      pending.resolve([{ name: '人机交互' }])
    } else if (line === '0') {
      pending.resolve([])
    } else {
      const details = this.stderrBuffer.trim()
      this.stderrBuffer = ''
      pending.reject(new Error(`Windows 窗口标题扫描失败${details ? `：${details}` : ''}`))
    }
  }

  private rejectPending(error: Error): void {
    const pending = this.pendingScan
    if (!pending) return
    this.pendingScan = null
    clearTimeout(pending.timeout)
    pending.reject(error)
  }

  private terminateChild(child: ChildProcessWithoutNullStreams): void {
    if (this.child !== child) return
    this.child = null
    this.stdoutBuffer = ''
    this.stderrBuffer = ''
    child.kill()
  }
}
