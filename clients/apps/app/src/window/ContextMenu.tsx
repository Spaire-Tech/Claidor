// A right-click menu as the Mac's menus look (the window's own `.pop-menu`):
// glass, 10 round, items 13 on 24 with their symbols, lines between groups,
// a destructive item in red, an item with a submenu opening it beside
// itself. At the pointer, kept inside the window; Escape, a click elsewhere,
// the window going to the back or a pick closes it. ↑ and ↓ choose, → opens
// a submenu, ← goes back, Return picks.
//
// The account menu (step 6f) adds what Apple's menus have and the others
// don't use: a badge at an item's end (Weekly usage's share), a symbol drawn
// by the menu's owner, figures that are not choices (the usage submenu's),
// an item without the symbols' column, a menu that opens upward from its
// foot, and a wider least width. Other menus look as they did.

import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import './ContextMenu.css'
import { type Dismissal, useDismiss } from './MessageActions'

export interface MenuEntry {
  label: string
  /** What it is, for an item that may come or go while the menu is open (the account menu's Weekly usage): the others keep their place and the keys. */
  id?: string
  glyph?: GlyphName
  /** A symbol of the menu owner's own, in the glyph's place (the account menu's). */
  icon?: ReactNode
  action?: () => void
  submenu?: MenuLine[]
  destructive?: boolean
  disabled?: boolean
  /** A tick before it (the agent's own section in Move to). */
  checked?: boolean
  /** Words at its end, before a submenu's chevron (`NSMenuItemBadge`: Weekly usage's "38%"). */
  badge?: string
  /** No symbols' column: the words start at the item's edge (a menu without symbols, Apple's way). */
  bare?: boolean
}

/**
 * A figure, not a choice (Account.swift's `UsageFigureRow`): its title (13)
 * over its line (12, the lighter grey), its value (13) at the right; 46
 * high, 30 without the line; no highlight, never reached with the keys.
 */
export interface MenuFigure {
  figure: { title: string; subtitle?: string; value: string }
}

export type MenuLine = MenuEntry | MenuFigure | 'separator'

function isEntry(line: MenuLine | undefined): line is MenuEntry {
  return line !== undefined && line !== 'separator' && !('figure' in line)
}

/** What an item is known by while its menu is open: its id when it has one, else its place and its words (as before ids). */
export function menuKey(item: MenuEntry, index: number): string {
  return item.id ?? `${index}-${item.label}`
}

/** Where the item whose submenu is open now is: none once it is gone or has no submenu (nothing is left lit). */
export function openIndexOf(
  items: readonly MenuLine[],
  key: string | undefined,
): number {
  if (key === undefined) return -1
  const index = items.findIndex(
    (item, place) => isEntry(item) && menuKey(item, place) === key,
  )
  const entry = items[index]
  return isEntry(entry) && entry.submenu ? index : -1
}

export function ContextMenu({
  items,
  at,
  close,
  label,
  foot,
  minWidth,
}: {
  items: MenuLine[]
  /** The pointer, in the window's coordinates. */
  at: { x: number; y: number }
  /** Closed: by a click elsewhere, a key, a scroll or the window going behind (`why`), or a pick (none). */
  close: (why?: Dismissal) => void
  label?: string
  /** `at.y` is where the menu's foot goes: it opens upward, and stays on it as it grows (the account menu's). */
  foot?: boolean
  /** The least width of the menu and its submenus (the account menu's 228). */
  minWidth?: number
}) {
  const holder = useRef<HTMLDivElement>(null)
  useDismiss(holder, close)
  return (
    <div ref={holder} className="context-menus">
      <MenuPanel
        items={items}
        at={at}
        close={close}
        label={label}
        foot={foot}
        minWidth={minWidth}
      />
    </div>
  )
}

