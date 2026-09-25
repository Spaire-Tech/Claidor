// The six account-MCP RPCs Grok Bot sent to Cursor's dashboard, answered
// from the store on this machine (24 September 2026). The answers are the
// generated proto messages themselves, so every field the manager reads
// (`account-mcp.ts`) has the type the wire had: ids, plugin ids as int64,
// the config JSON, the metadata map.

import { Struct } from "@bufbuild/protobuf";
import {
  EffectivePlugin,
  EffectivePluginInstallMode,
  GetAvailableMcpServersResponse,
  GetAvailableMcpServersResponse_McpAccountInfo,
  GetAvailableMcpServersResponse_McpServerInfo,
  GetEffectiveUserPluginsResponse,
  GetMcpConfigResponse,
  InstallUserPluginResponse,
  McpServerMetadata,
  Plugin,
  PluginStatus,
  SetMcpConfigResponse,
  UninstallUserPluginResponse,
  UpdateUserPluginInstallResponse,
  UserPluginInstall,
} from "../../../packages/proto/generated/aiserver/v1/dashboard_pb.js";
import {
  installAccountMcpPlugin,
  listAccountMcpPlugins,
  listAccountMcpServers,
  loadAccountMcpStore,
  setAccountMcpConfig,
  uninstallAccountMcpPlugin,
  updateAccountMcpPluginInstall,
  type McpConfig,
} from "./store.js";

export const DEFAULT_MCP_ACCOUNT_LABEL = "default";

export interface LocalAccountMcpClientOptions {
  readonly rootDir: () => string;
  readonly now?: () => number;
  /** Called after this side wrote the store (a server added or removed, a plugin installed or removed). */
  readonly onStoreChanged?: () => void;
}

function transportOf(config: { readonly type?: string; readonly command?: string }): string {
  if ("command" in config && typeof config.command === "string") return "stdio";
  return config.type === "sse" ? "sse" : "http";
}

export function createLocalAccountMcpClient(options: LocalAccountMcpClientOptions) {
  const now = options.now ?? (() => Date.now());
  const changed = () => options.onStoreChanged?.();
  return {
    async getAvailableMcpServers(_request: object, _options?: { timeoutMs: number }): Promise<GetAvailableMcpServersResponse> {
      const store = loadAccountMcpStore(options.rootDir());
      return new GetAvailableMcpServersResponse({
        servers: listAccountMcpServers(store).map((server) => {
          const stdio = "command" in server.config;
          // A URL server shows one account slot only once a sign-in left a
          // credential. Until then the row has no slot and its status is what
          // the backend reports when it lists tools: a public server or one
          // with its token in `headers` lists as connected, a 401 as needsAuth.
          const accounts = !stdio && server.credential != null
            ? [new GetAvailableMcpServersResponse_McpAccountInfo({ accountKey: DEFAULT_MCP_ACCOUNT_LABEL, serverIdentifier: server.name, userHasAccessToken: true })]
            : [];
          return new GetAvailableMcpServersResponse_McpServerInfo({
            id: Number(server.id),
            name: server.name,
            isTeamServer: false,
            enabled: true,
            type: transportOf(server.config),
            ...(stdio ? { command: server.config.command, args: [...(server.config.args ?? [])] } : { url: server.config.url }),
            ...(server.pluginId == null ? {} : { pluginId: BigInt(server.pluginId) }),
            serverIdentifier: server.name,
            accounts,
          });
        }),
      });
    },

    async getMcpConfig(_request: { teamScope: boolean; redactSecrets: boolean; teamId?: bigint }, _options?: { timeoutMs: number }): Promise<GetMcpConfigResponse> {
      const store = loadAccountMcpStore(options.rootDir());
      const servers = listAccountMcpServers(store);
      const config: McpConfig = { mcpServers: Object.fromEntries(servers.map((server) => [server.name, server.config])) };
      return new GetMcpConfigResponse({
        configJson: JSON.stringify(config),
        serverMetadataByName: Object.fromEntries(servers.map((server) => [
          server.name,
          new McpServerMetadata({ serverId: BigInt(server.id), ...(server.pluginId == null ? {} : { pluginId: BigInt(server.pluginId) }) }),
        ])),
      });
    },

    async getEffectiveUserPlugins(_request: { excludeConfiguredVariables: boolean }): Promise<GetEffectiveUserPluginsResponse> {
      const store = loadAccountMcpStore(options.rootDir());
      return new GetEffectiveUserPluginsResponse({
        plugins: listAccountMcpPlugins(store).map((plugin) => new EffectivePlugin({
          plugin: new Plugin({ id: BigInt(plugin.pluginId), name: plugin.pluginId, displayName: plugin.pluginId, description: "", status: PluginStatus.APPROVED }),
          isTeamRequired: false,
          isEnabled: plugin.isEnabled,
          installMode: EffectivePluginInstallMode.USER,
          hasTeamConfiguredVariables: false,
          ...(plugin.variables == null ? {} : { configuredVariables: Struct.fromJson({ ...plugin.variables }) }),
        })),
      });
    },

    async setMcpConfig(request: { teamScope: false; configJson: string; serverIdsByName: Readonly<Record<string, bigint>> }): Promise<SetMcpConfigResponse> {
      let parsed: unknown;
      try { parsed = JSON.parse(request.configJson); } catch { throw new Error("The MCP configuration is not valid JSON."); }
      if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed) || !("mcpServers" in parsed) || typeof parsed.mcpServers !== "object" || parsed.mcpServers == null || Array.isArray(parsed.mcpServers)) {
        throw new Error("The MCP configuration must be an object with `mcpServers`.");
      }
      setAccountMcpConfig(options.rootDir(), { mcpServers: parsed.mcpServers as McpConfig["mcpServers"] }, request.serverIdsByName, { now: now() });
      changed();
      return new SetMcpConfigResponse();
    },

    async installUserPlugin(request: { pluginId: bigint; variables?: Readonly<Record<string, string>> }): Promise<InstallUserPluginResponse> {
      const pluginId = request.pluginId.toString();
      const store = installAccountMcpPlugin(options.rootDir(), pluginId, request.variables, now());
      changed();
      const record = store.plugins[pluginId];
      return new InstallUserPluginResponse({
        install: new UserPluginInstall({ pluginId: request.pluginId, isEnabled: record?.isEnabled !== false, createdAt: BigInt(record?.updatedAtMs ?? now()), updatedAt: BigInt(record?.updatedAtMs ?? now()) }),
      });
    },

    async uninstallUserPlugin(request: { pluginId: bigint }): Promise<UninstallUserPluginResponse> {
      const { removed } = uninstallAccountMcpPlugin(options.rootDir(), request.pluginId.toString(), now());
      if (removed) changed();
      return new UninstallUserPluginResponse({ success: removed });
    },

    async updateUserPluginInstall(request: { pluginId: bigint; variables: Readonly<Record<string, string>> }): Promise<UpdateUserPluginInstallResponse> {
      const pluginId = request.pluginId.toString();
      const store = updateAccountMcpPluginInstall(options.rootDir(), pluginId, request.variables, now());
      changed();
      const record = store.plugins[pluginId];
      return new UpdateUserPluginInstallResponse({
        install: new UserPluginInstall({ pluginId: request.pluginId, isEnabled: record?.isEnabled !== false, updatedAt: BigInt(record?.updatedAtMs ?? now()) }),
      });
    },
  };
}

export type LocalAccountMcpClient = ReturnType<typeof createLocalAccountMcpClient>;
