// The Credentials Store (the core's CredentialsStore.swift): the logins and
// the contact info the person keeps for their agents to sign in and sign up
// with. Simeon Labs' server holds them, sealed for this person
// (server/simeon/desktop/credentials.py), so they are changed here while the
// agents' computer sleeps; the agents see each login and the contact info,
// and type them in; cards stay with Link (Wallet). The entries as the server
// lists them (no password), read when the page opens; a login's password
// read only when asked for; a save, a change and a delete each said to the
// server and reflected at once. Shared with Settings' page
// (src/window/SettingsCredentials.tsx).

import {
  type JSONObject,
  type JSONValue,
  arr,
  bool,
  field,
  str,
  text,
} from './json'
import { t } from './l10n'
import { credentialSite } from './linkIcons'

export type CredentialKind = 'login' | 'contact'

/** One entry as the server lists it (`StoredCredential`): never its password. */
export interface StoredCredential {
  id: string
  kind: CredentialKind
  name: string
  website: string
  /** "acme.com", from the website; empty when it has none. */
  site: string
  username: string
  hasPassword: boolean
  hints: string
  /** The agent that saved it at a sign-up, when one did. */
  savedBy?: string
  fullName: string
  email: string
  phone: string
  addressLine1: string
  addressLine2: string
  city: string
  region: string
  postalCode: string
  country: string
}

export function storedCredential(
  json: JSONValue | undefined,
): StoredCredential | undefined {
  const id = text(field(json, 'id'))
  const kind = str(field(json, 'kind'))
  if (id === undefined || (kind !== 'login' && kind !== 'contact'))
    return undefined
  const words = (key: string) => str(field(json, key)) ?? ''
  const website = words('website')
  return {
    id,
    kind,
    name: words('name'),
    website,
    site: text(field(json, 'site')) ?? credentialSite(website),
    username: words('username'),
    hasPassword: bool(field(json, 'hasPassword')) ?? false,
    hints: words('hints'),
    savedBy: text(field(json, 'savedBy')),
    fullName: words('fullName'),
    email: words('email'),
    phone: words('phone'),
    addressLine1: words('addressLine1'),
    addressLine2: words('addressLine2'),
    city: words('city'),
    region: words('region'),
    postalCode: words('postalCode'),
    country: words('country'),
  }
}

/** The row's name: the person's own for it, else the site (a login) or the name on it (contact info). */
export function credentialTitle(entry: StoredCredential): string {
  const own = entry.name.trim()
  if (own !== '') return own
  if (entry.kind === 'login')
    return entry.site === '' ? entry.website : entry.site
  return (
    [entry.fullName, entry.email, entry.phone].find((one) => one !== '') ??
    t('Contact info')
  )
}

/** The line under it: the username, or the first of the email, the phone and the city. */
export function credentialSubtitle(entry: StoredCredential): string {
  if (entry.kind === 'login') return entry.username
  return [entry.email, entry.phone, entry.city].find((one) => one !== '') ?? ''
}

/** The site its icon comes from, for a login with a site (`iconSite`). */
export function iconSite(entry: StoredCredential): string | undefined {
  return entry.kind === 'login' && entry.site !== '' ? entry.site : undefined
}

// MARK: The editor (`CredentialDraft`)

/** What the editor holds while it is open: every field as typed. */
export interface CredentialDraft {
  kind: CredentialKind
  name: string
  website: string
  username: string
  password: string
  hints: string
  fullName: string
  email: string
  phone: string
  addressLine1: string
  addressLine2: string
  city: string
  region: string
  postalCode: string
  country: string
}

export function newDraft(kind: CredentialKind): CredentialDraft {
  return {
    kind,
    name: '',
    website: '',
    username: '',
    password: '',
    hints: '',
    fullName: '',
    email: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    region: '',
    postalCode: '',
    country: '',
  }
}

/** An entry as saved, its password as read (empty when it wasn't). */
export function draftOf(
  entry: StoredCredential,
  password = '',
): CredentialDraft {
  return {
    kind: entry.kind,
    name: entry.name,
    website: entry.website,
    username: entry.username,
    password,
    hints: entry.hints,
    fullName: entry.fullName,
    email: entry.email,
    phone: entry.phone,
    addressLine1: entry.addressLine1,
    addressLine2: entry.addressLine2,
    city: entry.city,
    region: entry.region,
    postalCode: entry.postalCode,
    country: entry.country,
  }
}

export type DraftField = Exclude<keyof CredentialDraft, 'kind'>

/** The fields of its kind, as the server names them, in its order. */
export function draftFields(kind: CredentialKind): DraftField[] {
  return kind === 'login'
    ? ['name', 'website', 'username', 'password', 'hints']
    : [
        'name',
        'fullName',
        'email',
        'phone',
        'addressLine1',
        'addressLine2',
        'city',
        'region',
        'postalCode',
        'country',
        'hints',
      ]
}

/** Whether anything is written yet (Save stays off until then). */
export function draftIsEmpty(draft: CredentialDraft): boolean {
  return draftFields(draft.kind).every((key) => draft[key].trim() === '')
}

