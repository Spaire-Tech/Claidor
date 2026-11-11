// The account (mac/Simeon/Account.swift, the core's AccountMenu.swift): the
// disc at the sidebar's foot and in its rail (`AccountDisc`), the account
// menu above it (Weekly usage ›, Settings, About, Report an issue, Log
// out), and About over everything. The frame (step 6a) drew the disc; the
// menu and About are step 6f's.
//
// The Mac's menu is Apple's (`NSMenu`); the web draws it as the window's
// other menus (ContextMenu.tsx), with Apple's badge and the submenu's
// figures. About's Copy version info writes the web's own facts: the
// version it names itself by to the server, its track ("next" while it is
// served at /app-next) and the system the browser runs on, in the Mac's
// words for it ("darwin", "win32", "linux").

import { useEffect, useRef, useState } from 'react'
import { accountInitials } from '../core/accountInitials'
import { providerIconURL } from '../core/connectCards'
import { menuIcons } from '../core/externalAgents'
import { t as coreT } from '../core/l10n'
import type { AppStore } from '../core/store'
import {
  aboutCopyright,
  aboutName,
  copiedSeconds,
  usageReading,
  versionInfo,
  versionLine,
} from '../core/usage'
import { desktop } from '../desktop/desktop'
import { aboutFacts } from '../desktop/facts'
import { t } from '../l10n'
import { type WebSession, clientVersion } from '../session'
import './AccountMenu.css'
import { copyText } from './clipboard'
import { ContextMenu, type MenuLine } from './ContextMenu'
import { mascotURL } from './mascots'
import type { Dismissal } from './MessageActions'
import { MenuModelTiles } from './ModelTiles'
import './Settings.css'
import { PanelDisc, SettingsSymbol } from './SettingsParts'
import { useBillingReturn } from './SettingsUsage'
import { SignOutQuestion } from './SettingsWindow'
import { useWatched } from './useStore'
import { useWindowModel } from './windowModel'

// MARK: The menu's own symbols

type AccountSymbolName = 'gauge' | 'info' | 'ladybug'

/** `gauge.with.needle`, `info.circle` and `ladybug`, outlined on a 16 grid as the window's glyphs. */
const accountSymbols: Record<AccountSymbolName, React.ReactNode> = {
  gauge: (
    <>
      <circle cx="8" cy="8" r="6.3" />
      <path d="M8 9.1 10.7 5.6M8 3.4v1.1M4.3 5.2l.8.7M11.7 5.2l-.8.7M3.3 9.3h1.1M12.7 9.3h-1.1" />
      <circle cx="8" cy="9.1" r="0.9" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="6.3" />
      <path d="M8 7.2v4M8 4.8v.3" />
    </>
  ),
  ladybug: (
    <>
      <path d="M4.3 9.4a3.7 3.7 0 0 1 7.4 0v.9a3.7 3.7 0 0 1-7.4 0ZM8 6.2v7.7M6.3 5.9a1.7 1.7 0 0 1 3.4 0" />
      <path d="M2.6 9h1.7M11.7 9h1.7M2.9 12.6l1.6-.8M13.1 12.6l-1.6-.8M3.3 5.6l1.4.9M12.7 5.6l-1.4.9" />
    </>
  ),
}

function AccountSymbol({ name }: { name: AccountSymbolName }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {accountSymbols[name]}
      </g>
    </svg>
  )
}

// MARK: The menu

/**
 * The account menu (`AccountActions.openMenu`), at least 228 wide, its
 * foot 4 above the disc and its left edge on the disc's: Weekly usage once
 * the usage is in hand (its share as a badge, its submenu), Settings,
 * About, Report an issue, a line, Log out. Opening reads the usage again
 * when the last reading is 30 seconds old; a reading landing while the menu
 * is open puts the row in (or takes it out after a failure), the menu
 * staying on its foot. `at` is the disc's box.
 */
