// The shell the agent's commands run in on this PC: PowerShell, as zsh is
// the Mac's (SimeonMacCore's LocalExecFiles.swift, `ZshShell`; the
// engine's packages/shell-exec/zsh.ts). One PowerShell whose state (its
// environment, functions, aliases and folder) is carried from each command
// to the next, as zsh's exports, options, functions, aliases and folder are
// on the Mac:
//
// - Once, the person's own PowerShell (with their profile) says its state
//   (`initScript`), after a marker, as zsh's login shell does.
// - Each command then runs in a PowerShell of its own without the profile
//   (`commandScript`): the state and the command come in on its input as
//   one line (never on its command line, which other programs can read),
//   the command runs, and the state after it goes out at the end of its
//   output after a marker made for that run, which the app takes off before
//   anything is shown (the Mac's zsh has descriptors 3 and 4 for it;
//   PowerShell has no such thing on Windows).
//
// What is not carried, as on the Mac: plain variables (zsh carries only the
// exported ones), loaded modules.

import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

export const stateMarker = '__SIMEON_STATE_MARKER__'
export const startMarker = '__SIMEON_PS_STATE_START__'
export const endMarker = '__SIMEON_PS_STATE_END__'

/** The names whose values are not carried (the Mac's `grep -viE` on `typeset -xp`): proxies, the sandbox's own, the conversation's, and the folder variables PowerShell doesn't keep. */
export const notCarried =
  '_proxy$|SIMEON_SANDBOX|SUDO_ASKPASS|SIMEON_ASKPASS|SIMEON_CONVERSATION_ID|SIMEON_AGENT_STORE|^PWD$|^OLDPWD$'

/** The shell's state between commands. */
export interface ShellState {
  env: { n: string; v: string }[]
  functions: { n: string; v: string }[]
  aliases: { n: string; v: string }[]
}

export const emptyState: ShellState = { env: [], functions: [], aliases: [] }

/** Plain words: UTF-8 both ways, no colours, no progress bars (the Mac's `TERM=dumb`, `NO_COLOR=1`). */
const prelude = `
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch {}
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
if ($PSStyle) { $PSStyle.OutputRendering = 'PlainText' }
`

/** The state said as one line: the start marker given, its JSON in base64, the end marker (`dump_zsh_state`). */
function dump(start: string): string {
  return `
$__simeonHere = Get-Location
$__simeonState = [ordered]@{
  cwd = $(if ($__simeonHere.Provider.Name -eq 'FileSystem') { $__simeonHere.ProviderPath } else { $__simeonStart })
  env = @(Get-ChildItem Env: | Where-Object { $_.Name -notmatch '${notCarried}' } | ForEach-Object { [ordered]@{ n = $_.Name; v = [string]$_.Value } })
  functions = @(Get-ChildItem Function: | Where-Object { -not $_.ModuleName -and $_.Name -notlike '__simeon*' -and $__simeonFunctions[$_.Name] -ne $_.Definition } | ForEach-Object { [ordered]@{ n = $_.Name; v = [string]$_.Definition } })
  aliases = @(Get-Alias | Where-Object { $__simeonAliases[$_.Name] -ne $_.Definition } | ForEach-Object { [ordered]@{ n = $_.Name; v = [string]$_.Definition } })
}
$__simeonJson = ConvertTo-Json -InputObject $__simeonState -Depth 4 -Compress
[Console]::Out.Flush()
[Console]::Out.Write(${start} + [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($__simeonJson)) + '${endMarker}' + [char]10)
[Console]::Out.Flush()
`
}

/**
 * The person's PowerShell, once, with their profile (`initZshState`): what
 * it has then, every function and alias included (the next commands keep
 * only those that differ from a plain PowerShell's), after the marker and
 * whatever the profile printed.
 */
export const initScript = `${prelude}
$__simeonStart = (Get-Location).ProviderPath
$__simeonFunctions = @{}
$__simeonAliases = @{}
[Console]::Out.Write([char]10 + '${stateMarker}' + [char]10)
${dump(`'${startMarker}'`)}
`

/**
 * Each command (`ZshState.execute`): the state and the command read from
 * the first line of input, the state put back, the command run in this
 * scope (so what it defines stays), its success read after its last
 * statement, then the state said after the run's own marker, and the
 * command's code as the shell's.
 */
