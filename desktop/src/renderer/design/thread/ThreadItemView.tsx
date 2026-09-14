import { type CSSProperties, useState } from 'react';

import { ChevronRightIcon, CloseIcon, WarningIcon } from '../icons';
import { Orb, OrbMood } from '../orb/Orb';
import { paletteForAgent } from '../orb/palette';
import { color, font, line, motion, radius, shadow, text, tracking } from '../tokens';
import { type KnownFile, type MessagePart, PartKind, splitMessageParts } from './parts';
import { type AuthDecision, Speaker,type ThreadItem, ThreadItemKind } from './types';

/**
 * The five things a thread may show.
 *
 * One component per kind, and a switch. Deliberately not one clever
 * renderer: the kinds have nothing in common but their container, and the
 * moment they share code the list stops being closed.
 */

const enter = `fsr-message-in ${motion.messageIn.longer} ${motion.messageIn.easing} both`;

/** What the person may do with something named in a message. */
export interface PartHandlers {
  /** Open a file on this computer. */
  onOpenFile?: (path: string) => void;
  /** Open a link, in whatever the person uses for links. */
  onOpenLink?: (href: string) => void;
  /** The files this conversation has produced, so a chip can find one. */
  files?: readonly KnownFile[];
}

/**
 * The chip. The canvas's, to the character:
 *
 *   font-family:'SF Mono', …; font-size:13.5px; padding:2px 7px;
 *   margin:0 1px; border-radius:7px; background:rgba(16,22,35,.11);
 *   white-space:nowrap
 *
 * `line.hairline` is that rgba. It is a border token being used as a fill,
 * which reads oddly — but it is one value in the canvas and making a
 * second token holding the same number would be the drift this design
 * system exists to prevent.
 */
const chipStyle: CSSProperties = {
  fontFamily: font.mono,
  fontSize: text.label,
  padding: '2px 7px',
  margin: '0 1px',
  borderRadius: radius.fileChip,
  background: line.hairline,
  whiteSpace: 'nowrap',
};

/**
 * The same chip inside the person's own bubble, which is near-black.
 *
 * The canvas only ever puts a chip in the agent's pale bubble, so it never
 * had to answer this. An 11%-black fill on `#1e3358` is invisible, so the
 * chip takes the same idea from the other side.
 */
const chipOnDark: CSSProperties = { ...chipStyle, background: 'rgba(255,255,255,.16)' };

function Part(
  { part, mine, handlers }: { part: MessagePart; mine: boolean; handlers: PartHandlers },
): JSX.Element {
  const chip = mine ? chipOnDark : chipStyle;

  if (part.kind === PartKind.Code) return <span style={chip}>{part.text}</span>;

  if (part.kind === PartKind.File) {
    const path = part.target;
    if (!path || !handlers.onOpenFile) return <span style={chip}>{part.text}</span>;
    return (
      <button
        type="button"
        onClick={() => handlers.onOpenFile?.(path)}
        title={path}
        style={{
          ...chip,
          border: 'none', cursor: 'pointer', color: 'inherit',
          font: 'inherit', fontFamily: font.mono, fontSize: text.label,
          verticalAlign: 'baseline',
        }}
      >
        {part.text}
      </button>
    );
  }

  if (part.kind === PartKind.Link) {
    const href = part.target;
    if (!href || !handlers.onOpenLink) return <span>{part.text}</span>;
    return (
      <button
        type="button"
        onClick={() => handlers.onOpenLink?.(href)}
        title={href}
        style={{
          padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
          font: 'inherit', color: mine ? color.paper : color.accent,
          textDecoration: mine ? 'underline' : 'none',
          verticalAlign: 'baseline',
        }}
      >
        {part.text}
      </button>
    );
  }

  return part.strong ? <strong style={{ fontWeight: 600 }}>{part.text}</strong> : <>{part.text}</>;
}

/**
 * The bubble, at the canvas's measurements.
 *
 * They are not the same on both sides and that is deliberate: the agent's
 * is wider and set a half-point larger, because it is the one carrying an
 * answer, and the person's is narrower because a question is short. The
 * first build gave both the same box and a border the canvas never had.
 */
