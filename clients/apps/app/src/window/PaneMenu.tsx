// A menu the pane's pages pop up under a button (the Mac's `NSMenu` through
// `RoutineMenus.popUp`, at least 200 wide, 4 under the button, its left
// edge on the button's): a channel's Refresh and Disconnect
// (ChannelsPage.swift), Add Member's agents (PaneMembersFlight.swift). Drawn
// as the window's other menus (`.pop-menu`: glass, 10 round, 13 on 24);
// an item may carry a picture (an agent's at 28) or a symbol. Escape, a
// click elsewhere, the window going to the back or a pick closes it; ↑ and
// ↓ choose, Return picks. The keys go back to its button when it closes.

import { type ReactNode, useLayoutEffect, useRef } from 'react'
import { classes } from './classes'
import { useDismiss } from './MessageActions'

export interface PaneMenuItem {
  label: string
  /** Its picture or symbol, before the words. */
  icon?: ReactNode
  /** A picture at 28: the item is 32 high. */
  tall?: boolean
  disabled?: boolean
  action: () => void
}

export function PaneMenu({
  items,
  under,
  label,
  close,
}: {
  items: readonly PaneMenuItem[]
  /** The button it hangs from. */
  under: HTMLElement
  label: string
  close: () => void
}) {
  const holder = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  useDismiss(holder, close)
  // Placed 4 under the button, kept inside the window; the keys come to it, and go back to the button after.
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const rect = under.getBoundingClientRect()
    const width = element.offsetWidth
    const height = element.offsetHeight
    let left = rect.left
    let top = rect.bottom + 4
    if (left + width > window.innerWidth - 8)
      left = Math.max(8, window.innerWidth - 8 - width)
    if (top + height > window.innerHeight - 8)
      top = Math.max(8, rect.top - 4 - height)
    element.style.left = `${Math.max(8, left)}px`
    element.style.top = `${Math.max(8, top)}px`
    element.style.visibility = 'visible'
    element.focus()
    return () => {
      if (under.isConnected) under.focus({ preventScroll: true })
    }
  }, [under])
  const buttons = () => [
    ...(box.current?.querySelectorAll<HTMLButtonElement>(
      ':scope > .menu-item:not(:disabled)',
    ) ?? []),
  ]
  return (
    <div ref={holder} className="context-menus">
      <div
        ref={box}
        className="pop-menu context-menu pane-menu"
        role="menu"
        aria-label={label}
        tabIndex={-1}
        style={{ position: 'fixed', visibility: 'hidden', left: 0, top: 0 }}
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
          else return
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        {items.map((item, index) => (
          <button
            key={`${index}-${item.label}`}
            type="button"
            role="menuitem"
            className={classes('menu-item', item.tall && 'tall')}
            disabled={item.disabled}
            onClick={() => {
              close()
              item.action()
            }}
          >
            {item.icon && (
              <span className={classes('menu-glyph', item.tall && 'picture')}>
                {item.icon}
              </span>
            )}
            <span className="menu-label">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
