import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { avatarFallback } from '../../../shared/agent/avatars';
import { ChevronRightIcon, CloseIcon, ComputerIcon, SearchIcon, ShareIcon } from '../icons';
import { CloudBlob } from '../orb/CloudBlob';
import { replyQuote } from '../thread/actions';
import { findInThread, matchLabel, stepMatch } from '../thread/search';
import { rowsWhileLanding, type RowText } from '../thread/stagger';
import { Thread } from '../thread/Thread';
import type {
  AuthHandlers,
  ChoiceHandlers,
  ConnectorHandlers,
  PartHandlers,
  RosterHandlers,
  SecretHandlers,
} from '../thread/ThreadItemView';
import type { ThreadItem } from '../thread/types';
import { useReactions } from '../thread/useReactions';
import { useStaggered } from '../thread/useStaggered';
import { color, font, line, motion, radius, shadow, text, tracking } from '../tokens';
import { type AgentDraftSubmit, Compose } from './Compose';
import { Composer } from './Composer';
import { Dock, DockItem } from './Dock';
import {
  FRAME_GAP,
  FRAME_PAD_X,
  FRAME_PAD_Y,
  frameWindowWidth,
  PanelMode,
  PanelWant,
  shellLayout,
  useWindowWidth,
  WINDOW_MAX_HEIGHT,
  WINDOW_MAX_WIDTH,
} from './layout';
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
  /** What the roster card ("Your starter team") can answer with. */
  roster?: RosterHandlers;
  /** Install or Not now on a connector card an agent raised. */
  connector?: ConnectorHandlers;
  dayStamp?: string;
  typing?: boolean;
  /**
   * A card is waiting on the person. The header says so instead of
   * showing the dots, and the thread draws no typing bubble: nothing is
   * happening until they answer (`caisra-chat-ui-logic.md` §3, "Waiting
   * for you").
   */
  waiting?: boolean;
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
  /** The roles list, when open. Fills the conversation pane. */
  apps?: React.ReactNode;
  /** Tapping the name at the top of the conversation. */
  onOpenAgent?: () => void;
  /** The agent's five tabs, when open. Fills the pane, like `apps`. */
  agentDetail?: React.ReactNode;
  /**
   * The agent panel — the third column from the 15 September canvas —
   * when open. Takes the panel slot; the computer panel and this are
   * never open together.
   */
  agentPanel?: React.ReactNode;
  /** Settings, when open. Takes the whole window, like every screen. */
  settings?: React.ReactNode;
  /**
   * Back to the conversation, from any screen.
   *
   * The parent closes everything it has open. One handler for all of
   * them on purpose: back means the chat, never the screen before, so
   * there is no history for anybody to keep.
   */
  onBackToChat?: () => void;
  onAccount: () => void;
  /** Rendered beside the dock's last button when the account menu is open. */
  accountMenu?: React.ReactNode;
  onMode: (mode: ThreadMode) => void;
  /** The computer icon: opens the panel where you watch the agent work. */
  onOpenPanel: () => void;
  /** The panel itself, when open. Splits the window or covers the pane. */
  panel?: React.ReactNode;
  /** "Teach a task" in the composer's `+` menu. */
  onTeach?: () => void;
  /** The composer's microphone; see `useDictation`. */
  dictation?: DictationHandle;
  /** "Share as template", behind the share button in the header. */
  onShareTemplate?: () => void;
}

/**
 * The whole app, as the 17 September canvas draws it: a pale ground, a
 * glass dock, and a rounded window floating beside it.
 *
 * Inside the window the shape is the one from before: a list of agents,
 * and a conversation. No tabs, no dashboard, no session tree — the
 * navigation is the conversation list, exactly as Messages does it. What
 * the dock took from the sidebar is its "+", Apps and the account row.
 *
 * **Nothing opens inside another box.** Settings, Apps and an agent's
 * page fill the conversation pane edge to edge. A menu floats beside
 * what opened it. The only things that sit in a box are the things the
 * canvas draws in one: a list in a card, a form in a card.
 *
 * **The window has no title bar.** The ground is the handle: the whole
 * of it drags the window, and the dock and the window opt out so their
 * controls stay controls.
 */
