import { createSandAccessReader, readSandAccessOnce, type SandAccess } from "./access.js";
import { SandAccountAuthService, type AccessTokenReader, type SandAuthStatus, type SandAccountAuthServiceOptions } from "./account-auth.js";
import { fetchAccountProfile, fetchLocalToolPermissionCeiling, fetchNamePrompt, fetchPersonName, fetchUserPrivacyMode, updateAccountProfileName } from "./account-profile.js";
import { SandTranscriptionManager, type SandTranscriptionOptions } from "./simeon-transcribe.js";
import { revokeSimeonSession } from "./simeon-sign-out.js";
import { syncSandSentryAccount } from "../telemetry/sentry.js";
import type { PrivacyMode } from "../../shared/observability/sentry-privacy-mode.js";

export const SUPPORTED_DASHBOARD_ACTIONS = new Set(["requestLimitIncrease"] as const);
export const NO_SAND_PR_REVIEW_PREFERENCES = { user: undefined, team: undefined } as const;
export interface DashboardActionRequest { readonly action: "requestLimitIncrease"; readonly args: Readonly<Record<string, string>> }
export interface AccountRuntime {
  observe(status: SandAuthStatus): void;
  whenIdle(): Promise<SandAuthStatus | null | undefined>;
}
export interface AuthServicePort {
  subscribe(listener: (status: SandAuthStatus) => void): () => void;
  getStatus(): Promise<SandAuthStatus>;
  getValidAccessToken(options?: { readonly backendUrl?: string }): Promise<string>;
  peekAccessToken?(): Promise<string | null>;
  revokeForAccountRefusal(): Promise<{ readonly kind: "completed"; readonly status: SandAuthStatus } | { readonly kind: "failed"; readonly status: SandAuthStatus; readonly error: unknown }>;
  login(): Promise<SandAuthStatus>;
  cancelLogin(): Promise<SandAuthStatus>;
  logout(): Promise<SandAuthStatus>;
  updateDisplayName(name: string): Promise<SandAuthStatus>;
  devLogin?(options: { readonly tier?: string; readonly email?: string }): Promise<SandAuthStatus>;
}

