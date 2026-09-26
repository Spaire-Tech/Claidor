/**
 * The box desktop's stream, behind Grok Bot's network token (ledger F-135,
 * 26 September 2026).
 *
 * Grok Bot never exposed noVNC bare in production. Its cloud box sat behind
 * the pod's egress proxy, which let a request through only with the box's
 * network token, as the `network_token` query parameter (the noVNC page and
 * its websockify URL, `buildSandBoxNoVncUrl`) or the `x-anyrun-network-token`
 * header (every other request of the page; the Electron box session adds it,
 * `vnc-trust.ts` `beforeSendHeaders`). The loopback box, which a local Docker
 * box uses, is Grok Bot's development path and published websockify's 6080
 * and 6081 with no credential, so any web page open on the Mac could open
 * ws://127.0.0.1:6080/websockify and drive the desktop that holds the
 * agent's signed-in browser.
 *
 * This is that proxy, run by the host inside the box: one listener per
 * stream port, each forwarding HTTP and WebSocket traffic to websockify on
 * the box's own loopback once the token matches. The Mac publishes these
 * listeners instead of websockify and hands the app the `vncProxy`
 * descriptor, so the coordinator (`box-vnc-proxy.ts`) and Electron carry the
 * token exactly as they do for Grok Bot's cloud box. Our cloud box's proxy
 * (`server/polar/sand/box_proxy.py`) checks the same token the same way.
 */
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { connect, type Socket } from "node:net";

export const BOX_STREAM_NETWORK_TOKEN_HEADER = "x-anyrun-network-token";
export const BOX_STREAM_NETWORK_TOKEN_QUERY = "network_token";
/** The file the Mac writes the token into (the `/run/grok-bot` mount). */
export const SAND_BOX_STREAM_TOKEN_FILE_ENV = "SAND_BOX_STREAM_TOKEN_FILE";
/** websockify's ports inside the box, and the guard's, which the Mac publishes as 6080 and 6081. */
export const BOX_STREAM_ROUTES = Object.freeze([
  { listenPort: 16080, targetPort: 6080 },
  { listenPort: 16081, targetPort: 6081 },
]);

export function readBoxStreamNetworkToken(env: NodeJS.ProcessEnv = process.env, read: (path: string) => string = (path) => readFileSync(path, "utf8")): string | undefined {
  const path = env[SAND_BOX_STREAM_TOKEN_FILE_ENV]?.trim();
  if (path == null || path.length === 0) return undefined;
  try {
    const token = read(path).trim();
    return token.length >= 32 ? token : undefined;
  } catch {
    return undefined;
  }
}

