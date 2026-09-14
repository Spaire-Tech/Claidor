import { useState } from 'react';

import type { PresetAgent } from '../../types/agent';
import { Connections, type ConnectionsProps } from '../connections/Connections';
import { shelfCount } from '../connections/shelf';
import { CloseIcon, SearchIcon } from '../icons';
import { Orb, OrbMood } from '../orb/Orb';
import { color, glass, line, motion, radius, shadow, text, tracking } from '../tokens';
import { AGENT_TABS, agentBody, type AgentTab, matchingRoles, roleMeta } from './roles';

export const AppsTab = {
  /** The canvas's word. This screen called it "Connections" and the tab
   *  strip is where somebody looks for the word the design uses. */
  Plugins: 'plugins',
  Agents: 'agents',
} as const;
export type AppsTab = typeof AppsTab[keyof typeof AppsTab];

export interface AppsProps {
  /** The roles not yet installed. */
  available: readonly PresetAgent[];
  /**
   * Everything the connections half needs except the search word, which
   * is this sheet's — the box is shared between the two tabs.
   */
  connections: Omit<ConnectionsProps, 'query'>;
  /** The ids of roles already added, so they read as done rather than gone. */
  installedIds: ReadonlySet<string>;
  busyId?: string;
  onInstall: (presetId: string) => void;
  onClose: () => void;
}

/**
 * Apps: the connectors, and the role agents.
 *
 * A role agent is an identity plus a set of skills. Upstream's kits carry
 * skills, MCP servers and connectors but no identity, so these are preset
 * agents rather than kits — and the install flow for presets already
 * existed and worked.
 *
 * **This was a 620px modal.** The canvas is a full sheet —
 * `calc(100% - 48px)` up to 1080px, tabs beside the 22px title, search on
 * the right of the same row — and the shelf inside it is a grid of cards,
 * not a list of rows. The first build put a hundred and nine services and
 * twelve agents into something the size of a preferences dialog.
 *
 * Installed roles stay in the list, marked, instead of disappearing.
 * A list that empties as you use it makes you wonder what you did.
 */
