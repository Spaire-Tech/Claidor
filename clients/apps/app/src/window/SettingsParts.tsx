// Settings' parts at a Mac's proportions and the app's own type
// (mac/Simeon/SettingsParts.swift; the founder, 21 October 2026: "the
// proportions are off… you're behaving it like a phone", then "I NEVER USED
// BOLD… we need consistency for everything to be the same size"): each
// group's name in line with its card; the card a step off the ground, 16
// round; its rows at least 56 high, padded 18 and 14, their words (13) over
// a line (12); the lines between them inset 18 at both ends; a note under
// the card. At a row's end: a switch in the blue, a menu reading
// "value ⌄", an action in the link blue, a chevron or ↗. Connectors and
// the consent use the same type and round glass buttons (`PanelDisc`).
//
// Shared by every Settings page (6e, 6f) and Connectors (6c, 6d): a part
// that needs a symbol of its own draws it in its own file.

import { type ReactNode, useId, useRef, useState } from 'react'
import { accountInitials } from '../core/accountInitials'
import type { AppStore } from '../core/store'
import { classes } from './classes'
import { ContextMenu, type MenuLine } from './ContextMenu'
import './Settings.css'

// MARK: Symbols

/** The SF Symbols Settings and its panels draw, outlined on a 16 grid. */
export type SettingsSymbolName =
  | 'gearshape'
  | 'chartBar'
  | 'brain'
  | 'wallet'
  | 'key'
  | 'handRaised'
  | 'desktopcomputer'
  | 'arrowDownCircle'
  | 'questionmarkCircle'
  | 'checkmarkShield'
  | 'personCropCircle'
  | 'logOut'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'xmark'
  | 'arrowUpRight'
  | 'sun'
  | 'moon'
  | 'display'

