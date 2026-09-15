import { ipcMain, shell } from 'electron';

import { composioToolkit, type ConnectionItem, findConnection } from '../../../shared/connections/catalog';
import {
  ConnectionsIpcChannel,
  type ConnectResultIPC,
} from '../../../shared/connections/constants';
import { type ComposioApi, createComposioApi } from '../../libs/composio/composioApi';
import { connectThroughComposio, disconnectThroughComposio } from '../../libs/composio/connectThroughComposio';
import { listenForCallback } from '../../libs/connections/callbackServer';
import {
  ConnectOutcome,
  connectService,
  disconnectService,
  type ServerToWrite,
} from '../../libs/connections/connectService';
import type { OpenClawCliEnvironment } from '../../libs/connections/openclawCli';
import { runOpenClawCli } from '../../libs/connections/openclawCli';

/**
 * Connecting a service, from the renderer's side of the bridge.
 *
 * Everything that decides anything is in `libs/connections/` and
 * `libs/composio/`; this is the wiring, and the only thing it adds is the
 * two callbacks that touch the app's own state — writing the MCP server,
 * and taking it away again — and the one decision of which route a card
 * takes.
 *
 * Both routes ride the same two channels. The renderer's bridge exposes
 * `connect` and `disconnect` and nothing else, so the route is decided
 * here, by the same rule the shelf uses to draw the button: a Composio
 * key in Settings, and a slug on the card.
 */

export interface ConnectionHandlerDeps {
  /** Where the engine lives, so its CLI runs against the right state dir. */
  cliEnvironment: () => OpenClawCliEnvironment | null;
  /** Put the server into the store the config sync reads. */
  writeServer: (input: ServerToWrite) => Promise<void>;
  removeServer: (name: string) => Promise<void>;
  /** Push the store into `openclaw.json` and wait — `mcp login` reads it. */
  syncConfig: (reason: string) => Promise<void>;
  /**
   * The Composio key from Settings (`app_config.composioApiKey`), or
   * nothing. Absent or empty, no card takes the Composio route.
   */
  composioApiKey?: () => string | undefined;
}

/** The Composio route applies: a key, and a card Composio carries. */
export const takesComposioRoute = (
  item: ConnectionItem,
  apiKey: string | undefined,
): apiKey is string => !!apiKey?.trim() && !!composioToolkit(item);

export function registerConnectionHandlers(deps: ConnectionHandlerDeps): void {
  const notReady = (): ConnectResultIPC => ({
    outcome: ConnectOutcome.Failed,
    message: 'The engine is not running yet. Try again in a moment.',
  });

  // One client per key: the session it makes is good for as long as
  // the key is, and a new key is a new person as far as Composio knows.
  let composio: { apiKey: string; api: ComposioApi } | undefined;
  const composioFor = (apiKey: string): ComposioApi => {
    if (composio?.apiKey !== apiKey) composio = { apiKey, api: createComposioApi({ apiKey }) };
    return composio.api;
  };

  ipcMain.handle(
    ConnectionsIpcChannel.Connect,
    async (_event, id: string): Promise<ConnectResultIPC> => {
      const item = findConnection(id);
      if (!item) {
        return { outcome: ConnectOutcome.Unsupported, message: 'No such service.' };
      }

      const composioApiKey = deps.composioApiKey?.();
      if (takesComposioRoute(item, composioApiKey)) {
        // No engine needed: the sign-in lives on Composio's side and the
        // agent reaches it through the extension, which reads the key
        // from the config the sync writes.
        return connectThroughComposio(item, {
          api: composioFor(composioApiKey),
          openExternal: url => shell.openExternal(url),
        });
      }

      const environment = deps.cliEnvironment();
      if (!environment) return notReady();

      try {
        return await connectService(item, {
          environment,
          writeServer: async input => {
            await deps.writeServer(input);
            // The sync has to finish before the login runs: `mcp login`
            // reads openclaw.json to find the server, and a write that
            // is still in our database is not yet in that file.
            await deps.syncConfig('connection-added');
          },
          removeServer: async name => {
            await deps.removeServer(name);
            await deps.syncConfig('connection-removed');
          },
          listen: () => listenForCallback(),
          openExternal: url => shell.openExternal(url),
          runCli: args => runOpenClawCli(environment, args),
        });
      } catch (error) {
        console.error('[Connections] connect failed:', error);
        return {
          outcome: ConnectOutcome.Failed,
          message: error instanceof Error ? error.message : `${item.name} was not connected.`,
        };
      }
    },
  );

  ipcMain.handle(
    ConnectionsIpcChannel.Disconnect,
    async (_event, id: string): Promise<{ success: boolean; error?: string }> => {
      const item = findConnection(id);
      if (!item) return { success: false, error: 'No such service.' };

      const composioApiKey = deps.composioApiKey?.();
      if (takesComposioRoute(item, composioApiKey)) {
        try {
          await disconnectThroughComposio(item, composioFor(composioApiKey));
          return { success: true };
        } catch (error) {
          console.error('[Connections] composio disconnect failed:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'That could not be disconnected.',
          };
        }
      }

      const environment = deps.cliEnvironment();
      if (!environment) return { success: false, error: notReady().message };

      try {
        await disconnectService(item, {
          removeServer: async name => {
            await deps.removeServer(name);
            await deps.syncConfig('connection-removed');
          },
          runCli: args => runOpenClawCli(environment, args),
        });
        return { success: true };
      } catch (error) {
        console.error('[Connections] disconnect failed:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'That could not be disconnected.',
        };
      }
    },
  );
}
