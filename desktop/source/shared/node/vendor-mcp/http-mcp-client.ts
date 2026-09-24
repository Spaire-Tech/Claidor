// A small MCP client over streamable HTTP (24 September 2026), for the
// vendors' own hosted servers (mcp.figma.com, mcp.notion.com, …). Grok Bot
// never spoke MCP to an HTTP server itself: Cursor's backend did, and Claidor
// does not serve that. This is the part of the backend we need: initialize,
// tools/list, tools/call, JSON-RPC over POST, a JSON or an SSE reply, the
// session id header, and a 401 that means "sign in".

export class VendorMcpHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "VendorMcpHttpError";
  }
}

export class VendorMcpAuthRequiredError extends VendorMcpHttpError {
  constructor(message = "The vendor asked for authentication.", status = 401) {
    super(message, status);
    this.name = "VendorMcpAuthRequiredError";
  }
}

export interface VendorMcpListedTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
}

export interface VendorMcpCallResult {
  readonly content: readonly Record<string, unknown>[];
  readonly isError: boolean;
  readonly structuredContent?: unknown;
}

export const VENDOR_MCP_PROTOCOL_VERSION = "2025-06-18";
export const VENDOR_MCP_REQUEST_TIMEOUT_MS = 60_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value != null && !Array.isArray(value);

interface Session {
  sessionId?: string;
  initialized: boolean;
  nextId: number;
}

const sessions = new Map<string, Session>();

function sessionKey(url: string, accessToken: string): string {
  return `${url}\u0000${accessToken}`;
}

/** Forget a session (a vendor answered 404 to a known session id, or the token changed). */
export function forgetVendorMcpSession(url: string, accessToken: string): void {
  sessions.delete(sessionKey(url, accessToken));
}

function parseSseMessages(body: string): unknown[] {
  const messages: unknown[] = [];
  let data: string[] = [];
  const flush = () => {
    if (data.length === 0) return;
    const text = data.join("\n");
    data = [];
    try { messages.push(JSON.parse(text)); } catch { /* not JSON, ignore */ }
  };
  for (const rawLine of body.split(/\r?\n/)) {
    if (rawLine.length === 0) { flush(); continue; }
    if (rawLine.startsWith(":")) continue;
    const colon = rawLine.indexOf(":");
    const field = colon < 0 ? rawLine : rawLine.slice(0, colon);
    const value = colon < 0 ? "" : rawLine.slice(colon + 1).replace(/^ /, "");
    if (field === "data") data.push(value);
  }
  flush();
  return messages;
}

async function readReply(response: Response, id: number): Promise<Record<string, unknown> | undefined> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (text.trim().length === 0) return undefined;
  const candidates: unknown[] = contentType.includes("text/event-stream")
    ? parseSseMessages(text)
    : (() => { try { const parsed: unknown = JSON.parse(text); return Array.isArray(parsed) ? parsed : [parsed]; } catch { return []; } })();
  for (const candidate of candidates) {
    if (isRecord(candidate) && candidate.id === id) return candidate;
  }
  return undefined;
}

export interface VendorMcpClientArgs {
  readonly url: string;
  readonly accessToken: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

async function post(args: VendorMcpClientArgs, session: Session, body: unknown): Promise<Response> {
  const fetchImpl = args.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? VENDOR_MCP_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(args.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${args.accessToken}`,
        "mcp-protocol-version": VENDOR_MCP_PROTOCOL_VERSION,
        ...(session.sessionId == null ? {} : { "mcp-session-id": session.sessionId }),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const sessionId = response.headers.get("mcp-session-id");
    if (sessionId != null && sessionId.length > 0) session.sessionId = sessionId;
    if (response.status === 401 || response.status === 403) throw new VendorMcpAuthRequiredError(`The vendor answered ${response.status} to ${args.url}.`, response.status);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function rpc(args: VendorMcpClientArgs, session: Session, method: string, params: unknown): Promise<unknown> {
  const id = session.nextId++;
  const response = await post(args, session, { jsonrpc: "2.0", id, method, params });
  if (!response.ok) {
    throw new VendorMcpHttpError(`The vendor answered ${response.status} to ${method}.`, response.status);
  }
  const reply = await readReply(response, id);
  if (reply == null) throw new VendorMcpHttpError(`The vendor sent no reply to ${method}.`, response.status);
  if (isRecord(reply.error)) {
    const error = reply.error;
    throw new VendorMcpHttpError(`${method} failed: ${String(error.message ?? error.code ?? "unknown error")}`, response.status);
  }
  return reply.result;
}

async function ensureInitialized(args: VendorMcpClientArgs): Promise<Session> {
  const key = sessionKey(args.url, args.accessToken);
  let session = sessions.get(key);
  if (session?.initialized) return session;
  session = { initialized: false, nextId: 1 };
  sessions.set(key, session);
  await rpc(args, session, "initialize", {
    protocolVersion: VENDOR_MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "Simeon", version: "1" },
  });
  // A notification has no id and expects no body; a 202 or a 200 both mean "noted".
  await post(args, session, { jsonrpc: "2.0", method: "notifications/initialized" }).then((response) => response.body?.cancel()).catch(() => undefined);
  session.initialized = true;
  return session;
}

async function withSession<T>(args: VendorMcpClientArgs, work: (session: Session) => Promise<T>): Promise<T> {
  const session = await ensureInitialized(args);
  try {
    return await work(session);
  } catch (error) {
    // A vendor that lost the session answers 404; start one more once.
    if (error instanceof VendorMcpHttpError && error.status === 404 && session.sessionId != null) {
      forgetVendorMcpSession(args.url, args.accessToken);
      return await work(await ensureInitialized(args));
    }
    throw error;
  }
}

export async function vendorMcpListTools(args: VendorMcpClientArgs): Promise<VendorMcpListedTool[]> {
  return withSession(args, async (session) => {
    const tools: VendorMcpListedTool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const result = await rpc(args, session, "tools/list", cursor == null ? {} : { cursor });
      if (!isRecord(result) || !Array.isArray(result.tools)) break;
      for (const tool of result.tools) {
        if (!isRecord(tool) || typeof tool.name !== "string" || tool.name.length === 0) continue;
        tools.push({
          name: tool.name,
          ...(typeof tool.description === "string" && tool.description.length > 0 ? { description: tool.description } : {}),
          ...(tool.inputSchema === undefined ? {} : { inputSchema: tool.inputSchema }),
        });
      }
      cursor = typeof result.nextCursor === "string" && result.nextCursor.length > 0 ? result.nextCursor : undefined;
      if (cursor == null) break;
    }
    return tools;
  });
}

export async function vendorMcpCallTool(args: VendorMcpClientArgs & { readonly name: string; readonly arguments: unknown }): Promise<VendorMcpCallResult> {
  return withSession(args, async (session) => {
    const result = await rpc(args, session, "tools/call", { name: args.name, arguments: isRecord(args.arguments) ? args.arguments : {} });
    if (!isRecord(result)) return { content: [], isError: false };
    const content = Array.isArray(result.content) ? result.content.filter(isRecord) : [];
    return {
      content,
      isError: result.isError === true,
      ...(result.structuredContent === undefined ? {} : { structuredContent: result.structuredContent }),
    };
  });
}