function AccountMenu({
  store,
  at,
  close,
  logOut,
}: {
  store: AppStore
  at: DOMRect
  close: (why?: Dismissal) => void
  logOut: () => void
}) {
  useWatched(store)
  const model = useWindowModel()
  useEffect(() => {
    void store.loadUsage()
  }, [store])
  const reading = usageReading(store.usage, store.usageReadAt)
  const items: MenuLine[] = []
  if (reading) {
    // The submenu (`usageMenu`): the share and when it resets, the on-demand spend when it is metered, then Usage & Billing.
    const submenu: MenuLine[] = [
      {
        figure: {
          title: coreT('Weekly usage'),
          subtitle: reading.reset,
          value: reading.percent,
        },
      },
      'separator',
    ]
    if (reading.spend !== undefined)
      submenu.push(
        {
          figure: {
            title: coreT('On-demand'),
            subtitle: coreT('Spend this cycle'),
            value: reading.spend,
          },
        },
        'separator',
      )
    submenu.push({
      id: 'usage',
      label: t('Usage & Billing'),
      bare: true,
      action: () => model.openSettings('usage'),
    })
    items.push({
      id: 'weekly',
      label: coreT('Weekly usage'),
      icon: <AccountSymbol name="gauge" />,
      badge: reading.percent,
      submenu,
    })
  }
  items.push(
    {
      // The founder, 11 November 2026: "can you add ai models to the menu bar" (as External Agents, the makers' marks at its end).
      id: 'aiModels',
      label: t('AI Models'),
      icon: <SettingsSymbol name="brain" size={14} />,
      end: <MenuModelTiles />,
      action: () => model.openSettings('models'),
    },
    {
      // The founder, 11 November 2026: "in the menu as External Agents - and the agents icons".
      id: 'externalAgents',
      label: t('External Agents'),
      icon: <SettingsSymbol name="bubbles" size={14} />,
      end: <BotMascots />,
      action: () => model.openSettings('externalAgents'),
    },
    {
      id: 'settings',
      label: coreT('Settings'),
      icon: <SettingsSymbol name="gearshape" size={14} />,
      action: () => model.openSettings('general'),
    },
    {
      id: 'about',
      label: coreT('About'),
      icon: <AccountSymbol name="info" />,
      action: () => model.openAbout(),
    },
    {
      // Report an issue here, not in the sidebar (the founder, 22 October 2026).
      id: 'report',
      label: t('Report an issue'),
      icon: <AccountSymbol name="ladybug" />,
      action: () => model.openFeedback('issue'),
    },
    'separator',
    {
      id: 'logOut',
      label: coreT('Log out'),
      icon: <SettingsSymbol name="logOut" size={14} />,
      action: logOut,
    },
  )
  return (
    <ContextMenu
      items={items}
      at={{ x: at.left, y: at.top - 4 }}
      foot
      minWidth={248}
      className="account-menu"
      close={close}
      label={coreT('Account')}
    />
  )
}

/**
 * The bots' mascots at External Agents' end, on Connect apps' tiles (11
 * November 2026, the founder: "can the icons look better than this? like
 * connect apps icons. with a dark mode as well"): each cut out of its cream
 * ground on a white tile (#2c2c2e on dark), a hairline and a soft shadow,
 * the first turned 7° left, the last 7° right, each over the last by 4.
 */
function BotMascots() {
  return (
    <span className="menu-mascots" aria-hidden="true">
      {menuIcons.map((icon) => (
        <span key={icon} className="menu-mascot">
          <img src={mascotTileURL(icon)} alt="" />
        </span>
      ))}
    </span>
  )
}

/** A bot's mascot cut out of its ground (`assets/mascots/`), its app icon for any other. */
function mascotTileURL(icon: string): string | undefined {
  return mascotURL(icon) ?? providerIconURL(icon)
}

// MARK: The disc

/**
 * The account's letters, or its picture (`AccountDisc`, "Open account
 * menu"): 32, in the glass, a touch larger under the pointer; the account
 * menu above it. The picture is read once and kept by the browser, so
 * folding the sidebar to its rail and back doesn't show the letters first.
 * A click on the disc while its menu is open closes it, as Apple's menu
 * takes that click. Log out asks first (`askToSignOut`).
 */
export function AccountDisc({
  store,
  session,
}: {
  store: AppStore
  session: WebSession
}) {
  useWatched(store)
  const [menu, setMenu] = useState<DOMRect>()
  const [askingSignOut, setAskingSignOut] = useState(false)
  const [failed, setFailed] = useState<string>()
  /** When a click elsewhere last closed the menu (`performance.now()`): that same click, landing on the disc, doesn't open it again. */
  const closedByClick = useRef(-1)
  const swallowClick = useRef(false)
  // The usage read once signed in (MainWindow.swift's `.task { loadUsage }`): Settings lists Usage & Billing, and ⌘K and "/" offer it, once it is in. The disc is there for as long as the window is (the foot's or the rail's); again within 30 s reads nothing.
  useEffect(() => {
    void store.loadUsage()
  }, [store])
  // A billing page opened from Usage & Billing: read again when this tab comes back, Settings open or not.
  useBillingReturn(store)
  const account = store.account
  const picture =
    account?.pictureURL && account.pictureURL !== failed
      ? account.pictureURL
      : undefined
  return (
    <>
      <button
        type="button"
        className="account-disc glass-disc"
        aria-label={coreT('Open account menu')}
        aria-haspopup="menu"
        aria-expanded={menu !== undefined}
        onMouseDown={(event) => {
          // The menu went at this very press (its own listener runs first): this click is the menu's.
          swallowClick.current = closedByClick.current >= event.timeStamp
        }}
        onClick={(event) => {
          if (swallowClick.current) {
            swallowClick.current = false
            return
          }
          // The disc's own box, not the larger one it has under the pointer.
          const disc = event.currentTarget
          const box = disc.getBoundingClientRect()
          const side = disc.offsetWidth
          setMenu(
            new DOMRect(
              box.left + (box.width - side) / 2,
              box.top + (box.height - side) / 2,
              side,
              side,
            ),
          )
        }}
      >
        {account ? accountInitials(account.name || account.email) : ''}
        {picture && (
          <img
            src={picture}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setFailed(picture)}
          />
        )}
      </button>
      {menu && (
        <AccountMenu
          store={store}
          at={menu}
          close={(why) => {
            if (why === 'click') closedByClick.current = performance.now()
            setMenu(undefined)
          }}
          logOut={() => setAskingSignOut(true)}
        />
      )}
      {askingSignOut && (
        <SignOutQuestion
          session={session}
          close={() => setAskingSignOut(false)}
        />
      )}
    </>
  )
}

