// Settings' Credentials Store (mac/Simeon/SettingsCredentials.swift, the
// core's CredentialsStore.swift; the founder: "use our existing design and
// for whatever saved, have the favicon be there"): what it is for in a
// line, then Logins, each its site's icon (28), its name over its username;
// Cards, which Link keeps (Wallet); Contact info. Each group ends in its Add,
// in the link blue. A row opens its sheet.
//
// The web's own ways (decisions of 2 November 2026): a site's icon is its
// own /favicon.ico, loaded by the browser from the site as the app draws
// site icons elsewhere (the Mac reads the site's page for its touch icon,
// which a web page may not; the Windows app does, in its main process, and
// keeps it on the PC a week, 6 November 2026); the eye shows a saved password only after the
// window's alert with the words the Mac's Touch ID shows (as 1Password's
// Fill), then `GET credentials/{id}`; in the Windows app Windows Hello asks
// with those words first, the alert only where Hello can't (presence.ts).
// A password is left to the browser's field, read only when it is saved,
// never put in the page's HTML or the browser's storage, and emptied
// before the sheet closes. The field is a text
// field whose words are masked (`-webkit-text-security`), so the browser's own
// password manager sees no sign-in or sign-up here: it offers no password of
// its own and asks to save none of the person's under Simeon's address. A
// browser that can't mask a text field gets a password field, with the
// managers' marks (review of 2 November 2026).

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  type CredentialDraft,
  type CredentialKind,
  CredentialsStoreModel,
  type DraftField,
  type StoredCredential,
  addressLine,
  cardBrand,
  credentialSubtitle,
  credentialTitle,
  draftOf,
  draftProblem,
  iconSite,
  newDraft,
} from '../core/credentialsStore'
import type { AppStore } from '../core/store'
import { beep, useKeptSiteIcon } from '../desktop/native'
import { t } from '../l10n'
import { classes } from './classes'
import countries from './countries.json'
import { Alert } from './Dialogs'
import { useSiteIcon } from './MessageText'
import { confirmPresence } from './presence'
import './SettingsCredentials.css'
import {
  PanelDisc,
  SettingsActionRow,
  SettingsGroup,
  SettingsLine,
  SettingsMenu,
  SettingsPill,
  SettingsSymbol,
} from './SettingsParts'
import { PaymentMark } from './ShopCards'
import { useWatched } from './useStore'

/** What the sheet opens on: a new login, card or contact info (empty, or filled by the chat's store card), or a saved entry. */
type CredentialEdit =
  | { kind: CredentialKind }
  | { filled: CredentialDraft }
  | { entry: StoredCredential }

export function SettingsCredentialsPage({ store }: { store: AppStore }) {
  const [model] = useState(
    () => new CredentialsStoreModel(store.credentialsCall),
  )
  useWatched(model)
  const [editing, setEditing] = useState<CredentialEdit>()
  useEffect(() => {
    void model.load()
  }, [model])
  return (
    <div className="credentials-page">
      <p className="credentials-lead">
        {t(
          'Logins, cards and details your agents use to sign in, sign up and pay for you.',
        )}
      </p>
      {!model.loaded ? (
        model.problem !== undefined ? (
          <SettingsGroup>
            <SettingsLine label={model.problem} labelTint="var(--danger)">
              <SettingsPill
                title={t('Try Again')}
                onClick={() => void model.load()}
              />
            </SettingsLine>
          </SettingsGroup>
        ) : (
          <div className="credentials-loading">
            <span className="settings-spinner" role="progressbar" />
          </div>
        )
      ) : (
        <>
          <SettingsGroup title={t('Logins')}>
            {model.logins.map((entry, index) => (
              <CredentialLine
                key={entry.id}
                entry={entry}
                divided={index > 0}
                open={() => setEditing({ entry })}
              />
            ))}
            <StoreAddRow
              title={t('Add Login')}
              divided={model.logins.length > 0}
              onClick={() => setEditing({ kind: 'login' })}
            />
          </SettingsGroup>
          <SettingsGroup
            title={t('Cards')}
            footer={t(
              'Your agents pay with a card only after you approve. They never see its number or security code.',
            )}
          >
            {model.cards.map((entry, index) => (
              <CredentialLine
                key={entry.id}
                entry={entry}
                divided={index > 0}
                open={() => setEditing({ entry })}
              />
            ))}
            <StoreAddRow
              title={t('Add Card')}
              divided={model.cards.length > 0}
              onClick={() => setEditing({ kind: 'card' })}
            />
          </SettingsGroup>
          <SettingsGroup
            title={t('Contact info')}
            footer={t(
              'Simeon can see your logins and contact info so it can type them in for you.',
            )}
          >
            {model.contacts.map((entry, index) => (
              <CredentialLine
                key={entry.id}
                entry={entry}
                divided={index > 0}
                open={() => setEditing({ entry })}
              />
            ))}
            <StoreAddRow
              title={t('Add Contact Info')}
              divided={model.contacts.length > 0}
              onClick={() => setEditing({ kind: 'contact' })}
            />
          </SettingsGroup>
        </>
      )}
      {editing && (
        <CredentialSheet
          model={model}
          edit={editing}
          close={() => setEditing(undefined)}
        />
      )}
    </div>
  )
}

