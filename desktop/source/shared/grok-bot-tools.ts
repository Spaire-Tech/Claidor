import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

import { SAND_SEND_MESSAGE_TOOL_DESCRIPTION } from "../host/runner/tools/send-message-tool.js";
import { GROK_BOT_BOX_TOOLS, GROK_BOT_HOST_TOOL_NAMES } from "./grok-bot-box-tools.js";
import { sandWidgetSchema } from "./sand-widgets.js";

const CREATE_AGENT_DESCRIPTION = "Create a new agent (a new teammate assistant) for your user, with a name and an optional persona/description. Returns the new agent's id so you can immediately message it with SendToAgent. Use this to spin up a focused teammate for a job. You have no tool to delete an agent, so only create one when it is genuinely useful; the user can delete an agent themselves from the sidebar (right-click the agent → \"Delete\").";

const UPDATE_AGENT_DESCRIPTION = "Edit an existing agent's profile: its name and/or description. Only the fields you provide are changed; the rest are left exactly as they were, and there is no way to clear or delete an agent through this tool. Use it to refine a teammate you (or the user) created. Omit agent_id to mean yourself.";

const SEARCH_PLUGINS_DESCRIPTION = "Search the plugins the user could install (or already has): marketplace plugins bundling connectors and skills. Say what you're looking for in natural language and results come back ranked by relevance, each with its STABLE plugin id, install state, and what it includes. Use this to discover a capability (Linear, Notion, writing Word documents, …) or to check whether a plugin is installed. Inspect one result with GetPlugin; connector runtime statuses (connected/needsAuth) live in GetMcpServerStatus. This is read-only and never needs the user's permission.";

const GET_PLUGIN_DESCRIPTION = "Full detail for one plugin by its STABLE plugin id (from SearchPlugins): what it includes (connectors, skills), its install state, any setup fields InstallPlugin needs (with required/secret flags), and the installed MCP servers backing it. Read this before installing a plugin with setup fields, and before uninstalling (to know the full scope you must disclose). Read-only.";

const INSTALL_PLUGIN_DESCRIPTION = "Install a plugin by its STABLE plugin id (from SearchPlugins) into the user's Claidor account. Only call this after the user has agreed — confirm with a question widget first, since installing changes the user's configuration. Idempotent: re-installing an installed plugin is safe. Pass any setup values GetPlugin lists (ask the user for secrets like API keys — never guess). If an installed connector needs authentication, its connect card is shown to the user automatically — finish unrelated work, then end your turn; you're resumed when they authorize. New tools and skills become available on your next message.";

const EXTERNAL_SHELL_DESCRIPTION = `PROPOSE a command to run on behalf of the user.
If you have this tool, note that you DO have the ability to run commands directly on the USER's system.
Note that the user may have to approve the command before it is executed.
The user may reject it if it is not to their liking, or may modify the command before approving it.  If they do change it, take those changes into account.
This tool acts on the USER's computer (the same filesystem ExternalRead acts on), not your own box. When they ask you to look at their laptop, storage, files, apps, or local environment, use this tool — do not claim you cannot access their machine.
In using these tools, adhere to the following guidelines:
1. Based on the contents of the conversation, you will be told if you are in the same shell as a previous step or a different shell.
2. If in a new shell, you should \`cd\` to the appropriate directory and do necessary setup in addition to running the command. By default, the shell will initialize in the user's home directory.
3. If in the same shell, LOOK IN CHAT HISTORY for your current working directory.
4. For ANY commands that would require user interaction, ASSUME THE USER IS NOT AVAILABLE TO INTERACT and PASS THE NON-INTERACTIVE FLAGS (e.g. --yes for npx).
5. If the command would use a pager, append \` | cat\` to the command.
6. Dont include any newlines in the command.
Commands wait up to block_until_ms milliseconds (default 30000). Prefer ExternalRead to read a file; use this for listing, measuring, and running.`;

const EXTERNAL_READ_DESCRIPTION = `Reads a file on the user's computer, the same filesystem ExternalShell acts on. That machine is NOT your own box: it is the user's laptop, so use this when they ask you to look at a file they have. Do not claim you cannot read their files if you have this tool.

Text files include line numbers and support offset/limit paging. Image files (jpeg/jpg, png, gif, webp) are returned inline so you can see them. PDF files are converted to text.`;

