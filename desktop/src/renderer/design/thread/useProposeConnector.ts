import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type ProposeConnectorAnswer,
  type ProposeConnectorAsk,
  ProposeConnectorBehavior,
  proposedConnection,
} from '../../../shared/connections/proposal';
import { cardAgentId, cardsForAgent } from '../../../shared/thread/cardAudience';
import { connectFromCatalogue } from '../connections/connect';
import {
  type ConnectorCardState,
  connectorItem,
  connectorNote,
  connectorNoteItem,
  connectorRequestId,
} from './connectorCards';
import type { ConnectorHandlers } from './ThreadItemView';
import { ConnectorOutcome, type SystemItem, type ThreadItem } from './types';

/**
 * The cards an agent raises to propose a connector.
 *
 * Held beside the messages like the staffing cards, and answered through
 * the connectors bridge.
 *
 * **The card belongs to one conversation.** The agent whose turn raised
 * it, which main stamps on the ask (`shared/thread/cardAudience.ts`).
 * Every pending card is kept here, whichever agent it belongs to — a
 * card must still be there when the person comes back to that thread —
 * and only the open agent's are handed out.
 *
 * **An answered card goes, and leaves a line.** It used to stay on the
 * screen, resolved, until main said to take it away; on a renderer-side
 * failure main never said, so it sat there for good. The founder, 18
 * September: *"when the thing was terminated, it didnt disapear. the
 * card stayed there."* So it is consumed by its answer, like an approval
 * card, and one quiet system line stays in that conversation instead.
 *
 * Install runs the Apps screen's own Connect (`connections/connect.ts`)
 * here in the renderer, which owns that flow; the bridge is only told
 * the outcome. Every card is answered exactly once: the answer is sent
 * as the card is taken off the screen.
 */

interface Entry {
  ask: ProposeConnectorAsk;
  /** The thread it belongs in, settled once when the card arrives. */
  agentId: string;
  /** When the card arrived; fixed, so it does not move on every render. */
  at: number;
  state: ConnectorCardState;
}

interface Note {
  agentId: string;
  item: SystemItem;
}

export function useProposeConnector(openAgentId: string): {
  items: readonly ThreadItem[];
  handlers: ConnectorHandlers;
} {
  const [entries, setEntries] = useState<readonly Entry[]>([]);
  const [notes, setNotes] = useState<readonly Note[]>([]);

  useEffect(() => {
    const api = window.electron?.proposeConnector;
    if (!api) return undefined;
    const offRequested = api.onRequested((ask: ProposeConnectorAsk) => {
      setEntries(current =>
        current.some(one => one.ask.requestId === ask.requestId)
          ? current
          : [...current, { ask, agentId: cardAgentId(ask), at: Date.now(), state: {} }],
      );
    });
    // The card timed out, or the turn ended without an answer. Nothing was
    // decided, so there is nothing to say: the card goes quietly.
    const offDismissed = api.onDismissed(({ requestId }) => {
      setEntries(current => current.filter(one => one.ask.requestId !== requestId));
    });
    return () => {
      offRequested?.();
      offDismissed?.();
    };
  }, []);

  const patch = useCallback((requestId: string, state: ConnectorCardState) => {
    setEntries(current => current.map(one =>
      one.ask.requestId === requestId ? { ...one, state: { ...one.state, ...state } } : one));
  }, []);

  // The cards already answered, kept outside React's state so a second
  // press in the same tick cannot answer twice: the bridge ignores a
  // second answer, but the tool must not be told two things.
  const answered = useRef(new Set<string>());
  // The cards as they were last drawn, so settling one can read the ask
  // it belongs to without doing that work inside a state updater — React
  // may run an updater twice, and twice here is the same line said twice.
  const drawn = useRef<readonly Entry[]>([]);
  useEffect(() => { drawn.current = entries; }, [entries]);

  /** Take the card off the screen, leave its line, and answer. Once. */
  const settle = useCallback((
    requestId: string,
    outcome: ConnectorOutcome,
    answer: ProposeConnectorAnswer,
    failure?: string,
  ) => {
    if (answered.current.has(requestId)) return;
    answered.current.add(requestId);
    const entry = drawn.current.find(one => one.ask.requestId === requestId);
    // Gone already: main dismissed it while the sign-in was running, which
    // means the card timed out. There is no card to consume and nothing to
    // say under, but the tool is still told — a late answer it has stopped
    // waiting for is ignored, and one it is still waiting for is the point.
    if (entry) {
      const at = Date.now();
      const name = proposedConnection(entry.ask)?.name ?? entry.ask.connectionId;
      setEntries(current => current.filter(one => one.ask.requestId !== requestId));
      setNotes(previous => [...previous, {
        agentId: entry.agentId,
        item: connectorNoteItem(requestId, connectorNote(name, outcome, failure), at),
      }]);
    }
    void window.electron?.proposeConnector?.respond(requestId, answer);
  }, []);

  const install = useCallback(async (requestId: string) => {
    const entry = entries.find(one => one.ask.requestId === requestId);
    if (!entry || entry.state.busy || answered.current.has(requestId)) return;
    // The card says "Connecting…" for the whole of the browser sign-in;
    // it is only consumed once that comes back one way or the other.
    patch(requestId, { busy: true });
    const attempt = await connectFromCatalogue(entry.ask.connectionId);
    if (attempt.connected) {
      settle(requestId, ConnectorOutcome.Connected, { behavior: ProposeConnectorBehavior.Connected });
      return;
    }
    const reason = attempt.message ?? 'The sign-in could not be started.';
    settle(requestId, ConnectorOutcome.Failed, { behavior: ProposeConnectorBehavior.Failed, reason }, reason);
  }, [entries, patch, settle]);

  const handlers = useMemo<ConnectorHandlers>(() => ({
    onInstall: itemId => {
      const requestId = connectorRequestId(itemId);
      if (requestId !== undefined) void install(requestId);
    },
    onDecline: itemId => {
      const requestId = connectorRequestId(itemId);
      if (requestId !== undefined) {
        settle(requestId, ConnectorOutcome.Declined, { behavior: ProposeConnectorBehavior.Declined });
      }
    },
  }), [install, settle]);

  // The open agent's, in the order they happened: a card at the moment it
  // went up, a line at the moment it was answered. Unsorted, a line about
  // a proposal dealt with ten minutes ago would sit under a card that is
  // still waiting, and read as that card's answer.
  const items = useMemo<readonly ThreadItem[]>(() => [
    ...cardsForAgent(entries, openAgentId).flatMap(one => {
      const item = connectorItem(one.ask, one.state, one.at);
      return item ? [item] : [];
    }),
    ...cardsForAgent(notes, openAgentId).map(one => one.item),
  ].sort((one, other) => one.at - other.at), [entries, notes, openAgentId]);

  return { items, handlers };
}
