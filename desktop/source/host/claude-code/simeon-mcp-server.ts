/**
 * Simeon's tools offered to Claude Code over MCP (9 November 2026,
 * docs/your-own-models.md, section 6, step C4): when Claude Code runs an
 * agent's turn, the agent still speaks in the chat, reacts, asks with cards
 * and forms, uses the person's connected apps and the computer's screen,
 * through Simeon's own tools. They are served here, inside the engine, for
 * the length of one turn.
 *
 * The protocol is MCP's Streamable HTTP, answered in plain JSON (no event
 * stream): `initialize`, `notifications/*`, `ping`, `tools/list`,
 * `tools/call`. It listens on 127.0.0.1 only, at a path holding a token made
 * for the turn, refuses a request from a web page (an `Origin` header) or for
 * another host, and stops with the turn.
 *
 * Nothing here logs a tool's input or output.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** MCP versions this server speaks; a client asking for another gets the newest. */
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
const MAX_BODY_BYTES = 8 * 1024 * 1024;

export type BridgeContent =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly data: string; readonly mimeType: string };

export interface BridgeResult {
  readonly content: readonly BridgeContent[];
  readonly isError?: boolean;
}

/** One tool as Claude Code sees it, and what calling it does. */
export interface BridgeTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  call(args: Readonly<Record<string, unknown>>, signal: AbortSignal): Promise<BridgeResult>;
}

export interface SimeonMcpServer {
  /** Where Claude Code reaches it: `http://127.0.0.1:<port>/mcp/<token>`. */
  readonly url: string;
  /** The `mcpServers` entry for Claude Code's `--mcp-config`. */
  readonly config: Readonly<Record<string, unknown>>;
  close(): Promise<void>;
}

export interface SimeonMcpServerOptions {
  /** The turn's tools, read at each `tools/list` and `tools/call`. */
  readonly tools: () => readonly BridgeTool[];
  /** Ends every call in progress (the turn stopped). */
  readonly signal?: AbortSignal | undefined;
  readonly version?: string | undefined;
  /** One line per call: the tool's name and how it ended, never its input or output. */
  readonly log?: ((line: string) => void) | undefined;
}

interface Rpc {
  readonly jsonrpc?: unknown;
  readonly id?: unknown;
  readonly method?: unknown;
  readonly params?: unknown;
}

const isId = (value: unknown): value is string | number => typeof value === "string" || typeof value === "number";

function rpcError(id: unknown, code: number, message: string): Record<string, unknown> {
  return { jsonrpc: "2.0", id: isId(id) ? id : null, error: { code, message } };
}

function readBody(request: IncomingMessage): Promise<string | undefined> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { request.destroy(); resolve(undefined); return; }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", () => resolve(undefined));
  });
}

/** Starts the turn's MCP server; `close()` ends it. */
export async function startSimeonMcpServer(options: SimeonMcpServerOptions): Promise<SimeonMcpServer> {
  const token = randomBytes(24).toString("hex");
  const path = `/mcp/${token}`;
  const ending = new AbortController();
  const stop = (): void => ending.abort();
  options.signal?.addEventListener("abort", stop, { once: true });
  let port = 0;

  const samePath = (url: string | undefined): boolean => {
    const asked = Buffer.from((url ?? "").split("?")[0] ?? "");
    const mine = Buffer.from(path);
    return asked.length === mine.length && timingSafeEqual(asked, mine);
  };

  const answer = async (message: Rpc): Promise<Record<string, unknown> | undefined> => {
    const id = message.id;
    const method = typeof message.method === "string" ? message.method : undefined;
    if (message.jsonrpc !== "2.0" || method === undefined) return rpcError(id, -32600, "Invalid request");
    // A notification (no id) gets no answer.
    if (!isId(id)) return undefined;
    if (method === "initialize") {
      const asked = (message.params as { protocolVersion?: unknown } | undefined)?.protocolVersion;
      const protocolVersion = PROTOCOL_VERSIONS.find((one) => one === asked) ?? PROTOCOL_VERSIONS[0];
      return { jsonrpc: "2.0", id, result: { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "simeon", version: options.version ?? "1" } } };
    }
    if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
    if (method === "tools/list") {
      const tools = options.tools().map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }));
      return { jsonrpc: "2.0", id, result: { tools } };
    }
    if (method === "tools/call") {
      const params = message.params as { name?: unknown; arguments?: unknown } | undefined;
      const name = typeof params?.name === "string" ? params.name : undefined;
      const tool = name === undefined ? undefined : options.tools().find((one) => one.name === name);
      if (tool === undefined) return rpcError(id, -32602, `Unknown tool: ${name ?? "(none)"}`);
      const args = params?.arguments !== null && typeof params?.arguments === "object" && !Array.isArray(params.arguments) ? params.arguments as Record<string, unknown> : {};
      const started = Date.now();
      try {
        const result = await tool.call(args, ending.signal);
        options.log?.(`claude-code tool=${tool.name} ok=${result.isError === true ? "no" : "yes"} ms=${Date.now() - started}`);
        return { jsonrpc: "2.0", id, result: { content: result.content, ...(result.isError === true ? { isError: true } : {}) } };
      } catch (error) {
        options.log?.(`claude-code tool=${tool.name} ok=no threw ms=${Date.now() - started}`);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true } };
      }
    }
    return rpcError(id, -32601, `Method not found: ${method}`);
  };

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const send = (status: number, body?: unknown): void => {
      if (body === undefined) { response.writeHead(status); response.end(); return; }
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    // Only Claude Code on this computer: never a web page (DNS rebinding), never another host's name.
    if (request.headers.origin !== undefined) { send(403); return; }
    if (request.headers.host !== `127.0.0.1:${port}` && request.headers.host !== `localhost:${port}`) { send(403); return; }
    if (!samePath(request.url)) { send(404); return; }
    if (request.method === "DELETE") { send(200); return; }
    if (request.method !== "POST") { response.writeHead(405, { allow: "POST, DELETE" }); response.end(); return; }
    const raw = await readBody(request);
    if (raw === undefined) { send(413); return; }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { send(400, rpcError(null, -32700, "Parse error")); return; }
    const batch = Array.isArray(parsed);
    const messages = (batch ? parsed : [parsed]) as Rpc[];
    if (messages.length === 0) { send(400, rpcError(null, -32600, "Invalid request")); return; }
    const answers = (await Promise.all(messages.map((one) => (one !== null && typeof one === "object" ? answer(one) : Promise.resolve(rpcError(null, -32600, "Invalid request")))))).filter((one): one is Record<string, unknown> => one !== undefined);
    if (answers.length === 0) { send(202); return; }
    send(200, batch ? answers : answers[0]);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  port = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}${path}`;
  return {
    url,
    config: { type: "http", url },
    close: () => new Promise<void>((resolve) => {
      stop();
      options.signal?.removeEventListener("abort", stop);
      server.close(() => resolve());
      server.closeAllConnections();
    }),
  };
}