export function createAccountAuthWiring(deps: {
  readonly openExternal: (url: string) => void | Promise<void>;
  readonly serviceOptions?: Omit<SandAccountAuthServiceOptions, "openExternal">;
  readonly createAuthService?: (options: SandAccountAuthServiceOptions) => AuthServicePort;
  readonly fetchProfile?: (getAccessToken: AccessTokenReader) => Promise<{ readonly email?: string; readonly displayName?: string; readonly profilePictureUrl?: string; readonly isStaffUser: boolean } | null>;
  readonly updateProfileName?: (getAccessToken: AccessTokenReader, name: string) => Promise<void>;
  readonly revokeSession?: SandAccountAuthServiceOptions["revokeSession"];
  readonly reportSessionSettlement?: SandAccountAuthServiceOptions["reportSessionSettlement"];
  readonly getAccountRuntime: () => AccountRuntime | null | undefined;
  readonly emitAuthStatus: (status: SandAuthStatus & { readonly freshness: number }) => void;
  readonly sentryEnabled: boolean;
  readonly syncSentryAccount?: (status: SandAuthStatus, privacyMode: () => Promise<unknown>) => void | Promise<void>;
  readonly fetchUserPrivacyMode?: (getAccessToken: AccessTokenReader) => Promise<unknown>;
  readonly fetchLocalToolPermissionCeiling?: (getAccessToken: AccessTokenReader) => Promise<string | undefined>;
  readonly settingsStore: {
    getLocalToolPermission(): string;
    setLocalToolPermissionCeiling(ceiling: string | undefined): void;
  };
  readonly syncHostSettingsToBox: (settings: { readonly localToolPermission: string }) => Promise<void>;
  readonly reportFailure?: (domain: string, operation: string, error: unknown) => void;
}) {
  let accountAuthService: AuthServicePort | undefined;
  let unsubscribeAuthStatus: (() => void) | undefined;
  let authStatusFreshness = 0;
  let localToolCeilingSyncSeq = 0;
  const readPrivacyMode = deps.fetchUserPrivacyMode ?? (async (getAccessToken: AccessTokenReader) => await fetchUserPrivacyMode(getAccessToken, {}));
  const readLocalToolPermissionCeiling = deps.fetchLocalToolPermissionCeiling ?? (async (getAccessToken: AccessTokenReader) => await fetchLocalToolPermissionCeiling(getAccessToken, {}));
  const syncSentryAccount = deps.syncSentryAccount ?? (async (status: SandAuthStatus, privacyMode: () => Promise<unknown>) => await syncSandSentryAccount(status as Parameters<typeof syncSandSentryAccount>[0], async () => await privacyMode() as PrivacyMode));

  async function syncLocalToolPermissionCeiling(service: AuthServicePort, status: SandAuthStatus): Promise<void> {
    const sequence = ++localToolCeilingSyncSeq;
    const previous = deps.settingsStore.getLocalToolPermission();
    let ceiling: string | undefined;
    if (status.kind === "logged-in") ceiling = await readLocalToolPermissionCeiling((options) => service.getValidAccessToken(options));
    if (sequence !== localToolCeilingSyncSeq) return;
    deps.settingsStore.setLocalToolPermissionCeiling(ceiling);
    const effective = deps.settingsStore.getLocalToolPermission();
    if (effective === previous) return;
    try { await deps.syncHostSettingsToBox({ localToolPermission: effective }); }
    catch (error) { deps.reportFailure?.("host-settings", "local-tool-ceiling", error); }
  }

  function deliverAccountAuthStatus(service: AuthServicePort, status: SandAuthStatus): void {
    authStatusFreshness += 1;
    deps.emitAuthStatus({ ...status, freshness: authStatusFreshness });
    if (deps.sentryEnabled) void syncSentryAccount(status, () => readPrivacyMode((options) => service.getValidAccessToken(options)));
    void syncLocalToolPermissionCeiling(service, status);
  }

  async function ensureAccountAuthService(): Promise<AuthServicePort> {
    if (accountAuthService != null) return accountAuthService;
    const service = (deps.createAuthService ?? ((options) => new SandAccountAuthService(options)))({
      ...(deps.serviceOptions ?? {}),
      openExternal: deps.openExternal,
      fetchProfile: deps.fetchProfile ?? (async (getAccessToken) => {
        const profile = await fetchAccountProfile(getAccessToken, {});
        return profile == null ? null : {
          isStaffUser: profile.isStaffUser,
          ...(profile.email === undefined ? {} : { email: profile.email }),
          ...(profile.displayName === undefined ? {} : { displayName: profile.displayName }),
          ...(profile.profilePictureUrl === undefined ? {} : { profilePictureUrl: profile.profilePictureUrl }),
        };
      }),
      updateProfileName: deps.updateProfileName ?? ((getAccessToken, name) => updateAccountProfileName(getAccessToken, name, {})),
      // Sign-out reaches Simeon Labs' server since 24 September 2026
      // (`simeon-sign-out.ts`); before, only the keychain was emptied.
      revokeSession: deps.revokeSession ?? ((accessToken) => revokeSimeonSession(accessToken, { reportFailure: (error) => deps.reportFailure?.("account-auth", "session-revoke", error) })),
      ...(deps.reportSessionSettlement == null ? {} : { reportSessionSettlement: deps.reportSessionSettlement }),
    });
    unsubscribeAuthStatus = service.subscribe((status) => {
      const runtime = deps.getAccountRuntime();
      if (runtime == null) deliverAccountAuthStatus(service, status);
      else runtime.observe(status);
    });
    accountAuthService = service;
    if (deps.sentryEnabled) void service.getStatus().then((status) => syncSentryAccount(status, () => readPrivacyMode((options) => service.getValidAccessToken(options))));
    void service.getStatus().then((status) => syncLocalToolPermissionCeiling(service, status));
    return service;
  }

  return {
    ensureAccountAuthService,
    deliverAccountAuthStatus,
    currentAuthStatusFreshness: () => authStatusFreshness,
    dispose(): void {
      unsubscribeAuthStatus?.();
      unsubscribeAuthStatus = undefined;
      accountAuthService = undefined;
      localToolCeilingSyncSeq += 1;
    },
  };
}

