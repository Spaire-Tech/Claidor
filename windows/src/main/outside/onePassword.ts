// Connecting 1Password from this PC (mac/Simeon/MacOnePassword.swift), the
// Mac's way: the person's own 1Password app and its command-line tool
// (`op.exe`), which asks the app (and Windows Hello) itself. In order:
//
//   1. their 1Password accounts (`op account list`);
//   2. the vault "Shared with Simeon" in the chosen one, made if it isn't
//      there (`op vault list`, `op vault create`);
//   3. a service account that can only read that vault, for a year
//      (`op service-account create … --vault <id>:read_items --raw`).
//
// The key goes to the page, which hands it to the agent's computer
// (`connectOnePassword`); nothing is kept, logged or written here. The tool
// runs with none of the caller's `OP_` settings, its input closed, hidden,
// for three minutes at most (Hello can take a while); 1Password's own first
// line of complaint is the failure, as the Mac shows it.

import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import path from 'node:path'

export const vaultName = 'Shared with Simeon'
export const toolTimeoutMs = 180_000

/** Where 1Password's command-line tool is on Windows, beside PATH: its own folder under Program Files, winget's links, Scoop's and Chocolatey's shims. */
export function toolPlaces(env: Readonly<Record<string, string | undefined>>): string[] {
  const join = path.win32.join
  const places: string[] = []
  const programFiles = env.ProgramFiles ?? env.PROGRAMFILES
  if (programFiles) places.push(join(programFiles, '1Password CLI', 'op.exe'))
  const local = env.LOCALAPPDATA ?? env.LocalAppData
  if (local) places.push(join(local, 'Microsoft', 'WinGet', 'Links', 'op.exe'))
  const home = env.USERPROFILE ?? env.UserProfile
  if (home) places.push(join(home, 'scoop', 'shims', 'op.exe'))
  const data = env.ProgramData ?? env.PROGRAMDATA
  if (data) places.push(join(data, 'chocolatey', 'bin', 'op.exe'))
  return places
}

/** The folders on PATH, whole ones only (never the folder the app was started in). */
function pathFolders(
  env: Readonly<Record<string, string | undefined>>,
  platform: string,
): string[] {
  const value = env.PATH ?? env.Path ?? env.path ?? ''
  const separator = platform === 'win32' ? ';' : ':'
  const absolute = platform === 'win32' ? path.win32.isAbsolute : path.posix.isAbsolute
  return value
    .split(separator)
    .map((folder) => folder.trim().replace(/^"(.*)"$/, '$1'))
    .filter((folder) => folder !== '' && absolute(folder))
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
}

/** The tool: on Windows `op.exe` in its usual places, then on PATH; elsewhere (the checks on Linux) `op` on PATH. */
export function findTool(
  platform: string,
  env: Readonly<Record<string, string | undefined>>,
  exists: (file: string) => boolean = isFile,
): string | undefined {
  const windows = platform === 'win32'
  const join = windows ? path.win32.join : path.posix.join
  const name = windows ? 'op.exe' : 'op'
  const places = [
    ...(windows ? toolPlaces(env) : []),
    ...pathFolders(env, platform).map((folder) => join(folder, name)),
  ]
  return places.find((place) => exists(place))
}

/** The environment the tool runs with: none of the caller's `OP_` settings, and unlocking through the 1Password app (`environment()`). */
export function toolEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(env))
    if (value != null && !key.toUpperCase().startsWith('OP_')) out[key] = value
  out.OP_CACHE = 'false'
  out.OP_BIOMETRIC_UNLOCK_ENABLED = 'true'
  out.OP_LOAD_DESKTOP_APP_SETTINGS = 'false'
  return out
}

/** 1Password's first line of complaint, its `[ERROR] date time` taken off, 300 characters at most; none when it said nothing. */
export function complaint(stderr: string): string | undefined {
  const said = stderr
    .split('\n')
    .map((line) => line.replace(/^\[ERROR\]\s*\S+\s+\S+\s*/, '').trim())
    .find((line) => line !== '')
  return said?.slice(0, 300)
}

/** One run of the tool: what it printed, or why not. */
export type ToolRun =
  | { ok: true; out: string }
  | { ok: false; said?: string }

export type RunTool = (args: string[]) => Promise<ToolRun>

/** Runs the tool hidden, its input closed, with `env`; killed after `timeoutMs`. Its output is kept in memory only. */
export function toolRunner(
  tool: string,
  env: Record<string, string>,
  timeoutMs = toolTimeoutMs,
): RunTool {
  return (args) =>
    new Promise((done) => {
      const out: Buffer[] = []
      const err: Buffer[] = []
      let settled = false
      const finish = (value: ToolRun) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        done(value)
      }
      let child: ReturnType<typeof spawn>
      try {
        child = spawn(tool, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false })
      } catch {
        finish({ ok: false })
        return
      }
      const timer = setTimeout(() => {
        child.kill()
        finish({ ok: false })
      }, timeoutMs)
      child.stdout?.on('data', (chunk: Buffer) => out.push(chunk))
      child.stderr?.on('data', (chunk: Buffer) => {
        if (err.reduce((size, one) => size + one.length, 0) < 65_536) err.push(chunk)
      })
      child.on('error', () => finish({ ok: false }))
      child.on('close', (status) => {
        if (status === 0) finish({ ok: true, out: Buffer.concat(out).toString('utf8') })
        else finish({ ok: false, said: complaint(Buffer.concat(err).toString('utf8')) })
      })
    })
}

