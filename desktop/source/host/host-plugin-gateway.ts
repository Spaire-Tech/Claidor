import {
  CARD_SHOWN_NOTE,
  describePluginDetail,
  describePluginSummary,
  newNeedsAuthRows,
  rankPluginsLexically,
  type McpInstalledServer,
  type McpPluginDetail,
  type McpPluginSummary,
} from "./runner/tools/sand-mcp-management-tools.js";

type PluginManagement = {
  listPlugins(): Promise<readonly Record<string, unknown>[]>;
  getPlugin(pluginId: string): Promise<Record<string, unknown> | null>;
  install(args: { id: string; values?: Record<string, string> }): Promise<readonly Record<string, unknown>[]>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value != null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asSkill(value: unknown): { name: string; description: string } {
  const row = asRecord(value);
  return {
    name: typeof row?.name === "string" ? row.name : "",
    description: typeof row?.description === "string" ? row.description : "",
  };
}

function asPluginSummary(value: unknown): McpPluginSummary | null {
  const row = asRecord(value);
  if (row == null || typeof row.pluginId !== "string" || row.pluginId.length === 0) return null;
  const name = typeof row.name === "string" ? row.name : row.pluginId;
  return {
    pluginId: row.pluginId,
    name,
    displayName: typeof row.displayName === "string" && row.displayName.length > 0 ? row.displayName : name,
    description: typeof row.description === "string" ? row.description : "",
    category: typeof row.category === "string" ? row.category : "",
    isInstalled: row.isInstalled === true,
    ...(typeof row.installMode === "string" ? { installMode: row.installMode } : {}),
    connectorCount: typeof row.connectorCount === "number" ? row.connectorCount : 0,
    skills: Array.isArray(row.skills) ? row.skills.map(asSkill) : [],
    ...(row.comingSoon === true ? { comingSoon: true } : {}),
  };
}

function asInstalledServer(value: unknown): McpInstalledServer | null {
  const row = asRecord(value);
  if (row == null || typeof row.id !== "string" || typeof row.name !== "string") return null;
  return {
    id: row.id,
    name: row.name,
    serverIdentifier: typeof row.serverIdentifier === "string" ? row.serverIdentifier : row.id,
    accountKey: typeof row.accountKey === "string" ? row.accountKey : "",
    ...(typeof row.pluginId === "string" ? { pluginId: row.pluginId } : {}),
    isTeamServer: row.isTeamServer === true,
    status: typeof row.status === "string" ? row.status : "",
    ...(typeof row.statusDetail === "string" ? { statusDetail: row.statusDetail } : {}),
    transport: typeof row.transport === "string" ? row.transport : "",
    toolCount: typeof row.toolCount === "number" ? row.toolCount : 0,
    customInstructions: typeof row.customInstructions === "string" ? row.customInstructions : "",
  };
}

function asPluginDetail(value: unknown): McpPluginDetail | null {
  const summary = asPluginSummary(value);
  const row = asRecord(value);
  if (summary == null || row == null) return null;
  return {
    ...summary,
    fields: Array.isArray(row.fields)
      ? row.fields.flatMap((field) => {
        const item = asRecord(field);
        return item == null || typeof item.key !== "string" || typeof item.label !== "string"
          ? []
          : [{
            key: item.key,
            label: item.label,
            isRequired: item.isRequired === true,
            isSecret: item.isSecret === true,
          }];
      })
      : [],
    servers: Array.isArray(row.servers) ? row.servers.flatMap(server => {
      const item = asInstalledServer(server);
      return item == null ? [] : [item];
    }) : [],
  };
}

export async function searchPluginsForGateway(management: PluginManagement, query = ""): Promise<string> {
  const plugins = (await management.listPlugins()).flatMap(row => {
    const plugin = asPluginSummary(row);
    return plugin == null ? [] : [plugin];
  });
  const ranked = rankPluginsLexically(plugins, query.trim());
  if (ranked.length === 0) return query.trim().length > 0 ? `No plugins match "${query.trim()}".` : "The plugin catalog is empty or unavailable right now.";
  return [`${ranked.length} plugin(s)${query.trim().length > 0 ? ` matching "${query.trim()}" (best first)` : " available"}:`, ...ranked.map(describePluginSummary)].join("\n");
}

export async function getPluginForGateway(management: PluginManagement, pluginId: string): Promise<string> {
  const id = pluginId.trim();
  if (id.length === 0) return "GetPlugin needs plugin_id.";
  const detail = asPluginDetail(await management.getPlugin(id));
  return detail == null ? `No plugin with id "${id}".` : describePluginDetail(detail);
}

export async function installPluginForGateway(
  management: PluginManagement,
  args: { plugin_id?: unknown; values?: unknown },
  emitConnectorCard: (card: { connector: string; variant: string; agentId?: string }) => Promise<void>,
  agentId?: string,
): Promise<string> {
  const pluginId = typeof args.plugin_id === "string" ? args.plugin_id.trim() : "";
  if (pluginId.length === 0) return "InstallPlugin needs plugin_id.";
  const before = asPluginDetail(await management.getPlugin(pluginId));
  if (before == null) return `No plugin with id "${pluginId}".`;
  if (before.comingSoon === true) return `${before.displayName} is coming soon and cannot be connected yet.`;
  const values = asRecord(args.values);
  const stringValues = values == null
    ? undefined
    : Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  await management.install({ id: pluginId, ...(stringValues == null ? {} : { values: stringValues }) });
  const after = asPluginDetail(await management.getPlugin(pluginId));
  if (after == null || !after.isInstalled) {
    return `The install request for "${before.displayName}" completed, but the plugin does not read as installed yet.`;
  }
  const cards = newNeedsAuthRows(before.servers, after.servers);
  for (const row of cards) {
    await emitConnectorCard({
      connector: row.name,
      variant: "connect",
      ...(agentId == null ? {} : { agentId }),
    });
  }
  const note = cards.length === 0
    ? null
    : cards.length === 1
      ? `"${cards[0]?.name ?? "Connector"}" needs authentication. ${CARD_SHOWN_NOTE}`
      : `${cards.map(row => `"${row.name}"`).join(", ")} need authentication. ${CARD_SHOWN_NOTE}`;
  return [`Installed ${after.displayName} (plugin ${after.pluginId}).`, ...(note == null ? [] : [note]), describePluginDetail(after)].join("\n");
}
