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
 * here, by the same rule the shelf uses to draw the button: a slug on
 * the card means Composio. There is no key to check — the sign-in goes
 * through the local token proxy to Claidor's server, which holds the key.
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
   * The local token proxy's Composio address (`composioBaseUrlFor`), or
   * nothing while the proxy is not up yet.
   */
  composioBaseUrl: () => string | undefined;
}

/** The Composio route applies: a card Composio carries. */
export const takesComposioRoute = (item: ConnectionItem): boolean => !!composioToolkit(item);

export function registerConnectionHandlers(deps: ConnectionHandlerDeps): void {
  const notReady = (): ConnectResultIPC => ({
    outcome: ConnectOutcome.Failed,
    message: 'The engine is not running yet. Try again in a moment.',
  });

  // One client per proxy address: the session it makes is good for as
  // long as the proxy is, and the proxy is up for the life of the app.
  let composio: { baseUrl: string; api: ComposioApi } | undefined;
  const composioFor = (baseUrl: string): ComposioApi => {
    if (composio?.baseUrl !== baseUrl) composio = { baseUrl, api: createComposioApi({ baseUrl }) };
    return composio.api;
  };

  ipcMain.handle(
    ConnectionsIpcChannel.Connect,
    async (_event, id: string): Promise<ConnectResultIPC> => {
      const item = findConnection(id);
      if (!item) {
        return { outcome: ConnectOutcome.Unsupported, message: 'No such service.' };
      }

      if (takesComposioRoute(item)) {
        // No engine needed: the sign-in lives on Composio's side and the
        // agent reaches it through the extension, which talks to the
        // same proxy.
        const baseUrl = deps.composioBaseUrl();
        if (!baseUrl) return notReady();
        return connectThroughComposio(item, {
          api: composioFor(baseUrl),
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

      if (takesComposioRoute(item)) {
        const baseUrl = deps.composioBaseUrl();
        if (!baseUrl) return { success: false, error: notReady().message };
        try {
          await disconnectThroughComposio(item, composioFor(baseUrl));
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
