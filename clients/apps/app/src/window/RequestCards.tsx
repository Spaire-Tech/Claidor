// Step 3b: what an agent asks of the person (mac/Simeon/Cards.swift's
// `SecretCardView` and `ComputerHandoffCard`, UserFormCard.swift,
// OnePasswordCards.swift): a secret to give, the computer handed over, an
// in-chat form, 1Password's fill and connect cards, the Credentials Store's
// card (its button opens the store's own sheet over the chat, filled; 9
// November 2026). Read by `src/core/requestCards.ts`.
//
// 1Password's Connect needs the 1Password app's command-line tool on this
// computer: in the Windows app it runs there (step 7d,
// src/desktop/onePassword.ts); on the web the card has only its X, so no
// button does nothing. 1Password's Fill asks for the person's OK where the
// Mac asks for Touch ID: Windows Hello in the Windows app, else the
// window's own alert (presence.ts). The hand-off's Take
// over, Open computer and the screen's picture open the computer over the
// window (step 5b, ComputerView.tsx).

import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CardKind } from '../core/chat'
import { CredentialsStoreModel, newDraft } from '../core/credentialsStore'
import {
  type ComputerCard,
  type CredentialCard,
  type FormField,
  type OnePasswordConnectCard,
  type SecretCard,
  type StoreEntryCard,
  type UserFormCard,
  canFill,
  computerCard,
  connectStatusLine,
  credentialCard,
  credentialConfirmReason,
  credentialOutcomeLine,
  credentialStatusLine,
  formLogin,
  formOutcomeLine,
  formPartlyFailed,
  formStatusLine,
  formValues,
  handoffCardState,
  onePasswordConnectCard,
  secretCard,
  storeAsks,
  storeDraft,
  storeEntryCard,
  storeIconSite,
  storeIsSaved,
  storeLine,
  trimmed,
  trimmedSpaces,
  userFormCard,
} from '../core/requestCards'
import type { AppStore } from '../core/store'
import { desktop } from '../desktop/desktop'
import {
  type OnePasswordAccount,
  type OnePasswordFailure,
  accountLabel,
  connectStep,
  failureMessage,
  needsSetup,
  setupURL,
} from '../desktop/onePassword'
import { t } from '../l10n'
import { CardButton, type CardProps, CardShell, GrowingField } from './Cards'
import { classes } from './classes'
import { openComputerView } from './ComputerView'
import './ConnectCards.css'
import { Alert } from './Dialogs'
import { confirmPresence } from './presence'
import './RequestCards.css'
import {
  CredentialSheet,
  EyeSymbol,
  SiteIconTile,
} from './SettingsCredentials'
import { PanelDisc } from './SettingsParts'
import { PaymentMark } from './ShopCards'
import { useWindowModel } from './windowModel'

type RequestKind = Extract<
  CardKind,
  | 'secret'
  | 'computer'
  | 'form'
  | 'credential'
  | 'onePasswordConnect'
  | 'storeEntry'
>

/** The card for one of 3b's kinds, or none when its line doesn't read as one (the chat then says it can't be shown). */
export function requestCardView(
  kind: RequestKind,
  card: CardProps,
): React.ReactNode {
  const props = {
    entryId: card.entryId,
    agentId: card.agentId,
    store: card.store,
  }
  switch (kind) {
    case 'secret': {
      const read = secretCard(card.entry)
      return read && <SecretCardView {...props} card={read} />
    }
    case 'computer': {
      const read = computerCard(card.entry)
      return read && <ComputerHandoffCard {...props} card={read} />
    }
    case 'form': {
      const read = userFormCard(card.entry)
      return read && <UserFormCardView {...props} card={read} />
    }
    case 'credential': {
      const read = credentialCard(card.entry)
      return read && <CredentialCardView {...props} card={read} />
    }
    case 'onePasswordConnect':
      return (
        <OnePasswordConnectCardView
          {...props}
          card={onePasswordConnectCard(card.entry)}
        />
      )
    case 'storeEntry': {
      const read = storeEntryCard(
        card.entry.message,
        card.entry.get('storeState'),
      )
      return read && <StoreEntryCardView {...props} card={read} />
    }
  }
}

interface ViewProps<Card> {
  entryId: string
  agentId: string
  card: Card
  store: AppStore
}

// MARK: The parts the asking cards share

type Dot = 'green' | 'red' | 'blue'

/** The card's state in the grey pill, its dot green (`working`), red (`danger`), blue (`blue`) or the grey. */
function AskPill({ words, dot }: { words: string; dot?: Dot }) {
  return (
    <span className="status-pill" role="status">
      <span
        className={classes(
          'status-dot',
          dot === 'green' && 'green',
          dot === 'red' && 'ask-red',
          dot === 'blue' && 'ask-blue',
        )}
      />
      {words}
    </span>
  )
}

