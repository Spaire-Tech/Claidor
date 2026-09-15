import { useCallback, useEffect, useMemo, useState } from 'react';

import { composioToolkit, findConnection } from '../../../shared/connections/catalog';
import { configService, ConfigServiceEvent } from '../../services/config';
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
 *
 * Composio is the one exception, and a marked one. Its sign-ins live on
 * Composio's servers; the main side confirms each one there before the
 * Connect call returns, and this hook then keeps the id in the app
 * config (`composioConnected`) so the card still says Connected after a
 * restart. The renderer has no bridge to ask Composio itself. When one
 * exists, that list goes and the read replaces it.
 */

export interface ConnectionsState extends Omit<ConnectionsProps, 'query'> {
  /** Re-read after something outside this screen may have changed. */
  refresh: () => void;
}

const composioSettings = (): { ready: boolean; connected: readonly string[] } => {
  const config = configService.getConfig();
  return {
    ready: !!config.composioApiKey?.trim(),
    connected: config.composioConnected ?? [],
  };
};

export function useConnections(open: boolean): ConnectionsState {
  const [servers, setServers] = useState<readonly { name: string; enabled: boolean }[]>([]);
  const [composio, setComposio] = useState(composioSettings);
  const [busyId, setBusyId] = useState<string>();
  const [failure, setFailure] = useState<{ id: string; message: string }>();

  const refresh = useCallback(async () => {
    const loaded = await mcpService.loadServers();
    setServers(loaded.map(one => ({ name: one.name, enabled: one.enabled })));
    setComposio(composioSettings());
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  // The key is typed in Settings, which is a different screen; the
  // service's own event is how this one hears about it.
  useEffect(() => {
    const reread = () => setComposio(composioSettings());
    window.addEventListener(ConfigServiceEvent.Updated, reread);
    return () => window.removeEventListener(ConfigServiceEvent.Updated, reread);
  }, []);

  const connected = useMemo(() => {
    const ids = new Set(connectedIds(servers));
    if (composio.ready) for (const id of composio.connected) ids.add(id);
    return ids as ReadonlySet<string>;
  }, [servers, composio]);

  const rememberComposio = useCallback(async (id: string, isConnected: boolean) => {
    const current = new Set(configService.getConfig().composioConnected ?? []);
    if (isConnected) current.add(id); else current.delete(id);
    await configService.updateConfig({ composioConnected: [...current].sort() });
  }, []);

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
      } else if (result && composio.ready && composioToolkit(item)) {
        // Main went through Composio for this card (same rule as
        // `actionFor`: a key, and a slug) and confirmed the sign-in there.
        await rememberComposio(id, true);
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
  }, [composio.ready, refresh, rememberComposio]);

  const onDisconnect = useCallback(async (id: string) => {
    const item = findConnection(id);
    setBusyId(id);
    try {
      const result = await window.electron?.connections?.disconnect?.(id);
      if (result?.success && item && composio.ready && composioToolkit(item)) {
        await rememberComposio(id, false);
      }
    } finally {
      setBusyId(undefined);
      await refresh();
    }
  }, [composio.ready, refresh, rememberComposio]);

  return {
    connected,
    busyId,
    failure,
    composioReady: composio.ready,
    onConnect: (id: string) => { void onConnect(id); },
    onDisconnect: (id: string) => { void onDisconnect(id); },
    refresh: () => { void refresh(); },
  };
}
