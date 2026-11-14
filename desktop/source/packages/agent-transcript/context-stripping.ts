/**
 * Taking blocks out of a text by their tags: a tag, its closing tag and all
 * that is between them. The transcript's store and the transcript mirror
 * take the blocks of context out of what the user said before they write it.
 */

/** The tags of the blocks of context. They are taken out one after the other, in this order. */
export const CONTEXT_TAGS_TO_STRIP = [
  "user_info",
  "project_layout",
  "rules",
  "always_applied_workspace_rules",
  "agent_requestable_workspace_rules",
  "user_rules",
  "agent_skills",
  "available_skills",
  "cloud_instructions",
  "cloud_task_instructions",
  "open_and_recently_viewed_files",
  "system_reminder",
  "system-reminder",
  "mcp_instructions",
  "mcp_file_system",
  "mcp_file_system_servers",
  "git_status",
  "agent_transcripts",
  "rules_context",
  "simeon_rules_context",
  "attached_files",
  "system_notification",
  "task_notification",
  "agent_notification",
] as const;

/**
 * Every block of one tag: the opening tag, alone or followed by a blank and
 * anything up to the next ">", then the least there can be up to a closing
 * tag. Capitals and small letters count as the same. The tag's name goes
 * into the pattern as it is, so a name that holds a pattern's own signs is
 * read as a pattern.
 */
function blocksOf(tag: string): RegExp {
  return new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>`, "gi");
}

/**
 * `text` without the blocks of `tags`. A block taken out leaves its line
 * breaks behind: three or more in a row become two, and the ends of the
 * text are trimmed, also when no block was found. (`result` is named as it
 * was: handed what is no text, the runtime's error quotes it.)
 */
export function stripTags(text: string, tags: readonly string[]): string {
  let result = text;
  for (const tag of tags) result = result.replace(blocksOf(tag), "");
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

export const stripContextTags = (text: string): string => stripTags(text, CONTEXT_TAGS_TO_STRIP);
