// Step 3b: what an agent asks of the person (mac/Simeon/Cards.swift's
// `SecretCardView` and `ComputerHandoffCard`, UserFormCard.swift,
// OnePasswordCards.swift): a secret to give, the computer handed over, an
// in-chat form, 1Password's fill and connect cards. Read by
// `src/core/requestCards.ts`.
//
// Left out until their step, so no button does nothing: the hand-off's Take
// over, Open computer and the screen's picture (the computer over the
// window, step 5); 1Password's Connect, which needs the 1Password app's
// command-line tool on this computer (the Windows app, step 7). 1Password's
// Fill asks for the person's OK in the window's own alert where the Mac asks
// for Touch ID.

import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CardKind } from '../core/chat'
import {
  type ComputerCard,
  type CredentialCard,
  type FormField,
  type OnePasswordConnectCard,
  type SecretCard,
  type UserFormCard,
  canFill,
  computerCard,
  connectStatusLine,
  credentialCard,
  credentialConfirmReason,
  credentialOutcomeLine,
  credentialStatusLine,
  formOutcomeLine,
  formPartlyFailed,
  formStatusLine,
  formValues,
  handoffCardState,
  onePasswordConnectCard,
  secretCard,
  trimmed,
  trimmedSpaces,
  userFormCard,
} from '../core/requestCards'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { CardButton, type CardProps, CardShell, GrowingField } from './Cards'
import { Alert } from './Dialogs'
import './RequestCards.css'
import { classes } from './classes'

type RequestKind = Extract<
  CardKind,
  'secret' | 'computer' | 'form' | 'credential' | 'onePasswordConnect'
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

/** The X at the right of a card that waits (`xmark`, 11, in a 20 square): a decline. */
function DismissButton({
  help,
  label,
  onClick,
}: {
  help: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="card-close"
      title={help}
      aria-label={label}
      onClick={onClick}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M3.5 3.5l9 9M12.5 3.5l-9 9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
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
 * A secret the agent asks for (`sand-secret-request`): its name and why;
 * a field ("Paste your <name>", on the ground with a 15% edge, 32 high) and
 * Save securely in the blue; under them a lock and "Stored securely, never
 * shown to your agent." Once the computer has kept it: "Saved securely and
 * kept private." and a "Saved" pill; declined with the X: a "Dismissed"
 * pill. What was pasted leaves the page as Save is pressed.
 */
function SecretCardView({
  entryId,
  agentId,
  card,
  store,
}: ViewProps<SecretCard>) {
  const field = useRef<HTMLInputElement>(null)
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
      <AskHead
        title={card.label}
        line={line}
        end={
          card.provided ? (
            <AskPill words={t('Saved')} dot="green" />
          ) : card.dismissed ? (
            <AskPill words={t('Dismissed')} />
          ) : (
            <DismissButton
              help={t('Dismiss without giving it')}
              label={t('Dismiss request')}
              onClick={() => void store.dismissQuestion(entryId, agentId)}
            />
          )
        }
      />
      {open && (
        <>
          <div className="secret-row">
            <input
              ref={field}
              {...secretField}
              className="ask-input"
              placeholder={prompt}
              aria-label={prompt}
              onChange={(event) => setTyped(event.target.value !== '')}
              onKeyDown={onReturn(save)}
            />
            <CardButton
              title={t('Save securely')}
              prominent
              disabled={saving || !typed}
              onClick={save}
            />
          </div>
          <LockLine words={t('Stored securely, never shown to your agent.')} />
        </>
      )}
    </CardShell>
  )
}

// MARK: The computer handed over

/**
 * The agent hands the person its computer (`simeon-handoff`, 20 round,
 * padded 16, its parts 14 apart): a tile (44, 12 round) with a screen,
 * "Your turn on the computer" (15, 600) over "Waiting for you" beside a
 * breathing blue dot; the agent's instruction (15 on 21); then Skip quiet
 * at the left and I'm done at the right. Once settled: "Computer" with what
 * happened in a pill (Done and Answered in green, Skipped in blue, Canceled
 * in red) and the instruction in grey.
 *
 * It waits while its line has no answer (`HandoffCardState` with no status:
 * the computer's status, its picture of the screen, Take over and Open
 * computer come with the computer in step 5).
 */
function ComputerHandoffCard({
  agentId,
  card,
  store,
}: ViewProps<ComputerCard>) {
  const state = handoffCardState(card, undefined)
  const words = trimmed(state.instruction)
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
      <div className="handoff-head">
        <span className="handoff-tile">
          {/* `display`, 18, regular: a screen on a short stand. */}
          <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden="true">
            <rect
              x="0.95"
              y="0.95"
              width="20.1"
              height="12.6"
              rx="2.3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M11 13.6v3.2M7.2 17h7.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
        {state.waiting ? (
          <div className="handoff-words">
            <div className="handoff-title">
              {t('Your turn on the computer')}
            </div>
            <div className="handoff-waiting">
              <span className="handoff-dot" />
              {t('Waiting for you')}
            </div>
          </div>
        ) : (
          <>
            <div className="handoff-title settled">{t('Computer')}</div>
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
          </>
        )}
      </div>
      {words !== '' && <div className="handoff-instruction">{words}</div>}
      {state.waiting && (
        <div className="handoff-buttons">
          <button
            type="button"
            className="handoff-skip"
            title={t(
              'Cancel this request without doing the step; the agent continues without it',
            )}
            onClick={() => void store.handBackComputer(agentId, true)}
          >
            {t('Skip')}
          </button>
          <span className="handoff-spacer" />
          <button
            type="button"
            className="handoff-pill"
            onClick={() => void store.handBackComputer(agentId)}
          >
            {t('I’m done')}
          </button>
        </div>
      )}
    </div>
  )
}

