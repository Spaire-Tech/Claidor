// Settings' General, its account page, Permissions, Help & support and
// Legal (mac/Simeon/SettingsGeneral.swift), at the Mac's measures, in
// Settings' parts (SettingsParts.tsx):
//
// - General (`SettingsGeneralPage`, the founder's reference, 21 October
//   2026): the account first (its page under General), Language, Appearance
//   and the time zone the agents keep.
// - Account (`SettingsAccountPage`): the face beside the name and email;
//   Name written in its row; Email copied with a click; Password set or
//   changed in its row, typed twice. No Delete Account, as on the Mac.
// - Permissions (`SettingsPermissionsPage`): Auto-review and its two lists
//   of rules, each rule edited in its row and deleted at once, the last row
//   adding one.
// - Help & support (`SettingsHelpPage`): Send feedback and Report an issue
//   open their sheets (Feedback.tsx). The Mac's "Simeon Help Center" row
//   does nothing (the founder, 22 October 2026: "leave it there even tho it
//   doesn't point to anything yet"); a page never shows a button that does
//   nothing, so it is left out here until it points somewhere.
// - Legal (`SettingsLegalPage`): the Privacy Policy and the Terms of
//   Service in a new tab, the company under them.

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  GeneralSettingsModel,
  type ReviewRule,
  type RuleBehavior,
  accountDisplay,
  automaticZone,
  characterCount,
  copyrightLine,
  isFullList,
  knownTimeZones,
  languageChoices,
  legalPages,
  reviewRules,
  ruleBehaviors,
  ruleLimitNote,
  ruleList,
  ruleListLabel,
  sameRule,
  zoneLabel,
  zoneTimesNow,
  zoneValues,
} from '../core/generalSettings'
import { t as coreT } from '../core/l10n'
import {
  chooseLanguage,
  chosenAtLaunch,
  chosenLanguage,
} from '../core/language'
import { normalizedName } from '../core/onboarding'
import type { AppStore } from '../core/store'
import { desktop } from '../desktop/desktop'
import { t } from '../l10n'
import { classes } from './classes'
import { ContextMenu, Glyph } from './ContextMenu'
import { markStyle } from './FirstRun'
import { useDismiss } from './MessageActions'
import './SettingsGeneral.css'
import {
  SettingsAccountFace,
  SettingsActionRow,
  SettingsGroup,
  SettingsLine,
  SettingsLinkRow,
  SettingsMenu,
  SettingsMenuLabel,
  SettingsPill,
  SettingsSwitch,
  SettingsSymbol,
  SettingsSymbolPicker,
} from './SettingsParts'
import { type ThemePreference, setTheme, useThemePreference } from './theme'
import { useWatched } from './useStore'
import { useWindowModel } from './windowModel'

/** The account's password: at least eight characters (`EmailSignIn.minimumPassword`). */
const minimumPassword = 8

