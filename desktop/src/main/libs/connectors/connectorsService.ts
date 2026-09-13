/**
 * Connections to accounts, from the app's side (docs/maties/connectors.md).
 *
 * Connect asks Claidor for a sign-in URL and opens it in the person's own
 * browser. Claidor is the only thing that knows whether the sign-in
 * finished, so we find out by asking Claidor again, never by reading the
 * page: nothing is injected anywhere and no cookie is read.
 *
 * **Why the person's own browser and not a window of ours.** A window of
 * ours starts with an empty cookie jar and no chrome — no address bar, no
 * way back. That is fatal in the connection service's development mode,
 * which requires the person to be signed in to the service itself in the
 * same browser: our window could never be that browser, and offered no way
 * to become it. Their own browser already holds the session, and shows the
 * real address of the page being signed in to, which is the right thing to
 * see when signing in to anything.
 */

import { shell } from 'electron';

import {
  type ConnectorActionResult,
  ConnectorOutcome,
  type ConnectorsState,
  EMPTY_CONNECTORS_STATE,
} from '../../../shared/connectors/constants';
import {
  ConnectorRequestStatus,
  type ConnectorsClientDeps,
  deleteConnectorAccount,
  fetchConnectorsState,
  requestConnectorLink,
} from './connectorsClient';

/**
 * How often Claidor is asked whether the sign-in finished, and for how long.
 *
 * The browser is somebody else's window now, so there is no « they closed
 * it » to hear: abandoning a sign-in ends in this limit instead. Five
 * minutes is long enough for a slow sign-in with two factors and short
 * enough that a forgotten one stops asking.
 */
const POLL_INTERVAL_MS = 2_000;
const POLL_LIMIT_MS = 5 * 60_000;

export interface ConnectorsServiceDeps extends ConnectorsClientDeps {
  isSignedIn: () => boolean;
  /** The state changed: tell the renderer. */
  onStateChanged?: (state: ConnectorsState) => void;
  /** The set of connected services changed: the engine's config must follow. */
  onConnectionsChanged?: () => void;
}

const slugsOf = (state: ConnectorsState): string[] => (
  [...new Set(state.connections.map((connection) => connection.slug))].sort()
);

const sameConnections = (a: ConnectorsState, b: ConnectorsState): boolean => (
  slugsOf(a).join(',') === slugsOf(b).join(',')
);

export class ConnectorsService {
  private readonly deps: ConnectorsServiceDeps;
  private state: ConnectorsState = EMPTY_CONNECTORS_STATE;

  constructor(deps: ConnectorsServiceDeps) {
    this.deps = deps;
  }

  /** The last answer from Claidor; `loaded` is false until there has been one. */
  getState(): ConnectorsState {
    return this.state;
  }

  /** The services the engine should be given an MCP entry for. */
  getConnectedSlugs(): string[] {
    return this.state.entitled ? slugsOf(this.state) : [];
  }

  /** Signing out empties the shelf until somebody signs in again. */
  reset(): void {
    this.applyState(EMPTY_CONNECTORS_STATE);
  }

  async refresh(): Promise<ConnectorsState> {
    if (!this.deps.isSignedIn()) {
      this.applyState(EMPTY_CONNECTORS_STATE);
      return this.state;
    }
    const result = await fetchConnectorsState(this.deps);
    if (result.status === ConnectorRequestStatus.Ok) {
      this.applyState(result.data);
    } else if (result.status === ConnectorRequestStatus.NotEntitled) {
      this.applyState({ entitled: false, connections: [], loaded: true });
    } else {
      console.warn(`[Connectors] could not read what is connected: ${result.error}`);
    }
    return this.state;
  }

  async connect(slug: string): Promise<ConnectorActionResult> {
    if (!this.deps.isSignedIn()) {
      return { outcome: ConnectorOutcome.Failed, state: this.state, error: 'Not signed in.' };
    }
    const link = await requestConnectorLink(this.deps, slug);
    if (link.status === ConnectorRequestStatus.NotEntitled) {
      this.applyState({ ...this.state, entitled: false, loaded: true });
      return { outcome: ConnectorOutcome.NotEntitled, state: this.state };
    }
    if (link.status === ConnectorRequestStatus.Failed) {
      return { outcome: ConnectorOutcome.Failed, state: this.state, error: link.error };
    }

    const connected = await this.runSignIn(slug, link.data.url);
    await this.refresh();
    return {
      outcome: connected ? ConnectorOutcome.Connected : ConnectorOutcome.Cancelled,
      state: this.state,
    };
  }

  async disconnect(accountId: string): Promise<ConnectorActionResult> {
    if (!this.deps.isSignedIn()) {
      return { outcome: ConnectorOutcome.Failed, state: this.state, error: 'Not signed in.' };
    }
    const result = await deleteConnectorAccount(this.deps, accountId);
    if (result.status === ConnectorRequestStatus.NotEntitled) {
      this.applyState({ ...this.state, entitled: false, loaded: true });
      return { outcome: ConnectorOutcome.NotEntitled, state: this.state };
    }
    if (result.status === ConnectorRequestStatus.Failed) {
      return { outcome: ConnectorOutcome.Failed, state: this.state, error: result.error };
    }
    await this.refresh();
    return { outcome: ConnectorOutcome.Disconnected, state: this.state };
  }

  /**
   * Nothing of ours is left open by a sign-in — it happens in the person's
   * own browser — so quitting has nothing to close. Kept because `main.ts`
   * calls it on quit, and because a future provider may need it back.
   */
  dispose(): void {
    // Intentionally empty.
  }

  private applyState(next: ConnectorsState): void {
    const previous = this.state;
    const unchanged = previous.loaded === next.loaded
      && previous.entitled === next.entitled
      && sameConnections(previous, next);
    if (unchanged) return;
    this.state = next;
    this.deps.onStateChanged?.(next);
    if (previous.entitled !== next.entitled || !sameConnections(previous, next)) {
      this.deps.onConnectionsChanged?.();
    }
  }

  /**
   * Hand the sign-in to the person's own browser and settle when the service
   * turns up as connected. Resolves true when it is connected.
   */
  private runSignIn(slug: string, url: string): Promise<boolean> {
    // The address carries a one-use token, so neither it nor a failure
    // quoting it is ever written to a log.
    void shell.openExternal(url).catch(() => {
      console.warn(`[Connectors] the sign-in page for ${slug} could not be opened`);
    });

    return new Promise<boolean>((resolve) => {
      const startedAt = Date.now();
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const settle = (connected: boolean) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(connected);
      };

      const poll = async () => {
        if (settled) return;
        if (Date.now() - startedAt > POLL_LIMIT_MS) {
          settle(false);
          return;
        }
        const result = await fetchConnectorsState(this.deps);
        if (settled) return;
        if (
          result.status === ConnectorRequestStatus.Ok
          && result.data.connections.some((connection) => connection.slug === slug)
        ) {
          this.applyState(result.data);
          settle(true);
          return;
        }
        timer = setTimeout(() => { void poll(); }, POLL_INTERVAL_MS);
      };
      timer = setTimeout(() => { void poll(); }, POLL_INTERVAL_MS);
    });
  }
}
