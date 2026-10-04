/**
 * Simeon on the web: what the window asks Electron main for
 * (`window.desktop`, `main-edge.ts` on a Mac), answered from the browser.
 *
 * Three kinds of answer. The account, the models, feedback: Simeon Labs'
 * server, with the pair `api.ts` holds. Pinned agents, sidebar sections,
 * the default model, secrets: the host in the person's cloud computer,
 * through the gateway, which is where the Mac keeps them too
 * (`readHostSettingsFromBox`). Theme, time zone, onboarding, the sidebar's
 * fold, the window's own little persistence: this browser, in
 * localStorage, the way the Mac keeps them in its settings file. What needs
 * a Mac (the updater, the egress tunnel, WebAuthn, local tools, voice
 * calls) answers "not here", in the shapes the window already draws.
 */
import { SimeonApi, SimeonApiError } from "./api.js";
import { createWebGateway, type WebGateway } from "./gateway.js";

export interface WebBackendHooks {
  readonly api: SimeonApi;
  readonly pushCoordinatorEvent: (family: string, payload: unknown) => void;
  readonly pushMainEvent: (event: string, payload: unknown) => void;
  /** Sends the person to the web app's sign-in, to come back here after. */
  readonly goSignIn: () => void;
  readonly storage?: Storage;
  readonly matchDark?: () => boolean;
}

type Outcome = { status: "ok"; value: unknown } | { status: "failed"; failure: { code: string; message: string } };

/** `user_payload()` in `server/simeon/desktop/service.py`. */
interface ProfileRow {
  readonly id?: string;
  readonly email?: string;
  readonly name?: string;
  readonly nickname?: string;
  readonly preferredName?: string;
  readonly suggestedName?: string;
  readonly avatarUrl?: string | null;
}

/** One row of `/desktop/api/models/available` (`pricing.py`). */
interface ModelRow {
  readonly modelId: string;
  readonly modelName?: string;
  readonly provider?: string;
  readonly description?: string;
  readonly costMultiplier?: number;
  readonly accessible?: boolean;
  readonly available?: boolean;
  readonly supportsImage?: boolean;
  readonly supportsThinking?: boolean;
  readonly supportsToolCalling?: boolean;
  readonly agenticReady?: boolean;
  readonly role?: string | null;
  readonly contextWindow?: number;
}

const nonEmpty = (value: unknown): string | undefined => (typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined);

/**
 * The picker's rows, as `simeon-model-catalog.ts` builds them on the Mac
 * and serialises with `toJson()`: the `primary` role and nothing else, one
 * row on by default.
 */
export function availableModelsJson(rows: unknown): { models: Record<string, unknown>[] } {
  const models: Record<string, unknown>[] = [];
  if (Array.isArray(rows)) {
    for (const row of rows as ModelRow[]) {
      if (typeof row?.modelId !== "string" || row.modelId.trim().length === 0) continue;
      if (row.accessible === false || row.available === false || row.role !== "primary") continue;
      const contextTokenLimit = typeof row.contextWindow === "number" && Number.isFinite(row.contextWindow) && row.contextWindow > 0 ? Math.floor(row.contextWindow) : undefined;
      models.push({
        name: row.modelId,
        defaultOn: false,
        serverModelName: row.modelId,
        ...(nonEmpty(row.modelName) === undefined ? {} : { clientDisplayName: nonEmpty(row.modelName) }),
        ...(nonEmpty(row.description) === undefined ? {} : { tagline: nonEmpty(row.description) }),
        supportsAgent: row.agenticReady !== false && row.supportsToolCalling !== false,
        supportsImages: row.supportsImage !== false,
        supportsThinking: row.supportsThinking === true,
        supportsMaxMode: false,
        supportsNonMaxMode: true,
        isHidden: false,
        isChatOnly: false,
        isLongContextOnly: false,
        ...(contextTokenLimit === undefined ? {} : { contextTokenLimit }),
        ...(typeof row.costMultiplier === "number" && Number.isFinite(row.costMultiplier) ? { price: row.costMultiplier } : {}),
        ...(nonEmpty(row.provider) === undefined ? {} : { vendorName: nonEmpty(row.provider) }),
      });
    }
  }
  if (models.length > 0) models[0]!.defaultOn = true;
  return { models };
}

function readJson<T>(storage: Storage | undefined, key: string, fallback: T): T {
  try {
    const raw = storage?.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch { return fallback; }
}
function writeJson(storage: Storage | undefined, key: string, value: unknown): void {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* blocked storage: the setting lasts the page */ }
}

const LOCAL = "simeon.web.";

