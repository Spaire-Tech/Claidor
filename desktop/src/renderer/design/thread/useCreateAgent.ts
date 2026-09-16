import { useCallback, useEffect, useState } from 'react';

import {
  type CreateAgentAsk,
  CreateAgentBehavior,
} from '../../../shared/staffing/constants';
import { agentService } from '../../services/agent';
import { staffingItem } from './staffingCards';
import type { AuthItem } from './types';

/**
 * The cards asking whether to stand up an agent.
 *
 * Held beside the messages like the ask-input cards, and for the same
 * reason: they arrive from a tool that is waiting on an answer, live as
 * long as it waits, and leave no trace. What is left in the thread
 * afterwards is Yodo's own line — "Projects Manager is in." — which he
 * says once the tool returns, as the founder's page has it.
 *
 * Every card is answered exactly once: it comes off the screen before
 * the answer is sent.
 */
export function useCreateAgent(agentName: string | undefined): {
  items: readonly AuthItem[];
  onDecide: (requestId: string, allow: boolean) => void;
} {
  const [pending, setPending] = useState<readonly CreateAgentAsk[]>([]);

  useEffect(() => {
    const api = window.electron?.createAgent;
    if (!api) return undefined;

    const offRequested = api.onRequested((ask: CreateAgentAsk) => {
      setPending(current =>
        current.some(one => one.requestId === ask.requestId) ? current : [...current, ask],
      );
    });
    const offDismissed = api.onDismissed(({ requestId }) => {
      setPending(current => current.filter(one => one.requestId !== requestId));
    });
    // The agent exists: the sidebar must show it without anybody pressing
    // anything, which is what the create screen's own path does.
    const offCreated = api.onCreated(() => {
      void agentService.loadAgents();
    });

    return () => {
      offRequested?.();
      offDismissed?.();
      offCreated?.();
    };
  }, []);

  const onDecide = useCallback((requestId: string, allow: boolean) => {
    let found = false;
    setPending(current => {
      found = current.some(one => one.requestId === requestId);
      return found ? current.filter(one => one.requestId !== requestId) : current;
    });
    if (!found) return;
    void window.electron?.createAgent?.respond(requestId, {
      behavior: allow ? CreateAgentBehavior.Allow : CreateAgentBehavior.Decline,
    });
  }, []);

  return {
    items: pending.map(ask => staffingItem(ask, agentName, Date.now())),
    onDecide,
  };
}