/** A page of the web opened in a new tab, without `opener` or the referrer. */
function openPage(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** The values a page shows as the computer keeps them, read as it shows (`GeneralSettingsModel`, one per page, `.task { model.load }`). */
function usePageModel(store: AppStore): GeneralSettingsModel {
  const [model] = useState(() => new GeneralSettingsModel(store))
  useWatched(model)
  useEffect(() => {
    void model.load()
  }, [model])
  return model
}

// MARK: Symbols of these pages' own (SF Symbols, outlined on a 16 grid)

type OwnSymbol =
  | 'squareAndPencil'
  | 'trash'
  | 'plusCircleFill'
  | 'ladybug'
  | 'docOnDoc'
  | 'checkmark'

function OwnSymbol({ name, size }: { name: OwnSymbol; size: number }) {
  switch (name) {
    case 'trash':
      return <Glyph name="trash" size={size} />
    case 'docOnDoc':
      return <Glyph name="copy" size={size} />
    case 'checkmark':
      return <Glyph name="check" size={size} />
  }
  const drawn: Record<
    Exclude<OwnSymbol, 'trash' | 'docOnDoc' | 'checkmark'>,
    ReactNode
  > = {
    squareAndPencil: (
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8.5 3H4a1.5 1.5 0 0 0-1.5 1.5v7.5A1.5 1.5 0 0 0 4 13.5h7.5A1.5 1.5 0 0 0 13 12V7.5" />
        <path d="M12.2 2.3l1.5 1.5-5.6 5.6-2.1.6.6-2.1Z" />
      </g>
    ),
    // The circle in the ink, its plus cut out (drawn in the card's grey under it).
    plusCircleFill: (
      <>
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path
          d="M8 4.6v6.8M4.6 8h6.8"
          stroke="var(--grouped-row)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </>
    ),
    ladybug: (
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <ellipse cx="8" cy="9.6" rx="4.2" ry="4.6" />
        <path d="M5.9 5.6a2.1 2.1 0 0 1 4.2 0M8 5v9.2M6.6 3.4 5.6 2.2M9.4 3.4l1-1.2M3.8 8.2l-1.5-.8M3.8 11.2l-1.5.6M12.2 8.2l1.5-.8M12.2 11.2l1.5.6" />
        <circle cx="6.2" cy="8.6" r=".5" fill="currentColor" />
        <circle cx="9.8" cy="8.6" r=".5" fill="currentColor" />
        <circle cx="6.2" cy="11.6" r=".5" fill="currentColor" />
        <circle cx="9.8" cy="11.6" r=".5" fill="currentColor" />
      </g>
    ),
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {drawn[name]}
    </svg>
  )
}

// MARK: General

/**
 * General (`SettingsGeneralPage`): the account's row, Language, Appearance
 * and the time zone, 22 apart. The values the computer keeps are read as
 * the page shows.
 */
export function SettingsGeneralPage({ store }: { store: AppStore }) {
  const windowModel = useWindowModel()
  const model = usePageModel(store)
  return (
    <div className="settings-page general-page">
      <SettingsGroup>
        <AccountRow onClick={() => windowModel.showSettingsPage('account')} />
      </SettingsGroup>
      <LanguageGroup />
      <AppearanceGroup />
      <TimeZoneGroup model={model} />
    </div>
  )
}

/**
 * The account's row (`AccountRow`, the founder, 22 October 2026: "do like
 * them for meta account instead of showing the email"): the Simeon mark
 * (16, in the line's grey, in a 28 column), "Simeon Account" over what its
 * page holds, the chevron; 64 high at the least, a step darker under the
 * pointer.
 */
function AccountRow({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="general-account-row" onClick={onClick}>
      <span className="general-account-mark" aria-hidden="true">
        <span style={markStyle} />
      </span>
      <span className="general-account-words">
        <span className="general-account-title">{t('Simeon Account')}</span>
        <span className="general-account-detail">
          {t('Name, email and password')}
        </span>
      </span>
      <span className="settings-link-chevron">
        <SettingsSymbol name="chevronRight" size={10} weight={1.7} />
      </span>
    </button>
  )
}

/** Relaunch: the Windows app starts again (the Mac's `relaunch`, SettingsGeneral.swift), the page loads again on the web. */
function relaunch(): void {
  const host = desktop()
  if (host) void host.call('relaunch').catch(() => window.location.reload())
  else window.location.reload()
}

/**
 * Language (`LanguageGroup`): System, or a language Simeon is in, each in
 * its own name, kept in this browser. Another choice than the one the page
 * was loaded with waits for a reload: "Relaunch Simeon to use it." and the
 * row that loads the page again in it (the Mac relaunches the app; the
 * Windows app does too, `relaunch`).
 */
function LanguageGroup() {
  const [chosen, setChosen] = useState(() => chosenLanguage())
  const options = useMemo(() => languageChoices(), [])
  const waiting = chosen !== chosenAtLaunch()
  return (
    <SettingsGroup
      footer={waiting ? t('Relaunch Simeon to use it.') : undefined}
    >
      <SettingsMenu
        label={t('Language')}
        options={options}
        value={chosen}
        pick={(value) => {
          chooseLanguage(value)
          setChosen(value)
        }}
      />
      {waiting && (
        <SettingsActionRow title={t('Relaunch')} divided onClick={relaunch} />
      )}
    </SettingsGroup>
  )
}

/** Appearance (`AppearanceGroup`, the reference's Mode): Light, Dark or System as the sun, the moon and the screen, the whole window at once (`setTheme`, as ⌘K's and "/"'s). */
function AppearanceGroup() {
  const theme = useThemePreference()
  const options: {
    value: ThemePreference
    symbol: 'sun' | 'moon' | 'display'
    label: string
  }[] = [
    { value: 'light', symbol: 'sun', label: t('Light') },
    { value: 'dark', symbol: 'moon', label: t('Dark') },
    { value: 'system', symbol: 'display', label: t('System') },
  ]
  return (
    <SettingsGroup title={t('Appearance')}>
      <SettingsLine label={t('Mode')}>
        <SettingsSymbolPicker
          options={options}
          value={theme}
          pick={setTheme}
          label={t('Appearance')}
        />
      </SettingsLine>
    </SettingsGroup>
  )
}

/**
 * The time zone the agents' computer keeps (`TimeZoneGroup`): "Set Time
 * Zone Automatically" follows this browser's; turned off, it keeps this
 * browser's until another is chosen in the menu of every zone, each with the
 * time there now. Each waits while its change goes, and until the
 * computer's zone is read (a read that failed says so in red, the core's
 * words for it).
 */
function TimeZoneGroup({ model }: { model: GeneralSettingsModel }) {
  const automatic = model.zoneOverride === undefined
  const [menu, setMenu] = useState<HTMLElement>()
  const current = model.zoneOverride ?? model.followedZone
  const waits = !model.loaded || model.zonePending
  return (
    <SettingsGroup
      title={t('Time Zone')}
      footer={
        model.loadFailed
          ? coreT("Couldn't load your settings")
          : t('Your agents keep this time zone for routines and reminders.')
      }
      footerTint={model.loadFailed ? 'var(--danger)' : undefined}
    >
      <SettingsSwitch
        label={t('Set Time Zone Automatically')}
        on={automatic}
        disabled={waits}
        onChange={(on) =>
          void model.setZone(on ? undefined : model.followedZone)
        }
      />
      <SettingsLine label={t('Time Zone')} divided>
        {automatic ? (
          <span className="general-zone-shown">
            {zoneLabel(model.followedZone)}
          </span>
        ) : (
          <button
            type="button"
            className="settings-menu"
            aria-label={t('Time Zone')}
            aria-haspopup="menu"
            aria-expanded={menu !== undefined}
            disabled={waits}
            onClick={(event) => setMenu(event.currentTarget)}
          >
            <SettingsMenuLabel text={zoneLabel(current)} />
          </button>
        )}
      </SettingsLine>
      {menu && (
        <ZoneMenu
          under={menu}
          override={model.zoneOverride}
          current={current}
          pick={(zone) => void model.setZone(zone)}
          close={() => setMenu(undefined)}
        />
      )}
    </SettingsGroup>
  )
}

/**
 * Every zone, each with the time there now in grey, the chosen one ticked
 * and laid over the button (`zoneMenu`, `RoutineMenus.popUp(over:)`): the
 * window's menu (`.pop-menu`), at least 360 wide, as tall as the window at
 * most and scrolled to the chosen one. ↑ and ↓ choose, Return picks, letters
 * typed go to the zone they start; Escape, a click elsewhere or the window
 * going to the back closes it, and the keys go back to the button.
 */
function ZoneMenu({
  under,
  override,
  current,
  pick,
  close,
}: {
  under: HTMLElement
  override: string | undefined
  current: string
  pick: (zone: string) => void
  close: () => void
}) {
  const holder = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  useDismiss(holder, close)
  const values = useMemo(
    () =>
      zoneValues(override, knownTimeZones()).filter(
        (value) => value !== automaticZone,
      ),
    [override],
  )
  // One reading of the clock for the whole menu, as the Mac's.
  const times = useMemo(() => zoneTimesNow(values), [values])
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const rect = under.getBoundingClientRect()
    const height = Math.min(element.scrollHeight, window.innerHeight - 16)
    const chosen = element.querySelector<HTMLElement>('[aria-checked="true"]')
    const rowTop = chosen?.offsetTop ?? 0
    // The chosen zone over the button, as far as the window lets the menu go.
    const top = Math.min(
      Math.max(8, rect.top - rowTop),
      window.innerHeight - 8 - height,
    )
    const width = element.offsetWidth
    const left = Math.min(
      Math.max(8, rect.left - 5),
      window.innerWidth - 8 - width,
    )
    element.style.left = `${left}px`
    element.style.top = `${Math.max(8, top)}px`
    element.style.maxHeight = `${height}px`
    element.scrollTop = Math.max(0, rowTop - (rect.top - Math.max(8, top)))
    element.style.visibility = 'visible'
    ;(chosen ?? element).focus({ preventScroll: true })
    return () => {
      if (under.isConnected) under.focus({ preventScroll: true })
    }
  }, [under])
  // Letters typed go to the first zone they start (the Mac's menus' type-select), a second apart at most.
  const typed = useRef({ words: '', at: 0 })
  const rows = () => [
    ...(box.current?.querySelectorAll<HTMLButtonElement>('.menu-item') ?? []),
  ]
  const onKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = rows()
    const index = list.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'ArrowDown')
      list[Math.min(list.length - 1, index + 1)]?.focus()
    else if (event.key === 'ArrowUp') list[Math.max(0, index - 1)]?.focus()
    else if (
      event.key.length === 1 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      const now = Date.now()
      const words =
        (now - typed.current.at < 1000 ? typed.current.words : '') +
        event.key.toLowerCase()
      typed.current = { words, at: now }
      list
        .find((row) => (row.dataset.zone ?? '').toLowerCase().startsWith(words))
        ?.focus()
    } else return
    event.preventDefault()
    event.stopPropagation()
  }
  return (
    <div ref={holder} className="context-menus">
      <div
        ref={box}
        className="pop-menu context-menu zone-menu"
        role="menu"
        aria-label={t('Time Zone')}
        tabIndex={-1}
        style={{ position: 'fixed', visibility: 'hidden', left: 0, top: 0 }}
        onKeyDown={onKey}
      >
        {values.map((value, index) => {
          const label = zoneLabel(value)
          const checked = value === current
          return (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={checked}
              data-zone={label}
              className="menu-item"
              onClick={() => {
                close()
                if (!checked) pick(value)
              }}
            >
              <span className="menu-glyph">
                {checked && <Glyph name="check" />}
              </span>
              <span className="menu-label">
                {label}
                {times[index] && (
                  <span className="zone-menu-time">
                    {'   '}
                    {times[index]}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// MARK: Account

/**
 * The account, under General (`SettingsAccountPage`): its face (44) beside
 * its name and email; Name, written in place (what the agents call the
 * person), then Email (copied with a click) and Password (set or changed
 * here, typed twice). Log out is at the foot of the list of pages.
 */
export function SettingsAccountPage({ store }: { store: AppStore }) {
  useWatched(store)
  const account = store.account
  const display = accountDisplay(account?.name, account?.email)
  const mail = account?.email ?? ''
  const [copied, setCopied] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  // Why the name was not saved, under its card in red.
  const [nameProblem, setNameProblem] = useState<string>()
  const hint = useId()
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1_200)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = () => {
    void navigator.clipboard?.writeText(mail).then(
      () => setCopied(true),
      () => {},
    )
  }
  const at = mail.lastIndexOf('@')
  return (
    <div className="settings-page general-page">
      <div className="account-head">
        <SettingsAccountFace size={44} store={store} />
        <div className="account-head-words">
          <div className="account-head-name">{display.title}</div>
          {display.secondary && (
            <div className="account-head-mail">{display.secondary}</div>
          )}
        </div>
      </div>
      <SettingsGroup
        footer={nameProblem ?? t('Your agents call you by this name.')}
        footerTint={nameProblem ? 'var(--danger)' : undefined}
      >
        <NameLine store={store} problem={setNameProblem} />
      </SettingsGroup>
      <SettingsGroup>
        {mail !== '' && (
          <button
            type="button"
            className="account-email"
            aria-describedby={hint}
            onClick={copy}
          >
            <SettingsLine label={t('Email')}>
              <span className="account-email-end">
                {/* Cut in its middle, as the Mac's: what is before the @ gives way, the domain stays. */}
                <span className="account-email-value">
                  <span className="account-email-local">
                    {at > 0 ? mail.slice(0, at) : mail}
                  </span>
                  {at > 0 && (
                    <span className="account-email-domain">
                      {mail.slice(at)}
                    </span>
                  )}
                </span>
                <OwnSymbol name={copied ? 'checkmark' : 'docOnDoc'} size={12} />
              </span>
            </SettingsLine>
            <span id={hint} hidden>
              {t('Copies the email')}
            </span>
          </button>
        )}
        <SettingsLinkRow
          label={t('Password')}
          divided={mail !== ''}
          onClick={() => setChangingPassword((open) => !open)}
        />
        {changingPassword && (
          <PasswordForm
            store={store}
            email={mail}
            done={() => setChangingPassword(false)}
          />
        )}
      </SettingsGroup>
    </div>
  )
}

/**
 * Name, written in its row (`NameLine`; the founder, 22 October 2026:
 * "theres name there, but uneditable"): a field at the row's end, saved on
 * Return or when it lets go of the keys, when it changed
 * (`AppStore.changeName`); a spinner while it goes. Refused, the name comes
 * back and why is said under the card.
 */
function NameLine({
  store,
  problem,
}: {
  store: AppStore
  problem: (why: string | undefined) => void
}) {
  const saved = store.account?.name ?? ''
  const [text, setText] = useState(saved)
  const [saving, setSaving] = useState(false)
  const [focused, setFocused] = useState(false)
  const busy = useRef(false)
  // The account's name changed elsewhere: the field follows it, unless it is being written in or saved.
  const [seen, setSeen] = useState(saved)
  if (seen !== saved) {
    setSeen(saved)
    if (!focused && !saving) setText(saved)
  }
  const save = async () => {
    if (busy.current) return
    const typed = normalizedName(text)
    // Nothing new, or nothing at all: the name stays as it was.
    if (typed === '' || typed === saved) {
      setText(saved)
      return
    }
    busy.current = true
    setSaving(true)
    problem(undefined)
    const refused = await store.changeName(typed)
    busy.current = false
    setSaving(false)
    setText(store.account?.name ?? saved)
    problem(refused)
  }
  return (
    <SettingsLine label={t('Name')}>
      <span className="account-name-end">
        {saving && <span className="settings-spinner" aria-hidden="true" />}
        <input
          className="account-field account-name-field"
          value={text}
          aria-label={t('Name')}
          autoComplete="name"
          spellCheck={false}
          disabled={saving}
          onChange={(event) => setText(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            void save()
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
            event.preventDefault()
            void save()
          }}
        />
      </span>
    </SettingsLine>
  )
}

/**
 * The password (`PasswordForm`, the iPhone's Password page, in its row):
 * typed twice, at least eight characters; Set Password, or Change Password
 * once there is one. A refusal or a mismatch in red under the fields. What
 * is typed stays in the browser's own masked fields: looked at only to say
 * whether the two match and are long enough, read once as it is sent,
 * emptied once saved, never kept by the page.
 */
function PasswordForm({
  store,
  email,
  done,
}: {
  store: AppStore
  email: string
  done: () => void
}) {
  const [hasPassword, setHasPassword] = useState<boolean>()
  const first = useRef<HTMLInputElement>(null)
  const again = useRef<HTMLInputElement>(null)
  const [typed, setTyped] = useState({
    longEnough: false,
    same: true,
    againEmpty: true,
  })
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const [problem, setProblem] = useState<string>()
  // This form is shown: a save it began answers to it only, not to a form opened again meanwhile.
  const shown = useRef(true)
  useEffect(() => {
    shown.current = true
    return () => {
      shown.current = false
    }
  }, [])
  useEffect(() => {
    let live = true
    void store.hasPassword().then((has) => {
      if (live) setHasPassword(has)
    })
    return () => {
      live = false
    }
  }, [store])
  const look = () => {
    const one = first.current?.value ?? ''
    const two = again.current?.value ?? ''
    setTyped({
      longEnough: characterCount(one) >= minimumPassword,
      same: one === two,
      againEmpty: two === '',
    })
  }
  const mismatch = !typed.againEmpty && !typed.same
  const ready = typed.longEnough && typed.same && !typed.againEmpty
  const save = async () => {
    if (!ready || busy.current) return
    busy.current = true
    setSaving(true)
    setProblem(undefined)
    const refused = await store.setPassword(first.current?.value ?? '')
    busy.current = false
    if (!shown.current) return
    setSaving(false)
    if (refused !== undefined) {
      setProblem(refused)
      return
    }
    if (first.current) first.current.value = ''
    if (again.current) again.current.value = ''
    done()
  }
  const line =
    problem ??
    (mismatch
      ? t("The two don't match.")
      : t`At least ${minimumPassword} characters. You'll sign in with ${email || 'your email'} and this password.`)
  const field = (ref: RefObject<HTMLInputElement | null>, prompt: string) => (
    <input
      ref={ref}
      type="password"
      className="account-field password-field"
      placeholder={prompt}
      aria-label={prompt}
      autoComplete="new-password"
      onInput={look}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
        event.preventDefault()
        void save()
      }}
    />
  )
  return (
    <div className="password-form">
      {field(first, hasPassword === true ? t('New password') : t('Password'))}
      {field(again, t('Type it again'))}
      <p
        className={classes(
          'password-line',
          (problem !== undefined || mismatch) && 'refused',
        )}
        role={problem !== undefined ? 'alert' : undefined}
      >
        {line}
      </p>
      <div className="password-actions">
        {saving && <span className="settings-spinner" aria-hidden="true" />}
        <SettingsPill
          title={
            hasPassword === true ? t('Change Password') : t('Set Password')
          }
          disabled={!ready || saving}
          onClick={() => void save()}
        />
      </div>
    </div>
  )
}

// MARK: Permissions

/**
 * Permissions (`SettingsPermissionsPage`; the founder, 22 October 2026:
 * "absolutely ugly and not easy to understand"): Auto-review and what it
 * does; on, its two lists as two cards, each saying what it means under it.
 * A list's rules are its rows, edited in their row and deleted at once; its
 * last row adds one, typed there. Twenty rules a list and a thousand
 * characters a rule. A change is shown once the computer has it. Nothing
 * can be changed until the computer's rules are read (unlike the Mac,
 * whose page writes on its defaults meanwhile): the switch waits greyed and
 * the lists come with the read; a read that failed says so in red.
 */
export function SettingsPermissionsPage({ store }: { store: AppStore }) {
  const model = usePageModel(store)
  return (
    <div className="settings-page">
      <SettingsGroup
        footer={
          model.loadFailed ? coreT("Couldn't load your settings") : undefined
        }
        footerTint="var(--danger)"
      >
        <SettingsSwitch
          label={t('Auto-review')}
          detail={t(
            'Simeon checks each action before it runs and asks you first when needed.',
          )}
          symbol="checkmarkShield"
          on={model.rules.isEnabled}
          disabled={!model.loaded || model.rulesPending}
          onChange={(on) => void model.setReviewing(on)}
        />
      </SettingsGroup>
      {/* The lists once the computer's are read: never the page's empty ones in their place. */}
      {model.loaded &&
        model.rules.isEnabled &&
        ruleBehaviors.map((behavior) => (
          <RuleList key={behavior} behavior={behavior} model={model} />
        ))}
    </div>
  )
}

/** One list (Allow automatically, Ask first): its rules, then the row that adds one; what the list means under it. */
function RuleList({
  behavior,
  model,
}: {
  behavior: RuleBehavior
  model: GeneralSettingsModel
}) {
  const listed = reviewRules(model.rules).filter(
    (rule) => rule.behavior === behavior,
  )
  return (
    <SettingsGroup
      title={ruleListLabel(behavior)}
      footer={
        behavior === 'allow'
          ? t('Simeon does these without asking you.')
          : t(
              'Simeon asks you before doing these. When two rules disagree, it asks.',
            )
      }
    >
      {listed.map((rule, index) => (
        <RuleLine
          key={`${rule.listIndex}:${rule.text}`}
          rule={rule}
          divided={index > 0}
          model={model}
        />
      ))}
      <NewRuleLine
        behavior={behavior}
        divided={listed.length > 0}
        model={model}
      />
    </SettingsGroup>
  )
}

/** A rule's row (`RuleLine`): its words; Edit and Delete under the pointer (or the keys). Edited, the row holds its words and its list, Cancel and Save Rule. */
function RuleLine({
  rule,
  divided,
  model,
}: {
  rule: ReviewRule
  divided: boolean
  model: GeneralSettingsModel
}) {
  const editing = model.editing
  if (editing && sameRule(editing.rule, rule)) {
    const movingToFull =
      editing.behavior !== rule.behavior &&
      isFullList(ruleList(model.rules, editing.behavior))
    return (
      <div className={classes('rule-editor', divided && 'divided')}>
        <RuleText
          className="rule-field"
          value={editing.text}
          placeholder={t('Action')}
          label={t('Action')}
          focus
          onChange={(words) => model.setEditingText(words)}
        />
        <div className="rule-editor-bar">
          <BehaviorMenu
            value={editing.behavior}
            pick={(behavior) => model.setEditingBehavior(behavior)}
          />
          <span className="rule-editor-spacer" />
          {movingToFull && (
            <span className="rule-editor-limit">{ruleLimitNote()}</span>
          )}
          <SettingsPill
            title={t('Cancel')}
            onClick={() => model.cancelEdit()}
          />
          <SettingsPill
            title={t('Save Rule')}
            disabled={!model.canSave}
            onClick={() => void model.save()}
          />
        </div>
      </div>
    )
  }
  return (
    <div className="rule-line">
      <SettingsLine label={rule.text} divided={divided}>
        <span className="rule-icons">
          <RuleIcon
            symbol="squareAndPencil"
            label={t('Edit rule')}
            disabled={model.editing !== undefined || model.rulesPending}
            onClick={() => model.edit(rule)}
          />
          <RuleIcon
            symbol="trash"
            label={t('Delete rule')}
            disabled={model.rulesPending}
            onClick={() => void model.delete(rule)}
          />
        </span>
      </SettingsLine>
    </div>
  )
}

/**
 * A list's last row (`NewRuleLine`): a rule typed straight into it ("e.g.
 * read my calendar"), the plus before it, Add at its end (or Return); a full
 * list says so instead.
 */
function NewRuleLine({
  behavior,
  divided,
  model,
}: {
  behavior: RuleBehavior
  divided: boolean
  model: GeneralSettingsModel
}) {
  const full = isFullList(ruleList(model.rules, behavior))
  const draft = model.drafts[behavior] ?? ''
  return (
    <div className={classes('rule-new', divided && 'divided')}>
      <span className={classes('rule-new-plus', full && 'full')}>
        <OwnSymbol name="plusCircleFill" size={15} />
      </span>
      {full ? (
        <span className="rule-new-full">{ruleLimitNote()}</span>
      ) : (
        <>
          <RuleText
            className="rule-new-field"
            value={draft}
            placeholder={
              behavior === 'allow'
                ? t('e.g. read my calendar')
                : t('e.g. reply to emails for me')
            }
            label={t('Add Rule')}
            onChange={(words) => model.setDraft(behavior, words)}
            onSubmit={() => void model.add(behavior)}
          />
          {model.rulesPending && draft !== '' && (
            <span className="settings-spinner" aria-hidden="true" />
          )}
          <SettingsPill
            title={t('Add')}
            disabled={!model.canAdd(behavior)}
            onClick={() => void model.add(behavior)}
          />
        </>
      )}
    </div>
  )
}

/**
 * A rule's words (`RuleField`, the new rule's field): a line growing to
 * four. Return adds a new rule (`onSubmit`) and never makes a new line, as
 * the Mac's field; Option-Return (Alt) or Shift-Return does.
 */
function RuleText({
  className,
  value,
  placeholder,
  label,
  focus,
  onChange,
  onSubmit,
}: {
  className: string
  value: string
  placeholder: string
  label: string
  focus?: boolean
  onChange: (words: string) => void
  onSubmit?: () => void
}) {
  const field = useRef<HTMLTextAreaElement>(null)
  // As tall as its words, from one line to four (`lineLimit(1...4)`).
  useLayoutEffect(() => {
    const element = field.current
    if (!element) return
    element.style.height = '0px'
    // Its words and padding, and its border (the edited rule's field has one).
    const border = element.offsetHeight - element.clientHeight
    element.style.height = `${element.scrollHeight + border}px`
  }, [value])
  useEffect(() => {
    if (focus) field.current?.focus()
  }, [focus])
  return (
    <textarea
      ref={field}
      className={className}
      rows={1}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
        if (event.altKey || event.shiftKey) return
        event.preventDefault()
        onSubmit?.()
      }}
    />
  )
}

/** Allow automatically or Ask first, as a menu reading "value ⌄" (`BehaviorMenu`). */
function BehaviorMenu({
  value,
  pick,
}: {
  value: RuleBehavior
  pick: (behavior: RuleBehavior) => void
}) {
  const [at, setAt] = useState<{ x: number; y: number }>()
  return (
    <>
      <button
        type="button"
        className="settings-menu"
        aria-label={t('Rule behavior')}
        aria-haspopup="menu"
        aria-expanded={at !== undefined}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          setAt({ x: box.left, y: box.bottom + 4 })
        }}
      >
        <SettingsMenuLabel text={ruleListLabel(value)} />
      </button>
      {at && (
        <ContextMenu
          items={ruleBehaviors.map((behavior) => ({
            label: ruleListLabel(behavior),
            checked: behavior === value,
            action: () => pick(behavior),
          }))}
          at={at}
          close={() => setAt(undefined)}
          label={t('Rule behavior')}
        />
      )}
    </>
  )
}

