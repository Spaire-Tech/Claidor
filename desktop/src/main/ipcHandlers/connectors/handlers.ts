import { ipcMain } from 'electron';

import {
  type ConnectorActionResult,
  ConnectorOutcome,
  ConnectorsIpc,
  type ConnectorsState,
} from '../../../shared/connectors/constants';
import type { ConnectorsService } from '../../libs/connectors/connectorsService';

export interface ConnectorsHandlerDeps {
  getService: () => ConnectorsService;
}

/** Slugs and account ids come from the renderer, so they are checked here. */
const requireIdentifier = (value: unknown): string => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > 200) {
    throw new Error('Invalid connector identifier.');
  }
  return text;
};

const failed = (service: ConnectorsService, error: unknown): ConnectorActionResult => ({
  outcome: ConnectorOutcome.Failed,
  state: service.getState(),
  error: error instanceof Error ? error.message : String(error),
});

export function registerConnectorsIpcHandlers({ getService }: ConnectorsHandlerDeps): void {
  ipcMain.handle(ConnectorsIpc.GetState, async (): Promise<ConnectorsState> => {
    const service = getService();
    try {
      return await service.refresh();
    } catch (error) {
      console.error('[Connectors] could not read what is connected:', error);
      return service.getState();
    }
  });

  ipcMain.handle(ConnectorsIpc.Connect, async (_event, slug: unknown) => {
    const service = getService();
    try {
      return await service.connect(requireIdentifier(slug));
    } catch (error) {
      console.error('[Connectors] the sign-in did not finish:', error);
      return failed(service, error);
    }
  });

  ipcMain.handle(ConnectorsIpc.Disconnect, async (_event, accountId: unknown) => {
    const service = getService();
    try {
      return await service.disconnect(requireIdentifier(accountId));
    } catch (error) {
      console.error('[Connectors] the account could not be disconnected:', error);
      return failed(service, error);
    }
  });
}
