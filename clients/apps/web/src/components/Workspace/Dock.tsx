'use client'

/**
 * The dock, and the deal name beside it.
 *
 * Eleven buttons in the order the design puts them, a hairline divider
 * before the last two, and the live one carried by a pale fill rather than
 * a colour — which is why the dock stays quiet with eleven items in it.
 *
 * **The band is a fixed 86px**, not padding around its contents. That is
 * what keeps the panels above from shifting by a pixel when the dock's
 * contents change, and it is the design's own number.
 *
 * **The deal name is a label, not a control.** There is no button here to
 * hide the left panel, because the design has none: Chat *is* the way back
 * to one column, and a second control that does the same thing is a second
 * thing to learn. It sits absolutely at the left so the dock stays centred
 * on the window rather than on the space beside the name, and it is capped
 * at `calc(50% - 170px)` so a long deal name truncates instead of reaching
 * the dock.
 */

import {
  ApplicationsIcon,
  CalendarIcon,
  ChatIcon,
  DocsIcon,
  FilesIcon,
  LibraryIcon,
  MailIcon,
  PanelIcon,
  ProjectsIcon,
  SharePointIcon,
  SheetsIcon,
  TerminalIcon,
} from './Icons'
import { colour, size, dock as token } from './design'
import type { View } from './views'

type Item = { view: View; title: string; icon: typeof ChatIcon }

const ITEMS: Item[] = [
  { view: 'chat', title: 'Chat', icon: ChatIcon },
  { view: 'files', title: 'Files', icon: FilesIcon },
  { view: 'mail', title: 'Mail', icon: MailIcon },
  { view: 'calendar', title: 'Calendar', icon: CalendarIcon },
  { view: 'docs', title: 'Docs', icon: DocsIcon },
  { view: 'sheets', title: 'Sheets', icon: SheetsIcon },
  { view: 'sharepoint', title: 'SharePoint', icon: SharePointIcon },
  { view: 'projects', title: 'Projects', icon: ProjectsIcon },
  { view: 'terminal', title: 'Terminal', icon: TerminalIcon },
]

const TRAILING: Item[] = [
  { view: 'applications', title: 'Applications', icon: ApplicationsIcon },
  { view: 'library', title: 'Library', icon: LibraryIcon },
]

function Button({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        border: 0,
        background: active ? token.live : 'transparent',
        borderRadius: 12,
        padding: 8,
        cursor: 'pointer',
        color: active ? colour.blue : colour.darker,
        display: 'flex',
      }}
    >
      {children}
    </button>
  )
}

export function Dock({
  view,
  onGo,
  deal,
}: {
  view: View
  onGo: (view: View) => void
  deal: string
}) {
  return (
    <div
      style={{
        flex: `0 0 ${token.row}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 4,
          maxWidth: 'calc(50% - 170px)',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: colour.slateDeep,
          fontSize: size.meta,
        }}
      >
        <PanelIcon />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {deal}
        </span>
      </div>

      <div style={token.bar}>
        {ITEMS.map(({ view: v, title, icon: Icon }) => (
          <Button
            key={v}
            active={view === v}
            title={title}
            onClick={() => onGo(v)}
          >
            <Icon />
          </Button>
        ))}
        <span style={token.divider} />
        {TRAILING.map(({ view: v, title, icon: Icon }) => (
          <Button
            key={v}
            active={view === v}
            title={title}
            onClick={() => onGo(v)}
          >
            <Icon />
          </Button>
        ))}
      </div>
    </div>
  )
}
