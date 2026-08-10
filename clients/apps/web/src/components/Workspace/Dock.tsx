'use client'

/**
 * The dock, and the footer line beside it.
 *
 * Eleven buttons in the order the design puts them, a hairline divider
 * before the last two, and the active one carried by a pale fill rather
 * than a colour — which is why the dock stays quiet with eleven items in
 * it.
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
import { colour } from './design'
import type { View } from './views'

const ITEMS: { view: View; title: string; icon: typeof ChatIcon }[] = [
  { view: 'chat', title: 'Chat', icon: ChatIcon },
  { view: 'files', title: 'Data room', icon: FilesIcon },
  { view: 'mail', title: 'Mail', icon: MailIcon },
  { view: 'calendar', title: 'Calendar', icon: CalendarIcon },
  { view: 'docs', title: 'Docs', icon: DocsIcon },
  { view: 'sheets', title: 'Sheets', icon: SheetsIcon },
  { view: 'sharepoint', title: 'SharePoint', icon: SharePointIcon },
  { view: 'projects', title: 'Projects', icon: ProjectsIcon },
  { view: 'terminal', title: 'Terminal', icon: TerminalIcon },
]

const TRAILING: { view: View; title: string; icon: typeof ChatIcon }[] = [
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
        background: active ? 'rgba(255,255,255,.92)' : 'transparent',
        boxShadow: active ? '0 1px 3px rgba(18,24,40,.10)' : 'none',
        borderRadius: 12,
        padding: 8,
        cursor: 'pointer',
        color: active ? colour.blue : colour.slateDeep,
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
  showLeft,
  onToggleLeft,
  deal,
}: {
  view: View
  onGo: (view: View) => void
  showLeft: boolean
  onToggleLeft: () => void
  deal: string
}) {
  return (
    <div
      style={{
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        padding: '10px 4px 14px',
        position: 'relative',
      }}
    >
      <button
        onClick={onToggleLeft}
        title={showLeft ? 'Hide the panel' : 'Show the panel'}
        style={{
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
          padding: 6,
          borderRadius: 9,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: colour.slateDeep,
          fontSize: 13.5,
          fontFamily: 'inherit',
        }}
      >
        <PanelIcon />
        <span>{deal}</span>
      </button>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          background: 'rgba(255,255,255,.62)',
          backdropFilter: 'blur(18px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
          border: '1px solid rgba(255,255,255,.85)',
          borderRadius: 18,
          padding: '6px 8px',
          boxShadow: '0 10px 30px rgba(16,20,28,.12), 0 0 0 1px rgba(16,20,28,.03)',
        }}
      >
        {ITEMS.map(({ view: v, title, icon: Icon }) => (
          <Button key={v} active={view === v} title={title} onClick={() => onGo(v)}>
            <Icon />
          </Button>
        ))}
        <span
          style={{
            width: 1,
            height: 24,
            background: 'rgba(21,23,27,.14)',
            margin: '0 7px',
          }}
        />
        {TRAILING.map(({ view: v, title, icon: Icon }) => (
          <Button key={v} active={view === v} title={title} onClick={() => onGo(v)}>
            <Icon />
          </Button>
        ))}
      </div>
    </div>
  )
}
