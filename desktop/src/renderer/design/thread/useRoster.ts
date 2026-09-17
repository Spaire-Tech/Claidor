import { useCallback, useEffect, useMemo, useState } from 'react';

import { type RosterAnswer, type RosterAsk, RosterBehavior } from '../../../shared/staffing/roster';
import { cardsForAgent } from '../../../shared/thread/cardAudience';
import type { RosterHandlers } from './RosterCard';
import { rosterItem, rosterRequestId } from './rosterCards';
import type { RosterItem } from './types';

/**
 * The roster cards, held beside the messages like the staffing cards:
 * they come from a tool waiting on an answer, live as long as it waits,
 * and leave no trace. What stays in the thread is Yodo's own lines —
 * "Projects Manager is in." — once the tool returns.
 *
 * Every card is answered exactly once: it comes off the screen before
 * the answer is sent.
 *
 * **It belongs to one conversation**, like the other cards held beside
 * the messages. In practice that is always the main agent's — the roster
 * is step two of onboarding and Yodo raises it, and a card main cannot
 * attribute lands in his thread anyway — but it is filtered by the agent
 * the ask names rather than pinned to main, so a role agent reaching for
 * `propose_team` gets its card in its own thread
 * (`shared/thread/cardAudience.ts`).
 */
export function useRoster(openAgentId: string): { items: readonly RosterItem[]; handlers: RosterHandlers } {
  const [pending, setPending] = useState<readonly RosterAsk[]>([]);

  useEffect(() => {
    const api = window.electron?.roster;
    if (!api) return undefined;
    const offRequested = api.onRequested((ask: RosterAsk) => {
      setPending(current =>
        current.some(one => one.requestId === ask.requestId) ? current : [...current, ask],
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

  const answer = useCallback((itemId: string, reply: RosterAnswer) => {
    const requestId = rosterRequestId(itemId);
    if (requestId === undefined) return;
    let found = false;
    setPending(current => {
      found = current.some(one => one.requestId === requestId);
      return found ? current.filter(one => one.requestId !== requestId) : current;
    });
    if (!found) return;
    void window.electron?.roster?.respond(requestId, reply);
  }, []);

  const handlers = useMemo<RosterHandlers>(() => ({
    onStandUp: (itemId, slugs) => answer(itemId, { behavior: RosterBehavior.StandUp, slugs }),
    onSomethingElse: (itemId, text) => answer(itemId, { behavior: RosterBehavior.SomethingElse, text }),
    onDecline: itemId => answer(itemId, { behavior: RosterBehavior.Decline }),
  }), [answer]);

  return {
    items: cardsForAgent(pending, openAgentId).map(ask => rosterItem(ask, Date.now())),
    handlers,
  };
}