/** A lock (`lock.fill`, 9, in a 12 square, 3 down) and its line (13), at 40%. */
function LockLine({ words }: { words: string }) {
  return (
    <div className="ask-lock">
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path
          d="M3.9 5.4V4a2.1 2.1 0 0 1 4.2 0v1.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
        />
        <rect x="2.6" y="5.1" width="6.8" height="5.6" rx="1.3" />
      </svg>
      <span>{words}</span>
    </div>
  )
}

/**
 * A card's kind at its top, as the founder's references put it (10
 * November 2026): a small tile with the kind's mark, its name ("Secrets",
 * "Computer"), and what happened in a pill at the right.
 */
function KindHead({
  mark,
  name,
  end,
}: {
  mark: React.ReactNode
  name: string
  end?: React.ReactNode
}) {
  return (
    <div className="kind-head">
      <span className="kind-tile" aria-hidden="true">
        {mark}
      </span>
      <span className="kind-name">{name}</span>
      {end}
    </div>
  )
}

/** `key.horizontal`: a key lying down, its ring at the right. */
function KeyMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11.25" cy="8" r="2.75" />
        <path d="M8.5 8H1.75M3.5 8v2.25M5.75 8v1.75" />
      </g>
    </svg>
  )
}

/** `laptopcomputer`: a screen on its base. */
function LaptopMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.3">
        <rect x="3" y="3.25" width="10" height="7.25" rx="1.25" />
        <path d="M1.25 12.75h13.5" strokeLinecap="round" />
      </g>
    </svg>
  )
}

/** `checkmark.shield` and its line (13), at 40%: kept safe, never shown to the agent. */
function ShieldLine({ words }: { words: string }) {
  return (
    <div className="ask-lock shield">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="1.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 1.4 2.6 3v3.4c0 2.8 1.9 4.8 4.4 5.8 2.5-1 4.4-3 4.4-5.8V3Z" />
          <path d="m5.1 6.9 1.35 1.35L9 5.7" />
        </g>
      </svg>
      <span>{words}</span>
    </div>
  )
}

/** A card's head: its title (14 on 22, 500) and the line under it, the X or the pill at the right, 8 apart. */
function AskHead({
  title,
  quiet = false,
  line,
  site,
  end,
}: {
  title: string
  /** Declined: the title at 60%. */
  quiet?: boolean
  /** Under the title, 14 on 22 at 60%. */
  line?: string
  /** Under the title, the site (13, one line, at 60%). */
  site?: string
  end: React.ReactNode
}) {
  return (
    <div className="ask-head">
      <div className="ask-words">
        <div className={classes('ask-title', quiet && 'quiet')}>{title}</div>
        {line != null && line !== '' && <div className="ask-line">{line}</div>}
        {site != null && <div className="ask-site">{site}</div>}
      </div>
      {end}
    </div>
  )
}

/** A card's own busy (the Mac's `run`): one answer at a time. */
function useBusy(): [boolean, (work: () => Promise<void>) => void] {
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const run = (work: () => Promise<void>) => {
    if (running.current) return
    running.current = true
    setBusy(true)
    void work().finally(() => {
      running.current = false
      setBusy(false)
    })
  }
  return [busy, run]
}

/**
 * A field a secret is typed or pasted in (the Mac's `SecureField`): masked,
 * and never offered the person's saved logins by the browser or a password
 * manager (they aren't this field's: it goes to the agent's computer). It
 * is left to the browser (not React's state), so what is typed is never
 * copied into the page's HTML; it is read once, when it is sent, and
 * emptied then.
 */
const secretField = {
  type: 'password',
  autoComplete: 'new-password',
  autoCapitalize: 'none',
  spellCheck: false,
  defaultValue: '',
  'data-1p-ignore': 'true',
  'data-lpignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
} as const

/** Return in a one-line field (`onSubmit`), not while a word is being composed. */
const onReturn =
  (act: () => void) => (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    act()
  }

// MARK: Secrets

/**
 * A secret the agent asks for (`sand-secret-request`), as the founder's
 * reference draws it (10 November 2026): "Secrets" at the top with a key;
 * the secret's name and why; the variable it is kept under over its field
 * when the agent named one ("AWS_ACCESS_KEY_ID"); the field, 36 high and 12
 * round; then a shield and "Stored securely, never shown to your agent."
 * with Not now and Save securely at the right. Once the computer has kept
 * it: "Saved securely and kept private." and a "Saved" pill; declined: a
 * "Dismissed" pill. What was pasted leaves the page as Save is pressed.
 */
