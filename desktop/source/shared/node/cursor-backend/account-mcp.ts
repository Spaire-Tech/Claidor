// The account's MCP servers and plugins (24 September 2026). Until now the
// six calls here went to Cursor's dashboard (GetAvailableMcpServers,
// GetMcpConfig, SetMcpConfig, InstallUserPlugin, UninstallUserPlugin,
// UpdateUserPluginInstall), which Simeon Labs' server does not serve: reads
// came back `unavailable`, writes threw, and no custom server or plugin could
// be added. They now read and write the store on this machine
// (`account-mcp/store.ts`, `account-mcp-config.json` beside
// `vendor-mcp-installs.json`) through `account-mcp/local-client.ts`, whose
// answers are the generated proto messages, so everything below this line
// reads them exactly as it read the wire.

import { createLocalAccountMcpClient } from "../account-mcp/local-client.js";
import { parseAccountMcpServerConfigValue, type McpConfig, type McpRemoteConfig, type McpServerConfig } from "../account-mcp/store.js";
import { accountCacheScope } from "../cursor-token.js";

export type { McpConfig, McpRemoteConfig, McpServerConfig, McpStdioConfig } from "../account-mcp/store.js";

export const ACCOUNT_MCP_RPC_TIMEOUT_MS = 30_000;

function parseServerConfig(value: unknown): McpServerConfig | null { return parseAccountMcpServerConfigValue(value); }
export function parseAccountMcpConfigJson(json: string): McpConfig | null {
  if (json.trim().length === 0) return null;
  try {
    const value: unknown = JSON.parse(json); if (typeof value !== "object" || value == null || Array.isArray(value) || !("mcpServers" in value) || typeof value.mcpServers !== "object" || value.mcpServers == null || Array.isArray(value.mcpServers)) return null;
    const servers: Record<string, McpServerConfig> = {};
    for (const [name, config] of Object.entries(value.mcpServers)) { const parsed = parseServerConfig(config); if (parsed == null) return null; servers[name] = parsed; }
    return { mcpServers: servers };
  } catch { return null; }
}
export function normalizeMcpAccountLabel(rawLabel: string): string { return rawLabel.trim().toLowerCase(); }
export function teamServerTransport(type: string | null | undefined): "sse" | "http" { return type?.toLowerCase() === "sse" ? "sse" : "http"; }
export function serverIdsByNameFromMetadata(metadata: Readonly<Record<string, { readonly serverId?: bigint }>>): Record<string, bigint> { const result: Record<string, bigint> = {}; for (const [name, item] of Object.entries(metadata)) if (item.serverId !== undefined && item.serverId !== 0n) result[name] = item.serverId; return result; }

