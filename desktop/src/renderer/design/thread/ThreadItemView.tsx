import { type CSSProperties, useState } from 'react';

import { agentAvatar, avatarInk } from '../../../shared/agent/avatars';
import { AskInputFieldKind } from '../../../shared/askInput/constants';
import { ChevronRightIcon, CloseIcon, WarningIcon } from '../icons';
import { CloudBlob } from '../orb/CloudBlob';
import { color, font, line, motion, radius, shadow, text, tracking } from '../tokens';
import { messageIdOf, type Reactions } from './actions';
import { readableSize } from './attachment';
import { CardBlock, type CardHandlers } from './CardBlock';
import { detailsLabel } from './details';
import { FileCard } from './FileCard';
import { MessageActions, ReactionChip } from './MessageActions';
import { type KnownFile, type MessagePart, PartKind, splitMessageParts } from './parts';
import { RosterCard, type RosterHandlers } from './RosterCard';
import {
  type AttachmentItem,
  type AuthDecision,
  type ChoiceOutcome,
  type SecretItem,
  Speaker,
  type ThreadItem,
  ThreadItemKind,
} from './types';

/**
 * The eight things a thread may show.
 *
 * One component per kind, and a switch. Deliberately not one clever
 * renderer: the kinds have nothing in common but their container, and the
 * moment they share code the list stops being closed. The roster card
 * lives in its own file (`RosterCard.tsx`) only because this one is long.
 */

export type { RosterHandlers } from './RosterCard';

const enter = `fsr-message-in ${motion.messageIn.longer} ${motion.messageIn.easing} both`;

/** An agent's face by id, or a stable stand-in for an id the map lacks. */
const avatarOf = (handlers: PartHandlers, agentId: string): number =>
  agentAvatar(agentId, handlers.avatars?.[agentId]);

/** What the person may do with something named in a message. */
export interface PartHandlers {
  /** Open a file on this computer. */
  onOpenFile?: (path: string) => void;
  /** Save a copy of a file the agent made, wherever the person points. */
  onSaveCopy?: (path: string) => void;
  /** Open a link, in whatever the person uses for links. */
  onOpenLink?: (href: string) => void;
  /** Open Settings at a row the agent named. */
  onOpenSetting?: (rowId: string) => void;
  /** Scroll back to an earlier message in this conversation. */
  onOpenMessage?: (messageId: string) => void;
  /** The files this conversation has produced, so a chip can find one. */
  files?: readonly KnownFile[];
  /**
   * Each agent's face, by id, for the sender beside a room message and
   * the status line. An id with no entry gets a stable fallback rather
   * than nothing — but every agent has one after the first launch.
   */
  avatars?: Readonly<Record<string, number>>;
}

