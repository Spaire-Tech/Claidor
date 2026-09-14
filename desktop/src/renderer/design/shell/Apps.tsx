import { useState } from 'react';

import type { PresetAgent } from '../../types/agent';
import { CloseIcon } from '../icons';
import { Orb, OrbMood } from '../orb/Orb';
import { color, glass, line, radius, shadow, text, tracking } from '../tokens';
import { matchingRoles } from './apps';

export interface AppsProps {
  /** The roles not yet installed. */
  available: readonly PresetAgent[];
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
  available, installedIds, busyId, onInstall, onClose,
}: AppsProps): JSX.Element {
  const [query, setQuery] = useState('');
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
                Agents
              </div>
              <div style={{ fontSize: text.emphasis, color: color.muted }}>
                Add someone who already knows the job.
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

          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search agents"
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
          {shown.length === 0 && (
            <div style={{ padding: '18px 12px', fontSize: text.body, color: color.muted }}>
              Nobody by that name.
            </div>
          )}
          {shown.map(role => {
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
