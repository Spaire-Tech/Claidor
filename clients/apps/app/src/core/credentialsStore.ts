// The Credentials Store (the core's CredentialsStore.swift): the logins and
// the contact info the person keeps for their agents to sign in and sign up
// with. Simeon Labs' server holds them, sealed for this person
// (server/simeon/desktop/credentials.py), so they are changed here while the
// agents' computer sleeps; the agents see each login and the contact info,
// and type them in. Cards (9 November 2026, the founder: "actual cards there
// that the agent can use to make payments"): the agents see a card's brand,
// last four digits and expiry; the computer types the rest into a checkout
// the person approved. The entries as the server
// lists them (no password), read when the page opens; a login's password
// read only when asked for; a save, a change and a delete each said to the
// server and reflected at once. Shared with Settings' page
// (src/window/SettingsCredentials.tsx).

import { cardIsExpired } from './formEntry'
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

export type CredentialKind = 'login' | 'contact' | 'card'

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
  /** A card's name on the card. */
  cardholder: string
  /** A card's network, as the server read it from the number (`visa`, `mastercard`, `amex`…). */
  brand: string
  last4: string
  /** "08/28". */
  expiry: string
  hasSecurityCode: boolean
  /** The contact info whose address bills the card, when one was chosen. */
  billingId: string
}

export function storedCredential(
  json: JSONValue | undefined,
): StoredCredential | undefined {
  const id = text(field(json, 'id'))
  const kind = str(field(json, 'kind'))
  if (
    id === undefined ||
    (kind !== 'login' && kind !== 'contact' && kind !== 'card')
  )
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
    cardholder: words('cardholder'),
    brand: words('brand'),
    last4: words('last4'),
    expiry: words('expiry'),
    hasSecurityCode: bool(field(json, 'hasSecurityCode')) ?? false,
    billingId: words('billingId'),
  }
}

// MARK: A card's number (`CardNumber`)

/** The digits alone, spaces and dashes gone. */
export function cardDigits(text: string): string {
  return text.replace(/[^0-9]/g, '')
}

/** The network from the first digits, as the server reads it (`card_brand`). */
export function cardBrand(text: string): string {
  const number = cardDigits(text)
  const prefix = (count: number) => Number(number.slice(0, count) || -1)
  if (number.startsWith('4')) return 'visa'
  if (
    (prefix(2) >= 51 && prefix(2) <= 55) ||
    (prefix(4) >= 2221 && prefix(4) <= 2720)
  )
    return 'mastercard'
  if (prefix(2) === 34 || prefix(2) === 37) return 'amex'
  if (
    number.startsWith('6011') ||
    number.startsWith('65') ||
    (prefix(3) >= 644 && prefix(3) <= 649)
  )
    return 'discover'
  if (prefix(4) >= 3528 && prefix(4) <= 3589) return 'jcb'
  if (
    prefix(2) === 36 ||
    prefix(2) === 38 ||
    (prefix(3) >= 300 && prefix(3) <= 305)
  )
    return 'diners'
  if (number.startsWith('62')) return 'unionpay'
  return ''
}

/** The network's name as people know it. */
export function cardBrandName(brand: string): string | undefined {
  return (
    {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'American Express',
      discover: 'Discover',
      jcb: 'JCB',
      diners: 'Diners Club',
      unionpay: 'UnionPay',
    } as Record<string, string>
  )[brand]
}

/** 12 to 19 digits that pass the check every card number passes (Luhn). */
export function cardNumberValid(text: string): boolean {
  const number = cardDigits(text)
  if (number.length < 12 || number.length > 19) return false
  if (text.replace(/[\s-]/g, '') !== number) return false
  let total = 0
  ;[...number].reverse().forEach((digit, index) => {
    let value = Number(digit)
    if (index % 2 === 1) value = value > 4 ? value * 2 - 9 : value * 2
    total += value
  })
  return total % 10 === 0
}

/** "08/28" from "8/28", "08/2028" or "0828"; none when it isn't a month and a year. */
export function cardExpiry(text: string): string | undefined {
  let value = text.trim()
  if (/^\d{4}$/.test(value)) value = `${value.slice(0, 2)}/${value.slice(2)}`
  const match = /^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/.exec(value)
  if (!match) return undefined
  const month = Number(match[1])
  if (month < 1 || month > 12) return undefined
  return `${String(month).padStart(2, '0')}/${(match[2] ?? '').slice(-2)}`
}

/** A contact's address on one line, as a card's billing address is chosen by it. */
export function addressLine(entry: StoredCredential): string {
  return [entry.addressLine1, entry.city, entry.postalCode, entry.country]
    .filter((one) => one !== '')
    .join(', ')
}

/** The row's name: the person's own for it, else the site (a login) or the name on it (contact info). */
export function credentialTitle(entry: StoredCredential): string {
  const own = entry.name.trim()
  if (own !== '') return own
  if (entry.kind === 'login')
    return entry.site === '' ? entry.website : entry.site
  if (entry.kind === 'card') return cardBrandName(entry.brand) ?? t('Card')
  return (
    [entry.fullName, entry.email, entry.phone].find((one) => one !== '') ??
    t('Contact info')
  )
}

