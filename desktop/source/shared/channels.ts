import { say, type WordKey } from "./say.js";

export const DISCORD_PLATFORM = "discord";
export const SLACK_PLATFORM = "slack";

export interface ConnectorManifest {
  readonly platform: string;
  readonly displayName: string;
  readonly blurb: string;
  readonly credentialLabel: string;
  readonly availability: "available" | "coming-soon";
  readonly connectGuide: string;
  /**
   * How the Channels tab connects it: `token`, a field for the bot's token;
   * `app`, Connect opens Slack's own sign-in for Simeon's Slack app and no
   * token is asked for (12 November 2026, `simeon/desktop/slack_app.py`).
   */
  readonly connect: "token" | "app";
}

// Discord and Slack are served since 25 September 2026 (Slack through
// Simeon's own Slack app and Discord hidden since 12 November 2026): the connector
// runtime in the box (`host/extensions/channels/`) opens Discord's Gateway
// and Slack's Socket Mode with the token the person gives the Channels tab
// (or a secret-request card), delivers through their REST APIs and wakes
// the agent for every inbound message (docs/services-agents.md).
// No server of ours is in the path: it is bring-your-own bot token, the way
// The upstream app's channel design was written. `SAND_CHANNELS_SERVED=0` restores
// the coming-soon paths. Teams, WhatsApp, Telegram, Signal and iMessage are
// not in this list at all: each is its own client library (iMessage a
// Mac-side bridge) and none exists in the tree.
export const CHANNELS_SERVED_ENV = "SAND_CHANNELS_SERVED";
export function isChannelsServed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[CHANNELS_SERVED_ENV]?.trim() === "0" ? false : true;
}

/**
 * Discord is hidden until Simeon has a Discord app of its own, connected
 * the way Slack now is (the founder, 12 November 2026: "hide discord until
 * we do that"): neither the Channels tab nor the agent sees it, and a bot
 * token stored earlier is not connected. `SAND_DISCORD_SERVED=1` shows it
 * again, as it was.
 */
export const DISCORD_SERVED_ENV = "SAND_DISCORD_SERVED";
export function isDiscordServed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[DISCORD_SERVED_ENV]?.trim() === "1";
}

export const CONNECTOR_MANIFESTS: readonly ConnectorManifest[] = [
  {
    platform: DISCORD_PLATFORM,
    displayName: "Discord",
    blurb: "Message in Discord servers and DMs through a bot the user owns.",
    credentialLabel: "bot token",
    availability: "available",
    connect: "token",
    connectGuide: [
      "The user creates an application at discord.com/developers, adds a Bot, turns on the Message Content Intent under Privileged Gateway Intents, and invites the bot to their server with the bot scope and the Send Messages and Read Message History permissions.",
      "Ask for the bot token with a secret-request (connector \"discord\", field \"token\"); the connection opens within a few seconds of it being stored. A DM to the bot or a message in a channel it can read wakes you; the address is discord:<channel id>.",
    ].join("\n"),
  },
  {
    platform: SLACK_PLATFORM,
    displayName: "Slack",
    blurb: "Message in Slack channels and DMs through Simeon's Slack app.",
    credentialLabel: "",
    availability: "available",
    connect: "app",
    connectGuide: [
      "The user connects Slack from your profile in the Simeon app: the + beside Slack, under Notifications, opens Slack's own sign-in for Simeon's Slack app, where they pick the workspace and allow it. There is no token: never ask for one, and never send a secret-request for Slack. To suggest it, tell them to open your profile and press + beside Slack.",
      "Once connected, a direct message to the Simeon app in Slack, or a mention of it in a channel it was invited to (/invite @Simeon), wakes you; the address is slack:<channel id>. Your answer appears under your own name, in the thread of the message that asked in a channel. Several of the user's agents can share the workspace: a message that starts with an agent's name goes to that agent, and a conversation stays with the agent who answered it.",
    ].join("\n"),
  },
];

/** The manifests as a person or the agent should see them: coming soon when the served switch is off. */
export function connectorManifests(env: NodeJS.ProcessEnv = process.env): readonly ConnectorManifest[] {
  const shown = CONNECTOR_MANIFESTS.filter((manifest) => manifest.platform !== DISCORD_PLATFORM || isDiscordServed(env));
  if (isChannelsServed(env)) return shown;
  return shown.map((manifest) => ({ ...manifest, availability: "coming-soon" as const, blurb: `${manifest.blurb.replace(/\.$/, "")} (coming soon).` }));
}

/** Each platform's words for the apps' Channels tab (`say`); the agent reads the English manifests. */
const MANIFEST_WORDS: Readonly<Record<string, { readonly blurb: WordKey; readonly credentialLabel: WordKey }>> = {
  [DISCORD_PLATFORM]: { blurb: "channel.discordBlurb", credentialLabel: "channel.discordCredential" },
  [SLACK_PLATFORM]: { blurb: "channel.slackBlurb", credentialLabel: "channel.slackCredential" },
};

/** The manifests for the apps, in the person's language (20 October 2026). */
export function connectorManifestsForPerson(language: string | null | undefined, env: NodeJS.ProcessEnv = process.env): readonly ConnectorManifest[] {
  return connectorManifests(env).map((manifest) => {
    const words = MANIFEST_WORDS[manifest.platform];
    if (words == null) return manifest;
    const blurb = say(language, words.blurb);
    return {
      ...manifest,
      blurb: manifest.availability === "coming-soon" ? say(language, "channel.comingSoon", { blurb: blurb.replace(/\.$/, "") }) : blurb,
      // Connected through Simeon's own app, it asks for no token.
      credentialLabel: manifest.connect === "app" ? "" : say(language, words.credentialLabel),
    };
  });
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
