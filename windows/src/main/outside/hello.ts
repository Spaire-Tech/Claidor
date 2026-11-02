// Windows Hello for the three places the Mac asks Touch ID
// (ios/SimeonCore's `PurchaseApproval.confirm`): a checkout's Allow,
// 1Password's Fill, a saved password shown. Windows' own `UserConsentVerifier`
// asks the person (face, fingerprint or PIN) with the Mac's reason, reached
// through Windows PowerShell 5.1, which every Windows has and which can
// call Windows' own (WinRT) parts; no package is added to the app. The
// reason goes to PowerShell in its environment, never in the script or on
// its command line, so nothing in it can run. Hello not set up (or not
// Windows, or PowerShell refused before asking): `unavailable`, and the
// page asks in its own alert instead. Once Hello may have asked (the script
// says `asking` first), anything but Verified is `cancelled`: the person's
// no, three minutes without an answer, a PowerShell that was ended, an
// error, an answer it doesn't know (review of 2 November 2026). Waiting or
// an error never unlocks anything.

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
 * line out: `unavailable:<why>` before asking, or `asking` then
 * `result:<UserConsentVerificationResult>`.
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
  Write-Output 'asking'
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

/** How a run of PowerShell ended, and what it printed. */
export interface PowerShellRun {
  output: string
  /** It ran to its end; it ran out of time and was ended; it could not be started at all. */
  ended: 'exited' | 'timedOut' | 'notStarted'
}

/**
 * PowerShell's lines, read: `unavailable` only when PowerShell couldn't be
 * started, or said so before asking and ended by itself; `confirmed` only
 * for Verified after asking; everything else `cancelled`.
 */
export function helloAnswer(run: PowerShellRun): HelloAnswer {
  if (run.ended === 'notStarted') return 'unavailable'
  const lines = run.output.split(/\r?\n/).map((one) => one.trim())
  const asked = lines.includes('asking')
  if (!asked) {
    const said = lines.some((one) => one.startsWith('unavailable:'))
    return said && run.ended === 'exited' ? 'unavailable' : 'cancelled'
  }
  if (run.ended !== 'exited') return 'cancelled'
  const result = lines.slice(lines.indexOf('asking') + 1).find((one) => one.startsWith('result:'))
  return result === 'result:Verified' ? 'confirmed' : 'cancelled'
}

/** A run of PowerShell, its input closed (a stand-in in the tests). */
export type RunPowerShell = (
  file: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs: number,
) => Promise<PowerShellRun>

/** Runs PowerShell hidden, its input closed, ended after `timeoutMs`. */
export const runPowerShell: RunPowerShell = (file, args, env, timeoutMs) =>
  new Promise((done) => {
    let output = ''
    let started = false
    let settled = false
    const finish = (ended: PowerShellRun['ended']) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      done({ output, ended })
    }
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(file, args, { env, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, shell: false })
    } catch {
      finish('notStarted')
      return
    }
    const timer = setTimeout(() => {
      child.kill()
      finish('timedOut')
    }, timeoutMs)
    child.on('spawn', () => {
      started = true
    })
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      if (output.length < 4_096) output += chunk
    })
    child.on('error', () => finish(started ? 'exited' : 'notStarted'))
    child.on('close', () => finish(started ? 'exited' : 'notStarted'))
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
      const run = await this.run(
        windowsPowerShell(this.env),
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedScript()],
        env,
        helloTimeoutMs,
      )
      return helloAnswer(run)
    } catch {
      // Something went wrong once it may have asked: nothing unlocks.
      return 'cancelled'
    } finally {
      this.asking = false
    }
  }
}
