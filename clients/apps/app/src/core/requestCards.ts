// The cards an agent sends when it asks the person for something, as
// SimeonCore reads them: a secret (Chat.swift's `RequestCard.secret`), the
// computer handed over (`RequestCard.computer`, CloudComputer.swift's
// `HandoffCardState`, `HandoffOutcome` and `BoxStatus.Handoff`), the in-chat
// form (UserForm.swift's `UserFormCard`), and 1Password's fill and connect
// cards (OnePasswordCards.swift's `CredentialRequestCard`,
// `OnePasswordConnectCard`), with the words each card says.

import {
  type CredentialDraft,
  type CredentialKind,
  newDraft,
} from './credentialsStore'
import type { Entry } from './entry'
import {
  type JSONObject,
  type JSONValue,
  arr,
  bool,
  field,
  isObject,
  str,
  text,
} from './json'
import { t, tk } from './l10n'
import { credentialSite } from './linkIcons'

/** A value of `record` that is its own, never one of every object's (`constructor`, `__proto__`). */
function own<Value>(
  record: Readonly<Record<string, Value>>,
  key: string,
): Value | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined
}

/** Words as Swift's `trimmingCharacters(in: .whitespacesAndNewlines)` leaves them: tabs to returns, U+0085 and Unicode's separators taken off both ends; "" for anything but words. */
export function trimmed(value: unknown): string {
  return (text(value) ?? '').replace(
    /^[\t-\r\u0085\p{Z}]+|[\t-\r\u0085\p{Z}]+$/gu,
    '',
  )
}

/** Swift's `trimmingCharacters(in: .whitespaces)`: tabs and spaces, not line breaks. */
export function trimmedSpaces(value: string): string {
  return value.replace(/^[\t\p{Zs}]+|[\t\p{Zs}]+$/gu, '')
}

// MARK: Secrets

/** `secret-request`: a password field and Save securely (`submitSecret`), or the X (`dismissWidget`), a decline. */
export interface SecretCard {
  label: string
  description: string
  /** The computer kept it (`secretProvided`). */
  provided: boolean
  /** Dismissed with its X (`widgetDismissed`). */
  dismissed: boolean
}

export function secretCard(entry: Entry): SecretCard | undefined {
  const secret = field(entry.message, 'secretRequest')
  if (secret == null) return undefined
  return {
    label: str(field(secret, 'label')) ?? t('A secret'),
    description: str(field(secret, 'description')) ?? '',
    provided: bool(entry.get('secretProvided')) ?? false,
    dismissed: bool(entry.get('widgetDismissed')) ?? false,
  }
}

// MARK: The computer handed over

/** A message with `boxRequestId`: "Your turn on the computer" (`handBackForeverBox`). */
export interface ComputerCard {
  requestId: string
  instruction: string
  /** The word the engine wrote once it ended (`boxResolution`); none while it waits. */
  resolution?: string
}

export function computerCard(entry: Entry): ComputerCard | undefined {
  const requestId = text(entry.get('boxRequestId'))
  const message = entry.message
  if (requestId == null || message == null) return undefined
  return {
    requestId,
    instruction: str(field(message, 'content')) ?? '',
    resolution: text(entry.get('boxResolution')),
  }
}

/**
 * How a hand-off ended, from `boxResolution`: I'm done (`completed`, and the
 * older `handed_back`) is Done, a reply Answered, Skip (`dismissed`) Skipped,
 * Stop task (`cancelled`) Canceled; any other word Done.
 */
export type HandoffOutcome = 'done' | 'answered' | 'skipped' | 'canceled'

export function handoffOutcome(resolution?: string): HandoffOutcome {
  switch (resolution) {
    case 'replied':
      return 'answered'
    case 'dismissed':
      return 'skipped'
    case 'cancelled':
    case 'canceled':
      return 'canceled'
    default:
      return 'done'
  }
}

/** What happened, in words: "Done", "Answered", "Skipped" or "Canceled". */
export function handoffOutcomeLabel(outcome: HandoffOutcome): string {
  switch (outcome) {
    case 'done':
      return tk('handoff.done')
    case 'answered':
      return tk('handoff.answered')
    case 'skipped':
      return tk('handoff.skipped')
    case 'canceled':
      return tk('handoff.canceled')
  }
}

