// The card that asks to use this PC (SimeonCore's Approvals.swift:
// `LocalToolAsk`, `LocalAsk`; the window's `local-tool-permission`, `LLn`):
// one title whatever the agent asks for, Always allow, Allow once, Never,
// and Deny once on its × or Escape. It waits in a dock above the composer;
// once answered it is one line in the chat; an expired one is gone. Shown
// in the Windows app only: the web has no hands on the person's computer.

import type { Entry } from './entry'
import { field, str } from './json'
import { t } from './l10n'
import type { LocalToolPermission } from './localToolPermission'

export const LocalToolAsk = {
  title: () =>
    t('Allow Simeon and all agents to run commands on your local computer?'),
  description: () =>
    t(
      'This applies to Simeon and every agent. It can always be changed in Settings.',
    ),
  denyOnce: () => t('Deny once'),
  denyOnceTooltip: () => t('Deny once (Esc)'),
  failure: () =>
    t("Your answer didn't go through. Check your connection and try again."),
  loadingPolicy: () => t('Always allow is disabled while team policy loads'),
  blockedByPolicy: () => t('Always allow is disabled by team policy'),

  /** The answered card's line (`_Ln`). */
  outcome(status: string): string {
    switch (status) {
      case 'always':
        return t('Simeon can run commands on your computer.')
      case 'never':
        return t('Simeon cannot run commands on your computer.')
      case 'denied':
      case 'expired':
        return t('Simeon was not allowed to run commands on your computer.')
      default:
        return t('Simeon can run commands on your computer this time.')
    }
  },
}

/** What `resolveLocalToolPermission` takes. */
export type LocalAskResolution = 'allow-once' | 'deny' | 'always' | 'never'

/** One ask to use this PC, as the entry carries it (`message.ask`). */
export interface LocalAsk {
  entryId: string
  requestId: string
  /** `run-command`, `send-input`, `read-file`, `list-directory` or `write-file`. */
  action: string
  /** The command or the path. */
  target: string
  /** `pending`, `allowed`, `denied`, `always`, `never` or `expired`. */
  status: string
}

export function localAskOf(entry: Entry): LocalAsk | undefined {
  if (entry.kind !== 'send-message') return undefined
  const message = entry.message
  if (str(field(message, 'type')) !== 'local-tool-permission') return undefined
  const ask = field(message, 'ask')
  if (ask == null) return undefined
  return {
    entryId: entry.id,
    requestId: str(field(ask, 'requestId')) ?? '',
    action: str(field(ask, 'action')) ?? '',
    target: str(field(ask, 'target')) ?? '',
    status: str(field(ask, 'status')) ?? 'pending',
  }
}

/** The first ask still waiting in a chat: the one the dock shows (`entries.find(NNe)`). */
export function waitingAsk(entries: readonly Entry[]): LocalAsk | undefined {
  for (const entry of entries) {
    const ask = localAskOf(entry)
    if (ask?.status === 'pending') return ask
  }
  return undefined
}

/** Why Always allow is off (`alwaysBlocked`): while the team's policy loads, or below a ceiling of "Always allow". */
export function alwaysBlocked(
  ceilingKnown: boolean,
  ceiling: LocalToolPermission | undefined,
): string | undefined {
  if (!ceilingKnown) return LocalToolAsk.loadingPolicy()
  if (ceiling == null) return undefined
  return ceiling === 'always' ? undefined : LocalToolAsk.blockedByPolicy()
}

/** The steps of an answer, in their order, for the store to take (`LocalAskDock.answer`). */
export interface LocalAskSteps {
  /** Always allow and Never change the setting first: this choice. */
  choose(value: LocalToolPermission): Promise<LocalToolPermission | undefined>
  /** Allow once is written down before the computer is told. */
  allowOnce(approval: {
    id: string
    action: string
    target: string
  }): Promise<void>
  resolve(fields: {
    entryId: string
    requestId: string
    resolution: LocalAskResolution
    agentId: string
  }): Promise<void>
}

/**
 * The answer (`OLn`): Always allow and Never change the setting first and
 * fall back to once when it did not take (a team's ceiling, or the setting
 * not kept); Allow once is written down here first, or the hands would
 * refuse what the computer then asks; then the computer is told. Throws
 * when the computer was not told.
 */
export async function answerLocalAsk(
  ask: LocalAsk,
  agentId: string,
  resolution: LocalAskResolution,
  steps: LocalAskSteps,
): Promise<void> {
  let sent = resolution
  if (resolution === 'always' || resolution === 'never') {
    const wanted: LocalToolPermission =
      resolution === 'always' ? 'always' : 'never'
    const now = await steps.choose(wanted).catch(() => undefined)
    if (now !== wanted) sent = resolution === 'always' ? 'allow-once' : 'deny'
  }
  if (sent === 'allow-once')
    await steps.allowOnce({
      id: ask.requestId,
      action: ask.action,
      target: ask.target,
    })
  await steps.resolve({
    entryId: ask.entryId,
    requestId: ask.requestId,
    resolution: sent,
    agentId,
  })
}
