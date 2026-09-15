import { useEffect, useRef, useState } from 'react';

import { CopyIcon, DotsIcon, ReplyIcon, SmileIcon } from '../icons';
import { color, font, glass, line, radius, shadow, text } from '../tokens';
import { REACTION_EMOJIS } from './actions';

/**
 * The hover cluster beside a bubble, from the evening canvas of
 * 15 September: three round buttons — react, reply, more — that appear
 * when the pointer rests on a message and stay while one of their
 * popovers is open.
 *
 * On the person's own bubble the cluster sits to the left (`order:-1`);
 * on the agent's, to the right. The popovers hang above the cluster,
 * anchored to the bubble's side.
 *
 * `onHold` tells the row a popover is open, so the cluster does not fade
 * the moment the pointer moves onto the popover itself.
 */
export interface MessageActionsProps {
  mine: boolean;
  /** The pointer is on the row. */
  hovered: boolean;
  /** The emoji already on this message, or ''. */
  reaction: string;
  /** The id a person can hand to support. */
  messageId: string;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onHold: (held: boolean) => void;
}

/** How long "Copied" stays before the menu closes. The canvas's 1100ms. */
const COPIED_MS = 1100;

const roundButton: React.CSSProperties = {
  width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: '50%',
  cursor: 'pointer', color: '#6b7280', padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const popover: React.CSSProperties = {
  position: 'absolute', bottom: 36, zIndex: 6,
  background: 'rgba(255,255,255,.72)', backdropFilter: glass.blur,
  WebkitBackdropFilter: glass.blur,
  border: '1px solid rgba(255,255,255,.6)',
  boxShadow: '0 1px 2px rgba(16,22,35,.04), 0 12px 32px rgba(16,22,35,.14)',
};

export function MessageActions({
  mine, hovered, reaction, messageId, onReact, onReply, onHold,
}: MessageActionsProps): JSX.Element {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const open = emojiOpen || menuOpen;

  useEffect(() => { onHold(open); }, [open, onHold]);

  // Escape, and a click anywhere else, like every other popover here.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { setEmojiOpen(false); setMenuOpen(false); }
    };
    const onDown = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) { setEmojiOpen(false); setMenuOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    const timer = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.clearTimeout(timer);
    };
  }, [open]);

  const copy = (): void => {
    void navigator.clipboard?.writeText(messageId).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => { setCopied(false); setMenuOpen(false); }, COPIED_MS);
  };

  const shown = hovered || open;
  const side = mine ? { right: 0 } : { left: 0 };

  return (
    <div
      ref={ref}
      style={{
        position: 'relative', alignSelf: 'center', flex: '0 0 auto', width: 93,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        transition: 'opacity .12s',
        ...(mine ? { order: -1 } : {}),
        ...(shown ? {} : { opacity: 0, pointerEvents: 'none' }),
      }}
    >
      <button
        type="button"
        onClick={() => { setEmojiOpen(one => !one); setMenuOpen(false); }}
        aria-label="React"
        aria-expanded={emojiOpen}
        style={roundButton}
      >
        <SmileIcon size={15} />
      </button>
      <button type="button" onClick={onReply} aria-label="Reply" style={roundButton}>
        <ReplyIcon size={15} />
      </button>
      <button
        type="button"
        onClick={() => { setMenuOpen(one => !one); setEmojiOpen(false); }}
        aria-label="More"
        aria-expanded={menuOpen}
        style={roundButton}
      >
        <DotsIcon size={15} />
      </button>

      {emojiOpen && (
        <div role="menu" style={{ ...popover, ...side, display: 'flex', gap: 4, padding: 4, borderRadius: radius.card }}>
          {REACTION_EMOJIS.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => { onReact(emoji); setEmojiOpen(false); }}
              aria-label={`React ${emoji}`}
              aria-pressed={reaction === emoji}
              style={{
                width: 31, height: 31, border: 'none', borderRadius: '50%', cursor: 'pointer', padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: font.emoji, fontSize: 19, lineHeight: 1,
                background: reaction === emoji ? line.hover : 'transparent',
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {menuOpen && (
        <div role="menu" style={{ ...popover, ...side, minWidth: 191, padding: 5, borderRadius: radius.row }}>
          <button
            type="button"
            onClick={copy}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
              border: 'none', background: 'transparent', borderRadius: radius.small, cursor: 'pointer',
              font: 'inherit', fontSize: text.body, fontWeight: 400, color: color.shimmerInk, textAlign: 'left',
            }}
          >
            <CopyIcon size={14} style={{ color: '#6b7280' }} />
            <span>{copied ? 'Copied' : 'Copy message ID'}</span>
          </button>
          <div
            style={{
              padding: '2px 11px 6px 31px', fontFamily: font.mono, fontSize: text.code,
              letterSpacing: 0, color: '#6b7280', wordBreak: 'break-all',
            }}
          >
            {messageId}
          </div>
        </div>
      )}
    </div>
  );
}

/** The chip at the bubble's foot once a reaction is on it. */
export function ReactionChip({ emoji }: { emoji: string }): JSX.Element {
  return (
    <span
      aria-label={`Reacted ${emoji}`}
      style={{
        alignSelf: 'flex-end', margin: '0 0 2px 7px', flex: '0 0 auto',
        display: 'flex', alignItems: 'center', height: 24, padding: '0 8px',
        borderRadius: radius.pill, background: color.paper,
        border: `1px solid ${line.hairline}`, boxShadow: shadow.flat,
        fontFamily: font.emoji, fontSize: text.small, lineHeight: 1,
      }}
    >
      {emoji}
    </span>
  );
}
