export const DISCORD_PLATFORM = "discord";
export const SLACK_PLATFORM = "slack";

export interface ConnectorManifest {
  readonly platform: string;
  readonly displayName: string;
  readonly blurb: string;
  readonly credentialLabel: string;
  readonly availability: "available" | "coming-soon";
  readonly connectGuide: string;
}

// Discord and Slack are served since 25 September 2026: the connector
// runtime in the box (`host/extensions/channels/`) opens Discord's Gateway
// and Slack's Socket Mode with the token the person gives the Channels tab
// (or a secret-request card), delivers through their REST APIs and wakes
// the agent for every inbound message (docs/product/channels-served.md).
// No server of ours is in the path: it is bring-your-own bot token, the way
// Grok Bot's channel design was written. `SAND_CHANNELS_SERVED=0` restores
// the coming-soon paths. Teams, WhatsApp, Telegram, Signal and iMessage are
// not in this list at all: each is its own client library (iMessage a
// Mac-side bridge) and none exists in the tree.
export const CHANNELS_SERVED_ENV = "SAND_CHANNELS_SERVED";
export function isChannelsServed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[CHANNELS_SERVED_ENV]?.trim() === "0" ? false : true;
}

export const CONNECTOR_MANIFESTS: readonly ConnectorManifest[] = [
  {
    platform: DISCORD_PLATFORM,
    displayName: "Discord",
    blurb: "Message in Discord servers and DMs through a bot the user owns.",
    credentialLabel: "bot token",
    availability: "available",
    connectGuide: [
      "The user creates an application at discord.com/developers, adds a Bot, turns on the Message Content Intent under Privileged Gateway Intents, and invites the bot to their server with the bot scope and the Send Messages and Read Message History permissions.",
      "Ask for the bot token with a secret-request (connector \"discord\", field \"token\"); the connection opens within a few seconds of it being stored. A DM to the bot or a message in a channel it can read wakes you; the address is discord:<channel id>.",
    ].join("\n"),
  },
  {
    platform: SLACK_PLATFORM,
    displayName: "Slack",
    blurb: "Message in Slack channels and DMs through a Socket Mode app the user owns.",
    credentialLabel: "app token and bot token",
    availability: "available",
    connectGuide: [
      "The user creates an app at api.slack.com/apps, enables Socket Mode (which issues an app-level token, xapp-…, with connections:write), subscribes the bot to the message.channels, message.groups, message.im and reaction_added events, gives it the chat:write, channels:history, groups:history, im:history, users:read and files:write scopes, and installs it to the workspace (which issues the bot token, xoxb-…).",
      "Two tokens are needed: ask for the app token with a secret-request (connector \"slack\", field \"token\") and the bot token with a second one (connector \"slack\", field \"botToken\"). The connection opens once both are stored. A DM to the app or a message in a channel it is a member of wakes you; the address is slack:<channel id>.",
    ].join("\n"),
  },
];

/** The manifests as a person or the agent should see them: coming soon when the served switch is off. */
export function connectorManifests(env: NodeJS.ProcessEnv = process.env): readonly ConnectorManifest[] {
  if (isChannelsServed(env)) return CONNECTOR_MANIFESTS;
  return CONNECTOR_MANIFESTS.map((manifest) => ({ ...manifest, availability: "coming-soon" as const, blurb: `${manifest.blurb.replace(/\.$/, "")} (coming soon).` }));
}

export interface ChannelAddress {
  readonly platform: string;
  readonly chat: string;
}

export function findConnectorManifest(
  platform: string,
  env: NodeJS.ProcessEnv = process.env,
): ConnectorManifest | undefined {
  return connectorManifests(env).find((manifest) => manifest.platform === platform);
}

export function hasChannelsToShow(
  manifests: readonly ConnectorManifest[],
  connections: readonly unknown[],
): boolean {
  const hasConnectable = manifests.some(
    (manifest) => manifest.availability === "available",
  );
  return hasConnectable || connections.length > 0;
}

export function formatChannelAddress(address: ChannelAddress): string {
  return `${address.platform}:${address.chat}`;
}

export function parseChannelAddress(raw: string): ChannelAddress | null {
  const trimmed = raw.trim();
  const separator = trimmed.indexOf(":");
  if (separator <= 0) return null;
  const platform = trimmed.slice(0, separator).trim();
  const chat = trimmed.slice(separator + 1).trim();
  if (platform.length === 0 || chat.length === 0) return null;
  return { platform, chat };
}
