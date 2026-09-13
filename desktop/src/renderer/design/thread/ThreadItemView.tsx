import { type CSSProperties, useState } from 'react';

import { Orb, OrbMood } from '../orb/Orb';
import { color, font, line, motion, radius, shadow, text, tracking } from '../tokens';
import { type AuthDecision, Speaker,type ThreadItem, ThreadItemKind } from './types';

/**
 * The five things a thread may show.
 *
 * One component per kind, and a switch. Deliberately not one clever
 * renderer: the kinds have nothing in common but their container, and the
 * moment they share code the list stops being closed.
 */

const enter = `fsr-message-in ${motion.messageIn.duration} ${motion.messageIn.easing} both`;

const bubbleBase: CSSProperties = {
  maxWidth: 'min(72%, 560px)',
  padding: '11px 16px',
  fontSize: text.message,
  lineHeight: 1.45,
  textWrap: 'pretty',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

function TextBubble({ item, orbSize = 28 }: { item: Extract<ThreadItem, { kind: 'text' }>; orbSize?: number }) {
  const mine = item.from === Speaker.Person;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: mine ? 'flex-end' : 'flex-start',
        alignItems: 'flex-end',
        gap: 10,
        animation: enter,
      }}
    >
      {!mine && item.agentId && (
        <Orb agentId={item.agentId} size={orbSize} mood={OrbMood.Still} />
      )}
      <div
        style={{
          ...bubbleBase,
          borderRadius: radius.panel,
          background: mine ? color.ink : color.fill,
          color: mine ? color.paper : color.ink,
          border: mine ? 'none' : `1px solid ${line.hairline}`,
        }}
      >
        {item.text}
      </div>
    </div>
  );
}

function SystemLine({ item }: { item: Extract<ThreadItem, { kind: 'system' }> }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0', animation: enter }}>
      <span
        style={{
          fontSize: text.small,
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4, animation: enter }}>
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
            style={{ width: 22, height: 22, border: 'none', background: 'transparent', cursor: 'pointer', color: color.muted, padding: 0 }}
          >
            ✕
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
        <span aria-hidden style={{ color: color.warning, fontSize: 17, lineHeight: 1.2, marginTop: 1 }}>⚠</span>
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
            <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: `transform ${motion.hover.duration} ${motion.hover.easing}` }}>›</span>
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
}

export function ThreadItemView({ item, choice, auth }: ThreadItemViewProps): JSX.Element | null {
  switch (item.kind) {
    case ThreadItemKind.Text:
      return <TextBubble item={item} />;
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
