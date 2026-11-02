// The Plugins overlay's words and small rules that sit around the list
// rules in plugins.ts (SimeonCore's PluginsOverlay.swift, read from the same
// chunk and the main bundle): the empty lines, the team's labels and
// actions, the status words' tone, a sign-in's progress (`PBn`), the setup
// form (`Di`), a server's Details (`wi`), the skill page's Save, and the
// notices the overlay says.

import { t } from './l10n'
import {
  connectWord,
  hasSetupFields,
  type Notice,
  type PluginEntry,
  type PluginField,
  type PluginInstallMode,
  type PluginTool,
} from './plugins'

// MARK: Empty lines (`oi`, Yours' sections)

export const loadingMarketplace = () => t('Loading connectors…')
export const noFilterMatch = () => t('No connectors match the current filters')
export const marketplaceUnavailable = () =>
  t("Connectors aren't available right now. Check back later.")

/** Available with nothing to draw: loading, a filter, a search, or no catalogue (a failed read says the same). */
export function marketplaceEmpty(
  loaded: boolean,
  catalogEmpty: boolean,
  filterSet: boolean,
  query: string,
): string {
  const q = query.trim()
  if (!loaded && catalogEmpty) return loadingMarketplace()
  if (filterSet) return noFilterMatch()
  if (q !== '') return t`No connectors match "${q}"`
  return marketplaceUnavailable()
}

/** Yours › Installed with nothing in it. */
export function installedEmpty(query: string): string {
  const q = query.trim()
  return q === ''
    ? t('Nothing added yet. Find connectors in Available.')
    : t`No connectors you added match "${q}"`
}

/** Yours › Private with nothing in it. */
export function privateEmpty(agentOpen: boolean, query: string): string {
  const q = query.trim()
  if (!agentOpen) return t('Open an agent to see its private skills')
  return q === ''
    ? t('No private skills yet. Ask your Agent to create one for you.')
    : t`No private skills match "${q}"`
}

// MARK: The team's (`ct`, `hi`, `Xn`)

/** What a team install says beside it: "Managed by your team", "Added by your team", or nothing. */
export function modeLabel(mode: PluginInstallMode): string | undefined {
  switch (mode) {
    case 'team-required':
      return t('Managed by your team')
    case 'team-default':
      return t('Added by your team')
    case 'user':
      return undefined
  }
}

/** A page's action at the top right (`ft`): Add; Uninstall; the team's label then Remove; the team's label alone. */
export type PageAction =
  | { kind: 'add' }
  | { kind: 'uninstall' }
  | { kind: 'remove'; label: string }
  | { kind: 'managed'; label: string }

export function pageAction(
  installed: boolean,
  mode: PluginInstallMode | undefined,
): PageAction {
  if (!installed || mode == null) return { kind: 'add' }
  switch (mode) {
    case 'user':
      return { kind: 'uninstall' }
    case 'team-default':
      return { kind: 'remove', label: t('Added by your team') }
    case 'team-required':
      return { kind: 'managed', label: t('Managed by your team') }
  }
}

/** An Available row's Team mark (`Xn`): an entry from a marketplace, not from the person's own publisher; its tooltip the marketplace's name. */
export function teamMark(entry: PluginEntry): string | undefined {
  if (!entry.marketplace || entry.publisher?.isUserOwned === true)
    return undefined
  return entry.marketplace.displayName
}

/** Add on an entry opens its setup page first (`Bl`): it asks for values, and the team has not set them. */
export function needsSetupPage(
  entry: PluginEntry,
  teamConfigured: boolean,
): boolean {
  return hasSetupFields(entry) && !teamConfigured
}

// MARK: Status (`pKn`)

export type Tone = 'success' | 'warning' | 'danger' | 'tertiary'

/** The status word's colour: connected green, needs auth orange, error red, the rest grey. */
export function tone(status: string): Tone {
  switch (status) {
    case 'connected':
      return 'success'
    case 'needsAuth':
      return 'warning'
    case 'error':
      return 'danger'
    default:
      return 'tertiary'
  }
}

// MARK: Sign-in (`PBn`)

/** A sign-in left waiting this long becomes Retry (`ABn`), in seconds. */
export const signInTimeout = 600
/** Two sign-in pages are opened at least this far apart (`IBn`), in seconds. */
export const signInSpacing = 0.9

