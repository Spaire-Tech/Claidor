import { clipForHostLog, HOST_LOG_PREFIX, logHostLine } from "../../../shared/host-log.js";

/**
 * One `[claidor] channel=<platform> agent=<id> event=<what> …` line per
 * connect, ready, disconnect, inbound, delivery and error, on the stdout
 * channel that reaches the box's `/tmp/sand-host.log` (the loop's own logger
 * is silenced there; CLAUDE.md, 23 September 2026). Credentials never
 * appear: a token is logged as its prefix and length.
 */
export type ChannelLogSink = (line: string) => void;

export function formatChannelLogLine(platform: string, agentId: string, event: string, fields: Record<string, string | number | boolean | null | undefined> = {}): string {
  const parts = [`${HOST_LOG_PREFIX} channel=${platform}`, `agent=${agentId}`, `event=${event}`];
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;
    const text = typeof value === "string" ? clipForHostLog(value, 200) : String(value);
    parts.push(/[\s="]/.test(text) ? `${key}=${JSON.stringify(text)}` : `${key}=${text}`);
  }
  return parts.join(" ");
}

export function createChannelLogger(platform: string, agentId: string, sink: ChannelLogSink = logHostLine): (event: string, fields?: Record<string, string | number | boolean | null | undefined>) => void {
  return (event, fields) => sink(formatChannelLogLine(platform, agentId, event, fields));
}

export function describeToken(token: string): string {
  const prefix = token.match(/^[A-Za-z]+-/)?.[0] ?? "";
  return `${prefix}…(${token.length})`;
}

export function errorSentence(error: unknown): string {
  if (error instanceof Error) return error.message.length > 0 ? error.message : error.name;
  return typeof error === "string" ? error : String(error);
}
