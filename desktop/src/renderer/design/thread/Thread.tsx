import { useCallback, useEffect, useRef, useState } from 'react';

import { ChevronRightIcon } from '../icons';
import { CloudBlob } from '../orb/CloudBlob';
import { color, line, motion, radius, shadow, text } from '../tokens';
import { parseChoiceId } from './fromEngine';
import { startsTurn } from './leading';
import {
  type AuthHandlers,
  ChoiceDeck,
  type ChoiceHandlers,
  type ConnectorHandlers,
  type MessageHandlers,
  type PartHandlers,
  type RosterHandlers,
  type SecretHandlers,
  ThreadItemView,
} from './ThreadItemView';
import { type ChoiceItem, type ThreadItem, ThreadItemKind } from './types';

/**
 * The thread's rows: every item on its own, except a run of open
 * questions from one request, which is one card with chevrons
 * (`ChoiceDeck`). A question the engine asked on its own stays a
 * plain card, and a settled question stays where it was.
 */
export type ThreadRow =
  | { kind: 'item'; item: ThreadItem }
  | { kind: 'deck'; id: string; items: readonly ChoiceItem[] };

export function threadRows(items: readonly ThreadItem[]): ThreadRow[] {
  const rows: ThreadRow[] = [];
  for (const item of items) {
    const request = item.kind === ThreadItemKind.Choice && !item.resolved
      ? parseChoiceId(item.id)?.requestId
      : undefined;
    const last = rows[rows.length - 1];
    if (request !== undefined && last?.kind === 'deck' && parseChoiceId(last.items[0].id)?.requestId === request) {
      last.items = [...last.items, item as ChoiceItem];
      continue;
    }
    if (request !== undefined) {
      rows.push({ kind: 'deck', id: item.id, items: [item as ChoiceItem] });
      continue;
    }
    rows.push({ kind: 'item', item });
  }
  return rows;
}

/**
 * Scroll the thread to an earlier message: what a reference chip does.
 * A reply drawn as three bubbles has ids `<message>:0` and so on, so the
 * first item whose id starts with the message's is the one.
 */
export function scrollToThreadItem(messageId: string): boolean {
  const rows = document.querySelectorAll<HTMLElement>('[data-thread-item]');
  for (const row of rows) {
    const id = row.dataset.threadItem ?? '';
    if (id === messageId || id.startsWith(`${messageId}:`)) {
      (row.firstElementChild ?? row).scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    }
  }
  return false;
}

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
  /** What the roster card can answer with. */
  roster?: RosterHandlers;
  /** React, reply, copy the id: the cluster beside a bubble on hover. */
  actions?: MessageHandlers;
  /** Install or Not now on a connector card. */
  connector?: ConnectorHandlers;
  /**
   * The agent is working: its face hops beside a small bubble of three
   * dots, at the end of the thread. From the 15 September canvas, which
   * replaced the word "typing" with this. `avatar` is the agent's.
   */
  typing?: { avatar: number };
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
  items, dayStamp, choice, auth, parts, secret, roster, actions, connector, typing,
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
            height: 31, padding: '0 13px 0 15px', borderRadius: radius.pill,
            background: color.paper, border: `1px solid ${line.field}`,
            boxShadow: shadow.popover,
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
        padding: '24px 21px 17px',
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
      }}
    >
      {dayStamp && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 5 }}>
          <span style={{ fontSize: text.caption, color: color.muted }}>{dayStamp}</span>
        </div>
      )}

      {threadRows(items).map(row => (row.kind === 'deck' ? (
        <div key={row.id} data-thread-item={row.id} style={{ display: 'contents' }}>
          <ChoiceDeck items={row.items} handlers={choice} />
        </div>
      ) : (
        // `data-thread-item` is what a reference chip scrolls to
        // (`scrollToThreadItem`); `display: contents` keeps the wrapper
        // out of the layout.
        <div key={row.item.id} data-thread-item={row.item.id} style={{ display: 'contents' }}>
          <ThreadItemView
            item={row.item}
            choice={choice}
            auth={auth}
            {...(secret ? { secret } : {})}
            {...(roster ? { roster } : {})}
            {...(parts ? { parts } : {})}
            {...(actions ? { actions } : {})}
            {...(connector ? { connector } : {})}
            leading={startsTurn(items[items.indexOf(row.item) - 1], row.item)}
          />
        </div>
      )))}

      {/*
        The 13 September canvas had no line here — its whole indicator
        was the word "typing" in the header. The 15 September one has
        this: the agent's face at 24px, hopping, beside a bubble that is
        nothing but three dots. The header keeps a smaller set of the
        same dots; the two are one animation seen from two distances.
      */}
      {typing && (
        <div
          aria-label="Working"
          style={{
            display: 'flex', alignItems: 'flex-end', gap: 8, paddingTop: 5,
            animation: `fsr-message-in ${motion.messageIn.duration} ease-out both`,
          }}
        >
          <span style={{ width: 21, height: 21, flex: '0 0 auto', display: 'block', animation: 'fsr-think-hop 1.5s ease-in-out infinite' }}>
            <CloudBlob avatar={typing.avatar} size={21} />
          </span>
          <span
            style={{
              display: 'flex', alignItems: 'center', gap: 4, height: 21, padding: '0 9px',
              borderRadius: '13px 13px 13px 5px', background: color.paper,
              border: `1px solid ${line.field}`, boxShadow: shadow.flat,
              animation: 'fsr-think-bubble 1.5s ease-in-out infinite',
            }}
          >
            {[0, 0.16, 0.32].map(delay => (
              <span
                key={delay}
                style={{
                  width: 5, height: 5, borderRadius: '50%', background: color.ink,
                  animation: `fsr-think-dot 1.2s ease-in-out ${delay}s infinite`,
                }}
              />
            ))}
          </span>
        </div>
      )}
    </div>
    </div>
  );
}