export const GROK_BOT_EXTERNAL_SHELL_DEFAULT_MS = 30_000;
export const GROK_BOT_EXTERNAL_READ_MAX_CHARS = 100_000;

export const GROK_BOT_LOCAL_TOOL_NAMES = [
  "SendMessage",
  "CreateAgent",
  "UpdateAgent",
  "SearchPlugins",
  "GetPlugin",
  "InstallPlugin",
  "ExternalShell",
  "ExternalRead",
] as const;

export const GROK_BOT_TOOL_NAMES = [
  ...GROK_BOT_LOCAL_TOOL_NAMES,
  ...GROK_BOT_HOST_TOOL_NAMES,
] as const;

export type GrokBotLocalToolName = (typeof GROK_BOT_LOCAL_TOOL_NAMES)[number];
export type GrokBotHostToolName = (typeof GROK_BOT_HOST_TOOL_NAMES)[number];
export type GrokBotToolName = (typeof GROK_BOT_TOOL_NAMES)[number];

export function isGrokBotLocalToolName(name: string): name is GrokBotLocalToolName {
  return (GROK_BOT_LOCAL_TOOL_NAMES as readonly string[]).includes(name);
}

export function isGrokBotHostToolName(name: string): name is GrokBotHostToolName {
  return (GROK_BOT_HOST_TOOL_NAMES as readonly string[]).includes(name);
}

export function isGrokBotToolName(name: string): name is GrokBotToolName {
  return isGrokBotLocalToolName(name) || isGrokBotHostToolName(name);
}

export { GROK_BOT_HOST_TOOL_NAMES };

const GROK_BOT_LOCAL_TOOLS: readonly Record<string, unknown>[] = [
  {
    name: "SendMessage",
    description: SAND_SEND_MESSAGE_TOOL_DESCRIPTION,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["type"],
      properties: {
        type: { type: "string", enum: ["text", "widget", "connector"] },
        content: { type: "string" },
        widget: {
          type: "object",
          additionalProperties: false,
          required: ["prompt", "options"],
          properties: {
            prompt: { type: "string" },
            helpText: { type: "string" },
            allowCustom: { type: "boolean" },
            dismissOnMoveOn: { type: "boolean" },
            options: {
              type: "array",
              minItems: 1,
              maxItems: 6,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["label"],
                properties: {
                  label: { type: "string" },
                  value: { type: "string" },
                  description: { type: "string" },
                  style: { type: "string", enum: ["default", "primary", "danger"] },
                },
              },
            },
          },
        },
        connector: { type: "string" },
        variant: { type: "string", enum: ["connect", "connected"] },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "CreateAgent",
    description: CREATE_AGENT_DESCRIPTION,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: {
        name: { type: "string" },
        description: { type: "string" },
      },
    },
  },
  {
    name: "UpdateAgent",
    description: UPDATE_AGENT_DESCRIPTION,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        agent_id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
      },
    },
  },
  {
    name: "SearchPlugins",
    description: SEARCH_PLUGINS_DESCRIPTION,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string" },
      },
    },
  },
  {
    name: "GetPlugin",
    description: GET_PLUGIN_DESCRIPTION,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["plugin_id"],
      properties: {
        plugin_id: { type: "string" },
      },
    },
  },
  {
    name: "InstallPlugin",
    description: INSTALL_PLUGIN_DESCRIPTION,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["plugin_id"],
      properties: {
        plugin_id: { type: "string" },
        values: { type: "object", additionalProperties: { type: "string" } },
      },
    },
  },
  {
    name: "ExternalShell",
    description: EXTERNAL_SHELL_DESCRIPTION,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["command"],
      properties: {
        command: { type: "string", description: "The command to execute" },
        working_directory: {
          type: "string",
          description: "The absolute path to the working directory to execute the command in (defaults to the user's home directory)",
        },
        block_until_ms: {
          type: "number",
          description: "How long to block and wait for the command to complete (in milliseconds). Defaults to 30000ms (30 seconds). Make sure to set `block_until_ms` to higher than the command's expected runtime. Add some buffer since block_until_ms includes shell startup time. E.g. if you sleep for 40s, recommended `block_until_ms` is 45s. Do not specify a 'timeout' parameter; no such param exists.",
        },
      },
    },
  },
  {
    name: "ExternalRead",
    description: EXTERNAL_READ_DESCRIPTION,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        path: { type: "string", description: "The absolute path of the file to read." },
        offset: { type: "number", description: "The line number to start reading from. Positive values are 1-indexed from the start of the file. Negative values count backwards from the end. Only provide if the file is too large to read at once." },
        limit: { type: "number", description: "The number of lines to read. Only provide if the file is too large to read at once." },
      },
    },
  },
];

