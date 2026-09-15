import type { ConnectionItem } from '../../../shared/connections/catalog';
import {
  ConnectionKind,
  ConnectVia,
  mcpServerName,
  OAuthRegistration,
} from '../../../shared/connections/catalog';
import { failureLine, findAuthorizationUrl, saysAuthorized } from './authUrl';
import type { CallbackListener } from './callbackServer';
import type { CliResult, OpenClawCliEnvironment } from './openclawCli';

/**
 * Connecting one service, end to end.
 *
 * Five steps, and the order is the only order that works:
 *
 *   1. Write the MCP server into the engine's config. `mcp login` reads
 *      the config to find the server, so a login before the write fails
 *      with "no MCP server named …".
 *   2. Start listening on the loopback port the engine registered.
 *   3. `mcp login` — the engine prints an authorization URL.
 *   4. Open it; the person signs in; the provider redirects to step 2.
 *   5. `mcp login --code <code>` — the engine stores the tokens.
 *
 * Then `mcp reload`, or the cached runtime keeps the old, tokenless
 * connection for the rest of the session and the agent reports no tools.
 *
 * Everything that talks to the world is injected, so this can be tested
 * without a browser, a port or a child process — which matters, because
 * the parts that fail here fail rarely and at the worst moment.
 */

export const ConnectOutcome = {
  Connected: 'connected',
  /** The person closed the window, said no, or nothing came back. */
  Refused: 'refused',
  /** Something was wrong on our side or the engine's. */
  Failed: 'failed',
  /** The catalogue does not say this service signs in this way. */
  Unsupported: 'unsupported',
} as const;
export type ConnectOutcome = typeof ConnectOutcome[keyof typeof ConnectOutcome];

export interface ConnectResult {
  outcome: ConnectOutcome;
  /** A sentence for the person. Empty when it worked. */
  message?: string;
}

export interface ServerToWrite {
  name: string;
  url: string;
  scope?: string;
  /** True for a server with no sign-in; it is written without `auth`. */
  open?: true;
}

export interface ConnectDeps {
  environment: OpenClawCliEnvironment;
  /** Puts the server into the engine's config and waits for the write. */
  writeServer: (input: ServerToWrite) => Promise<void>;
  /** Takes the server back out again, for a login that never finished. */
  removeServer: (name: string) => Promise<void>;
  listen: () => Promise<CallbackListener>;
  openExternal: (url: string) => Promise<void>;
  runCli: (args: readonly string[]) => Promise<CliResult>;
}

/**
 * What the engine said, in the log, at every step.
 *
 * This is the `desktop.proxy.upstream_refused` lesson applied here. Two
 * hours of guessing at the GPT bug were ended by one log line carrying
 * the provider's own sentence. A sign-in that fails on somebody else's
 * machine is unreachable without the same thing: the step it reached,
 * and what the engine printed.
 *
 * The output is the engine's own words to a person — a URL, a refusal, a
 * "credentials saved". It carries no token: the engine keeps those under
 * its state dir and never prints them.
 */
const say = (step: string, detail = ''): void => {
  console.log(`[Connections] ${step}${detail ? `: ${detail.trim()}` : ''}`);
};

