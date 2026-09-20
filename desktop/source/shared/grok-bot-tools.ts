export const CAISRA_PRODUCT_SYSTEM_PROMPT = [
  "You are Caisra, a warm, concise desktop assistant.",
  "You are running inside Caisra. Inference is Claidor. There is no Settings Router, no Claude Code, and no Codex CLI.",
  "",
  "## SendMessage is your only voice",
  "Your plain assistant text is a private scratchpad the user never sees. Nothing reaches them until it is the content of a SendMessage call, including a short hello. Use {\"type\":\"text\",\"content\":\"...\"} for chat. Use {\"type\":\"widget\",\"widget\":{\"prompt\":\"...\",\"options\":[{\"label\":\"...\",\"value\":\"...\"}]}} for a real choice — phrase the prompt as a natural question, never a menu. Sending a widget ends your turn. Use {\"type\":\"connector\",\"connector\":\"Notion\",\"variant\":\"connect\"} to put a connect card in the chat instead of describing setup.",
  "",
  "## Tone",
  "Talk like a warm, sharp friend who's great at this, not a corporate help desk. Plain everyday words. No \"Certainly\", \"Of course!\", or \"I'd be happy to\". Prose, not outlines: no bold headers or bulleted mini-outlines unless they asked for a list. Most replies are a sentence or two.",
  "",
  "## Teammates and plugins",
  "CreateAgent spins up a new teammate (name + description). UpdateAgent changes an existing agent's name and/or description — that is how a rename becomes the title. SearchPlugins finds connectors (Notion, Linear, …); GetPlugin then InstallPlugin after they agree. If InstallPlugin needs authentication, a connect card is shown automatically — stop and wait.",
  "Already-connected plugins arrive as extra tools on this request. Use them. Never ask for an API key for a plugin that is already connected.",
].join("\n");

const SEND_MESSAGE_DESCRIPTION = [
  "Say something in the Caisra chat. This is your only voice; plain assistant text is invisible.",
  "type=text with content for a normal message.",
  "type=widget with widget={prompt, options:[{label, value?, style?}]} for a multiple-choice question. That ends the turn.",
  "type=connector with connector (display name, e.g. Notion) and variant=connect to show a connect card in the chat.",
].join(" ");

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
    description: SEND_MESSAGE_DESCRIPTION,
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
    description: "Create a new agent (teammate) with a name and optional persona/description. Returns its id.",
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
    description: "Edit an existing agent's name and/or description. A name change is the title the user sees.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["agent_id"],
      properties: {
        agent_id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
      },
    },
  },
  {
    name: "SearchPlugins",
    description: "Search installable plugins/connectors (Notion, Linear, …) by what the user wants. Read-only.",
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
    description: "Full detail for one plugin by its stable plugin_id from SearchPlugins. Read-only.",
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
    description: "Install a plugin by plugin_id after the user agreed (confirm with a question widget first). A connect card is shown automatically if the connector still needs authentication.",
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
  const description = typeof record?.description === "string" ? record.description : "";
  const created = asRecord(await context.dispatchRemote("createAgent", {
    name,
    description,
    origin: "agent",
    isKickstartRequested: true,
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
  const agentId = typeof record?.agent_id === "string" ? record.agent_id.trim() : "";
  if (agentId.length === 0) return "UpdateAgent needs agent_id.";
  const name = typeof record?.name === "string" && record.name.trim().length > 0 ? record.name.trim() : undefined;
  const description = typeof record?.description === "string" && record.description.trim().length > 0 ? record.description.trim() : undefined;
  if (name == null && description == null) return "Nothing to update: provide a new name and/or description.";
  const agents = await context.dispatchRemote("listAgents", {});
  const rows = Array.isArray(agents) ? agents : [];
  const existing = rows.map(asRecord).find(row => row?.id === agentId);
  if (existing == null) return `No agent found with id ${agentId}.`;
  const updated = asRecord(await context.dispatchRemote("updateAgent", {
    id: agentId,
    profile: {
      name: name ?? (typeof existing.name === "string" ? existing.name : ""),
      description: description ?? (typeof existing.description === "string" ? existing.description : ""),
    },
  }));
  const updatedName = typeof updated?.name === "string" ? updated.name : name ?? String(existing.name ?? agentId);
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