const bubbleBase: CSSProperties = {
  borderRadius: radius.bubble,
  textWrap: 'pretty',
  // The engine's text carries its own newlines; the canvas's fixtures
  // never did. Collapsing them would run two paragraphs together.
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const mineBubble: CSSProperties = {
  ...bubbleBase,
  maxWidth: 'min(62%, 560px)',
  padding: '13px 18px',
  background: color.ink,
  color: color.paper,
  fontSize: text.message,
  lineHeight: 1.45,
};

const theirBubble: CSSProperties = {
  ...bubbleBase,
  maxWidth: 'min(70%, 640px)',
  padding: '14px 20px',
  background: color.fill,
  color: color.ink,
  fontSize: text.emphasis,
  lineHeight: 1.4,
};

function TextBubble(
  { item, leading, handlers }: {
    item: Extract<ThreadItem, { kind: 'text' }>;
    leading?: boolean;
    handlers: PartHandlers;
  },
) {
  const mine = item.from === Speaker.Person;
  const parts = splitMessageParts(item.text, handlers.files);
  const bubble = (
    <div style={mine ? mineBubble : theirBubble}>
      {parts.map((part, index) => (
        <Part key={index} part={part} mine={mine} handlers={handlers} />
      ))}
    </div>
  );

  // A sender only in a group thread, which is the only place `agentId` is
  // set. In a one-to-one thread the header already says who this is, and
  // an orb beside every bubble would be an app talking about itself.
  const sender = !mine && item.agentId ? item.agentId : undefined;

  return (
    <div
      style={{
        display: 'flex',
        ...(mine ? { justifyContent: 'flex-end' } : {}),
        ...(leading ? { paddingTop: 8 } : {}),
        animation: enter,
      }}
    >
      {sender ? (
        <>
          <span style={{ flex: '0 0 auto', margin: '0 10px 2px 0', alignSelf: 'flex-end' }}>
            <Orb agentId={sender} size={28} mood={OrbMood.Still} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
            <span
              style={{
                fontSize: text.label, fontWeight: 400, paddingLeft: 4,
                color: paletteForAgent(sender).colors[0],
              }}
            >
              {item.agentName ?? ''}
            </span>
            {bubble}
          </div>
        </>
      ) : bubble}
    </div>
  );
}

function SystemLine({ item }: { item: Extract<ThreadItem, { kind: 'system' }> }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 6px', animation: enter }}>
      <span
        style={{
          fontSize: text.body,
          color: color.muted,
          textAlign: 'center',
          textWrap: 'pretty',
          maxWidth: '80%',
        }}
      >
        {item.text}
      </span>
    </div>
  );
}

function StatusLine({ item }: { item: Extract<ThreadItem, { kind: 'status' }> }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, paddingTop: 4, animation: enter }}>
      {item.agentId && <Orb agentId={item.agentId} size={26} mood={OrbMood.Still} />}
      <span
        style={{
          fontSize: text.message,
          // The shimmer is the whole point of a status: it says work is
          // happening without saying what, which is what the design asks
          // for in place of a log.
          background: `linear-gradient(90deg, ${color.shimmerInk} 0%, ${color.shimmerInk} 30%, ${color.shimmerPale} 55%, ${color.shimmerInk} 80%)`,
          backgroundSize: '220% 100%',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          animation: `fsr-shimmer ${motion.shimmer.duration} ${motion.shimmer.easing} infinite`,
        }}
      >
        {item.verb}
      </span>
    </div>
  );
}

export interface ChoiceHandlers {
  onPick: (itemId: string, optionKey: string) => void;
  onFreeAnswer?: (itemId: string, answer: string) => void;
  onDismiss?: (itemId: string) => void;
}

function ChoiceCard(
  { item, handlers }: { item: Extract<ThreadItem, { kind: 'choice' }>; handlers: ChoiceHandlers },
) {
  const [free, setFree] = useState('');
  return (
    <div
      style={{
        maxWidth: 'min(72%, 560px)',
        padding: 18,
        borderRadius: radius.panel,
        background: color.fill,
        border: `1px solid ${line.hairline}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        animation: enter,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '0 2px' }}>
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: text.emphasis, fontWeight: 500, lineHeight: 1.35, letterSpacing: tracking.body, textWrap: 'pretty' }}>
            {item.text}
          </div>
          {item.note && (
            <div style={{ fontSize: text.body, color: color.muted, lineHeight: 1.4 }}>{item.note}</div>
          )}
        </div>
        {handlers.onDismiss && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => handlers.onDismiss?.(item.id)}
            style={{
              width: 22, height: 22, border: 'none', background: 'transparent',
              cursor: 'pointer', color: color.muted, padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <CloseIcon size={13} />
          </button>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          borderRadius: radius.row,
          background: color.paper,
          border: `1px solid ${line.hairline}`,
          overflow: 'hidden',
          boxShadow: shadow.flat,
        }}
      >
        {item.options.map(option => (
          <button
            key={option.key}
            type="button"
            onClick={() => handlers.onPick(item.id, option.key)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 15px',
              border: 'none', background: 'transparent', cursor: 'pointer',
              font: 'inherit', textAlign: 'left',
            }}
          >
            <span
              style={{
                width: 24, height: 24, flex: '0 0 auto', marginTop: 1,
                borderRadius: radius.chip, background: color.fill,
                border: `1px solid ${line.hairline}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: color.muted,
              }}
            >
              {option.key}
            </span>
            <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: text.emphasis, color: color.ink, lineHeight: 1.3 }}>{option.label}</span>
              {option.hint && (
                <span style={{ fontSize: text.small, color: color.muted, lineHeight: 1.35 }}>{option.hint}</span>
              )}
            </span>
          </button>
        ))}
      </div>

      {item.freeform && handlers.onFreeAnswer && (
        <input
          value={free}
          onChange={event => setFree(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && free.trim()) {
              handlers.onFreeAnswer?.(item.id, free.trim());
              setFree('');
            }
          }}
          placeholder="Type your own answer"
          style={{
            height: 46, padding: '0 16px', borderRadius: radius.input,
            border: `1px solid ${line.field}`, background: color.paper,
            outline: 'none', font: 'inherit', fontSize: text.message, color: color.ink,
          }}
        />
      )}
    </div>
  );
}

