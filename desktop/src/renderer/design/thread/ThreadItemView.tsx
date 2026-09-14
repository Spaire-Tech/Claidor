import { type CSSProperties, useState } from 'react';

import { ChevronRightIcon, CloseIcon, WarningIcon } from '../icons';
import { Orb, OrbMood } from '../orb/Orb';
import { paletteForAgent } from '../orb/palette';
import { color, font, line, motion, radius, shadow, text, tracking } from '../tokens';
import { readableSize } from './attachment';
import { type KnownFile, type MessagePart, PartKind, splitMessageParts } from './parts';
import {
  type AttachmentItem,
  type AuthDecision,
  type SecretItem,
  Speaker,
  type ThreadItem,
  ThreadItemKind,
} from './types';

/**
 * The seven things a thread may show.
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
  /** Open Settings at a row the agent named. */
  onOpenSetting?: (rowId: string) => void;
  /** Scroll back to an earlier message in this conversation. */
  onOpenMessage?: (messageId: string) => void;
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

  // A pill and a back-reference. Not the file chip: those are monospace
  // because a path is a machine thing, and these are neither paths nor
  // code — they are the name of a control and the gist of a sentence, and
  // they read as words with a soft edge round them.
  if (part.kind === PartKind.Setting || part.kind === PartKind.Ref) {
    const isSetting = part.kind === PartKind.Setting;
    const open = isSetting
      ? (handlers.onOpenSetting && part.app ? () => handlers.onOpenSetting?.(part.app!.id) : undefined)
      : (handlers.onOpenMessage && part.app ? () => handlers.onOpenMessage?.(part.app!.id) : undefined);
    const pill: CSSProperties = {
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '1px 8px', margin: '0 1px',
      borderRadius: radius.pill, verticalAlign: 'baseline',
      font: 'inherit', fontSize: text.label,
      background: mine ? 'rgba(255,255,255,.16)' : line.hairline,
      color: 'inherit',
    };
    if (!open) return <span style={pill}>{part.text}</span>;
    return (
      <button type="button" onClick={open} style={{ ...pill, border: 'none', cursor: 'pointer' }}>
        {isSetting ? <GearGlyph /> : <ReplyGlyph />}
        {part.text}
      </button>
    );
  }

  return part.strong ? <strong style={{ fontWeight: 600 }}>{part.text}</strong> : <>{part.text}</>;
}

/** Small enough to read as punctuation rather than an icon. */
function GearGlyph(): JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" style={{ opacity: 0.6, flex: '0 0 auto' }}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  );
}

function ReplyGlyph(): JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" style={{ opacity: 0.6, flex: '0 0 auto' }}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 016 6v5" />
    </svg>
  );
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
        // The canvas gives a question the same 8px above it as a change
        // of speaker, because that is what it is.
        marginTop: 8,
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
              display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px',
              border: 'none', background: 'transparent', cursor: 'pointer',
              font: 'inherit', textAlign: 'left', width: '100%',
              ...(item.options[0] === option ? {} : { borderTop: `1px solid ${line.hairline}` }),
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

/**
 * A file as the whole message.
 *
 * An image is looked at; anything else is named, sized and openable. The
 * card takes the agent bubble's own surface rather than inventing a
 * second one, so a thread of replies and files reads as one column.
 */
function AttachmentCard(
  { item, handlers }: { item: AttachmentItem; handlers: PartHandlers },
): JSX.Element {
  const mine = item.from === Speaker.Person;
  const open = handlers.onOpenFile ? () => handlers.onOpenFile?.(item.path) : undefined;
  const size = readableSize(item.size);

  const body = item.image ? (
    <img
      src={`file://${item.path}`}
      alt={item.name}
      style={{
        display: 'block', maxWidth: '100%', maxHeight: 320,
        borderRadius: radius.card, background: color.fill,
      }}
    />
  ) : (
    <span style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
      <PaperclipGlyph />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{
          fontSize: text.body, color: color.ink,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.name}
        </span>
        {size && <span style={{ fontSize: text.caption, color: color.muted }}>{size}</span>}
      </span>
    </span>
  );

  const shell: CSSProperties = {
    maxWidth: 'min(70%, 420px)',
    padding: item.image ? 6 : '13px 16px',
    borderRadius: radius.bubble,
    background: color.fillRaised,
    border: `1px solid ${line.hairline}`,
    textAlign: 'left',
  };

  return (
    <div style={{ display: 'flex', ...(mine ? { justifyContent: 'flex-end' } : {}), animation: enter }}>
      {open ? (
        <button type="button" onClick={open} title={item.path} style={{ ...shell, cursor: 'pointer', font: 'inherit' }}>
          {body}
        </button>
      ) : (
        <div style={shell} title={item.path}>{body}</div>
      )}
    </div>
  );
}

