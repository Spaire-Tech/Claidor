import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { avatarFallback } from '../../../shared/agent/avatars';
import { CloseIcon, ComputerIcon, SearchIcon, ShareIcon } from '../icons';
import { CloudBlob } from '../orb/CloudBlob';
import { replyQuote } from '../thread/actions';
import { findInThread, matchLabel, stepMatch } from '../thread/search';
import { rowsWhileLanding, type RowText } from '../thread/stagger';
import { Thread } from '../thread/Thread';
import type {
  AuthHandlers,
  ChoiceHandlers,
  PartHandlers,
  SecretHandlers,
} from '../thread/ThreadItemView';
import type { ThreadItem } from '../thread/types';
import { useReactions } from '../thread/useReactions';
import { useStaggered } from '../thread/useStaggered';
import { color, font, glass, line, motion, radius, shadow, text, tracking } from '../tokens';
import { type AgentDraftSubmit, Compose } from './Compose';
import { Composer } from './Composer';
import { PanelMode, PanelWant, shellLayout, titleBarInset, useWindowWidth } from './layout';
import { Sidebar, type SidebarAgent } from './Sidebar';
import type { DictationHandle } from './useDictation';

export const ThreadMode = {
  Text: 'text',
  Voice: 'voice',
} as const;
export type ThreadMode = typeof ThreadMode[keyof typeof ThreadMode];

