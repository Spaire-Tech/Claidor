import { useEffect, useState } from 'react';

import { useStreamedText } from './useStreamedText';

/**
 * Whether the answer is still unfolding on screen.
 *
 * `streaming` is what the engine says (tokens are still landing); `shown`
 * and `length` are where the clock in front of the stream has got to. The
 * answer stays live while either is true: when the model stops, whatever
 * is left keeps unfolding at the same pace, and only once it has all been
 * shown does the wrapper drop the live class. After that it is never live
 * again (a re-render, a scroll, reopening the conversation paint it whole).
 */
export const isAnswerLive = (streaming: boolean, shown: number, length: number): boolean => (
  streaming || shown < length
);

export interface AnswerStream {
  /** The prefix of the answer to render. */
  text: string;
  /** True while words are still being revealed; drives the live class and the word plugin. */
  live: boolean;
}

/**
 * The paced prefix of an answer that is, or was just, streaming.
 *
 * A message that mounts finished (history, a reload) is painted whole at
 * once and never animates.
 */
export const useAnswerStream = (fullText: string, streaming: boolean): AnswerStream => {
  // Once settled, an answer never goes live again for the life of the mount.
  const [settled, setSettled] = useState(!streaming);
  const { text, revealing } = useStreamedText(fullText, !settled);

  useEffect(() => {
    if (settled) return;
    if (!isAnswerLive(streaming, text.length, fullText.length) && !revealing) {
      setSettled(true);
    }
  }, [settled, streaming, text.length, fullText.length, revealing]);

  return { text: settled ? fullText : text, live: !settled };
};

export default useAnswerStream;