export const commandScript = `${prelude}
$__simeonStart = (Get-Location).ProviderPath
$__simeonRun = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadLine())) | ConvertFrom-Json
$__simeonFunctions = @{}
foreach ($__simeonItem in @(Get-ChildItem Function:)) { $__simeonFunctions[$__simeonItem.Name] = $__simeonItem.Definition }
$__simeonAliases = @{}
foreach ($__simeonItem in @(Get-Alias)) { $__simeonAliases[$__simeonItem.Name] = $__simeonItem.Definition }
foreach ($__simeonItem in @($__simeonRun.env)) { if ($__simeonItem.n) { Set-Item -LiteralPath ('Env:' + $__simeonItem.n) -Value ([string]$__simeonItem.v) } }
foreach ($__simeonItem in @($__simeonRun.functions)) { if ($__simeonItem.n -and $__simeonFunctions[$__simeonItem.n] -ne $__simeonItem.v) { try { Set-Item -LiteralPath ('Function:global:' + $__simeonItem.n) -Value ([ScriptBlock]::Create($__simeonItem.v)) } catch {} } }
foreach ($__simeonItem in @($__simeonRun.aliases)) { if ($__simeonItem.n -and $__simeonAliases[$__simeonItem.n] -ne $__simeonItem.v) { try { Set-Alias -Name $__simeonItem.n -Value $__simeonItem.v -Scope Global -Force -ErrorAction Stop } catch {} } }
Remove-Variable __simeonItem -ErrorAction SilentlyContinue
Remove-Item -LiteralPath Env:SIMEON_CONVERSATION_ID, Env:SIMEON_AGENT_STORE_FILES_DIR, Env:SIMEON_AGENT_STORE_SHARED_PATHS -ErrorAction SilentlyContinue
$global:LASTEXITCODE = 0
$global:__simeonOk = $true
$__simeonFailed = $false
try {
  $__simeonBlock = [ScriptBlock]::Create([string]$__simeonRun.command + [char]10 + '$global:__simeonOk = $?')
  . $__simeonBlock | Out-Default
} catch {
  $__simeonFailed = $true
  [Console]::Error.WriteLine(($_ | Out-String).TrimEnd())
}
$__simeonCode = if ($__simeonFailed) { 1 } elseif (-not $global:__simeonOk) { if ($global:LASTEXITCODE) { $global:LASTEXITCODE } else { 1 } } else { 0 }
${dump('[string]$__simeonRun.marker')}
exit $__simeonCode
`