const symbols: Record<SettingsSymbolName, ReactNode> = {
  gearshape: (
    <>
      <path d="M12.88 6.93 14.35 7.17 14.35 8.83 12.88 9.07 12.21 10.7 13.07 11.9 11.9 13.07 10.7 12.21 9.07 12.88 8.83 14.35 7.17 14.35 6.93 12.88 5.3 12.21 4.1 13.07 2.93 11.9 3.79 10.7 3.12 9.07 1.65 8.83 1.65 7.17 3.12 6.93 3.79 5.3 2.93 4.1 4.1 2.93 5.3 3.79 6.93 3.12 7.17 1.65 8.83 1.65 9.07 3.12 10.7 3.79 11.9 2.93 13.07 4.1 12.21 5.3Z" />
      <circle cx="8" cy="8" r="2.1" />
    </>
  ),
  chartBar: <path d="M2.5 8.5h3v5h-3ZM6.5 3h3v10.5h-3ZM10.5 6h3v7.5h-3Z" />,
  // `brain` (AI Models; the founder, 9 November 2026: "can the icon be a brain"): its two halves, scalloped, the line between them and a fold in each.
  brain: (
    <>
      <path d="M8 2A2.4 2.4 0 0 0 4.8 3.2 2.4 2.4 0 0 0 2.9 6.2 2.4 2.4 0 0 0 2.9 9.8 2.4 2.4 0 0 0 4.8 12.8 2.4 2.4 0 0 0 8 14" />
      <path d="M8 2A2.4 2.4 0 0 1 11.2 3.2 2.4 2.4 0 0 1 13.1 6.2 2.4 2.4 0 0 1 13.1 9.8 2.4 2.4 0 0 1 11.2 12.8 2.4 2.4 0 0 1 8 14" />
      <path d="M8 2v12M5.5 4.6c-.9.5-.9 1.5 0 2s.9 1.5 0 2-.9 1.5 0 2M10.5 4.6c.9.5.9 1.5 0 2s-.9 1.5 0 2 .9 1.5 0 2" />
    </>
  ),
  wallet: (
    <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h9A1.5 1.5 0 0 1 14 5.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5ZM14 7.3h-2.6a1.2 1.2 0 0 0 0 2.4H14M3.4 4.1l7.3-1.9a1 1 0 0 1 1.3 1V4" />
  ),
  key: (
    <>
      <circle cx="5" cy="8" r="2.8" />
      <path d="M7.8 8H14.3M12.2 8v2M14.3 8v1.6" />
    </>
  ),
  handRaised: (
    <path d="M5.5 8.2V3.6a1 1 0 0 1 2 0V7.4M7.5 7.2V2.6a1 1 0 0 1 2 0V7.4M9.5 7.4V3.8a1 1 0 0 1 2 0V9M5.5 8.6V6.6a1 1 0 0 0-2 0v3.3c0 2.6 2 4.6 4.6 4.6h.4c2.4 0 4-1.9 4-4.3V7a1 1 0 0 0-2 0" />
  ),
  desktopcomputer: <path d="M2 3h12v8H2ZM6 14h4M8 11v3" />,
  arrowDownCircle: (
    <>
      <circle cx="8" cy="8" r="6.3" />
      <path d="M8 4.6v6.3M5.4 8.4 8 11l2.6-2.6" />
    </>
  ),
  questionmarkCircle: (
    <>
      <circle cx="8" cy="8" r="6.3" />
      <path d="M6.3 6.3a1.8 1.8 0 1 1 2.6 1.6c-.6.3-.9.7-.9 1.3v.3M8 11.3v.2" />
    </>
  ),
  checkmarkShield: (
    <path d="M8 1.8l5 1.9v3.8c0 3.2-2.1 5.6-5 6.7-2.9-1.1-5-3.5-5-6.7V3.7ZM5.8 7.9l1.6 1.6 2.9-3" />
  ),
  personCropCircle: (
    <>
      <circle cx="8" cy="8" r="6.3" />
      <circle cx="8" cy="6.4" r="2.1" />
      <path d="M3.9 12.3C4.9 10.8 6.3 10 8 10s3.1.8 4.1 2.3" />
    </>
  ),
  logOut: <path d="M9.5 4V2.5h-6v11h6V12M7 8h7.3M11.8 5.5 14.3 8l-2.5 2.5" />,
  chevronLeft: <path d="M10 3 5 8l5 5" />,
  chevronRight: <path d="M6 3l5 5-5 5" />,
  chevronDown: <path d="M4 6l4 4 4-4" />,
  xmark: <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />,
  arrowUpRight: <path d="M5 11 11 5M6 5h5v5" />,
  sun: (
    <>
      <circle cx="8" cy="8" r="2.6" />
      <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
    </>
  ),
  moon: <path d="M13 10.1A5.6 5.6 0 0 1 5.9 3a5.6 5.6 0 1 0 7.1 7.1Z" />,
  display: <path d="M2 3h12v8H2ZM6 14h4" />,
}

/** One of Settings' symbols, `size` square, in the ink of what holds it. */
export function SettingsSymbol({
  name,
  size = 16,
  weight = 1.3,
}: {
  name: SettingsSymbolName
  size?: number
  weight?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="settings-symbol"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {symbols[name]}
      </g>
    </svg>
  )
}

// MARK: The panels' round buttons

/**
 * Back and Close: the window's round glass button (`GlassDiscButton`, 21
 * October 2026: one button for the app's panels), 32 by default, its
 * symbol in the disc's ink; its name as its tooltip.
 */
export function PanelDisc({
  symbol,
  label,
  onClick,
  size = 32,
  disabled,
}: {
  symbol: 'xmark' | 'chevronLeft'
  label: string
  onClick: () => void
  size?: number
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="panel-disc glass-disc"
      style={{ width: size, height: size }}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <SettingsSymbol name={symbol} size={13} weight={1.5} />
    </button>
  )
}

// MARK: Groups and rows

