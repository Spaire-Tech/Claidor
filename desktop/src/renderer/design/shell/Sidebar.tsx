import { useMemo, useState } from 'react';

import { AppsIcon, ChevronUpIcon, SearchIcon } from '../icons';
import { Orb, OrbMood } from '../orb/Orb';
import { color, line, radius, shadow, text, tracking } from '../tokens';

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
  onCompose: () => void;
  onApps: () => void;
  /** The signed-in person, for the row at the bottom. */
  accountName: string;
  onAccount: () => void;
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
  agents, activeId, onSelect, onCompose, onApps, accountName, onAccount,
}: SidebarProps): JSX.Element {
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return agents;
    return agents.filter(agent => agent.name.toLowerCase().includes(needle));
  }, [agents, query]);

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', minHeight: 0,
        borderRight: `1px solid ${line.hairline}`,
        background: 'rgba(249,250,252,.86)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 18px 12px' }}>
        <div style={{ fontSize: text.sidebarTitle, fontWeight: 500, letterSpacing: tracking.title }}>
          Messages
        </div>
        <button
          type="button"
          onClick={onCompose}
          aria-label="New"
          style={{
            width: 32, height: 32, borderRadius: '50%',
            border: `1px solid ${line.hairline}`, background: color.paper,
            color: color.muted, fontSize: 18, lineHeight: 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: shadow.flat,
          }}
        >
          +
        </button>
      </div>

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 10px', overflowY: 'auto', flex: '1 1 auto' }}>
        {shown.map(agent => {
          const active = agent.id === activeId;
          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => onSelect(agent.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, height: 64,
                padding: '0 12px', borderRadius: radius.row, cursor: 'pointer',
                font: 'inherit', textAlign: 'left', width: '100%',
                background: active ? color.paper : 'transparent',
                border: active ? '1px solid rgba(255,255,255,.6)' : '1px solid transparent',
                boxShadow: active ? shadow.raised : 'none',
              }}
            >
              <Orb agentId={agent.id} size={40} mood={OrbMood.Idle} />
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
              <span
                aria-label={agent.unread ? 'Unread' : undefined}
                style={{
                  width: 7, height: 7, flex: '0 0 auto', borderRadius: '50%',
                  background: agent.unread ? color.accent : 'transparent',
                }}
              />
            </button>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 'auto', padding: '14px 10px 16px',
          display: 'flex', flexDirection: 'column', gap: 2,
          borderTop: `1px solid ${line.hairline}`,
        }}
      >
        <button
          type="button"
          onClick={onApps}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 12px',
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
          <span style={{ fontSize: text.body }}>Apps</span>
        </button>

        <button
          type="button"
          onClick={onAccount}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 12px',
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
          <span style={{ flex: '1 1 auto', fontSize: text.body }}>{accountName}</span>
          <ChevronUpIcon size={13} style={{ color: color.faint }} />
        </button>
      </div>
    </div>
  );
}
