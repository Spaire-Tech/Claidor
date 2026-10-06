import { fetchSandAccess } from "../account/access.js";
import { createAccountEdgePort, createTranscriptionManagerEnsure, type AccountRuntime } from "../account/account-auth-wiring.js";
import { resolveAccountAvatarDataUrl } from "../account/account-avatar.js";
import {
  cancelSandTrial,
  fetchSandUsageSummary,
  fetchSandWeeklyUsage,
  fetchUserPrivacyModeEnabled,
  invokeSandDashboardAction, openSimeonBillingPortal } from "../account/account-profile.js";
import { fetchSandPrReviewPreferences } from "../account/pr-review.js";
import type { ProductionServiceContext } from "../main-production-services.js";
import type { ElectronProductionAdapterBindings } from "../production-adapters.js";
import { DashboardService } from "../../packages/proto/simeon/v1/services.js";
import { createSimeonBackendClient } from "../../shared/node/simeon-backend/simeon-inference.js";
import { SAND_PRODUCT_DISPLAY_NAME } from "../../shared/product-name.js";
import { simeonGateDefault } from "../../shared/node/experiments/simeon-gate-defaults.js";
import type { SandAccessBackend } from "../account/access.js";

function accountRuntimeOf(context: Pick<ProductionServiceContext, "requireCoordinator">): AccountRuntime | null | undefined {
  try {
    const runtime = context.requireCoordinator().getAccountRuntime?.();
    if (runtime != null && typeof (runtime as { observe?: unknown }).observe === "function" && typeof (runtime as { whenIdle?: unknown }).whenIdle === "function") {
      return runtime as AccountRuntime;
    }
  } catch {
    // The immutable root constructs the edge before the coordinator. Runtime
    // lookup remains lazy until an account operation actually settles.
  }
  return null;
}

function machineId(context: Pick<ProductionServiceContext, "machineId">): () => Promise<string> {
  return async () => context.machineId;
}

/** Artifact anchor: main.cjs:506294, `accountService: createAccountEdgePort({`. */
export function createElectronProductionAccountBinding(): ElectronProductionAdapterBindings["accountService"] {
  return {
    create(context) {
      const getMachineId = machineId(context);
      return createAccountEdgePort({
        ensureAccountAuthService: () => context.requireAccount().getAuthService(),
        currentAuthStatusFreshness: () => context.requireAccount().currentAuthStatusFreshness(),
        getAccountRuntime: () => accountRuntimeOf(context),
        readSandAccess: (getAccessToken) => fetchSandAccess(getAccessToken, {
          createClient: (credentials) => createSimeonBackendClient(DashboardService, credentials) as unknown as SandAccessBackend,
          getMachineId,
        }),
        resetMcpManager: () => context.requireMcp().resetMcpManager(),
        refreshHostMcp: () => context.requireMcp().refreshHostMcp(),
        resolveAvatar: (authId, preferredUrl) => resolveAccountAvatarDataUrl(authId, { ...(preferredUrl == null ? {} : { preferredUrl }) }),
        // Usage from Simeon Labs' server's quota (`cursor-profile.ts`). Until
        // 24 September 2026 the gate below read the bundled default, false,
        // so `getUsageSummary` answered null before touching anything, and
        // `getWeeklyUsage` called two Dashboard RPCs the server does not
        // serve. The gate is now Simeon's default (on) unless the
        // environment or a local override says otherwise.
        fetchWeeklyUsage: (getAccessToken) => fetchSandWeeklyUsage(getAccessToken, { getMachineId }),
        isUsagePageEnabled: () => {
          const local = context.requireExperiments().getFeatureFlagOverridesRecord()["sand_usage_page"];
          if (typeof local === "boolean") return local;
          return simeonGateDefault("sand_usage_page", context.env) ?? context.requireExperiments().checkFeatureGate("sand_usage_page");
        },
        fetchUsageSummary: (getAccessToken) => fetchSandUsageSummary(getAccessToken, { getMachineId }),
        fetchPrReviewPreferences: (getAccessToken) => fetchSandPrReviewPreferences(getAccessToken),
        fetchPrivacyModeEnabled: (getAccessToken) => fetchUserPrivacyModeEnabled(getAccessToken, { getMachineId }),
        cancelTrial: (getAccessToken) => cancelSandTrial(getAccessToken, { getMachineId }),
        openBillingPortal: (getAccessToken, request) => openSimeonBillingPortal(getAccessToken, request, { getMachineId }),
        invokeDashboardAction: (getAccessToken, request) => invokeSandDashboardAction(getAccessToken, request, { getMachineId }),
        productDisplayName: SAND_PRODUCT_DISPLAY_NAME,
      });
    },
    createTranscriptionManager(context) {
      return createTranscriptionManagerEnsure({
        ensureAccountAuthService: () => context.requireAccount().getAuthService(),
        getMachineId: machineId(context),
      });
    },
  };
}
