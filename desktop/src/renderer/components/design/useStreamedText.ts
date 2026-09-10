import { useEffect, useRef, useState } from 'react';

/**
 * The clock in front of the stream (docs/maties/design.md, section 4).
 *
 * Tokens land in bursts. Painting them as they land lurches. So the text
 * shown is a prefix of the text received, advanced every `tickMs` by
 * `max(minStep, round(length / paceDivisor))` characters: whatever the
 * answer's length it unfolds in about ninety ticks, a little over two
 * seconds, so a short answer is not laboured and a long one does not
 * crawl. Kept from the Swens build, where the founder saw the alternative
 * (a fraction of what is left) empty a whole answer in a flash.
 */
export const STREAM_TICK_MS = 26;
export const STREAM_PACE_DIVISOR = 90;
export const STREAM_MIN_STEP = 2;

export const streamStep = (fullLength: number): number => (
  Math.max(STREAM_MIN_STEP, Math.round(fullLength / STREAM_PACE_DIVISOR))
);

/** Where the shown prefix should be after one tick. */
export const advanceShown = (shown: number, fullLength: number): number => (
  Math.min(fullLength, shown + streamStep(fullLength))
);

export interface StreamedText {
  /** The prefix to paint. */
  text: string;
  /** True while the clock is still catching up with what was received. */
  revealing: boolean;
}

/**
 * `live` is true while the answer is still arriving or still unfolding.
 * A text that arrives finished (history, a reload) is shown at once.
 */
export const useStreamedText = (fullText: string, live: boolean): StreamedText => {
  const [shown, setShown] = useState<number>(live ? 0 : fullText.length);
  const shownRef = useRef(shown);
  const wasLive = useRef(live);

  useEffect(() => {
    if (!live) {
      // Finished text is painted whole, and stays whole on re-renders.
      if (!wasLive.current) {
        shownRef.current = fullText.length;
        setShown(fullText.length);
      }
      wasLive.current = false;
      return undefined;
    }
    wasLive.current = true;
    const timer = window.setInterval(() => {
      const next = advanceShown(shownRef.current, fullText.length);
      if (next !== shownRef.current) {
        shownRef.current = next;
        setShown(next);
      }
    }, STREAM_TICK_MS);
    return () => window.clearInterval(timer);
  }, [fullText.length, live]);

  // When a live answer ends, whatever is left keeps unfolding at the same
  // pace until it is all shown; the interval above handles it because
  // `live` is only lowered by the caller once the reveal has caught up,
  // or the caller passes `live` false and we paint the rest at once.
  const at = live ? Math.min(shown, fullText.length) : fullText.length;
  return { text: fullText.slice(0, at), revealing: live && at < fullText.length };
};
