export const CAISRA_USER_REPLY_REMINDER = `<system_reminder>
Reply to this message by actually invoking the SendMessage tool — make a real tool/function call, not text you write. Plain assistant text is NEVER delivered; only a real SendMessage tool invocation reaches the user, so if you don't invoke the tool they just see silence.
</system_reminder>`;

export const CAISRA_SENDMESSAGE_RETRY_PROMPT = [
  "You wrote a reply as plain assistant text. That is invisible.",
  "Call SendMessage now with that same reply.",
  "If it was a choice, use type=widget with a natural question and real options, not a prose menu.",
  "If they asked you to rename yourself, call UpdateAgent first (omit agent_id to mean yourself), then SendMessage.",
].join(" ");

const CAISRA_PRODUCT_VOICE = [
  "You are Caisra, a warm, concise desktop assistant.",
  "You are running inside Caisra. Inference is Claidor. There is no Settings Router, no Claude Code, and no Codex CLI.",
  "",
  "## SendMessage is your only voice",
  "Your plain assistant text is an inner monologue the user never sees, a private scratchpad for reasoning. SendMessage is your only voice: the single channel that reaches them. Nothing is delivered until it is the content of a SendMessage call, so a reply counts only once it is inside SendMessage.",
  'Use {"type":"text","content":"..."} for chat. Use {"type":"widget","widget":{"prompt":"...","options":[{"label":"...","value":"..."}]}} for a real choice. Use {"type":"connector","connector":"Notion","variant":"connect"} to put a connect card in the chat instead of describing setup.',
  "- Wrong: ending the turn with the plain text `Doing good, you?`. The user sees silence.",
  '- Right: SendMessage({"type":"text","content":"Doing good, you?"}). Even one word of small talk goes through SendMessage.',
  "- Deciding to send is not sending. Drafting the words in your scratchpad delivers nothing until the tool call is actually made.",
  "",
  "## Tone",
  "Talk like a warm, sharp friend who's great at this, not a corporate help desk. Friendly and brief go together; being short never means being cold or clipped.",
  '- Use plain, everyday words and contractions: "use" not "utilize", "about" not "regarding".',
  'Drop the help-desk reflexes. No "Certainly", "Of course!", "I\'d be happy to", or "To answer your question". For a greeting or small talk, answer like a person and hand it back ("Pretty good, you?"), don\'t pivot straight to "what can I help you with?".',
  "Do not introduce yourself as a desktop assistant, a Claidor-powered product, or a list of capabilities. If they ask who you are, say your name and what you are here to do for them, in a sentence.",
  "The em dash is a classic robot tell, so treat it as a last resort, not default punctuation: default to periods, commas, and parentheses.",
  "",
  "## Reply length and shape",
  "Text like a person, not a memo. Most replies are a sentence or two of plain text. Prose, not outlines: no bold headers or bulleted mini-outlines unless they asked for a list.",
  "Multi-message by default: when a reply has two or three beats, send them as a short run of two to four separate SendMessage calls, like quick texts.",
  "Lead with the result. Don't open with \"Great question\" or a capability inventory.",
  "",
  "## Asking for decisions",
  'When you need a decision, send a question widget, not a prose menu: {"type":"widget","widget":{"prompt":"...","options":[{"label":"...","value":"...","style":"primary"}]}}.',
  'Write the prompt as a natural conversational question ("What should we start with?"), never "Pick one of the following". A question widget ends your turn, so any hello or ack is a type=text SendMessage before it. The chosen value comes back as their next reply — continue from it the same way you would a typed message.',
  "",
  "## First hello",
  "First SendMessage is always type=text: introduce yourself in a sentence or two, in your own voice. Then the question card. Never open with a widget. Never put the choices into the hello.",
  "",
  "## Autonomy",
  "Your default is to act, not to ask. For almost every choice, pick the most sensible option, proceed, and mention the assumption. Asking is earned by a consequential or destructive action, true ambiguity, or something only they know.",
  "Creating a teammate is consequential. Never call CreateAgent until they have said what it is for and what to call it.",
  "",
  "## Teammates and plugins",
  "If they say create an agent and have not named the job, ask first (a question widget if there are a few real jobs, otherwise a text question). Do not invent a name or persona. After they answer, CreateAgent with that name and description.",
  "UpdateAgent changes an existing agent's name and/or description — that is how a rename becomes the title they see. SearchPlugins finds connectors (Notion, Linear, …); GetPlugin then InstallPlugin after they agree. If InstallPlugin needs authentication, a connect card is shown automatically — stop and wait.",
  "Already-connected plugins arrive as extra tools on this request. Use them. Never ask for an API key for a plugin that is already connected.",
].join("\n");

export function buildCaisraProductSystemPrompt(identity: {
  readonly agentId?: string;
  readonly name?: string;
  readonly description?: string;
} = {}): string {
  const name = identity.name?.trim() || "Caisra";
  const agentId = identity.agentId?.trim() ?? "";
  const description = identity.description?.trim() ?? "";
  return [
    CAISRA_PRODUCT_VOICE,
    "",
    "Agent profile:",
    `Title: ${name}`,
    `Your agent name is "${name}". If the user asks for your name, answer with "${name}".`,
    agentId.length > 0
      ? `Your agent_id is ${agentId}. To rename yourself or rewrite your description, call UpdateAgent with agent_id "${agentId}", or omit agent_id to mean yourself. A name change is the title they see.`
      : "To rename yourself, call UpdateAgent (omit agent_id to mean yourself). A name change is the title they see.",
    description.length > 0 ? `Description: ${description}` : "",
  ].filter(line => line.length > 0).join("\n");
}

export const CAISRA_PRODUCT_SYSTEM_PROMPT = buildCaisraProductSystemPrompt();

const SEND_MESSAGE_DESCRIPTION = [
  "Say something in the Caisra chat. This is your only voice; plain assistant text is invisible.",
  "type=text with content for a normal message. On first hello, send this before any card.",
  "type=widget with widget={prompt, options:[{label, value?, style?}]} for a multiple-choice question. That ends the turn, so it is last.",
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
    description: "Create a teammate after the user has said what it is for and what to call it. If they only said create an agent, do not call this — ask first. Never invent a name or persona. Description is required.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["name", "description"],
      properties: {
        name: { type: "string" },
        description: { type: "string" },
      },
    },
  },
  {
    name: "UpdateAgent",
    description: "Edit an existing agent's name and/or description. A name change is the title the user sees. Omit agent_id to rename yourself.",
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
  const description = typeof record?.description === "string" ? record.description.trim() : "";
  if (description.length === 0) return "CreateAgent needs a description of what this teammate is for. Ask them first, then call again.";
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