export function Apps({
  available, connections, installedIds, busyId, onInstall, onClose,
}: AppsProps): JSX.Element {
  const [tab, setTab] = useState<AppsTab>(AppsTab.Plugins);
  const [query, setQuery] = useState('');
  // Which role's page is open, inside the Agents tab. The canvas puts the
  // detail here — behind a card, with a back arrow — and not behind the
  // agent's name in the conversation header.
  const [openRole, setOpenRole] = useState<PresetAgent>();
  const onPlugins = tab === AppsTab.Plugins;
  const shown = matchingRoles(available, query);

  const tabButton = (id: AppsTab, label: string): JSX.Element => {
    const on = tab === id;
    return (
      <button
        key={id}
        type="button"
        role="tab"
        aria-selected={on}
        // The search box is shared, and a word typed on one shelf means
        // nothing on the other.
        onClick={() => { setTab(id); setQuery(''); setOpenRole(undefined); }}
        style={{
          height: 30, padding: '0 16px', borderRadius: radius.pill, cursor: 'pointer',
          font: 'inherit', fontSize: text.label,
          ...(on
            ? {
              background: color.paper,
              color: color.accent,
              fontWeight: 500,
              border: '1px solid rgba(255,255,255,.8)',
              boxShadow: '0 1px 2px rgba(16,22,35,.08)',
            }
            : {
              background: 'transparent',
              color: color.muted,
              fontWeight: 400,
              border: '1px solid transparent',
            }),
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 80, display: 'flex',
        background: glass.scrim, backdropFilter: glass.scrimBlur,
        animation: `fsr-message-in ${motion.messageIn.longer} ${motion.messageIn.easing} both`,
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={event => event.stopPropagation()}
        role="presentation"
        style={{
          margin: 'auto', width: 'calc(100% - 48px)', maxWidth: 1080,
          height: 'calc(100% - 48px)', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', borderRadius: radius.modal,
          overflow: 'hidden', background: glass.background, backdropFilter: glass.blur,
          border: `1px solid ${glass.border}`,
          boxShadow: `${shadow.modal}, ${shadow.glassInset}`,
        }}
      >
        <div
          style={{
            flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 14,
            padding: '22px 26px 16px', borderBottom: `1px solid ${line.hairline}`,
          }}
        >
          <div style={{ fontSize: text.screenTitle, fontWeight: 500, letterSpacing: tracking.screenTitle, color: color.ink }}>
            Apps
          </div>
          <div
            role="tablist"
            style={{
              display: 'flex', alignItems: 'center', padding: 3,
              borderRadius: radius.pill, background: 'rgba(233,237,242,.9)',
              border: `1px solid ${line.hairline}`,
            }}
          >
            {tabButton(AppsTab.Plugins, 'Plugins')}
            {tabButton(AppsTab.Agents, 'Agents')}
          </div>

          <span
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10,
              width: 'min(300px, 42%)', height: 40, padding: '0 16px',
              borderRadius: radius.pill, background: color.fill,
              border: `1px solid ${line.hairline}`,
            }}
          >
            <SearchIcon size={14} style={{ color: color.muted }} />
            <input
              value={query}
              onChange={event => { setQuery(event.target.value); setOpenRole(undefined); }}
              placeholder="Search"
              aria-label={onPlugins ? 'Search connectors' : 'Search agents'}
              style={{
                flex: '1 1 auto', minWidth: 0, border: 'none', outline: 'none',
                background: 'transparent', font: 'inherit',
                fontSize: text.message, color: color.ink,
              }}
            />
          </span>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32, height: 32, flex: '0 0 auto', border: 'none',
              background: 'transparent', borderRadius: '50%', cursor: 'pointer',
              color: color.muted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <CloseIcon size={14} />
          </button>
        </div>

        <div
          style={{
            flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
            padding: '30px 34px 44px', display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          {onPlugins && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '0 2px' }}>
                <span style={{ fontSize: text.section, fontWeight: 500, letterSpacing: tracking.title, color: color.ink }}>
                  Connectors
                </span>
                {/*
                  The canvas puts a bare total here — 109. That is the
                  flattering number and the less useful one: sixty-one of
                  those cards are statements, not buttons. Same slot, same
                  size, same grey; a phrase instead of a figure.
                */}
                <span style={{ fontSize: text.message, color: color.muted }}>
                  {shelfCount(connections.connected)}
                </span>
              </div>
              <div style={{ fontSize: text.message, color: color.muted, lineHeight: 1.55, maxWidth: '74ch', padding: '8px 2px 0', textWrap: 'pretty' }}>
                A connector lets your agent act inside a service you already use.
                Where there&rsquo;s no connector it uses your computer and your
                browser instead, so nothing is out of reach.
              </div>
              <Connections {...connections} query={query} />
            </>
          )}

          {!onPlugins && !openRole && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '0 2px' }}>
                <span style={{ fontSize: text.section, fontWeight: 500, letterSpacing: tracking.title, color: color.ink }}>
                  Agents
                </span>
                <span style={{ fontSize: text.message, color: color.muted }}>{available.length}</span>
              </div>
              <div style={{ fontSize: text.message, color: color.muted, lineHeight: 1.55, maxWidth: '74ch', padding: '8px 2px 26px', textWrap: 'pretty' }}>
                Agents come ready for a role. Install one and it arrives with its
                own skills, already knowing the work.
              </div>

              {shown.length === 0 ? (
                <div style={{ fontSize: text.message, color: color.muted, textAlign: 'center', padding: '48px 0' }}>
                  Nothing matches that search.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 20 }}>
                  {shown.map(role => (
                    <RoleCard
                      key={role.id}
                      role={role}
                      installed={installedIds.has(role.id)}
                      busy={busyId === role.id}
                      onOpen={() => setOpenRole(role)}
                      onInstall={() => onInstall(role.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {!onPlugins && openRole && (
            <RoleDetail
              role={openRole}
              installed={installedIds.has(openRole.id)}
              busy={busyId === openRole.id}
              onBack={() => setOpenRole(undefined)}
              onInstall={() => onInstall(openRole.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** The install button, which is the same shape in three places. */
function installButton(
  { installed, busy, height, padding, radiusPx, onClick }: {
    installed: boolean;
    busy: boolean;
    height: number;
    padding: string;
    radiusPx: number;
    onClick: (event: React.MouseEvent) => void;
  },
): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || installed}
      style={{
        flex: '0 0 auto', height, padding, borderRadius: radiusPx,
        font: 'inherit', fontSize: text.small, fontWeight: 500,
        whiteSpace: 'nowrap', cursor: busy || installed ? 'default' : 'pointer',
        ...(installed
          ? {
            background: color.successFill,
            color: color.success,
            border: '1px solid rgba(26,133,71,.22)',
          }
          : { background: color.ink, color: color.paper, border: 'none' }),
        opacity: busy ? 0.6 : 1,
      }}
    >
      {installed ? 'Installed' : busy ? 'Adding…' : 'Install'}
    </button>
  );
}

function RoleCard(
  { role, installed, busy, onOpen, onInstall }: {
    role: PresetAgent;
    installed: boolean;
    busy: boolean;
    onOpen: () => void;
    onInstall: () => void;
  },
): JSX.Element {
  return (
    <div
      onClick={onOpen}
      role="presentation"
      style={{
        display: 'flex', flexDirection: 'column', gap: 18, padding: 24,
        background: color.paper, border: `1px solid ${line.hairline}`,
        borderRadius: radius.bubble, boxShadow: shadow.flat, cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* The orb it will wear once it is here, so the shelf and the
            sidebar agree with each other. */}
        <Orb agentId={role.id} size={48} mood={OrbMood.Still} />
        <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              fontSize: text.agentName, fontWeight: 500, letterSpacing: '-.008em',
              color: color.ink,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {role.nameEn}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            {role.skillIds.length > 0 && (
              <span style={{ fontSize: text.caption, color: color.muted }}>
                {role.skillIds.length} skills
              </span>
            )}
            {/* Every role in this list is ours. The canvas's blue word for
                that is "Official", and it means it came from us rather
                than from somebody's export. */}
            <span style={{ fontSize: text.caption, color: color.accent }}>Official</span>
          </span>
        </span>
        {installButton({
          installed, busy, height: 36, padding: '0 18px', radiusPx: radius.pill,
          onClick: event => { event.stopPropagation(); onInstall(); },
        })}
      </div>
      <div style={{ fontSize: text.message, color: color.muted, lineHeight: 1.55, textWrap: 'pretty' }}>
        {role.descriptionEn}
      </div>
    </div>
  );
}

function RoleDetail(
  { role, installed, busy, onBack, onInstall }: {
    role: PresetAgent;
    installed: boolean;
    busy: boolean;
    onBack: () => void;
    onInstall: () => void;
  },
): JSX.Element {
  const [tab, setTab] = useState<AgentTab>(AGENT_TABS[0].id);

  return (
    <div style={{ width: '100%', maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 36 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to agents"
          style={{
            width: 34, height: 34, flex: '0 0 auto', marginTop: 20, border: 'none',
            background: 'transparent', borderRadius: '50%', cursor: 'pointer',
            color: color.muted,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>

        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 22 }}>
            <Orb agentId={role.id} size={88} mood={OrbMood.Still} elevated />
            <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
              <div style={{ fontSize: text.detailTitle, fontWeight: 500, letterSpacing: tracking.detailTitle, lineHeight: 1.2, color: color.ink }}>
                {role.nameEn}
              </div>
              <div style={{ fontSize: text.message, color: color.muted }}>{roleMeta(role)}</div>
            </div>
            {installButton({
              installed, busy, height: 40, padding: '0 20px', radiusPx: radius.field,
              onClick: onInstall,
            })}
          </div>

          <div style={{ fontSize: text.agentName, color: color.ink, lineHeight: 1.6, maxWidth: '70ch', textWrap: 'pretty' }}>
            {role.descriptionEn}
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: line.hairline }} />

      <div style={{ display: 'grid', gridTemplateColumns: '240px minmax(0,1fr)', gap: 32, alignItems: 'start', paddingBottom: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {AGENT_TABS.map(one => {
            const on = one.id === tab;
            return (
              <button
                key={one.id}
                type="button"
                onClick={() => setTab(one.id)}
                aria-pressed={on}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start',
                  textAlign: 'left', padding: '16px 18px', borderRadius: radius.row,
                  cursor: 'pointer', font: 'inherit',
                  background: on ? color.fillStrong : 'transparent',
                  border: on ? `1px solid ${line.hairline}` : '1px solid transparent',
                }}
              >
                <span style={{ fontSize: text.emphasis, color: color.ink }}>{one.id}</span>
                <span style={{ fontSize: text.small, color: color.muted }}>{one.note}</span>
              </button>
            );
          })}
        </div>

        <div
          style={{
            minHeight: 280, padding: '28px 30px', borderRadius: radius.bubble,
            background: color.fillRaised, border: `1px solid ${line.hairline}`,
            display: 'flex', flexDirection: 'column', gap: 20,
          }}
        >
          <div style={{ fontSize: text.caption, color: color.muted }}>{tab}</div>
          <div style={{ fontSize: text.base, color: color.ink, lineHeight: 1.65, maxWidth: '62ch', textWrap: 'pretty' }}>
            {agentBody(role, tab)}
          </div>
          {tab === 'Skills' && role.skillIds.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, paddingTop: 4 }}>
              {role.skillIds.map(skill => (
                <span
                  key={skill}
                  style={{
                    height: 34, display: 'flex', alignItems: 'center', padding: '0 15px',
                    borderRadius: radius.pill, background: color.paper,
                    border: `1px solid ${line.hairline}`,
                    fontSize: text.small, color: color.ink,
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