export interface AvailableMcpAccount { readonly accountKey: string; readonly serverIdentifier: string; readonly userHasAccessToken: boolean }
export interface AvailableMcpServer {
  readonly id: bigint | number; readonly name: string; readonly serverIdentifier?: string; readonly type: string; readonly url?: string; readonly command?: string; readonly args: readonly string[]; readonly enabled: boolean; readonly isTeamServer: boolean; readonly owningTeamId?: bigint | number; readonly disabledByTeamAdminPolicy: boolean; readonly pluginId?: bigint; readonly isRequired: boolean; readonly managedByTeamPluginPolicy: boolean; readonly accounts?: readonly AvailableMcpAccount[];
}
export interface AccountMcpServer { readonly id: string; readonly name: string; readonly serverIdentifier: string; readonly config: McpServerConfig; readonly isTeamServer: boolean; readonly disabledByTeamAdminPolicy: boolean; readonly pluginId?: string; readonly isRequired?: true; readonly managedByTeamPluginPolicy?: true; readonly accounts?: readonly { accountKey: string; serverIdentifier?: string; hasToken: boolean }[] }
export interface EffectivePluginWire { readonly plugin?: { readonly id: bigint; readonly name: string; readonly displayName: string }; readonly installMode: number; readonly isTeamRequired: boolean; readonly isEnabled: boolean; readonly hasTeamConfiguredVariables?: boolean }
export interface AccountMcpClient {
  getAvailableMcpServers(request: object, options?: { timeoutMs: number }): Promise<{ servers: readonly AvailableMcpServer[] }>;
  getMcpConfig(request: { teamScope: boolean; redactSecrets: boolean; teamId?: bigint }, options?: { timeoutMs: number }): Promise<{ configJson: string; serverMetadataByName: Readonly<Record<string, { serverId?: bigint }>> }>;
  getEffectiveUserPlugins(request: { excludeConfiguredVariables: boolean }): Promise<{ plugins: readonly EffectivePluginWire[] }>;
  setMcpConfig(request: { teamScope: false; configJson: string; serverIdsByName: Readonly<Record<string, bigint>> }): Promise<unknown>;
  installUserPlugin(request: { pluginId: bigint; variables?: Readonly<Record<string, string>> }): Promise<unknown>;
  uninstallUserPlugin(request: { pluginId: bigint }): Promise<unknown>;
  updateUserPluginInstall(request: { pluginId: bigint; variables: Readonly<Record<string, string>> }): Promise<unknown>;
}
export interface AccountMcpDependencies {
  readonly getAccessToken: (options?: { backendUrl?: string }) => Promise<string>;
  readonly getMachineId: () => Promise<string>;
  readonly getBackendUrl: () => string;
  /** Where `account-mcp-config.json` lives: the sand root on the Mac, the box's copy in the box. */
  readonly rootDir: () => string;
  /** Tests only; production reads and writes the store on this machine. */
  readonly createClient?: (credentials: { getAccessToken: (options?: { backendUrl?: string }) => Promise<string>; getMachineId: () => Promise<string> }) => AccountMcpClient;
  /** Runs before a read of the store: the Mac pulls the box's copy here, so an agent's AddMcpServer shows up in Settings and the connect card can find its row. */
  readonly syncStore?: () => Promise<void>;
  /** After this side wrote the store (a server added or removed, a plugin installed or removed). */
  readonly onStoreChanged?: () => void;
  readonly reportFailure?: (leg: string, error: unknown) => void;
}

export function accountMcpClient(deps: AccountMcpDependencies, credentials: { getAccessToken: (options?: { backendUrl?: string }) => Promise<string>; getMachineId: () => Promise<string> }): AccountMcpClient {
  if (deps.createClient != null) return deps.createClient(credentials);
  return createLocalAccountMcpClient({ rootDir: deps.rootDir, ...(deps.onStoreChanged == null ? {} : { onStoreChanged: deps.onStoreChanged }) }) as unknown as AccountMcpClient;
}

async function syncStore(deps: AccountMcpDependencies): Promise<void> {
  if (deps.syncStore == null) return;
  try { await deps.syncStore(); } catch (error) { deps.reportFailure?.("account-store-sync", error); }
}

function httpConfig(server: AvailableMcpServer): McpRemoteConfig | undefined { return server.type.toLowerCase() === "stdio" || server.url == null || server.url.length === 0 ? undefined : { url: server.url, type: teamServerTransport(server.type) }; }
function accountSlots(server: AvailableMcpServer): AccountMcpServer["accounts"] {
  const slots = (server.accounts ?? []).flatMap((account) => { const accountKey = normalizeMcpAccountLabel(account.accountKey); return accountKey.length === 0 ? [] : [{ accountKey, ...(account.serverIdentifier.length === 0 ? {} : { serverIdentifier: account.serverIdentifier }), hasToken: account.userHasAccessToken }]; });
  return slots.length === 0 ? undefined : slots;
}
function attribution(server: AvailableMcpServer) { return { ...(server.pluginId == null || server.pluginId === 0n ? {} : { pluginId: server.pluginId.toString() }), ...(server.isRequired ? { isRequired: true as const } : {}), ...(server.managedByTeamPluginPolicy ? { managedByTeamPluginPolicy: true as const } : {}) }; }

