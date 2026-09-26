import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";

import {
  defaultReadExternalFile,
  defaultRunExternalShell,
  stringifyToolResult,
  asRecord,
} from "../../../shared/grok-bot-tools.js";
/**
 * What the text-only escape hatch (SAND_CLAIDOR_FULL_AGENT=off) answers for
 * a tool that needs the full agent: the computer, the browser, Task,
 * GenerateImage, box hand-off and update_state. Until 26 September 2026 these
 * answered "The computer is still starting up", which was never the reason:
 * this path is a text call that cannot see an image, and the forever-box
 * `captureScreenshot` it asked was never given a dependency, in Grok Bot's
 * own extension either (`ce9fc2d8`), so it was null forever (ledger F-144).
 * Grok Bot sees its screen through the loop's Screenshot and Computer tools,
 * which is the default path here.
 */
export const ROUTED_TEXT_ONLY_TOOL_MESSAGE = "This tool is not available in Simeon's text-only mode, which this conversation is running in. It cannot see or drive the computer, use the browser, start a subagent or make an image. Tell the person plainly that this needs the full agent, and do not retry it.";
import {
  SAND_LOCAL_TOOLS_DENIED_MESSAGE,
  type SandLocalToolRequest,
} from "../../../shared/local-tool-permission-machinery.js";
import type { SandLocalToolAction } from "../../../shared/local-tool-permission.js";

const routedAskAgents = new Set<string>();

export function isRoutedLocalToolAskOpen(agentId: string): boolean {
  return routedAskAgents.has(agentId);
}

export interface RoutedAgentToolRequest {
  readonly agentId: string;
  readonly name: string;
  readonly args?: unknown;
  readonly toolCallId?: string;
}

interface LocalToolPermissionApi {
  subscribe(listener: (event: { readonly type: string; readonly request: { readonly id: string; readonly agentId: string; readonly action: string; readonly target: string; readonly status: string; readonly description?: string } }) => void): () => void;
  authorize(scope: { readonly agentId: string; readonly toolCallId: string; readonly action?: SandLocalToolAction }, request: SandLocalToolRequest): Promise<{ readonly allowed: boolean; readonly reason?: string }>;
}

interface TranscriptGateway {
  appendSendMessage(args: { agentId?: string; message: Record<string, unknown> }): Promise<{ id: string } | unknown>;
  sendToAgent?(fromAgentId: string, toAgentId: string, text: string): Promise<unknown> | unknown;
  reactToMessage?(entryId: string, emoji: string, agentId: string): Promise<unknown> | unknown;
}

interface ForeverBoxApi {
  captureScreenshot?(agentId: string): Promise<Uint8Array | null>;
  ensure?(input: { id: string }): Promise<unknown>;
}

export interface RoutedAgentToolHost {
  readonly transcript: TranscriptGateway;
  readonly localToolPermission: LocalToolPermissionApi;
  readonly foreverBox?: ForeverBoxApi;
}

function stringArg(record: Record<string, unknown> | null, key: string): string {
  return typeof record?.[key] === "string" ? record[key] : "";
}

function numberArg(record: Record<string, unknown> | null, key: string): number | undefined {
  return typeof record?.[key] === "number" ? record[key] : undefined;
}

export async function authorizeRoutedLocalTool(options: {
  readonly agentId: string;
  readonly toolCallId: string;
  readonly action: SandLocalToolAction;
  readonly target: string;
  readonly localToolPermission: LocalToolPermissionApi;
  readonly appendSendMessage: (message: Record<string, unknown>) => Promise<unknown>;
}): Promise<{ readonly allowed: boolean; readonly reason?: string }> {
  const { agentId } = options;
  routedAskAgents.add(agentId);
  const unsubscribe = options.localToolPermission.subscribe(event => {
    if (event.request.agentId !== agentId) return;
    if (event.type === "created") {
      void options.appendSendMessage({
        type: "local-tool-permission",
        ask: {
          requestId: event.request.id,
          action: event.request.action,
          target: event.request.target,
          status: "pending",
          ...(event.request.description === undefined ? {} : { description: event.request.description }),
        },
      });
    }
  });
  try {
    const decision = await options.localToolPermission.authorize(
      { agentId, toolCallId: options.toolCallId, action: options.action },
      { action: options.action, target: options.target },
    );
    if (decision.allowed) return { allowed: true };
    return { allowed: false, reason: decision.reason ?? SAND_LOCAL_TOOLS_DENIED_MESSAGE };
  } finally {
    unsubscribe();
    routedAskAgents.delete(agentId);
  }
}

async function executeBoxShell(args: unknown): Promise<string> {
  const record = asRecord(args);
  const command = stringArg(record, "command");
  const workingDirectory = stringArg(record, "working_directory");
  const blockUntilMs = numberArg(record, "block_until_ms");
  return await defaultRunExternalShell({
    command,
    workingDirectory: workingDirectory.length > 0 ? workingDirectory : "/workspace",
    ...(blockUntilMs == null ? {} : { blockUntilMs }),
  });
}

async function executeBoxRead(args: unknown): Promise<string> {
  const record = asRecord(args);
  const path = stringArg(record, "path");
  const offset = numberArg(record, "offset");
  const limit = numberArg(record, "limit");
  return await defaultReadExternalFile({
    path: path.length > 0 ? path : "/workspace",
    ...(offset == null ? {} : { offset }),
    ...(limit == null ? {} : { limit }),
  });
}

