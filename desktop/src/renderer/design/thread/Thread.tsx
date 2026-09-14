import { useCallback, useEffect, useRef, useState } from 'react';

import { ChevronRightIcon } from '../icons';
import { color, glass, motion, radius, shadow, text } from '../tokens';
import { startsTurn } from './leading';
import {
  type AuthHandlers,
  type ChoiceHandlers,
  type PartHandlers,
  type SecretHandlers,
  ThreadItemView,
} from './ThreadItemView';
import type { ThreadItem } from './types';

export interface ThreadProps {
  /** Already staggered: the shell holds that, because the header's
   *  "typing" has to stay on while bubbles are still landing. */
  items: readonly ThreadItem[];
  /** "Today", "Friday" — the canvas puts one stamp at the top. */
  dayStamp?: string;
  choice: ChoiceHandlers;
  auth: AuthHandlers;
  /** What a file or a link named in a message can do. */
  parts?: PartHandlers;
  /** What a card asking for something typed can do with the answer. */
  secret?: SecretHandlers;
}

/**
 * The conversation.
 *
 * The scroll behaviour is the part worth reading. A thread pins to the
 * bottom while you are at the bottom and stops pinning the moment you
 * scroll up — so a long answer arriving does not yank you away from
 * something you are reading. The canvas does this with a ResizeObserver
 * and a MutationObserver because content grows without the list
 * scrolling; this does the same for the same reason.
 */
export function Thread({
  items, dayStamp, choice, auth, parts, secret,
}: ThreadProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  // Whether the person is still at the bottom. Starts true so a freshly
  // opened thread lands at the newest message.
  const pinned = useRef(true);

  // How many arrived while they were reading something further up.
  //
  // This is the other half of texting in short bursts: a reply that
  // lands as three bubbles while somebody is scrolled up moves the
  // content under them and gives no sign anything happened. The count is
  // the sign, and pressing it is the way back.
  const [missed, setMissed] = useState(0);
  const seen = useRef(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const glue = (): void => {
      if (pinned.current) node.scrollTop = node.scrollHeight;
    };

    const onScroll = (): void => {
      // 48px of slack: a person who is nearly at the bottom means to be
      // at the bottom, and exact comparison fights sub-pixel scrolling.
      const atBottom = node.scrollHeight - node.clientHeight - node.scrollTop < 48;
      pinned.current = atBottom;
      // Scrolling back down by hand counts as catching up. The control
      // should not linger after somebody has already read past it.
      if (atBottom) setMissed(0);
    };

    node.addEventListener('scroll', onScroll, { passive: true });
    const resize = new ResizeObserver(glue);
    resize.observe(node);
    if (node.firstElementChild) resize.observe(node.firstElementChild);
    const mutate = new MutationObserver(glue);
    mutate.observe(node, { childList: true, subtree: true, characterData: true });
    glue();

    return () => {
      node.removeEventListener('scroll', onScroll);
      resize.disconnect();
      mutate.disconnect();
    };
  }, []);

  useEffect(() => {
    const count = items.length;
    if (pinned.current) {
      // At the bottom: everything is read as it lands.
      seen.current = count;
      setMissed(0);
      return;
    }
    // Items can leave as well as arrive — a status line is deleted when
    // its work finishes, and an answered card is consumed. A shrinking
    // list is not new messages.
    if (count < seen.current) {
      seen.current = count;
      return;
    }
    setMissed(count - seen.current);
  }, [items]);

  const catchUp = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    pinned.current = true;
    seen.current = items.length;
    setMissed(0);
  }, [items.length]);

  return (
    <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0, display: 'flex' }}>
      {missed > 0 && (
        <button
          type="button"
          onClick={catchUp}
          style={{
            position: 'absolute', left: '50%', bottom: 16, zIndex: 5,
            transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 7,
            height: 34, padding: '0 14px 0 16px', borderRadius: radius.pill,
            background: glass.background, backdropFilter: glass.blur,
            border: `1px solid ${glass.border}`,
            boxShadow: `${shadow.popover}, ${shadow.glassInset}`,
            font: 'inherit', fontSize: text.label, color: color.ink, cursor: 'pointer',
            animation: `fsr-message-in ${motion.messageIn.duration} ${motion.messageIn.easing} both`,
          }}
        >
          {missed === 1 ? '1 new message' : `${missed} new messages`}
          <span style={{ display: 'inline-flex', transform: 'rotate(90deg)', color: color.muted }}>
            <ChevronRightIcon size={12} />
          </span>
        </button>
      )}
    <div
      ref={ref}
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        padding: '28px 24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {dayStamp && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 6 }}>
          <span style={{ fontSize: text.caption, color: color.muted }}>{dayStamp}</span>
        </div>
      )}

      {/*
        No "Writing" line here. The first build shimmered one under the
        thread; the canvas does not have it. Its typing indicator is the
        word "typing" beside the agent's name in the header, and one app
        saying the same thing in two places is one place too many.
      */}
      {items.map((item, index) => (
        <ThreadItemView
          key={item.id}
          item={item}
          choice={choice}
          auth={auth}
          {...(secret ? { secret } : {})}
          {...(parts ? { parts } : {})}
          leading={startsTurn(items[index - 1], item)}
        />
      ))}
    </div>
    </div>
  );
}
