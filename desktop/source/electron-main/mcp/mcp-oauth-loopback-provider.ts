import { DashboardService } from "../../packages/proto/generated/aiserver/v1/dashboard_connect.js";
import { createSandCursorBackendClient } from "../../shared/node/cursor-backend/cursor-inference.js";
import { createDashboardSandBackendMcpExec, type DashboardMcpExecClient } from "../../shared/node/cursor-backend/backend-mcp-exec.js";
import { createSandMcpOAuthLoopback } from "../../shared/node/mcp/mcp-oauth-loopback.js";
import { createVendorMcpBackendExec } from "../../shared/node/vendor-mcp/backend-exec.js";
import { createAccountMcpBackendExec } from "../../shared/node/account-mcp/backend-exec.js";
import { getSandRootDir } from "../../host/host-paths.js";

export interface ProductionMcpOAuthLoopback {
  registerPendingAuthFromUrl(args: { authorizationUrl: string; serverName?: string }): Promise<boolean>;
  dispose(): Promise<void> | void;
}

export interface ProductionMcpOAuthLoopbackPorts {
  readonly getAccessToken: (options?: { backendUrl?: string }) => Promise<string>;
  readonly getMachineId: () => Promise<string>;
  readonly log: (message: string) => void;
  readonly onConnectorAuth?: (event: Record<string, unknown>) => void;
  readonly onVendorCredentialChanged?: (pluginId: string) => void;
  /** After a custom server's sign-in finished here: push the account store to the box. */
  readonly onAccountStoreChanged?: () => void;
}

function createGeneratedBackendClient(ports: Pick<ProductionMcpOAuthLoopbackPorts, "getAccessToken" | "getMachineId">): DashboardMcpExecClient {
  return createSandCursorBackendClient(DashboardService, {
    getAccessToken: ports.getAccessToken,
    getMachineId: ports.getMachineId,
  }) as unknown as DashboardMcpExecClient;
}

/** Artifact anchor: electron-main/main.cjs:497538, createDesktopMcpOAuthLoopbackFactory. */
export function createProductionMcpOAuthLoopbackFactory(ports: ProductionMcpOAuthLoopbackPorts): () => Promise<ProductionMcpOAuthLoopback> {
  return async () => {
    const backendMcpExec = createDashboardSandBackendMcpExec({
      getAccessToken: ports.getAccessToken,
      getMachineId: ports.getMachineId,
      createClient: (credentials) => createGeneratedBackendClient(credentials),
    });
    // A custom URL server's sign-in is finished here on the Mac too (the code
    // becomes a bearer token in the account store, `account-mcp/backend-exec.ts`).
    const accountExec = createAccountMcpBackendExec({
      rootDir: getSandRootDir,
      fallback: backendMcpExec,
      canStartAuth: true,
      ...(ports.onAccountStoreChanged == null ? {} : { onCredentialChanged: () => ports.onAccountStoreChanged?.() }),
      log: ports.log,
    });
    // A vendor sign-in is finished here on the Mac (the code becomes a bearer
    // token in the vendor store); anything else still goes to the old backend.
    const vendorExec = createVendorMcpBackendExec({
      rootDir: getSandRootDir,
      fallback: accountExec,
      canStartAuth: true,
      ...(ports.onVendorCredentialChanged == null ? {} : { onCredentialChanged: ports.onVendorCredentialChanged }),
      log: ports.log,
    });
    return createSandMcpOAuthLoopback({
      completeOAuth: (args) => vendorExec.completeOAuth(args),
      log: ports.log,
      ...(ports.onConnectorAuth == null ? {} : { onCallback: ports.onConnectorAuth }),
    });
  };
}