/**
 * The chip. The canvas's, to the character:
 *
 *   font-family:'SF Mono', …; font-size:12.5px; padding:2px 6px;
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
  padding: '2px 6px',
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
  padding: '11px 15px',
  background: color.ink,
  color: color.paper,
  fontSize: text.message,
  lineHeight: 1.45,
};

const theirBubble: CSSProperties = {
  ...bubbleBase,
  maxWidth: 'min(70%, 640px)',
  padding: '12px 17px',
  background: color.fill,
  color: color.ink,
  fontSize: text.emphasis,
  lineHeight: 1.4,
};

function TextBubble(
  { item, leading, handlers, actions }: {
    item: Extract<ThreadItem, { kind: 'text' }>;
    leading?: boolean;
    handlers: PartHandlers;
    actions?: MessageHandlers;
  },
) {
  const mine = item.from === Speaker.Person;
  const parts = splitMessageParts(item.text, handlers.files);
  const [open, setOpen] = useState(false);
  // The hover cluster. `held` is a popover of its being open, which
  // keeps the cluster on screen while the pointer is over the popover.
  const [hovered, setHovered] = useState(false);
  const [held, setHeld] = useState(false);
  const reaction = actions?.reactions[item.id] ?? '';
  const bubble = (
    <div style={mine ? mineBubble : theirBubble}>
      {parts.map((part, index) => (
        <Part key={index} part={part} mine={mine} handlers={handlers} />
      ))}
      {item.details && (
        <>
          <button
            type="button"
            onClick={() => setOpen(one => !one)}
            aria-expanded={open}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, marginTop: 10,
              padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
              font: 'inherit', fontSize: text.label, color: color.muted,
            }}
          >
            <span
              style={{
                display: 'inline-flex', transition: 'transform .16s',
                transform: open ? 'rotate(90deg)' : 'none',
              }}
            >
              <ChevronRightIcon size={12} />
            </span>
            {open ? 'Hide the detail' : detailsLabel(item.details)}
          </button>
          {open && (
            <div
              style={{
                marginTop: 9, paddingLeft: 11,
                borderLeft: `2px solid ${line.hairline}`,
                fontFamily: font.mono, fontSize: text.label,
                lineHeight: 1.5, color: color.muted,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                // The bulk is usually a list of rows. Its own scroller, so
                // a hundred invoices do not push the composer off screen.
                maxHeight: 280, overflowY: 'auto',
              }}
            >
              {item.details}
            </div>
          )}
        </>
      )}
    </div>
  );

  // A sender only in a group thread, which is the only place `agentId` is
  // set. In a one-to-one thread the header already says who this is, and
  // an orb beside every bubble would be an app talking about itself.
  const sender = !mine && item.agentId ? item.agentId : undefined;

  return (
    <div
      onMouseEnter={actions ? () => setHovered(true) : undefined}
      onMouseLeave={actions ? () => setHovered(false) : undefined}
      style={{
        display: 'flex',
        ...(mine ? { justifyContent: 'flex-end' } : {}),
        ...(leading ? { paddingTop: 6 } : {}),
        animation: enter,
      }}
    >
      {sender ? (
        <>
          <span style={{ flex: '0 0 auto', margin: '0 10px 2px 0', alignSelf: 'flex-end' }}>
            <CloudBlob avatar={avatarOf(handlers, sender)} size={26} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span
              style={{
                fontSize: text.label, fontWeight: 400, paddingLeft: 3,
                color: avatarInk(avatarOf(handlers, sender)),
              }}
            >
              {item.agentName ?? ''}
            </span>
            {bubble}
          </div>
        </>
      ) : bubble}
      {reaction && <ReactionChip emoji={reaction} />}
      {actions && (
        <MessageActions
          mine={mine}
          hovered={hovered || held}
          reaction={reaction}
          messageId={messageIdOf(item.id)}
          onReact={emoji => actions.onReact(item.id, emoji)}
          onReply={() => actions.onReply(item.id, item.text)}
          onHold={setHeld}
        />
      )}
    </div>
  );
}

/**
 * A system line, through the same parser as a bubble.
 *
 * It used to print `item.text` verbatim. Errors are the text that arrives
 * here, error strings carry links, and a link written as markdown came out
 * as `[Upgrade or recharge](https://…)` — brackets, scheme and all, in the
 * middle of a sentence telling somebody their month had run out. That is
 * the same fault as the one `parts.ts` was written for, in the one place
 * that was not using it.
 *
 * So the runs are the bubble's runs: a path is a chip, a URL is a link,
 * and a `caisra://settings/…` target is a pill that opens the row. What is
 * different is only the setting — centred, muted, no bubble around it.
 */
function SystemLine(
  { item, handlers }: {
    item: Extract<ThreadItem, { kind: 'system' }>;
    handlers: PartHandlers;
  },
) {
  const parts = splitMessageParts(item.text, handlers.files);
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 5px', animation: enter }}>
      <span
        style={{
          fontSize: text.body,
          color: color.muted,
          textAlign: 'center',
          textWrap: 'pretty',
          maxWidth: '80%',
        }}
      >
        {parts.map((part, index) => (
          <Part key={index} part={part} mine={false} handlers={handlers} />
        ))}
      </span>
    </div>
  );
}

