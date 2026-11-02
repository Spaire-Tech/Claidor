// "Execution on Local Computer" as this PC keeps it, for one account at a
// time (SimeonMacCore's LocalToolPermission.swift: `LocalToolSettings`; the
// engine's `sand-settings-store.ts`): the person's choice and the team's
// ceiling. Another account signing in starts again from the default;
// signing out forgets both (`scopeToAccount`, `clearAccountScope`). The Mac
// keeps them in its defaults; here in the app's data folder, where the
// hands read them before every request.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Permission } from './rules'

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

  constructor(folder: string) {
    this.file = path.join(folder, 'local-tool-permission.json')
  }

  private read(): Kept {
    try {
      const value = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, unknown>
      return {
        ...(typeof value.account === 'string' ? { account: value.account } : {}),
        ...(isPermission(value.choice) ? { choice: value.choice } : {}),
        ...(isPermission(value.ceiling) ? { ceiling: value.ceiling } : {}),
      }
    } catch {
      return {}
    }
  }

  private write(kept: Kept): void {
    try {
      mkdirSync(path.dirname(this.file), { recursive: true })
      const temp = `${this.file}.${process.pid}.tmp`
      writeFileSync(temp, JSON.stringify(kept), { mode: 0o600 })
      renameSync(temp, this.file)
    } catch {
      // Not kept: the choice holds for this run only.
    }
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