export const GROK_BOT_TOOLS: readonly Record<string, unknown>[] = [
  ...GROK_BOT_LOCAL_TOOLS,
  ...GROK_BOT_BOX_TOOLS,
];

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value != null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function stringifyToolResult(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "(no output)";
  try { return JSON.stringify(value); }
  catch { return String(value); }
}

export function sendMessageFromToolArgs(args: unknown): Record<string, unknown> | { error: string } {
  const record = asRecord(args);
  if (record == null) return { error: "SendMessage needs an object of arguments." };
  const type = typeof record.type === "string" ? record.type : "";
  if (type === "text") {
    const content = typeof record.content === "string" ? record.content.trim() : "";
    if (content.length === 0) return { error: "content is required when type is text" };
    return { type: "text", content };
  }
  if (type === "widget") {
    const widget = asRecord(record.widget);
    if (widget == null || typeof widget.prompt !== "string" || widget.prompt.trim().length === 0) {
      return { error: "widget is required when type is widget" };
    }
    // The stock SendMessage tool parses the widget with this schema before its
    // body runs (send-message-schema.ts), and the renderer refuses any other
    // shape (one to six options, each with a label). A bad card is an error
    // the model can fix, never a stored entry that paints as nothing.
    const parsed = sandWidgetSchema.safeParse(widget);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.length ? ` at widget.${issue.path.join(".")}` : "";
      return { error: `widget is malformed${where}: ${issue?.message ?? "invalid"}. A widget needs a prompt and 1 to 6 options, each with a label.` };
    }
    return { type: "widget", widget: parsed.data };
  }
  if (type === "connector") {
    const connector = typeof record.connector === "string" ? record.connector.trim() : "";
    if (connector.length === 0) return { error: "connector is required when type is connector" };
    const variant = record.variant === "connected" ? "connected" : "connect";
    return {
      type: "connector",
      connector,
      variant,
      ...(typeof record.reason === "string" && record.reason.trim().length > 0 ? { reason: record.reason.trim() } : {}),
    };
  }
  return { error: `unsupported SendMessage type: ${type || "(missing)"}` };
}

export interface ExternalShellInput {
  readonly command: string;
  readonly workingDirectory?: string;
  readonly blockUntilMs?: number;
}

export interface ExternalReadInput {
  readonly path: string;
  readonly offset?: number;
  readonly limit?: number;
}

export interface GrokBotToolContext {
  readonly agentId: string;
  readonly dispatchRemote: (method: string, args: unknown) => Promise<unknown>;
  readonly emitSendMessage: (message: Record<string, unknown>) => Promise<string | undefined>;
  readonly runExternalShell?: (input: ExternalShellInput) => Promise<string>;
  readonly readExternalFile?: (input: ExternalReadInput) => Promise<string>;
}

export function resolveUserComputerPath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return homedir();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return resolve(homedir(), trimmed.slice(2));
  return isAbsolute(trimmed) ? trimmed : resolve(homedir(), trimmed);
}