// MARK: The in-chat form

/**
 * The in-chat form, as the secret card draws its request: the title and
 * the site, the X while it waits, each field with its name above it, and
 * Fill in. The values go to the computer, which types them into the page;
 * the card forgets them as soon as Fill in is pressed. Once answered, each
 * field says whether it went in.
 */
function UserFormCardView({
  entryId,
  agentId,
  card,
  store,
}: ViewProps<UserFormCard>) {
  // What is typed in the plain fields; the secret ones are the browser's (`secretField`).
  const [values, setValues] = useState<Record<string, string>>({})
  const secrets = useRef(new Map<string, HTMLInputElement>())
  // Only whether each secret field has something in it, for Fill in; never what.
  const [secretsTyped, setSecretsTyped] = useState<Record<string, string>>({})
  const [busy, run] = useBusy()
  const [refusal, setRefusal] = useState<string>()
  const ids = useId()
  const open = card.state === 'open'
  const status = formStatusLine(card)
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
  const fillable = canFill(card, { ...values, ...secretsTyped })
  const fill = () => {
    if (busy || !fillable) return
    const typed: Record<string, string> = { ...values }
    for (const one of card.fields)
      if (one.secret) typed[one.id] = secrets.current.get(one.id)?.value ?? ''
    const sent = formValues(card, typed)
    // What was typed leaves the card now; only the computer holds it, and only to type it in.
    setValues({})
    setSecretsTyped({})
    for (const box of secrets.current.values()) box.value = ''
    run(async () =>
      setRefusal(await store.submitUserForm(sent, entryId, agentId)),
    )
  }
  const value = (one: FormField) =>
    Object.hasOwn(values, one.id) ? values[one.id]! : ''
  const set = (one: FormField, next: string) =>
    setValues((now) => ({ ...now, [one.id]: next }))
  const input = (one: FormField, id: string) => {
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
          />
        )
      default:
        if (one.secret)
          return (
            <input
              id={id}
              ref={(box) => {
                if (box) secrets.current.set(one.id, box)
                else secrets.current.delete(one.id)
              }}
              {...secretField}
              // A code from a message may be offered by the browser; never a saved login.
              autoComplete={
                one.kind === 'otp' ? 'one-time-code' : 'new-password'
              }
              className="ask-input"
              placeholder={one.placeholder}
              onChange={(event) => {
                const something = trimmedSpaces(event.target.value) !== ''
                setSecretsTyped((now) => ({
                  ...now,
                  [one.id]: something ? 'typed' : '',
                }))
              }}
              onKeyDown={onReturn(fill)}
            />
          )
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
            onChange={(event) => set(one, event.target.value)}
            onKeyDown={onReturn(fill)}
          />
        )
    }
  }
  return (
    <CardShell>
      <AskHead
        title={card.title}
        quiet={card.state === 'dismissed'}
        site={card.domain}
        end={
          open ? (
            <DismissButton
              help={t('Dismiss without filling it in')}
              label={t('Dismiss form')}
              onClick={() => run(() => store.dismissUserForm(entryId, agentId))}
            />
          ) : (
            status != null && <AskPill words={status} dot={dot} />
          )
        }
      />
      {open ? (
        <>
          {card.instruction !== '' && (
            <div className="ask-line">{card.instruction}</div>
          )}
          {card.fields.map((one, index) => {
            const id = `${ids}-${index}`
            return (
              <div key={index} className="form-field">
                {one.kind !== 'checkbox' && (
                  <label className="form-label" htmlFor={id}>
                    {one.label}
                  </label>
                )}
                {input(one, id)}
              </div>
            )
          })}
          <div className="form-actions">
            <CardButton
              title={t('Fill in')}
              prominent
              disabled={busy || !fillable}
              onClick={fill}
            />
            {card.submitsAfterFill && (
              <span className="form-sends">
                {t('It’s sent as soon as it’s typed in.')}
              </span>
            )}
          </div>
          {refusal && (
            <div className="ask-refusal" role="alert">
              {refusal}
            </div>
          )}
          <LockLine
            words={t(
              "Typed into the page on Simeon's computer, never shown to your agent.",
            )}
          />
        </>
      ) : card.state === 'filled' || card.state === 'filling' ? (
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
    </CardShell>
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
 * now, and a lock with where it comes from. Fill asks for the person's OK in
 * the window's alert first, with the words the Mac's Touch ID shows. Once
 * answered, a pill and what went in.
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
              title={t('Fill with 1Password')}
              prominent
              disabled={busy || asking}
              onClick={() => setAsking(true)}
            />
            <CardButton
              title={t('Not now')}
              disabled={busy || asking}
              onClick={() => answer(false)}
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
 * connecting makes (the Mac's paragraph), and the X, a decline. Connect is
 * the Mac's alone for now: it asks the person's 1Password app on that
 * computer for the shared vault and its key. Once answered, "Connected"
 * with the account, or "Dismissed".
 */
function OnePasswordConnectCardView({
  entryId,
  agentId,
  card,
  store,
}: ViewProps<OnePasswordConnectCard>) {
  const [, run] = useBusy()
  const status = connectStatusLine(card)
  return (
    <CardShell>
      <AskHead
        title={t('Connect 1Password')}
        quiet={card.state === 'dismissed'}
        end={
          card.state === 'open' ? (
            <DismissButton
              help={t('Dismiss without connecting')}
              label={t('Dismiss')}
              onClick={() =>
                run(() => store.dismissOnePasswordConnect(entryId, agentId))
              }
            />
          ) : (
            status != null && (
              <AskPill
                words={status}
                dot={card.state === 'connected' ? 'green' : undefined}
              />
            )
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
      {card.state === 'connected' && card.account && (
        <div className="ask-said">{card.account}</div>
      )}
    </CardShell>
  )
}
