import { useEffect, useRef } from 'react';

import { color, text } from '../tokens';
import { startsTurn } from './leading';
import {
  type AuthHandlers,
  type ChoiceHandlers,
  type PartHandlers,
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
  items, dayStamp, choice, auth, parts,
}: ThreadProps): JSX.Element {
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
          {...(parts ? { parts } : {})}
          leading={startsTurn(items[index - 1], item)}
        />
      ))}
    </div>
  );
}
