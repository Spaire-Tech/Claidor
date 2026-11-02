// The agent's hands on this PC, for the app (mac/Simeon/MacLocalHands.swift's
// `MacLocalHands`, `LocalHandsLog`; the kept parts of
// MacLocalPermission.swift): one provider at a time, made when the page
// first opens the stream for a signed-in account and stopped when it signs
// out or the app quits; the setting and the "Allow once" answers kept in
// the app's data folder; the hands' log beside them.

import { appendFile } from 'node:fs/promises'
import path from 'node:path'
import { LocalToolApprovals } from './approvals'
import { type PermissionNow, LocalToolSettings } from './permission'
import { findPowerShell } from './powershell'
import { HandsProvider, type StreamEnd } from './provider'
import type { LocalToolApproval, Permission } from './rules'
import type { SensitivePlaces } from './sensitivePaths'
import type { ShellSystem } from './shell'
import type { Target } from './target'
import type { Transport } from './transport'

export interface HandsSetup {
  /** The app's data folder (`%APPDATA%\Simeon`): the setting, the answers and the log. */
  dataFolder: string
  env: Readonly<Record<string, string | undefined>>
  home: string
  platform: string
  transport: Transport
  shrinkImage?: (data: Buffer) => Buffer
  hostName?: string
}

/**
 * Where the agent may work (`resolveLocalExecRoot`): `SIMEON_LOCAL_EXEC_ROOT`,
 * `SAND_LOCAL_EXEC_ROOT`, `SIMEON_AGENT_PROJECT_DIR`,
 * `SAND_AGENT_PROJECT_DIR`, else the home folder. The app sets none of them.
 */
export function rootFrom(env: Readonly<Record<string, string | undefined>>, home: string): string {
  const configured = [
    env.SIMEON_LOCAL_EXEC_ROOT,
    env.SAND_LOCAL_EXEC_ROOT,
    env.SIMEON_AGENT_PROJECT_DIR,
    env.SAND_AGENT_PROJECT_DIR,
  ]
    .map((value) => value?.trim() ?? '')
    .find((value) => value !== '')
  return configured ? path.resolve(configured) : home
}

/** This PC's places that hold keys: from Windows' own variables, else where Windows puts them. */
export function placesFrom(
  env: Readonly<Record<string, string | undefined>>,
  home: string,
  dataFolder: string,
  platform: string,
): SensitivePlaces {
  const flavor = platform === 'win32' ? path.win32 : path.posix
  return {
    home,
    appData: env.APPDATA?.trim() || flavor.join(home, 'AppData', 'Roaming'),
    localAppData: env.LOCALAPPDATA?.trim() || flavor.join(home, 'AppData', 'Local'),
    systemRoot: platform === 'win32' ? env.SystemRoot?.trim() || env.SYSTEMROOT?.trim() || 'C:\\Windows' : undefined,
    dataFolder,
  }
}

/** The hands' log (`LocalHandsLog`), appended to in order: steps and counts, never a command, a path's contents, an address or a key. */
export class HandsLog {
  private chain: Promise<void> = Promise.resolve()

  constructor(readonly file: string) {}

  write(line: string): void {
    this.chain = this.chain.then(() => appendFile(this.file, `${line}\n`, { mode: 0o600 })).catch(() => {})
  }

  get written(): Promise<void> {
    return this.chain
  }
}

export class Hands {
  readonly settings: LocalToolSettings
  readonly approvals: LocalToolApprovals
  readonly places: SensitivePlaces
  readonly root: string
  readonly log: HandsLog
  readonly system: ShellSystem
  private provider?: HandsProvider

  constructor(private readonly setup: HandsSetup) {
    this.settings = new LocalToolSettings(setup.dataFolder)
    this.approvals = new LocalToolApprovals(setup.dataFolder)
    this.places = placesFrom(setup.env, setup.home, setup.dataFolder, setup.platform)
    this.root = rootFrom(setup.env, setup.home)
    this.log = new HandsLog(path.join(setup.dataFolder, 'local-exec-daemon.log'))
    this.system = {
      shell: findPowerShell(setup.env, setup.platform),
      platform: setup.platform,
      environment: setup.env,
      log: (line) => this.log.write(line),
    }
  }

  /** The provider serving now, if any (the checks read it). */
  get serving(): HandsProvider | undefined {
    return this.provider
  }

  private make(): HandsProvider {
    this.log.write(`[sand-local-exec-daemon] started (pid ${process.pid}); serving local exec over the gateway`)
    return new HandsProvider({
      transport: this.setup.transport,
      root: this.root,
      home: this.setup.home,
      places: this.places,
      approvals: this.approvals,
      permission: () => this.settings.effective,
      system: this.system,
      log: (line) => this.log.write(line),
      shrinkImage: this.setup.shrinkImage,
      hostName: this.setup.hostName,
    })
  }

  /** One stream of the computer's requests, until it ends (the page dials again, as the Mac's loop). */
  stream(target: Target): Promise<StreamEnd> {
    this.provider ??= this.make()
    return this.provider.openStream(target)
  }

  /** The page ended the stream: the computer's address moved, or the page is going. */
  end(): void {
    this.provider?.endStream('ended')
  }

  /** Signed out, another account, or quitting: the stream closes and running commands are stopped (`MacLocalHands.stop`). */
  async stop(): Promise<void> {
    const provider = this.provider
    this.provider = undefined
    await provider?.stop()
  }

  /** Signed out: the setting forgotten, so the next account starts from "Ask every time"; the hands stopped. */
  async signedOut(): Promise<void> {
    this.settings.clearScope()
    await this.stop()
  }

  /** The setting for this account, kept for it once it is known (`LocalToolSettings.scope`). */
  permission(account: string | null): PermissionNow {
    if (account != null && account !== '') this.settings.scope(account)
    return this.settings.now()
  }

  choose(choice: Permission): PermissionNow {
    this.settings.choice = choice
    return this.settings.now()
  }

  ceiling(value: Permission | null): PermissionNow {
    this.settings.ceiling = value ?? undefined
    return this.settings.now()
  }

  allowOnce(approval: LocalToolApproval): void {
    this.approvals.record(approval)
  }

  forgetOnce(): void {
    this.approvals.clear()
  }
}