function sameToken(offered: string | undefined, expected: string): boolean {
  if (offered == null) return false;
  const a = Buffer.from(offered);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The token a request carries: the header, or the query parameter. */
export function offeredBoxStreamToken(request: Pick<IncomingMessage, "headers" | "url">): string | undefined {
  const header = request.headers[BOX_STREAM_NETWORK_TOKEN_HEADER];
  if (typeof header === "string" && header.length > 0) return header;
  try {
    const query = new URL(request.url ?? "/", "http://box").searchParams.get(BOX_STREAM_NETWORK_TOKEN_QUERY);
    return query != null && query.length > 0 ? query : undefined;
  } catch {
    return undefined;
  }
}

export function isBoxStreamRequestAllowed(request: Pick<IncomingMessage, "headers" | "url">, token: string): boolean {
  return sameToken(offeredBoxStreamToken(request), token);
}

function forwardedHeaders(headers: IncomingMessage["headers"]): IncomingMessage["headers"] {
  const next = { ...headers };
  delete next[BOX_STREAM_NETWORK_TOKEN_HEADER];
  return next;
}

export interface BoxStreamGuard {
  readonly ports: readonly number[];
  close(): Promise<void>;
}

export async function startBoxStreamGuard(options: {
  readonly token: string;
  readonly routes?: readonly { readonly listenPort: number; readonly targetPort: number }[];
  readonly bindHost?: string;
  readonly targetHost?: string;
  readonly log?: (line: string) => void;
}): Promise<BoxStreamGuard> {
  const routes = options.routes ?? BOX_STREAM_ROUTES;
  const bindHost = options.bindHost ?? "0.0.0.0";
  const targetHost = options.targetHost ?? "127.0.0.1";
  const servers: Server[] = [];
  const ports: number[] = [];
  // An upgraded socket leaves the HTTP server's own tracking, so
  // `closeAllConnections` does not end it and `close` would wait on it.
  const tunnels = new Set<Socket>();
  let refusals = 0;
  const refused = (what: string): void => {
    refusals += 1;
    // One line for the first refusal and every hundredth after: a page
    // probing the port should be visible without flooding the log.
    if (refusals === 1 || refusals % 100 === 0) options.log?.(`[claidor] box-stream refused ${what} without the network token (${refusals} so far)`);
  };
  for (const route of routes) {
    const server = createServer((request: IncomingMessage, response: ServerResponse) => {
      if (!isBoxStreamRequestAllowed(request, options.token)) {
        refused("a request");
        response.writeHead(401, { "content-type": "text/plain" });
        response.end("This desktop stream needs its network token.");
        return;
      }
      const upstream = httpRequest({ host: targetHost, port: route.targetPort, method: request.method, path: request.url, headers: forwardedHeaders(request.headers) }, (answer) => {
        response.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(response);
      });
      upstream.on("error", () => {
        if (!response.headersSent) response.writeHead(502, { "content-type": "text/plain" });
        response.end("The desktop stream is not answering yet.");
      });
      request.pipe(upstream);
    });
    server.on("upgrade", (request: IncomingMessage, socket: Socket, head: Buffer) => {
      if (!isBoxStreamRequestAllowed(request, options.token)) {
        refused("a WebSocket");
        socket.end("HTTP/1.1 401 Unauthorized\r\nconnection: close\r\ncontent-length: 0\r\n\r\n");
        return;
      }
      const upstream = connect(route.targetPort, targetHost, () => {
        const lines = [`${request.method ?? "GET"} ${request.url ?? "/"} HTTP/${request.httpVersion}`];
        const raw = request.rawHeaders;
        for (let index = 0; index + 1 < raw.length; index += 2) {
          if (raw[index]!.toLowerCase() === BOX_STREAM_NETWORK_TOKEN_HEADER) continue;
          lines.push(`${raw[index]}: ${raw[index + 1]}`);
        }
        upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
        if (head.length > 0) upstream.write(head);
        upstream.pipe(socket);
        socket.pipe(upstream);
      });
      tunnels.add(socket); tunnels.add(upstream);
      const closeBoth = (): void => { socket.destroy(); upstream.destroy(); tunnels.delete(socket); tunnels.delete(upstream); };
      upstream.on("error", closeBoth);
      socket.on("error", closeBoth);
      upstream.on("close", closeBoth);
      socket.on("close", closeBoth);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(route.listenPort, bindHost, () => { server.off("error", reject); resolve(); });
      });
    } catch (error) {
      // A port that would not bind must not leave the others listening, or
      // the starter's retry would then fail on a port this attempt holds.
      await Promise.all(servers.map((started) => new Promise<void>((resolve) => started.close(() => resolve()))));
      throw error;
    }
    const address = server.address();
    ports.push(typeof address === "object" && address != null ? address.port : route.listenPort);
    servers.push(server);
  }
  options.log?.(`[claidor] box-stream guarded on ${ports.join(", ")} -> ${routes.map((route) => route.targetPort).join(", ")} (network token required)`);
  return {
    ports,
    close: async () => {
      for (const tunnel of tunnels) tunnel.destroy();
      tunnels.clear();
      await Promise.all(servers.map((server) => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); })));
    },
  };
}

/**
 * Starts the guard when the Mac handed the box a token file, and never
 * fails the host: a port another process still holds (the previous host
 * during a self-upgrade) is retried every 2 s for a minute, and a guard
 * that could not bind leaves one log line.
 */
export function startBoxStreamGuardFromEnv(options: {
  readonly env?: NodeJS.ProcessEnv;
  readonly log: (line: string) => void;
  readonly start?: typeof startBoxStreamGuard;
  readonly retryDelayMs?: number;
  readonly maxAttempts?: number;
}): Promise<BoxStreamGuard | undefined> {
  const token = readBoxStreamNetworkToken(options.env ?? process.env);
  if (token === undefined) return Promise.resolve(undefined);
  const start = options.start ?? startBoxStreamGuard;
  const maxAttempts = options.maxAttempts ?? 30;
  const retryDelayMs = options.retryDelayMs ?? 2_000;
  const attempt = async (count: number): Promise<BoxStreamGuard | undefined> => {
    try {
      return await start({ token, log: options.log });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (count >= maxAttempts) {
        options.log(`[claidor] box-stream guard could not start (${message}); the desktop stream is unreachable until the host restarts`);
        return undefined;
      }
      await new Promise((resolve) => { const timer = setTimeout(resolve, retryDelayMs); timer.unref?.(); });
      return attempt(count + 1);
    }
  };
  return attempt(1);
}
