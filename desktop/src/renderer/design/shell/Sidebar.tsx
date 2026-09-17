import { useMemo, useState } from 'react';

import { SearchIcon } from '../icons';
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
  /**
   * A list of conversations, or a rail of faces.
   *
   * Decided by the window's width in `layout.ts`, not here — this
   * component draws the answer rather than working it out.
   */
  mode?: SidebarMode;
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
 * The list of agents: the window's left column, from the 17 September
 * canvas.
 *
 * It is a conversation list, not a navigation tree: one row per agent,
 * a face, the last message, a timestamp, an unread dot. The search
 * filters by name only — searching message content is a different
 * feature with a different screen, and pretending otherwise in a filter
 * box is how a search box becomes untrustworthy.
 *
 * Nothing at the bottom and no "+" at the top: those went to the dock.
 *
 * On the active row the dot gives way to a trash icon (the canvas's
 * `showDelete: isActive && BOTS.length > 1`): the one you are looking at
 * is the one you might want gone, and the others keep their dot.
 */
export function Sidebar({
  agents, activeId, onSelect, onAskDelete, mode = SidebarMode.List,
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
        overflow: 'hidden', background: color.window,
      }}
    >
      {/*
        The title strip. The window has no title bar, so this and the
        ground are what you pick it up by; `no-drag` goes back on every
        control by a rule in `tokens.css`.
      */}
      {!rail && (
        <div
          style={{
            display: 'flex', alignItems: 'center', padding: '22px 18px 14px',
            WebkitAppRegion: 'drag',
          } as React.CSSProperties}
        >
          <div style={{ fontSize: text.sidebarTitle, fontWeight: 500, letterSpacing: tracking.title }}>
            Messages
          </div>
        </div>
      )}

      {/*
        No search on the rail. A 76px field is a box you cannot read what
        you typed into, and the rail exists because there is no room —
        pretending otherwise spends the room twice.
      */}
      {!rail && (
        <div style={{ padding: '0 11px 12px' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8, height: 33,
              padding: '0 11px', borderRadius: radius.pill,
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
          padding: rail ? '16px 6px 6px' : '0 9px 6px',
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
                padding: rail ? '0' : '0 10px', borderRadius: radius.row, cursor: 'pointer',
                width: '100%', boxSizing: 'border-box',
                background: active ? color.paper : 'transparent',
                border: `1px solid ${active ? line.field : 'transparent'}`,
                boxShadow: active ? shadow.flat : 'none',
                transition: 'background .15s',
              }}
            >
              <span style={{ animation: 'fsr-orb-idle 7.5s ease-in-out infinite', display: 'block', flex: '0 0 auto' }}>
                <CloudBlob avatar={agent.avatar} size={33} />
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
                    background: color.accent, border: `2px solid ${color.window}`,
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
                    width: 23, height: 23, flex: '0 0 auto', padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 9, cursor: 'pointer', font: 'inherit',
                    border: `1px solid ${trashHot ? 'rgba(201,42,37,.18)' : 'transparent'}`,
                    background: trashHot ? color.deleteFill : 'transparent',
                    color: trashHot ? color.deleteInk : color.muted,
                  }}
                >
                  <TrashGlyph />
                </button>
              ) : (
                <span
                  aria-label={agent.unread ? 'Unread' : undefined}
                  style={{
                    width: 7, height: 7, flex: '0 0 auto', borderRadius: '50%',
                    background: agent.unread ? color.accent : 'transparent',
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
