/**
 * Where a conversation's transcript is kept, from the project's folder down.
 * Each conversation has a folder named after it, and its files in there are
 * named after it too. A subagent's files go in its parent's folder instead,
 * under "subagents".
 */
import { getSafeConversationId, TRANSCRIPTS_SUBDIR } from "../utils/workspace-paths.js";

export function getTranscriptRelativePath(args: { conversationId: string; kind: string; parentConversationId?: string; ext: string }): string {
  const name = getSafeConversationId(args.conversationId);
  // A subagent with no parent named is kept like any other conversation.
  const underParent = args.kind === "subagent" && args.parentConversationId;
  const folder = underParent ? `${getSafeConversationId(underParent)}/subagents` : name;
  return `${TRANSCRIPTS_SUBDIR}/${folder}/${name}.${args.ext}`;
}
