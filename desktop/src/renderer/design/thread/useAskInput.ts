import { useCallback, useEffect, useState } from 'react';

import {
  AskInputBehavior,
  type AskInputRequest,
} from '../../../shared/askInput/constants';
import type { SecretHandlers } from './ThreadItemView';
import { type SecretItem, ThreadItemKind } from './types';

/**
 * The cards asking the person to type something.
 *
 * Held here rather than in the message list, because these are not
 * messages. They arrive from a tool that is waiting on an answer, they
 * live only as long as the tool waits, and they leave no trace in the
 * conversation when they are gone. Putting them in the transcript would
 * mean a password prompt scrolls back into view a week later with an
 * empty box, which is both useless and alarming.
 *
 * Every card is answered exactly once. A second press does nothing: the
 * card comes out of the list before the answer is sent, so a double
 * click cannot send a password twice.
 */
export function useAskInput(): { items: readonly SecretItem[]; handlers: SecretHandlers } {
  const [pending, setPending] = useState<readonly AskInputRequest[]>([]);

  useEffect(() => {
    const api = window.electron?.askInput;
    if (!api) return undefined;

    const offRequested = api.onRequested((request: AskInputRequest) => {
      setPending(current =>
        // The bridge can retry a delivery. A card that appears twice is a
        // person wondering which one is real.
        current.some(one => one.requestId === request.requestId)
          ? current
          : [...current, request],
      );
    });

    const offDismissed = api.onDismissed(({ requestId }) => {
      setPending(current => current.filter(one => one.requestId !== requestId));
    });

    return () => {
      offRequested?.();
      offDismissed?.();
    };
  }, []);

  /** Take it off the screen first, then answer. Never the other way round. */
  const take = useCallback((id: string): boolean => {
    let found = false;
    setPending(current => {
      found = current.some(one => one.requestId === id);
      return found ? current.filter(one => one.requestId !== id) : current;
    });
    return found;
  }, []);

  const handlers: SecretHandlers = {
    onSubmit: useCallback((id: string, values: Record<string, string>, remember: boolean) => {
      if (!take(id)) return;
      void window.electron?.askInput?.respond(id, {
        behavior: AskInputBehavior.Provide,
        values,
        ...(remember ? { remember: true } : {}),
      });
    }, [take]),

    onDecline: useCallback((id: string) => {
      if (!take(id)) return;
      void window.electron?.askInput?.respond(id, { behavior: AskInputBehavior.Decline });
    }, [take]),
  };

  return {
    items: pending.map(request => ({
      kind: ThreadItemKind.Secret,
      id: request.requestId,
      text: request.prompt,
      ...(request.note ? { note: request.note } : {}),
      fields: request.fields,
      ...(request.offerToSave ? { offerToSave: true } : {}),
      at: Date.now(),
    } satisfies SecretItem)),
    handlers,
  };
}
