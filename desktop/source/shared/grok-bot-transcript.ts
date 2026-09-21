import { summarizeWidget } from "./sand-widgets.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value != null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export interface GrokBotChatMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly id?: string;
}

function assistantFromSendMessage(message: Record<string, unknown>): string | null {
  const type = typeof message.type === "string" ? message.type : "";
  if (type === "text") {
    const content = typeof message.content === "string" ? message.content.trim() : "";
    return content.length > 0 ? content : null;
  }
  if (type === "widget") {
    const widget = asRecord(message.widget);
    return widget == null ? null : summarizeWidget(widget);
  }
  if (type === "connector") {
    const connector = typeof message.connector === "string" ? message.connector : "a connector";
    return message.variant === "connected"
      ? `Confirmed the ${connector} connector is connected`
      : `Asked the user to connect the ${connector} connector`;
  }
  if (type === "connectors" && Array.isArray(message.connectors)) {
    return `Asked the user to connect: ${message.connectors.filter(item => typeof item === "string").join(", ")}`;
  }
  if (type === "local-tool-permission") {
    const ask = asRecord(message.ask);
    if (ask == null) return null;
    return `Asked the user for permission to use their computer (${String(ask.action)}: ${String(ask.target)}). Status: ${String(ask.status)}.`;
  }
  return null;
}

export function chatMessageFromTranscriptEntry(raw: unknown): GrokBotChatMessage | null {
  const row = asRecord(raw);
  if (row == null || typeof row.id !== "string" || row.id.length === 0) return null;
  if (row.kind === "message" && row.role === "user" && typeof row.content === "string" && row.content.trim().length > 0) {
    return { role: "user", content: row.content, id: row.id };
  }
  if (row.kind === "send-message") {
    const message = asRecord(row.message);
    if (message == null) return null;
    const content = assistantFromSendMessage(message);
    if (content == null) return null;
    return { role: "assistant", content, id: row.id };
  }
  return null;
}

export function mergeHostAndLocalChatHistory(options: {
  readonly remoteEntries: readonly unknown[];
  readonly localMessages: readonly GrokBotChatMessage[];
}): GrokBotChatMessage[] {
  const localIds = new Set(options.localMessages.map(message => message.id).filter((id): id is string => typeof id === "string" && id.length > 0));
  const fromHost: GrokBotChatMessage[] = [];
  for (const raw of options.remoteEntries) {
    const message = chatMessageFromTranscriptEntry(raw);
    if (message == null || (message.id != null && localIds.has(message.id))) continue;
    fromHost.push(message);
  }
  return [...fromHost, ...options.localMessages];
}
