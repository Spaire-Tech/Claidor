// One account of an app Simeon Labs' server serves (Gmail, Slack, …): Add
// Another Account (29 October 2026; SimeonCore's AppAccounts.swift). The
// server keeps each app's accounts (`server/simeon/desktop/apps.py`), names
// each by the person's own name for it (the pencil) or by who it signs in as
// (Gmail's address), and, once there are several, has each of the app's
// tools ask which one (`use_account`); the agent asks the person when they
// haven't said. The store's side (read, add, rename, remove) is its "Step
// 6d" section.

import { arr, field, int, text } from './json'
import { t } from './l10n'

export interface AppAccount {
  id: string
  /** The person's own name for it ("Work"). */
  name?: string
  /** Who it signs in as, as the app says (an address, a workspace), when it says. */
  identity?: string
  /** What the agent calls it. */
  label: string
}

/** An account as the server lists it; none without an id (`AppAccount(json:)`). */
export function appAccountFrom(json: unknown): AppAccount | undefined {
  const id = text(field(json, 'id'))
  if (id === undefined) return undefined
  return {
    id,
    name: text(field(json, 'name')),
    identity: text(field(json, 'identity')),
    label: text(field(json, 'label')) ?? id,
  }
}

/** Its row's title: the person's name for it, else who it signs in as, else its place ("Account 2"). */
export function accountTitle(account: AppAccount, place: number): string {
  return account.name ?? account.identity ?? t`Account ${place}`
}

/** Under a name the person gave it: who it signs in as. */
export function accountDetail(account: AppAccount): string | undefined {
  return account.name === undefined ? undefined : account.identity
}

/** An app's accounts as the server last listed them, and how many it may have. */
export interface AppAccounts {
  accounts: AppAccount[]
  max: number
}

/** The server's list (`{toolkit, accounts, max}`); none for anything else (a refusal). */
export function appAccountsFrom(json: unknown): AppAccounts | undefined {
  const list = arr(field(json, 'accounts'))
  if (!list) return undefined
  return {
    accounts: list
      .map(appAccountFrom)
      .filter((one): one is AppAccount => one !== undefined),
    max: int(field(json, 'max')) ?? 5,
  }
}

/** Add Another Account shows while there is room for one more (the first account is Connect's). */
export function canAddAnother(held: AppAccounts): boolean {
  return held.accounts.length > 0 && held.accounts.length < held.max
}

const marker = '/desktop/api/apps/mcp/'

/** The toolkit of an app Simeon's server serves, from its address (`…/desktop/api/apps/mcp/gmail`); none for any other server (`AppAccounts.toolkit(serverURL:)`). */
export function toolkitOf(serverURL: string | undefined): string | undefined {
  if (serverURL === undefined) return undefined
  let path: string
  try {
    // The path as Foundation's `URLComponents.path` reads it: its escapes undone.
    path = decodeURIComponent(new URL(serverURL).pathname)
  } catch {
    return undefined
  }
  const at = path.indexOf(marker)
  if (at < 0) return undefined
  const toolkit = path.slice(at + marker.length).split('/')[0] ?? ''
  return toolkit !== '' && toolkit.length <= 64 && /^[a-z0-9_]+$/.test(toolkit)
    ? toolkit
    : undefined
}

/** An account's id as it goes in the address: all but letters, digits, "-" and "_" escaped (dots too), as the core escapes it. */
export function accountPath(id: string): string {
  return id.replace(/[^\p{L}\p{M}\p{N}_-]/gu, (one) =>
    [...new TextEncoder().encode(one)]
      .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`)
      .join(''),
  )
}