export async function defaultRunExternalShell(input: ExternalShellInput): Promise<string> {
  const command = input.command.trim();
  if (command.length === 0) return "ExternalShell needs a command.";
  const cwd = input.workingDirectory != null && input.workingDirectory.trim().length > 0
    ? resolveUserComputerPath(input.workingDirectory)
    : homedir();
  const timeoutMs = typeof input.blockUntilMs === "number" && Number.isFinite(input.blockUntilMs) && input.blockUntilMs > 0
    ? Math.min(Math.floor(input.blockUntilMs), 600_000)
    : GROK_BOT_EXTERNAL_SHELL_DEFAULT_MS;
  const shell = (process.env.SHELL ?? "").trim() || "/bin/zsh";
  return await new Promise(resolvePromise => {
    let child: ReturnType<typeof spawn>;
    try {
      const quotedCwd = JSON.stringify(cwd);
      child = spawn(shell, ["-lc", `cd ${quotedCwd} && ${command}`], {
        cwd,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      resolvePromise(`Failed to run command: ${message}`);
      return;
    }
    let stdout = "";
    let stderr = "";
    const max = 200_000;
    child.stdout?.on("data", chunk => {
      if (stdout.length < max) stdout += chunk.toString();
    });
    child.stderr?.on("data", chunk => {
      if (stderr.length < max) stderr += chunk.toString();
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 1_000).unref();
    }, timeoutMs);
    child.on("error", error => {
      clearTimeout(timer);
      resolvePromise(`Failed to run command: ${error.message}`);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const parts = [
        timedOut ? `Command exceeded ${timeoutMs}ms and was stopped.` : `exit_code: ${code ?? signal ?? "unknown"}`,
        stdout.length > 0 ? stdout.replace(/\s+$/, "") : "",
        stderr.trim().length > 0 ? `stderr:\n${stderr.replace(/\s+$/, "")}` : "",
      ].filter(part => part.length > 0);
      resolvePromise(parts.join("\n\n") || "(no output)");
    });
  });
}

export async function defaultReadExternalFile(input: ExternalReadInput): Promise<string> {
  const rawPath = input.path.trim();
  if (rawPath.length === 0) return "ExternalRead needs a path.";
  const filePath = resolveUserComputerPath(rawPath);
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) return `Error: ${filePath} is a directory. Use ExternalShell to list it.`;
    const buffer = await readFile(filePath);
    if (buffer.subarray(0, 8_000).includes(0)) return `Error: ${filePath} looks like a binary file.`;
    const text = buffer.toString("utf8");
    if (text.length === 0) return "File is empty.";
    const lines = text.split("\n");
    let start = 0;
    if (typeof input.offset === "number" && Number.isFinite(input.offset)) {
      start = input.offset < 0
        ? Math.max(0, lines.length + Math.floor(input.offset))
        : Math.max(0, Math.floor(input.offset) - 1);
    }
    const count = typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0
      ? Math.floor(input.limit)
      : lines.length - start;
    const slice = lines.slice(start, start + count);
    const numbered = slice.map((line, index) => `${String(start + index + 1).padStart(6)}|${line}`).join("\n");
    if (numbered.length > GROK_BOT_EXTERNAL_READ_MAX_CHARS) {
      return `${numbered.slice(0, GROK_BOT_EXTERNAL_READ_MAX_CHARS)}\n\n[truncated: file is too long; use offset and limit]`;
    }
    return numbered;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error reading ${filePath}: ${message}`;
  }
}

async function executeSendMessage(args: unknown, context: GrokBotToolContext): Promise<string> {
  const message = sendMessageFromToolArgs(args);
  if ("error" in message) return `Failed to send the message to the user: ${message.error}`;
  if (message.type === "connector") {
    await context.dispatchRemote("appendConnectorCard", {
      agentId: context.agentId,
      connector: message.connector,
      variant: message.variant,
      ...(typeof message.reason === "string" ? { reason: message.reason } : {}),
    });
    return "Message sent to user.";
  }
  const id = await context.emitSendMessage(message);
  return id != null && id.length > 0 ? `Message sent to user. (id: ${id})` : "Message sent to user.";
}

async function executeCreateAgent(args: unknown, context: GrokBotToolContext): Promise<string> {
  const record = asRecord(args);
  const name = typeof record?.name === "string" ? record.name.trim() : "";
  if (name.length === 0) return "CreateAgent needs a name.";
  const description = typeof record?.description === "string" ? record.description.trim() : "";
  const created = asRecord(await context.dispatchRemote("createAgent", {
    name,
    description,
    origin: "agent",
  }));
  const agent = asRecord(created?.agent) ?? created;
  const id = typeof agent?.id === "string" ? agent.id : "";
  const createdName = typeof agent?.name === "string" ? agent.name : name;
  return id.length > 0
    ? `Created agent "${createdName}" (id: ${id}). Message it with SendToAgent using that id.`
    : `Created agent "${createdName}".`;
}

async function executeUpdateAgent(args: unknown, context: GrokBotToolContext): Promise<string> {
  const record = asRecord(args);
  const requested = typeof record?.agent_id === "string" ? record.agent_id.trim() : "";
  const agentId = requested.length > 0 ? requested : context.agentId.trim();
  if (agentId.length === 0) return "UpdateAgent needs agent_id.";
  const name = typeof record?.name === "string" && record.name.trim().length > 0 ? record.name.trim() : undefined;
  const description = typeof record?.description === "string" && record.description.trim().length > 0 ? record.description.trim() : undefined;
  if (name == null && description == null) return "Nothing to update: provide a new name and/or description.";
  const agents = await context.dispatchRemote("listAgents", {});
  const rows = Array.isArray(agents) ? agents : [];
  const existing = rows.map(asRecord).find(row => row?.id === agentId);
  if (existing == null && agentId !== context.agentId) return `No agent found with id ${agentId}.`;
  const updated = asRecord(await context.dispatchRemote("updateAgent", {
    id: agentId,
    profile: {
      name: name ?? (typeof existing?.name === "string" ? existing.name : ""),
      description: description ?? (typeof existing?.description === "string" ? existing.description : ""),
    },
  }));
  const updatedName = typeof updated?.name === "string" ? updated.name : name ?? String(existing?.name ?? agentId);
  return updated == null
    ? `No agent found with id ${agentId}.`
    : `Updated agent "${updatedName}" (id: ${agentId}).`;
}

export async function executeGrokBotTool(
  name: string,
  args: unknown,
  context: GrokBotToolContext,
): Promise<string> {
  if (name === "SendMessage") return executeSendMessage(args, context);
  if (name === "CreateAgent") return executeCreateAgent(args, context);
  if (name === "UpdateAgent") return executeUpdateAgent(args, context);
  if (name === "SearchPlugins") {
    return stringifyToolResult(await context.dispatchRemote("searchPlugins", { query: typeof asRecord(args)?.query === "string" ? asRecord(args)!.query : "" }));
  }
  if (name === "GetPlugin") {
    const pluginId = typeof asRecord(args)?.plugin_id === "string" ? asRecord(args)!.plugin_id : "";
    return stringifyToolResult(await context.dispatchRemote("getPlugin", { plugin_id: pluginId }));
  }
  if (name === "InstallPlugin") {
    const record = asRecord(args);
    const pluginId = typeof record?.plugin_id === "string" ? record.plugin_id : "";
    const values = asRecord(record?.values);
    return stringifyToolResult(await context.dispatchRemote("installPlugin", {
      plugin_id: pluginId,
      agentId: context.agentId,
      ...(values == null ? {} : { values }),
    }));
  }
  if (name === "ExternalShell") {
    const record = asRecord(args);
    const command = typeof record?.command === "string" ? record.command : "";
    const workingDirectory = typeof record?.working_directory === "string" ? record.working_directory : undefined;
    const blockUntilMs = typeof record?.block_until_ms === "number" ? record.block_until_ms : undefined;
    const run = context.runExternalShell ?? defaultRunExternalShell;
    return await run({
      command,
      ...(workingDirectory == null ? {} : { workingDirectory }),
      ...(blockUntilMs == null ? {} : { blockUntilMs }),
    });
  }
  if (name === "ExternalRead") {
    const record = asRecord(args);
    const path = typeof record?.path === "string" ? record.path : "";
    const offset = typeof record?.offset === "number" ? record.offset : undefined;
    const limit = typeof record?.limit === "number" ? record.limit : undefined;
    const read = context.readExternalFile ?? defaultReadExternalFile;
    return await read({
      path,
      ...(offset == null ? {} : { offset }),
      ...(limit == null ? {} : { limit }),
    });
  }
  return `Unknown tool: ${name}`;
}
