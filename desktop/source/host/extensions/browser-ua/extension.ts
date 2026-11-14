import { defineHostExtension } from "../../../internal/host-extensions.js";
import { HostExtensions } from "../extension-ids.generated.js";
import { createUaOwnerStampWriter } from "./ua-owner-stamp-service.js";
import { createUaTokenKillSwitchReconciler } from "./ua-token-kill-switch-service.js";

/** What this extension uses of the sign-in. */
interface AuthApi {
  peekAccessToken(): string | null;
  subscribeToRenewal(listener: (event: { outcome: string }) => void): () => void;
}

/** What this extension uses of the experiments. */
interface ExperimentsApi {
  isUaTokenKillSwitchEnabled(): boolean;
  subscribe(listener: () => void): () => void;
}

/**
 * Keeps two small files on the cloud computer up to date for its browser:
 * the stamp of whoever is signed in, written at the start and after every
 * renewed sign-in, and the marker that follows the token's kill switch,
 * set at the start and whenever the experiments change. Neither is waited
 * for; what goes wrong on the disk is told to the host's log. It hands the
 * other extensions nothing.
 */
export const browserUaExtension = defineHostExtension<{}, { log(message: string): void }>({
  id: HostExtensions.BrowserUa,
  dependencies: [HostExtensions.Auth, HostExtensions.Experiments],
  start: (context) => {
    const auth = context.deps[HostExtensions.Auth] as AuthApi;
    const experiments = context.deps[HostExtensions.Experiments] as ExperimentsApi;
    // The host's log is looked up each time something is told, so a log put in place later is the one used.
    const log = (message: string) => context.host.log(message);

    const stampOwner = createUaOwnerStampWriter({ log });
    const stopRenewals = auth.subscribeToRenewal((event) => {
      if (event.outcome === "renewed") void stampOwner(auth.peekAccessToken());
    });
    context.onStop(stopRenewals);
    if (auth.peekAccessToken() !== null) void stampOwner(auth.peekAccessToken());

    const followKillSwitch = createUaTokenKillSwitchReconciler({
      isKillSwitchEnabled: () => experiments.isUaTokenKillSwitchEnabled(),
      log,
    });
    const stopExperiments = experiments.subscribe(() => void followKillSwitch());
    context.onStop(stopExperiments);
    void followKillSwitch();

    return {};
  },
});
