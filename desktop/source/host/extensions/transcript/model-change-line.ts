/**
 * The chat's line when an agent's model changes (10 November 2026,
 * `turn-model.ts`): "Changed from ⌘ Simeon to ✳ Claude Opus 5.5", an
 * `event` of type `model-changed` with both sides (the model's id, its name,
 * its provider for the apps' mark). Written as the Claude Code notice is
 * (`chat-line.ts`), so it wakes no one: never through `emitTimelineEvent`,
 * which runs a hidden turn for the agent to answer the event. Not in a group
 * chat, whose members each have their own.
 */
import { randomUUID } from "node:crypto";
import type { ModelChangedEvent } from "../inference/turn-model.js";
import { appendChatLine } from "./chat-line.js";
import type { TranscriptEntry } from "./transcript-hub.js";

/** Writes the line in `agentId`'s chat; nothing for a group or an agent that's gone. */
export async function appendModelChangeLine(tm: any, agentId: string, event: ModelChangedEvent): Promise<void> {
  if (tm.groupChat?.isGroupAgentId?.(agentId) === true) return;
  const entry: TranscriptEntry = {
    kind: "event",
    id: `event-model-${randomUUID()}`,
    event: { type: event.type, from: { ...event.from }, to: { ...event.to } },
    timestampMs: Date.now(),
  };
  await appendChatLine(tm, agentId, entry);
}