export function MessagesShell(props: MessagesShellProps): JSX.Element {
  const {
    agents, activeId, activeName, items, dayStamp, typing, mode, accountName,
    choice, auth, parts, secret, roster, connector, onSelect, onAskDelete, onSend, onCompose, onApps, apps, onAccount, onMode, waiting,
    onOpenPanel, onTeach, dictation, onShareTemplate, onOpenAgent, agentDetail, agentPanel, settings, onBackToChat,
    composing, onCloseCompose, onPickAgent, onCreateAgent, accountMenu, panel, wornAvatars,
  } = props;
  const activeAvatar = props.activeAvatar ?? avatarFallback(activeId);

  // How the window is divided right now. Re-read on every resize, and
  // decided on the window's width, not the display's: the frame around
  // it is fixed, so the window is what gets narrower.
  const viewport = useWindowWidth();
  const windowWidth = frameWindowWidth(viewport);
  const wanted = agentPanel ? PanelWant.Agent : panel ? PanelWant.Computer : PanelWant.None;
  const layout = useMemo(() => shellLayout(windowWidth, wanted), [windowWidth, wanted]);

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

  // Which dock button is lit: what fills the pane, or the menu that is
  // open, else Home. Settings is reached from the account menu and lights
  // nothing, as in the canvas.
  const dockActive = accountMenu ? DockItem.You
    : apps ? DockItem.Apps
      : composing ? DockItem.Create
        : DockItem.Home;

  // The canvas's `tabStyle`: 34 high, 84 wide at least, the lit one white
  // with the accent for a label and a soft ring under it.
  const tab = (label: string, value: ThreadMode): JSX.Element => {
    const on = mode === value;
    return (
      <button
        type="button"
        onClick={() => onMode(value)}
        aria-pressed={on}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 34, minWidth: 84, padding: '0 20px', borderRadius: radius.pill, cursor: 'pointer',
          border: 'none', font: 'inherit', fontSize: text.body, letterSpacing: tracking.body, whiteSpace: 'nowrap',
          background: on ? color.paper : 'transparent',
          color: on ? color.accent : color.tabInk,
          fontWeight: on ? 500 : 400,
          boxShadow: on ? shadow.raised : 'none',
          transition: 'background .2s ease, color .2s ease',
        }}
      >
        {label}
      </button>
    );
  };

  // The canvas's 27px round header buttons: nothing at rest, the fill
  // and a hairline under the pointer.
  const headerButton = (
    label: string,
    onClick: (() => void) | undefined,
    glyph: JSX.Element,
    extra?: { 'aria-expanded'?: boolean },
  ): JSX.Element => (
    <HoverButton label={label} onClick={onClick} {...extra}>{glyph}</HoverButton>
  );

  // Exactly one screen, or none. Settings first, then an agent's page,
  // then Apps, then Create: the order only decides what wins if a parent
  // ever leaves two open, and the parent's own state is what normally
  // makes that impossible.
  const screen = settings
    ? { label: 'Settings', node: settings }
    : agentDetail
      ? { label: activeName, node: agentDetail }
      : apps
        ? { label: 'Apps', node: apps }
        : composing && onCloseCompose && onPickAgent && onCreateAgent
          ? {
            label: 'New message',
            node: (
              <Compose
                agents={agents}
                onPick={onPickAgent}
                onCreate={onCreateAgent}
                onClose={onCloseCompose}
                {...(wornAvatars ? { wornAvatars } : {})}
              />
            ),
          }
          : undefined;

  // Back is always the conversation. The parent closes whatever is open;
  // `onBackToChat` is the one handler for all of them, so a screen never
  // has to know which screen came before it.
  const backToChat = useCallback(() => {
    if (onBackToChat) { onBackToChat(); return; }
    // No parent handler (the harness, and older callers): close what we
    // can reach ourselves rather than trapping somebody on a screen.
    if (composing) onCloseCompose?.();
  }, [onBackToChat, composing, onCloseCompose]);

  const columns = [
    `${layout.sidebarWidth}px`,
    'minmax(0,1fr)',
    ...(layout.panel === PanelMode.Split ? [`${layout.panelWidth}px`] : []),
  ].join(' ');

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
        WebkitFontSmoothing: 'antialiased',
        // The ground: the canvas's flat colour with a white light at the
        // top left and a cooler one at the bottom right.
        background: color.ground,
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, zIndex: 0,
          background: 'radial-gradient(75% 60% at 26% 8%, #ffffff 0%, rgba(255,255,255,0) 68%), radial-gradient(70% 60% at 82% 88%, #e6ebf4 0%, rgba(230,235,244,0) 66%)',
        }}
      />

      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: FRAME_GAP, padding: `${FRAME_PAD_Y}px ${FRAME_PAD_X}px`, boxSizing: 'border-box',
        }}
      >
        <Dock
          active={dockActive}
          accountName={accountName}
          onHome={backToChat}
          onCreate={onCompose}
          onApps={onApps}
          onYou={onAccount}
          // Never over a screen: it used to open inside the Settings tab,
          // a menu floating on top of a page that had nothing to do with
          // it (the founder, 18 September: "account drop right opens
          // inside the setting tab").
          {...(screen ? {} : { accountMenu })}
        />

        <div
          data-window
          style={{
            position: 'relative',
            flex: '1 1 auto', minWidth: 0, maxWidth: WINDOW_MAX_WIDTH,
            height: '100%', maxHeight: WINDOW_MAX_HEIGHT,
            display: 'grid', gridTemplateColumns: columns,
            minHeight: 0, overflow: 'hidden',
            borderRadius: radius.window, background: color.window,
            border: `1px solid ${line.field}`, boxShadow: shadow.window,
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
        >
          <Sidebar
            agents={rows}
            activeId={activeId}
            onSelect={onSelect}
            {...(onAskDelete ? { onAskDelete } : {})}
            mode={layout.sidebar}
          />

          <div
            data-pane
            style={{
              position: 'relative', display: 'flex', flexDirection: 'column',
              minWidth: 0, minHeight: 0, margin: '8px 8px 8px 0',
              borderRadius: radius.pane, overflow: 'hidden', background: color.paper,
            }}
          >
            <>
                <div
                  style={{
                    position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '20px 21px 14px',
                    borderBottom: `1px solid ${line.hairline}`,
                    background: 'transparent',
                  }}
                >
                  <CloudBlob avatar={activeAvatar} size={23} />
                  {/*
                    The name at the top opens the agent, which is the gesture
                    Messages already teaches: the person you are talking to is
                    up here, and tapping them tells you about them. A button
                    rather than a click handler on a span, so it is reachable
                    from the keyboard like everything else in the header.
                  */}
                  <NameButton name={activeName} onClick={onOpenAgent} />
                  {/*
                    Three small dots, from the 15 September canvas, in place of
                    the word "typing". The thread carries the same dots at full
                    size beside the agent's face; this is the same thing seen
                    from the header.
                  */}
                  {waiting && (
                    <span style={{ fontSize: text.caption, color: color.muted, letterSpacing: tracking.body }}>
                      Waiting for you
                    </span>
                  )}
                  {saysTyping && !waiting && (
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
                      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 4,
                      display: 'flex', alignItems: 'center', padding: 0,
                      borderRadius: radius.pill, background: color.window, border: 'none',
                    }}
                  >
                    {tab('Text', ThreadMode.Text)}
                    {tab('Voice', ThreadMode.Voice)}
                  </div>

                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {headerButton('Find in this conversation', () => { setFinding(true); }, <SearchIcon size={15} />)}

                    {/*
                      Share. The canvas puts it between the search and the
                      computer, with one row behind it. The row is only offered
                      when something can actually be shared — an empty
                      conversation has no agent worth passing on yet.
                    */}
                    {onShareTemplate && (
                      <span ref={shareRef} style={{ position: 'relative', display: 'flex' }}>
                        {shareOpen && (
                          <div
                            role="menu"
                            style={{
                              position: 'absolute', right: 0, top: 42, zIndex: 40, padding: 6,
                              borderRadius: radius.card, background: color.paper,
                              border: `1px solid ${line.field}`, boxShadow: shadow.popover,
                              animation: `fsr-message-in ${motion.messageIn.duration} ${motion.messageIn.easing} both`,
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => { setShareOpen(false); onShareTemplate(); }}
                              style={{
                                display: 'flex', alignItems: 'center', height: 36, padding: '0 12px',
                                border: 'none', background: 'transparent', borderRadius: radius.input,
                                cursor: 'pointer', font: 'inherit', fontSize: text.body,
                                color: color.ink, whiteSpace: 'nowrap',
                              }}
                            >
                              Share as template
                            </button>
                          </div>
                        )}
                        {headerButton('Share this conversation', () => setShareOpen(open => !open), <ShareIcon size={15} />, { 'aria-expanded': shareOpen })}
                      </span>
                    )}

                    {/*
                      The computer icon. Behind it is the whole of the panel the
                      app inherits — the agent's live browser, the files it has
                      made, what it delegated, what you gave it. One icon, because
                      the design says so; everything behind it, because throwing
                      that away would be the most expensive thing in the app.
                    */}
                    {headerButton('Watch the agent work', onOpenPanel, <ComputerIcon size={15} />)}
                  </span>
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
                  {...(roster ? { roster } : {})}
                  {...(connector ? { connector } : {})}
                  {...(parts ? { parts } : {})}
                  actions={{ reactions, onReact, onReply }}
                  // A button in an answer card is the person's next message,
                  // sent as if typed: "Book: Canlis".
                  cards={{ onMessage: onSend }}
                  typing={saysTyping && !waiting ? { avatar: activeAvatar } : undefined}
                />

                {/*
                  Voice: the canvas fades the bottom of the thread to white and
                  floats the agent's face over it, above the composer. The
                  canvas drew the face in a 124px glass disc; the founder,
                  17 September, on seeing it: "remove the circle in which
                  the voice avatar is in. just have it there without it."
                  So the face alone. It breathes while it waits and pulses
                  while the agent speaks. The composer stays where it is.
                */}
                {mode === ThreadMode.Voice && (
                  <div
                    style={{
                      position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 6, pointerEvents: 'none',
                      height: 268, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 78,
                      background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.92) 46%, #ffffff 72%)',
                    }}
                  >
                    <button
                      type="button"
                      aria-label={`${activeName} is listening`}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 124, height: 124, padding: 0, borderRadius: '50%',
                        border: 'none', background: 'transparent',
                        cursor: 'pointer', pointerEvents: 'auto',
                        animation: `fsr-orb-in ${motion.orbIn.duration} ${motion.orbIn.easing} both, ${typing
                          ? `fsr-orb-speak ${motion.orbSpeak.duration} ${motion.orbSpeak.easing} infinite`
                          : 'fsr-orb-idle 5.5s ease-in-out infinite'}`,
                      }}
                    >
                      <CloudBlob avatar={activeAvatar} size={96} />
                    </button>
                  </div>
                )}

                <Composer
                  placeholder={`Message ${activeName}`}
                  onSend={onSend}
                  {...(onTeach ? { onTeach } : {})}
                  {...(replySeed ? { seed: replySeed } : {})}
                  {...(dictation ? { dictation } : {})}
                />
            </>

            {/*
              Over the pane: only the computer panel, when the window is
              too narrow to give it a column of its own. The screens no
              longer land here — they take the whole window (see below).
            */}
            {layout.panel === PanelMode.Cover && (
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

          {layout.panel === PanelMode.Split && (
            <div
              data-panel
              style={{
                display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0,
                margin: '8px 8px 8px 0', borderRadius: radius.pane, overflow: 'hidden',
                background: color.fillRaised,
                animation: `fsr-message-in ${motion.messageIn.longer} ${motion.messageIn.easing} both`,
              }}
            >
              {agentPanel ?? panel}
            </div>
          )}

          {/*
            One screen at a time, over the whole window, with one way
            back. The founder, 18 September: "you click on app, then you
            click on settings, we got two screens, one up the other …
            it's like a skin over a skin … when you click ANYWHERE, when
            you go back, you're going back to the chat. its the main
            screen."

            So: whichever of these is open takes the whole window, the
            list of agents included, and the only control on it goes
            back to the conversation — never to whatever was open before.
            A person who opens Create, wanders into Settings and presses
            back lands in the chat, because the chat is the app and the
            rest are errands. The screens cannot stack: `screen` picks
            exactly one, so opening a second closes the first rather
            than covering it.

            The X on each screen is gone with this. It said "close" in a
            place where the only question is "back to what?", and with
            two screens open it closed the wrong one.
          */}
          {screen && (
            <div
              style={{
                position: 'absolute', inset: 0, zIndex: 60,
                display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0,
                background: color.paper, borderRadius: radius.window, overflow: 'hidden',
                animation: `fsr-message-in ${motion.messageIn.duration} ${motion.messageIn.easing} both`,
              }}
            >
              <BackBar label={screen.label} onBack={backToChat} />
              <div style={{ position: 'relative', flex: '1 1 auto', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {screen.node}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The agent's name in the header: the canvas's button, with a chevron,
 * quiet until the pointer is on it.
 */
function NameButton({ name, onClick }: { name: string; onClick?: () => void }): JSX.Element {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={onClick ? `About ${name}` : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, height: 25, padding: '0 8px 0 6px', marginLeft: -4,
        border: `1px solid ${hover && onClick ? line.hairline : 'transparent'}`, borderRadius: 10,
        background: hover && onClick ? color.fill : 'transparent',
        cursor: onClick ? 'pointer' : 'default', font: 'inherit',
        fontSize: text.emphasis, fontWeight: 500, letterSpacing: tracking.title, color: color.ink,
      }}
    >
      <span>{name}</span>
      {onClick && (
        <svg width="10.5" height="10.5" viewBox="0 0 24 24" fill="none" stroke={color.muted} strokeWidth={2.2} aria-hidden focusable="false">
          <path d="M6 9.5l6 6 6-6" />
        </svg>
      )}
    </button>
  );
}

/** The canvas's 27px round header button: nothing at rest, a fill and a hairline under the pointer. */
function HoverButton(
  { label, onClick, children, ...rest }: { label: string; onClick?: () => void; children: JSX.Element; 'aria-expanded'?: boolean },
): JSX.Element {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={rest['aria-expanded']}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 27, height: 27, borderRadius: radius.pill,
        border: `1px solid ${hover ? line.hairline : 'transparent'}`,
        background: hover ? color.fill : 'transparent',
        cursor: 'pointer', color: color.muted, padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </button>
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
        background: color.window,
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

/**
 * The one control on a screen: back to the conversation.
 *
 * It replaced an X on each of them. An X asks "close what?", and with
 * two screens open it answered wrongly; this says where it goes. The
 * screen's name sits beside it so a person can see where they are
 * without reading the page.
 */
function BackBar({ label, onBack }: { label: string; onBack: () => void }): JSX.Element {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10,
        padding: '13px 16px', borderBottom: `1px solid ${line.hairline}`,
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to the conversation"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, height: 30,
          padding: '0 12px 0 8px', borderRadius: radius.pill, border: 'none',
          background: hover ? color.fill : 'transparent',
          color: color.ink, font: 'inherit', fontSize: text.body, cursor: 'pointer',
          transition: `background ${motion.hover.duration} ${motion.hover.easing}`,
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        <span style={{ display: 'inline-flex', transform: 'rotate(180deg)', color: color.muted }}>
          <ChevronRightIcon size={14} />
        </span>
        Chat
      </button>
      <span style={{ fontSize: text.body, color: color.muted }}>{label}</span>
    </div>
  );
}
