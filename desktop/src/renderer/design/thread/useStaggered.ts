import { useEffect, useRef, useState } from 'react';

import { prefersInstant, staggerDelays, visibleItems } from './stagger';
import type { ThreadItem } from './types';

/**
 * The thread's items, with a just-arrived reply's later bubbles held back.
 *
 * The decisions live in `stagger.ts` and are tested without a clock. This
 * owns the things that need one: when the conversation was opened, what
 * was already on screen, and the timers releasing what is not.
 *
 * Opening a conversation shows its history at once. That is two rules,
 * and the first build had only one of them. Everything on screen at the
 * first render is "seen" — but a conversation's messages load a beat
 * after the click that opens it, so on switching agents every reply in
 * the new one was unseen, and the thread performed its history bubble by
 * bubble while the sidebar row had already shown the last line. So the
 * second rule: anything said before `conversation` was opened is history,
 * whenever it turns up.
 *
 * What to hold is decided in the render that first sees the reply, not
 * in the effect after it. Deciding in the effect meant one committed
 * frame with every bubble showing before the later ones were taken
 * back — and, since the shell reads "is anything held" to decide what
 * the sidebar row may say, that frame was enough for the row to say the
 * reply's last line before the first bubble was down.
 */
export function useStaggered(items: readonly ThreadItem[], conversation: string): ThreadItem[] {
  const seen = useRef<Set<string>>(new Set());
  const opened = useRef<{ conversation: string; at: number }>();
  const timers = useRef<number[]>([]);
  const [held, setHeld] = useState<Set<string>>(new Set());

  if (opened.current?.conversation !== conversation) {
    opened.current = { conversation, at: Date.now() };
    seen.current = new Set(items.map(item => item.id));
    // A bubble still held from the last conversation belongs to it, not
    // to this one. The timers stay: releasing an id nobody holds is nothing.
    if (held.size) setHeld(new Set());
  }

  // New this render. Empty again on the next one, because the effect
  // below marks them seen; by then they are in `held`.
  const arriving = prefersInstant()
    ? new Map<string, number>()
    : staggerDelays(items, seen.current, opened.current.at);

  useEffect(() => {
    // Everything present is now accounted for, whether it is being held
    // or not — so a re-render cannot stage the same bubble twice.
    for (const item of items) seen.current.add(item.id);

    if (arriving.size === 0) return undefined;

    setHeld(previous => {
      const next = new Set(previous);
      for (const id of arriving.keys()) next.add(id);
      return next;
    });

    for (const [id, delay] of arriving) {
      const timer = window.setTimeout(() => {
        setHeld(previous => {
          const next = new Set(previous);
          next.delete(id);
          return next;
        });
      }, delay);
      timers.current.push(timer);
    }

    return undefined;
    // `arriving` is a function of `items` and the refs; it is what this
    // effect exists to act on, and it is recomputed with `items`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Only on unmount. Clearing per-effect would cancel a reveal that is
  // still in flight every time the list changes for an unrelated reason.
  useEffect(() => () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }, []);

  if (arriving.size === 0) return visibleItems(items, held);
  const hidden = new Set(held);
  for (const id of arriving.keys()) hidden.add(id);
  return visibleItems(items, hidden);
}