export interface MessagesShellProps {
  agents: readonly SidebarAgent[];
  activeId: string;
  activeName: string;
  /** The open agent's face, 0–24. Falls back to a stable one from the id. */
  activeAvatar?: number;
  /** Every face on an agent, for the create screen's roll. */
  wornAvatars?: readonly number[];
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
  /** The sidebar's trash icon: opens the agent panel with the question asked. */
  onAskDelete?: (id: string) => void;
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
  /**
   * The agent panel — the third column from the 15 September canvas —
   * when open. Takes the panel slot; the computer panel and this are
   * never open together.
   */
  agentPanel?: React.ReactNode;
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
  /** The composer's microphone; see `useDictation`. */
  dictation?: DictationHandle;
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
    choice, auth, parts, secret, onSelect, onAskDelete, onSend, onCompose, onApps, apps, onAccount, onMode,
    onOpenPanel, onTeach, dictation, onShareTemplate, onOpenAgent, agentDetail, agentPanel, settings,
    composing, onCloseCompose, onPickAgent, onCreateAgent, accountMenu, panel, wornAvatars,
  } = props;
  const activeAvatar = props.activeAvatar ?? avatarFallback(activeId);

  // How the window is divided right now. Re-read on every resize, which
  // is the piece that was missing: the old columns stretched but never
  // reconsidered, so leaving full screen changed nothing but the numbers.
  const width = useWindowWidth();
  const wanted = agentPanel ? PanelWant.Agent : panel ? PanelWant.Computer : PanelWant.None;
  const layout = useMemo(() => shellLayout(width, wanted), [width, wanted]);
  const inset = titleBarInset(window.electron?.platform);

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
  // a second apart rather than all in one frame; history is never replayed.
  // This lives here rather than inside the thread because the header is
  // what says "typing", and it has to keep saying it while bubbles are
  // still landing — otherwise the word blinks off mid-reply.
  const staged = useStaggered(shown, activeId);

  // "typing" is a text-mode word, and in voice the orb is already
  // pulsing to say the same thing. The canvas draws the same line:
  // `typing: s.typing && s.mode === "text"`.
  const landing = staged.length < shown.length;
  const saysTyping = (Boolean(typing) || landing) && mode === ThreadMode.Text;

  // The row under the open agent's name waits for the last bubble too.
  // What it said the last time nothing was held is remembered here, and
  // shown again while bubbles are landing; see `rowsWhileLanding`.
  const settled = useRef<{ id: string } & RowText>();
  const activeRow = agents.find(agent => agent.id === activeId);
  if (!landing && activeRow) {
    settled.current = { id: activeId, preview: activeRow.preview, when: activeRow.when };
  }
  const rows = rowsWhileLanding(
    agents,
    activeId,
    landing,
    settled.current?.id === activeId ? settled.current : undefined,
  );

  // The hover cluster beside a bubble: reactions kept per conversation,
  // and Reply, which puts the message's first line into the composer in
  // quotes. The canvas's `reply: () => this.setState({ draft: … })`.
  const { reactions, onReact } = useReactions(activeId);
  const [replySeed, setReplySeed] = useState<{ text: string; at: number }>();
  const onReply = useCallback((_itemId: string, messageText: string) => {
    setReplySeed({ text: replyQuote(messageText), at: Date.now() });
  }, []);

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
          height: 28, padding: '0 15px', borderRadius: radius.pill, cursor: 'pointer',
          font: 'inherit', fontSize: text.label, letterSpacing: tracking.body,
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
        // The face, set here and inherited by everything below — the
        // sheets and menus included, since they are rendered inside this
        // root. The weight is said too: upstream's stylesheet puts 445 on
        // the document, and with two static weights a browser rounds 445
        // up to Medium, which would set the whole app in bold.
        fontFamily: font.ui, fontWeight: 400,
      }}
    >
      <div
        style={{
          display: 'grid', gridTemplateColumns: `${layout.sidebarWidth}px minmax(0,1fr)`,
          height: '100%', minHeight: 0, overflow: 'hidden',
          background: color.paper,
          backgroundImage:
            `linear-gradient(${line.grid} 1px, transparent 1px), linear-gradient(90deg, ${line.grid} 1px, transparent 1px)`,
          backgroundSize: '34px 34px',
          backgroundPosition: '-1px -1px',
        }}
      >
        <Sidebar
          agents={rows}
          activeId={activeId}
          onSelect={onSelect}
          {...(onAskDelete ? { onAskDelete } : {})}
          onCompose={onCompose}
          onApps={onApps}
          accountName={accountName}
          onAccount={onAccount}
          accountMenu={accountMenu}
          mode={layout.sidebar}
          topInset={inset}
        />

        {composing && onCloseCompose && onPickAgent && onCreateAgent ? (
          <Compose
            agents={agents}
            onPick={onPickAgent}
            onCreate={onCreateAgent}
            onClose={onCloseCompose}
            {...(wornAvatars ? { wornAvatars } : {})}
          />
        ) : (
        <div
          style={{
            display: 'grid',
            // Two columns only when the panel has earned one. A panel that
            // cannot have `PANEL_MIN` without taking the thread below
            // `THREAD_MIN` is drawn over the conversation instead, which is
            // the difference between a narrow window and a broken one.
            gridTemplateColumns: layout.panel === PanelMode.Split
              ? `minmax(0,1fr) ${layout.panelWidth}px`
              : 'minmax(0,1fr)',
            position: 'relative',
            minWidth: 0, minHeight: 0, overflow: 'hidden',
          }}
        >
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <div
            style={{
              position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
              padding: `${14 + inset}px 21px 14px`,
              borderBottom: `1px solid ${line.hairline}`,
              background: 'rgba(250,251,252,.92)', backdropFilter: 'blur(20px)',
              // The other half of the window you can pick up. Controls
              // inside set `no-drag` for themselves.
              WebkitAppRegion: 'drag',
            } as React.CSSProperties}
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
                display: 'flex', alignItems: 'center', gap: 10, padding: '2px 8px 2px 2px',
                margin: 0, border: '1px solid transparent', borderRadius: radius.pill,
                background: 'transparent', font: 'inherit', color: 'inherit',
                cursor: onOpenAgent ? 'pointer' : 'default',
              }}
            >
              <CloudBlob avatar={activeAvatar} size={26} />
              <span style={{ fontSize: text.base, fontWeight: 500, letterSpacing: tracking.title }}>
                {activeName}
              </span>
            </button>
            {/*
              Three small dots, from the 15 September canvas, in place of
              the word "typing". The thread carries the same dots at full
              size beside the agent's face; this is the same thing seen
              from the header.
            */}
            {saysTyping && (
              <span aria-label="Working" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {[0, 0.16, 0.32].map(delay => (
                  <span
                    key={delay}
                    style={{
                      width: 4.5, height: 4.5, borderRadius: '50%', background: color.muted,
                      animation: `fsr-think-dot 1.2s ease-in-out ${delay}s infinite`,
                    }}
                  />
                ))}
              </span>
            )}

            <div
              style={{
                position: 'absolute', left: '50%', transform: 'translateX(-50%)',
                display: 'flex', alignItems: 'center', padding: 2,
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
                marginLeft: 'auto', width: 31, height: 31, borderRadius: radius.pill,
                border: '1px solid transparent', background: 'transparent',
                cursor: 'pointer', color: color.muted,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <SearchIcon size={15} />
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
                      position: 'absolute', right: 0, top: 42, zIndex: 40, padding: 6,
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
                        display: 'flex', alignItems: 'center', height: 41, padding: '0 14px',
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
                    width: 31, height: 31, borderRadius: radius.pill,
                    border: '1px solid transparent', background: 'transparent',
                    cursor: 'pointer', color: color.muted,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <ShareIcon size={15} />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={onOpenPanel}
              aria-label="Watch the agent work"
              style={{
                width: 31, height: 31, borderRadius: radius.pill,
                border: '1px solid transparent', background: 'transparent',
                cursor: 'pointer', color: color.muted,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <ComputerIcon size={15} />
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
            actions={{ reactions, onReact, onReply }}
            typing={saysTyping ? { avatar: activeAvatar } : undefined}
          />

          {mode === ThreadMode.Voice && (
            <div style={{ flex: '0 0 auto', padding: '9px 21px 3px', display: 'flex', justifyContent: 'center' }}>
              <span
                style={{
                  display: 'block',
                  animation: typing
                    ? `fsr-orb-speak ${motion.orbSpeak.duration} ${motion.orbSpeak.easing} infinite`
                    : `fsr-orb-idle ${motion.orbIdle.duration} ${motion.orbIdle.easing} infinite`,
                }}
              >
                <CloudBlob avatar={activeAvatar} size={96} label={`${activeName} is listening`} />
              </span>
            </div>
          )}

          <Composer
            placeholder={`Message ${activeName}`}
            onSend={onSend}
            {...(onTeach ? { onTeach } : {})}
            {...(replySeed ? { seed: replySeed } : {})}
            {...(dictation ? { dictation } : {})}
          />
        </div>
        {layout.panel === PanelMode.Split && (agentPanel ?? panel)}
        {layout.panel === PanelMode.Cover && (
          // Over the conversation, filling it. Not a third column squeezed
          // to nothing, and not a button that quietly refuses.
          <div
            style={{
              position: 'absolute', inset: 0, zIndex: 40,
              display: 'flex', flexDirection: 'column',
              minWidth: 0, minHeight: 0, background: color.paper,
            }}
          >
            {agentPanel ?? panel}
          </div>
        )}
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
        flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 9,
        padding: '9px 21px', borderBottom: `1px solid ${line.hairline}`,
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