function StatusLine(
  { item, handlers }: { item: Extract<ThreadItem, { kind: 'status' }>; handlers: PartHandlers },
) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 3, animation: enter }}>
      {item.agentId && <CloudBlob avatar={avatarOf(handlers, item.agentId)} size={24} />}
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

/**
 * A question card once it is settled: the prompt with the chosen answer
 * checked under it, or muted and marked Dismissed. Nothing on it presses
 * (`caisra-chat-ui-logic.md` §6).
 */
function ResolvedChoiceCard({ item, outcome }: { item: Extract<ThreadItem, { kind: 'choice' }>; outcome: ChoiceOutcome }) {
  const dismissed = 'dismissed' in outcome;
  const answer = dismissed ? undefined : outcome.answer;
  const picked = item.options.find(option => option.label === answer);
  return (
    <div
      aria-label={dismissed ? 'Dismissed' : 'Answered'}
      style={{
        maxWidth: 'min(72%, 560px)', padding: 15, marginTop: 6,
        borderRadius: radius.panel, background: color.fill,
        border: `1px solid ${line.hairline}`,
        display: 'flex', flexDirection: 'column', gap: 10,
        opacity: dismissed ? 0.55 : 0.85,
      }}
    >
      <div style={{ fontSize: text.emphasis, fontWeight: 500, lineHeight: 1.35, letterSpacing: tracking.body, textWrap: 'pretty' }}>
        {item.text}
      </div>
      {dismissed
        ? <div style={{ fontSize: text.small, color: color.muted }}>Dismissed</div>
        : (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: text.body, lineHeight: 1.35 }}>
            <span
              aria-hidden
              style={{
                width: 18, height: 18, flex: '0 0 auto', marginTop: 1, borderRadius: '50%',
                background: color.ink, color: color.paper,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
              }}
            >
              ✓
            </span>
            <span style={{ color: color.ink }}>{picked?.label ?? answer}</span>
          </div>
        )}
    </div>
  );
}

