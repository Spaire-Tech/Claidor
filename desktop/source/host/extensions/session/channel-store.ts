import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { createDebouncePolicy, realClock } from "../../../internal/scheduling.js";
import { isSafeFolderId } from "../../storage/folder-id.js";
import { WatchedDirectory } from "../../watched-directory.js";

export const CHANNELS_DIRNAME = "channels";
export const CHANNEL_CONFIG_FILENAME = "connection.json";
export const CHANNEL_CHANGE_DEBOUNCE_MS = 50;
const CONNECTOR_NAMES: Readonly<Record<string, string>> = { discord: "Discord", slack: "Slack" };
/** The live states the connector runtime writes (25 September 2026); "configured" is a row nothing has reported on yet. */
export type ChannelConnectionStatus = "configured" | "connecting" | "connected" | "pending" | "error";
const STATUSES: readonly ChannelConnectionStatus[] = ["configured", "connecting", "connected", "pending", "error"];
export interface ChannelConnection { platform: string; label: string; status: ChannelConnectionStatus; detail: string | null }
function clampChannelLabel(raw: string): string { return raw.replace(/\s+/g, " ").trim().slice(0, 80); }
export function getAgentChannelsDir(agentDir: string): string { return join(agentDir, CHANNELS_DIRNAME); }
export function labelFor(platform: string, raw?: string): string { const clamped = raw == null ? "" : clampChannelLabel(raw); return clamped.length > 0 ? clamped : CONNECTOR_NAMES[platform] ?? platform; }

export class FileChannelStore {
  readonly dir: WatchedDirectory;
  constructor(readonly channelsDir: string) { this.dir = new WatchedDirectory(channelsDir, createDebouncePolicy(realClock, { name: "sand-channel-store-change", delayMs: CHANNEL_CHANGE_DEBOUNCE_MS })); }
  getLocation(): string { return this.dir.getLocation(); }
  setOnChange(onChange?: (() => void) | null): void { this.dir.setOnChange(onChange); }
  configPath(platform: string): string { return join(this.channelsDir, platform, CHANNEL_CONFIG_FILENAME); }
  listPlatforms(): string[] { let entries; try { entries = readdirSync(this.channelsDir, { withFileTypes: true }); } catch { return []; } return entries.filter((entry) => entry.isDirectory() && isSafeFolderId(entry.name)).map((entry) => entry.name).filter((platform) => this.readConfig(platform) != null).sort(); }
  /** The connection file holds a label and, since the connector runtime, its last reported status; never a credential. */
  readConfig(platform: string): Record<string, unknown> | null { let raw: string; try { raw = readFileSync(this.configPath(platform), "utf8"); } catch { return null; } let parsed: unknown; try { parsed = JSON.parse(raw) as unknown; } catch { return null; } if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return null; return parsed as Record<string, unknown>; }
  readLabel(platform: string): string | null { const config = this.readConfig(platform); if (config == null) return null; const label = config.label; return labelFor(platform, typeof label === "string" ? label : undefined); }
  readConnection(platform: string): ChannelConnection | null { const config = this.readConfig(platform); if (config == null) return null; const status = typeof config.status === "string" && (STATUSES as readonly string[]).includes(config.status) ? config.status as ChannelConnectionStatus : "configured"; const detail = typeof config.detail === "string" && config.detail.length > 0 ? config.detail : null; return { platform, label: labelFor(platform, typeof config.label === "string" ? config.label : undefined), status, detail }; }
  listConnections(): ChannelConnection[] { return this.listPlatforms().map((platform) => this.readConnection(platform)).filter((connection): connection is ChannelConnection => connection != null); }
  writeMetadata(platform: string, label: string): boolean { if (!isSafeFolderId(platform)) return false; const current = this.readConfig(platform) ?? {}; this.dir.writeFileAtomic(this.configPath(platform), `${JSON.stringify({ ...current, label: labelFor(platform, label) }, null, 2)}\n`); return true; }
  /** The connector runtime's report; a no-op when the row is gone or unchanged, so a reconnect loop does not churn the file. */
  writeStatus(platform: string, status: ChannelConnectionStatus, detail: string | null = null): boolean { if (!isSafeFolderId(platform)) return false; const current = this.readConfig(platform); if (current == null) return false; const clipped = detail == null ? null : detail.replace(/\s+/g, " ").trim().slice(0, 200) || null; if (current.status === status && (current.detail ?? null) === clipped) return true; const next: Record<string, unknown> = { ...current, status }; if (clipped == null) delete next.detail; else next.detail = clipped; this.dir.writeFileAtomic(this.configPath(platform), `${JSON.stringify(next, null, 2)}\n`); return true; }
  remove(platform: string): boolean { if (!isSafeFolderId(platform)) return false; const platformDir = join(this.channelsDir, platform); try { if (!statSync(platformDir).isDirectory()) return false; } catch { return false; } rmSync(platformDir, { recursive: true, force: true }); this.dir.scheduleNotify(); return true; }
}