export async function fetchAccountMcpServers(deps: AccountMcpDependencies): Promise<{ servers: AccountMcpServer[]; cacheScope: string; unresolvedServerIds?: string[]; unavailable?: true } | null> {
  let cacheScope: string | undefined;
  try {
    // The store is a local file; a missing model token must not hide the
    // person's custom servers (ledger F-173). The scope then is a constant.
    let accessToken = "";
    try { accessToken = await deps.getAccessToken({ backendUrl: deps.getBackendUrl() }); } catch { accessToken = ""; }
    cacheScope = accessToken.length === 0 ? "local" : accountCacheScope(accessToken);
    await syncStore(deps);
    const client = accountMcpClient(deps, { getAccessToken: async () => accessToken, getMachineId: deps.getMachineId });
    const response = await client.getAvailableMcpServers({}, { timeoutMs: ACCOUNT_MCP_RPC_TIMEOUT_MS });
    const hasUserStdio = response.servers.some((server) => server.enabled && !server.isTeamServer && server.type.toLowerCase() === "stdio");
    const teamIds = [...new Set(response.servers.flatMap((server) => server.isTeamServer && server.enabled && server.type.toLowerCase() === "stdio" && server.owningTeamId != null ? [BigInt(server.owningTeamId)] : []))];
    const fetchConfig = (request: { teamScope: boolean; teamId?: bigint; redactSecrets: boolean }) => client.getMcpConfig(request, { timeoutMs: ACCOUNT_MCP_RPC_TIMEOUT_MS }).catch((error) => { deps.reportFailure?.("account-config-fetch", error); return null; });
    const configResponses = await Promise.all([...(hasUserStdio ? [fetchConfig({ teamScope: false, redactSecrets: false })] : []), ...teamIds.map((teamId) => fetchConfig({ teamScope: true, teamId, redactSecrets: false }))]);
    const stdioConfigById = new Map<string, McpServerConfig>();
    for (const configResponse of configResponses) { if (configResponse == null) continue; const config = parseAccountMcpConfigJson(configResponse.configJson); if (config == null) continue; const ids = serverIdsByNameFromMetadata(configResponse.serverMetadataByName); for (const [name, value] of Object.entries(config.mcpServers)) if (ids[name] != null) stdioConfigById.set(String(ids[name]), value); }
    const servers: AccountMcpServer[] = []; const unresolvedServerIds: string[] = [];
    for (const server of response.servers) {
      const id = String(server.id); const isStdio = server.type.toLowerCase() === "stdio";
      if (!server.enabled && server.disabledByTeamAdminPolicy && !server.isTeamServer) {
        const config = isStdio ? server.command != null && server.command.length > 0 ? { command: server.command, ...(server.args.length === 0 ? {} : { args: [...server.args] }) } : undefined : httpConfig(server);
        if (config != null) { const accounts = accountSlots(server); servers.push({ id, name: server.name, serverIdentifier: server.serverIdentifier ?? server.name, config, isTeamServer: false, disabledByTeamAdminPolicy: true, ...attribution(server), ...(accounts === undefined ? {} : { accounts }) }); }
        continue;
      }
      if (!server.enabled) continue;
      const config = isStdio ? stdioConfigById.get(id) : httpConfig(server);
      if (config == null || isStdio && !("command" in config) || !isStdio && !("url" in config)) { if (isStdio) unresolvedServerIds.push(id); continue; }
      const accounts = accountSlots(server); servers.push({ id, name: server.name, serverIdentifier: server.serverIdentifier ?? server.name, config, isTeamServer: server.isTeamServer, disabledByTeamAdminPolicy: server.disabledByTeamAdminPolicy, ...attribution(server), ...(accounts === undefined ? {} : { accounts }) });
    }
    return { servers, cacheScope, ...(unresolvedServerIds.length === 0 ? {} : { unresolvedServerIds }) };
  } catch { return cacheScope === undefined ? null : { servers: [], cacheScope, unavailable: true }; }
}

