import { applySimeonGateDefaults } from "../../../shared/node/experiments/simeon-gate-defaults.js";
import { defineHostExtension } from "../../../internal/host-extensions.js";
import { getSandRootDir } from "../../host-paths.js";
import { resolveMultitaskEnabled } from "../../sand-multitask.js";
import { resolveSpotlightEnabled } from "../../../shared/sand-spotlight.js";
import { SandExperimentService } from "../../../shared/node/experiments/simeon-experiments.js";
import type { DynamicConfigName, FeatureFlagName } from "../../../shared/node/experiments/experiment-config.gen.js";
import { HostExtensions } from "../extension-ids.generated.js";

/** What this extension uses of the sign-in. */
interface AuthApi {
  getAccessToken(options: { backendUrl: string }): Promise<string>;
  getMachineId(): Promise<string>;
  peekAccessToken(): string | null;
  subscribeToRenewal(listener: (event: { outcome: string; isFirstCredential: boolean }) => void): () => void;
}

/** What this extension uses of the settings. */
interface SettingsApi {
  subscribeToFeatureFlagOverrides(listener: (overrides: Record<string, boolean>) => void): () => void;
}

/**
 * Whether this is a development build: anything but the packaged app, and
 * the packaged app too when the host is asked for error detail. Only a
 * development build lets the environment and the overrides file switch
 * gates.
 */
function isDevelopmentBuild(): boolean {
  return process.env.SAND_PACKAGED !== "1" || process.env.SAND_HOST_DEV_ERROR_DETAIL === "1";
}

/**
 * Starts the experiments service for the host and hands the other
 * extensions its answers: which features are on, which models are set, and
 * the ten yes-or-no questions the host asks by name. The service is told
 * when someone signs in and when the settings' gate overrides change, and
 * is disposed of when the host stops.
 */
export const experimentsExtension = defineHostExtension({
  id: HostExtensions.Experiments,
  dependencies: [HostExtensions.Auth, HostExtensions.Settings],
  start: (context) => {
    const auth = context.deps[HostExtensions.Auth] as AuthApi;
    const settings = context.deps[HostExtensions.Settings] as SettingsApi;

    // The Mac wrapped its service in Simeon's gate defaults since 24 September;
    // the box host never did, so no default in that table reached the loop
    // (design-audit-ledger.md F-340, F-352).
    // The sign-in's two functions are handed over as they are, and the data
    // folder is asked for each time the service needs it.
    const service = applySimeonGateDefaults(new SandExperimentService({
      getAccessToken: auth.getAccessToken,
      getMachineId: auth.getMachineId,
      getCacheDir: () => getSandRootDir(),
      isDevBuild: isDevelopmentBuild(),
    }));
    service.start();
    context.onStop(() => service.dispose());

    // A renewed sign-in matters to the service when it is the first one, or
    // while it has no bootstrap fetched for a signed-in person yet.
    const stopRenewals = auth.subscribeToRenewal((event) => {
      if (event.outcome !== "renewed") return;
      if (event.isFirstCredential || !service.hasAuthenticatedStatsigBootstrap()) service.handleAuthChange();
    });
    context.onStop(stopRenewals);
    if (auth.peekAccessToken() !== null) service.handleAuthChange();

    const stopOverrides = settings.subscribeToFeatureFlagOverrides((overrides) => service.replaceFeatureFlagOverrides(overrides));
    context.onStop(stopOverrides);

    /** One gate's answer, with Simeon's defaults and any override applied. */
    const isOn = (gate: FeatureFlagName): boolean => service.checkFeatureGate(gate);

    return {
      // The service's own questions, passed on with what they were given.
      checkFeatureGate: (name: FeatureFlagName) => service.checkFeatureGate(name),
      getFeatureGateProperty: (name: FeatureFlagName) => service.getFeatureGateProperty(name),
      checkGate: (name: FeatureFlagName, options?: { timeoutMs?: number }) => service.checkGate(name, options),
      getDynamicConfig: (name: DynamicConfigName) => service.getDynamicConfig(name),
      subscribe: (listener: Parameters<SandExperimentService["subscribe"]>[0]) => service.subscribe(listener),
      pinGateOnAuthenticatedBootstrap: (name: FeatureFlagName, pin: (value: boolean) => void) => service.pinGateOnAuthenticatedBootstrap(name, pin),
      hasHydratedStatsigUserId: () => service.hasHydratedStatsigUserId(),
      waitForHydratedStatsigUserId: (timeoutMs?: number) => service.waitForHydratedStatsigUserId(timeoutMs),
      hasAuthenticatedStatsigBootstrap: () => service.hasAuthenticatedStatsigBootstrap(),
      getSandModelExperimentState: () => service.getSandModelExperimentState(),
      logSandModelExperimentExposure: () => service.logSandModelExperimentExposure(),
      getConfiguredDefaultModel: () => service.getConfiguredDefaultModel(),
      getConfiguredAutomationsModel: () => service.getConfiguredAutomationsModel(),
      getComputerUseModelOverride: () => service.getComputerUseModelOverride(),
      getBrowserUseModelOverride: () => service.getBrowserUseModelOverride(),

      // The features the host asks about by name, each behind one gate. Two
      // of them can be overruled from the environment, read at every call.
      isAgentNetworkEnabled: () => isOn("sand_agent_network"),
      isMcpMultiAccountEnabled: () => isOn("mcp_multi_account"),
      isSparsePluginClonesEnabled: () => isOn("enable_sparse_plugin_clones"),
      isMultitaskEnabled: () => resolveMultitaskEnabled(process.env.SAND_MULTITASK, () => isOn("sand_multitask")),
      isSendMessageDeliveryOwedEnabled: () => isOn("sand_send_message_delivery_owed"),
      isDynamicToolsEnabled: () => isOn("simeon_dynamic_tools"),
      isBrowserUseSubagentEnabled: () => isOn("sand_browser_use_subagent"),
      isSpotlightEnabled: () => resolveSpotlightEnabled(process.env.SAND_SPOTLIGHT, () => isOn("sand_spotlight")),
      isUnicodeTypingEnabled: () => isOn("sand_computer_use_unicode_typing"),
      isUaTokenKillSwitchEnabled: () => isOn("sand_browser_ua_token_kill_switch"),
    };
  },
});
