// The first run (SimeonCore's Onboarding.swift): one screen on the web, as
// on the Mac, "What should we call you?"; meanwhile, out of sight, the
// hand-off makes Simeon, the person's first agent (`AppStore.handOff`).
// Done once per account on any device: the host remembers it
// (`hasSeenOnboarding` in the computer's settings).

import { simeonFaceId } from './faces'
import type { JSONValue } from './json'
import { field, str } from './json'
import { t, tk } from './l10n'

/** The name step's title. */
export function nameTitle(): string {
  return t('What should we call you?')
}

/** The name field's placeholder and label. */
export function nameLabel(): string {
  return tk('onboarding.name')
}

export function failedLine(): string {
  return t('Simeon couldn’t finish setting up')
}

export function unreachableLine(): string {
  return t(
    "Can't reach your computer right now. Check your connection and try again.",
  )
}

/**
 * The hand-off's one line (the window's `jqn`, `Xqn`), from the newest
 * status of the computer: its image's percentage while it is pulled,
 * "Waking your computer…" while it sleeps.
 */
export function handOffLine(
  ready: boolean,
  percent?: number,
  sleeping = false,
): string {
  if (ready) return t('Getting your team ready…')
  if (percent != null) return t`Setting up your Simeon… ${percent}%`
  if (sleeping) return t('Waking your computer…')
  return t('Setting up your Simeon…')
}

/** The name step's field before the person types: the name they chose, else Google's or Apple's first name; never one made from the e-mail. */
export function suggestedName(profile: JSONValue): string | undefined {
  for (const key of ['preferredName', 'suggestedName']) {
    const name = str(field(profile, key))?.trim()
    if (name) return name
  }
  return undefined
}

/** The name as it is saved: spaces run together, trimmed, at most 60 characters. */
export function normalizedName(typed: string): string {
  return [...typed.split(/\s+/).filter(Boolean).join(' ')].slice(0, 60).join('')
}

/** Simeon's description as it is saved, in English like his title (the engine knows him by it). */
export const chiefOfStaffDescription =
  'Your Chief of Staff: manages your other Agents and pulls you in for decisions.'

/** Simeon, the person's first agent: the Chief of Staff, introduced at once. */
export function chiefOfStaff(nonce: string): JSONValue {
  return {
    name: 'Simeon',
    title: 'Chief of Staff',
    description: chiefOfStaffDescription,
    templateId: 'chief-of-staff',
    avatarShape: simeonFaceId,
    avatarColor: 'blue',
    avatarPngBase64: null,
    origin: 'user',
    isKickstartRequested: true,
    clientNonce: nonce,
  }
}

/** How long the hand-off shows at the least, how long it waits for the computer, and how often it asks (seconds). */
export const handOffDwell = 1.5
export const computerWait = 60
export const probeEvery = 2.5

/** The start-up gate: seen (done on some device, or the account has agents), needed (a new account), or unknown (the computer did not answer). */
export type FirstRun = 'seen' | 'needed' | 'unknown'
