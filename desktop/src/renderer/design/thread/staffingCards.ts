import { type CreateAgentAsk, describeBrief } from '../../../shared/staffing/constants';
import type { AuthHandlers } from './ThreadItemView';
import { AuthDecision, type AuthItem, ThreadItemKind } from './types';

/**
 * Yodo asking to stand up an agent, as a card.
 *
 * The permission card, because that is what it is: an action on this
 * computer, asked first. The brief sits behind the disclosure where a
 * command would, the buttons say Stand up and Not now, and the id is
 * marked so the answer goes to the staffing bridge rather than to the
 * engine's approval. Pure, so the mapping and the routing are tested
 * without a window.
 */

const STAFFING_ID_PREFIX = 'staff:';

export const staffingItemId = (requestId: string): string => `${STAFFING_ID_PREFIX}${requestId}`;

export const staffingRequestId = (itemId: string): string | undefined =>
  itemId.startsWith(STAFFING_ID_PREFIX) ? itemId.slice(STAFFING_ID_PREFIX.length) : undefined;

/** "Allow Yodo to continue — standing up Projects Manager, Project ops?" */
export function staffingItem(ask: CreateAgentAsk, agentName: string | undefined, at: number): AuthItem {
  const who = agentName?.trim() || 'this agent';
  return {
    kind: ThreadItemKind.Auth,
    id: staffingItemId(ask.requestId),
    text: `Allow ${who} to continue — standing up ${ask.name}, ${ask.label}?`,
    note: ask.job,
    command: describeBrief(ask),
    staffing: true,
    at,
  };
}

/**
 * One set of card buttons for two kinds of card. A staffing answer goes
 * to its own handler; anything else goes where it always did.
 */
export function composeAuthHandlers(
  engine: AuthHandlers,
  staffing: { onDecide: (requestId: string, allow: boolean) => void },
): AuthHandlers {
  return {
    onDecide: (itemId, decision) => {
      const requestId = staffingRequestId(itemId);
      if (requestId !== undefined) {
        staffing.onDecide(requestId, decision !== AuthDecision.Never);
        return;
      }
      engine.onDecide(itemId, decision);
    },
    ...(engine.onDismiss ? { onDismiss: engine.onDismiss } : {}),
  };
}