/** A sign-in's key (`ene`): the account's server identifier lower-cased, only its letters and digits; kept as it is when it holds "--". */
export function signInKey(serverIdentifier: string): string {
  if (serverIdentifier.includes('--')) return serverIdentifier
  return serverIdentifier.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** A sign-in waiting on its page (`PluginsModel.Flow`): the page, when it was opened (ms), and whether ten minutes have gone. */
export interface SignInFlow {
  url: string
  openedAt: number
  timedOut: boolean
}

export type SignInState = 'none' | 'waiting' | 'timedOut'

/** The sign-in button's word (`Qn`): Connect, Reopen while the page is waiting, Retry once it has waited ten minutes. */
export function signInButton(state: SignInState): string {
  switch (state) {
    case 'none':
      return connectWord()
    case 'waiting':
      return t('Reopen')
    case 'timedOut':
      return t('Retry')
  }
}

// MARK: The setup page (`Di`, `Mi`, `$i`, `Li`)

/** The values a setup page starts with: each field's default (current values are never shown). */
export function setupStart(
  fields: readonly PluginField[],
): Record<string, string> {
  const values: Record<string, string> = {}
  for (const one of fields)
    if (!(one.key in values)) values[one.key] = one.defaultValue ?? ''
  return values
}

/** The required fields left blank. */
export function setupMissing(
  fields: readonly PluginField[],
  values: Readonly<Record<string, string>>,
): PluginField[] {
  return fields.filter(
    (one) => one.isRequired && (values[one.key] ?? '').trim() === '',
  )
}

/** What is sent: each value trimmed, the blank ones left out. */
export function setupValues(
  values: Readonly<Record<string, string>>,
): Record<string, string> {
  const sent: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    const trimmed = value.trim()
    if (trimmed !== '') sent[key] = trimmed
  }
  return sent
}

export function setupIntro(name: string, editing: boolean): string {
  return editing
    ? t`Saving replaces all of ${name}'s setup values and applies them to its connectors. Current values aren't shown; a field left blank is cleared.`
    : t`${name} needs a few values before it can be added`
}

export function setupSubmit(name: string, editing: boolean): string {
  return editing ? t('Save Values') : t`Add ${name}`
}

export function requiredLine(label: string): string {
  return t`${label} is required`
}

export function fillInLine(missing: number): string {
  return missing > 1
    ? t('Fill in the required fields to continue')
    : t('Fill in the required field to continue')
}

// MARK: A server's Details (`wi`, `Ii`, `Fl`)

export function transportWord(transport: string): string {
  switch (transport) {
    case 'http':
      return 'HTTP'
    case 'sse':
      return 'SSE'
    case 'stdio':
      return t('Command')
    default:
      return transport
  }
}

export function sourceWord(isTeamServer: boolean): string {
  return isTeamServer ? t('Your team') : t('Added manually')
}

/** The meta line of a server's page: its address's host. */
export function hostLine(url: string | undefined): string | undefined {
  if (url == null) return undefined
  try {
    const host = new URL(url).hostname
    return host === '' ? undefined : host
  } catch {
    return undefined
  }
}

/** "n of m enabled" once the tools are read, else the server's own count. */
export function toolsValue(
  tools: readonly PluginTool[] | undefined,
  count: number,
): string {
  if (!tools || tools.length === 0) return `${count}`
  return enabledLine(tools)
}

/** The Tools card's summary (`ht`). */
export function enabledLine(tools: readonly PluginTool[]): string {
  return t`${tools.filter((tool) => !tool.isDisabled).length} of ${tools.length} enabled`
}

/** A value shown in Details: "—" when there is none. */
export function detailValue(value: string | undefined): string {
  return value == null || value === '' ? '—' : value
}

// MARK: A skill's page (`Hi`)

/** Save waits for an open agent, a change, and a name, a description and instructions, and for nothing saving. */
export function canSaveSkill(
  agentOpen: boolean,
  changed: boolean,
  name: string,
  description: string,
  body: string,
  saving: boolean,
): boolean {
  const filled = [name, description, body].every((one) => one.trim() !== '')
  return agentOpen && changed && filled && !saving
}

export const skillDescriptionHint = () =>
  t('Required. Describe when to use this skill.')

// MARK: More notices

export const needsAgentNotice = (): Notice => ({
  isError: true,
  text: t('Open an agent to add skills'),
})

export function skillsDidntSyncNotice(name: string, why: string): Notice {
  return {
    isError: true,
    text: t`Added ${name}, but its skills didn't sync: ${why}`,
  }
}

export function setupSavedNotice(name: string): Notice {
  return { isError: false, text: t`Saved ${name}'s setup values` }
}

export function savedNotice(name: string): Notice {
  return { isError: false, text: t`Saved ${name}` }
}

export function deletedNotice(name: string): Notice {
  return { isError: false, text: t`Deleted ${name}` }
}

export function agentFailedNotice(why: string): Notice {
  return { isError: true, text: t`Couldn't start the agent: ${why}` }
}
