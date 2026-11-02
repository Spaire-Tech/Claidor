// "Execution on Local Computer" as this PC keeps it, for one account at a
// time (SimeonMacCore's LocalToolPermission.swift: `LocalToolSettings`; the
// engine's `sand-settings-store.ts`): the person's choice and the team's
// ceiling. Another account signing in starts again from the default;
// signing out forgets both (`scopeToAccount`, `clearAccountScope`). The Mac
// keeps them in its defaults; here in the app's data folder,
// `local-tool-permission.json`, signed (signed.ts): read once when the app
// starts (an edited file reads as "Ask every time", no ceiling), then held
// in memory, where the hands read it before every request.

import path from 'node:path'
import type { Permission } from './rules'
import { SigningKey, readSigned, writeSigned } from './signed'

export const permissions: readonly Permission[] = ['always', 'ask', 'never']
export const defaultPermission: Permission = 'ask'

/** Anything else read as the default (`normalizeSandLocalToolPermission`). */
export function normalizePermission(value: unknown): Permission {
  return permissions.includes(value as Permission) ? (value as Permission) : defaultPermission
}

export function isPermission(value: unknown): value is Permission {
  return permissions.includes(value as Permission)
}

/** `SAND_LOCAL_TOOL_PERMISSION_RANK`. */
export function rank(value: Permission): number {
  return value === 'never' ? 0 : value === 'ask' ? 1 : 2
}

/** The choice, lowered to the team admin's ceiling when it is above it (`resolveSandLocalToolPermission`). */
export function capped(choice: Permission, ceiling: Permission | undefined): Permission {
  if (ceiling == null) return choice
  return rank(choice) <= rank(ceiling) ? choice : ceiling
}

interface Kept {
  account?: string
  choice?: Permission
  ceiling?: Permission
}

/** What the page is told: the choice, the ceiling, and what the computer is told and the menu shows. */
export interface PermissionNow {
  choice: Permission
  ceiling: Permission | null
  effective: Permission
}

export class LocalToolSettings {
  readonly file: string
  private held?: Kept

  constructor(
    folder: string,
    private readonly key: SigningKey = SigningKey.forThisRun(),
  ) {
    this.file = path.join(folder, 'local-tool-permission.json')
  }

  /** The file once, when its signature is this app's; else nothing (the default, no ceiling); then memory. */
  private read(): Kept {
    if (this.held) return this.held
    const value = readSigned(this.file, this.key, 'local-tool-permission')
    const fields = typeof value === 'object' && value != null ? (value as Record<string, unknown>) : {}
    this.held = {
      ...(typeof fields.account === 'string' ? { account: fields.account } : {}),
      ...(isPermission(fields.choice) ? { choice: fields.choice } : {}),
      ...(isPermission(fields.ceiling) ? { ceiling: fields.ceiling } : {}),
    }
    return this.held
  }

  private write(kept: Kept): void {
    this.held = kept
    // Not kept: the choice holds for this run only.
    writeSigned(this.file, this.key, 'local-tool-permission', kept)
  }

  /** The person's own pick, before any ceiling (`getLocalToolPermissionChoice`). */
  get choice(): Permission {
    return normalizePermission(this.read().choice)
  }

  set choice(value: Permission) {
    this.write({ ...this.read(), choice: value })
  }

  /** The team admin's ceiling, when there is one. */
  get ceiling(): Permission | undefined {
    return this.read().ceiling
  }

  set ceiling(value: Permission | undefined) {
    const { ceiling: _, ...rest } = this.read()
    this.write(value == null ? rest : { ...rest, ceiling: value })
  }

  /** What the computer is told and the menu shows (`getLocalToolPermission`). */
  get effective(): Permission {
    const kept = this.read()
    return capped(normalizePermission(kept.choice), kept.ceiling)
  }

  /** Another account than the last one forgets the last one's choice and ceiling; the first account keeps what is there. */
  scope(account: string): void {
    const kept = this.read()
    if (kept.account != null && kept.account !== account) {
      this.write({ account })
      return
    }
    this.write({ ...kept, account })
  }

  /** Signed out: the account, its choice and its ceiling forgotten. */
  clearScope(): void {
    this.write({})
  }

  now(): PermissionNow {
    const kept = this.read()
    const choice = normalizePermission(kept.choice)
    return { choice, ceiling: kept.ceiling ?? null, effective: capped(choice, kept.ceiling) }
  }
}
