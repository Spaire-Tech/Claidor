import { type ConnectorsState, EMPTY_CONNECTORS_STATE } from '@shared/connectors/constants';
import { useEffect, useMemo, useState } from 'react';

import { connectorsService } from '../../services/connectors';
import { type ConnectedApp, listConnectedApps } from './connectedApps';

/**
 * The apps this person has connected, kept fresh while the composer is
 * mounted. Read-only: connecting and disconnecting happen in Settings → Apps.
 */
export const useConnectedApps = (): ConnectedApp[] => {
  const [connectors, setConnectors] = useState<ConnectorsState>(EMPTY_CONNECTORS_STATE);

  useEffect(() => {
    let mounted = true;
    void connectorsService.getState().then((state) => {
      if (mounted) setConnectors(state);
    });
    const unsubscribe = connectorsService.onChanged((state) => {
      if (mounted) setConnectors(state);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return useMemo(() => listConnectedApps(connectors), [connectors]);
};
