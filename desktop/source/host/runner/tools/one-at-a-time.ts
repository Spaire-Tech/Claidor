/**
 * Runs a helper's screen and page actions one after another, in the order
 * the model asked for them. The loop starts every tool call of a step at
 * once (`packages/agent/tool-stream-executor.ts`), which is right for reads
 * and wrong for hands: on 18 October 2026 a browser helper asked for a click
 * on a checkout's email field and a key press in the same step, the press
 * landed first, and the field never got its letter.
 */
export function createOneAtATime(): <T>(action: () => Promise<T>) => Promise<T> {
  let last: Promise<unknown> = Promise.resolve();
  return <T>(action: () => Promise<T>): Promise<T> => {
    const next = last.then(action, action);
    last = next.catch(() => undefined);
    return next;
  };
}
