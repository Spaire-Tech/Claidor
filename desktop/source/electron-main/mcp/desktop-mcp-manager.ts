import { DashboardService } from "../../packages/proto/generated/aiserver/v1/dashboard_connect.js";
import { McpError, McpResult } from "../../packages/proto/generated/agent/v1/mcp_exec_pb.js";
import { reportDesktopEdgeFailure } from "../desktop-edge-failures.js";
import { createSandCursorBackendClient, getSandInferenceBackendUrl } from "../../shared/node/cursor-backend/cursor-inference.js";
import {
  createAccountMcpWriter,
  backfillUserPluginInstalls,
  fetchAccountMcpServers,
  type AccountMcpClient,
  type AccountMcpDependencies,
} from "../../shared/node/cursor-backend/account-mcp.js";
import {
  createDashboardSandBackendMcpExec,
  type DashboardMcpExecClient,
} from "../../shared/node/cursor-backend/backend-mcp-exec.js";
import { pinMcpDiagnosticsReporter } from "../../shared/node/mcp/mcp-diagnostics.js";
import { SandMcpManager } from "../../shared/node/mcp/mcp-manager.js";
import { createMcpToolsDiscovery } from "../../shared/node/mcp/tools-discovery.js";
import { getSandRootDir } from "../../host/host-paths.js";
import { isVendorMcpPluginId } from "../../shared/node/vendor-mcp/catalog.js";
import { loadVendorMcpInstalls, removeVendorMcpInstall, upsertVendorMcpInstall } from "../../shared/node/vendor-mcp/installs.js";
import { fetchVendorEffectivePlugins, fetchVendorMarketplacePlugins } from "../../shared/node/vendor-mcp/marketplace.js";
import { createVendorMcpBackendExec } from "../../shared/node/vendor-mcp/backend-exec.js";
import { withVendorAccountServers } from "../../shared/node/vendor-mcp/display.js";
import { vendorMcpServerId } from "../../shared/node/vendor-mcp/catalog.js";

export interface DesktopMcpManagerFacade {
  listServers(): Promise<unknown>;
  listEffectivePlugins(): Promise<unknown>;
  getCatalog(getAccessToken: unknown): Promise<unknown>;
  resolvePluginLogo(url: string): Promise<unknown>;
  installEntry(request: unknown, getAccessToken: unknown): Promise<unknown>;
  updatePluginInstall(request: unknown, getAccessToken: unknown): Promise<unknown>;
  removeServer(serverId: string): Promise<unknown>;
  uninstallPlugin(pluginId: string): Promise<unknown>;
  authenticateServer(serverId: string, accountKey: string, trigger?: string): Promise<unknown>;
  renameAccount(args: { serverId: string; accountKey: string; newAccountKey: string }): Promise<unknown>;
  removeAccount(args: { serverId: string; accountKey: string }): Promise<unknown>;
  setServerCustomInstructions(request: unknown): Promise<unknown>;
  listServerTools(serverId: string): Promise<unknown>;
  listRoutedTools(): Promise<unknown>;
  executeRoutedTool(request: {
    readonly providerIdentifier: string;
    readonly name: string;
    readonly toolName: string;
    readonly args: unknown;
    readonly toolCallId: string;
    readonly agentId?: string;
  }): Promise<unknown>;
  toggleMcpToolDisabled(request: unknown): Promise<unknown>;
  setAuthCompletionObserver(observer: (completion: unknown) => void): void;
  /** The numeric server id of a vendor connector, or undefined for anything else. */
  vendorServerIdForPlugin?(pluginId: string): string | undefined;
  dispose(): Promise<void> | void;
}