export function createWebBackend(hooks: WebBackendHooks) {
  const { api } = hooks;
  const storage = hooks.storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  const matchDark = hooks.matchDark ?? (() => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches);

  let profile: ProfileRow | null = null;
  let profilePromise: Promise<ProfileRow | null> | null = null;
  const loadProfile = (): Promise<ProfileRow | null> => {
    if (profile != null) return Promise.resolve(profile);
    profilePromise ??= api.data<ProfileRow>("user/profile").then((row) => { profile = row; return row; }).catch(() => null).finally(() => { profilePromise = null; });
    return profilePromise;
  };

  const authStatus = (): Record<string, unknown> => {
    if (!api.isSignedIn()) return { kind: "logged-out" };
    const row = profile;
    return {
      kind: "logged-in",
      ...(row?.id == null ? {} : { authId: row.id }),
      ...(row?.email == null ? {} : { email: row.email }),
      ...(nonEmpty(row?.preferredName) ?? nonEmpty(row?.name) ?? nonEmpty(row?.nickname)) == null ? {} : { displayName: nonEmpty(row?.preferredName) ?? nonEmpty(row?.name) ?? nonEmpty(row?.nickname) },
      ...(nonEmpty(row?.avatarUrl ?? undefined) == null ? {} : { profilePictureUrl: nonEmpty(row?.avatarUrl ?? undefined) }),
      isAnysphereUser: false,
    };
  };
  const accountSlot = (): string | null => {
    if (!api.isSignedIn()) return null;
    return nonEmpty(profile?.id) ?? nonEmpty(profile?.email) ?? "account";
  };

  // Theme: the person's choice here, else the browser's.
  const themePreference = (): string => readJson<string>(storage, `${LOCAL}theme`, "system");
  const themeState = () => {
    const preference = themePreference();
    const resolved = preference === "dark" || (preference !== "light" && matchDark()) ? "dark" : "light";
    return { preference, resolved };
  };

  const gateway: WebGateway = createWebGateway({
    api,
    postEvent: hooks.pushCoordinatorEvent,
    accountSlot,
  });

  const hostSettings = () => gateway.main("getHostSettings", {}) as Promise<Record<string, unknown>>;
  const setHostSettings = (update: Record<string, unknown>) => gateway.main("setHostSettings", update) as Promise<Record<string, unknown>>;

  const notHere = (what: string) => { throw new SimeonApiError(`${what} needs Simeon on your Mac.`, 501); };

  const main: Record<string, (args: any) => unknown> = {
    // --- the account, on Simeon Labs' server ---
    getCursorAuthStatus: async () => { if (api.isSignedIn()) await loadProfile(); return authStatus(); },
    loginCursor: async () => {
      if (api.isSignedIn()) { await loadProfile(); return authStatus(); }
      hooks.pushMainEvent("cursor-auth-changed", { kind: "logging-in" });
      if (await api.signInFromCookie()) {
        await loadProfile();
        const status = authStatus();
        hooks.pushMainEvent("cursor-auth-changed", status);
        return status;
      }
      hooks.goSignIn();
      return { kind: "logging-in" };
    },
    cancelCursorLogin: () => ({ kind: "logged-out" }),
    logoutCursor: async () => { await api.signOut(); profile = null; const status = { kind: "logged-out" }; hooks.pushMainEvent("cursor-auth-changed", status); return status; },
    updateCursorAccountName: async (args: any) => {
      const name = typeof args?.name === "string" ? args.name : "";
      profile = await api.data<ProfileRow>("user/name", { json: { name } });
      hooks.pushMainEvent("cursor-auth-changed", authStatus());
      return authStatus();
    },
    getCursorNamePrompt: async () => {
      const row = await loadProfile();
      const preferred = nonEmpty(row?.preferredName);
      return { needed: preferred == null, suggested: preferred ?? nonEmpty(row?.suggestedName) ?? null };
    },
    // The menu draws whatever `<img src>` takes; the sign-in provider's picture is an https URL.
    getCursorAvatar: async () => nonEmpty((await loadProfile())?.avatarUrl ?? undefined) ?? null,
    getCursorWeeklyUsage: () => null,
    getCursorUsageSummary: () => null,
    getCursorPrReviewPreferences: () => null,
    getCursorPrivacyModeEnabled: () => true,
    getSandAccess: () => ({ state: api.isSignedIn() ? "granted" : "unknown", reason: "none" }),
    getSandAccessFresh: () => ({ state: api.isSignedIn() ? "granted" : "unknown", reason: "none" }),
    invokeCursorDashboardAction: () => notHere("That account action"),
    cancelCursorSandTrial: () => notHere("That account action"),
    submitFeedback: (args: any) => api.data("feedback", { json: { ...(args ?? {}), platform: "web" } }),
    getAvailableModels: async () => availableModelsJson(await api.data<unknown>("models/available")),
    getExperimentsSnapshot: () => null,
    applyFeatureFlagOverride: () => undefined,
    refreshFeatureFlags: () => undefined,
    startRpcTraceWindow: () => false,

    // --- the computer, on the broker ---
    forceRecreateComputer: () => api.connect("ForceRecreateSandBox", {}),
    updateComputer: (args: any) => api.connect("RecreateSandBox", { preserveData: true, force: args?.force === true }),
    forceReconnectGateway: () => { void gateway.forceReconnect().catch(() => undefined); },
    getBoxMigrationStatus: () => null,
    getBoxRuntime: () => ({ mode: "cloud", status: null }),
    setBoxRuntime: () => ({ mode: "cloud", status: null }),
    getInferenceRouter: async () => ({ provider: "simeon", usage: (await hostSettings().catch(() => ({} as Record<string, unknown>))).inferenceRouterUsage ?? null }),
    setInferenceRouter: async () => ({ provider: "simeon", usage: (await hostSettings().catch(() => ({} as Record<string, unknown>))).inferenceRouterUsage ?? null }),

    // --- the host's settings, in the box ---
    getHostPinnedAgents: async () => (await hostSettings()).pinnedAgentIds ?? null,
    setHostPinnedAgents: async (args: any) => (await setHostSettings({ pinnedAgentIds: args?.pinnedAgentIds })).pinnedAgentIds ?? null,
    getHostSidebarSections: async () => (await hostSettings()).sidebarSections ?? null,
    setHostSidebarSections: async (args: any) => (await setHostSettings({ sidebarSections: args?.sections })).sidebarSections ?? null,
    getAgentDefaultModel: async () => (await hostSettings()).agentDefaultModel ?? null,
    setAgentDefaultModel: async (args: any) => (await setHostSettings({ agentDefaultModel: args?.model })).agentDefaultModel ?? null,
    getComputerUseModel: async () => (await hostSettings()).computerUseModel ?? null,
    setComputerUseModel: async (args: any) => (await setHostSettings({ computerUseModel: args?.model ?? null })).computerUseModel ?? null,
    getAutoReviewInstructions: async () => (await hostSettings()).autoReviewInstructions ?? null,
    setAutoReviewInstructions: async (args: any) => (await setHostSettings({ autoReviewInstructions: args?.instructions })).autoReviewInstructions ?? null,

    // --- this browser ---
    getThemeState: () => themeState(),
    setThemePreference: (args: any) => { writeJson(storage, `${LOCAL}theme`, args?.preference ?? "system"); const state = themeState(); hooks.pushMainEvent("theme-changed", state); return state; },
    getTimeZone: () => ({ detectedTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null, overrideTimeZone: readJson<string | null>(storage, `${LOCAL}time-zone`, null) }),
    setTimeZoneOverride: (args: any) => { writeJson(storage, `${LOCAL}time-zone`, typeof args?.timeZone === "string" ? args.timeZone : null); return undefined; },
    // Onboarding is done once, on whichever device: the host remembers it
    // (`hasSeenOnboarding` in the box's settings), and this browser too.
    getOnboardingSeen: async () => {
      if (readJson<boolean>(storage, `${LOCAL}onboarding-seen`, false)) return true;
      const seen = (await hostSettings().catch(() => ({} as Record<string, unknown>))).hasSeenOnboarding === true;
      if (seen) writeJson(storage, `${LOCAL}onboarding-seen`, true);
      return seen;
    },
    setOnboardingSeen: async (args: any) => {
      const seen = args?.seen !== false;
      writeJson(storage, `${LOCAL}onboarding-seen`, seen);
      await setHostSettings({ hasSeenOnboarding: seen }).catch(() => undefined);
      return undefined;
    },
    getSidebarCollapsed: () => readJson<boolean>(storage, `${LOCAL}sidebar-collapsed`, false),
    setSidebarCollapsed: (args: any) => { writeJson(storage, `${LOCAL}sidebar-collapsed`, args?.collapsed === true); return undefined; },
    getWindowState: () => ({ isFullScreen: false, isMaximized: false, isFocused: typeof document === "undefined" ? true : document.hasFocus() }),
    minimizeWindow: () => undefined,
    toggleMaximizeWindow: () => undefined,
    closeWindow: () => undefined,
    resizeWindowWidth: () => 0,
    setTitleBarOverlayTone: () => undefined,
    markDeepLinksReady: () => undefined,
    openExternal: (args: any) => { const url = typeof args?.url === "string" ? args.url : typeof args === "string" ? args : null; if (url != null && /^https?:\/\//.test(url)) window.open(url, "_blank", "noopener"); return undefined; },
    openCloudAgent: () => undefined,
    getLinkMetadata: () => null,
    resolveAttachmentMedia: () => null,

    // --- what needs a Mac ---
    getLocalToolPermission: () => "never",
    getLocalToolPermissionCeiling: () => "never",
    setLocalToolPermission: () => "never",
    recordLocalToolApproval: () => undefined,
    clearLocalToolApprovals: () => undefined,
    getEgressTunnelEnabled: () => false,
    setEgressTunnelEnabled: () => false,
    getEgressTunnelStatus: () => null,
    getWebauthnProxyEnabled: () => false,
    setWebauthnProxyEnabled: () => false,
    getUpdateStatus: () => ({ kind: "idle" }),
    checkForUpdates: () => ({ kind: "idle" }),
    setUpdateTrack: () => undefined,
    quitAndInstallUpdate: () => undefined,
    setAutoUpdateWhenIdleOptIn: () => undefined,
    getVoiceCallAvailability: () => ({ enabled: false, inCall: false }),
    noteVoiceCallAgent: () => undefined,
    startVoiceCall: () => ({ started: false }),
    listVoiceCallVoices: () => [],
    getAgentVoice: () => null,
    setAgentVoice: () => null,
    getVoicePreviewUrl: () => null,
    rateVoiceCall: () => undefined,
    transcribeAudio: () => notHere("Dictation"),
    pickAvatarSource: () => null,
    pickAvatarFile: () => null,
    generateAgentAvatarImage: () => notHere("Drawing an avatar"),
    readAttachmentText: () => notHere("Reading that file"),
    readAttachmentBytes: () => notHere("Reading that file"),
    stageAttachmentBytes: () => notHere("Attaching a file"),
    downloadAttachment: () => notHere("Saving that file"),
    commitStagedAttachments: () => [],
    discardStagedAttachment: () => undefined,
    getDesktopEnvironment: () => ({ platform: "web" }),
  };

  const persisted = (key: string) => `${LOCAL}persist.${key}`;

  return {
    gateway,
    accountSlot,
    isSignedIn: () => api.isSignedIn(),
    /** Called once the window has claimed its port. */
    onServing(): void { gateway.onServing(); },
    sync(channel: string): unknown {
      switch (channel) {
        case "sand:theme-get-sync": return themeState();
        case "sand:egress-tunnel-get-sync": return false;
        case "sand:webauthn-proxy-get-sync": return false;
        default: return null;
      }
    },
    async main(method: string, args: unknown): Promise<unknown> {
      const handler = main[method];
      if (handler) return handler(args);
      // Telemetry the Mac reports to its own channels; nothing to do here.
      if (method.startsWith("report")) return undefined;
      console.warn("[simeon web] main unanswered", method);
      return undefined;
    },
    async coordinator(method: string, args: unknown, signal: AbortSignal): Promise<Outcome> {
      return gateway.dispatch(method, args, signal);
    },
    async ipc(channel: string, payload: any): Promise<unknown> {
      switch (channel) {
        case "sand:client-persistence-read": { try { return storage?.getItem(persisted(String(payload?.key))) ?? null; } catch { return null; } }
        case "sand:client-persistence-write": { try { storage?.setItem(persisted(String(payload?.key)), String(payload?.value)); } catch { /* full or blocked */ } return undefined; }
        case "sand:client-persistence-remove": { try { storage?.removeItem(persisted(String(payload?.key))); } catch { /* ignore */ } return undefined; }
        case "sand:client-persistence-list-keys": {
          const prefix = persisted(String(payload?.prefix ?? ""));
          const keys: string[] = [];
          try { for (let i = 0; i < (storage?.length ?? 0); i += 1) { const key = storage!.key(i); if (key != null && key.startsWith(prefix)) keys.push(key.slice(persisted("").length)); } } catch { /* ignore */ }
          return keys;
        }
        case "sand:client-persistence-migrate": return undefined;
        // Secrets live in the box (`setBoxSecrets`); the list the window shows is what the box holds.
        case "sand:secrets-list": { try { const status = await gateway.main("getBoxSecretsStatus", {}) as { keys?: unknown }; return Array.isArray(status?.keys) ? status.keys : []; } catch { return []; } }
        case "sand:secrets-upsert": { await gateway.main("setBoxSecrets", { secrets: payload?.entries ?? {} }); return undefined; }
        case "sand:secrets-delete": return undefined;
        case "sand:secrets-reveal": return null;
        // Connected apps are managed from the Mac for now: the box's list is read, nothing is installed from here.
        case "sand:mcp-list": return { servers: [] };
        case "sand:mcp-effective-plugins": return [];
        case "sand:mcp-catalog": return { entries: [] };
        case "sand:mcp-team-popularity": return {};
        case "sand:mcp-plugin-logo": return null;
        case "sand:attach-prod-box-status": return { enabled: false };
        default:
          console.warn("[simeon web] ipc unanswered", channel);
          return undefined;
      }
    },
  };
}

export type WebBackend = ReturnType<typeof createWebBackend>;
