import { describe, expect, test, vi } from 'vitest';

import type { ConnectionItem } from '../../../shared/connections/catalog';
import {
  ConnectionGroupId,
  ConnectionKind,
  ConnectVia,
  OAuthRegistration,
} from '../../../shared/connections/catalog';
import type { CallbackResult } from './authUrl';
import {
  ConnectOutcome,
  connectService,
  disconnectService,
  type ServerToWrite,
} from './connectService';
import type { CliResult } from './openclawCli';

const GMAIL: ConnectionItem = {
  id: 'gmail', name: 'Gmail', group: ConnectionGroupId.MailCalendar,
  kind: ConnectionKind.Account,
  connect: { via: ConnectVia.Mcp, url: 'https://gmailmcp.googleapis.com/mcp/v1' },
};

const SLACK: ConnectionItem = {
  id: 'slack', name: 'Slack', group: ConnectionGroupId.Developer,
  kind: ConnectionKind.Account,
  connect: { via: ConnectVia.Pipedream, appSlug: 'slack_v2' },
};

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth?response_type=code'
  + '&client_id=abc&redirect_uri=http%3A%2F%2F127.0.0.1%3A8989%2Foauth%2Fcallback';

const cli = (output: string): CliResult => ({ code: 0, output });

function harness(options: {
  runs?: CliResult[];
  callback?: CallbackResult;
  listenFails?: string;
} = {}) {
  const runs = options.runs ?? [];
  const calls: string[][] = [];
  const written: ServerToWrite[] = [];
  const removed: string[] = [];
  const opened: string[] = [];
  let closed = false;

  const deps = {
    environment: {
      entry: '/runtime/openclaw.mjs', runtimeRoot: '/runtime',
      baseDir: '/base', stateDir: '/state', configPath: '/state/openclaw.json',
    },
    writeServer: vi.fn(async (input: ServerToWrite) => {
      written.push(input);
    }),
    removeServer: vi.fn(async (name: string) => { removed.push(name); }),
    listen: vi.fn(async () => {
      if (options.listenFails) throw new Error(options.listenFails);
      return {
        result: Promise.resolve(options.callback ?? { code: 'the-code' }),
        close: () => { closed = true; },
      };
    }),
    openExternal: vi.fn(async (url: string) => { opened.push(url); }),
    runCli: vi.fn(async (args: readonly string[]) => {
      calls.push([...args]);
      return runs.shift() ?? cli('');
    }),
  };
  return { deps, calls, written, removed, opened, wasClosed: () => closed };
}

describe('connecting a service', () => {
  test('it writes the config before asking the engine to sign in', async () => {
    // `mcp login` reads the config to find the server, so a login before
    // the write fails with "no MCP server named …".
    const h = harness({ runs: [cli(AUTH_URL), cli('MCP OAuth credentials saved for "x".'), cli('')] });
    const result = await connectService(GMAIL, h.deps);

    expect(result.outcome).toBe(ConnectOutcome.Connected);
    expect(h.written).toEqual([{ name: 'connection-gmail', url: GMAIL.connect && 'url' in GMAIL.connect ? GMAIL.connect.url : '' }]);
    expect(h.deps.writeServer).toHaveBeenCalledBefore(h.deps.runCli as never);
  });

  test('it listens before the engine prints anything', async () => {
    // A person can be through a provider in under a second. A redirect
    // that arrives before anything is listening is simply lost.
    const h = harness({ runs: [cli(AUTH_URL), cli('credentials saved')] });
    await connectService(GMAIL, h.deps);
    expect(h.deps.listen).toHaveBeenCalledBefore(h.deps.runCli as never);
  });

  test('it opens the URL the engine gave, and comes back with the code', async () => {
    const h = harness({
      runs: [cli(`Open this URL:\n${AUTH_URL}`), cli('MCP OAuth credentials saved for "x".'), cli('')],
      callback: { code: '4/0Ab' },
    });
    const result = await connectService(GMAIL, h.deps);

    expect(result.outcome).toBe(ConnectOutcome.Connected);
    expect(h.opened).toEqual([AUTH_URL]);
    expect(h.calls[0]).toEqual(['mcp', 'login', 'connection-gmail']);
    expect(h.calls[1]).toEqual(['mcp', 'login', 'connection-gmail', '--code', '4/0Ab']);
  });

  test('it reloads afterwards, or the agent has no tools until a restart', async () => {
    // The cached runtime keeps the connection it opened before there were
    // tokens. Without the reload the agent reports the service as having
    // nothing on it, which reads as a broken connection.
    const h = harness({ runs: [cli(AUTH_URL), cli('credentials saved'), cli('')] });
    await connectService(GMAIL, h.deps);
    expect(h.calls[h.calls.length - 1]).toEqual(['mcp', 'reload']);
  });

  test('tokens it already had mean nothing to approve', async () => {
    const h = harness({ runs: [cli('MCP OAuth credentials saved for "connection-gmail".')] });
    const result = await connectService(GMAIL, h.deps);

    expect(result.outcome).toBe(ConnectOutcome.Connected);
    expect(h.opened).toEqual([]);
  });

  test('the listener is closed however it ends', async () => {
    // It holds a fixed port. One left open blocks the next sign-in on
    // this computer, and the failure would look like the service's.
    const h = harness({ runs: [cli('no url here')] });
    await connectService(GMAIL, h.deps);
    expect(h.wasClosed()).toBe(true);
  });
});