export interface DesktopMcpManagerOptions {
  readonly settingsStore: unknown;
  readonly onAccountScopeApplied: () => void;
  readonly getAccessToken: (args: { backendUrl: string }) => Promise<string>;
  readonly getMachineId: () => string | Promise<string>;
  readonly listBoxMcpServers: (serverIdentifiers: unknown) => Promise<readonly Record<string, unknown>[]>;
  readonly onConnectorAuth: (report: unknown) => void;
  readonly onMcpDiagnostic?: (failure: { readonly leg: string; readonly errorClass: string }) => void;
  readonly openExternal?: (url: string) => Promise<unknown>;
  /** After this Mac wrote a vendor credential (sign-in finished, token refreshed, account removed). */
  readonly onVendorCredentialChanged?: (pluginId: string) => void;
}

function generatedAccountClient(credentials: Pick<AccountMcpDependencies, "getAccessToken" | "getMachineId">): AccountMcpClient {
  return createSandCursorBackendClient(DashboardService, {
    getAccessToken: async (options) => await credentials.getAccessToken({ backendUrl: options?.backendUrl }),
    getMachineId: credentials.getMachineId,
  }) as unknown as AccountMcpClient;
}

function generatedBackendClient(credentials: Pick<AccountMcpDependencies, "getAccessToken" | "getMachineId">): DashboardMcpExecClient {
  return createSandCursorBackendClient(DashboardService, {
    getAccessToken: async (options) => await credentials.getAccessToken({ backendUrl: options?.backendUrl }),
    getMachineId: credentials.getMachineId,
  }) as unknown as DashboardMcpExecClient;
}