function ChoiceCard(
  { item, handlers }: { item: Extract<ThreadItem, { kind: 'choice' }>; handlers: ChoiceHandlers },
) {
  const [free, setFree] = useState('');
  if (item.resolved) return <ResolvedChoiceCard item={item} outcome={item.resolved} />;
  return (
    <div
      style={{
        maxWidth: 'min(72%, 560px)',
        padding: 15,
        borderRadius: radius.panel,
        background: color.fill,
        border: `1px solid ${line.hairline}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        // The canvas gives a question the same 6px above it as a change
        // of speaker, because that is what it is.
        marginTop: 6,
        animation: enter,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '0 2px' }}>
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
              width: 19, height: 19, border: 'none', background: 'transparent',
              cursor: 'pointer', color: color.muted, padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <CloseIcon size={12} />
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
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 15px',
              border: 'none', background: 'transparent', cursor: 'pointer',
              font: 'inherit', textAlign: 'left', width: '100%',
              ...(item.options[0] === option ? {} : { borderTop: `1px solid ${line.hairline}` }),
            }}
          >
            <span
              style={{
                width: 23, height: 23, flex: '0 0 auto', marginTop: 1,
                borderRadius: radius.chip, background: color.fill,
                border: `1px solid ${line.hairline}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: text.code, color: color.muted,
              }}
            >
              {option.key}
            </span>
            <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
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
            height: 43, padding: '0 14px', borderRadius: radius.input,
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
        height: 37, padding: '0 19px', borderRadius: radius.pill,
        border: primary ? 'none' : `1px solid ${line.button}`,
        background: primary ? color.ink : color.paper,
        color: primary ? color.paper : color.ink,
        font: 'inherit', fontSize: text.body, fontWeight: 400,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        maxWidth: 'min(72%, 560px)', padding: '15px 17px 17px',
        borderRadius: radius.panel, background: color.fill,
        border: `1px solid ${line.hairline}`,
        display: 'flex', flexDirection: 'column', animation: enter,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <WarningIcon size={15.5} style={{ color: color.warning, marginTop: 2 }} />
        <div style={{ flex: '1 1 auto', minWidth: 0, fontSize: text.emphasis, fontWeight: 500, lineHeight: 1.35, letterSpacing: tracking.body, textWrap: 'pretty' }}>
          {item.text}
        </div>
      </div>

      {item.deviceId && (
        <div style={{ padding: '8px 0 0 24px', fontFamily: font.mono, fontSize: text.code, color: color.muted, wordBreak: 'break-all' }}>
          {item.deviceId}
        </div>
      )}
      {item.note && (
        <div style={{ padding: '6px 0 0 24px', fontSize: text.body, lineHeight: 1.45, color: color.muted, textWrap: 'pretty' }}>
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
              display: 'flex', alignItems: 'center', gap: 8, padding: 3,
              border: 'none', background: 'transparent', cursor: 'pointer',
              font: 'inherit', fontSize: text.body, color: color.muted,
            }}
          >
            <ChevronRightIcon
              size={10.5}
              style={{
                transform: open ? 'rotate(90deg)' : 'none',
                transition: `transform ${motion.hover.duration} ${motion.hover.easing}`,
              }}
            />
            <span>
              {item.staffing
                ? (open ? 'Hide the brief' : 'Show the brief')
                : (open ? 'Hide the command' : 'Show the command')}
            </span>
          </button>
          {open && (
            <div
              style={{
                margin: '10px 0 0 28px', padding: '11px 13px',
                borderRadius: radius.input, background: color.paper,
                border: `1px solid ${line.hairline}`,
                fontFamily: font.mono, fontSize: text.code, lineHeight: 1.6,
                color: color.ink, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}
            >
              {item.command}
            </div>
          )}
        </>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '15px 0 0 24px' }}>
        {item.staffing
          ? (
            <>
              {button('Stand up', 'once', true)}
              {button('Not now', 'never')}
            </>
          )
          : (
            // One trust decision for this computer, then out of the way
            // (`caisra-permissions.md` §2.2). "Allow once" went on 17
            // September: pressed five times in a row for one poem, it
            // was the pestering the founder's design forbids.
            // A flagged card is one action on an already-allowed computer,
            // so its Allow is this once.
            <>
              {button('Allow', item.flagged ? 'once' : 'always', true)}
              {button('Not now', 'never')}
            </>
          )}
      </div>
    </div>
  );
}

/**
 * A file as the whole message.
 *
 * An image is looked at. Anything else is the founder's 15 September
 * card, from their design: the file's own icon at 36px, its name, and a
 * round button that saves a copy. The card sits on the page's own paper
 * with the raised shadow, in a column no wider than 440px, so a pack of
 * three reads as three cards and not as three bubbles. The whole card
 * opens the file in the computer panel; only the button saves.
 */
function AttachmentCard(
  { item, handlers }: { item: AttachmentItem; handlers: PartHandlers },
): JSX.Element {
  const mine = item.from === Speaker.Person;
  const open = handlers.onOpenFile ? () => handlers.onOpenFile?.(item.path) : undefined;
  const save = handlers.onSaveCopy ? () => handlers.onSaveCopy?.(item.path) : undefined;
  const row: CSSProperties = { display: 'flex', ...(mine ? { justifyContent: 'flex-end' } : {}), animation: enter };

  if (item.image) {
    const shell: CSSProperties = {
      maxWidth: 'min(70%, 420px)', padding: 6, borderRadius: radius.bubble,
      background: color.fillRaised, border: `1px solid ${line.hairline}`, textAlign: 'left',
    };
    const picture = (
      <img
        src={`file://${item.path}`}
        alt={item.name}
        style={{ display: 'block', maxWidth: '100%', maxHeight: 320, borderRadius: radius.card, background: color.fill }}
      />
    );
    return (
      <div style={row}>
        {open ? (
          <button type="button" onClick={open} title={item.path} style={{ ...shell, cursor: 'pointer', font: 'inherit' }}>
            {picture}
          </button>
        ) : (
          <div style={shell} title={item.path}>{picture}</div>
        )}
      </div>
    );
  }

  const size = readableSize(item.size);
  return (
    <div style={row}>
      <FileCard name={item.name} caption={size} kind={item.file} title={item.path} onOpen={open} onSave={save} />
    </div>
  );
}

