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
import { AppLogoTile } from './ConnectCards'
import countries from './countries.json'
import { Alert } from './Dialogs'
import { FormButton, FormField, FormSelect } from './FormParts'
import { useSiteIcon } from './MessageText'
import { confirmPresence } from './presence'
import './SettingsCredentials.css'
import {
  PanelDisc,
  SettingsGroup,
  SettingsLine,
  SettingsPill,
  SettingsSymbol,
} from './SettingsParts'
import { useWatched } from './useStore'
import { useWindowModel } from './windowModel'

/** What the sheet opens on: a new login or contact info, or a saved entry. */
type CredentialEdit = { kind: CredentialKind } | { entry: StoredCredential }

export function SettingsCredentialsPage({ store }: { store: AppStore }) {
  const [model] = useState(
    () => new CredentialsStoreModel(store.credentialsCall),
  )
  useWatched(model)
  const settings = useWindowModel()
  const [editing, setEditing] = useState<CredentialEdit>()
  useEffect(() => {
    void model.load()
  }, [model])
  return (
    <div className="credentials-page">
      <p className="credentials-lead">
        {t(
          'Logins and details your agents use to sign in and sign up for you.',
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
              "Your cards stay with Link. Simeon pays with a one-time card and never sees a card's number or security code.",
            )}
          >
            <StoreLine onClick={() => settings.showSettingsPage('wallet')}>
              <AppLogoTile name="Link" side={28} id="link" />
              <span className="credentials-title">Link by Stripe</span>
            </StoreLine>
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
      <SiteIconTile
        site={iconSite(entry)}
        title={title}
        contact={entry.kind === 'contact'}
      />
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
function SiteIconTile({
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
 * A login or contact info on a sheet (`MacCredentialSheet`; the founder, 9
 * November 2026: the Settings rows with "Optional" on the right were "very
 * confusing"; another app's form, "how grok bot does it", is "what makes
 * sense"): its kind's symbol and its name at the top, the glass disc that
 * closes it at the right; each field's name over its box, two to a line
 * where they pair (City and State, Postal code and Country, Name and
 * Hints); a saved password as dots until the eye is pressed and the person
 * allows it; at the foot Delete (a saved one) on the left, Cancel and Save
 * on the right. A click outside closes it only while nothing was changed;
 * Escape closes it; Return in a field saves.
 */
function CredentialSheet({
  model,
  edit,
  close,
}: {
  model: CredentialsStoreModel
  edit: CredentialEdit
  close: () => void
}) {
  const entry = 'entry' in edit ? edit.entry : undefined
  const kind: CredentialKind =
    entry?.kind ?? ('kind' in edit ? edit.kind : 'login')
  const isLogin = kind === 'login'
  const [opened] = useState<Fields>(() =>
    fieldsOf(entry ? draftOf(entry) : newDraft(kind)),
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

  // Escape closes it (the × is its `cancelAction`), not while it saves or an alert is over it.
  const latest = useRef({ close: leave, saving, asking })
  useEffect(() => {
    latest.current = { close: leave, saving, asking }
  })
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      const now = latest.current
      if (now.asking !== undefined) return
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
        opened: { kind, ...opened, password: openedPassword.current },
        passwordRead,
      },
    )
    setSaving(false)
    if (!saved) {
      setProblem(model.problem)
      beep()
      return
    }
    leave()
  }

  /** The eye: hides; shows what is typed; a saved password only once the person allows it, then read from the server. */
  const togglePassword = () => {
    if (revealing || asking !== undefined || helloAsking.current) return
    if (showsPassword) {
      setShowsPassword(false)
      return
    }
    if (!entry || !entry.hasPassword || passwordRead) {
      setShowsPassword(true)
      return
    }
    // Windows Hello first, with the Mac's Touch ID words; cancelled, nothing is read; where it can't ask, the window's alert.
    helloAsking.current = true
    void confirmPresence(t`Show the password for ${credentialTitle(entry)}`)
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
      : t('New Contact Info')
  const hidden = entry?.hasPassword === true && !passwordRead

  const field = (
    key: keyof Fields,
    label: string,
    options: { autoComplete?: string; mine?: boolean; prompt?: string } = {},
  ) => (
    <FormField label={label}>
      <input
        value={fields[key]}
        placeholder={options.prompt}
        autoComplete={options.autoComplete ?? 'off'}
        spellCheck={false}
        {...(options.mine ? notTheirs : {})}
        onChange={(event) => set(key)(event.target.value)}
        onKeyDown={onReturn}
      />
    </FormField>
  )

  return createPortal(
    <div
      className="sheet-scrim"
      onMouseDown={(event) => {
        // A click outside closes it only while nothing was changed.
        if (event.target !== event.currentTarget || event.defaultPrevented)
          return
        if (!saving && unchanged && asking === undefined) leave()
      }}
    >
      <div
        ref={sheet}
        className={classes('credential-sheet', isLogin ? 'login' : 'contact')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="credential-head">
          <span className="credential-kind" aria-hidden="true">
            <SettingsSymbol
              name={isLogin ? 'key' : 'personCropCircle'}
              size={14}
            />
          </span>
          <h2 className="credential-title">{title}</h2>
          <PanelDisc
            symbol="xmark"
            label={t('Close')}
            disabled={saving}
            onClick={leave}
          />
        </div>
        <div className="credential-body form-fields">
          {isLogin ? (
            <>
              {field('website', t('Website'), {
                mine: true,
                prompt: 'acme.com',
              })}
              {field('username', t('Username or email'), { mine: true })}
              <FormField label={t('Password')}>
                <input
                  ref={password}
                  className={classes(
                    'credential-secret',
                    shape.masked && 'masked',
                  )}
                  type={shape.type}
                  defaultValue=""
                  placeholder={hidden ? '••••••••' : undefined}
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
              </FormField>
            </>
          ) : (
            <>
              {field('fullName', t('Full name'), { autoComplete: 'name' })}
              {field('addressLine1', t('Address'), {
                autoComplete: 'address-line1',
              })}
              {field('addressLine2', t('Address line 2'), {
                autoComplete: 'address-line2',
              })}
              <div className="form-pair">
                {field('city', t('City'), { autoComplete: 'address-level2' })}
                {field('region', t('State or region'), {
                  autoComplete: 'address-level1',
                })}
              </div>
              <div className="form-pair">
                {field('postalCode', t('Postal code'), {
                  autoComplete: 'postal-code',
                })}
                <FormSelect
                  label={t('Country')}
                  options={(countries as [string, string][]).map(
                    ([code, name]) => ({ value: code, label: name }),
                  )}
                  value={fields.country}
                  placeholder={t('Choose')}
                  pick={set('country')}
                />
              </div>
              {field('phone', t('Phone'), { autoComplete: 'tel' })}
              {field('email', t('Email'), { autoComplete: 'email' })}
            </>
          )}
          <div className="form-pair">
            {field('name', t('Name'))}
            <FormField
              label={t('Hints')}
              note={t('Tell Simeon when to use this entry')}
            >
              <textarea
                value={fields.hints}
                rows={1}
                onChange={(event) => set('hints')(event.target.value)}
              />
            </FormField>
          </div>
          {entry?.savedBy !== undefined && (
            <p className="form-note">{t`Saved by ${entry.savedBy} at a sign-up.`}</p>
          )}
          {problem !== undefined && (
            <p className="credential-problem" role="alert">
              {problem}
            </p>
          )}
        </div>
        <div className="credential-foot form-buttons">
          {entry && (
            <FormButton
              kind="destructive"
              busy={deleting}
              disabled={saving}
              onClick={() => setAsking('delete')}
            >
              {t('Delete')}
            </FormButton>
          )}
          <span className="form-buttons-spacer" />
          <FormButton disabled={saving} onClick={leave}>
            {t('Cancel')}
          </FormButton>
          <FormButton
            kind="primary"
            busy={saving}
            disabled={!canSave}
            onClick={() => void save()}
          >
            {t('Save')}
          </FormButton>
        </div>
      </div>
      {asking === 'reveal' && entry && (
        <Alert
          title={t`Show the password for ${credentialTitle(entry)}`}
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
            isLogin ? t('Delete this login?') : t('Delete this contact info?')
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