export interface AuthHandlers {
  onDecide: (itemId: string, decision: AuthDecision) => void;
  onDismiss?: (itemId: string) => void;
}

function AuthCard(
  { item, handlers }: { item: Extract<ThreadItem, { kind: 'auth' }>; handlers: AuthHandlers },
) {
  const [open, setOpen] = useState(false);
  const button = (label: string, decision: AuthDecision, primary?: boolean): JSX.Element => (
    <button
      type="button"
      onClick={() => handlers.onDecide(item.id, decision)}
      style={{
        height: 40, padding: '0 20px', borderRadius: radius.field,
        border: primary ? 'none' : `1px solid ${line.button}`,
        background: primary ? color.ink : color.paper,
        color: primary ? color.paper : color.ink,
        font: 'inherit', fontSize: text.body, fontWeight: primary ? 500 : 400,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        maxWidth: 'min(72%, 560px)', padding: '18px 20px 20px',
        borderRadius: radius.panel, background: color.fill,
        border: `1px solid ${line.hairline}`,
        display: 'flex', flexDirection: 'column', animation: enter,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <WarningIcon size={17} style={{ color: color.warning, marginTop: 2 }} />
        <div style={{ flex: '1 1 auto', minWidth: 0, fontSize: text.emphasis, fontWeight: 500, lineHeight: 1.35, letterSpacing: tracking.body, textWrap: 'pretty' }}>
          {item.text}
        </div>
      </div>

      {item.deviceId && (
        <div style={{ padding: '9px 0 0 28px', fontFamily: font.mono, fontSize: 12.5, color: color.muted, wordBreak: 'break-all' }}>
          {item.deviceId}
        </div>
      )}
      {item.note && (
        <div style={{ padding: '7px 0 0 28px', fontSize: text.body, lineHeight: 1.45, color: color.muted, textWrap: 'pretty' }}>
          {item.note}
        </div>
      )}

      {/*
        The command, behind a disclosure. The whole point of the card is
        that somebody can read exactly what they are agreeing to — a
        prompt that hides it teaches people that approving means nothing.
      */}
      {item.command && (
        <>
          <button
            type="button"
            onClick={() => setOpen(value => !value)}
            aria-expanded={open}
            style={{
              margin: '12px 0 0 24px', alignSelf: 'flex-start',
              display: 'flex', alignItems: 'center', gap: 9, padding: 4,
              border: 'none', background: 'transparent', cursor: 'pointer',
              font: 'inherit', fontSize: text.body, color: color.muted,
            }}
          >
            <ChevronRightIcon
              size={11}
              style={{
                transform: open ? 'rotate(90deg)' : 'none',
                transition: `transform ${motion.hover.duration} ${motion.hover.easing}`,
              }}
            />
            <span>{open ? 'Hide the command' : 'Show the command'}</span>
          </button>
          {open && (
            <div
              style={{
                margin: '10px 0 0 28px', padding: '13px 15px',
                borderRadius: radius.input, background: color.paper,
                border: `1px solid ${line.hairline}`,
                fontFamily: font.mono, fontSize: 12.5, lineHeight: 1.6,
                color: color.ink, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}
            >
              {item.command}
            </div>
          )}
        </>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, padding: '18px 0 0 28px' }}>
        {button('Always allow', 'always', true)}
        {button('Allow once', 'once')}
        {button('Never', 'never')}
      </div>
    </div>
  );
}

export interface ThreadItemViewProps {
  item: ThreadItem;
  choice: ChoiceHandlers;
  auth: AuthHandlers;
  /** What a file or a link in the text can do. */
  parts?: PartHandlers;
  /**
   * True when this bubble starts a turn — the one before it came from the
   * other side. The canvas puts 8px above it and nothing between bubbles
   * from the same speaker, which is what makes a reply read as one thing.
   */
  leading?: boolean;
}

const noHandlers: PartHandlers = {};

export function ThreadItemView(
  { item, choice, auth, parts = noHandlers, leading }: ThreadItemViewProps,
): JSX.Element | null {
  switch (item.kind) {
    case ThreadItemKind.Text:
      return <TextBubble item={item} leading={leading} handlers={parts} />;
    case ThreadItemKind.System:
      return <SystemLine item={item} />;
    case ThreadItemKind.Status:
      return <StatusLine item={item} />;
    case ThreadItemKind.Choice:
      return <ChoiceCard item={item} handlers={choice} />;
    case ThreadItemKind.Auth:
      return <AuthCard item={item} handlers={auth} />;
    default:
      // The list is closed. A new kind is a product decision, and it
      // should be made here rather than by something silently rendering.
      return null;
  }
}