/** A row that opens something (`MacStoreLine`): what leads it, then the chevron; a step darker under the pointer. */
function StoreLine({
  divided,
  label,
  onClick,
  children,
}: {
  divided?: boolean
  label?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={classes('credentials-line', divided && 'divided')}
      aria-label={label}
      onClick={onClick}
    >
      {children}
      <span className="credentials-spacer" />
      <span className="credentials-chevron">
        <SettingsSymbol name="chevronRight" size={10} weight={1.7} />
      </span>
    </button>
  )
}

/** One entry (`MacCredentialLine`): its site's icon (or the contact's), its name over its username or email. */
function CredentialLine({
  entry,
  divided,
  open,
}: {
  entry: StoredCredential
  divided: boolean
  open: () => void
}) {
  const title = credentialTitle(entry)
  const subtitle = credentialSubtitle(entry)
  return (
    <StoreLine
      divided={divided}
      label={subtitle === '' ? title : `${title}, ${subtitle}`}
      onClick={open}
    >
      {entry.kind === 'card' ? (
        <span className="credentials-card-mark">
          <PaymentMark brand={entry.brand} />
        </span>
      ) : (
        <SiteIconTile
          site={iconSite(entry)}
          title={title}
          contact={entry.kind === 'contact'}
        />
      )}
      <span className="credentials-words">
        <span className="credentials-title">{title}</span>
        {subtitle !== '' && (
          <span className="credentials-subtitle">{subtitle}</span>
        )}
      </span>
    </StoreLine>
  )
}

/** The first character as a person reads it (`String.prefix(1)`). */
function firstLetter(words: string): string {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const first = new Intl.Segmenter().segment(words)[Symbol.iterator]().next()
    return first.done ? '' : first.value.segment
  }
  return [...words][0] ?? ''
}

/**
 * A saved login's icon (`MacSiteIconTile`), an app icon's corners: the
 * site's own /favicon.ico on white once it has come; until then, or when it
 * has none, the name's first letter on the tile. Contact info shows a person.
 */
export function SiteIconTile({
  site,
  title,
  contact,
  side = 28,
}: {
  site?: string
  title: string
  contact: boolean
  side?: number
}) {
  const [state, settle] = useSiteIcon(site ?? '')
  // In the Windows app: the site's touch icon, read by the app and kept on the PC a week (the Mac's `SiteIcons`); none while it reads it.
  const kept = useKeptSiteIcon(site ?? '')
  const [keptLoad, setKeptLoad] = useState<{ src: string; shown: boolean }>()
  const inApp = kept !== undefined
  const src =
    site === undefined
      ? undefined
      : !inApp
        ? `https://${site}/favicon.ico`
        : kept === null || kept === 'waiting'
          ? undefined
          : kept
  const now = !inApp
    ? state
    : keptLoad?.src === src
      ? keptLoad?.shown
        ? 'shown'
        : 'none'
      : undefined
  const shown = src !== undefined && now === 'shown'
  const settleShown = (loaded: boolean) => {
    if (!inApp) settle(loaded)
    else if (src !== undefined) setKeptLoad({ src, shown: loaded })
  }
  return (
    <span
      className={classes('site-tile', shown && 'with-icon')}
      style={{ width: side, height: side, borderRadius: side * 0.2237 }}
      aria-hidden="true"
    >
      {src !== undefined && now !== 'none' && (
        <img
          className={shown ? undefined : 'coming'}
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          style={{ padding: side * 0.12 }}
          onLoad={(event) => settleShown(event.currentTarget.naturalWidth > 0)}
          onError={() => settleShown(false)}
        />
      )}
      {!shown &&
        (contact ? (
          <svg width={side * 0.5} height={side * 0.5} viewBox="0 0 16 16">
            <circle cx="8" cy="4.6" r="3.1" fill="currentColor" />
            <path
              d="M1.8 15c.5-3.6 3-5.6 6.2-5.6s5.7 2 6.2 5.6Z"
              fill="currentColor"
            />
          </svg>
        ) : (
          <span style={{ fontSize: side * 0.42 }}>
            {firstLetter(title).toUpperCase()}
          </span>
        ))}
    </span>
  )
}

