// Windows Hello for the three places the Mac asks Touch ID
// (ios/SimeonCore's `PurchaseApproval.confirm`): a checkout's Allow,
// 1Password's Fill, a saved password shown. Windows' own `UserConsentVerifier`
// asks the person (face, fingerprint or PIN) with the Mac's reason, reached
// through Windows PowerShell 5.1, which every Windows has and which can
// call Windows' own (WinRT) parts; no package is added to the app. The
// reason goes to PowerShell in its environment, never in the script or on
// its command line, so nothing in it can run. Hello not set up (or not
// Windows, or PowerShell refused): `unavailable`, and the page asks in its
// own alert instead.

import { spawn } from 'node:child_process'
import path from 'node:path'

export type HelloAnswer = 'confirmed' | 'cancelled' | 'unavailable'

/** How long Hello may wait for the person, as the Mac's `op` waits for Touch ID. */
export const helloTimeoutMs = 180_000
/** The longest reason passed on ("Approve $2.47 at gumroad.com"; a login's name may be long). */
export const reasonLimit = 512

/** The environment variable the reason travels in. */
export const reasonVariable = 'SIMEON_HELLO_REASON'

/**
 * The script: is Hello there (`CheckAvailabilityAsync`), then ask
 * (`RequestVerificationAsync`) with the reason from the environment; one
 * line out: `result:<UserConsentVerificationResult>` or `unavailable:<why>`.
 */
export const helloScript = String.raw`$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation${'`'}1' } |
    Select-Object -First 1
  function Wait-WinRT($operation, [Type] $type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
    $null = $task.Wait(-1)
    $task.Result
  }
  $null = [Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType = WindowsRuntime]
  $availability = Wait-WinRT ([Windows.Security.Credentials.UI.UserConsentVerifier]::CheckAvailabilityAsync()) ([Windows.Security.Credentials.UI.UserConsentVerifierAvailability])
  if ($availability -ne [Windows.Security.Credentials.UI.UserConsentVerifierAvailability]::Available) {
    Write-Output "unavailable:$availability"
    exit 0
  }
  $reason = [string] $env:${reasonVariable}
  $result = Wait-WinRT ([Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync($reason)) ([Windows.Security.Credentials.UI.UserConsentVerificationResult])
  Write-Output "result:$result"
} catch {
  Write-Output 'unavailable:error'
}
`

/** The script as PowerShell's `-EncodedCommand` takes it: UTF-16LE, base64. */
export function encodedScript(script = helloScript): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

/** Windows PowerShell 5.1, where Windows keeps it (PowerShell 7 can't reach WinRT's types this way). */
export function windowsPowerShell(env: Readonly<Record<string, string | undefined>>): string {
  const root = env.SystemRoot ?? env.SYSTEMROOT ?? env.windir ?? 'C:\\Windows'
  return path.win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

/** PowerShell's line out, read: Verified is confirmed; the person's no (or too many tries, or Hello busy) cancelled; anything else unavailable. */
export function helloAnswer(output: string): HelloAnswer {
  const line = output
    .split(/\r?\n/)
    .map((one) => one.trim())
    .find((one) => one.startsWith('result:') || one.startsWith('unavailable:'))
  if (!line?.startsWith('result:')) return 'unavailable'
  switch (line.slice('result:'.length)) {
    case 'Verified':
      return 'confirmed'
    case 'Canceled':
    case 'RetriesExhausted':
    case 'DeviceBusy':
      return 'cancelled'
    default:
      return 'unavailable'
  }
}

/** A run of PowerShell: its output, or none when it couldn't run or ran out of time. */
export type RunPowerShell = (
  file: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs: number,
) => Promise<string | undefined>

/** Runs PowerShell hidden, its input closed, killed after `timeoutMs`. */
export const runPowerShell: RunPowerShell = (file, args, env, timeoutMs) =>
  new Promise((done) => {
    let out = ''
    let settled = false
    const finish = (value: string | undefined) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      done(value)
    }
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(file, args, { env, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, shell: false })
    } catch {
      finish(undefined)
      return
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(undefined)
    }, timeoutMs)
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      if (out.length < 4_096) out += chunk
    })
    child.on('error', () => finish(undefined))
    child.on('close', () => finish(out))
  })

/**
 * Asks Windows Hello, with `reason`; on another system, `unavailable` at
 * once. One ask at a time: a second while one shows is cancelled.
 */
export class Hello {
  private asking = false

  constructor(
    private readonly platform: string,
    private readonly env: Readonly<Record<string, string | undefined>>,
    private readonly run: RunPowerShell = runPowerShell,
  ) {}

  async confirm(reason: string): Promise<HelloAnswer> {
    if (this.platform !== 'win32') return 'unavailable'
    if (this.asking) return 'cancelled'
    this.asking = true
    try {
      const env: Record<string, string> = {}
      for (const [key, value] of Object.entries(this.env)) if (value != null) env[key] = value
      env[reasonVariable] = reason.slice(0, reasonLimit)
      const output = await this.run(
        windowsPowerShell(this.env),
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedScript()],
        env,
        helloTimeoutMs,
      )
      return output == null ? 'unavailable' : helloAnswer(output)
    } finally {
      this.asking = false
    }
  }
}