export type EffectivePluginInstallMode = "user" | "team-default" | "team-required" | "unknown";
export function toEffectivePluginInstallMode(mode: number): EffectivePluginInstallMode { switch (mode) { case 1: return "user"; case 2: return "team-default"; case 3: return "team-required"; default: return "unknown"; } }
export async function fetchEffectiveUserPlugins(deps: AccountMcpDependencies) {
  const client = accountMcpClient(deps, { getAccessToken: async () => await deps.getAccessToken({ backendUrl: deps.getBackendUrl() }), getMachineId: deps.getMachineId });
  const response = await client.getEffectiveUserPlugins({ excludeConfiguredVariables: true });
  return response.plugins.flatMap((effective) => { const plugin = effective.plugin; if (plugin == null || plugin.id === 0n) return []; const mode = toEffectivePluginInstallMode(effective.installMode); return [{ pluginId: plugin.id.toString(), name: plugin.name, displayName: plugin.displayName.length > 0 ? plugin.displayName : plugin.name, installMode: mode === "unknown" && effective.isTeamRequired ? "team-required" as const : mode, isEnabled: effective.isEnabled, ...(effective.hasTeamConfiguredVariables === true ? { hasTeamConfiguredVariables: true as const } : {}) }]; });
}
export async function backfillUserPluginInstalls(deps: AccountMcpDependencies): Promise<string[]> {
  const client = accountMcpClient(deps, { getAccessToken: async () => await deps.getAccessToken({ backendUrl: deps.getBackendUrl() }), getMachineId: deps.getMachineId });
  const [available, effective] = await Promise.all([client.getAvailableMcpServers({}), fetchEffectiveUserPlugins(deps)]); const known = new Set(effective.map((plugin) => plugin.pluginId)); const missing = new Set<string>();
  for (const server of available.servers) if (!server.isTeamServer && !server.managedByTeamPluginPolicy && server.pluginId != null && server.pluginId !== 0n && !known.has(server.pluginId.toString())) missing.add(server.pluginId.toString());
  const backfilled: string[] = []; for (const pluginId of missing) try { await client.installUserPlugin({ pluginId: BigInt(pluginId) }); backfilled.push(pluginId); } catch (error) { deps.reportFailure?.("account-install-backfill", error); }
  return backfilled;
}
export function createAccountMcpWriter(deps: Pick<AccountMcpDependencies, "getAccessToken" | "getMachineId" | "createClient" | "rootDir" | "syncStore" | "onStoreChanged" | "reportFailure">) {
  const full: AccountMcpDependencies = { ...deps, getBackendUrl: (deps as Partial<AccountMcpDependencies>).getBackendUrl ?? (() => "") };
  const client = () => accountMcpClient(full, { getAccessToken: deps.getAccessToken, getMachineId: deps.getMachineId });
  return {
    async getConfigForEdit() { await syncStore(full); const response = await client().getMcpConfig({ teamScope: false, redactSecrets: true }); return { config: parseAccountMcpConfigJson(response.configJson) ?? { mcpServers: {} }, serverIdsByName: serverIdsByNameFromMetadata(response.serverMetadataByName) }; },
    async setConfig(config: McpConfig, serverIdsByName: Readonly<Record<string, bigint>>) { await client().setMcpConfig({ teamScope: false, configJson: JSON.stringify(config), serverIdsByName: { ...serverIdsByName } }); },
    async installPlugin(args: { pluginId: bigint; variables?: Readonly<Record<string, string>> }) { await client().installUserPlugin({ pluginId: args.pluginId, ...(args.variables == null || Object.keys(args.variables).length === 0 ? {} : { variables: { ...args.variables } }) }); },
    async uninstallPlugin(args: { pluginId: bigint }) { await client().uninstallUserPlugin({ pluginId: args.pluginId }); },
    async updatePluginInstall(args: { pluginId: bigint; variables: Readonly<Record<string, string>> }) { await client().updateUserPluginInstall({ pluginId: args.pluginId, variables: { ...args.variables } }); },
  };
}
