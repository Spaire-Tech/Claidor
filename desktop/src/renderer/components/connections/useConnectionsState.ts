import { useEffect } from 'react';
import { useDispatch } from 'react-redux';

import { imService } from '../../services/im';
import { mcpService } from '../../services/mcp';
import { setMcpServers } from '../../store/slices/mcpSlice';

/**
 * Loads what « Connected » is read from: the MCP servers into the store
 * (and keeps them fresh while mounted) and the IM configuration. The cards
 * then read both through selectors.
 */
export const useConnectionsState = (): void => {
  const dispatch = useDispatch();

  useEffect(() => {
    let active = true;
    const load = async () => {
      const servers = await mcpService.loadServers();
      if (active) dispatch(setMcpServers(servers));
    };
    void load();
    const unsubscribe = mcpService.onChanged(() => { void load(); });
    void imService.loadConfig();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [dispatch]);
};