/** The agent waiting on the person at the computer, as the computer's status carries it (`BoxStatus.Handoff`). */
export interface PendingHandoff {
  requestId: string
  instruction: string
  /** A picture of the screen when the agent asked (`data:image/webp;base64,…`). */
  snapshotDataUrl?: string
}

/** The hand-off in a computer's status (`forever-box`, `getForeverBoxStatus`), when it has one. */
export function pendingHandoff(
  status: JSONValue | undefined,
): PendingHandoff | undefined {
  if (!isObject(status)) return undefined
  const handoff = field(status, 'handoff')
  const requestId = text(field(handoff, 'requestId'))
  if (requestId == null) return undefined
  return {
    requestId,
    instruction: str(field(handoff, 'instruction')) ?? '',
    snapshotDataUrl: text(field(handoff, 'snapshotDataUrl')),
  }
}

/** The card's state (`HandoffCardState`): waiting, its words, the screen's picture, and how it ended. */
export interface HandoffCardState {
  waiting: boolean
  instruction: string
  snapshotDataUrl?: string
  ending: HandoffOutcome
  /** What happened, in words. */
  outcome: string
}

/**
 * Waiting while the computer's status carries this very request (its words
 * and picture then), and also while the line has no answer yet; settled,
 * what happened (`HandoffCardState.of`).
 */
export function handoffCardState(
  card: ComputerCard,
  handoff: PendingHandoff | undefined,
): HandoffCardState {
  const pending = handoff?.requestId === card.requestId ? handoff : undefined
  const ending = handoffOutcome(card.resolution)
  return {
    waiting: pending != null || card.resolution == null,
    instruction: pending?.instruction ?? card.instruction,
    snapshotDataUrl: pending?.snapshotDataUrl,
    ending,
    outcome: handoffOutcomeLabel(ending),
  }
}

// MARK: The in-chat form (UserForm.swift)

export type FormState = 'open' | 'filling' | 'filled' | 'failed' | 'dismissed'
export type FormFieldKind =
  | 'text'
  | 'email'
  | 'tel'
  | 'password'
  | 'otp'
  | 'number'
  | 'date'
  | 'select'
  | 'textarea'
  | 'checkbox'
/** How one field went: typed in, couldn't be, or left empty. */
export type FormOutcome = 'filled' | 'fillFailed' | 'notFilled'

const formStates: readonly FormState[] = [
  'open',
  'filling',
  'filled',
  'failed',
  'dismissed',
]
const fieldKinds: readonly FormFieldKind[] = [
  'text',
  'email',
  'tel',
  'password',
  'otp',
  'number',
  'date',
  'select',
  'textarea',
  'checkbox',
]
const formOutcomes: readonly FormOutcome[] = [
  'filled',
  'fillFailed',
  'notFilled',
]

export interface FormOption {
  label: string
  value: string
}

export interface FormField {
  id: string
  label: string
  kind: FormFieldKind
  /** Masked: always a password or a code. */
  secret: boolean
  /** Never a checkbox. */
  required: boolean
  placeholder?: string
  options: FormOption[]
}

/**
 * `user-form`: a page on the agent's computer needs the person to type
 * something; Fill in sends the values to the computer (`submitUserForm`),
 * which types them into the page, and the X is a decline
 * (`dismissUserForm`). The entry carries where it stands (`formState`,
 * `formOutcomes`, `formNote`).
 */
export interface UserFormCard {
  title: string
  instruction: string
  /** The site it is typed into: "acme.com". */
  domain: string
  /** Enter is pressed once it is in (a lone one-time code). */
  submitsAfterFill: boolean
  fields: FormField[]
  state: FormState
  outcomes: ReadonlyMap<string, FormOutcome>
  /** Why it couldn't be typed in, in the person's language. */
  note?: string
}

export function formField(
  id: string,
  label: string,
  kind: FormFieldKind,
  more: {
    secret?: boolean
    required?: boolean
    placeholder?: string
    options?: FormOption[]
  } = {},
): FormField {
  return {
    id,
    label,
    kind,
    secret: (more.secret ?? false) || kind === 'password' || kind === 'otp',
    required: (more.required ?? true) && kind !== 'checkbox',
    placeholder: more.placeholder,
    options: more.options ?? [],
  }
}

