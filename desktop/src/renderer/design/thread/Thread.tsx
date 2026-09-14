import { useEffect, useRef } from 'react';

import { Orb, OrbMood } from '../orb/Orb';
import { color, motion, text } from '../tokens';
import { showsTypingLine } from './fromEngine';
import {
  type AuthHandlers,
  type ChoiceHandlers,
  ThreadItemView,
} from './ThreadItemView';
import type { ThreadItem } from './types';
import { useStaggered } from './useStaggered';

export interface ThreadProps {
  items: readonly ThreadItem[];
  /** The agent whose orb appears beside a status or a typing line. */
  agentId: string;
  /** "Today", "Friday" — the canvas puts one stamp at the top. */
  dayStamp?: string;
  /** True between sending and the first word arriving. */
  typing?: boolean;
  choice: ChoiceHandlers;
  auth: AuthHandlers;
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
  items, agentId, dayStamp, typing, choice, auth,
}: ThreadProps): JSX.Element {
  // "The text come like texts. not ai." A reply's later bubbles arrive
  // 420ms apart rather than all in one frame. History is never replayed —
  // see `stagger.ts`.
  const shown = useStaggered(items);

  const ref = useRef<HTMLDivElement>(null);
  // Whether the person is still at the bottom. Starts true so a freshly
  // opened thread lands at the newest message.
  const pinned = useRef(true);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const glue = (): void => {
      if (pinned.current) node.scrollTop = node.scrollHeight;
    };

    const onScroll = (): void => {
      // 48px of slack: a person who is nearly at the bottom means to be
      // at the bottom, and exact comparison fights sub-pixel scrolling.
      pinned.current = node.scrollHeight - node.clientHeight - node.scrollTop < 48;
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

  return (
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

      {shown.map(item => (
        <ThreadItemView key={item.id} item={item} choice={choice} auth={auth} />
      ))}

      {showsTypingLine(shown, typing || shown.length < items.length) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 8 }}>
          <Orb agentId={agentId} size={26} mood={OrbMood.Still} />
          <span
            style={{
              fontSize: text.message,
              background: `linear-gradient(90deg, ${color.shimmerInk} 0%, ${color.shimmerInk} 30%, ${color.shimmerPale} 55%, ${color.shimmerInk} 80%)`,
              backgroundSize: '220% 100%',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              animation: `fsr-shimmer ${motion.shimmer.duration} ${motion.shimmer.easing} infinite`,
            }}
          >
            Writing
          </span>
        </div>
      )}
    </div>
  );
}
