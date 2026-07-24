import { type ChildProcess, spawn } from 'node:child_process'

const POWERSHELL_SPEECH_SCRIPT = `
Add-Type -AssemblyName System.Speech
$synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $encodedText = [Console]::In.ReadToEnd()
  $text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encodedText))
  if (-not [string]::IsNullOrWhiteSpace($text)) {
    $synthesizer.Speak($text)
  }
}
finally {
  $synthesizer.Dispose()
}
`.trim()

const ENCODED_SPEECH_SCRIPT = Buffer.from(POWERSHELL_SPEECH_SCRIPT, 'utf16le').toString('base64')

export interface SpeechLogger {
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

export interface PopupAlarmSpeaker {
  speak(text: string): Promise<boolean>
  stop(): void
}

export class PowerShellSpeechSynthesizer implements PopupAlarmSpeaker {
  private child: ChildProcess | null = null
  private timeout: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly logger: SpeechLogger,
    private readonly timeoutMs = 15_000,
  ) {}

  speak(text: string): Promise<boolean> {
    if (this.child) {
      this.logger.warn('已有语音报警正在播放，本次播报已跳过')
      return Promise.resolve(false)
    }

    return new Promise((resolve, reject) => {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', ENCODED_SPEECH_SCRIPT],
        {
          windowsHide: true,
          stdio: ['pipe', 'ignore', 'pipe'],
        },
      )
      this.child = child

      let settled = false
      let stderr = ''
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        this.clearCurrentProcess(child)
        if (error) reject(error)
        else resolve(true)
      }

      child.stderr?.setEncoding('utf8')
      child.stderr?.on('data', chunk => {
        if (stderr.length < 4_000) stderr += String(chunk)
      })
      child.on('error', error => finish(error))
      child.on('close', code => {
        if (code === 0) {
          finish()
        } else {
          finish(new Error(`PowerShell 语音进程退出，代码 ${code}${stderr ? `：${stderr}` : ''}`))
        }
      })

      this.timeout = setTimeout(() => {
        this.logger.warn(`语音进程运行超过 ${this.timeoutMs / 1000} 秒，正在结束`)
        child.kill()
        finish(new Error('PowerShell 语音进程超时'))
      }, this.timeoutMs)

      // 语音文本先转成 ASCII Base64 再通过标准输入传入，既避免命令注入，也避免 Windows PowerShell 按本地代码页误解码中文。
      child.stdin?.on('error', error => finish(error))
      child.stdin?.end(Buffer.from(text, 'utf8').toString('base64'), 'ascii')
    })
  }

  stop(): void {
    const child = this.child
    if (!child) return

    this.clearCurrentProcess(child)
    child.kill()
  }

  private clearCurrentProcess(child: ChildProcess): void {
    if (this.child !== child) return
    if (this.timeout) clearTimeout(this.timeout)
    this.timeout = null
    this.child = null
  }
}