function MenuPanel({
  items,
  at,
  close,
  label,
  side,
  back,
  foot,
  minWidth,
}: {
  items: MenuLine[]
  at: { x: number; y: number }
  close: () => void
  label?: string
  /** A submenu: the item it opens from, to open beside it (to its left when there is no room at its right). */
  side?: DOMRect
  back?: () => void
  foot?: boolean
  minWidth?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  // The open submenu, by its item's key, so an item coming or going above it doesn't move it.
  const [open, setOpen] = useState<{ key: string; rect: DOMRect }>()
  const openIndex = openIndexOf(items, open?.key)
  // A menu that opens from its foot is placed again as it grows (Weekly usage arriving while it is open).
  const grows = foot && !side ? items.length : 0
  // Measured, then placed inside the window and shown, before it is painted.
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const width = element.offsetWidth
    const height = element.offsetHeight
    let left = at.x
    let top = foot && !side ? at.y - height : at.y
    if (side) {
      left = side.right - 4
      if (left + width > window.innerWidth - 8) left = side.left - width + 4
      top = side.top - 5
    } else if (left + width > window.innerWidth - 8) left = at.x - width
    if (top + height > window.innerHeight - 8)
      top = Math.max(8, window.innerHeight - 8 - height)
    element.style.left = `${Math.max(8, left)}px`
    element.style.top = `${Math.max(8, top)}px`
    element.style.visibility = 'visible'
    // Placed again as it grows, the item the keys are on keeps them.
    if (!grows || !element.contains(document.activeElement)) element.focus()
  }, [at, side, foot, grows])
  const buttons = () => [
    ...(box.current?.querySelectorAll<HTMLButtonElement>(
      ':scope > .menu-item:not(:disabled)',
    ) ?? []),
  ]
  const openSub = (index: number, button: HTMLElement) => {
    const item = items[index]
    if (isEntry(item))
      setOpen({
        key: menuKey(item, index),
        rect: button.getBoundingClientRect(),
      })
  }
  return (
    <>
      <div
        ref={box}
        className="pop-menu context-menu"
        role="menu"
        aria-label={label}
        tabIndex={-1}
        style={{
          position: 'fixed',
          visibility: 'hidden',
          left: 0,
          top: 0,
          minWidth,
        }}
        onKeyDown={(event) => {
          const list = buttons()
          const index = list.indexOf(
            document.activeElement as HTMLButtonElement,
          )
          if (event.key === 'ArrowDown')
            list[(index + 1) % list.length]?.focus()
          else if (event.key === 'ArrowUp')
            list[
              index < 0
                ? list.length - 1
                : (index - 1 + list.length) % list.length
            ]?.focus()
          else if (event.key === 'ArrowRight') {
            const button = list[index]
            const at = Number(button?.dataset.index)
            const entry = items[at]
            if (button && isEntry(entry) && entry.submenu) openSub(at, button)
            else return
          } else if (event.key === 'ArrowLeft' && back) back()
          else return
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        {items.map((item, index) =>
          item === 'separator' ? (
            <div
              key={`line-${index}`}
              className="menu-separator"
              role="separator"
            />
          ) : 'figure' in item ? (
            <MenuFigureRow key={`figure-${index}`} {...item.figure} />
          ) : (
            <button
              key={menuKey(item, index)}
              type="button"
              role="menuitem"
              data-index={index}
              aria-haspopup={item.submenu ? 'menu' : undefined}
              aria-expanded={item.submenu ? openIndex === index : undefined}
              disabled={item.disabled}
              className={
                'menu-item' +
                (item.destructive ? ' destructive' : '') +
                (openIndex === index ? ' expanded' : '')
              }
              onMouseEnter={(event) => {
                if (item.submenu) openSub(index, event.currentTarget)
                else setOpen(undefined)
              }}
              onClick={(event) => {
                if (item.submenu) {
                  openSub(index, event.currentTarget)
                  return
                }
                close()
                item.action?.()
              }}
            >
              {!item.bare && (
                <span className="menu-glyph">
                  {item.checked ? (
                    <Glyph name="check" />
                  ) : (
                    (item.icon ?? (item.glyph && <Glyph name={item.glyph} />))
                  )}
                </span>
              )}
              <span className="menu-label">{item.label}</span>
              {item.badge !== undefined && (
                <span className="menu-badge">{item.badge}</span>
              )}
              {item.submenu && <Glyph name="chevron" />}
            </button>
          ),
        )}
      </div>
      {open &&
        (() => {
          const entry = items[openIndex]
          if (!isEntry(entry) || !entry.submenu) return null
          return (
            <MenuPanel
              items={entry.submenu}
              at={at}
              side={open.rect}
              close={close}
              minWidth={minWidth}
              back={() => {
                const index = openIndex
                setOpen(undefined)
                box.current
                  ?.querySelector<HTMLButtonElement>(`[data-index="${index}"]`)
                  ?.focus()
              }}
            />
          )
        })()}
    </>
  )
}

/** A figure's row: not a menu item, so it takes no highlight and no keys; read as one by a screen reader. */
function MenuFigureRow({
  title,
  subtitle,
  value,
}: {
  title: string
  subtitle?: string
  value: string
}) {
  return (
    <div
      className={subtitle === undefined ? 'menu-figure short' : 'menu-figure'}
      role="menuitem"
      aria-disabled="true"
      aria-label={`${title}, ${value}`}
    >
      <span className="menu-figure-words" aria-hidden="true">
        <span className="menu-figure-title">{title}</span>
        {subtitle !== undefined && (
          <span className="menu-figure-line">{subtitle}</span>
        )}
      </span>
      <span className="menu-figure-value" aria-hidden="true">
        {value}
      </span>
    </div>
  )
}

export type GlyphName =
  | 'pin'
  | 'unpin'
  | 'folder'
  | 'folderAdd'
  | 'bell'
  | 'bellBadge'
  | 'duplicate'
  | 'copy'
  | 'hide'
  | 'trash'
  | 'pencil'
  | 'up'
  | 'down'
  | 'check'
  | 'chevron'
  | 'xmark'
  | 'clock'

const glyphs: Record<GlyphName, ReactNode> = {
  pin: <path d="M6 2.5h4l-.5 4 2 2v1H4.5v-1l2-2ZM8 9.5V14" />,
  unpin: <path d="M6 2.5h4l-.5 4 2 2v1H4.5v-1l2-2ZM8 9.5V14M2.5 2.5l11 11" />,
  folder: (
    <path d="M1.5 4A1.5 1.5 0 0 1 3 2.5h2.8l1.4 1.5H13A1.5 1.5 0 0 1 14.5 5.5v6A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5Z" />
  ),
  folderAdd: (
    <path d="M1.5 4A1.5 1.5 0 0 1 3 2.5h2.8l1.4 1.5H13A1.5 1.5 0 0 1 14.5 5.5v6A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5ZM8 6.5v4.5M5.8 8.75h4.4" />
  ),
  bell: <path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3ZM6.5 14h3" />,
  bellBadge: (
    <path d="M4 11V7a4 4 0 0 1 6-3.4M12 7.5V11l1 1.5H3L4 11M6.5 14h3M13 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
  ),
  duplicate: (
    <path d="M5.5 5.5h8v8h-8ZM3 10.5h-.5v-8h8V3M9.5 7.5v4M7.5 9.5h4" />
  ),
  copy: <path d="M5.5 5.5h7v8h-7ZM3.5 10.5v-8h7" />,
  hide: (
    <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8ZM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM2.5 2.5l11 11" />
  ),
  trash: (
    <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v4.5M9.2 6.5v4.5" />
  ),
  pencil: <path d="M10.5 2.5l3 3-8 8h-3v-3ZM9 4l3 3" />,
  up: <path d="M8 13.5v-11M3.5 7 8 2.5 12.5 7" />,
  down: <path d="M8 2.5v11M3.5 9 8 13.5 12.5 9" />,
  check: <path d="M3 8.5 6.5 12l6.5-8" />,
  chevron: <path d="M6 3.5 10.5 8 6 12.5" />,
  xmark: <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />,
  clock: <path d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM8 5v3.2l2 1.3" />,
}

export function Glyph({ name, size = 14 }: { name: GlyphName; size?: number }) {
  return (
    <svg
      className={`glyph glyph-${name}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {glyphs[name]}
      </g>
    </svg>
  )
}
