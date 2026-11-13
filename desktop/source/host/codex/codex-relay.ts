/**
 * Codex's model provider on the person's computer, for one turn of a cloud
 * agent's coding (13 November 2026).
 *
 * Claude Code signs in on the computer and calls Claude itself. Codex is not
 * signed in here: the person connected ChatGPT once, on Simeon Labs' server
 * (`server/simeon/desktop/model_accounts.py`), and no ChatGPT token is ever
 * on the computer. So Codex is given a model provider of its own
 * (`model_providers.simeon`, `codex-turn.ts`) whose address is this relay, on
 * the loopback only, behind a key made for the turn. Each of its calls
 * (`POST …/responses`, Codex's own Responses request) is handed to the
 * server's model relay as it came, with:
 *
 * - the computer's own credential, asked for again at each call (a turn of
 *   coding outlasts one, and Codex's environment could not be given a new
 *   one);
 * - the model named as the person's own (`own:chatgpt:<model>`) and the
 *   reason `coding`, which is how the server knows it for Codex's call and
 *   sends it to ChatGPT on the person's account, untouched
 *   (`own_models.relay`);
 * - the body gzipped, as the engine's own calls are (Render's edge reads a
 *   plain body and refuses what looks like an attack in it).
 *
 * The answer streams back as it comes. What the server refused is kept for
 * the turn's outcome (`state`): the plan's limit with when it ends, and
 * ChatGPT not connected. Nothing of a request or an answer is logged.
 */
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { simeonApiUrl } from "../../shared/node/simeon-backend/simeon-api.js";

const gzipAsync = promisify(gzip);

/** Where the server takes the calls (`/desktop/api/proxy/v1/responses`). */
export const CODEX_RELAY_PATH = "proxy/v1/responses";
/** The reason Codex's calls carry (the server's `CODING_REASON`). */
export const CODING_CALL_REASON = "coding";
/** The server's word for no ChatGPT account signed in (`CHATGPT_NOT_CONNECTED`). */
export const CHATGPT_NOT_CONNECTED = "chatgpt_not_connected";
/** The largest request taken from Codex: a whole conversation with pictures. */
const BODY_LIMIT = 64 << 20;
/** How long the server may take to start answering one call. */
const HEADERS_TIMEOUT_MS = 150_000;
/** Codex's own headers handed on: its session and thread, the request's id, what it says of itself (the server's `codex_own_headers`). */
const OWN_HEADERS: ReadonlySet<string> = new Set(["session-id", "thread-id", "x-client-request-id", "originator"]);
const OWN_PREFIXES = ["x-codex-", "x-openai-internal-codex-"] as const;

export interface CodexRelayDeps {
  readonly getBackendUrl: () => string;
  readonly getAccessToken: (options: { readonly backendUrl: string }) => Promise<string>;
  /** The model as Simeon names it (`own:chatgpt:gpt-6.1-sol`). */
  readonly modelId: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

/** What the server said of the calls so far. */
export interface CodexRelayState {
  /** Calls handed on. */
  readonly calls: number;
  /** The ChatGPT plan's limit was reached; until when, when the server said. */
  readonly limited: boolean;
  readonly limitedUntilMs?: number;
  /** No ChatGPT account of the person's is signed in. */
  readonly notConnected: boolean;
}

export interface CodexRelay {
  /** Codex's `base_url` (`http://127.0.0.1:<port>/v1`). */
  readonly baseUrl: string;
  /** The key Codex sends (its provider's `env_key`); good for this relay alone. */
  readonly key: string;
  state(): CodexRelayState;
  close(): Promise<void>;
}

/** Codex's own headers of a request, as the server takes them. */
export function codexOwnHeaders(headers: IncomingMessage["headers"]): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (typeof value !== "string" || value.length > 8_192) continue;
    if (OWN_HEADERS.has(lower) || OWN_PREFIXES.some((prefix) => lower.startsWith(prefix))) kept[lower] = value;
  }
  return kept;
}

/** When a refusal says the plan's limit ends (ChatGPT's `usage_limit_reached`), in milliseconds; 0 when it names no time; none when it is no limit. */
export function limitOfRefusal(status: number, body: string, now: number): number | undefined {
  let error: { type?: unknown; code?: unknown; resets_at?: unknown; resets_in_seconds?: unknown } | undefined;
  try { error = (JSON.parse(body) as { error?: typeof error }).error; } catch { return undefined; }
  if (error == null || typeof error !== "object") return undefined;
  const kind = typeof error.type === "string" ? error.type : typeof error.code === "string" ? error.code : "";
  if (status !== 429 || !/usage_limit|limit_exceeded/.test(kind)) return undefined;
  if (typeof error.resets_at === "number" && error.resets_at > 0) return error.resets_at * 1000;
  if (typeof error.resets_in_seconds === "number" && error.resets_in_seconds > 0) return now + error.resets_in_seconds * 1000;
  return 0;
}

