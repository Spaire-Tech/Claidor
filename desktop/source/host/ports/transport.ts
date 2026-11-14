/**
 * The way an agent's updates reach the transcript. Every update is handed
 * to `ingest`, and the transport remembers two things for whoever asks
 * afterwards: the id the transcript gave the last sent message, and whether
 * the last reaction held.
 *
 * A sent message is the agent speaking to the person, so what became of it
 * is written to the host's log both ways: "written" with its id when the
 * transcript took it, "not written" with the refusal when it did not. The
 * refusal is thrown on to the caller as it is.
 */
import { clipForHostLog, HOST_LOG_PREFIX, logHostLine } from "../../shared/host-log.js";

export interface SandUpdate {
  type: string;
  [key: string]: unknown;
}

const SENT_MESSAGE = "send-message";
const REACTION = "react-to-message";

/** The kind of message a sent-message update carries, for the log: its message's own `type` when that is a text. */
function messageKind(update: SandUpdate): string {
  const { message } = update;
  if (typeof message !== "object" || message === null) return "?";
  const { type } = message as { type?: unknown };
  return typeof type === "string" ? type : "?";
}

/** What was thrown, in words: an error by its name and message, anything else as text. */
function wordsOf(thrown: unknown): string {
  return thrown instanceof Error ? `${thrown.name}: ${thrown.message}` : String(thrown);
}

export function createSandTransport(ingest: (update: SandUpdate) => string | undefined) {
  let lastSentMessageId: string | undefined;
  let lastReactionApplied = false;

  /** Hands one update to the transcript. A sent message that is refused is written to the log before the refusal goes on. */
  function handOver(update: SandUpdate): string | undefined {
    try {
      return ingest(update);
    } catch (error) {
      if (update.type === SENT_MESSAGE) {
        logHostLine(`${HOST_LOG_PREFIX} send-message not written type=${messageKind(update)} error=${clipForHostLog(wordsOf(error))}`);
      }
      throw error;
    }
  }

  return {
    onUpdate(update: SandUpdate): void {
      const assignedId = handOver(update);
      // The update's kind is read once the transcript has had it. The id is remembered before the line is written.
      switch (update.type) {
        case SENT_MESSAGE:
          lastSentMessageId = assignedId;
          logHostLine(`${HOST_LOG_PREFIX} send-message written id=${assignedId ?? "-"} type=${messageKind(update)}`);
          break;
        case REACTION:
          lastReactionApplied = assignedId != null;
          break;
        default:
          // Any other update only passes through.
          break;
      }
    },
    lastSentMessageId: () => lastSentMessageId,
    lastReactionApplied: () => lastReactionApplied,
  };
}