/** The form, or none when it lacks a title, a site or a field it can read: the chat then says it can't be shown. */
export function userFormCard(entry: Entry): UserFormCard | undefined {
  const form = field(entry.message, 'form')
  if (!isObject(form)) return undefined
  const title = trimmed(form.title)
  const domain = trimmed(form.domain)
  const fields: FormField[] = []
  for (const raw of arr(form.fields) ?? []) {
    const id = trimmed(field(raw, 'id'))
    const label = trimmed(field(raw, 'label'))
    const kind = trimmed(field(raw, 'type')) as FormFieldKind
    if (id === '' || label === '' || !fieldKinds.includes(kind)) continue
    const options: FormOption[] = []
    for (const option of arr(field(raw, 'options')) ?? []) {
      const name = trimmed(field(option, 'label'))
      if (name === '') continue
      const value = trimmed(field(option, 'value'))
      options.push({ label: name, value: value === '' ? name : value })
    }
    const placeholder = trimmed(field(raw, 'placeholder'))
    fields.push(
      formField(id, label, kind, {
        secret: bool(field(raw, 'secret')) ?? false,
        required: bool(field(raw, 'required')) ?? true,
        placeholder: placeholder === '' ? undefined : placeholder,
        options,
      }),
    )
  }
  if (title === '' || domain === '' || fields.length === 0) return undefined
  const state = trimmed(entry.get('formState')) as FormState
  const outcomes = new Map<string, FormOutcome>()
  const stamped = entry.get('formOutcomes')
  if (isObject(stamped))
    for (const [id, value] of Object.entries(stamped)) {
      const outcome = text(value) as FormOutcome | undefined
      if (outcome && formOutcomes.includes(outcome)) outcomes.set(id, outcome)
    }
  const note = trimmed(entry.get('formNote'))
  return {
    title,
    instruction: trimmed(form.instruction),
    domain,
    submitsAfterFill: bool(form.submitAfterFill) ?? false,
    fields,
    state: formStates.includes(state) ? state : 'open',
    outcomes,
    note: note === '' ? undefined : note,
  }
}

/** Fill in is pressed only once every field it needs has something in it. */
export function canFill(
  card: UserFormCard,
  values: Readonly<Record<string, string>>,
): boolean {
  return card.fields.every(
    (one) => !one.required || trimmedSpaces(own(values, one.id) ?? '') !== '',
  )
}

/** What is sent: the form's own fields only, a checkbox as "true" or "false". */
export function formValues(
  card: UserFormCard,
  typed: Readonly<Record<string, string>>,
): JSONObject {
  return Object.fromEntries(
    card.fields.map((one) => {
      const value = own(typed, one.id) ?? ''
      return [
        one.id,
        one.kind === 'checkbox' ? (value === 'true' ? 'true' : 'false') : value,
      ]
    }),
  )
}

/** Some field couldn't be typed in. */
export function formPartlyFailed(card: UserFormCard): boolean {
  return card.fields.some((one) => card.outcomes.get(one.id) === 'fillFailed')
}

/** The pill once it is answered: Filled, Partly filled, Not filled, Dismissed; "Filling in…" while it is typed. */
export function formStatusLine(card: UserFormCard): string | undefined {
  switch (card.state) {
    case 'open':
      return undefined
    case 'filling':
      return t('Filling in…')
    case 'dismissed':
      return t('Dismissed')
    case 'failed':
      return t('Not filled')
    case 'filled':
      return formPartlyFailed(card) ? t('Partly filled') : t('Filled')
  }
}

/** One field's line once it is answered: "Typed in", "Couldn't type it in" or "Left empty". */
export function formOutcomeLine(
  card: UserFormCard,
  one: FormField,
): string | undefined {
  switch (card.outcomes.get(one.id)) {
    case 'filled':
      return t('Typed in')
    case 'fillFailed':
      return t("Couldn't type it in")
    case 'notFilled':
      return t('Left empty')
    case undefined:
      return undefined
  }
}