/** Artifact anchor: electron-main/main.cjs:497780, `async function createSandDesktopMcpManager(options)`. */
export async function createSandDesktopMcpManager(options: DesktopMcpManagerOptions): Promise<DesktopMcpManagerFacade> {
  pinMcpDiagnosticsReporter(options.onMcpDiagnostic ?? null);
  const accountMcpDeps: AccountMcpDependencies = {
    getAccessToken: async (request) => await options.getAccessToken({ backendUrl: request?.backendUrl ?? getSandInferenceBackendUrl() }),
    getMachineId: async () => await options.getMachineId(),
    getBackendUrl: getSandInferenceBackendUrl,
    createClient: generatedAccountClient,
  };
  const cursorBackendMcpExec = createDashboardSandBackendMcpExec({
    getAccessToken: accountMcpDeps.getAccessToken,
    getMachineId: accountMcpDeps.getMachineId,
    createClient: generatedBackendClient,
  });
  const vendorRoot = () => getSandRootDir();
  // The Mac is where a vendor sign-in starts (browser, loopback) and where
  // the credential lives; `vendor-mcp/backend-exec.ts` is the record.
  const backendMcpExec = createVendorMcpBackendExec({
    rootDir: vendorRoot,
    fallback: cursorBackendMcpExec,
    canStartAuth: true,
    ...(options.onVendorCredentialChanged == null ? {} : { onCredentialChanged: options.onVendorCredentialChanged }),
    log: (message) => console.info(`[sand:mcp] ${message}`),
  });
  const manager = new SandMcpManager({
    settingsStore: options.settingsStore,
    onAccountScopeApplied: options.onAccountScopeApplied,
    accountServersProvider: () => withVendorAccountServers(fetchAccountMcpServers(accountMcpDeps), vendorRoot),
    accountMcpWriter: createAccountMcpWriter(accountMcpDeps),
    effectivePluginsProvider: () => fetchVendorEffectivePlugins(new Set(loadVendorMcpInstalls(vendorRoot()).map((item) => item.id))),
    getMachineId: accountMcpDeps.getMachineId,
    backendMcpExec,
    onConnectorAuth: options.onConnectorAuth,
    fetchMarketplace: fetchVendorMarketplacePlugins,
    // Install records the connector; the row then reads needsAuth and the
    // sign-in goes through authenticateServer like any other connector
    // (the Plugins overlay starts it right away, `mcp-desktop.ts`; the agent's
    // InstallPlugin draws the connect card). Until 24 September this opened
    // the browser here and nothing ever finished the sign-in.
    connectVendorMcp: async (plugin: { pluginId: string; displayName: string; vendorMcpUrl: string }) => {
      upsertVendorMcpInstall(vendorRoot(), { id: plugin.pluginId, url: plugin.vendorMcpUrl, connected: false });
      options.onConnectorAuth({ pluginId: plugin.pluginId, status: "installed" });
    },
    uninstallComposioPlugin: async (pluginId: string) => {
      if (!isVendorMcpPluginId(pluginId)) return false;
      return removeVendorMcpInstall(vendorRoot(), pluginId);
    },
  });
  const discovery = createMcpToolsDiscovery({
    definitionSource: manager.definitionSourceView(),
    lastAccountDisplayConfig: () => manager.lastAccountDisplayConfigView(),
    settingsStore: () => manager.settingsStoreView(),
    backendMcpExec,
  }, {
    boxMcpExec: {
      loadServers: async () => {},
      listTools: async (serverIdentifiers: unknown) => (await options.listBoxMcpServers(serverIdentifiers)).map((server) => ({ ...server, tools: [] })),
      executeTool: async (args: { readonly name: string }) => new McpResult({
        result: {
          case: "error",
          value: new McpError({ error: `MCP tools run on Simeon's computer, not the desktop app (tool "${args.name}").` }),
        },
      }),
    },
  });
  manager.setBoxRuntime(discovery);
  let routedToolsSnapshot: unknown[] = [];
  let routedToolsWarm: Promise<unknown[]> | null = null;
  const warmRoutedTools = (): Promise<unknown[]> => routedToolsWarm ??= discovery.getTools().then((tools: unknown[]) => (routedToolsSnapshot = tools), (error: unknown) => {
    routedToolsWarm = null;
    throw error;
  });
  void warmRoutedTools().catch((error: unknown) => reportDesktopEdgeFailure("mcp-manager", "routed-tools-warm", error));
  let hasKickedInstallBackfill = false;
  const kickInstallBackfillOnce = (): void => {
    if (hasKickedInstallBackfill) return;
    hasKickedInstallBackfill = true;
    void backfillUserPluginInstalls(accountMcpDeps).catch((error: unknown) => reportDesktopEdgeFailure("mcp-manager", "install-backfill", error));
  };
  return {
    listServers: () => {
      kickInstallBackfillOnce();
      return manager.listServers();
    },
    listEffectivePlugins: () => manager.listEffectivePlugins(),
    getCatalog: (getAccessToken) => manager.getCatalog(getAccessToken),
    resolvePluginLogo: (url) => manager.resolvePluginLogo(url),
    installEntry: (request, getAccessToken) => manager.installEntry(request, getAccessToken),
    updatePluginInstall: (request, getAccessToken) => manager.updatePluginInstall(request, getAccessToken),
    removeServer: (serverId) => manager.removeServer(serverId),
    uninstallPlugin: (pluginId) => manager.uninstallPlugin(pluginId),
    authenticateServer: (serverId, accountKey, trigger) => manager.authenticateServer(serverId, accountKey, null, false, trigger ?? null),
    renameAccount: (args) => manager.renameAccount(args.serverId, args.accountKey, args.newAccountKey),
    removeAccount: (args) => manager.removeAccount(args.serverId, args.accountKey),
    setServerCustomInstructions: (request) => manager.setServerCustomInstructions(request),
    listServerTools: (serverId) => manager.listServerTools(serverId),
    listRoutedTools: async () => routedToolsSnapshot.length > 0 ? routedToolsSnapshot : await warmRoutedTools(),
    executeRoutedTool: (request) => discovery.executeTool(
      undefined,
      {
        providerIdentifier: request.providerIdentifier,
        name: request.name,
        toolName: request.toolName,
        args: request.args,
        toolCallId: request.toolCallId,
      },
      request.agentId == null ? undefined : { agentId: request.agentId },
    ),
    toggleMcpToolDisabled: (request) => manager.toggleMcpToolDisabled(request),
    setAuthCompletionObserver: (observer) => manager.setAuthCompletionObserver(observer),
    vendorServerIdForPlugin: (pluginId) => vendorMcpServerId(pluginId),
    dispose: () => manager.dispose(),
  };
}
