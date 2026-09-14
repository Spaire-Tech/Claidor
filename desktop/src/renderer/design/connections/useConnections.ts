import { useCallback, useEffect, useMemo, useState } from 'react';

import { findConnection } from '../../../shared/connections/catalog';
import { mcpService } from '../../services/mcp';
import type { ConnectionsProps } from './Connections';
import { connectedIds } from './shelf';

/**
 * The connections shelf, connected.
 *
 * There is no store of connections: a connection **is** an MCP server
 * entry in the engine's config, so the list is read from
 * `mcpService.loadServers()` and there is one fact rather than a copy of
 * it that can drift.
 */

export interface ConnectionsState extends Omit<ConnectionsProps, 'query'> {
  /** Re-read after something outside this screen may have changed. */
  refresh: () => void;
}

export function useConnections(open: boolean): ConnectionsState {
  const [servers, setServers] = useState<readonly { name: string; enabled: boolean }[]>([]);
  const [busyId, setBusyId] = useState<string>();
  const [failure, setFailure] = useState<{ id: string; message: string }>();

  const refresh = useCallback(async () => {
    const loaded = await mcpService.loadServers();
    setServers(loaded.map(one => ({ name: one.name, enabled: one.enabled })));
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const connected = useMemo(() => connectedIds(servers), [servers]);

  const onConnect = useCallback(async (id: string) => {
    const item = findConnection(id);
    if (!item) return;
    setBusyId(id);
    // The previous failure belonged to the previous attempt. Leaving it
    // under the card while a new sign-in runs reads as the new one
    // having failed before it started.
    setFailure(undefined);
    try {
      const result = await window.electron?.connections?.connect?.(id);
      if (result && result.outcome !== 'connected') {
        setFailure({ id, message: result.message || `${item.name} was not connected.` });
      }
    } catch (error) {
      setFailure({
        id,
        message: error instanceof Error ? error.message : `${item.name} was not connected.`,
      });
    } finally {
      setBusyId(undefined);
      // Whatever happened, the engine's servers are the truth about it.
      await refresh();
    }
  }, [refresh]);

  const onDisconnect = useCallback(async (id: string) => {
    setBusyId(id);
    try {
      await window.electron?.connections?.disconnect?.(id);
    } finally {
      setBusyId(undefined);
      await refresh();
    }
  }, [refresh]);

  return {
    connected,
    busyId,
    failure,
    onConnect: (id: string) => { void onConnect(id); },
    onDisconnect: (id: string) => { void onDisconnect(id); },
    refresh: () => { void refresh(); },
  };
}
