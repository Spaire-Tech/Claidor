// Runs inside the page before the renderer's own script. Builds the two
// globals the reconstructed renderer reads at boot — `window.desktop`, the
// preload bridge, and `window.coordinatorPort`, the port to the agent
// coordinator — and answers every call from `window.__caisraFixtures`.
//
// Shapes come from `frontend/src/recovered/contracts/desktop-bridge.ts` and
// `source/shared/rpc/coordinator.ts`. Anything not modelled returns an empty
// record or array so a screen can draw its frame; the shooter reports the
// console if a screen wanted more.
(() => {
  const fixtures = window.__caisraFixtures;
  if (fixtures == null) throw new Error("harness fixtures were not injected");

  const listeners = new Map();
  const on = (name) => (listener) => {
    const set = listeners.get(name) ?? new Set();
    set.add(listener);
    listeners.set(name, set);
    return () => set.delete(listener);
  };
  const emit = (name, value) => { for (const listener of listeners.get(name) ?? []) listener(value); };
  window.__caisraEmit = emit;
  const resolved = (value) => () => Promise.resolve(value);
  const noop = () => {};
  const persistence = new Map();
  const restoredSelection = fixtures.activeAgentId;

  const desktop = {
    resolveAttachmentMedia: resolved(null),
    readAttachmentText: resolved(null),
    readAttachmentBytes: resolved(null),
    downloadAttachment: resolved(true),
    getLinkMetadata: resolved(null),
    openExternal: resolved(undefined),
    openCloudAgent: resolved(undefined),
    stageAttachmentBytes: (filename) => Promise.resolve({ ok: true, path: `/tmp/staged/${filename}` }),
    commitStagedAttachments: (paths) => Promise.resolve([...paths]),
    discardStagedAttachment: resolved(undefined),
    mcp: {
      list: resolved({ servers: fixtures.mcpServers }),
      effectivePlugins: resolved(fixtures.mcpServers.map((server) => ({ pluginId: server.pluginId, name: server.serverIdentifier, displayName: server.name, installMode: "user", isEnabled: true }))),
      catalog: resolved(fixtures.mcpCatalog),
      teamPopularity: resolved({}),
      pluginLogo: resolved(null),
      install: resolved({ servers: fixtures.mcpServers }),
      updatePluginInstall: resolved({ servers: fixtures.mcpServers }),
      remove: resolved({ state: { servers: fixtures.mcpServers }, removed: true }),
      uninstallPlugin: resolved({ state: { servers: fixtures.mcpServers }, removed: true }),
      authenticate: (serverId) => Promise.resolve({ status: "already-authenticated", serverName: serverId }),
      renameAccount: resolved({ servers: fixtures.mcpServers }),
      removeAccount: resolved({ servers: fixtures.mcpServers }),
      setCustomInstructions: resolved({ servers: fixtures.mcpServers }),
      listServerTools: resolved([]),
      toggleToolDisabled: resolved([]),
      onAuthCompleted: on("mcp-auth"),
    },
    forceGatewayReconnect: resolved(undefined),
    pickAvatarSource: resolved(null),
    pickAvatarFile: resolved(null),
    generateAgentAvatarImage: resolved(""),
    onFocusAgent: on("focus-agent"),
    onDeepLink: on("deep-link"),
    deepLinksReady: resolved(undefined),
    getBoxMigrationStatus: resolved(null),
    onBoxMigration: on("box-migration"),
    onDevBoxRebuild: on("dev-box-rebuild"),
    onOpenFeedback: on("open-feedback"),
    onOpenAbout: on("open-about"),
    submitFeedback: resolved({ ok: true }),
    onWidgetGallery: on("widget-gallery"),
    onForceOnboarding: on("force-onboarding"),
    transcribeAudio: resolved({ text: "" }),
    cursorAccount: {
      getStatus: resolved(fixtures.account),
      login: resolved(fixtures.account),
      cancelLogin: resolved(fixtures.account),
      logout: resolved({ kind: "logged-out" }),
      updateName: (name) => Promise.resolve({ ...fixtures.account, displayName: name }),
      getAvatar: resolved(null),
      getWeeklyUsage: resolved(null),
      getUsageSummary: resolved(fixtures.usageSummary),
      getPrReviewPreferences: resolved(null),
      getPrivacyModeEnabled: resolved(false),
      getSandAccess: resolved({ state: "granted", reason: "none" }),
      getSandAccessFresh: resolved({ state: "granted", reason: "none" }),
      invokeDashboardAction: resolved(null),
      cancelTrial: resolved(null),
      onStatusChanged: on("account-status"),
    },
    experiments: {
      initialSnapshot: { featureGates: { sand_usage_page: true } },
      getSnapshot: resolved({ featureGates: { sand_usage_page: true } }),
      applyFeatureFlagOverride: resolved(undefined),
      refresh: resolved(undefined),
      startRpcTraceWindow: resolved(false),
      onChanged: on("experiments"),
    },
    platform: "darwin",
    isDev: false,
    getWindowState: resolved({ isFullscreen: false, isMaximized: false }),
    onWindowStateEvent: on("window-state"),
    getZoomFactor: () => 1,
    onZoomFactorEvent: on("zoom"),
    windowControls: {
      minimize: resolved(undefined),
      toggleMaximize: resolved(undefined),
      close: resolved(undefined),
      setTitleBarOverlayTone: resolved(undefined),
      resizeWidth: resolved(0),
    },
    foreverBox: {
      forceRecreate: resolved(null),
      update: resolved(null),
      onVncUserPresence: on("vnc-presence"),
      onDevBoxPullProgress: on("dev-box-pull"),
      egressTunnel: {
        initial: false,
        initialStatus: null,
        get: resolved(false),
        set: resolved(false),
        onChanged: on("egress"),
        getStatus: resolved(null),
        onStatusChanged: on("egress-status"),
      },
      webauthnProxy: { initial: false, get: resolved(false), set: resolved(false), onChanged: on("webauthn") },
    },
    onboarding: { getSeen: resolved(true), setSeen: resolved(undefined), onSkip: on("onboarding-skip") },
    telemetry: new Proxy({}, { get: () => noop }),
    timeZone: {
      get: resolved({ detectedTimeZone: "Europe/Zurich", overrideTimeZone: null }),
      setOverride: (timeZone) => Promise.resolve({ detectedTimeZone: "Europe/Zurich", overrideTimeZone: timeZone }),
    },
    autoReviewInstructions: {
      get: resolved({ isEnabled: true, allowInstructions: [], blockInstructions: [] }),
      set: (instructions) => Promise.resolve(instructions),
    },
    localToolPermission: {
      get: resolved("ask"),
      set: (permission) => Promise.resolve(permission),
      ceiling: resolved(null),
      recordApproval: resolved(undefined),
      clearApprovals: resolved(undefined),
    },
    theme: {
      initial: fixtures.theme,
      get: resolved(fixtures.theme),
      set: (preference) => Promise.resolve({ preference, resolved: preference === "system" ? fixtures.theme.resolved : preference }),
      onChanged: on("theme"),
    },
    secrets: {
      list: resolved({ keys: [], isPersistent: true }),
      reveal: resolved(null),
      upsert: resolved({ synced: true }),
      remove: resolved({ synced: true }),
    },
    agent: {
      getPinnedAgents: resolved([]),
      setPinnedAgents: (ids) => Promise.resolve([...ids]),
      getSidebarSections: resolved(null),
      setSidebarSections: (sections) => Promise.resolve([...sections]),
      getDefaultModel: resolved(null),
      setDefaultModel: (model) => Promise.resolve(model),
      getComputerUseModel: resolved(null),
      setComputerUseModel: (model) => Promise.resolve(model),
      getAvailableModels: resolved([]),
      getInferenceRouter: resolved({ provider: "claidor", usage: null, local: null }),
      setInferenceRouter: (provider) => Promise.resolve({ provider, usage: null, local: null }),
      getBoxRuntime: resolved({ mode: "local-docker", status: null }),
      setBoxRuntime: (mode) => Promise.resolve({ mode, status: null }),
      clientPersistence: {
        // The last open conversation lives in a per-account slice whose key
        // encodes the account slot; answer any read of that slice with the
        // fixture's active agent so the harness opens where it is told to.
        read: (key) => Promise.resolve(
          persistence.get(key)
            ?? (restoredSelection && key.endsWith(".selection.last-agent")
              ? JSON.stringify({ schemaVersion: 1, value: { agentId: restoredSelection } })
              : null),
        ),
        write: (key, value) => { persistence.set(key, value); return Promise.resolve(); },
        remove: (key) => { persistence.delete(key); return Promise.resolve(); },
        listKeys: (prefix) => Promise.resolve([...persistence.keys()].filter((key) => key.startsWith(prefix))),
        migrateFromLocalStorage: resolved(false),
      },
    },
    update: {
      getStatus: resolved(fixtures.updateStatus),
      check: resolved(fixtures.updateStatus),
      setTrack: (track) => Promise.resolve({ ...fixtures.updateStatus, currentTrack: track }),
      quitAndInstall: resolved(undefined),
      setAutoUpdateWhenIdleOptIn: (enabled) => Promise.resolve({ ...fixtures.updateStatus, autoUpdateWhenIdleOptIn: enabled }),
      onStatusEvent: on("update-status"),
    },
    attachProdBox: { getStatus: resolved({ enabled: false }), setEnabled: resolved({ enabled: false }) },
  };

  // The coordinator: one port, answered from the fixtures.
  const transcripts = fixtures.transcripts;
  const agents = fixtures.agents;
  const calls = [];
  window.__caisraCoordinatorCalls = calls;
  function respond(method, args) {
    calls.push(method);
    switch (method) {
      case "listAgents": return agents;
      case "countAgents": return agents.length;
      case "searchAgents": case "searchMedia": return [];
      case "openAgentTail": case "getAgentTranscriptTail":
        window.__caisraTailArgs = args;
        return { entries: transcripts[args?.id] ?? [] };
      case "getAgentTranscriptWindow": return { entries: transcripts[args?.id] ?? [], threadCounts: {} };
      case "getAgentThread": return { entries: [] };
      case "getForeverBoxStatus": case "ensureForeverBox": return null;
      case "getTeachRecordingStatus": return { state: "idle", agentId: null, startedAtMs: null, maxDurationMs: 600000 };
      case "isAgentNetworkEnabled": case "isGlobalSearchEnabled": case "isEgressTunnelAvailable": return false;
      case "getAgentWorkflows": case "getAgentAutomations": case "listAllAutomations": case "getSubagents":
      case "getAsyncTasks": case "getTrays": case "getConversationOutline": case "skillsCatalog":
      case "listRoutedMcpTools": case "syncPluginSkills":
        return [];
      case "getListenerIntegrations": return { integrations: [] };
      case "getPluginSyncStatus": return { status: "idle" };
      case "getSharingState": return { rooms: [] };
      case "getBoxSecretsStatus": return { keys: [] };
      case "getAgentChannels": return { channels: [] };
      case "getSkillPublishTargets": return { teams: [] };
      case "setAgentUnread": case "setAgentHiddenFromSidebar": case "setAgentNotificationsEnabled":
      case "setAgentNotifyOnUpdates": case "resolveAutoReviewApproval": case "resolveLocalToolPermission":
      case "submitSecret": case "reactToMessage": case "appendConnectorCard": case "runAgentWorkflowNow":
      case "runAgentAutomationNow": case "dismissTray": case "clearTrays": case "handBackForeverBox":
      case "setSharedRoomTyping":
        return null;
      case "sendPrompt": return { accepted: true };
      default: return {};
    }
  }

  function makePort() {
    const handlers = { message: [], close: [] };
    // A microtask, not a timer: the real port answers within the same turn
    // of the event loop, and a reply that lands a frame late is dropped by
    // the renderer's request-generation gate when its open effect re-runs.
    const deliver = (data) => { queueMicrotask(() => { for (const handler of handlers.message) handler({ data }); }); };
    return {
      start: noop,
      close: noop,
      addEventListener(type, handler) { (handlers[type] ?? (handlers[type] = [])).push(handler); },
      postMessage(message) {
        if (message == null || typeof message !== "object") return;
        if (message.kind === "lifecycle" && message.phase === "hello") {
          deliver({ kind: "lifecycle", phase: "ready", protocolVersion: message.protocolVersion });
          deliver({ kind: "event", family: "coordinator-transport-state", payload: { state: "connected" } });
          return;
        }
        if (message.kind === "request") {
          try {
            deliver({ kind: "reply", requestId: message.requestId, outcome: { status: "ok", value: respond(message.method, message.args) } });
          } catch (error) {
            deliver({ kind: "reply", requestId: message.requestId, outcome: { status: "failed", failure: { code: "harness", message: String(error) } } });
          }
        }
      },
    };
  }

  const coordinatorPort = {
    claim(consumer) {
      return {
        request() { setTimeout(() => consumer.onPort(makePort()), 0); },
        release: noop,
      };
    },
  };

  Object.defineProperty(window, "desktop", { value: desktop, configurable: true });
  Object.defineProperty(window, "coordinatorPort", { value: coordinatorPort, configurable: true });
})();