/** A group: its name (13 medium, grey) over its card, in line with it; its note (12, grey, or its own tint) under it. */
export function SettingsGroup({
  title,
  footer,
  footerTint,
  children,
}: {
  title?: string
  footer?: string
  /** A note in a colour of its own (a refusal's red: `var(--danger)`). */
  footerTint?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <section
      className="settings-group"
      aria-labelledby={title ? id : undefined}
    >
      {title && (
        <h3 id={id} className="settings-group-title">
          {title}
        </h3>
      )}
      <div className="settings-card">{children}</div>
      {footer && (
        <p
          className="settings-group-footer"
          style={footerTint ? { color: footerTint } : undefined}
        >
          {footer}
        </p>
      )}
    </section>
  )
}

/**
 * A row: its symbol (when it has one), its words (13) over a line (12,
 * grey), what it holds at its end; a line above it when it follows another
 * (`divided`).
 */
export function SettingsLine({
  label,
  detail,
  divided,
  labelTint,
  symbol,
  children,
}: {
  label: string
  detail?: string
  divided?: boolean
  labelTint?: string
  symbol?: SettingsSymbolName
  /** At the row's end: a switch, a menu, an action. */
  children?: ReactNode
}) {
  return (
    <div className={classes('settings-line', divided && 'divided')}>
      {symbol && (
        <span className="settings-line-symbol">
          <SettingsSymbol name={symbol} size={16} />
        </span>
      )}
      <span className="settings-line-words">
        <span
          className="settings-line-label"
          style={labelTint ? { color: labelTint } : undefined}
        >
          {label}
        </span>
        {detail && <span className="settings-line-detail">{detail}</span>}
      </span>
      {children != null && (
        <span className="settings-line-end">{children}</span>
      )}
    </div>
  )
}

/** A switch: Apple's, in the blue; greyed while its change is on its way. */
export function SettingsSwitch({
  label,
  detail,
  divided,
  symbol,
  on,
  onChange,
  disabled,
}: {
  label: string
  detail?: string
  divided?: boolean
  symbol?: SettingsSymbolName
  on: boolean
  onChange: (on: boolean) => void
  disabled?: boolean
}) {
  return (
    <SettingsLine
      label={label}
      detail={detail}
      divided={divided}
      symbol={symbol}
    >
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={classes('settings-switch', on && 'on')}
        disabled={disabled}
        onClick={() => onChange(!on)}
      >
        <span className="settings-switch-knob" />
      </button>
    </SettingsLine>
  )
}

/** A menu's face: the choice (13, grey) and a chevron down. */
export function SettingsMenuLabel({ text }: { text: string }) {
  return (
    <span className="settings-menu-label">
      <span className="settings-menu-text">{text}</span>
      <SettingsSymbol name="chevronDown" size={9} weight={1.6} />
    </span>
  )
}

/**
 * A menu (the reference's "Ask every time ⌄"): the choice in grey with a
 * chevron at the row's end; the window's menu of the choices under it, the
 * current one ticked. A choice above a ceiling is listed greyed. Waits
 * while its change is on its way.
 */
export function SettingsMenu<Value>({
  label,
  detail,
  divided,
  options,
  disabled,
  value,
  shown,
  pending,
  pick,
}: {
  label: string
  detail?: string
  divided?: boolean
  options: readonly { value: Value; label: string }[]
  disabled?: (value: Value) => boolean
  value: Value
  /** The words shown when they are not the choice's own. */
  shown?: string
  pending?: boolean
  pick: (value: Value) => void
}) {
  const [open, setOpen] = useState<{ x: number; y: number }>()
  const button = useRef<HTMLButtonElement>(null)
  const current = options.find((option) => option.value === value)?.label ?? ''
  const items: MenuLine[] = options.map((option) => ({
    label: option.label,
    checked: option.value === value,
    disabled: disabled?.(option.value) ?? false,
    action: () => {
      if (option.value !== value) pick(option.value)
    },
  }))
  return (
    <SettingsLine label={label} detail={detail} divided={divided}>
      <button
        ref={button}
        type="button"
        className="settings-menu"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open !== undefined}
        disabled={pending}
        onClick={() => {
          const box = button.current?.getBoundingClientRect()
          if (box) setOpen({ x: box.left, y: box.bottom + 4 })
        }}
      >
        <SettingsMenuLabel text={shown ?? current} />
      </button>
      {open && (
        <ContextMenu
          items={items}
          at={open}
          close={() => setOpen(undefined)}
          label={label}
        />
      )}
    </SettingsLine>
  )
}