function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT) { resolve(undefined); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(undefined));
  });
}

function refuse(res: ServerResponse, status: number, message: string): void {
  if (res.headersSent) { res.end(); return; }
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { message } }));
}

/** Starts the relay for one turn; `close` ends it. */
export async function startCodexRelay(deps: CodexRelayDeps): Promise<CodexRelay> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const key = randomBytes(24).toString("hex");
  let calls = 0;
  let limited = false;
  let limitedUntilMs: number | undefined;
  let notConnected = false;

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    if (req.method !== "POST" || !path.endsWith("/responses")) { refuse(res, 404, "Not found."); return; }
    if (req.headers.authorization !== `Bearer ${key}`) { refuse(res, 401, "Not this turn's key."); return; }
    const raw = await readBody(req);
    if (raw === undefined) { refuse(res, 413, "The request is too large."); return; }
    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw.toString("utf8"));
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      payload = parsed as Record<string, unknown>;
    } catch { refuse(res, 400, "The body is not JSON."); return; }
    // ChatGPT isn't connected: said once by the server, the same to Codex's own retries of the call.
    if (notConnected) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { type: CHATGPT_NOT_CONNECTED, message: "ChatGPT isn't connected." } }));
      return;
    }
    const body = await gzipAsync(Buffer.from(JSON.stringify({ ...payload, model: deps.modelId }), "utf8"));
    const gone = new AbortController();
    res.on("close", () => { if (!res.writableEnded) gone.abort(); });
    calls += 1;

    const ask = async (): Promise<Response> => {
      const backendUrl = deps.getBackendUrl();
      const token = await deps.getAccessToken({ backendUrl });
      if (token.length === 0) throw new Error("no credential for Simeon Labs' server");
      const headersDeadline = new AbortController();
      const timer = setTimeout(() => headersDeadline.abort(), HEADERS_TIMEOUT_MS);
      try {
        return await fetchImpl(simeonApiUrl(CODEX_RELAY_PATH, backendUrl), {
          method: "POST",
          headers: {
            ...codexOwnHeaders(req.headers),
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            "content-encoding": "gzip",
            accept: "text/event-stream",
            "x-simeon-call-reason": CODING_CALL_REASON,
          },
          body,
          signal: AbortSignal.any([gone.signal, headersDeadline.signal]),
        });
      } finally {
        clearTimeout(timer);
      }
    };

    let answer: Response;
    try {
      answer = await ask();
      if (answer.status === 401) {
        const words = await answer.text().catch(() => "");
        if (words.includes(CHATGPT_NOT_CONNECTED)) {
          notConnected = true;
          res.writeHead(401, { "content-type": "application/json" });
          res.end(words);
          return;
        }
        // The computer's own credential, refused: once more with the one it has now.
        answer = await ask();
      }
    } catch (error) {
      if (gone.signal.aborted) return;
      refuse(res, 502, `Simeon Labs' server couldn't be reached: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300));
      return;
    }
    if (!answer.ok || answer.body === null) {
      const words = await answer.text().catch(() => "");
      const until = limitOfRefusal(answer.status, words, now());
      if (until !== undefined) {
        limited = true;
        if (until > 0) limitedUntilMs = until;
      }
      if (answer.status === 401 && words.includes(CHATGPT_NOT_CONNECTED)) notConnected = true;
      res.writeHead(answer.status, { "content-type": answer.headers.get("content-type") ?? "application/json" });
      res.end(words);
      return;
    }
    res.writeHead(200, { "content-type": answer.headers.get("content-type") ?? "text/event-stream", "cache-control": "no-cache" });
    const stream = Readable.fromWeb(answer.body as unknown as Parameters<typeof Readable.fromWeb>[0]);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  };

  const server: Server = createServer((req, res) => { void handle(req, res).catch(() => refuse(res, 500, "The relay stopped.")); });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    key,
    state: () => ({ calls, limited, ...(limitedUntilMs === undefined ? {} : { limitedUntilMs }), notConnected }),
    close: () => new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    }),
  };
}
