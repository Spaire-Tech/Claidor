import {
  type ConnectorActionResult,
  ConnectorOutcome,
  type ConnectorsState,
  EMPTY_CONNECTORS_STATE,
} from '@shared/connectors/constants';
import { useCallback, useEffect, useRef, useState } from 'react';

import { connectorsService } from '../../services/connectors';
import { imService } from '../../services/im';

export interface ConnectionsState {
  /** What Claidor says is connected, and whether this person may connect. */
  readonly connectors: ConnectorsState;
  /** The service whose window is open or whose request is in flight. */
  readonly busySlug: string | null;
  connect: (appSlug: string) => Promise<ConnectorActionResult>;
  disconnect: (appSlug: string, accountId: string) => Promise<ConnectorActionResult>;
}

/**
 * Loads what « Connected » is read from: the accounts Claidor holds for this
 * person (and keeps them fresh while mounted) and the IM configuration. The
 * cards then read both.
 */
export const useConnectionsState = (): ConnectionsState => {
  const [connectors, setConnectors] = useState<ConnectorsState>(EMPTY_CONNECTORS_STATE);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void connectorsService.getState().then((state) => {
      if (mounted.current) setConnectors(state);
    });
    const unsubscribe = connectorsService.onChanged((state) => {
      if (mounted.current) setConnectors(state);
    });
    void imService.loadConfig();
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, []);

  const run = useCallback(async (
    appSlug: string,
    action: () => Promise<ConnectorActionResult>,
  ): Promise<ConnectorActionResult> => {
    setBusySlug(appSlug);
    try {
      const result = await action();
      if (mounted.current && result.outcome !== ConnectorOutcome.Failed) {
        setConnectors(result.state);
      }
      return result;
    } finally {
      if (mounted.current) setBusySlug(null);
    }
  }, []);

  const connect = useCallback((appSlug: string) => (
    run(appSlug, () => connectorsService.connect(appSlug))
  ), [run]);

  const disconnect = useCallback((appSlug: string, accountId: string) => (
    run(appSlug, () => connectorsService.disconnect(accountId))
  ), [run]);

  return { connectors, busySlug, connect, disconnect };
};
