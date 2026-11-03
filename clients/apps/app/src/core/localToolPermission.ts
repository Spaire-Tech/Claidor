// Whether the agents may use this PC: open files and run tasks on it
// (SimeonMacCore's LocalToolPermission.swift; the engine's
// shared/local-tool-permission.ts). Settings › Computer › "Execution on
// Local Computer" picks it; the computer asks before each action while it
// is "ask", the default. The Windows app keeps it (its main process, which
// reads it before every request: windows/src/main/hands/permission.ts);
// this is its menu and its ceiling. Connecting tells the computer this PC's
// setting and takes nothing back from it (the store's
// `localPermissionConnected`).

import type { JSONValue } from './json'
import { field, int } from './json'
import { t } from './l10n'

export type LocalToolPermission = 'always' | 'ask' | 'never'

/** The menu's order (`APt`). */
export const localToolChoices: readonly LocalToolPermission[] = [
  'always',
  'ask',
  'never',
]
export const defaultLocalToolPermission: LocalToolPermission = 'ask'

export function localToolTitle(): string {
  return t('Execution on Local Computer')
}

export function localToolExplanation(): string {
  return t(
    'Let the assistant open files and run tasks on your computer. Auto-review still checks everything first.',
  )
}

/** Anything else read as the default (`normalizeSandLocalToolPermission`). */
export function normalizedPermission(value: unknown): LocalToolPermission {
  return localToolChoices.includes(value as LocalToolPermission)
    ? (value as LocalToolPermission)
    : defaultLocalToolPermission
}

/** `SAND_LOCAL_TOOL_PERMISSION_RANK` (the window's `vBe`). */
export function permissionRank(value: LocalToolPermission): number {
  return value === 'never' ? 0 : value === 'ask' ? 1 : 2
}

/** The menu's words (`XGn`). */
export function permissionLabel(value: LocalToolPermission): string {
  switch (value) {
    case 'never':
      return t('Never allow')
    case 'always':
      return t('Always allow')
    case 'ask':
      return t('Ask every time')
  }
}

/** The choice, lowered to the team admin's ceiling when it is above it (`resolveSandLocalToolPermission`). */
export function cappedPermission(
  choice: LocalToolPermission,
  ceiling: LocalToolPermission | undefined,
): LocalToolPermission {
  if (ceiling == null) return choice
  return permissionRank(choice) <= permissionRank(ceiling) ? choice : ceiling
}

/** A choice above the ceiling is greyed in the menu (`MPt`). */
export function isAboveCeiling(
  choice: LocalToolPermission,
  ceiling: LocalToolPermission | undefined,
): boolean {
  if (ceiling == null) return false
  return permissionRank(choice) > permissionRank(ceiling)
}

/** The line under the explanation while a team admin caps it. */
export function ceilingLine(ceiling: LocalToolPermission): string {
  return t`Your team's admin allows at most "${permissionLabel(ceiling)}"`
}

/**
 * The ceiling in `GetTeamAdminSettingsOrEmptyIfNotInTeam`'s answer
 * (`fetchLocalToolPermissionCeiling`): `localToolControls.permissionCeiling`,
 * 1 never, 2 ask, 3 always; none for anything else, as for a person in no
 * team (Simeon Labs' server answers `{}`).
 */
export function teamCeiling(
  answer: JSONValue | undefined,
): LocalToolPermission | undefined {
  switch (int(field(field(answer, 'localToolControls'), 'permissionCeiling'))) {
    case 1:
      return 'never'
    case 2:
      return 'ask'
    case 3:
      return 'always'
    default:
      return undefined
  }
}
