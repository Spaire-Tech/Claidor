import { type ButtonHTMLAttributes, type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { CopyIcon, DotsIcon, ReplyIcon, SmileIcon } from '../icons';
import { color, font, glass, line, motion, radius, shadow, text } from '../tokens';
import { REACTION_EMOJIS } from './actions';

/**
 * The hover cluster beside a bubble, from the evening canvas of
 * 15 September and measured against the 17 September one
 * (template.html 663–689): three round buttons — react, reply, more —
 * that appear when the pointer rests on a message and stay while one of
 * their popovers is open.
 *
 * On the person's own bubble the cluster sits to the left (`order:-1`);
 * on the agent's, to the right. The popovers hang above the cluster,
 * anchored to the bubble's side.
 *
 * They are drawn through a portal onto `document.body`, positioned from
 * the cluster's rect, because nothing opens inside another box: the
 * thread scrolls and clips, and a popover that lives inside it is cut
 * off at the first message and the last.
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

/** The gap between the cluster's top and the popover's foot. */
const POPOVER_GAP = 8;

/** Where the popover sits: above the cluster, flush with the bubble's side. */
interface Place {
  bottom: number;
  left?: number;
  right?: number;
}

/** A button that changes under the pointer, since inline styles cannot. */
function HoverButton(
  { hoverStyle, style, onMouseEnter, onMouseLeave, ...rest }:
    ButtonHTMLAttributes<HTMLButtonElement> & { hoverStyle: CSSProperties },
): JSX.Element {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onMouseEnter={event => { setHover(true); onMouseEnter?.(event); }}
      onMouseLeave={event => { setHover(false); onMouseLeave?.(event); }}
      style={{ ...style, ...(hover ? hoverStyle : {}) }}
      {...rest}
    />
  );
}

const roundButton: CSSProperties = {
  width: 25, height: 25, border: 'none', background: 'transparent', borderRadius: '50%',
  cursor: 'pointer', color: color.muted, padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: `background ${motion.hover.duration} ${motion.hover.easing}`,
};

const roundHover: CSSProperties = { background: color.fill, color: color.ink };

/** The surface both popovers share: the window's grey, blurred, on the menu shadow. */
const popover: CSSProperties = {
  position: 'fixed', zIndex: 120,
  background: color.window,
  backdropFilter: glass.menuBlur, WebkitBackdropFilter: glass.menuBlur,
  border: `1px solid ${line.field}`,
  boxShadow: shadow.menu,
  animation: `fsr-message-in ${motion.messageIn.duration} ${motion.messageIn.easing} both`,
};

export function MessageActions({
  mine, hovered, reaction, messageId, onReact, onReply, onHold,
}: MessageActionsProps): JSX.Element {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [place, setPlace] = useState<Place>();
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const open = emojiOpen || menuOpen;

  useEffect(() => { onHold(open); }, [open, onHold]);

  // Measure on open, and again when the window changes size under it.
  useLayoutEffect(() => {
    if (!open) { setPlace(undefined); return undefined; }
    const measure = (): void => {
      const box = ref.current?.getBoundingClientRect();
      if (!box) return;
      setPlace({
        bottom: window.innerHeight - box.top + POPOVER_GAP,
        ...(mine
          ? { right: Math.max(8, window.innerWidth - box.right) }
          : { left: Math.max(8, box.left) }),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, mine]);

  // Escape, and a click anywhere else, like every other popover here.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { setEmojiOpen(false); setMenuOpen(false); }
    };
    const onDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !popRef.current?.contains(target)) {
        setEmojiOpen(false);
        setMenuOpen(false);
      }
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

  const emojis = emojiOpen && place ? createPortal(
    <div
      ref={popRef}
      role="menu"
      style={{ ...popover, ...place, display: 'flex', gap: 4, padding: 4, borderRadius: radius.card }}
    >
      {REACTION_EMOJIS.map(emoji => (
        <HoverButton
          key={emoji}
          onClick={() => { onReact(emoji); setEmojiOpen(false); }}
          aria-label={`React ${emoji}`}
          aria-pressed={reaction === emoji}
          style={{
            width: 27, height: 27, border: 'none', borderRadius: '50%', cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            // 18.5px: the emoji's one size in the canvas (template.html 676), not on the type scale.
            fontFamily: font.emoji, fontSize: 18.5, lineHeight: 1,
            background: reaction === emoji ? line.hover : 'transparent',
          }}
          hoverStyle={{ background: reaction === emoji ? line.hover : color.window }}
        >
          {emoji}
        </HoverButton>
      ))}
    </div>,
    document.body,
  ) : null;

  const menu = menuOpen && place ? createPortal(
    <div
      ref={popRef}
      role="menu"
      style={{ ...popover, ...place, minWidth: 191, padding: 5, borderRadius: radius.row }}
    >
      <HoverButton
        onClick={copy}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
          border: 'none', background: 'transparent', borderRadius: radius.small, cursor: 'pointer',
          font: 'inherit', fontSize: text.body, fontWeight: 400, color: color.ink, textAlign: 'left',
        }}
        hoverStyle={{ background: color.fill }}
      >
        <CopyIcon size={14} style={{ color: color.muted, flex: '0 0 auto' }} />
        <span>{copied ? 'Copied' : 'Copy message ID'}</span>
      </HoverButton>
      <div
        style={{
          padding: '2px 11px 6px 31px', fontFamily: font.mono, fontSize: text.code,
          letterSpacing: 0, color: color.muted, wordBreak: 'break-all',
        }}
      >
        {messageId}
      </div>
    </div>,
    document.body,
  ) : null;

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
      <HoverButton
        onClick={() => { setEmojiOpen(one => !one); setMenuOpen(false); }}
        aria-label="React"
        aria-expanded={emojiOpen}
        style={roundButton}
        hoverStyle={roundHover}
      >
        <SmileIcon size={15} />
      </HoverButton>
      <HoverButton onClick={onReply} aria-label="Reply" style={roundButton} hoverStyle={roundHover}>
        <ReplyIcon size={15} />
      </HoverButton>
      <HoverButton
        onClick={() => { setMenuOpen(one => !one); setEmojiOpen(false); }}
        aria-label="More"
        aria-expanded={menuOpen}
        style={roundButton}
        hoverStyle={roundHover}
      >
        <DotsIcon size={15} />
      </HoverButton>
      {emojis}
      {menu}
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
        display: 'flex', alignItems: 'center', height: 21, padding: '0 8px',
        borderRadius: radius.pill, background: color.window,
        border: `1px solid ${line.card}`, boxShadow: shadow.flat,
        fontFamily: font.emoji, fontSize: text.small, lineHeight: 1,
      }}
    >
      {emoji}
    </span>
  );
}
