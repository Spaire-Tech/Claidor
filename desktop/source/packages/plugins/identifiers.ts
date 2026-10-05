export type PluginIdentifier =
  | { source: "simeon-first-party" | "simeon-third-party"; sourceInfo: { pluginDbId: string } }
  | { source: "claude-plugin" | "user-local" | "extension"; sourceInfo?: unknown };
export function getPluginDbId(identifier: PluginIdentifier): string | undefined {
  switch (identifier.source) { case "simeon-first-party": case "simeon-third-party": return identifier.sourceInfo.pluginDbId; default: return undefined; }
}