/** A script as PowerShell takes it on its command line (`-EncodedCommand`: UTF-16LE, base64). */
export function encoded(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

/** The arguments for one command, or for the first state (with the person's profile). */
export function shellArguments(kind: 'init' | 'command'): string[] {
  const common = ['-NoLogo', '-NonInteractive', '-OutputFormat', 'Text']
  return kind === 'init'
    ? [...common, '-EncodedCommand', encoded(initScript)]
    : ['-NoProfile', ...common, '-EncodedCommand', encoded(commandScript)]
}

/** The one line a command reads first: its run's marker, the command and the state, as base64 JSON (newlines can't end it early). */
export function commandInput(marker: string, command: string, state: ShellState): string {
  const json = JSON.stringify({ marker, command, ...state })
  return `${Buffer.from(json, 'utf8').toString('base64')}\n`
}

function isAbsoluteFolder(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('/')
}

function pairs(value: unknown): { n: string; v: string }[] | undefined {
  if (value == null) return []
  const list = Array.isArray(value) ? value : [value]
  const out: { n: string; v: string }[] = []
  for (const item of list) {
    if (typeof item !== 'object' || item == null) return undefined
    const { n, v } = item as { n?: unknown; v?: unknown }
    if (typeof n !== 'string' || n === '') continue
    out.push({ n, v: typeof v === 'string' ? v : v == null ? '' : String(v) })
  }
  return out
}

/** A state said after a marker: `<base64 JSON>` and the end marker; undefined unless it is whole and its folder absolute. */
export function parseStateBody(body: string): { cwd: string; state: ShellState } | undefined {
  const end = `${endMarker}\n`
  if (!body.endsWith(end)) return undefined
  let json: unknown
  try {
    json = JSON.parse(Buffer.from(body.slice(0, -end.length).trim(), 'base64').toString('utf8'))
  } catch {
    return undefined
  }
  if (typeof json !== 'object' || json == null) return undefined
  const fields = json as Record<string, unknown>
  const cwd = fields.cwd
  if (typeof cwd !== 'string' || !isAbsoluteFolder(cwd)) return undefined
  const env = pairs(fields.env)
  const functions = pairs(fields.functions)
  const aliases = pairs(fields.aliases)
  if (!env || !functions || !aliases) return undefined
  return { cwd, state: { env, functions, aliases } }
}

/** The first state, after the marker the profile's own output comes before (`ZshShell.parseState`). */
export function parseInitOutput(output: string): { cwd: string; state: ShellState } | undefined {
  const marker = `${stateMarker}\n`
  const at = output.indexOf(marker)
  const after = at < 0 ? output : output.slice(at + marker.length)
  if (!after.startsWith(startMarker)) return undefined
  return parseStateBody(after.slice(startMarker.length))
}

/**
 * What every command runs with, over this app's own (`SHELL_ENV_OVERRIDES`,
 * `ZshShell.environment`): no colours, a plain terminal, `SIMEON_AGENT=1`;
 * Electron's own switch left out. On Windows, Windows' own folders first on
 * `PATH` when missing, as the Mac puts the system's first.
 */
export function shellEnvironment(
  base: Readonly<Record<string, string | undefined>>,
  root: string,
  platform: string = process.platform,
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(base)) if (value != null) env[key] = value
  delete env.ELECTRON_RUN_AS_NODE
  env.TERM = 'dumb'
  env.NO_COLOR = '1'
  env.FORCE_COLOR = '0'
  env._ZO_DOCTOR = '0'
  env.SIMEON_AGENT = '1'
  env.SAND_AGENT = '1'
  env.AGENT_TRANSCRIPTS = (platform === 'win32' ? path.win32 : path.posix).join(root, 'agent-transcripts')
  if (platform === 'win32') {
    // Windows' environment names don't care about case: one PATH, however it is spelled.
    const key = Object.keys(env).find((name) => name.toLowerCase() === 'path') ?? 'Path'
    const system = env.SystemRoot ?? env.SYSTEMROOT ?? 'C:\\Windows'
    const wanted = [
      path.win32.join(system, 'System32'),
      system,
      path.win32.join(system, 'System32', 'Wbem'),
      path.win32.join(system, 'System32', 'WindowsPowerShell', 'v1.0'),
    ]
    const have = (env[key] ?? '').split(';').filter((one) => one !== '')
    const missing = wanted.filter(
      (folder) => !have.some((one) => one.replace(/[\\/]+$/, '').toLowerCase() === folder.toLowerCase()),
    )
    if (missing.length > 0) env[key] = [...missing, ...have].join(';')
  }
  return env
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
}

/**
 * The PowerShell to run (`ZshHost.zshPath`): PowerShell 7 (`pwsh`) when
 * this PC has it, found on `PATH` (absolute folders only) or where it
 * installs itself, else Windows PowerShell 5.1, always in Windows' own
 * folder. Found by a full path, never by the current folder. On Linux (the
 * checks) `pwsh` on `PATH`.
 */
export function findPowerShell(
  env: Readonly<Record<string, string | undefined>>,
  platform: string = process.platform,
  exists: (file: string) => boolean = isFile,
): string | undefined {
  const windows = platform === 'win32'
  const flavor = windows ? path.win32 : path.posix
  const pathKey = Object.keys(env).find((name) => name.toLowerCase() === 'path') ?? 'PATH'
  const folders = (env[pathKey] ?? '')
    .split(windows ? ';' : ':')
    .map((one) => one.trim().replace(/^"(.*)"$/, '$1'))
    .filter((one) => one !== '' && flavor.isAbsolute(one))
  const name = windows ? 'pwsh.exe' : 'pwsh'
  for (const folder of folders) {
    const candidate = flavor.join(folder, name)
    if (exists(candidate)) return candidate
  }
  if (!windows) return undefined
  const programFiles = [env.ProgramFiles, env.ProgramW6432, 'C:\\Program Files'].filter(
    (one): one is string => !!one,
  )
  for (const folder of programFiles) {
    const candidate = path.win32.join(folder, 'PowerShell', '7', 'pwsh.exe')
    if (exists(candidate)) return candidate
  }
  const system = env.SystemRoot ?? env.SYSTEMROOT ?? 'C:\\Windows'
  const windowsPowerShell = path.win32.join(system, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return exists(windowsPowerShell) ? windowsPowerShell : undefined
}

/** Whether a folder is there to start a command in. */
export function isFolder(folder: string): boolean {
  try {
    return existsSync(folder) && statSync(folder).isDirectory()
  } catch {
    return false
  }
}