export interface Account {
  id: string
  email: string
  url: string
}

/** The tool said no in its own words, or said nothing. */
type Refusal = { failure: 'noAnswer' } | { refused: string }

function refused(run: Extract<ToolRun, { ok: false }>): Refusal {
  return run.said ? { refused: run.said } : { failure: 'noAnswer' }
}

function objects(text: string): Record<string, unknown>[] {
  try {
    const value: unknown = JSON.parse(text)
    return Array.isArray(value)
      ? value.filter((one): one is Record<string, unknown> => typeof one === 'object' && one !== null)
      : []
  } catch {
    return []
  }
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** The person's 1Password accounts (`accounts()`). */
export async function listAccounts(
  run: RunTool,
): Promise<{ accounts: Account[] } | { failure: 'noAccounts' } | Refusal> {
  const listed = await run(['account', 'list', '--format=json'])
  if (!listed.ok) return refused(listed)
  const accounts = objects(listed.out)
    .map((row) => ({ id: textOf(row.account_uuid), email: textOf(row.email), url: textOf(row.url) }))
    .filter((account) => account.id !== '')
  if (accounts.length === 0) return { failure: 'noAccounts' }
  return { accounts }
}

/** An account's id as the tool takes it after `--account`: letters and digits, never a flag. */
export function isAccountId(value: string): boolean {
  return /^[A-Za-z0-9]{1,64}$/.test(value)
}

/** The shared vault in the account (made when missing) and a read-only key for it (`connect(_:)`). */
export async function connectAccount(
  run: RunTool,
  account: Account,
): Promise<
  | { token: string; vaultId: string; vaultName: string; accountEmail: string }
  | { failure: 'noAccounts' | 'noVault' | 'noKey' }
  | Refusal
> {
  if (!isAccountId(account.id)) return { failure: 'noAccounts' }
  const vaults = await run(['vault', 'list', '--account', account.id, '--format=json'])
  if (!vaults.ok) return refused(vaults)
  let vaultId = textOf(objects(vaults.out).find((vault) => vault.name === vaultName)?.id)
  if (vaultId === '') {
    // Made when missing; its refusal is the vault not made, as on the Mac.
    const made = await run(['vault', 'create', vaultName, '--account', account.id, '--format=json'])
    if (made.ok) {
      try {
        const value: unknown = JSON.parse(made.out)
        if (typeof value === 'object' && value !== null) vaultId = textOf((value as Record<string, unknown>).id)
      } catch {
        vaultId = ''
      }
    }
  }
  if (vaultId === '' || vaultId.startsWith('-')) return { failure: 'noVault' }
  const key = await run([
    'service-account',
    'create',
    'Simeon',
    '--vault',
    `${vaultId}:read_items`,
    '--expires-in',
    '52w',
    '--account',
    account.id,
    '--raw',
  ])
  if (!key.ok) return refused(key)
  const token = key.out.trim()
  if (!token.startsWith('ops_') || token.length <= 20) return { failure: 'noKey' }
  return { token, vaultId, vaultName, accountEmail: account.email }
}

/** What the page is answered (contract.ts, `onePasswordAccounts`, `onePasswordConnect`). */
type AccountsAnswer = Awaited<ReturnType<typeof listAccounts>> | { failure: 'noTool' }
type ConnectAnswer = Awaited<ReturnType<typeof connectAccount>> | { failure: 'noTool' }

/**
 * The page's 1Password: one run of the tool at a time, the accounts last
 * listed kept so only one of them is connected.
 */
export class OnePassword {
  private listed: Account[] = []
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly platform: string,
    private readonly env: Readonly<Record<string, string | undefined>>,
    private readonly runner: (tool: string, env: Record<string, string>) => RunTool = toolRunner,
    private readonly find: () => string | undefined = () => findTool(platform, env),
  ) {}

  private one<T>(work: (run: RunTool) => Promise<T>, none: T): Promise<T> {
    const next = this.queue.then(async () => {
      const tool = this.find()
      if (!tool) return none
      return work(this.runner(tool, toolEnvironment(this.env)))
    })
    this.queue = next.catch(() => {})
    return next
  }

  accounts(): Promise<AccountsAnswer> {
    return this.one<AccountsAnswer>(async (run) => {
      const answer = await listAccounts(run)
      this.listed = 'accounts' in answer ? answer.accounts : []
      return answer
    }, { failure: 'noTool' })
  }

  connect(accountId: string): Promise<ConnectAnswer> {
    return this.one<ConnectAnswer>(async (run) => {
      const account = this.listed.find((one) => one.id === accountId)
      if (!account) return { failure: 'noAccounts' }
      return connectAccount(run, account)
    }, { failure: 'noTool' })
  }
}
