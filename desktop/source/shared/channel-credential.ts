import { SLACK_PLATFORM } from "./channels.js";

/** The secret-store field names the connector runtime reads (`host/extensions/channels/`). */
export const CHANNEL_TOKEN_FIELD = "token";
export const SLACK_BOT_TOKEN_FIELD = "botToken";
export const SLACK_APP_TOKEN_PREFIX = "xapp-";
export const SLACK_BOT_TOKEN_PREFIX = "xoxb-";
/**
 * The mark an agent's Slack through Simeon's own Slack app leaves in the
 * secret store (12 November 2026): not a credential (the workspace's token
 * stays on Simeon Labs' server), only what lists the connection like any
 * other and tells the connector runtime it has no token to open.
 */
export const CHANNEL_APP_FIELD = "app";
export const CHANNEL_APP_VALUE = "simeon";

/** Whether a stored connection is one through Simeon's own app. */
export function isAppConnection(secrets: Readonly<Record<string, string>> | undefined): boolean {
  return secrets?.[CHANNEL_APP_FIELD] === CHANNEL_APP_VALUE;
}

/**
 * What the Channels tab's one credential field holds, as [field, value]
 * pairs for the secret store. Slack takes its app token (xapp-…) and bot
 * token (xoxb-…) together in that field, in either order, split on
 * whitespace or commas; a value with neither prefix is taken as the app
 * token so a person who pastes an unfamiliar token is not refused. Every
 * other platform stores the whole trimmed value as `token`.
 */
export function splitChannelCredential(platform: string, raw: string): Array<[string, string]> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];
  if (platform !== SLACK_PLATFORM) return [[CHANNEL_TOKEN_FIELD, trimmed]];
  const parts = trimmed.split(/[\s,]+/).filter((part) => part.length > 0);
  const fields = new Map<string, string>();
  for (const part of parts) {
    if (part.startsWith(SLACK_BOT_TOKEN_PREFIX)) fields.set(SLACK_BOT_TOKEN_FIELD, part);
    else if (part.startsWith(SLACK_APP_TOKEN_PREFIX) || !fields.has(CHANNEL_TOKEN_FIELD)) fields.set(CHANNEL_TOKEN_FIELD, part);
  }
  return [...fields.entries()];
}