async function executeWebFetch(args: unknown): Promise<string> {
  const url = stringArg(asRecord(args), "url").trim();
  if (url.length === 0) return "WebFetch needs a url.";
  let parsed: URL;
  try { parsed = new URL(url); }
  catch { return "Invalid URL: must include http:// or https://"; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `Invalid URL protocol: ${parsed.protocol} (must be http or https)`;
  }
  try {
    const response = await fetch(parsed, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
    const text = await response.text();
    if (!response.ok) return `Fetch failed: ${response.status} ${response.statusText}`;
    return text.length > 100_000 ? `${text.slice(0, 100_000)}\n\n[truncated]` : text;
  } catch (error) {
    return `Fetch failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function executeWebSearch(args: unknown): Promise<string> {
  const term = stringArg(asRecord(args), "search_term").trim();
  if (term.length === 0) return "WebSearch needs a search_term.";
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(term)}`;
  const body = await executeWebFetch({ url });
  if (body.startsWith("Fetch failed") || body.startsWith("Invalid")) return body;
  const titles = [...body.matchAll(/class="result__a"[^>]*>([^<]+)/g)].map(match => match[1]?.trim() ?? "").filter(title => title.length > 0).slice(0, 8);
  if (titles.length === 0) return body.slice(0, 8_000);
  return titles.map((title, index) => `${index + 1}. ${title}`).join("\n");
}

async function writeBoxFile(path: string, data: Uint8Array): Promise<string> {
  const target = isAbsolute(path) ? path : join("/workspace", path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
  return target;
}

export async function executeRoutedAgentTool(
  host: RoutedAgentToolHost,
  request: RoutedAgentToolRequest,
): Promise<unknown> {
  const agentId = request.agentId.trim();
  const name = request.name.trim();
  const args = request.args;
  const toolCallId = request.toolCallId?.trim() || randomUUID();
  if (agentId.length === 0 || name.length === 0) return "executeRoutedAgentTool needs agentId and name.";

  const appendSendMessage = async (message: Record<string, unknown>) => host.transcript.appendSendMessage({ agentId, message });

  if (name === "ExternalShell" || name === "ExternalRead" || name === "ExternalAwaitShell") {
    const record = asRecord(args);
    const action: SandLocalToolAction = name === "ExternalRead" ? "read-file" : "run-command";
    const target = name === "ExternalRead" ? stringArg(record, "path") : stringArg(record, "command") || stringArg(record, "path");
    return await authorizeRoutedLocalTool({
      agentId,
      toolCallId,
      action,
      target,
      localToolPermission: host.localToolPermission,
      appendSendMessage,
    });
  }
  if (name === "CopyToBox" || name === "CopyFromBox") {
    const record = asRecord(args);
    const action: SandLocalToolAction = name === "CopyToBox" ? "read-file" : "write-file";
    const target = name === "CopyToBox" ? stringArg(record, "computer_path") : stringArg(record, "computer_path") || stringArg(record, "box_path");
    const gate = await authorizeRoutedLocalTool({
      agentId,
      toolCallId,
      action,
      target,
      localToolPermission: host.localToolPermission,
      appendSendMessage,
    });
    if (!gate.allowed) return gate;
    if (name === "CopyFromBox") {
      const boxPath = stringArg(record, "box_path");
      const target = isAbsolute(boxPath) ? boxPath : join("/workspace", boxPath);
      const bytes = await readFile(target);
      return { allowed: true, bytesBase64: Buffer.from(bytes).toString("base64"), boxPath: target };
    }
    return gate;
  }
  if (name === "WriteBoxFile") {
    const record = asRecord(args);
    const path = stringArg(record, "path");
    const bytesBase64 = stringArg(record, "bytesBase64");
    const written = await writeBoxFile(path, Buffer.from(bytesBase64, "base64"));
    return `Copied onto your box at ${written}.`;
  }

  if (name === "Shell") return await executeBoxShell(args);
  if (name === "Read") return await executeBoxRead(args);
  if (name === "AwaitShell" || name === "ExternalAwaitShell") {
    return "No background command is running on this computer right now.";
  }
  if (name === "Screenshot" || name === "Computer") return ROUTED_TEXT_ONLY_TOOL_MESSAGE;
  if (name === "WebFetch") return await executeWebFetch(args);
  if (name === "WebSearch") return await executeWebSearch(args);
  if (name === "SendToAgent") {
    const record = asRecord(args);
    const targetId = stringArg(record, "target_id");
    const message = stringArg(record, "message");
    if (targetId.length === 0 || message.length === 0) return "SendToAgent needs target_id and message.";
    if (host.transcript.sendToAgent == null) return "SendToAgent is not available.";
    await host.transcript.sendToAgent(agentId, targetId, message);
    return `sent to ${targetId}`;
  }
  if (name === "ReactToMessage") {
    const record = asRecord(args);
    const entryId = stringArg(record, "message_address");
    const emoji = stringArg(record, "emoji");
    if (host.transcript.reactToMessage == null) return "ReactToMessage is not available.";
    await host.transcript.reactToMessage(entryId, emoji, agentId);
    return `Reacted ${emoji} on ${entryId}.`;
  }
  if (name.startsWith("browser_")) return ROUTED_TEXT_ONLY_TOOL_MESSAGE;
  if (name === "Task" || name === "GenerateImage" || name === "RequestBoxHelp" || name === "update_state") {
    return ROUTED_TEXT_ONLY_TOOL_MESSAGE;
  }
  return stringifyToolResult({ error: `Unknown tool: ${name}` });
}
