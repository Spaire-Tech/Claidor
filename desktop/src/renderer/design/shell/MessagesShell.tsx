import { useEffect, useMemo, useRef, useState } from 'react';

import { CloseIcon, ComputerIcon, SearchIcon, ShareIcon } from '../icons';
import { Orb, OrbMood } from '../orb/Orb';
import { findInThread, matchLabel, stepMatch } from '../thread/search';
import { Thread } from '../thread/Thread';
import type {
  AuthHandlers,
  ChoiceHandlers,
  PartHandlers,
  SecretHandlers,
} from '../thread/ThreadItemView';
import type { ThreadItem } from '../thread/types';
import { useStaggered } from '../thread/useStaggered';
import { color, glass, line, motion, radius, shadow, text, tracking } from '../tokens';
import { type AgentDraftSubmit, Compose } from './Compose';
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
  /** What a card asking for something typed can do with the answer. */
  secret?: SecretHandlers;
  dayStamp?: string;
  typing?: boolean;
  mode: ThreadMode;
  accountName: string;
  choice: ChoiceHandlers;
  auth: AuthHandlers;
  /** What a file or a link named in a message can do. */
  parts?: PartHandlers;
  onSelect: (agentId: string) => void;
  onSend: (message: string) => void;
  onCompose: () => void;
  /** Compose has taken over the conversation pane. */
  composing?: boolean;
  onCloseCompose?: () => void;
  onPickAgent?: (agentId: string) => void;
  onCreateAgent?: (draft: AgentDraftSubmit) => void;
  onApps: () => void;
  /** The roles list, when open. Lies over the whole app, sidebar included. */
  apps?: React.ReactNode;
  /** Tapping the name at the top of the conversation. */
  onOpenAgent?: () => void;
  /** The agent's five tabs, when open. Over everything, like `apps`. */
  agentDetail?: React.ReactNode;
  /** Settings, when open. Over everything, like `apps`. */
  settings?: React.ReactNode;
  onAccount: () => void;
  /** Rendered inside the sidebar's footer when the account menu is open. */
  accountMenu?: React.ReactNode;
  onMode: (mode: ThreadMode) => void;
  /** The computer icon: opens the panel where you watch the agent work. */
  onOpenPanel: () => void;
  /** The panel itself, when open. Splits the conversation pane. */
  panel?: React.ReactNode;
  /** "Teach a task" in the composer's `+` menu. */
  onTeach?: () => void;
  /** "Share as template", behind the share button in the header. */
  onShareTemplate?: () => void;
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
    choice, auth, parts, secret, onSelect, onSend, onCompose, onApps, apps, onAccount, onMode,
    onOpenPanel, onTeach, onShareTemplate, onOpenAgent, agentDetail, settings,
    composing, onCloseCompose, onPickAgent, onCreateAgent, accountMenu, panel,
  } = props;

  // Finding something in this conversation. Closed, it costs nothing;
  // open, the thread shows only what matched, which is the cheapest
  // honest answer to "where did they say that".
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const found = useMemo(() => findInThread(items, query), [items, query]);
  const shown = useMemo(
    () => (finding && query.trim() ? items.filter(item => found.ids.includes(item.id)) : items),
    [finding, query, items, found],
  );

  // "The text come like texts. not ai." A reply's later bubbles arrive
  // 420ms apart rather than all in one frame; history is never replayed.
  // This lives here rather than inside the thread because the header is
  // what says "typing", and it has to keep saying it while bubbles are
  // still landing — otherwise the word blinks off mid-reply.
  const staged = useStaggered(shown);

  // "typing" is a text-mode word, and in voice the orb is already
  // pulsing to say the same thing. The canvas draws the same line:
  // `typing: s.typing && s.mode === "text"`.
  const saysTyping = (Boolean(typing) || staged.length < shown.length)
    && mode === ThreadMode.Text;

  // The share popover. Escape and a click elsewhere close it, like every
  // other menu in the app.
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!shareOpen) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setShareOpen(false);
    };
    const onDown = (event: MouseEvent): void => {
      if (!shareRef.current?.contains(event.target as Node)) setShareOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const timer = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.clearTimeout(timer);
    };
  }, [shareOpen]);

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
          accountMenu={accountMenu}
        />

        {composing && onCloseCompose && onPickAgent && onCreateAgent ? (
          <Compose
            agents={agents}
            onPick={onPickAgent}
            onCreate={onCreateAgent}
            onClose={onCloseCompose}
          />
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: panel ? 'minmax(0,1fr) minmax(360px, 44%)' : 'minmax(0,1fr)', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <div
            style={{
              position: 'relative', display: 'flex', alignItems: 'center', gap: 11,
              padding: '16px 24px', borderBottom: `1px solid ${line.hairline}`,
              background: 'rgba(250,251,252,.92)', backdropFilter: 'blur(20px)',
            }}
          >
            {/*
              The name at the top opens the agent, which is the gesture
              Messages already teaches: the person you are talking to is
              up here, and tapping them tells you about them. A button
              rather than a click handler on a span, so it is reachable
              from the keyboard like everything else in the header.
            */}
            <button
              type="button"
              onClick={onOpenAgent}
              disabled={!onOpenAgent}
              aria-label={onOpenAgent ? `About ${activeName}` : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '2px 8px 2px 2px',
                margin: 0, border: '1px solid transparent', borderRadius: radius.pill,
                background: 'transparent', font: 'inherit', color: 'inherit',
                cursor: onOpenAgent ? 'pointer' : 'default',
              }}
            >
              <Orb agentId={activeId} size={28} mood={OrbMood.Idle} />
              <span style={{ fontSize: text.base, fontWeight: 500, letterSpacing: tracking.title }}>
                {activeName}
              </span>
            </button>
            {saysTyping && <span style={{ fontSize: text.caption, color: color.muted }}>typing</span>}

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
              onClick={() => { setFinding(true); }}
              aria-label="Find in this conversation"
              style={{
                marginLeft: 'auto', width: 34, height: 34, borderRadius: radius.small,
                border: '1px solid transparent', background: 'transparent',
                cursor: 'pointer', color: color.muted,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <SearchIcon size={16} />
            </button>

            {/*
              Share. The canvas puts it between the search and the
              computer, with one row behind it, and it was simply not
              built. The row is only offered when something can actually
              be shared — an empty conversation has no agent worth
              passing on yet.
            */}
            {onShareTemplate && (
              <span ref={shareRef} style={{ position: 'relative', display: 'flex' }}>
                {shareOpen && (
                  <div
                    role="menu"
                    style={{
                      position: 'absolute', right: 0, top: 42, zIndex: 40, padding: 8,
                      borderRadius: radius.card, background: glass.background,
                      backdropFilter: glass.blur, border: `1px solid ${glass.border}`,
                      boxShadow: `${shadow.popover}, ${shadow.glassInset}`,
                      animation: `fsr-message-in ${motion.messageIn.duration} ${motion.messageIn.easing} both`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => { setShareOpen(false); onShareTemplate(); }}
                      style={{
                        display: 'flex', alignItems: 'center', height: 44, padding: '0 16px',
                        border: 'none', background: 'transparent', borderRadius: radius.input,
                        cursor: 'pointer', font: 'inherit', fontSize: text.body,
                        color: color.ink, whiteSpace: 'nowrap',
                      }}
                    >
                      Share as template
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShareOpen(open => !open)}
                  aria-label="Share this conversation"
                  aria-expanded={shareOpen}
                  style={{
                    width: 34, height: 34, borderRadius: radius.small,
                    border: '1px solid transparent', background: 'transparent',
                    cursor: 'pointer', color: color.muted,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <ShareIcon size={16} />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={onOpenPanel}
              aria-label="Watch the agent work"
              style={{
                width: 34, height: 34, borderRadius: radius.small,
                border: '1px solid transparent', background: 'transparent',
                cursor: 'pointer', color: color.muted,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <ComputerIcon size={17} />
            </button>
          </div>

          {finding && (
            <FindBar
              query={query}
              label={matchLabel(query, found.count, at)}
              onQuery={value => { setQuery(value); setAt(0); }}
              onStep={by => setAt(current => stepMatch(found.count, current, by))}
              onClose={() => { setFinding(false); setQuery(''); setAt(0); }}
            />
          )}

          <Thread
            items={staged}
            dayStamp={dayStamp}
            choice={choice}
            auth={auth}
            {...(secret ? { secret } : {})}
            {...(parts ? { parts } : {})}
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
            {...(onTeach ? { onTeach } : {})}
          />
        </div>
        {panel}
        </div>
        )}
      </div>
      {/*
        Outside the grid, over all of it. A modal that covered only the
        conversation would leave the sidebar live behind it, and clicking
        an agent through the scrim would change what you came back to.
      */}
      {apps}
      {agentDetail}
      {settings}
    </div>
  );
}

interface FindBarProps {
  query: string;
  label: string;
  onQuery: (value: string) => void;
  onStep: (by: 1 | -1) => void;
  onClose: () => void;
}

/**
 * The find bar, under the header.
 *
 * A strip rather than a floating box, because it belongs to this
 * conversation and moving it would suggest otherwise. Enter walks
 * forward, Shift+Enter back, Escape closes — the three keys somebody
 * already expects from every find bar they have used.
 */
function FindBar({ query, label, onQuery, onStep, onClose }: FindBarProps): JSX.Element {
  return (
    <div
      style={{
        flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 24px', borderBottom: `1px solid ${line.hairline}`,
        background: color.fill,
      }}
    >
      <SearchIcon size={14} style={{ color: color.muted }} />
      <input
        autoFocus
        value={query}
        onChange={event => onQuery(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Escape') { onClose(); return; }
          if (event.key === 'Enter') {
            event.preventDefault();
            onStep(event.shiftKey ? -1 : 1);
          }
        }}
        placeholder="Find in this conversation"
        aria-label="Find in this conversation"
        style={{
          flex: '1 1 auto', minWidth: 0, border: 'none', outline: 'none',
          background: 'transparent', font: 'inherit',
          fontSize: text.body, color: color.ink,
        }}
      />
      {label && (
        <span style={{ flex: '0 0 auto', fontSize: text.small, color: color.muted }}>{label}</span>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close find"
        style={{
          width: 26, height: 26, border: 'none', background: 'transparent',
          cursor: 'pointer', color: color.muted, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <CloseIcon size={12} />
      </button>
    </div>
  );
}
