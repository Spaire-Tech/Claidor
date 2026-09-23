import { clipForHostLog, HOST_LOG_PREFIX, logHostLine } from "../../shared/host-log.js";
export interface SandUpdate { type: string; [key: string]: unknown }
// A send-message update is the agent's voice reaching the transcript. Its
// write is logged either way: `written id=…` when the transcript took it,
// `not written` with the sentence when the hop threw — that sentence is what
// the model is then told inside "Failed to send the message to the user".
export function createSandTransport(ingest: (update: SandUpdate) => string | undefined) {
  let lastSentMessageId: string | undefined; let lastReactionApplied = false;
  return {
    onUpdate(update: SandUpdate): void {
      let assignedId: string | undefined;
      try { assignedId = ingest(update); } catch (error) {
        if (update.type === "send-message") logHostLine(`${HOST_LOG_PREFIX} send-message not written type=${messageType(update)} error=${clipForHostLog(error instanceof Error ? `${error.name}: ${error.message}` : String(error))}`);
        throw error;
      }
      if (update.type === "send-message") { lastSentMessageId = assignedId; logHostLine(`${HOST_LOG_PREFIX} send-message written id=${assignedId ?? "-"} type=${messageType(update)}`); }
      else if (update.type === "react-to-message") lastReactionApplied = assignedId != null;
    },
    lastSentMessageId: () => lastSentMessageId,
    lastReactionApplied: () => lastReactionApplied,
  };
}
function messageType(update: SandUpdate): string {
  const message = update.message;
  return typeof message === "object" && message != null && typeof (message as { type?: unknown }).type === "string" ? (message as { type: string }).type : "?";
}
