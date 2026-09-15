import type { ConnectionItem } from '../../../shared/connections/catalog';
import { composioToolkit } from '../../../shared/connections/catalog';
import { ConnectOutcome, type ConnectResult } from '../connections/connectService';
import type { ComposioApi } from './composioApi';

/**
 * Connecting one service through Composio.
 *
 * Shorter than the engine's own flow (`connectService.ts`) because
 * Composio holds the middle: it registers the OAuth client, catches the
 * redirect, stores the tokens. What is left to us is a link to open and
 * a question to keep asking — "signed in yet?" — until the answer is
 * yes or the person has plainly stopped.
 *
 * There is no redirect to catch here, so there is nothing to listen on.
 * Composio's own page tells the person they are done; we find out by
 * asking Composio, which is the one place the fact lives.
 */

export interface ComposioConnectDeps {
  api: ComposioApi;
  openExternal: (url: string) => Promise<void>;
  /** Injected so a test does not wait five minutes. */
  wait?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

/** Long enough to find the right account and type a password. */
export const COMPOSIO_CONNECT_TIMEOUT_MS = 5 * 60 * 1000;
export const COMPOSIO_POLL_INTERVAL_MS = 2_000;

const say = (step: string, detail = ''): void => {
  console.log(`[Connections] ${step}${detail ? `: ${detail.trim()}` : ''}`);
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => { setTimeout(resolve, ms); });

export async function connectThroughComposio(
  item: ConnectionItem,
  deps: ComposioConnectDeps,
): Promise<ConnectResult> {
  const toolkit = composioToolkit(item);
  if (!toolkit) {
    return { outcome: ConnectOutcome.Unsupported, message: `${item.name} is not carried by Composio.` };
  }

  const wait = deps.wait ?? sleep;
  const interval = deps.pollIntervalMs ?? COMPOSIO_POLL_INTERVAL_MS;
  const timeout = deps.timeoutMs ?? COMPOSIO_CONNECT_TIMEOUT_MS;

  try {
    // Already there — a key typed on a computer that Composio already
    // knows. Nothing to open.
    if ((await deps.api.toolkitState(toolkit)).connected) {
      say(`composio ${toolkit} — already signed in`);
      return { outcome: ConnectOutcome.Connected };
    }

    const url = await deps.api.authorizationUrl(toolkit);
    say(`composio ${toolkit} — opening the sign-in link`);
    await deps.openExternal(url);

    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await wait(interval);
      if ((await deps.api.toolkitState(toolkit)).connected) {
        say(`composio ${toolkit} — connected`);
        return { outcome: ConnectOutcome.Connected };
      }
    }
    say(`composio ${toolkit} — nothing came back in ${Math.round(timeout / 1000)}s`);
    return { outcome: ConnectOutcome.Refused, message: `${item.name} was not connected.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    say(`composio ${toolkit} — failed`, message);
    return { outcome: ConnectOutcome.Failed, message };
  }
}

export async function disconnectThroughComposio(
  item: ConnectionItem,
  api: ComposioApi,
): Promise<void> {
  const toolkit = composioToolkit(item);
  if (!toolkit) throw new Error(`${item.name} is not carried by Composio.`);
  const removed = await api.disconnect(toolkit);
  say(`composio ${toolkit} — ${removed ? 'disconnected' : 'nothing to disconnect'}`);
}
