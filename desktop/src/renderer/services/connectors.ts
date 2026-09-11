/**
 * Connections to accounts, from the renderer's side
 * (docs/maties/connectors.md). The window, the requests and the engine's
 * config all belong to the main process; this is only the wire to it.
 */
import {
  type ConnectorActionResult,
  ConnectorOutcome,
  type ConnectorsState,
  EMPTY_CONNECTORS_STATE,
} from '@shared/connectors/constants';

const failure = (error: unknown): ConnectorActionResult => ({
  outcome: ConnectorOutcome.Failed,
  state: EMPTY_CONNECTORS_STATE,
  error: error instanceof Error ? error.message : String(error),
});

export const connectorsService = {
  /** What is connected, and whether this person may connect anything. */
  async getState(): Promise<ConnectorsState> {
    try {
      return await window.electron.connectors.getState();
    } catch (error) {
      console.warn('[Connections] Could not read what is connected', error);
      return EMPTY_CONNECTORS_STATE;
    }
  },

  async connect(slug: string): Promise<ConnectorActionResult> {
    try {
      return await window.electron.connectors.connect(slug);
    } catch (error) {
      console.error('[Connections] The sign-in did not finish', error);
      return failure(error);
    }
  },

  async disconnect(accountId: string): Promise<ConnectorActionResult> {
    try {
      return await window.electron.connectors.disconnect(accountId);
    } catch (error) {
      console.error('[Connections] The account could not be disconnected', error);
      return failure(error);
    }
  },

  onChanged(callback: (state: ConnectorsState) => void): () => void {
    return window.electron.connectors.onChanged(callback);
  },
};