/**
 * A row that opens something: its words, its value in grey, and the
 * chevron (↗ for a page on the web, or a symbol of its own); a step darker
 * under the pointer.
 */
export function SettingsLinkRow({
  label,
  value,
  detail,
  divided,
  external,
  symbol,
  trailing,
  onClick,
}: {
  label: string
  value?: string
  detail?: string
  divided?: boolean
  external?: boolean
  symbol?: SettingsSymbolName
  /** At the row's end in place of the chevron, 14 in grey (Report an issue's bug). */
  trailing?: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={classes('settings-link-row', divided && 'divided')}
      onClick={onClick}
    >
      <SettingsLine label={label} detail={detail} symbol={symbol}>
        <span className="settings-link-end">
          {value && <span className="settings-link-value">{value}</span>}
          {trailing ?? (
            <span className="settings-link-chevron">
              <SettingsSymbol
                name={external ? 'arrowUpRight' : 'chevronRight'}
                size={10}
                weight={1.7}
              />
            </span>
          )}
        </span>
      </SettingsLine>
    </button>
  )
}

/** A row that is an action (the reference's "Upgrade", "Add app"): its words in the link blue, or red for one that takes something away; a spinner while it goes. */
export function SettingsActionRow({
  title,
  destructive,
  divided,
  busy,
  disabled,
  onClick,
}: {
  title: string
  destructive?: boolean
  divided?: boolean
  busy?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={classes(
        'settings-action-row',
        destructive && 'destructive',
        divided && 'divided',
      )}
      disabled={disabled || busy}
      onClick={onClick}
    >
      <span className="settings-action-title">{title}</span>
      {busy && <span className="settings-spinner" aria-hidden="true" />}
    </button>
  )
}

/** An action at a row's end, in words (the reference's "Add"): the link blue, greyed while it can't be pressed. */
export function SettingsPill({
  title,
  disabled,
  onClick,
}: {
  title: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="settings-pill"
      disabled={disabled}
      onClick={onClick}
    >
      {title}
    </button>
  )
}

/** A choice of a few, each its symbol (the reference's Mode: the sun, the moon, the screen), in a grey capsule; the chosen one on a lighter disc. */
export function SettingsSymbolPicker<Value>({
  options,
  value,
  pick,
  label,
}: {
  options: readonly {
    value: Value
    symbol: SettingsSymbolName
    label: string
  }[]
  value: Value
  pick: (value: Value) => void
  /** The group's name for a screen reader. */
  label: string
}) {
  return (
    <span
      className="settings-symbol-picker"
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => {
        const chosen = option.value === value
        return (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={chosen}
            aria-label={option.label}
            title={option.label}
            className={classes('settings-symbol-choice', chosen && 'chosen')}
            onClick={() => {
              if (!chosen) pick(option.value)
            }}
          >
            <SettingsSymbol name={option.symbol} size={13} />
          </button>
        )
      })}
    </span>
  )
}

/** The account's picture, else its letters on the grey disc (`SettingsAccountFace`). */
export function SettingsAccountFace({
  size,
  store,
}: {
  size: number
  store: AppStore
}) {
  const account = store.account
  const [failed, setFailed] = useState<string>()
  const picture =
    account?.pictureURL && account.pictureURL !== failed
      ? account.pictureURL
      : undefined
  return (
    <span
      className="settings-account-face"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      <span>
        {account ? accountInitials(account.name || account.email) : '?'}
      </span>
      {picture && (
        <img
          src={picture}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(picture)}
        />
      )}
    </span>
  )
}
