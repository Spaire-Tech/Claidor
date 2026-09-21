import { SAND_SEND_MESSAGE_TOOL_DESCRIPTION } from "../host/runner/tools/send-message-tool.js";

const CREATE_AGENT_DESCRIPTION = "Create a new agent (a new teammate assistant) for your user, with a name and an optional persona/description. Returns the new agent's id so you can immediately message it with SendToAgent. Use this to spin up a focused teammate for a job. You have no tool to delete an agent, so only create one when it is genuinely useful; the user can delete an agent themselves from the sidebar (right-click the agent → \"Delete\").";

const UPDATE_AGENT_DESCRIPTION = "Edit an existing agent's profile: its name and/or description. Only the fields you provide are changed; the rest are left exactly as they were, and there is no way to clear or delete an agent through this tool. Use it to refine a teammate you (or the user) created. Omit agent_id to mean yourself.";

const SEARCH_PLUGINS_DESCRIPTION = "Search the plugins the user could install (or already has): marketplace plugins bundling connectors and skills. Say what you're looking for in natural language and results come back ranked by relevance, each with its STABLE plugin id, install state, and what it includes. Use this to discover a capability (Linear, Notion, writing Word documents, …) or to check whether a plugin is installed. Inspect one result with GetPlugin; connector runtime statuses (connected/needsAuth) live in GetMcpServerStatus. This is read-only and never needs the user's permission.";

const GET_PLUGIN_DESCRIPTION = "Full detail for one plugin by its STABLE plugin id (from SearchPlugins): what it includes (connectors, skills), its install state, any setup fields InstallPlugin needs (with required/secret flags), and the installed MCP servers backing it. Read this before installing a plugin with setup fields, and before uninstalling (to know the full scope you must disclose). Read-only.";

const INSTALL_PLUGIN_DESCRIPTION = "Install a plugin by its STABLE plugin id (from SearchPlugins) into the user's Claidor account. Only call this after the user has agreed — confirm with a question widget first, since installing changes the user's configuration. Idempotent: re-installing an installed plugin is safe. Pass any setup values GetPlugin lists (ask the user for secrets like API keys — never guess). If an installed connector needs authentication, its connect card is shown to the user automatically — finish unrelated work, then end your turn; you're resumed when they authorize. New tools and skills become available on your next message.";

export const GROK_BOT_TOOL_NAMES = [
  "SendMessage",
  "CreateAgent",
  "UpdateAgent",
  "SearchPlugins",
  "GetPlugin",
  "InstallPlugin",
] as const;

export type GrokBotToolName = (typeof GROK_BOT_TOOL_NAMES)[number];

export function isGrokBotToolName(name: string): name is GrokBotToolName {
  return (GROK_BOT_TOOL_NAMES as readonly string[]).includes(name);
}

export const GROK_BOT_TOOLS: readonly Record<string, unknown>[] = [
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
    return { type: "widget", widget };
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

export interface GrokBotToolContext {
  readonly agentId: string;
  readonly dispatchRemote: (method: string, args: unknown) => Promise<unknown>;
  readonly emitSendMessage: (message: Record<string, unknown>) => Promise<string | undefined>;
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
  return `Unknown tool: ${name}`;
}