describe('when it does not work', () => {
  test('somebody pressing Cancel is told so, and nothing is left behind', async () => {
    const h = harness({
      runs: [cli(AUTH_URL)],
      callback: { error: 'The user said no' },
    });
    const result = await connectService(GMAIL, h.deps);

    expect(result.outcome).toBe(ConnectOutcome.Refused);
    expect(result.message).toBe('The user said no');
    // A half-written server would make the engine retry a connection
    // nobody has signed into, on every turn.
    expect(h.removed).toEqual(['connection-gmail']);
  });

  test('an engine that offers no way in says why, in its own words', async () => {
    const h = harness({
      runs: [cli('Loading config...\nMCP server "connection-gmail" is not configured with auth: "oauth".')],
    });
    const result = await connectService(GMAIL, h.deps);

    expect(result.outcome).toBe(ConnectOutcome.Failed);
    expect(result.message).toBe('MCP server "connection-gmail" is not configured with auth: "oauth".');
    expect(h.removed).toEqual(['connection-gmail']);
  });

  test('a code the engine refuses is a failure, not a success', async () => {
    // The second login exits 0 whatever happens. Only the sentence tells
    // the two apart, which is why the outcome is read from it.
    const h = harness({ runs: [cli(AUTH_URL), cli('Authorization failed: the code has expired.')] });
    const result = await connectService(GMAIL, h.deps);

    expect(result.outcome).toBe(ConnectOutcome.Failed);
    expect(result.message).toBe('Authorization failed: the code has expired.');
    expect(h.removed).toEqual(['connection-gmail']);
  });

  test('a port already taken is said plainly, and the config is put back', async () => {
    const h = harness({ listenFails: 'Something else is using port 8989 on this computer.' });
    const result = await connectService(GMAIL, h.deps);

    expect(result.outcome).toBe(ConnectOutcome.Failed);
    expect(result.message).toContain('port 8989');
    expect(h.removed).toEqual(['connection-gmail']);
    expect(h.deps.runCli).not.toHaveBeenCalled();
  });

  test('a service that connects another way is refused before anything is written', async () => {
    const h = harness();
    const result = await connectService(SLACK, h.deps);

    expect(result.outcome).toBe(ConnectOutcome.Unsupported);
    expect(h.written).toEqual([]);
    expect(h.deps.listen).not.toHaveBeenCalled();
  });

  test('a service wanting a client we have not registered is refused, not attempted', async () => {
    // The card says "Not yet"; this is the same answer from the other
    // side of the bridge, so a stale renderer cannot start a sign-in
    // that has nowhere to go.
    const h = harness();
    const result = await connectService({
      ...GMAIL,
      connect: { via: ConnectVia.Mcp, url: GMAIL.connect.url, registration: OAuthRegistration.Preregistered },
    } as ConnectionItem, h.deps);

    expect(result.outcome).toBe(ConnectOutcome.Unsupported);
    expect(h.written).toEqual([]);
    expect(h.deps.runCli).not.toHaveBeenCalled();
  });

  test('an open server is written without a sign-in and reloaded', async () => {
    // Excalidraw and GoDaddy answered the probe with 200 and no
    // challenge. Running `mcp login` against them would fail looking
    // for an authorization server they do not have.
    const h = harness();
    const result = await connectService({
      id: 'excalidraw', name: 'Excalidraw', group: ConnectionGroupId.Creativity,
      kind: ConnectionKind.Account,
      connect: { via: ConnectVia.Mcp, url: 'https://mcp.excalidraw.com/mcp', open: true },
    }, h.deps);

    expect(result.outcome).toBe(ConnectOutcome.Connected);
    expect(h.written).toEqual([{ name: 'connection-excalidraw', url: 'https://mcp.excalidraw.com/mcp', open: true }]);
    expect(h.calls).toEqual([['mcp', 'reload']]);
    expect(h.deps.listen).not.toHaveBeenCalled();
    expect(h.opened).toEqual([]);
  });
});

describe('disconnecting', () => {
  test('the tokens go before the config entry does', async () => {
    // Removing only the config entry leaves the tokens on disk — the
    // version of this that quietly keeps credentials after somebody
    // asked it not to. `mcp logout` needs the entry to still be there.
    const h = harness();
    await disconnectService(GMAIL, h.deps);

    expect(h.calls[0]).toEqual(['mcp', 'logout', 'connection-gmail']);
    expect(h.removed).toEqual(['connection-gmail']);
    expect(h.calls[h.calls.length - 1]).toEqual(['mcp', 'reload']);
  });
});
