import { useMemo, useState } from 'react';

import { AppsIcon, ChevronUpIcon, SearchIcon } from '../icons';
import { CloudBlob } from '../orb/CloudBlob';
import { color, line, radius, shadow, text, tracking } from '../tokens';
import { SidebarMode } from './layout';

export interface SidebarAgent {
  id: string;
  name: string;
  /** The face, 0–24. Every row has one. */
  avatar: number;
  /** The last thing said, either way. */
  preview: string;
  /** "9:12 AM", "Friday". */
  when: string;
  unread?: boolean;
  /** Whether the row can be deleted at all. The main agent cannot. */
  deletable?: boolean;
}

export interface SidebarProps {
  agents: readonly SidebarAgent[];
  activeId: string;
  onSelect: (agentId: string) => void;
  /**
   * The trash icon on the active row.
   *
   * It does not delete. It opens the agent panel with the question
   * already asked — "Delete {name} and this conversation? This can't be
   * undone." — which is where the 15 September canvas puts it. The row
   * itself never carries a confirm; a sidebar is for choosing, not for
   * destroying.
   */
  onAskDelete?: (id: string) => void;
  onCompose: () => void;
  onApps: () => void;
  /** The signed-in person, for the row at the bottom. */
  accountName: string;
  onAccount: () => void;
  /** The account menu, when it is open. Anchored to the row below it. */
  accountMenu?: React.ReactNode;
  /**
   * A list of conversations, or a rail of faces.
   *
   * Decided by the window's width in `layout.ts`, not here — this
   * component draws the answer rather than working it out.
   */
  mode?: SidebarMode;
  /**
   * Space above the first row, for the macOS window buttons.
   *
   * They are drawn over the top-left of our own canvas, which is exactly
   * where the design puts "Messages", so the two were on top of each
   * other. Zero on every other platform.
   */
  topInset?: number;
}