/** Edit or Delete on a rule's row (`RuleIcon`): 12 in a 28 square, in the ink and on the row's grey under the pointer. */
function RuleIcon({
  symbol,
  label,
  disabled,
  onClick,
}: {
  symbol: OwnSymbol
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="rule-icon"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <OwnSymbol name={symbol} size={12} />
    </button>
  )
}

// MARK: Help & support

/**
 * Help & support (`SettingsHelpPage`): Send feedback in one card, Report an
 * issue with its bug in the next; each opens its sheet over the window
 * (`HelpSupport`). The Mac's Simeon Help Center row, which points nowhere
 * yet, is left out.
 */
export function SettingsHelpPage({ store }: { store: AppStore }) {
  void store
  const windowModel = useWindowModel()
  return (
    <div className="settings-page general-page">
      <SettingsGroup>
        <SettingsLinkRow
          label={t('Send feedback')}
          onClick={() => windowModel.openFeedback('feedback')}
        />
      </SettingsGroup>
      <SettingsGroup>
        <SettingsLinkRow
          label={t('Report an issue')}
          trailing={<OwnSymbol name="ladybug" size={14} />}
          onClick={() => windowModel.openFeedback('issue')}
        />
      </SettingsGroup>
    </div>
  )
}

// MARK: Legal

/** Legal (`SettingsLegalPage`, the reference's "Legal info"): the Privacy Policy and the Terms of Service on the web, the company under them. */
export function SettingsLegalPage({ store }: { store: AppStore }) {
  void store
  return (
    <div className="settings-page">
      <SettingsGroup footer={copyrightLine}>
        <SettingsLinkRow
          label={t('Privacy Policy')}
          external
          onClick={() => openPage(legalPages.privacy)}
        />
        <SettingsLinkRow
          label={t('Terms of Service')}
          divided
          external
          onClick={() => openPage(legalPages.terms)}
        />
      </SettingsGroup>
    </div>
  )
}