// MARK: 1Password's fill card (OnePasswordCards.swift)

export type CredentialState =
  | 'open'
  | 'filling'
  | 'filled'
  | 'failed'
  | 'declined'
export type CredentialOutcome = 'filled' | 'fillFailed' | 'notFound'

const credentialStates: readonly CredentialState[] = [
  'open',
  'filling',
  'filled',
  'failed',
  'declined',
]
const credentialOutcomes: readonly CredentialOutcome[] = [
  'filled',
  'fillFailed',
  'notFound',
]

/**
 * `credential-request`: at a sign-in on a page open on the agent's
 * computer, a login the person keeps in their 1Password vault shared with
 * Simeon. Fill lets the computer type it into the page
 * (`answerCredentialRequest`); Not now is a decline. The username, password
 * and code never come here.
 */
export interface CredentialCard {
  /** The login's name in 1Password: "Acme". */
  title: string
  /** The site the page is on: "acme.com". */
  site: string
  /** The agent's one sentence on why. */
  purpose: string
  state: CredentialState
  outcomes: ReadonlyMap<string, CredentialOutcome>
  note?: string
}

/** The card, or none when it lacks the login's name or its site: the chat then says it can't be shown. */
export function credentialCard(entry: Entry): CredentialCard | undefined {
  const credential = field(entry.message, 'credential')
  if (!isObject(credential)) return undefined
  const title = trimmed(credential.title)
  const site = trimmed(credential.site)
  if (title === '' || site === '') return undefined
  const state = trimmed(entry.get('credentialState')) as CredentialState
  const outcomes = new Map<string, CredentialOutcome>()
  const stamped = entry.get('credentialOutcomes')
  if (isObject(stamped))
    for (const [key, value] of Object.entries(stamped)) {
      const outcome = text(value) as CredentialOutcome | undefined
      if (outcome && credentialOutcomes.includes(outcome))
        outcomes.set(key, outcome)
    }
  const note = trimmed(entry.get('credentialNote'))
  return {
    title,
    site,
    purpose: trimmed(credential.purpose),
    state: credentialStates.includes(state) ? state : 'open',
    outcomes,
    note: note === '' ? undefined : note,
  }
}

/** The words the person confirms: "Fill your Acme login on acme.com". */
export function credentialConfirmReason(card: CredentialCard): string {
  return t`Fill your ${card.title} login on ${card.site}`
}

/** The pill once answered. */
export function credentialStatusLine(card: CredentialCard): string | undefined {
  switch (card.state) {
    case 'open':
      return undefined
    case 'filling':
      return t('Filling in…')
    case 'filled':
      return t('Filled')
    case 'failed':
      return t('Not filled')
    case 'declined':
      return t('Declined')
  }
}

/** "Username and password filled": what went in, in a line. */
export function credentialOutcomeLine(
  card: CredentialCard,
): string | undefined {
  if (card.state !== 'filled') return undefined
  const filled = (key: string) => card.outcomes.get(key) === 'filled'
  const username = filled('username')
  const password = filled('password')
  const code = filled('otp')
  if (username && password && code)
    return t('Username, password and code filled')
  if (username && password) return t('Username and password filled')
  if (password && code) return t('Password and code filled')
  if (password) return t('Password filled')
  if (username) return t('Username filled')
  if (code) return t('Code filled')
  return undefined
}

// MARK: 1Password's connect card

export type OnePasswordConnectState = 'open' | 'connected' | 'dismissed'

const connectStates: readonly OnePasswordConnectState[] = [
  'open',
  'connected',
  'dismissed',
]

/**
 * `onepassword-connect`: the agent needs a login and 1Password isn't
 * connected. On the Mac, Connect asks the person's 1Password app for a vault
 * named "Shared with Simeon" and a read-only key for it, and sends the key to
 * the agent's computer (`connectOnePassword`); the X is a decline
 * (`dismissOnePasswordConnect`).
 */
export interface OnePasswordConnectCard {
  reason?: string
  state: OnePasswordConnectState
  /** The 1Password account it was connected with. */
  account?: string
}