function SecretCardView({
  entryId,
  agentId,
  card,
  store,
}: ViewProps<SecretCard>) {
  const field = useRef<HTMLInputElement>(null)
  const fieldId = useId()
  // Only whether something is in the field, for Save; never what.
  const [typed, setTyped] = useState(false)
  const [saving, run] = useBusy()
  const open = !card.provided && !card.dismissed
  const line = card.provided
    ? t('Saved securely and kept private.')
    : card.dismissed
      ? ''
      : card.description
  const save = () => {
    const box = field.current
    const secret = box?.value ?? ''
    if (secret === '' || saving) return
    if (box) box.value = ''
    setTyped(false)
    run(() => store.submitSecret(secret, entryId, agentId))
  }
  const prompt = t`Paste your ${card.label}`
  return (
    <CardShell>
      <KindHead
        mark={<KeyMark />}
        name={t('Secrets')}
        end={
          card.provided ? (
            <AskPill words={t('Saved')} dot="green" />
          ) : card.dismissed ? (
            <AskPill words={t('Dismissed')} />
          ) : null
        }
      />
      <div className="ask-words">
        <div className={classes('ask-heading', card.dismissed && 'quiet')}>
          {card.label}
        </div>
        {line !== '' && <div className="ask-line">{line}</div>}
      </div>
      {open && (
        <>
          <div className="form-field">
            {card.variable !== undefined && (
              <label className="form-label variable" htmlFor={fieldId}>
                {card.variable}
              </label>
            )}
            <input
              id={fieldId}
              ref={field}
              {...secretField}
              className="ask-input"
              placeholder={prompt}
              aria-label={prompt}
              onChange={(event) => setTyped(event.target.value !== '')}
              onKeyDown={onReturn(save)}
            />
          </div>
          <div className="card-foot">
            <ShieldLine
              words={t('Stored securely, never shown to your agent.')}
            />
            <div className="card-buttons">
              <CardButton
                title={t('Not now')}
                disabled={saving}
                onClick={() => void store.dismissQuestion(entryId, agentId)}
              />
              <CardButton
                title={t('Save securely')}
                prominent
                disabled={saving || !typed}
                onClick={save}
              />
            </div>
          </div>
        </>
      )}
    </CardShell>
  )
}

// MARK: The computer handed over

/**
 * The agent hands the person its computer (`simeon-handoff`), as the
 * founder's reference draws it (10 November 2026): "Computer" at the top
 * with a laptop; "Action needed" over the agent's instruction in grey;
 * while it waits, the screen's picture when the computer sent one, across
 * the whole card; then Skip, I'm done and Take over (our blue) at the
 * right. Once settled: what happened in a pill at the top (Done and
 * Answered in green, Skipped in blue, Canceled in red), the instruction,
 * and Open computer. The picture, Take over and Open computer open the
 * computer over the window (step 5b), which starts it.
 *
 * It waits while the computer's status carries this request or while its
 * line has no answer yet (`HandoffCardState`).
 */
function ComputerHandoffCard({
  agentId,
  card,
  store,
}: ViewProps<ComputerCard>) {
  const model = useWindowModel()
  const state = handoffCardState(card, store.computer.status(agentId)?.handoff)
  const words = trimmed(state.instruction)
  const snapshot = state.waiting ? picture(state.snapshotDataUrl) : undefined
  /** Take over, the picture and Open computer: the computer over the window (trigger `handoff`), which starts it. */
  const takeOver = () => openComputerView(model, store, agentId)
  return (
    <div
      className={classes('handoff-card', state.waiting && 'waiting')}
      role="group"
      aria-label={
        state.waiting
          ? t('Your turn on the computer')
          : t`Computer, ${state.outcome}`
      }
    >
      <KindHead
        mark={<LaptopMark />}
        name={t('Computer')}
        end={
          !state.waiting && (
            <span
              className={classes(
                'status-pill large handoff-outcome',
                state.ending,
              )}
              role="status"
            >
              <span className="status-dot" />
              {state.outcome}
            </span>
          )
        }
      />
      {(state.waiting || words !== '') && (
        <div className="handoff-words">
          {state.waiting && (
            <div className="handoff-title">{t('Action needed')}</div>
          )}
          {words !== '' && <div className="handoff-instruction">{words}</div>}
        </div>
      )}
      {snapshot && (
        // The screen when the agent asked, across the card; a click takes over.
        <button
          type="button"
          className="handoff-snapshot"
          aria-label={t('Take over the computer')}
          onClick={takeOver}
        >
          <img src={snapshot} alt="" draggable={false} />
        </button>
      )}
      <div className="card-buttons">
        {state.waiting ? (
          <>
            <CardButton
              title={t('Skip')}
              help={t(
                'Cancel this request without doing the step; the agent continues without it',
              )}
              onClick={() => void store.handBackComputer(agentId, true)}
            />
            <CardButton
              title={t('I’m done')}
              onClick={() => void store.handBackComputer(agentId)}
            />
            <CardButton title={t('Take over')} prominent onClick={takeOver} />
          </>
        ) : (
          <CardButton title={t('Open computer')} onClick={takeOver} />
        )}
      </div>
    </div>
  )
}