/** The line under it: the username, or the first of the email, the phone and the city. */
export function credentialSubtitle(entry: StoredCredential): string {
  if (entry.kind === 'login') return entry.username
  if (entry.kind === 'card')
    return [entry.last4 === '' ? '' : `•••• ${entry.last4}`, entry.expiry]
      .filter((one) => one !== '')
      .join(' · ')
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
  cardholder: string
  /** A card's number as typed; empty for a saved card until it is read or typed again. */
  number: string
  expiry: string
  securityCode: string
  billingId: string
  /** A saved card's number stays as it is unless another is typed. */
  hasSavedNumber: boolean
}

/** The fields only the whole entry gives (read once the person allowed it), sent only when changed. */
const SECRETS = new Set(['password', 'number', 'securityCode'])

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
    cardholder: '',
    number: '',
    expiry: '',
    securityCode: '',
    billingId: '',
    hasSavedNumber: false,
  }
}

/** An entry as saved, its password (and a card's number and code) as read (empty when they weren't). */
export function draftOf(
  entry: StoredCredential,
  password = '',
  card: { number?: string; securityCode?: string } = {},
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
    cardholder: entry.cardholder,
    number: card.number ?? '',
    expiry: entry.expiry,
    securityCode: card.securityCode ?? '',
    billingId: entry.billingId,
    hasSavedNumber: entry.kind === 'card',
  }
}

export type DraftField = Exclude<
  keyof CredentialDraft,
  'kind' | 'hasSavedNumber'
>

/** The fields of its kind, as the server names them, in its order. */
export function draftFields(kind: CredentialKind): DraftField[] {
  if (kind === 'card')
    return [
      'name',
      'cardholder',
      'number',
      'expiry',
      'securityCode',
      'billingId',
      'hints',
    ]
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

/** Whether anything is written yet (Save stays off until then); a contact's country, chosen for the person, is nothing written. */
export function draftIsEmpty(draft: CredentialDraft): boolean {
  return draftFields(draft.kind).every(
    (key) =>
      draft[key].trim() === '' ||
      (draft.kind === 'contact' && key === 'country'),
  )
}

/** One @, something before it, a dot in what follows, no spaces: name@example.com. */
export function looksLikeEmail(text: string): boolean {
  const parts = text.split('@')
  if (parts.length !== 2 || parts[0] === '' || /\s/.test(text)) return false
  const domain = parts[1] ?? ''
  return (
    domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.')
  )
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
  if (draft.kind === 'card') {
    if (
      !(draft.hasSavedNumber && draft.number.trim() === '') &&
      !cardNumberValid(draft.number)
    )
      return t('Check the card number.')
    if (cardExpiry(draft.expiry) === undefined)
      return t('Write the expiry like 08/28.')
    if (cardIsExpired(draft.expiry)) return t('This card has expired.')
    const code = draft.securityCode.trim()
    if (code !== '' && !/^\d{3,4}$/.test(code))
      return t('The security code is 3 or 4 digits.')
    return undefined
  }
  const details = draftFields('contact').filter(
    (key) => key !== 'name' && key !== 'hints' && key !== 'country',
  )
  if (details.every((key) => draft[key].trim() === ''))
    return t('Add at least one detail.')
  const email = draft.email.trim()
  if (email !== '' && !looksLikeEmail(email)) return t('Check the email.')
  return undefined
}

/** A new entry's body: every field of its kind; a password exactly as typed. */
export function draftBody(draft: CredentialDraft): JSONObject {
  const body: JSONObject = { kind: draft.kind }
  for (const key of draftFields(draft.kind))
    body[key] =
      key === 'password'
        ? draft.password
        : key === 'expiry'
          ? (cardExpiry(draft.expiry) ?? draft.expiry.trim())
          : draft[key].trim()
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
    if (SECRETS.has(key)) {
      if (passwordRead ? value !== original[key] : value !== '')
        body[key] = key === 'password' ? value : value.trim()
      continue
    }
    if (value.trim() !== original[key].trim())
      body[key] =
        key === 'expiry' ? (cardExpiry(value) ?? value.trim()) : value.trim()
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
  const order = (entry: StoredCredential) =>
    entry.kind === 'login' ? 0 : entry.kind === 'card' ? 1 : 2
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

  get cards(): StoredCredential[] {
    return this.entries.filter((entry) => entry.kind === 'card')
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

  /** A card's number and security code, for the editor, once the person allowed it; kept nowhere here. */
  async cardSecrets(
    entry: StoredCredential,
  ): Promise<{ number: string; securityCode: string }> {
    const answer = await this.call(`credentials/${entry.id}`)
    const whole = field(answer, 'entry')
    return {
      number: str(field(whole, 'number')) ?? '',
      securityCode: str(field(whole, 'securityCode')) ?? '',
    }
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