/** Add Login, Add Contact Info (`MacStoreAddRow`): the blue plus (16) and the words in the link blue, 10 apart. */
function StoreAddRow({
  title,
  divided,
  onClick,
}: {
  title: string
  divided: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={classes('credentials-add', divided && 'divided')}
      onClick={onClick}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="8" fill="currentColor" />
        <path
          d="M8 4.4v7.2M4.4 8h7.2"
          stroke="var(--grouped-row)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      {title}
    </button>
  )
}

// MARK: The sheet

/** Everything the sheet holds but the password, which stays in its field. */
type Fields = Record<Exclude<DraftField, 'password'>, string>

function fieldsOf(draft: CredentialDraft): Fields {
  return {
    cardholder: draft.cardholder,
    number: draft.number,
    expiry: draft.expiry,
    securityCode: draft.securityCode,
    billingId: draft.billingId,
    name: draft.name,
    website: draft.website,
    username: draft.username,
    hints: draft.hints,
    fullName: draft.fullName,
    email: draft.email,
    phone: draft.phone,
    addressLine1: draft.addressLine1,
    addressLine2: draft.addressLine2,
    city: draft.city,
    region: draft.region,
    postalCode: draft.postalCode,
    country: draft.country,
  }
}

const sameFields = (a: Fields, b: Fields) =>
  (Object.keys(a) as (keyof Fields)[]).every((key) => a[key] === b[key])

/** Whether this browser masks a text field's words (`-webkit-text-security`: Chromium, so Edge and Electron, and Safari). */
function masksText(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('-webkit-text-security', 'disc')
  )
}

/**
 * The password field's shape: a text field, its words masked while they are
 * hidden, so no password manager takes the sheet for a sign-in or sign-up
 * (a page without a password field is no login form to it); where the
 * browser can't mask a text field, a password field while hidden. Never
 * filled by the browser.
 */
export function secretFieldShape(
  shown: boolean,
  masks: boolean,
): { type: 'text' | 'password'; masked: boolean; autoComplete: string } {
  if (shown) return { type: 'text', masked: false, autoComplete: 'off' }
  if (masks) return { type: 'text', masked: true, autoComplete: 'off' }
  return { type: 'password', masked: false, autoComplete: 'new-password' }
}

/** The password managers' own marks for a field that isn't the person's login here (the secret card's way, 3b). */
const notTheirs = {
  'data-1p-ignore': 'true',
  'data-lpignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
} as const

/**
 * A login or contact info on a sheet, in the app's own parts
 * (`MacCredentialSheet`): the glass disc that closes it and its name at
 * the top; its fields as Settings' rows, the label on the left and its box
 * on the right (the Account page's Name box: where to type is plain without
 * "Optional" in every row; the founder, 9 November 2026); the person's
 * details first, the entry's Name and Hints last; a saved password as dots until the eye is pressed and
 * the person allows it; Hints; Delete for a saved one; Save the sheet's one
 * wide button in the blue. A click outside closes it only while nothing was
 * changed; Escape closes it; Return in a field saves.
 */
