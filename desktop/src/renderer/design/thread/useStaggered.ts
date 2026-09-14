import { useEffect, useRef, useState } from 'react';

import { prefersInstant, staggerDelays, visibleItems } from './stagger';
import type { ThreadItem } from './types';

/**
 * The thread's items, with a just-arrived reply's later bubbles held back.
 *
 * The decisions live in `stagger.ts` and are tested without a clock. This
 * owns the two things that need one: what was already on screen, and the
 * timers releasing what is not.
 *
 * The first render seeds "already seen" with everything, so opening a
 * conversation shows its history at once. Only what arrives afterwards is
 * staged.
 */
export function useStaggered(items: readonly ThreadItem[]): ThreadItem[] {
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const timers = useRef<number[]>([]);
  const [held, setHeld] = useState<Set<string>>(new Set());

  if (!primed.current) {
    primed.current = true;
    for (const item of items) seen.current.add(item.id);
  }

  useEffect(() => {
    const delays = prefersInstant()
      ? new Map<string, number>()
      : staggerDelays(items, seen.current);

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