/** The first thing to fix before it is saved, as the server would refuse it; none when it can be. */
export function draftProblem(draft: CredentialDraft): string | undefined {
  if (draft.kind === 'login') {
    const website = draft.website.trim()
    if (website !== '' && credentialSite(draft.website) === '')
      return t('Write the website like acme.com.')
    if (website === '' && draft.name.trim() === '') return t('Add the website.')
    if (draft.username.trim() === '' && draft.password === '')
      return t('Add the username or the password.')
    return undefined
  }
  const details = draftFields('contact').filter(
    (key) => key !== 'name' && key !== 'hints',
  )
  if (details.every((key) => draft[key].trim() === ''))
    return t('Add at least one detail.')
  return undefined
}

/** A new entry's body: every field of its kind; a password exactly as typed. */
export function draftBody(draft: CredentialDraft): JSONObject {
  const body: JSONObject = { kind: draft.kind }
  for (const key of draftFields(draft.kind))
    body[key] = key === 'password' ? draft.password : draft[key].trim()
  return body
}

/**
 * A change's body: only what differs from the entry as it was opened. A
 * password not read (`passwordRead` false) is sent only when one was typed,
 * so an entry opened without the person's OK keeps its own.
 */
export function draftChanges(
  draft: CredentialDraft,
  original: CredentialDraft,
  passwordRead: boolean,
): JSONObject {
  const body: JSONObject = {}
  for (const key of draftFields(draft.kind)) {
    const value = draft[key]
    if (key === 'password') {
      if (passwordRead ? value !== original.password : value !== '')
        body[key] = value
      continue
    }
    if (value.trim() !== original[key].trim()) body[key] = value.trim()
  }
  return body
}

// MARK: The page's model (`CredentialsStoreModel`)

/** One call to Simeon Labs' server: the path under `/desktop/api/`, its method and body. */
export type CredentialsCall = (
  path: string,
  method?: string,
  body?: JSONValue,
) => Promise<JSONValue>

/** What was refused, in the server's words (`localizedDescription`). */
function said(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sorted(list: StoredCredential[]): StoredCredential[] {
  const order = (entry: StoredCredential) => (entry.kind === 'login' ? 0 : 1)
  return [...list].sort((a, b) => {
    if (order(a) !== order(b)) return order(a) - order(b)
    const x = credentialTitle(a).toLowerCase()
    const y = credentialTitle(b).toLowerCase()
    return x < y ? -1 : x > y ? 1 : 0
  })
}

export class CredentialsStoreModel {
  entries: StoredCredential[] = []
  loaded = false
  loading = false
  /** What went wrong, in the person's words; the page shows it. */
  problem?: string
  private readonly listeners = new Set<() => void>()
  private version = 0

  constructor(private readonly call: CredentialsCall) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  private changed(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  get logins(): StoredCredential[] {
    return this.entries.filter((entry) => entry.kind === 'login')
  }

  get contacts(): StoredCredential[] {
    return this.entries.filter((entry) => entry.kind === 'contact')
  }

  async load(): Promise<void> {
    if (this.loading) return
    this.loading = true
    this.changed()
    try {
      const answer = await this.call('credentials')
      this.entries = sorted(
        (arr(field(answer, 'entries')) ?? [])
          .map(storedCredential)
          .filter((one): one is StoredCredential => one !== undefined),
      )
      this.loaded = true
      this.problem = undefined
    } catch (error) {
      this.problem = said(error)
    } finally {
      this.loading = false
      this.changed()
    }
  }

  /** A login's password, for the editor, once the person allowed it; kept nowhere here. */
  async password(entry: StoredCredential): Promise<string> {
    const answer = await this.call(`credentials/${entry.id}`)
    return str(field(field(answer, 'entry'), 'password')) ?? ''
  }

  /** A new entry, or a change to `editing`; the entry as saved, or none (and `problem`) when it couldn't be. */
  async save(
    draft: CredentialDraft,
    editing?: {
      entry: StoredCredential
      opened: CredentialDraft
      passwordRead: boolean
    },
  ): Promise<StoredCredential | undefined> {
    const problem = draftProblem(draft)
    if (problem !== undefined) {
      this.problem = problem
      this.changed()
      return undefined
    }
    try {
      const answer = editing
        ? await this.call(
            `credentials/${editing.entry.id}`,
            'PATCH',
            draftChanges(draft, editing.opened, editing.passwordRead),
          )
        : await this.call('credentials', 'POST', draftBody(draft))
      const saved = storedCredential(field(answer, 'entry'))
      if (!saved) throw new Error(t("That didn't work."))
      this.entries = sorted([
        ...this.entries.filter((entry) => entry.id !== saved.id),
        saved,
      ])
      this.problem = undefined
      return saved
    } catch (error) {
      this.problem = said(error)
      return undefined
    } finally {
      this.changed()
    }
  }

  async delete(entry: StoredCredential): Promise<boolean> {
    try {
      await this.call(`credentials/${entry.id}`, 'DELETE')
      this.entries = this.entries.filter((one) => one.id !== entry.id)
      this.problem = undefined
      return true
    } catch (error) {
      this.problem = said(error)
      return false
    } finally {
      this.changed()
    }
  }
}