export function parseDashboardActionRequest(request: unknown): DashboardActionRequest | null {
  if (request == null || typeof request !== "object") return null;
  const { action, args } = request as { action?: unknown; args?: unknown };
  if (typeof action !== "string" || !SUPPORTED_DASHBOARD_ACTIONS.has(action as never)) return null;
  if (args == null || typeof args !== "object" || Array.isArray(args)) return null;
  const entries = Object.entries(args);
  if (!entries.every(([, value]) => typeof value === "string")) return null;
  return { action: action as DashboardActionRequest["action"], args: Object.fromEntries(entries) as Record<string, string> };
}

export function createAccountEdgePort(deps: {
  readonly ensureAccountAuthService: () => Promise<AuthServicePort>;
  readonly currentAuthStatusFreshness: () => number;
  readonly getAccountRuntime: () => AccountRuntime | null | undefined;
  readonly readSandAccess: (getAccessToken: AccessTokenReader) => Promise<SandAccess>;
  readonly resetMcpManager: () => void | Promise<void>;
  readonly refreshHostMcp: () => void | Promise<void>;
  readonly resolveAvatar: (authId: string, preferredUrl?: string) => Promise<string | null>;
  readonly fetchWeeklyUsage: (getAccessToken: AccessTokenReader) => Promise<unknown>;
  readonly isUsagePageEnabled: () => boolean | Promise<boolean>;
  readonly fetchUsageSummary: (getAccessToken: AccessTokenReader) => Promise<unknown>;
  readonly fetchPrReviewPreferences: (getAccessToken: AccessTokenReader) => Promise<unknown>;
  readonly fetchPrivacyModeEnabled: (getAccessToken: AccessTokenReader) => Promise<boolean>;
  readonly cancelTrial: (getAccessToken: AccessTokenReader) => Promise<unknown>;
  readonly fetchPlanBilling: (getAccessToken: AccessTokenReader) => Promise<unknown>;
  readonly openPlanPortal: (getAccessToken: AccessTokenReader, flow: "cancel" | "update" | "payment_method" | null) => Promise<string>;
  readonly invokeDashboardAction: (getAccessToken: AccessTokenReader, request: DashboardActionRequest) => Promise<unknown>;
  readonly productDisplayName?: string;
}) {
  let sandAccessReader: Promise<ReturnType<typeof createSandAccessReader>> | undefined;
  const settledStatus = async (getStatus: () => Promise<SandAuthStatus>) => await deps.getAccountRuntime()?.whenIdle() ?? await getStatus();
  const sandAccessDeps = async () => {
    const service = await deps.ensureAccountAuthService();
    return { getAuthStatus: () => settledStatus(() => service.getStatus()), readAccess: () => deps.readSandAccess((options) => service.getValidAccessToken(options)) };
  };
  const ensureSandAccessReader = async () => {
    sandAccessReader ??= sandAccessDeps().then(createSandAccessReader);
    return await sandAccessReader;
  };
  const withService = async <T>(operation: (service: AuthServicePort) => Promise<T>): Promise<T> => await operation(await deps.ensureAccountAuthService());
  const tokenReader = (service: AuthServicePort): AccessTokenReader => (options) => service.getValidAccessToken(options);
  return {
    getSandAccess: async () => await (await ensureSandAccessReader()).read(),
    getSandAccessFresh: async () => (await readSandAccessOnce(await sandAccessDeps())).access,
    getAuthStatus: async () => { const freshness = deps.currentAuthStatusFreshness(); const service = await deps.ensureAccountAuthService(); return { ...await settledStatus(() => service.getStatus()), freshness }; },
    login: async () => withService(async (service) => { const result = await service.login(); const settled = await deps.getAccountRuntime()?.whenIdle(); await deps.resetMcpManager(); await deps.refreshHostMcp(); return settled ?? result; }),
    cancelLogin: async () => withService(async (service) => { const result = await service.cancelLogin(); return await deps.getAccountRuntime()?.whenIdle() ?? result; }),
    logout: async () => withService(async (service) => { const result = await service.logout(); return await deps.getAccountRuntime()?.whenIdle() ?? result; }),
    updateAccountName: async (name: unknown) => {
      if (typeof name !== "string" || name.length > 200) throw new Error("updateAccountName requires a bounded name string.");
      return await withService(async (service) => { const result = await service.updateDisplayName(name); return await deps.getAccountRuntime()?.whenIdle() ?? result; });
    },
    // The name sheet after onboarding, and the name a voice call uses (1 October 2026).
    getNamePrompt: async () => withService(async (service) => (await service.getStatus()).kind === "logged-in" ? await fetchNamePrompt(tokenReader(service), {}) : { needed: false, suggested: null }),
    getPersonName: async () => withService(async (service) => (await service.getStatus()).kind === "logged-in" ? await fetchPersonName(tokenReader(service), {}) : null),
    getAvatar: async () => withService(async (service) => { const status = await service.getStatus(); return status.kind !== "logged-in" || status.authId == null ? null : await deps.resolveAvatar(status.authId, status.profilePictureUrl); }),
    getWeeklyUsage: async () => withService(async (service) => (await service.getStatus()).kind === "logged-in" ? await deps.fetchWeeklyUsage(tokenReader(service)) : null),
    getUsageSummary: async () => !await deps.isUsagePageEnabled() ? null : await withService(async (service) => (await service.getStatus()).kind === "logged-in" ? await deps.fetchUsageSummary(tokenReader(service)) : null),
    getPrReviewPreferences: async () => withService(async (service) => (await service.getStatus()).kind === "logged-in" ? await deps.fetchPrReviewPreferences(tokenReader(service)) : NO_SAND_PR_REVIEW_PREFERENCES),
    getPrivacyModeEnabled: async () => withService(async (service) => (await service.getStatus()).kind === "logged-in" ? await deps.fetchPrivacyModeEnabled(tokenReader(service)) : true),
    cancelTrial: async () => !await deps.isUsagePageEnabled() ? { ok: false, message: "This isn’t available right now" } : await withService(async (service) => (await service.getStatus()).kind === "logged-in" ? await deps.cancelTrial(tokenReader(service)) : { ok: false, message: "Sign in to Simeon to continue" }),
    getPlanBilling: async () => withService(async (service) => (await service.getStatus()).kind === "logged-in" ? await deps.fetchPlanBilling(tokenReader(service)) : null),
    openPlanPortal: async (flow: unknown) => {
      const allowed = flow === "cancel" || flow === "update" || flow === "payment_method" ? flow : null;
      return await withService(async (service) => {
        if ((await service.getStatus()).kind !== "logged-in") return { ok: false, portalUrl: null, message: "Sign in to Simeon to continue" };
        try {
          const portalUrl = await deps.openPlanPortal(tokenReader(service), allowed);
          return { ok: true, portalUrl, message: null };
        } catch (error) {
          const message = error instanceof Error && error.message.length > 0 ? error.message : "Could not open your billing page.";
          return { ok: false, portalUrl: null, message };
        }
      });
    },
    invokeDashboardAction: async (raw: unknown) => {
      const request = parseDashboardActionRequest(raw);
      if (request == null) return { ok: false, message: `This action isn’t supported by this version of ${deps.productDisplayName ?? "Simeon"}` };
      return await withService(async (service) => (await service.getStatus()).kind === "logged-in" ? await deps.invokeDashboardAction(tokenReader(service), request) : { ok: false, message: "Sign in to Simeon to continue" });
    },
  };
}

export function createTranscriptionManagerEnsure(deps: {
  readonly ensureAccountAuthService: () => Promise<AuthServicePort>;
  readonly getMachineId: () => Promise<string>;
  readonly fetch?: SandTranscriptionOptions["fetch"];
}) {
  let transcriptionManager: SandTranscriptionManager | undefined;
  return async (): Promise<SandTranscriptionManager> => {
    if (transcriptionManager != null) return transcriptionManager;
    const authService = await deps.ensureAccountAuthService();
    transcriptionManager = new SandTranscriptionManager({
      getAccessToken: () => authService.getValidAccessToken(),
      ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
    });
    return transcriptionManager;
  };
}
