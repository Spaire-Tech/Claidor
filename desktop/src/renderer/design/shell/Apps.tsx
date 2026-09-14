import { useState } from 'react';

import type { PresetAgent } from '../../types/agent';
import { Connections, type ConnectionsProps } from '../connections/Connections';
import { shelfCount } from '../connections/shelf';
import { CloseIcon } from '../icons';
import { Orb, OrbMood } from '../orb/Orb';
import { color, glass, line, radius, shadow, text, tracking } from '../tokens';
import { matchingRoles } from './roles';

export const AppsTab = {
  /** `direction.md` §4 lists connectors first, and it is the bigger shelf. */
  Connections: 'connections',
  Agents: 'agents',
} as const;
export type AppsTab = typeof AppsTab[keyof typeof AppsTab];

export interface AppsProps {
  /** The roles not yet installed. */
  available: readonly PresetAgent[];
  /**
   * Everything the connections half needs except the search word, which
   * is this modal's — the box is shared between the two tabs.
   */
  connections: Omit<ConnectionsProps, 'query'>;
  /** The ids of roles already added, so they read as done rather than gone. */
  installedIds: ReadonlySet<string>;
  busyId?: string;
  onInstall: (presetId: string) => void;
  onClose: () => void;
}

/**
 * The twelve role agents.
 *
 * A role agent is an identity plus a set of skills. Upstream's kits carry
 * skills, MCP servers and connectors but no identity, so these are preset
 * agents rather than kits — and the install flow for presets already
 * existed and worked, which is why this screen is a list and a button
 * rather than a subsystem.
 *
 * Installed roles stay in the list, marked, instead of disappearing.
 * A list that empties as you use it makes you wonder what you did.
 */
export function Apps({
  available, connections, installedIds, busyId, onInstall, onClose,
}: AppsProps): JSX.Element {
  // `direction.md` §4: "Apps (two tabs: connectors, and role agents)".
  const [tab, setTab] = useState<AppsTab>(AppsTab.Connections);
  const [query, setQuery] = useState('');
  const onConnections = tab === AppsTab.Connections;
  const shown = matchingRoles(available, query);

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 50, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 32,
        background: glass.scrim, backdropFilter: glass.scrimBlur,
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={event => event.stopPropagation()}
        role="presentation"
        style={{
          width: '100%', maxWidth: 620, maxHeight: '100%', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', borderRadius: radius.modal,
          background: glass.background, backdropFilter: glass.blur,
          border: `1px solid ${glass.border}`,
          boxShadow: `${shadow.modal}, ${shadow.glassInset}`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            flex: '0 0 auto', padding: '22px 24px 14px', display: 'flex',
            flexDirection: 'column', gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: text.dialogTitle, fontWeight: 500, letterSpacing: tracking.screenTitle }}>
                Apps
              </div>
              <div style={{ fontSize: text.emphasis, color: color.muted }}>
                {onConnections
                  ? shelfCount(connections.connected)
                  : 'Add someone who already knows the job.'}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 28, height: 28, border: 'none', background: 'transparent',
                cursor: 'pointer', color: color.muted, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <CloseIcon size={13} />
            </button>
          </div>

          <div role="tablist" style={{ display: 'flex', gap: 2 }}>
            {([
              [AppsTab.Connections, 'Connections'],
              [AppsTab.Agents, 'Agents'],
            ] as const).map(([id, label]) => {
              const on = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  // The search box is shared, and a word typed on one
                  // shelf means nothing on the other.
                  onClick={() => { setTab(id); setQuery(''); }}
                  style={{
                    height: 30, padding: '0 14px', borderRadius: radius.pill,
                    border: '1px solid transparent', cursor: 'pointer', font: 'inherit',
                    fontSize: text.body, letterSpacing: tracking.body,
                    background: on ? color.fillStrong : 'transparent',
                    color: on ? color.ink : color.muted,
                    fontWeight: on ? 500 : 400,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search"
            aria-label={onConnections ? 'Search connections' : 'Search agents'}
            style={{
              height: 40, padding: '0 14px', borderRadius: radius.pill,
              background: color.fill, border: `1px solid ${line.hairline}`,
              outline: 'none', font: 'inherit', fontSize: text.small, color: color.ink,
            }}
          />
        </div>

        <div
          style={{
            flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
            padding: '0 12px 16px', display: 'flex', flexDirection: 'column', gap: 2,
          }}
        >
          {onConnections && <Connections {...connections} query={query} />}
          {!onConnections && shown.length === 0 && (
            <div style={{ padding: '18px 12px', fontSize: text.body, color: color.muted }}>
              Nobody by that name.
            </div>
          )}
          {!onConnections && shown.map(role => {
            const installed = installedIds.has(role.id);
            const busy = busyId === role.id;
            return (
              <div
                key={role.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: radius.row,
                }}
              >
                {/* The orb it will wear once it is here, so the list and
                    the sidebar agree with each other. */}
                <Orb agentId={role.id} size={38} mood={OrbMood.Still} />
                <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: text.emphasis, fontWeight: 500, letterSpacing: tracking.body }}>
                    {role.nameEn}
                  </span>
                  <span style={{ fontSize: text.small, color: color.muted, lineHeight: 1.35 }}>
                    {role.descriptionEn}
                  </span>
                </span>
                {installed ? (
                  <span style={{ flex: '0 0 auto', fontSize: text.small, color: color.success }}>
                    Added
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onInstall(role.id)}
                    disabled={busy}
                    style={{
                      flex: '0 0 auto', height: 32, padding: '0 16px',
                      borderRadius: radius.pill, border: `1px solid ${line.button}`,
                      background: color.paper, color: color.ink, font: 'inherit',
                      fontSize: text.small, cursor: busy ? 'default' : 'pointer',
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    {busy ? 'Adding…' : 'Add'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