export function CredentialSheet({
  model,
  edit,
  close,
  onSaved,
}: {
  model: CredentialsStoreModel
  edit: CredentialEdit
  close: () => void
  /** Told once a new entry is saved (the chat's store card says Saved). */
  onSaved?: (saved: StoredCredential) => void
}) {
  const entry = 'entry' in edit ? edit.entry : undefined
  const filled = 'filled' in edit ? edit.filled : undefined
  const kind: CredentialKind =
    entry?.kind ?? filled?.kind ?? ('kind' in edit ? edit.kind : 'login')
  const isLogin = kind === 'login'
  const isCard = kind === 'card'
  const [opened, setOpened] = useState<Fields>(() =>
    fieldsOf(entry ? draftOf(entry) : (filled ?? newDraft(kind))),
  )
  const [fields, setFields] = useState<Fields>(opened)
  // The password: only whether its field is blank and whether it differs from the one opened; never what it is.
  const password = useRef<HTMLInputElement>(null)
  const openedPassword = useRef('')
  const [passwordBlank, setPasswordBlank] = useState(true)
  const [passwordChanged, setPasswordChanged] = useState(false)
  const [passwordRead, setPasswordRead] = useState(entry === undefined)
  const [showsPassword, setShowsPassword] = useState(entry === undefined)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [revealing, setRevealing] = useState(false)
  // Windows Hello asking (the Windows app): the eye waits.
  const helloAsking = useRef(false)
  const [problem, setProblem] = useState<string>()
  const [asking, setAsking] = useState<'reveal' | 'delete'>()
  const sheet = useRef<HTMLDivElement>(null)
  const [masks] = useState(masksText)
  const shape = secretFieldShape(showsPassword, masks)
  /** The Country menu was open as this press began (its own listener closes it first): the press is the menu's. */
  const menuAtPress = useRef(false)

  const unchanged = sameFields(fields, opened) && !passwordChanged
  const empty =
    Object.values(fields).every((value) => value.trim() === '') && passwordBlank
  const canSave =
    !saving && !deleting && !empty && !(entry !== undefined && unchanged)

  /** Closed: the password's field emptied first, the one read from the server let go. */
  const leave = () => {
    if (password.current) password.current.value = ''
    openedPassword.current = ''
    close()
  }

  // Before any listener of the page sees a press: whether the Country menu is open.
  useEffect(() => {
    const press = () => {
      menuAtPress.current =
        sheet.current?.querySelector('.context-menus') != null
    }
    window.addEventListener('mousedown', press, true)
    return () => window.removeEventListener('mousedown', press, true)
  }, [])

  // The keys come to the sheet as it opens, and go back to what had them as it closes.
  useEffect(() => {
    const before =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    sheet.current?.focus()
    return () => {
      if (before?.isConnected) before.focus()
    }
  }, [])

  // Escape closes it (the × is its `cancelAction`), not while it saves, an alert is over it or its Country menu is open.
  const latest = useRef({ close: leave, saving, asking })
  useEffect(() => {
    latest.current = { close: leave, saving, asking }
  })
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      const now = latest.current
      if (now.asking !== undefined) return
      if (sheet.current?.querySelector('.context-menus')) return
      event.preventDefault()
      event.stopPropagation()
      if (!now.saving) now.close()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])

  const set = (key: keyof Fields) => (value: string) =>
    setFields((now) => ({ ...now, [key]: value }))

  /** The draft as it is now, the password read from its field at this moment. */
  const draft = (): CredentialDraft => ({
    kind,
    ...fields,
    password: password.current?.value ?? '',
    hasSavedNumber: entry?.kind === 'card',
  })

  const passwordTyped = () => {
    const value = password.current?.value ?? ''
    setPasswordBlank(value.trim() === '')
    setPasswordChanged(value !== openedPassword.current)
  }

  const save = async () => {
    if (!canSave) return
    const now = draft()
    const found = draftProblem(now)
    if (found !== undefined) {
      setProblem(found)
      // Windows' alert sound in the Windows app, where the Mac beeps.
      beep()
      return
    }
    setSaving(true)
    const saved = await model.save(
      now,
      entry && {
        entry,
        opened: {
          kind,
          ...opened,
          password: openedPassword.current,
          hasSavedNumber: entry.kind === 'card',
        },
        passwordRead,
      },
    )
    setSaving(false)
    if (!saved) {
      setProblem(model.problem)
      beep()
      return
    }
    if (entry === undefined) onSaved?.(saved)
    leave()
  }

  /** The eye: hides; shows what is typed; a saved password only once the person allows it, then read from the server. */
  const togglePassword = () => {
    if (revealing || asking !== undefined || helloAsking.current) return
    if (showsPassword) {
      setShowsPassword(false)
      return
    }
    if (!entry || (!isCard && !entry.hasPassword) || passwordRead) {
      setShowsPassword(true)
      return
    }
    // Windows Hello first, with the Mac's Touch ID words; cancelled, nothing is read; where it can't ask, the window's alert.
    helloAsking.current = true
    void confirmPresence(
      isCard
        ? t`Show the card ${credentialTitle(entry)}`
        : t`Show the password for ${credentialTitle(entry)}`,
    )
      .then((said) => {
        if (said === 'confirmed') void reveal()
        else if (said === 'alert') setAsking('reveal')
      })
      .finally(() => {
        helloAsking.current = false
      })
  }

  const reveal = async () => {
    if (!entry || revealing) return
    // One read at a time: the eye waits while it goes.
    setRevealing(true)
    try {
      if (isCard) {
        // What was typed before it was read is kept; the rest is the saved card.
        const card = await model.cardSecrets(entry)
        setOpened((now) => ({ ...now, ...card }))
        setFields((now) => ({
          ...now,
          number: now.number === '' ? card.number : now.number,
          securityCode:
            now.securityCode === '' ? card.securityCode : now.securityCode,
        }))
        setPasswordRead(true)
        setShowsPassword(true)
        return
      }
      const read = await model.password(entry)
      const field = password.current
      // What was typed before it was read is kept; the rest is the saved password.
      if (field && field.value === '') field.value = read
      openedPassword.current = read
      passwordTyped()
      setPasswordRead(true)
      setShowsPassword(true)
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error))
    } finally {
      setRevealing(false)
    }
  }

  const remove = async () => {
    if (!entry || saving || deleting) return
    // Save waits while the entry is deleted, so a change can't race it.
    setDeleting(true)
    const done = await model.delete(entry)
    setDeleting(false)
    if (done) leave()
    else setProblem(model.problem)
  }

  const onReturn = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    void save()
  }

  const title = entry
    ? credentialTitle(entry)
    : isLogin
      ? t('New Login')
      : isCard
        ? t('New Card')
        : t('New Contact Info')
  const brand =
    fields.number === '' ? (entry?.brand ?? '') : cardBrand(fields.number)
  const codeHidden = entry?.hasSecurityCode === true && !passwordRead
  const codeShape = secretFieldShape(showsPassword, masks)
  const hidden = entry?.hasPassword === true && !passwordRead

  const row = (
    key: keyof Fields,
    label: string,
    prompt: string | undefined,
    options: { divided?: boolean; autoComplete?: string; mine?: boolean } = {},
  ) => (
    <SettingsLine label={label} divided={options.divided ?? true}>
      <input
        className="credentials-field"
        value={fields[key]}
        placeholder={prompt}
        aria-label={label}
        autoComplete={options.autoComplete ?? 'off'}
        spellCheck={false}
        {...(options.mine ? notTheirs : {})}
        onChange={(event) => set(key)(event.target.value)}
        onKeyDown={onReturn}
      />
    </SettingsLine>
  )

  return createPortal(
    <div
      className="sheet-scrim"
      onMouseDown={(event) => {
        // A click outside closes it only while nothing was changed; with the Country menu open, it closes only the menu.
        if (event.target !== event.currentTarget || event.defaultPrevented)
          return
        if (menuAtPress.current) return
        if (!saving && unchanged && asking === undefined) leave()
      }}
    >
      <div
        ref={sheet}
        className={classes('credential-sheet', kind)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="credential-head">
          <span className="credential-close">
            <PanelDisc
              symbol="xmark"
              label={t('Close')}
              disabled={saving}
              onClick={leave}
            />
          </span>
          <h2 className="credential-title">{title}</h2>
        </div>
        <div className="credential-body">
          {isLogin ? (
            <SettingsGroup>
              {row('website', t('Website'), 'acme.com', {
                divided: false,
                autoComplete: 'off',
                mine: true,
              })}
              {row('username', t('Username or email'), undefined, {
                autoComplete: 'off',
                mine: true,
              })}
              <SettingsLine label={t('Password')} divided>
                <span className="credential-password">
                  <input
                    ref={password}
                    className={classes(
                      'credentials-field password',
                      shape.masked && 'masked',
                    )}
                    type={shape.type}
                    defaultValue=""
                    placeholder={hidden ? '••••••••' : undefined}
                    aria-label={t('Password')}
                    autoComplete={shape.autoComplete}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    {...notTheirs}
                    onChange={passwordTyped}
                    onKeyDown={onReturn}
                    // Masked, its words can't be copied, cut or dragged out, as a password field's.
                    onCopy={(event) => {
                      if (shape.masked) event.preventDefault()
                    }}
                    onCut={(event) => {
                      if (shape.masked) event.preventDefault()
                    }}
                    onDragStart={(event) => {
                      if (shape.masked) event.preventDefault()
                    }}
                  />
                  <button
                    type="button"
                    className="credential-eye"
                    title={
                      showsPassword ? t('Hide Password') : t('Show Password')
                    }
                    aria-label={
                      showsPassword ? t('Hide Password') : t('Show Password')
                    }
                    disabled={revealing || deleting}
                    onClick={togglePassword}
                  >
                    <EyeSymbol slashed={showsPassword} />
                  </button>
                </span>
              </SettingsLine>
            </SettingsGroup>
          ) : isCard ? (
            <>
              <SettingsGroup>
                <SettingsLine label={t('Card number')} divided={false}>
                  <span className="credential-password">
                    <input
                      className="credentials-field password card-number"
                      value={fields.number}
                      placeholder={
                        entry?.last4
                          ? `•••• ${entry.last4}`
                          : '1234 5678 9012 3456'
                      }
                      aria-label={t('Card number')}
                      inputMode="numeric"
                      autoComplete="off"
                      spellCheck={false}
                      {...notTheirs}
                      onChange={(event) => set('number')(event.target.value)}
                      onKeyDown={onReturn}
                    />
                    {brand !== '' && (
                      <span className="credential-brand">
                        <PaymentMark brand={brand} />
                      </span>
                    )}
                    {entry && (
                      <button
                        type="button"
                        className="credential-eye"
                        title={showsPassword ? t('Hide Card') : t('Show Card')}
                        aria-label={
                          showsPassword ? t('Hide Card') : t('Show Card')
                        }
                        disabled={revealing || deleting}
                        onClick={togglePassword}
                      >
                        <EyeSymbol slashed={showsPassword} />
                      </button>
                    )}
                  </span>
                </SettingsLine>
                {row('expiry', t('Expiry'), 'MM/YY', { mine: true })}
                <SettingsLine label={t('Security code')} divided>
                  <input
                    className={classes(
                      'credentials-field',
                      codeShape.masked && 'masked',
                    )}
                    type={codeShape.type}
                    value={fields.securityCode}
                    placeholder={codeHidden ? '•••' : '123'}
                    aria-label={t('Security code')}
                    inputMode="numeric"
                    autoComplete={codeShape.autoComplete}
                    spellCheck={false}
                    {...notTheirs}
                    onChange={(event) =>
                      set('securityCode')(event.target.value)
                    }
                    onKeyDown={onReturn}
                  />
                </SettingsLine>
                {row('cardholder', t('Name on card'), undefined, {
                  mine: true,
                })}
              </SettingsGroup>
              <SettingsGroup>
                <SettingsMenu
                  label={t('Billing address')}
                  options={[
                    { value: '', label: t('None') },
                    ...model.contacts
                      .filter((contact) => addressLine(contact) !== '')
                      .map((contact) => ({
                        value: contact.id,
                        label: `${credentialTitle(contact)} · ${addressLine(contact)}`,
                      })),
                  ]}
                  value={fields.billingId}
                  shown={
                    model.contacts.find(
                      (contact) => contact.id === fields.billingId,
                    ) === undefined
                      ? t('None')
                      : credentialTitle(
                          model.contacts.find(
                            (contact) => contact.id === fields.billingId,
                          ) as StoredCredential,
                        )
                  }
                  pick={set('billingId')}
                />
              </SettingsGroup>
            </>
          ) : (
            <>
              <SettingsGroup>
                {row('fullName', t('Full name'), undefined, {
                  divided: false,
                  autoComplete: 'name',
                })}
                {row('email', t('Email'), undefined, { autoComplete: 'email' })}
                {row('phone', t('Phone'), undefined, { autoComplete: 'tel' })}
              </SettingsGroup>
              <SettingsGroup title={t('Address')}>
                {row('addressLine1', t('Address'), undefined, {
                  divided: false,
                  autoComplete: 'address-line1',
                })}
                {row('addressLine2', t('Address line 2'), undefined, {
                  autoComplete: 'address-line2',
                })}
                {row('city', t('City'), undefined, {
                  autoComplete: 'address-level2',
                })}
                {row('region', t('State or region'), undefined, {
                  autoComplete: 'address-level1',
                })}
                {row('postalCode', t('Postal code'), undefined, {
                  autoComplete: 'postal-code',
                })}
                <SettingsMenu
                  label={t('Country')}
                  divided
                  options={(countries as [string, string][]).map(
                    ([code, name]) => ({ value: code, label: name }),
                  )}
                  value={fields.country}
                  shown={fields.country === '' ? t('Choose') : undefined}
                  pick={set('country')}
                />
              </SettingsGroup>
            </>
          )}
          {/* What the entry is called and when to use it, last (the founder, 9 November 2026). */}
          <SettingsGroup
            footer={
              entry?.savedBy !== undefined
                ? t`Saved by ${entry.savedBy} at a sign-up.`
                : undefined
            }
          >
            {row('name', t('Name'), undefined, { divided: false })}
            <SettingsLine label={t('Hints')} divided>
              <textarea
                className="credentials-field credential-hints"
                value={fields.hints}
                rows={1}
                placeholder={t('Tell Simeon when to use this entry')}
                aria-label={t('Hints')}
                onChange={(event) => set('hints')(event.target.value)}
              />
            </SettingsLine>
          </SettingsGroup>
          {problem !== undefined && (
            <p className="credential-problem" role="alert">
              {problem}
            </p>
          )}
          {entry && (
            <SettingsGroup>
              <SettingsActionRow
                title={
                  isLogin
                    ? t('Delete Login')
                    : isCard
                      ? t('Delete Card')
                      : t('Delete Contact Info')
                }
                destructive
                busy={deleting}
                disabled={saving}
                onClick={() => setAsking('delete')}
              />
            </SettingsGroup>
          )}
        </div>
        <div className="credential-foot">
          <button
            type="button"
            className="credential-save"
            disabled={!canSave}
            onClick={() => void save()}
          >
            {saving && <span className="credential-wheel" aria-hidden="true" />}
            {t('Save')}
          </button>
        </div>
      </div>
      {asking === 'reveal' && entry && (
        <Alert
          title={
            isCard
              ? t`Show the card ${credentialTitle(entry)}`
              : t`Show the password for ${credentialTitle(entry)}`
          }
          message=""
          action={t('Show')}
          cancel={t('Cancel')}
          onAction={() => {
            setAsking(undefined)
            void reveal()
          }}
          onCancel={() => setAsking(undefined)}
        />
      )}
      {asking === 'delete' && (
        <Alert
          title={
            isLogin
              ? t('Delete this login?')
              : isCard
                ? t('Delete this card?')
                : t('Delete this contact info?')
          }
          message={t("Your agents won't be able to use it anymore.")}
          action={t('Delete')}
          destructive
          cancel={t('Cancel')}
          onAction={() => {
            setAsking(undefined)
            void remove()
          }}
          onCancel={() => setAsking(undefined)}
        />
      )}
    </div>,
    document.body,
  )
}

/** `eye` and `eye.slash` (13, the grey). */
function EyeSymbol({ slashed }: { slashed: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8Z" />
        <circle cx="8" cy="8" r="2" />
        {slashed && <path d="M2.5 2.5l11 11" />}
      </g>
    </svg>
  )
}
