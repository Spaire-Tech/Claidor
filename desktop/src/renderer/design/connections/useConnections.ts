import { useCallback, useEffect, useMemo, useState } from 'react';

import { composioToolkit, findConnection } from '../../../shared/connections/catalog';
import { mcpService } from '../../services/mcp';
import { composioConnected, connectFromCatalogue, rememberComposio } from './connect';
import type { ConnectionsProps } from './Connections';
import { connectedIds } from './shelf';

/**
 * The connections shelf, connected.
 *
 * There is no store of connections: a connection **is** an MCP server
 * entry in the engine's config, so the list is read from
 * `mcpService.loadServers()` and there is one fact rather than a copy of
 * it that can drift.
 *
 * Composio is the one exception, and a marked one. Its sign-ins live on
 * Composio's servers; the main side confirms each one there before the
 * Connect call returns, and the id is then kept in the app config
 * (`composioConnected`, in `connect.ts`) so the card still says
 * Connected after a restart. The renderer has no bridge to ask Composio
 * itself. When one exists, that list goes and the read replaces it.
 * Nothing has to be typed for any of it: Claidor's key is on the server.
 *
 * The sign-in itself is `connectFromCatalogue`, shared with the
 * connector card an agent raises in the thread: Install there is this
 * Connect, not a second one.
 */

export interface ConnectionsState extends Omit<ConnectionsProps, 'query'> {
  /** Re-read after something outside this screen may have changed. */
  refresh: () => void;
}

export function useConnections(open: boolean): ConnectionsState {
  const [servers, setServers] = useState<readonly { name: string; enabled: boolean }[]>([]);
  const [viaComposio, setViaComposio] = useState(composioConnected);
  const [busyId, setBusyId] = useState<string>();
  const [failure, setFailure] = useState<{ id: string; message: string }>();

  const refresh = useCallback(async () => {
    const loaded = await mcpService.loadServers();
    setServers(loaded.map(one => ({ name: one.name, enabled: one.enabled })));
    setViaComposio(composioConnected());
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const connected = useMemo(() => {
    const ids = new Set(connectedIds(servers));
    for (const id of viaComposio) ids.add(id);
    return ids as ReadonlySet<string>;
  }, [servers, viaComposio]);

  const onConnect = useCallback(async (id: string) => {
    if (!findConnection(id)) return;
    setBusyId(id);
    // The previous failure belonged to the previous attempt. Leaving it
    // under the card while a new sign-in runs reads as the new one
    // having failed before it started.
    setFailure(undefined);
    try {
      const attempt = await connectFromCatalogue(id);
      if (!attempt.connected && attempt.message) setFailure({ id, message: attempt.message });
    } finally {
      setBusyId(undefined);
      // Whatever happened, the engine's servers are the truth about it.
      await refresh();
    }
  }, [refresh]);

  const onDisconnect = useCallback(async (id: string) => {
    const item = findConnection(id);
    setBusyId(id);
    try {
      const result = await window.electron?.connections?.disconnect?.(id);
      if (result?.success && item && composioToolkit(item)) {
        await rememberComposio(id, false);
      }
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
