import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type ProposeConnectorAnswer,
  type ProposeConnectorAsk,
  ProposeConnectorBehavior,
} from '../../../shared/connections/proposal';
import { connectFromCatalogue } from '../connections/connect';
import { type ConnectorCardState, connectorItem, connectorRequestId } from './connectorCards';
import type { ConnectorHandlers } from './ThreadItemView';
import { type ConnectorItem, ConnectorOutcome } from './types';

/**
 * The cards an agent raises to propose a connector.
 *
 * Held beside the messages like the staffing cards, and answered through
 * the connectors bridge. One difference from those: a card that has been
 * answered stays, resolved, so the person sees "Installed" or "Not now"
 * on it rather than watching it vanish. It goes only when main says so
 * (`Dismissed`: the card timed out, or the turn ended).
 *
 * Install runs the Apps screen's own Connect (`connections/connect.ts`)
 * here in the renderer, which owns that flow; the bridge is only told
 * the outcome. Every card is answered exactly once: the answer is sent
 * as it is marked resolved, and a resolved card has nothing to press.
 */

interface Entry {
  ask: ProposeConnectorAsk;
  /** When the card arrived; fixed, so it does not move on every render. */
  at: number;
  state: ConnectorCardState;
}

export function useProposeConnector(): { items: readonly ConnectorItem[]; handlers: ConnectorHandlers } {
  const [entries, setEntries] = useState<readonly Entry[]>([]);

  useEffect(() => {
    const api = window.electron?.proposeConnector;
    if (!api) return undefined;
    const offRequested = api.onRequested((ask: ProposeConnectorAsk) => {
      setEntries(current =>
        current.some(one => one.ask.requestId === ask.requestId)
          ? current
          : [...current, { ask, at: Date.now(), state: {} }],
      );
    });
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

  /** Mark the card resolved and send the answer, once. */
  const settle = useCallback((requestId: string, resolved: ConnectorOutcome, answer: ProposeConnectorAnswer, failure?: string) => {
    if (answered.current.has(requestId)) return;
    answered.current.add(requestId);
    setEntries(current => current.map(one =>
      one.ask.requestId === requestId
        ? { ...one, state: { resolved, ...(failure ? { failure } : {}) } }
        : one));
    void window.electron?.proposeConnector?.respond(requestId, answer);
  }, []);

  const install = useCallback(async (requestId: string) => {
    const entry = entries.find(one => one.ask.requestId === requestId);
    if (!entry || entry.state.busy || entry.state.resolved || answered.current.has(requestId)) return;
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

  const items = useMemo(() => entries.flatMap(one => {
    const item = connectorItem(one.ask, one.state, one.at);
    return item ? [item] : [];
  }), [entries]);

  return { items, handlers };
}