/** A picture the computer sent as a `data:image/…;base64,…` address; nothing else is drawn. */
function picture(address: string | undefined): string | undefined {
  return address != null && /^data:image\/[\w.+-]+;base64,/.test(address)
    ? address
    : undefined
}

// MARK: The in-chat form

/**
 * The in-chat form, as the founder's reference has it (10 November 2026):
 * a row (the site's icon, the form's title, "Opens a secure form") with
 * Open at its right, which opens the form in a dialog over the window
 * (`SecureFormDialog`). The values go to the computer, which types them
 * into the page; for a sign-in, the dialog also offers to keep the login in
 * the Credentials Store. Once answered, the row says how it went and each
 * field whether it went in.
 */
function UserFormCardView({
  entryId,
  agentId,
  card,
  store,
}: ViewProps<UserFormCard>) {
  const [showing, setShowing] = useState(false)
  const open = card.state === 'open'
  const status = formStatusLine(card)
  const login = formLogin(card)
  const dot: Dot | undefined =
    card.state === 'filled'
      ? formPartlyFailed(card)
        ? 'red'
        : 'green'
      : card.state === 'failed'
        ? 'red'
        : card.state === 'filling'
          ? 'blue'
          : undefined
  /** A sign-in kept in the store first when asked (a store that refuses it stops here), then typed into the page. */
  const submit = async (
    typed: Record<string, string>,
    keep: boolean,
  ): Promise<string | undefined> => {
    if (keep && login) {
      const model = new CredentialsStoreModel(store.credentialsCall)
      const saved = await model.save({
        ...newDraft('login'),
        website: card.domain,
        username: typed[login.username.id] ?? '',
        password: typed[login.password.id] ?? '',
      })
      if (!saved) return model.problem ?? t("That didn't work.")
    }
    return store.submitUserForm(formValues(card, typed), entryId, agentId)
  }
  return (
    <CardShell>
      <div className="connector-row">
        {/* The site's icon; its first letter, not the title's ("Sign in to …"), while it has none. */}
        <SiteIconTile
          site={card.domain}
          title={card.domain}
          contact={false}
          side={40}
        />
        <div className="connector-words">
          <span
            className={classes(
              'connector-title',
              card.state === 'dismissed' && 'quiet',
            )}
          >
            {card.title}
          </span>
          <span className="connector-line">
            {open ? t('Opens a secure form') : card.domain}
          </span>
        </div>
        {open ? (
          <CardButton title={t('Open')} onClick={() => setShowing(true)} />
        ) : (
          status != null && <AskPill words={status} dot={dot} />
        )}
      </div>
      {card.state === 'filled' || card.state === 'filling' ? (
        <div className="form-outcomes">
          {card.fields.map((one, index) => {
            const line = formOutcomeLine(card, one)
            return (
              <div key={index} className="form-outcome">
                <span className="form-outcome-label">{one.label}</span>
                <span className="form-outcome-gap" />
                {line && (
                  <span
                    className={classes(
                      'form-outcome-line',
                      card.outcomes.get(one.id) === 'fillFailed' && 'failed',
                    )}
                  >
                    {line}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        card.state === 'failed' &&
        card.note && <div className="ask-said">{card.note}</div>
      )}
      {showing && open && (
        <SecureFormDialog
          title={card.title}
          line={card.instruction}
          fields={card.fields}
          site={card.domain}
          keepLabel={login && t('Save to your Credentials Store')}
          sends={card.submitsAfterFill}
          submitTitle={t('Fill in')}
          close={() => setShowing(false)}
          decline={() => store.dismissUserForm(entryId, agentId)}
          submit={submit}
        />
      )}
    </CardShell>
  )
}

/**
 * A secure form over the window (the founder's reference, 10 November
 * 2026: "open, then an iframe"): the title and the X, why it's asked, each
 * field with its name over it (36 high, 12 round; a password's eye shows
 * it), for a sign-in "Save to your Credentials Store" (checked), then a
 * shield and where it goes ("Never shown to your agent. Only filled on
 * acme.com.") with Not now and the main button at the right. A secret
 * field's words stay the browser's, read once as the form is sent. A
 * refusal stays in the dialog with what was typed; once it went, the
 * dialog closes. The X, Escape or a click outside only close it; Not now
 * declines.
 */
function SecureFormDialog({
  title,
  line,
  fields,
  site,
  keepLabel,
  sends = false,
  submitTitle,
  close,
  decline,
  submit,
}: {
  title: string
  line?: string
  fields: readonly FormField[]
  /** The site it goes to ("acme.com"). */
  site?: string
  /** A sign-in's "Save to your Credentials Store", checked until unchecked. */
  keepLabel?: string
  /** Enter is pressed once it's in (a lone one-time code). */
  sends?: boolean
  submitTitle: string
  close: () => void
  decline: () => Promise<unknown>
  /** What was typed and whether to keep the login; a refusal to show, or none once it went. */
  submit: (
    typed: Record<string, string>,
    keep: boolean,
  ) => Promise<string | undefined>
}) {
  // What is typed in the plain fields; the secret ones are the browser's (`secretField`).
  const [values, setValues] = useState<Record<string, string>>({})
  const secrets = useRef(new Map<string, HTMLInputElement>())
  // Only whether each secret field has something in it, for the button; never what.
  const [secretsTyped, setSecretsTyped] = useState<Record<string, string>>({})
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [keep, setKeep] = useState(true)
  const [busy, run] = useBusy()
  const [refusal, setRefusal] = useState<string>()
  const ids = useId()
  const fillable = canFill({ fields: [...fields] }, { ...values, ...secretsTyped })
  const send = () => {
    if (busy || !fillable) return
    const typed: Record<string, string> = { ...values }
    for (const one of fields)
      if (one.secret) typed[one.id] = secrets.current.get(one.id)?.value ?? ''
    run(async () => {
      const said = await submit(typed, keepLabel !== undefined && keep)
      if (said !== undefined) {
        setRefusal(said)
        return
      }
      // What was typed leaves the dialog now; only the computer holds it, and only to type it in.
      for (const box of secrets.current.values()) box.value = ''
      close()
    })
  }
  const leave = () => {
    if (!busy) close()
  }
  const value = (one: FormField) =>
    Object.hasOwn(values, one.id) ? values[one.id]! : ''
  const set = (one: FormField, next: string) =>
    setValues((now) => ({ ...now, [one.id]: next }))
  const input = (one: FormField, id: string, first: boolean) => {
    switch (one.kind) {
      case 'checkbox':
        return (
          <label className="form-check">
            <input
              type="checkbox"
              checked={value(one) === 'true'}
              onChange={(event) =>
                set(one, event.target.checked ? 'true' : 'false')
              }
            />
            <span>{one.label}</span>
          </label>
        )
      case 'select':
        return (
          <span className="form-select">
            <select
              id={id}
              value={value(one)}
              onChange={(event) => set(one, event.target.value)}
            >
              <option value="">{one.placeholder ?? t('Choose')}</option>
              {one.options.map((option, index) => (
                <option key={index} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <svg width="8" height="12" viewBox="0 0 8 12" aria-hidden="true">
              <path
                d="M1.5 4.25 4 1.75l2.5 2.5M1.5 7.75 4 10.25l2.5-2.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )
      case 'textarea':
        return (
          <GrowingField
            id={id}
            className="ask-input form-words"
            value={value(one)}
            onChange={(next) => set(one, next)}
            placeholder={one.placeholder}
            label={one.label}
            minLines={3}
            maxLines={6}
            lineHeight={17}
            focusOnOpen={first}
          />
        )
      default:
        if (one.secret) {
          const showing = shown[one.id] === true
          return (
            <span className="secure-field">
              <input
                id={id}
                ref={(box) => {
                  if (box) secrets.current.set(one.id, box)
                  else secrets.current.delete(one.id)
                }}
                {...secretField}
                type={showing ? 'text' : 'password'}
                // A code from a message may be offered by the browser; never a saved login.
                autoComplete={
                  one.kind === 'otp' ? 'one-time-code' : 'new-password'
                }
                className="ask-input"
                placeholder={one.placeholder}
                autoFocus={first}
                onChange={(event) => {
                  const something = trimmedSpaces(event.target.value) !== ''
                  setSecretsTyped((now) => ({
                    ...now,
                    [one.id]: something ? 'typed' : '',
                  }))
                }}
                onKeyDown={onReturn(send)}
              />
              <button
                type="button"
                className="secure-eye"
                title={showing ? t('Hide Password') : t('Show Password')}
                aria-label={showing ? t('Hide Password') : t('Show Password')}
                onClick={() =>
                  setShown((now) => ({ ...now, [one.id]: !showing }))
                }
              >
                <EyeSymbol slashed={showing} />
              </button>
            </span>
          )
        }
        return (
          <input
            id={id}
            type="text"
            className="ask-input"
            value={value(one)}
            placeholder={one.placeholder}
            inputMode={inputMode(one)}
            autoComplete={autoComplete(one)}
            autoCapitalize="none"
            spellCheck={one.kind === 'text'}
            autoFocus={first}
            onChange={(event) => set(one, event.target.value)}
            onKeyDown={onReturn(send)}
          />
        )
    }
  }
  return createPortal(
    <div
      className="sheet-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) leave()
      }}
    >
      <div
        className="secure-form"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          leave()
        }}
      >
        <div className="secure-form-head">
          <h2 className="secure-form-title">{title}</h2>
          <PanelDisc
            symbol="xmark"
            label={t('Close')}
            disabled={busy}
            onClick={leave}
          />
        </div>
        {line !== undefined && line !== '' && (
          <p className="secure-form-line">{line}</p>
        )}
        <div className="secure-form-fields">
          {fields.map((one, index) => {
            const id = `${ids}-${index}`
            return (
              <div key={index} className="form-field">
                {one.kind !== 'checkbox' && (
                  <label className="form-label" htmlFor={id}>
                    {one.label}
                  </label>
                )}
                {input(one, id, index === 0)}
              </div>
            )
          })}
        </div>
        {keepLabel !== undefined && (
          <label className="form-check secure-form-keep">
            <input
              type="checkbox"
              checked={keep}
              onChange={(event) => setKeep(event.target.checked)}
            />
            <span>{keepLabel}</span>
          </label>
        )}
        {sends && (
          <p className="form-sends">
            {t('It’s sent as soon as it’s typed in.')}
          </p>
        )}
        {refusal !== undefined && (
          <div className="ask-refusal" role="alert">
            {refusal}
          </div>
        )}
        <div className="card-foot secure-form-foot">
          <ShieldLine
            words={
              site !== undefined && site !== ''
                ? t`Never shown to your agent. Only filled on ${site}.`
                : t('Stored securely, never shown to your agent.')
            }
          />
          <div className="card-buttons">
            <CardButton
              title={t('Not now')}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await decline()
                  close()
                })
              }
            />
            <CardButton
              title={submitTitle}
              prominent
              disabled={busy || !fillable}
              onClick={send}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** The keyboard a phone shows for the field, as the iPhone's card picks it. */
function inputMode(
  one: FormField,
): React.HTMLAttributes<HTMLInputElement>['inputMode'] {
  if (one.secret) return undefined
  switch (one.kind) {
    case 'email':
      return 'email'
    case 'tel':
      return 'tel'
    case 'number':
      return 'decimal'
    default:
      return undefined
  }
}

/**
 * What the browser may offer for a plain field, as the iPhone's card names
 * it: the person's own email and number. (A secret field is `secretField`:
 * a code from a message at most, never a saved login.)
 */
function autoComplete(one: FormField): string {
  switch (one.kind) {
    case 'email':
      return 'email'
    case 'tel':
      return 'tel'
    default:
      return 'off'
  }
}

// MARK: 1Password's fill card

/**
 * The 1Password fill card, as the secret card draws its request: the
 * login's name and the site, the agent's reason, Fill with 1Password and Not
 * now, and a lock with where it comes from. Fill asks for the person's OK
 * first, with the words the Mac's Touch ID shows: Windows Hello in the
 * Windows app, the window's alert where Hello can't ask and on the web.
 * Once answered, a pill and what went in.
 */
function CredentialCardView({
  entryId,
  agentId,
  card,
  store,
}: ViewProps<CredentialCard>) {
  const [busy, run] = useBusy()
  const [asking, setAsking] = useState(false)
  const [refusal, setRefusal] = useState<string>()
  const status = credentialStatusLine(card)
  const dot: Dot | undefined =
    card.state === 'filled'
      ? 'green'
      : card.state === 'failed'
        ? 'red'
        : card.state === 'filling'
          ? 'blue'
          : undefined
  const answer = (allow: boolean) =>
    run(async () =>
      setRefusal(await store.answerCredentialRequest(entryId, allow, agentId)),
    )
  // Windows Hello first (Touch ID on the Mac): no fill without it; where it can't ask, the window's alert.
  const fill = () =>
    run(async () => {
      const said = await confirmPresence(credentialConfirmReason(card))
      if (said === 'confirmed')
        setRefusal(await store.answerCredentialRequest(entryId, true, agentId))
      else if (said === 'alert') setAsking(true)
    })
  const outcome = credentialOutcomeLine(card)
  return (
    <CardShell>
      <AskHead
        title={card.title}
        quiet={card.state === 'declined'}
        site={card.site}
        end={status != null && <AskPill words={status} dot={dot} />}
      />
      {card.state === 'open' && (
        <>
          {card.purpose !== '' && (
            <div className="ask-line">{card.purpose}</div>
          )}
          <div className="card-buttons">
            <CardButton
              title={t('Not now')}
              disabled={busy || asking}
              onClick={() => answer(false)}
            />
            <CardButton
              title={t('Fill with 1Password')}
              prominent
              disabled={busy || asking}
              onClick={fill}
            />
          </div>
          {refusal && (
            <div className="ask-refusal" role="alert">
              {refusal}
            </div>
          )}
          <LockLine
            words={t(
              'From your vault shared with Simeon. Your agent never sees it.',
            )}
          />
        </>
      )}
      {card.state === 'filled' && outcome && (
        <div className="ask-said">{outcome}</div>
      )}
      {card.state === 'failed' && card.note && (
        <div className="ask-said">{card.note}</div>
      )}
      {/* Only while the card waits: a card answered meanwhile (here or on the Mac) asks nothing. */}
      {asking &&
        card.state === 'open' &&
        createPortal(
          <Alert
            title={credentialConfirmReason(card)}
            message={t(
              'From your vault shared with Simeon. Your agent never sees it.',
            )}
            action={t('Fill in')}
            onAction={() => {
              setAsking(false)
              answer(true)
            }}
            onCancel={() => setAsking(false)}
          />,
          document.body,
        )}
    </CardShell>
  )
}

// MARK: 1Password's connect card

/**
 * The 1Password connect card: "Connect 1Password", the agent's reason, what
 * connecting makes (the Mac's paragraph), and the X, a decline. In the
 * Windows app, Connect asks the person's 1Password app on this PC for the
 * shared vault and its key (with a picker first when they have several
 * accounts), and How to set it up when its command-line tool isn't ready;
 * on the web the card has only its X. Once answered, "Connected" with the
 * account, or "Dismissed".
 */
function OnePasswordConnectCardView({
  entryId,
  agentId,
  card,
  store,
}: ViewProps<OnePasswordConnectCard>) {
  const [busy, run] = useBusy()
  const status = connectStatusLine(card)
  return (
    <CardShell>
      <AskHead
        title={t('Connect 1Password')}
        quiet={card.state === 'dismissed'}
        end={
          card.state !== 'open' &&
          status != null && (
            <AskPill
              words={status}
              dot={card.state === 'connected' ? 'green' : undefined}
            />
          )
        }
      />
      {card.state === 'open' && card.reason && (
        <div className="ask-line">{card.reason}</div>
      )}
      {card.state === 'open' && (
        <div className="ask-line">
          {t(
            'Your 1Password app makes a vault named “Shared with Simeon” and a key that can only read it. Put in it the logins your agents may use; they fill them with your OK and never see them.',
          )}
        </div>
      )}
      {card.state === 'open' && (
        <OnePasswordConnecting
          busy={busy}
          run={run}
          connect={(made) =>
            store.connectOnePassword({ ...made, entryId, agentId })
          }
          notNow={() =>
            run(() => store.dismissOnePasswordConnect(entryId, agentId))
          }
        />
      )}
      {card.state === 'connected' && card.account && (
        <div className="ask-said">{card.account}</div>
      )}
    </CardShell>
  )
}

/**
 * Connect in the Windows app (`OnePasswordConnectCardView.connect`): the
 * accounts first (the picker when there are several: pick, press Connect
 * again), then the vault and its key, then the key to the computer.
 * "Connecting…" while it goes; 1Password's own sentence, or the Mac's, in
 * red under the buttons; How to set it up when the tool isn't ready.
 */
function OnePasswordConnecting({
  busy,
  run,
  connect,
  notNow,
}: {
  busy: boolean
  run: (work: () => Promise<void>) => void
  /** Declines it: the card's Not now, beside Connect (only Not now away from the desktop app, which alone can connect). */
  notNow: () => void
  connect: (made: {
    token: string
    vaultId: string
    vaultName: string
    accountEmail: string
  }) => Promise<string | undefined>
}) {
  const [accounts, setAccounts] = useState<OnePasswordAccount[]>([])
  const [chosen, setChosen] = useState<string>()
  const [failure, setFailure] = useState<OnePasswordFailure>()
  const [refusal, setRefusal] = useState<string>()
  const press = () =>
    run(async () => {
      const host = desktop()
      if (!host) return
      setFailure(undefined)
      setRefusal(undefined)
      const step = await connectStep(host, accounts, chosen)
      setAccounts(step.accounts)
      if (
        chosen === undefined ||
        !step.accounts.some((one) => one.id === chosen)
      )
        setChosen(step.accounts[0]?.id)
      if (step.kind === 'failed') setFailure(step.failure)
      else if (step.kind === 'made') setRefusal(await connect(step.made))
    })
  const message = failure ? failureMessage(failure) : refusal
  return (
    <>
      {accounts.length > 1 && (
        <span className="form-select one-password-accounts">
          <select
            aria-label={t('Connect 1Password')}
            value={chosen ?? accounts[0]?.id}
            disabled={busy}
            onChange={(event) => setChosen(event.target.value)}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountLabel(account)}
              </option>
            ))}
          </select>
          <svg width="8" height="12" viewBox="0 0 8 12" aria-hidden="true">
            <path
              d="M1.5 4.25 4 1.75l2.5 2.5M1.5 7.75 4 10.25l2.5-2.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
      <div className="card-buttons">
        {failure && needsSetup(failure) && (
          <CardButton
            title={t('How to set it up')}
            onClick={() =>
              void desktop()
                ?.call('openExternal', setupURL)
                .catch(() => {})
            }
          />
        )}
        <CardButton title={t('Not now')} disabled={busy} onClick={notNow} />
        {desktop() && (
          <CardButton
            title={busy ? t('Connecting…') : t('Connect')}
            prominent
            disabled={busy}
            onClick={press}
          />
        )}
      </div>
      {message && (
        <div className="ask-refusal" role="alert">
          {message}
        </div>
      )}
    </>
  )
}

/**
 * The Credentials Store's card (`StoreEntryCardView`), drawn as the
 * connector card (ConnectCards.tsx): the site's icon (a card's mark, a
 * person for contact info) on its 40 tile, its name over one line, and its
 * button at the right; once saved, "Saved" in green as "Connected". A login
 * asked for reads as the founder's reference (10 November 2026): "Sign in
 * to Amazon", "Opens a secure form" and Open, which opens the secure form
 * over the window (`SecureFormDialog`): the email or username and the
 * password, saved in the store. A card or contact info has Add, which
 * opens the store's own sheet over the chat, filled.
 */
function StoreEntryCardView({
  entryId,
  agentId,
  card,
  store,
}: ViewProps<StoreEntryCard>) {
  const [model, setModel] = useState<CredentialsStoreModel>()
  const [editing, setEditing] = useState(false)
  const asks = storeAsks(card)
  const signIn = card.kind === 'login' && asks
  const line = signIn ? t('Opens a secure form') : storeLine(card)
  const made = () => {
    const one = model ?? new CredentialsStoreModel(store.credentialsCall)
    setModel(one)
    return one
  }
  const open = () => {
    const one = made()
    setEditing(true)
    // A card's billing address is chosen from the saved contact info.
    if (card.kind === 'card') void one.load()
  }
  const loginFields: FormField[] = [
    {
      id: 'username',
      label: t('Email or username'),
      kind: 'text',
      secret: false,
      required: false,
      options: [],
    },
    {
      id: 'password',
      label: t('Password'),
      kind: 'password',
      secret: true,
      required: true,
      options: [],
    },
  ]
  return (
    <CardShell>
      <div className="connector-row">
        {card.kind === 'card' ? (
          <PaymentMark />
        ) : (
          <SiteIconTile
            site={storeIconSite(card)}
            title={card.title}
            contact={card.kind === 'contact'}
            side={40}
          />
        )}
        <div className="connector-words">
          <span className="connector-title">
            {signIn ? t`Sign in to ${card.title}` : card.title}
          </span>
          {line !== undefined && (
            <span className="connector-line" title={line}>
              {line}
            </span>
          )}
        </div>
        {storeIsSaved(card) ? (
          <span className="connector-connected">{t('Saved')}</span>
        ) : (
          asks && (
            <CardButton
              title={signIn ? t('Open') : t('Add')}
              onClick={open}
            />
          )
        )}
      </div>
      {editing && signIn ? (
        <SecureFormDialog
          title={t`Sign in to ${card.title}`}
          line={card.reason}
          fields={loginFields}
          site={card.website}
          submitTitle={t('Save')}
          close={() => setEditing(false)}
          decline={() => store.answerStoreEntry(entryId, agentId, false)}
          submit={async (typed) => {
            const one = made()
            const saved = await one.save({
              ...storeDraft(card),
              username: typed.username ?? '',
              password: typed.password ?? '',
            })
            if (!saved) return one.problem ?? t("That didn't work.")
            await store.answerStoreEntry(entryId, agentId, true)
            return undefined
          }}
        />
      ) : (
        editing &&
        model && (
          <CredentialSheet
            model={model}
            edit={{ filled: storeDraft(card) }}
            close={() => setEditing(false)}
            onSaved={() => void store.answerStoreEntry(entryId, agentId, true)}
          />
        )
      )}
    </CardShell>
  )
}