function PaperclipGlyph(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color.muted} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" style={{ flex: '0 0 auto' }}>
      <path d="M21.4 11.1l-8.5 8.5a5 5 0 01-7.1-7.1l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8" />
    </svg>
  );
}

export interface SecretHandlers {
  /** The value the person typed. Never logged, never put in the thread. */
  onSubmit?: (id: string, value: string, remember: boolean) => void;
  /** They declined. The agent is told, and asks for nothing again. */
  onDecline?: (id: string) => void;
}

/**
 * A masked field.
 *
 * The rule everywhere in this product is: never ask somebody to paste a
 * password or a key into chat. That rule needs somewhere for the value to
 * go instead, and this is it. What is typed here is handed to the tool
 * that asked and to nothing else — it is not a message, it never enters
 * the transcript, and it is never sent to the model.
 *
 * The card says so, in the card. Somebody being asked for a password by
 * software has every right to be suspicious, and the answer to that is a
 * plain sentence rather than a lock icon.
 */
function SecretCard(
  { item, handlers }: { item: SecretItem; handlers: SecretHandlers },
): JSX.Element {
  const [value, setValue] = useState('');
  const [shown, setShown] = useState(false);
  const [remember, setRemember] = useState(false);
  const ready = value.trim().length > 0;

  return (
    <div
      style={{
        alignSelf: 'stretch', padding: '18px 20px 16px',
        borderRadius: radius.card, background: color.fillRaised,
        border: `1px solid ${line.hairline}`, animation: enter,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: text.emphasis, color: color.ink, lineHeight: 1.35 }}>{item.text}</div>
        {item.note && (
          <div style={{ fontSize: text.small, color: color.muted, lineHeight: 1.45 }}>{item.note}</div>
        )}
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: text.caption, color: color.muted }}>{item.label}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <input
            value={value}
            onChange={event => setValue(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && ready) handlers.onSubmit?.(item.id, value, remember); }}
            type={shown ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: '1 1 auto', minWidth: 0, height: 38, padding: '0 12px',
              borderRadius: radius.small, border: `1px solid ${line.field}`,
              background: color.paper, outline: 'none', color: color.ink,
              font: 'inherit', fontFamily: font.mono, fontSize: text.body,
            }}
          />
          <button
            type="button"
            onClick={() => setShown(one => !one)}
            aria-pressed={shown}
            style={{
              height: 38, padding: '0 12px', borderRadius: radius.small,
              border: `1px solid ${line.field}`, background: color.fill,
              color: color.muted, font: 'inherit', fontSize: text.body, cursor: 'pointer',
            }}
          >
            {shown ? 'Hide' : 'Show'}
          </button>
        </span>
      </label>

      {item.offerToSave && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: text.small, color: color.muted }}>
          <input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />
          Keep this on this computer, so I do not have to ask again
        </label>
      )}

      <div style={{ fontSize: text.caption, color: color.muted, lineHeight: 1.45 }}>
        This goes straight to the thing that asked for it. It is not added to
        the conversation and it is never sent to the model.
      </div>

      <div style={{ display: 'flex', gap: 9 }}>
        <button
          type="button"
          disabled={!ready}
          onClick={() => handlers.onSubmit?.(item.id, value, remember)}
          style={{
            height: 38, padding: '0 18px', borderRadius: radius.field, border: 'none',
            background: ready ? color.ink : color.fill,
            color: ready ? color.paper : color.faint,
            font: 'inherit', fontSize: text.body, fontWeight: 500,
            cursor: ready ? 'pointer' : 'default',
          }}
        >
          Send
        </button>
        <button
          type="button"
          onClick={() => handlers.onDecline?.(item.id)}
          style={{
            height: 38, padding: '0 16px', borderRadius: radius.field,
            border: `1px solid ${line.field}`, background: color.fill, color: color.ink,
            font: 'inherit', fontSize: text.body, cursor: 'pointer',
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}

export interface ThreadItemViewProps {
  item: ThreadItem;
  choice: ChoiceHandlers;
  auth: AuthHandlers;
  /** What a secret card can do with what was typed. */
  secret?: SecretHandlers;
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

const noSecret: SecretHandlers = {};

export function ThreadItemView(
  { item, choice, auth, secret = noSecret, parts = noHandlers, leading }: ThreadItemViewProps,
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
    case ThreadItemKind.Attachment:
      return <AttachmentCard item={item} handlers={parts} />;
    case ThreadItemKind.Secret:
      return <SecretCard item={item} handlers={secret} />;
    default:
      // The list is closed. A new kind is a product decision, and it
      // should be made here rather than by something silently rendering.
      return null;
  }
}