export function onePasswordConnectCard(entry: Entry): OnePasswordConnectCard {
  const reason = trimmed(field(entry.message, 'reason'))
  const state = trimmed(entry.get('connectState')) as OnePasswordConnectState
  const account = trimmed(entry.get('connectAccount'))
  return {
    reason: reason === '' ? undefined : reason,
    state: connectStates.includes(state) ? state : 'open',
    account: account === '' ? undefined : account,
  }
}

export function connectStatusLine(
  card: OnePasswordConnectCard,
): string | undefined {
  switch (card.state) {
    case 'open':
      return undefined
    case 'connected':
      return t('Connected')
    case 'dismissed':
      return t('Dismissed')
  }
}

// MARK: The Credentials Store's card

export type StoreEntryMode = 'request' | 'used' | 'saved'
export type StoreEntryState = 'open' | 'saved' | 'dismissed'

/**
 * `store-entry` (9 November 2026, CredentialsStore.swift's
 * `StoreEntryCard`), drawn as the connector card: the ask (`request`),
 * where the agent offers to keep a login, a card or contact info and Save
 * or Add opens the store's form for it, already filled; once saved it says
 * Saved and the agent carries on (`answerStoreEntry`). The notes (`used`,
 * `saved`): a saved login the agent signed in with, or one it saved at a
 * sign-up.
 */
export interface StoreEntryCard {
  mode: StoreEntryMode
  kind: CredentialKind
  /** What it's for: "Amazon", "Home", a card's name. */
  title: string
  /** A login's site ("amazon.com"). */
  website?: string
  reason?: string
  state: StoreEntryState
}

const storeModes: readonly StoreEntryMode[] = ['request', 'used', 'saved']
const storeStates: readonly StoreEntryState[] = ['open', 'saved', 'dismissed']
const storeKinds: readonly CredentialKind[] = ['login', 'card', 'contact']

/** The card, or none without what it's for (the chat then says it can't be shown). */
export function storeEntryCard(
  message: JSONValue | undefined,
  storeState?: JSONValue,
): StoreEntryCard | undefined {
  const store = field(message, 'store')
  const mode = trimmed(field(store, 'mode')) as StoreEntryMode
  const kind = trimmed(field(store, 'kind')) as CredentialKind
  const title = trimmed(field(store, 'title'))
  if (!storeModes.includes(mode) || !storeKinds.includes(kind) || title === '')
    return undefined
  const website = trimmed(field(store, 'website'))
  const reason = trimmed(field(store, 'reason'))
  const state = trimmed(storeState) as StoreEntryState
  return {
    mode,
    kind,
    title,
    website: website === '' ? undefined : website,
    reason: reason === '' ? undefined : reason,
    state: storeStates.includes(state) ? state : 'open',
  }
}

/** The line under its name, as the connector card's reason: why the agent asks, else the site or what it is; a note says what was done. */
export function storeLine(card: StoreEntryCard): string | undefined {
  if (card.mode === 'used') return t('Signed in with your saved login')
  if (card.mode === 'saved') return card.website
  if (card.reason !== undefined) return card.reason
  if (card.kind === 'card') return t('Card')
  if (card.kind === 'contact') return t('Contact info')
  return card.website
}

/** Waiting on the person: Save (a login) or Add at its right. */
export function storeAsks(card: StoreEntryCard): boolean {
  return card.mode === 'request' && card.state === 'open'
}

/** Saved: "Saved" in green at its right, as "Connected" on the connector card. */
export function storeIsSaved(card: StoreEntryCard): boolean {
  return card.mode === 'saved' || card.state === 'saved'
}

/** A login's site icon. */
export function storeIconSite(card: StoreEntryCard): string | undefined {
  if (card.kind !== 'login') return undefined
  const site = credentialSite(card.website ?? '')
  return site === '' ? undefined : site
}

/** The store's form the button opens, already filled with what the agent knows. */
export function storeDraft(card: StoreEntryCard): CredentialDraft {
  const draft = newDraft(card.kind)
  if (card.kind === 'login') {
    draft.website = card.website ?? ''
    if (credentialSite(card.title) !== credentialSite(draft.website))
      draft.name = card.title
  } else {
    draft.name = card.title
  }
  return draft
}
