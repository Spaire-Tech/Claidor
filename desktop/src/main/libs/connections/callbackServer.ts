import http from 'node:http';

import { AUTH_CALLBACK_PATH, type CallbackResult, readCallback } from './authUrl';

/**
 * The window that catches the redirect.
 *
 * The MCP SDK's default redirect is `http://127.0.0.1:8989/oauth/callback`
 * (`openclaw/src/agents/mcp-oauth.ts`), and the port is not incidental: it
 * is what the engine registered with the provider, so it is the only
 * place the browser will come back to. An ephemeral port would be a
 * different address and the provider would refuse it.
 *
 * Loopback only. A server on 0.0.0.0 would let anything on the network
 * hand us an authorization code.
 */

export const CALLBACK_HOST = '127.0.0.1';
export const CALLBACK_PORT = 8989;

/** Long enough to find the right account and type a password. */
export const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

export interface CallbackListener {
  /** Resolves when the browser comes back, or the wait runs out. */
  readonly result: Promise<CallbackResult>;
  /** The port it actually bound. */
  readonly port: number;
  /** Always call this. Leaving a listener on a fixed port blocks the next one. */
  close: () => void;
}

const PAGE = (heading: string, line: string): string =>
  `<!doctype html><meta charset="utf-8"><title>${heading}</title>`
  + '<style>body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;'
  + 'color:#1e3358;background:#fbfbfc;display:flex;align-items:center;'
  + 'justify-content:center;height:100vh;margin:0}'
  + 'div{text-align:center;max-width:24em}h1{font-size:19px;font-weight:500;margin:0 0 6px}'
  + 'p{color:#55606f;margin:0}</style>'
  + `<div><h1>${heading}</h1><p>${line}</p></div>`;

/**
 * Listen for one redirect, then stop.
 *
 * One is the right number: the code is single-use, and a listener that
 * stayed open would keep a fixed port for no reason.
 */
export function listenForCallback(
  timeoutMs: number = CALLBACK_TIMEOUT_MS,
  /** Only tests pass this. The real port is the one the engine registered. */
  port: number = CALLBACK_PORT,
): Promise<CallbackListener> {
  const server = http.createServer();
  let settle: (result: CallbackResult) => void;
  const result = new Promise<CallbackResult>(resolve => { settle = resolve; });

  let done = false;
  let timer: NodeJS.Timeout | undefined;
  const finish = (value: CallbackResult): void => {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    settle(value);
  };

  const close = (): void => {
    finish({ error: 'That sign-in was closed before it finished.' });
    server.close();
    server.closeAllConnections?.();
  };

  server.on('request', (request, response) => {
    const path = (request.url ?? '').split('?')[0];
    if (path !== AUTH_CALLBACK_PATH) {
      // Anything else on this port is not ours to answer.
      response.writeHead(404).end();
      return;
    }
    const read = readCallback(request.url ?? '');
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(read.code
      ? PAGE('Connected', 'You can close this tab and go back to the app.')
      : PAGE('Not connected', read.error ?? 'That did not go through.'));
    finish(read);
    // The person still has the page; the socket does not need to stay.
    server.close();
  });

  return new Promise<CallbackListener>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException): void => {
      server.removeListener('listening', onListening);
      // The port is fixed by what the engine registered, so a clash is
      // worth saying plainly rather than retrying somewhere useless.
      reject(error.code === 'EADDRINUSE'
        ? new Error(`Something else is using port ${port} on this computer.`)
        : error);
    };
    const onListening = (): void => {
      server.removeListener('error', onError);
      server.on('error', () => { /* a late socket error is not the caller's */ });
      timer = setTimeout(() => { close(); }, timeoutMs);
      // What it bound, not what it asked for. They are the same for the
      // real port and different for the 0 a test passes, and reporting
      // the request would make the listener say it was somewhere it is not.
      const address = server.address();
      const bound = typeof address === 'object' && address ? address.port : port;
      resolve({ result, port: bound, close });
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, CALLBACK_HOST);
  });
}
