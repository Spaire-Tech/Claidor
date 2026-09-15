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

  useEffect(() => {
    const delays = prefersInstant()
      ? new Map<string, number>()
      : staggerDelays(items, seen.current, opened.current?.at ?? 0);

    // Everything present is now accounted for, whether it is being held
    // or not — so a re-render cannot stage the same bubble twice.
    for (const item of items) seen.current.add(item.id);

    if (delays.size === 0) return undefined;

    setHeld(previous => {
      const next = new Set(previous);
      for (const id of delays.keys()) next.add(id);
      return next;
    });

    for (const [id, delay] of delays) {
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
  }, [items]);

  // Only on unmount. Clearing per-effect would cancel a reveal that is
  // still in flight every time the list changes for an unrelated reason.
  useEffect(() => () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }, []);

  return visibleItems(items, held);
}