// MARK: About

/** The web app's version, as it names itself to the server (`clientVersion`, "web-next-0.1.0", "web-…" once at /app): its number. */
const webVersion = clientVersion.replace(/^web-(next-)?/, '')

/** Its track: "next" while it is served at /app-next, else the Mac's "stable". */
function releaseTrack(): string {
  return import.meta.env.BASE_URL.includes('app-next') ? 'next' : 'stable'
}

/** The system the browser runs on, in the words the Mac's "darwin" is (Node's `process.platform`): darwin, win32, linux, else the browser's own. */
function systemName(): string {
  if (typeof navigator === 'undefined') return ''
  const said =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform || navigator.platform
  if (/mac/i.test(said)) return 'darwin'
  if (/win/i.test(said)) return 'win32'
  if (/android/i.test(said) || /android/i.test(navigator.userAgent))
    return 'android'
  if (/linux|x11|cros|chrome os/i.test(said)) return 'linux'
  return said.toLowerCase()
}

/** The Mac's app icon (the Assets' `MacIcon`), at 64. */
const appIcon = new URL(
  '../../../../../mac/Simeon/Assets.xcassets/MacIcon.appiconset/icon_128x128.png',
  import.meta.url,
).href

/** About over everything (`AboutLayer`, `model.about`). */
export function AboutLayer() {
  const model = useWindowModel()
  useWatched(model)
  if (!model.about) return null
  return <AboutShown close={() => model.closeAbout()} />
}

/**
 * About over the whole window (`AboutLayer`, `AVn`): the window darkened
 * (#141414 at 50%, 70% on dark), a 360-wide card, round 14 with a line at
 * 15%; the app's icon (64), "Simeon", the version, the copyright, Copy
 * version info. ×, Escape or a click on the dark close it; Return goes to
 * nothing (`AboutKeys`). No motion. The card takes the keys, so nothing
 * behind keeps them.
 */
function AboutShown({ close }: { close: () => void }) {
  const card = useRef<HTMLDivElement>(null)
  const latest = useRef(close)
  useEffect(() => {
    latest.current = close
  })
  useEffect(() => {
    const before =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    card.current?.focus()
    const key = (event: KeyboardEvent) => {
      // Tab and Shift-Tab go round the card's own buttons, never to the window behind (a modal dialog's way).
      if (
        event.key === 'Tab' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault()
        event.stopPropagation()
        const buttons = [
          ...(card.current?.querySelectorAll<HTMLButtonElement>(
            'button:not(:disabled)',
          ) ?? []),
        ]
        if (buttons.length === 0) return
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next =
          at < 0
            ? event.shiftKey
              ? buttons.length - 1
              : 0
            : (at + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length
        buttons[next]?.focus()
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
        return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        latest.current()
      } else if (event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('keydown', key, true)
      if (before?.isConnected) before.focus()
    }
  }, [])
  // The Windows app's own facts (its version, track and "win32"), else the web's.
  const host = desktop()
  const facts = host
    ? aboutFacts(host)
    : { version: webVersion, track: releaseTrack(), os: systemName() }
  const info = versionInfo(facts.version, facts.track, facts.os)
  return (
    <div
      className="about-dim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        ref={card}
        className="about-card"
        role="dialog"
        aria-modal="true"
        aria-label={aboutName}
        tabIndex={-1}
      >
        <div className="about-body">
          <img
            className="about-icon"
            src={appIcon}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
          <div className="about-names">
            <h2 className="about-name">{aboutName}</h2>
            <div className="about-version">{versionLine(facts.version)}</div>
          </div>
          <div className="about-copyright">{aboutCopyright}</div>
        </div>
        <div className="about-foot">
          <CopyVersionButton info={info} />
        </div>
        <span className="about-close">
          <PanelDisc symbol="xmark" label={t('Close')} onClick={close} />
        </span>
      </div>
    </div>
  )
}

/** Copy version info (secondary, 32 high, round 8): the three lines on the clipboard, "Copied" for 1.2 s. */
function CopyVersionButton({ info }: { info: string }) {
  const [copied, setCopied] = useState(false)
  const copies = useRef(0)
  return (
    <button
      type="button"
      className="about-copy"
      onClick={() => {
        void copyText(info)
          .then(() => {
            copies.current += 1
            const mine = copies.current
            setCopied(true)
            setTimeout(() => {
              if (copies.current === mine) setCopied(false)
            }, copiedSeconds * 1000)
          })
          .catch(() => {})
      }}
    >
      {copied ? coreT('Copied') : coreT('Copy version info')}
    </button>
  )
}
