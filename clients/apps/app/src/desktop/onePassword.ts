// Connecting 1Password from the Windows app (mac/Simeon/MacOnePassword.swift
// and OnePasswordCards.swift's `OnePasswordConnectCardView.connect`): the
// app runs 1Password's command-line tool on this PC (windows/src/main/
// outside/onePassword.ts), which asks the person's 1Password app (and
// Windows Hello) itself. In order: their accounts (a picker when there are
// several: pick one, press Connect again), then the vault "Shared with
// Simeon" in it (made when missing) and a key that can only read it; the
// key goes to the agent's computer (`connectOnePassword`), nothing is kept
// on this PC. A failure says the Mac's words, or 1Password's own.

import { t } from '../l10n'
import type { DesktopCalls } from './contract'
import type { Desktop } from './desktop'

/** 1Password's own page on setting up its command-line tool (`MacOnePassword.setupURL`). */
export const setupURL = 'https://developer.1password.com/docs/cli/get-started/'

export type OnePasswordAccount = {
  id: string
  email: string
  url: string
}

/** What the tool made: the key and its vault, for the computer. */
export type OnePasswordMade = Extract<
  ReturnType<DesktopCalls['onePasswordConnect']>,
  { token: string }
>

/** Why it didn't connect (`MacOnePassword.Failure`): no tool, one of the Mac's own refusals, or 1Password's own sentence. */
export type OnePasswordFailure =
  | {
      kind: 'noTool' | 'noAccounts' | 'noVault' | 'noKey' | 'noAnswer'
    }
  | { kind: 'refused'; said: string }

/** An account as the picker names it (`Account.label`). */
export function accountLabel(account: OnePasswordAccount): string {
  return account.url === ''
    ? account.email
    : `${account.email} · ${account.url}`
}

/** What the card says for a failure (`Failure.message`). */
export function failureMessage(failure: OnePasswordFailure): string {
  switch (failure.kind) {
    case 'noTool':
      return t(
        "Install 1Password's command-line tool, then turn on Integrate with 1Password CLI in the 1Password app (Settings → Developer).",
      )
    case 'noAccounts':
      return t(
        '1Password lists no accounts. Sign in to the 1Password app, then try again.',
      )
    case 'noVault':
      return t("1Password didn't make the vault.")
    case 'noKey':
      return t("1Password didn't give a key.")
    case 'noAnswer':
      return t("1Password didn't answer.")
    case 'refused':
      return failure.said
  }
}

/** The app's CLI integration is off or locked: How to set it up helps (`Failure.needsSetup`). */
export function needsSetup(failure: OnePasswordFailure): boolean {
  if (failure.kind === 'noTool') return true
  const said = failureMessage(failure).toLowerCase()
  // The Mac reads its own sentence for no accounts this way too ("…lists no accounts…"), in English.
  if (failure.kind === 'noAccounts') return true
  if (failure.kind !== 'refused') return false
  return (
    said.includes('app integration') ||
    said.includes('desktop app') ||
    said.includes('not signed in') ||
    said.includes('no accounts')
  )
}

/** One press of Connect: the accounts read (kept for the next press), then several to pick from, a failure, or the key made in the account chosen. */
export type ConnectStep = { accounts: OnePasswordAccount[] } & (
  | { kind: 'pick' }
  | { kind: 'failed'; failure: OnePasswordFailure }
  | { kind: 'made'; made: OnePasswordMade }
)

function failureOf(
  answer: { failure: string } | { refused: string },
): OnePasswordFailure {
  if ('refused' in answer) return { kind: 'refused', said: answer.refused }
  switch (answer.failure) {
    case 'noTool':
    case 'noAccounts':
    case 'noVault':
    case 'noKey':
      return { kind: answer.failure }
    default:
      return { kind: 'noAnswer' }
  }
}

/**
 * One press of Connect (`connect()`): with no accounts read yet, they are
 * read, the first chosen, and with several the person picks (then presses
 * again); with one chosen, the vault and its key are asked for.
 */
export async function connectStep(
  host: Desktop,
  accounts: readonly OnePasswordAccount[],
  chosen: string | undefined,
): Promise<ConnectStep> {
  let listed = [...accounts]
  try {
    if (listed.length === 0) {
      const answer = await host.call('onePasswordAccounts')
      if (!('accounts' in answer))
        return { accounts: [], kind: 'failed', failure: failureOf(answer) }
      listed = answer.accounts
      if (listed.length === 0)
        return { accounts: [], kind: 'failed', failure: { kind: 'noAccounts' } }
      // With several accounts the person picks one, then presses Connect again.
      if (listed.length > 1) return { accounts: listed, kind: 'pick' }
    }
    const account = listed.find((one) => one.id === chosen) ?? listed[0]
    if (!account)
      return { accounts: [], kind: 'failed', failure: { kind: 'noAccounts' } }
    const made = await host.call('onePasswordConnect', account.id)
    if (!('token' in made))
      return { accounts: listed, kind: 'failed', failure: failureOf(made) }
    return { accounts: listed, kind: 'made', made }
  } catch {
    return { accounts: listed, kind: 'failed', failure: { kind: 'noAnswer' } }
  }
}
