import { Orb, OrbMood } from '../orb/Orb';
import { Thread } from '../thread/Thread';
import type { AuthHandlers, ChoiceHandlers } from '../thread/ThreadItemView';
import type { ThreadItem } from '../thread/types';
import { color, line, radius, shadow, text, tracking } from '../tokens';
import { Composer } from './Composer';
import { Sidebar, type SidebarAgent } from './Sidebar';

export const ThreadMode = {
  Text: 'text',
  Voice: 'voice',
} as const;
export type ThreadMode = typeof ThreadMode[keyof typeof ThreadMode];

export interface MessagesShellProps {
  agents: readonly SidebarAgent[];
  activeId: string;
  activeName: string;
  items: readonly ThreadItem[];
  dayStamp?: string;
  typing?: boolean;
  mode: ThreadMode;
  accountName: string;
  choice: ChoiceHandlers;
  auth: AuthHandlers;
  onSelect: (agentId: string) => void;
  onSend: (message: string) => void;
  onCompose: () => void;
  onApps: () => void;
  onAccount: () => void;
  onMode: (mode: ThreadMode) => void;
  /** The computer icon: opens the panel where you watch the agent work. */
  onOpenPanel: () => void;
  onPlus?: () => void;
}

/**
 * The whole app: a list of agents, and a conversation.
 *
 * 300px of sidebar and everything else. No tabs, no dashboard, no
 * session tree — the navigation is the conversation list, exactly as
 * Messages does it.
 *
 * The ground carries a 34px grid at 1.8% opacity. It is almost invisible
 * and it is the reason the app does not read as a flat sheet of white.
 */
export function MessagesShell(props: MessagesShellProps): JSX.Element {
  const {
    agents, activeId, activeName, items, dayStamp, typing, mode, accountName,
    choice, auth, onSelect, onSend, onCompose, onApps, onAccount, onMode,
    onOpenPanel, onPlus,
  } = props;

  const tab = (label: string, value: ThreadMode): JSX.Element => {
    const on = mode === value;
    return (
      <button
        type="button"
        onClick={() => onMode(value)}
        aria-pressed={on}
        style={{
          height: 30, padding: '0 18px', borderRadius: radius.pill, cursor: 'pointer',
          font: 'inherit', fontSize: 13.5, letterSpacing: tracking.body,
          background: on ? color.paper : 'transparent',
          color: on ? color.accent : color.muted,
          fontWeight: on ? 500 : 400,
          border: on ? '1px solid rgba(255,255,255,.7)' : '1px solid transparent',
          boxShadow: on ? shadow.raised : 'none',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      style={{
        position: 'relative', height: '100vh', boxSizing: 'border-box',
        overflow: 'hidden', color: color.ink,
      }}
    >
      <div
        style={{
          display: 'grid', gridTemplateColumns: '300px minmax(0,1fr)',
          height: '100%', minHeight: 0, overflow: 'hidden',
          background: color.paper,
          backgroundImage:
            `linear-gradient(${line.grid} 1px, transparent 1px), linear-gradient(90deg, ${line.grid} 1px, transparent 1px)`,
          backgroundSize: '34px 34px',
          backgroundPosition: '-1px -1px',
        }}
      >
        <Sidebar
          agents={agents}
          activeId={activeId}
          onSelect={onSelect}
          onCompose={onCompose}
          onApps={onApps}
          accountName={accountName}
          onAccount={onAccount}
        />

        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <div
            style={{
              position: 'relative', display: 'flex', alignItems: 'center', gap: 11,
              padding: '16px 24px', borderBottom: `1px solid ${line.hairline}`,
              background: 'rgba(250,251,252,.92)', backdropFilter: 'blur(20px)',
            }}
          >
            <Orb agentId={activeId} size={28} mood={OrbMood.Idle} />
            <span style={{ fontSize: text.base, fontWeight: 500, letterSpacing: tracking.title }}>
              {activeName}
            </span>
            {typing && <span style={{ fontSize: text.caption, color: color.muted }}>typing</span>}

            <div
              style={{
                position: 'absolute', left: '50%', transform: 'translateX(-50%)',
                display: 'flex', alignItems: 'center', padding: 3,
                borderRadius: radius.pill, background: 'rgba(241,243,246,.72)',
                backdropFilter: 'blur(20px) saturate(1.4)',
                border: '1px solid rgba(255,255,255,.6)',
                boxShadow: `${shadow.raised}, ${shadow.glassInset}`,
              }}
            >
              {tab('Text', ThreadMode.Text)}
              {tab('Voice', ThreadMode.Voice)}
            </div>

            {/*
              The computer icon. Behind it is the whole of the panel the
              app inherits — the agent's live browser, the files it has
              made, what it delegated, what you gave it. One icon, because
              the design says so; everything behind it, because throwing
              that away would be the most expensive thing in the app.
            */}
            <button
              type="button"
              onClick={onOpenPanel}
              aria-label="Watch the agent work"
              style={{
                marginLeft: 'auto', width: 34, height: 34, borderRadius: radius.small,
                border: '1px solid transparent', background: 'transparent',
                cursor: 'pointer', color: color.muted, fontSize: 15,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              🖵
            </button>
          </div>

          <Thread
            items={items}
            agentId={activeId}
            dayStamp={dayStamp}
            typing={typing}
            choice={choice}
            auth={auth}
          />

          {mode === ThreadMode.Voice && (
            <div style={{ flex: '0 0 auto', padding: '10px 24px 4px', display: 'flex', justifyContent: 'center' }}>
              <Orb
                agentId={activeId}
                size={104}
                mood={typing ? OrbMood.Speaking : OrbMood.Idle}
                elevated
                label={`${activeName} is listening`}
              />
            </div>
          )}

          <Composer
            placeholder={`Message ${activeName}`}
            onSend={onSend}
            onPlus={onPlus}
          />
        </div>
      </div>
    </div>
  );
}