/** The canvas's trash, 13px, stroke 1.7. */
function TrashGlyph(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden focusable="false">
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

/**
 * The list of agents.
 *
 * It is a conversation list, not a navigation tree: one row per agent,
 * a face, the last message, a timestamp, an unread dot. The search
 * filters by name only — searching message content is a different
 * feature with a different screen, and pretending otherwise in a filter
 * box is how a search box becomes untrustworthy.
 *
 * On the active row the dot gives way to a trash icon (the canvas's
 * `showDelete: isActive && BOTS.length > 1`): the one you are looking at
 * is the one you might want gone, and the others keep their dot.
 */
export function Sidebar({
  agents, activeId, onSelect, onAskDelete, onCompose, onApps, accountName, onAccount,
  accountMenu, mode = SidebarMode.List, topInset = 0,
}: SidebarProps): JSX.Element {
  const [query, setQuery] = useState('');
  const rail = mode === SidebarMode.Rail;
  const [hoverTrash, setHoverTrash] = useState<string>();

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return agents;
    return agents.filter(agent => agent.name.toLowerCase().includes(needle));
  }, [agents, query]);

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0,
        overflow: 'hidden',
        borderRight: `1px solid ${line.hairline}`,
        background: 'rgba(249,250,252,.86)',
        backdropFilter: 'blur(2px)',
      }}
    >
      {/*
        The strip the window's own buttons sit in, and the only part of
        the sidebar you can pick the window up by. `no-drag` goes back on
        every control inside it, or the button becomes scenery.
      */}
      <div
        style={{
          display: 'flex', alignItems: 'center',
          justifyContent: rail ? 'center' : 'space-between',
          padding: rail ? `${15 + topInset}px 0 11px` : `${15 + topInset}px 15px 11px`,
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      >
        {!rail && (
          <div style={{ fontSize: text.sidebarTitle, fontWeight: 500, letterSpacing: tracking.title }}>
            Messages
          </div>
        )}
        <button
          type="button"
          onClick={onCompose}
          aria-label="New"
          style={{
            width: 30, height: 30, borderRadius: '50%',
            border: `1px solid ${line.hairline}`, background: color.paper,
            color: color.muted, fontSize: 16.5, lineHeight: 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: shadow.flat, WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
        >
          +
        </button>
      </div>

      {/*
        No search on the rail. A 76px field is a box you cannot read what
        you typed into, and the rail exists because there is no room —
        pretending otherwise spends the room twice.
      */}
      {!rail && (
        <div style={{ padding: '0 12px 12px' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8, height: 37,
              padding: '0 12px', borderRadius: radius.pill,
              background: color.fill, border: `1px solid ${line.hairline}`,
            }}
          >
            <SearchIcon size={13} style={{ color: color.muted }} />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search agents"
              style={{
                flex: '1 1 auto', minWidth: 0, border: 'none', outline: 'none',
                background: 'transparent', font: 'inherit',
                fontSize: text.small, color: color.ink,
              }}
            />
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          padding: rail ? '0 6px' : '0 9px 6px',
          overflowY: 'auto', overflowX: 'hidden', flex: '1 1 auto', minWidth: 0,
        }}
      >
        {shown.map(agent => {
          const active = agent.id === activeId;
          // The canvas's rule, plus ours: never the main agent, and never
          // from the rail, where a row is a face with no name and "delete
          // which one?" has no answer on screen.
          const showTrash = active && !rail && Boolean(onAskDelete)
            && agent.deletable !== false && agents.length > 1;
          const trashHot = hoverTrash === agent.id;

          return (
            <div
              key={agent.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(agent.id)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(agent.id);
                }
              }}
              title={rail ? agent.name : undefined}
              aria-label={rail ? agent.name : undefined}
              aria-current={active ? 'true' : undefined}
              style={{
                position: 'relative',
                display: 'flex', alignItems: 'center',
                justifyContent: rail ? 'center' : 'flex-start',
                gap: rail ? 0 : 11, height: 59,
                padding: rail ? '0' : '0 11px', borderRadius: radius.row, cursor: 'pointer',
                width: '100%', boxSizing: 'border-box',
                background: active ? color.paper : 'transparent',
                border: active ? '1px solid rgba(255,255,255,.6)' : '1px solid transparent',
                // The canvas ends the selected row's shadow with
                // `inset 0 1px 0 rgba(255,255,255,.7)` — a white line
                // along its top edge, which is what stops the row
                // reading as a flat grey patch.
                boxShadow: active ? `${shadow.raised}, inset 0 1px 0 rgba(255,255,255,.7)` : 'none',
                transition: 'background .15s',
              }}
            >
              <span style={{ animation: 'fsr-orb-idle 7.5s ease-in-out infinite', display: 'block', flex: '0 0 auto' }}>
                <CloudBlob avatar={agent.avatar} size={37} />
              </span>
              {/*
                On the rail the dot moves onto the face, because there is
                no row left for it to sit at the end of. Same colour — it
                is the same dot, parked somewhere it fits.
              */}
              {rail && agent.unread && (
                <span
                  aria-label="Unread"
                  style={{
                    position: 'absolute', right: 14, top: 14,
                    width: 9, height: 9, borderRadius: '50%',
                    background: color.accent, border: `2px solid ${color.paper}`,
                  }}
                />
              )}
              {!rail && (
                <span style={{ minWidth: 0, flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                    <span
                      style={{
                        flex: '1 1 auto', minWidth: 0, fontSize: text.message, fontWeight: 500,
                        letterSpacing: tracking.body, whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                    >
                      {agent.name}
                    </span>
                    <span style={{ flex: '0 0 auto', fontSize: text.caption, color: color.muted, whiteSpace: 'nowrap' }}>
                      {agent.when}
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: text.label, color: color.muted,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {agent.preview}
                  </span>
                </span>
              )}
              {!rail && (showTrash ? (
                <button
                  type="button"
                  title="Delete conversation"
                  aria-label={`Delete ${agent.name}`}
                  onClick={event => {
                    // The row underneath selects. This must not.
                    event.stopPropagation();
                    onAskDelete?.(agent.id);
                  }}
                  onMouseEnter={() => setHoverTrash(agent.id)}
                  onMouseLeave={() => setHoverTrash(undefined)}
                  style={{
                    width: 26, height: 26, flex: '0 0 auto', padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 9, cursor: 'pointer', font: 'inherit',
                    border: `1px solid ${trashHot ? 'rgba(201,42,37,.18)' : 'transparent'}`,
                    background: trashHot ? '#fdeceb' : 'transparent',
                    color: trashHot ? color.danger : color.faint,
                  }}
                >
                  <TrashGlyph />
                </button>
              ) : (
                <span
                  aria-label={agent.unread ? 'Unread' : undefined}
                  style={{
                    width: 7, height: 7, flex: '0 0 auto', borderRadius: '50%',
                    background: agent.unread ? color.ink : 'transparent',
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 'auto', padding: '12px 9px 14px',
          display: 'flex', flexDirection: 'column', gap: 4,
          borderTop: `1px solid ${line.hairline}`,
          // The menu is absolute against this, so it opens upward from
          // the row rather than from the window.
          position: 'relative',
        }}
      >
        {accountMenu}
        <button
          type="button"
          onClick={onApps}
          title={rail ? 'Apps' : undefined}
          aria-label={rail ? 'Apps' : undefined}
          style={{
            display: 'flex', alignItems: 'center',
            justifyContent: rail ? 'center' : 'flex-start',
            gap: rail ? 0 : 11, height: 49, padding: rail ? '0' : '0 11px',
            borderRadius: radius.row, cursor: 'pointer', border: 'none',
            background: 'transparent', font: 'inherit', textAlign: 'left',
          }}
        >
          <span
            style={{
              width: 31, height: 31, borderRadius: '50%', background: color.fill,
              border: `1px solid ${line.hairline}`, flex: '0 0 auto',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: color.muted,
            }}
          >
            <AppsIcon size={14} />
          </span>
          {!rail && <span style={{ fontSize: text.body }}>Apps</span>}
        </button>

        <button
          type="button"
          onClick={onAccount}
          title={rail ? accountName : undefined}
          aria-label={rail ? accountName : undefined}
          style={{
            display: 'flex', alignItems: 'center',
            justifyContent: rail ? 'center' : 'flex-start',
            gap: rail ? 0 : 11, height: 49, padding: rail ? '0' : '0 11px',
            borderRadius: radius.row, cursor: 'pointer', border: 'none',
            background: 'transparent', font: 'inherit', textAlign: 'left',
          }}
        >
          <span
            style={{
              width: 31, height: 31, borderRadius: '50%', background: color.ink,
              color: color.paper, flex: '0 0 auto',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: text.caption, fontWeight: 500,
            }}
          >
            {(accountName.trim()[0] ?? '?').toUpperCase()}
          </span>
          {!rail && (
            <>
              <span style={{ flex: '1 1 auto', fontSize: text.body }}>{accountName}</span>
              <ChevronUpIcon size={12} style={{ color: color.faint }} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
