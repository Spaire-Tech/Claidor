import { composioToolkit, findConnection } from '../../../shared/connections/catalog';
import { configService } from '../../services/config';

/**
 * One sign-in from the catalogue, the way the Apps screen's Connect runs
 * it. Shared by that screen (`useConnections`) and the connector card an
 * agent raises in the thread (`useProposeConnector`), so Install on the
 * card is the same Connect and not a second one that drifts.
 *
 * Composio is the one piece of bookkeeping. Its sign-ins live on
 * Composio's servers; the main side confirms each one there before the
 * Connect call returns, and the id is kept in the app config
 * (`composioConnected`) so the card still says Connected after a
 * restart. The renderer has no bridge to ask Composio itself.
 */

/** The ids signed in through Composio, as the app config remembers them. */
export const composioConnected = (): readonly string[] => configService.getConfig().composioConnected ?? [];

export const rememberComposio = async (id: string, isConnected: boolean): Promise<void> => {
  const current = new Set(configService.getConfig().composioConnected ?? []);
  if (isConnected) current.add(id); else current.delete(id);
  await configService.updateConfig({ composioConnected: [...current].sort() });
};

export type ConnectAttempt =
  | { connected: true }
  /** Not connected. No message when there was no bridge to ask at all. */
  | { connected: false; message?: string };

/**
 * Run the sign-in for one catalogue id. Resolves when the person has
 * finished with the provider's page, or given up on it — never before.
 * Never throws: whatever went wrong is a sentence in the result.
 */
export async function connectFromCatalogue(id: string): Promise<ConnectAttempt> {
  const item = findConnection(id);
  if (!item) return { connected: false, message: `${id} is not a service this app can connect.` };
  try {
    const result = await window.electron?.connections?.connect?.(id);
    if (!result) return { connected: false };
    if (result.outcome !== 'connected') {
      return { connected: false, message: result.message || `${item.name} was not connected.` };
    }
    if (composioToolkit(item)) {
      // Main went through Composio for this card (same rule as
      // `actionFor`: a slug) and confirmed the sign-in there.
      await rememberComposio(id, true);
    }
    return { connected: true };
  } catch (error) {
    return {
      connected: false,
      message: error instanceof Error && error.message ? error.message : `${item.name} was not connected.`,
    };
  }
}