export interface SecretHandlers {
  /**
   * What the person typed, by field name.
   *
   * Handed straight to the tool that asked. Never logged, never added to
   * the conversation, never sent to the model.
   */
  onSubmit?: (id: string, values: Record<string, string>, remember: boolean) => void;
  /** They declined. The agent is told, and does not ask again. */
  onDecline?: (id: string) => void;
}

/**
 * The card that asks somebody to type something the model must not see.
 *
 * One field or several. A lone password box and a sign-in form are the
 * same card — splitting them would be our plumbing showing through, and
 * the person cannot tell the difference anyway.
 *
 * The sentence at the bottom is not decoration. Somebody being asked for
 * a password by software has every right to be suspicious, and the answer
 * to that is a plain statement of where the value goes, not a lock icon.
 */
function SecretCard(
  { item, handlers }: { item: SecretItem; handlers: SecretHandlers },
): JSX.Element {
  const [values, setValues] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [remember, setRemember] = useState(false);

  const hasSecret = item.fields.some(one => one.kind === AskInputFieldKind.Secret);
  const ready = item.fields.every(
    one => one.optional || (values[one.name] ?? '').trim().length > 0,
  );
  const send = (): void => {
    if (ready) handlers.onSubmit?.(item.id, values, remember);
  };

  return (
    <div
      style={{
        alignSelf: 'stretch', padding: '18px 20px 16px',
        borderRadius: radius.card, background: color.fillRaised,
        border: `1px solid ${line.hairline}`, animation: enter,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: text.emphasis, color: color.ink, lineHeight: 1.35 }}>{item.text}</div>
        {item.note && (
          <div style={{ fontSize: text.small, color: color.muted, lineHeight: 1.45 }}>{item.note}</div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {item.fields.map(field => {
          const secret = field.kind === AskInputFieldKind.Secret;
          const value = values[field.name] ?? '';
          const set = (next: string): void =>
            setValues(current => ({ ...current, [field.name]: next }));
          const boxStyle: CSSProperties = {
            flex: '1 1 auto', minWidth: 0, padding: '9px 12px',
            borderRadius: radius.small, border: `1px solid ${line.field}`,
            background: color.paper, outline: 'none', color: color.ink,
            font: 'inherit', fontSize: text.body,
            ...(secret ? { fontFamily: font.mono } : {}),
          };

          return (
            <label key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: text.caption, color: color.muted }}>
                {field.label}
                {field.optional && <span style={{ opacity: 0.7 }}> — optional</span>}
              </span>
              <span style={{ display: 'flex', gap: 8 }}>
                {field.kind === AskInputFieldKind.Block ? (
                  <textarea
                    value={value}
                    onChange={event => set(event.target.value)}
                    rows={3}
                    {...(field.placeholder ? { placeholder: field.placeholder } : {})}
                    style={{ ...boxStyle, resize: 'vertical', lineHeight: 1.45 }}
                  />
                ) : (
                  <input
                    value={value}
                    onChange={event => set(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') send(); }}
                    type={secret && !shown[field.name] ? 'password' : 'text'}
                    {...(field.placeholder ? { placeholder: field.placeholder } : {})}
                    autoComplete="off"
                    spellCheck={false}
                    style={{ ...boxStyle, height: 38, padding: '0 12px' }}
                  />
                )}
                {secret && (
                  <button
                    type="button"
                    onClick={() => setShown(one => ({ ...one, [field.name]: !one[field.name] }))}
                    aria-pressed={!!shown[field.name]}
                    style={{
                      height: 36, padding: '0 12px', borderRadius: radius.pill,
                      border: `1px solid ${line.field}`, background: color.fill,
                      color: color.muted, font: 'inherit', fontSize: text.body, cursor: 'pointer',
                      flex: '0 0 auto',
                    }}
                  >
                    {shown[field.name] ? 'Hide' : 'Show'}
                  </button>
                )}
              </span>
            </label>
          );
        })}
      </div>

      {item.offerToSave && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: text.small, color: color.muted }}>
          <input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />
          Keep this on this computer, so I do not have to ask again
        </label>
      )}

      {hasSecret && (
        <div style={{ fontSize: text.caption, color: color.muted, lineHeight: 1.45 }}>
          What you type here goes straight to the thing that asked for it. It is
          not added to the conversation and it is never sent to the model.
        </div>
      )}

      <div style={{ display: 'flex', gap: 9 }}>
        <button
          type="button"
          disabled={!ready}
          onClick={send}
          style={{
            height: 36, padding: '0 17px', borderRadius: radius.pill, border: 'none',
            background: ready ? color.ink : color.fill,
            color: ready ? color.paper : color.faint,
            font: 'inherit', fontSize: text.body, fontWeight: 400,
            cursor: ready ? 'pointer' : 'default',
          }}
        >
          Send
        </button>
        <button
          type="button"
          onClick={() => handlers.onDecline?.(item.id)}
          style={{
            height: 36, padding: '0 16px', borderRadius: radius.pill,
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

/**
 * What the hover cluster beside a bubble can do. Absent, there is no
 * cluster — the harness's still screens, for one.
 */
export interface MessageHandlers {
  /** Message id → the emoji on it. */
  reactions: Reactions;
  onReact: (itemId: string, emoji: string) => void;
  /** Quote this message into the composer. */
  onReply: (itemId: string, text: string) => void;
}

export interface ThreadItemViewProps {
  item: ThreadItem;
  choice: ChoiceHandlers;
  auth: AuthHandlers;
  /** What a secret card can do with what was typed. */
  secret?: SecretHandlers;
  /** What the roster card can answer with. Absent, it cannot be answered. */
  roster?: RosterHandlers;
  /** What a file or a link in the text can do. */
  parts?: PartHandlers;
  /** React, reply, copy the id — the cluster that appears on hover. */
  actions?: MessageHandlers;
  /** What a pressed button in an answer card does. */
  cards?: CardHandlers;
  /**
   * True when this bubble starts a turn — the one before it came from the
   * other side. The canvas puts 8px above it and nothing between bubbles
   * from the same speaker, which is what makes a reply read as one thing.
   */
  leading?: boolean;
}

const noHandlers: PartHandlers = {};

const noCards: CardHandlers = {};

const noSecret: SecretHandlers = {};

const noRoster: RosterHandlers = { onStandUp: () => {}, onSomethingElse: () => {}, onDecline: () => {} };

export function ThreadItemView(
  { item, choice, auth, secret = noSecret, roster = noRoster, parts = noHandlers, actions, cards = noCards, leading }: ThreadItemViewProps,
): JSX.Element | null {
  switch (item.kind) {
    case ThreadItemKind.Roster:
      return <RosterCard item={item} handlers={roster} />;
    case ThreadItemKind.Card:
      return <CardBlock item={item} handlers={cards} />;
    case ThreadItemKind.Text:
      return <TextBubble item={item} leading={leading} handlers={parts} actions={actions} />;
    case ThreadItemKind.System:
      return <SystemLine item={item} handlers={parts} />;
    case ThreadItemKind.Status:
      return <StatusLine item={item} handlers={parts} />;
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