export async function connectService(
  item: ConnectionItem,
  deps: ConnectDeps,
): Promise<ConnectResult> {
  if (item.kind !== ConnectionKind.Account || item.connect.via !== ConnectVia.Mcp) {
    return {
      outcome: ConnectOutcome.Unsupported,
      message: `${item.name} does not sign in this way.`,
    };
  }

  const name = mcpServerName(item.id);
  const { url, scope } = item.connect;

  if (item.connect.registration === OAuthRegistration.Preregistered) {
    // The card already says "Not yet" for these. Refusing here as well
    // means a stale renderer cannot start a sign-in that has nowhere to go.
    return {
      outcome: ConnectOutcome.Unsupported,
      message: `${item.name} needs a client registered with them first.`,
    };
  }

  if (item.connect.open) {
    // No sign-in to do: the server took the probe without a challenge.
    // Written without `auth`, or the engine would go looking for an
    // authorization server the vendor does not run.
    say(`${name} — open server, writing it and reloading`);
    await deps.writeServer({ name, url, open: true });
    await deps.runCli(['mcp', 'reload']);
    return { outcome: ConnectOutcome.Connected };
  }

  // 1. The config first, because the login reads it.
  say(`${name} — writing the server and syncing the config`);
  await deps.writeServer({ name, url, ...(scope ? { scope } : {}) });

  let listener: CallbackListener;
  try {
    // 2. Before the login, not after: the engine can print the URL and
    // the person can be through the provider in under a second, and a
    // redirect that arrives before anything is listening is lost.
    listener = await deps.listen();
    say(`${name} — listening on ${listener.port} for the redirect`);
  } catch (error) {
    say(`${name} — could not listen`, error instanceof Error ? error.message : String(error));
    await deps.removeServer(name);
    return {
      outcome: ConnectOutcome.Failed,
      message: error instanceof Error ? error.message : `${item.name} could not be connected.`,
    };
  }

  try {
    // 3. Ask the engine to begin.
    const started = await deps.runCli(['mcp', 'login', name]);
    say(`${name} — mcp login exited ${started.code}`, started.output);
    if (saysAuthorized(started.output)) {
      // Already had usable tokens. Nothing to approve.
      await deps.runCli(['mcp', 'reload']);
      return { outcome: ConnectOutcome.Connected };
    }

    const authorizationUrl = findAuthorizationUrl(started.output);
    if (!authorizationUrl) {
      say(`${name} — no authorization URL in that output`);
      await deps.removeServer(name);
      return {
        outcome: ConnectOutcome.Failed,
        message: failureLine(started.output) || `${item.name} did not offer a way to sign in.`,
      };
    }

    // 4. Their page, their rules.
    await deps.openExternal(authorizationUrl);
    const callback = await listener.result;
    if (!callback.code) {
      say(`${name} — the redirect brought back no code`, callback.error ?? '');
      await deps.removeServer(name);
      return {
        outcome: ConnectOutcome.Refused,
        message: callback.error ?? `${item.name} was not connected.`,
      };
    }

    // 5. The second half of the same login.
    const finished = await deps.runCli(['mcp', 'login', name, '--code', callback.code]);
    say(`${name} — mcp login --code exited ${finished.code}`, finished.output);
    if (!saysAuthorized(finished.output)) {
      await deps.removeServer(name);
      return {
        outcome: ConnectOutcome.Failed,
        message: failureLine(finished.output) || `${item.name} did not finish signing in.`,
      };
    }

    // Without this the cached runtime keeps the connection it opened
    // before there were tokens, and the agent says it has no tools.
    await deps.runCli(['mcp', 'reload']);
    say(`${name} — connected`);
    return { outcome: ConnectOutcome.Connected };
  } finally {
    listener.close();
  }
}

export interface DisconnectDeps {
  removeServer: (name: string) => Promise<void>;
  runCli: (args: readonly string[]) => Promise<CliResult>;
}

/**
 * Disconnecting, which is two removals and not one.
 *
 * `mcp logout` clears the stored tokens; taking the server out of the
 * config stops the engine trying to reach it. Doing only the second
 * leaves the tokens on disk, which is the version of this that quietly
 * keeps a person's credentials after they asked it not to.
 *
 * The logout goes first and its failure is not fatal: a server already
 * gone from the config cannot be logged out of, and the person asked for
 * it to be gone either way.
 */
export async function disconnectService(
  item: ConnectionItem,
  deps: DisconnectDeps,
): Promise<void> {
  const name = mcpServerName(item.id);
  await deps.runCli(['mcp', 'logout', name]);
  await deps.removeServer(name);
  await deps.runCli(['mcp', 'reload']);
}
