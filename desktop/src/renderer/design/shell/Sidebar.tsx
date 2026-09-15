import { useEffect, useMemo, useState } from 'react';

import { AppsIcon, ChevronUpIcon, CloseIcon, SearchIcon } from '../icons';
import { Orb, OrbMood } from '../orb/Orb';
import { color, line, radius, shadow, text, tracking } from '../tokens';
import { CONFIRM_WINDOW_MS, ConfirmState, pressConfirm } from './confirm';
import { SidebarMode } from './layout';

export interface SidebarAgent {
  id: string;
  name: string;
  /** The last thing said, either way. */
  preview: string;
  /** "9:12 AM", "Friday". */
  when: string;
  unread?: boolean;
}

export interface SidebarProps {
  agents: readonly SidebarAgent[];
  activeId: string;
  onSelect: (agentId: string) => void;
  /**
   * Delete this conversation and everything in it.
   *
   * Permanent, and there is no archive: `grok-bot-app-ui.md` is explicit
   * that the only option is a permanent delete with a confirm, and a
   * half-measure here would be a second concept for people to wonder
   * about. Absent for rows that cannot be deleted — the main agent.
   */
  onDelete?: (id: string) => void;
  onCompose: () => void;
  onApps: () => void;
  /** The signed-in person, for the row at the bottom. */
  accountName: string;
  onAccount: () => void;
  /** The account menu, when it is open. Anchored to the row below it. */
  accountMenu?: React.ReactNode;
  /**
   * A list of conversations, or a rail of orbs.
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

/**
 * The list of agents.
 *
 * It is a conversation list, not a navigation tree: one row per agent,
 * last message, timestamp, unread dot. The search filters by name only —
 * searching message content is a different feature with a different
 * screen, and pretending otherwise in a filter box is how a search box
 * becomes untrustworthy.
 */
export function Sidebar({
  agents, activeId, onSelect, onDelete, onCompose, onApps, accountName, onAccount,
  accountMenu, mode = SidebarMode.List, topInset = 0,
}: SidebarProps): JSX.Element {
  const [query, setQuery] = useState('');
  const rail = mode === SidebarMode.Rail;

  // Which row is being asked about, and since when.
  //
  // One at a time: arming a second row disarms the first, so there is
  // never more than one control on screen waiting for a second press.
  const [armed, setArmed] = useState<{ id: string; at: number } | undefined>();

  useEffect(() => {
    if (!armed) return undefined;
    // Goes quiet on its own. A row left asking is a question nobody
    // answered, and it should stop asking rather than wait indefinitely.
    const timer = window.setTimeout(() => setArmed(undefined), CONFIRM_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [armed]);

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
          padding: rail ? `${18 + topInset}px 0 12px` : `${18 + topInset}px 18px 12px`,
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
            width: 32, height: 32, borderRadius: '50%',
            border: `1px solid ${line.hairline}`, background: color.paper,
            color: color.muted, fontSize: 18, lineHeight: 1, cursor: 'pointer',
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
        <div style={{ padding: '0 14px 14px' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 9, height: 40,
              padding: '0 14px', borderRadius: radius.pill,
              background: color.fill, border: `1px solid ${line.hairline}`,
            }}
          >
            <SearchIcon size={14} style={{ color: color.muted }} />
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
          display: 'flex', flexDirection: 'column', gap: 2,
          padding: rail ? '0 6px' : '0 10px',
          overflowY: 'auto', overflowX: 'hidden', flex: '1 1 auto', minWidth: 0,
        }}
      >
        {shown.map(agent => {
          const active = agent.id === activeId;
          const asking = armed?.id === agent.id;
          // Not from the rail. Delete here is permanent and there is no
          // archive; a rail row is an orb with no name on it, so the
          // question "delete which one?" has no answer on screen. Widening
          // the window is a cheaper thing to ask of somebody than losing
          // the wrong conversation.
          const deletable = Boolean(onDelete) && !rail;

          const press = (): void => {
            const step = pressConfirm(
              asking ? ConfirmState.Armed : ConfirmState.Ready,
              armed?.at,
              Date.now(),
            );
            if (step.act) {
              setArmed(undefined);
              onDelete?.(agent.id);
              return;
            }
            setArmed({ id: agent.id, at: Date.now() });
          };

          return (
            <div key={agent.id} style={{ position: 'relative', display: 'flex' }}>
            <button
              type="button"
              onClick={() => (asking ? setArmed(undefined) : onSelect(agent.id))}
              title={rail ? agent.name : undefined}
              aria-label={rail ? agent.name : undefined}
              onContextMenu={deletable ? (event => {
                // Right-click is where people look for this, and it is the
                // only route: `grok-bot-app-ui.md` is explicit that delete
                // is not in Settings.
                event.preventDefault();
                setArmed({ id: agent.id, at: Date.now() });
              }) : undefined}
              style={{
                display: 'flex', alignItems: 'center',
                justifyContent: rail ? 'center' : 'flex-start',
                gap: rail ? 0 : 12, height: 64,
                padding: rail ? '0' : '0 12px', borderRadius: radius.row, cursor: 'pointer',
                font: 'inherit', textAlign: 'left', width: '100%',
                background: active ? color.paper : 'transparent',
                border: active ? '1px solid rgba(255,255,255,.6)' : '1px solid transparent',
                // The canvas ends the selected row's shadow with
                // `inset 0 1px 0 rgba(255,255,255,.7)` — a white line
                // along its top edge, which is what stops the row
                // reading as a flat grey patch.
                boxShadow: active ? `${shadow.raised}, inset 0 1px 0 rgba(255,255,255,.7)` : 'none',
                position: 'relative',
              }}
            >
              <Orb agentId={agent.id} size={40} mood={OrbMood.Idle} />
              {/*
                On the rail the dot moves onto the orb, because there is no
                row left for it to sit at the end of. Same 7px, same
                colour — it is the same dot, parked somewhere it fits.
              */}
              {rail && agent.unread && (
                <span
                  aria-label="Unread"
                  style={{
                    position: 'absolute', right: 15, top: 16,
                    width: 9, height: 9, borderRadius: '50%',
                    background: color.accent, border: `2px solid ${color.paper}`,
                  }}
                />
              )}
              {!rail && (
              <span style={{ minWidth: 0, flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span
                    style={{
                      flex: '1 1 auto', minWidth: 0, fontSize: text.emphasis, fontWeight: 500,
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
              {!rail && (
                <span
                  aria-label={agent.unread ? 'Unread' : undefined}
                  style={{
                    width: 7, height: 7, flex: '0 0 auto', borderRadius: '50%',
                    background: agent.unread ? color.accent : 'transparent',
                  }}
                />
              )}
            </button>

            {asking && (
              // Over the row it belongs to, rather than a dialog in the
              // middle of the screen. The answer stays where the question
              // was asked.
              <div
                style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                  gap: 8, padding: '0 12px', borderRadius: radius.row,
                  background: color.paper, border: `1px solid ${line.field}`,
                  boxShadow: shadow.raised,
                }}
              >
                <span
                  style={{
                    flex: '1 1 auto', minWidth: 0, fontSize: text.label, color: color.ink,
                    lineHeight: 1.35, textWrap: 'pretty',
                  }}
                >
                  Delete {agent.name} and everything in it? This cannot be undone.
                </span>
                <button
                  type="button"
                  onClick={press}
                  style={{
                    flex: '0 0 auto', height: 30, padding: '0 12px', border: 'none',
                    borderRadius: radius.field, background: color.danger, color: color.paper,
                    font: 'inherit', fontSize: text.label, fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setArmed(undefined)}
                  aria-label="Keep it"
                  style={{
                    flex: '0 0 auto', width: 28, height: 28, border: 'none',
                    background: 'transparent', borderRadius: '50%', cursor: 'pointer',
                    color: color.muted, display: 'flex', alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CloseIcon size={12} />
                </button>
              </div>
            )}
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 'auto', padding: '14px 10px 16px',
          display: 'flex', flexDirection: 'column', gap: 2,
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
            gap: rail ? 0 : 12, height: 52, padding: rail ? '0' : '0 12px',
            borderRadius: radius.row, cursor: 'pointer', border: 'none',
            background: 'transparent', font: 'inherit', textAlign: 'left',
          }}
        >
          <span
            style={{
              width: 34, height: 34, borderRadius: '50%', background: color.fill,
              border: `1px solid ${line.hairline}`, flex: '0 0 auto',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: color.muted,
            }}
          >
            <AppsIcon size={15} />
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
            gap: rail ? 0 : 12, height: 52, padding: rail ? '0' : '0 12px',
            borderRadius: radius.row, cursor: 'pointer', border: 'none',
            background: 'transparent', font: 'inherit', textAlign: 'left',
          }}
        >
          <span
            style={{
              width: 34, height: 34, borderRadius: '50%', background: color.ink,
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
              <ChevronUpIcon size={13} style={{ color: color.faint }} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
