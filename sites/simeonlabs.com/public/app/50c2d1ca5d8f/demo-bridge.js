(() => {
  // <define:process.env>
  var define_process_env_default = {};

  // source/shared/computer-stream.ts
  var COMPUTER_STREAM_CHANNEL = "sand:computer-stream";
  var SCREEN_LINE_TAG = "[SimeonScreen]";
  function isComputerStreamMessage(value) {
    if (typeof value !== "object" || value == null) return false;
    const record = value;
    return typeof record.line === "string" && (record.filePath === void 0 || typeof record.filePath === "string");
  }
  function computerStreamReason(line) {
    if (/\bstate=connected\b/.test(line) || /\bguest connected\b/.test(line)) return "";
    if (/local docker: gateway ready/.test(line)) return null;
    if (/attach rewrite partition/.test(line)) return "The screen webview used the wrong session partition; it was corrected.";
    const reach = /box reachability outcome=(\S+) method=(\S+) cause=(\S+)/.exec(line);
    if (reach != null) {
      const [, outcome, method, cause] = reach;
      if (outcome === "timeout") return `The computer's gateway did not answer "${method}" within the deadline.`;
      if (outcome === "network") return `The computer's gateway could not be reached for "${method}" (${cause}).`;
      if (outcome === "box_blocked") return "The computer is blocked or paused.";
      return `The computer's gateway failed "${method}": ${outcome} (${cause}).`;
    }
    const docker = /local docker FAILED: (.+)$/.exec(line);
    if (docker != null) return docker[1] ?? "The local Docker computer failed to start.";
    const failedLoad = /guest load FAILED code=(-?\d+) \(([^)]*)\)/.exec(line);
    if (failedLoad != null) return `The screen page did not load (${failedLoad[2]}, ${failedLoad[1]}).`;
    if (/guest preload FAILED/.test(line)) return "The screen page's helper script failed to load.";
    if (/renderer gone/.test(line)) return "The screen page crashed.";
    if (line.includes(SCREEN_LINE_TAG)) {
      if (/noVNC did not start/.test(line)) return "noVNC never started inside the screen page.";
      if (/dialog=noVNC_credentials_dlg/.test(line)) return "The desktop is asking for a password.";
      if (/dialog=noVNC_connect_dlg/.test(line)) return "noVNC is waiting for a Connect click: autoconnect did not fire.";
      if (/status="Failed to connect to server"/.test(line)) return "noVNC cannot reach the desktop's socket.";
      if (/status="Something went wrong, connection is closed"/.test(line)) return "The desktop closed the connection.";
      if (/status="Disconnected"/.test(line)) return "noVNC disconnected.";
      const pageError = /page error: (.+)$/.exec(line);
      if (pageError != null) return `Error inside the screen page: ${pageError[1]}`;
    }
    const consoleError = /guest console\[error\] (.+)$/.exec(line);
    if (consoleError != null) return `Error inside the screen page: ${consoleError[1]}`;
    return null;
  }

  // source/electron-preload/computer-stream-notice.ts
  var COMPUTER_STREAM_NOTICE_ATTR = "data-simeon-screen-notice";
  var COMPUTER_STREAM_NOTICE_DELAY_MS = 2e4;
  var CONNECTING_SELECTOR = ".sand-box-vnc-pool__connecting";
  var UNREACHABLE_SELECTOR = ".sand-computer-stage__placeholder";
  var UNREACHABLE_TEXT = /^Can't reach /;
  var NOTICE_LOG_TAG = "[SimeonScreenNotice]";
  function noticeText(reason, filePath, lead = "The computer's screen isn't connecting.") {
    const parts = [lead];
    parts.push(reason != null && reason.length > 0 ? reason : "No reason was reported yet.");
    if (filePath != null) parts.push(`Details: ${filePath}`);
    return parts.join(" ");
  }
  function setStyle(element, declarations) {
    for (const [name, value] of Object.entries(declarations)) element.style.setProperty(name, value);
  }
  function installComputerStreamNotice(options) {
    const doc = options.doc ?? (typeof document === "undefined" ? void 0 : document);
    if (doc == null) return null;
    const now = options.now ?? (() => Date.now());
    const schedule = options.schedule ?? ((callback, delayMs2) => setTimeout(callback, delayMs2));
    const delayMs = options.delayMs ?? COMPUTER_STREAM_NOTICE_DELAY_MS;
    const log = options.log ?? ((line) => console.info(line));
    let reason = null;
    let filePath = null;
    const seen = /* @__PURE__ */ new Map();
    let disconnected = false;
    const noticeFor = (spinner) => {
      const parent = spinner.parentElement;
      if (parent == null) return null;
      let notice = parent.querySelector(`:scope > [${COMPUTER_STREAM_NOTICE_ATTR}]`);
      if (notice == null) {
        notice = doc.createElement("div");
        notice.setAttribute(COMPUTER_STREAM_NOTICE_ATTR, "1");
        setStyle(notice, {
          position: "absolute",
          left: "8px",
          right: "8px",
          bottom: "8px",
          "z-index": "3",
          font: "12px/1.35 -apple-system, system-ui, sans-serif",
          color: "light-dark(#8a1c1c, #ff8a80)",
          background: "rgba(255,255,255,0.92)",
          "border-radius": "8px",
          padding: "6px 8px",
          "text-align": "center",
          "pointer-events": "none",
          "word-break": "break-word"
        });
        if (parent.style.position === "") parent.style.position = "relative";
        parent.append(notice);
      }
      return notice;
    };
    const sync = () => {
      if (disconnected) return;
      const spinners = new Set(doc.querySelectorAll(CONNECTING_SELECTOR));
      for (const [spinner, since] of seen) {
        if (!spinners.has(spinner) || !spinner.isConnected) {
          seen.delete(spinner);
          spinner.parentElement?.querySelector(`:scope > [${COMPUTER_STREAM_NOTICE_ATTR}]`)?.remove();
          continue;
        }
        if (now() - since >= delayMs) {
          const notice = noticeFor(spinner);
          if (notice != null) {
            const text = noticeText(reason, filePath);
            if (notice.textContent !== text) {
              notice.textContent = text;
              log(`${NOTICE_LOG_TAG} ${text}`);
            }
          }
        }
      }
      for (const spinner of spinners) {
        if (seen.has(spinner)) continue;
        seen.set(spinner, now());
        schedule(sync, delayMs + 50);
      }
      const unreachable = [...doc.querySelectorAll(UNREACHABLE_SELECTOR)].filter((node) => UNREACHABLE_TEXT.test(node.textContent ?? ""));
      for (const placeholder of unreachable) {
        let notice = placeholder.querySelector(`:scope > [${COMPUTER_STREAM_NOTICE_ATTR}]`);
        if (notice == null) {
          notice = doc.createElement("div");
          notice.setAttribute(COMPUTER_STREAM_NOTICE_ATTR, "1");
          setStyle(notice, { font: "12px/1.35 -apple-system, system-ui, sans-serif", color: "light-dark(#8a1c1c, #ff8a80)", "text-align": "center", "max-width": "36em", margin: "6px auto 0", "word-break": "break-word" });
          placeholder.append(notice);
        }
        const text = noticeText(reason, filePath, "The computer's status could not be read.");
        if (notice.textContent !== text) {
          notice.textContent = text;
          log(`${NOTICE_LOG_TAG} ${text}`);
        }
      }
      for (const notice of doc.querySelectorAll(`[${COMPUTER_STREAM_NOTICE_ATTR}]`)) {
        const parent = notice.parentElement;
        const underSpinner = parent?.querySelector(`:scope > ${CONNECTING_SELECTOR}`) != null;
        const underPlaceholder = parent != null && parent.matches(UNREACHABLE_SELECTOR) && UNREACHABLE_TEXT.test(parent.textContent?.replace(notice.textContent ?? "", "") ?? "");
        if (!underSpinner && !underPlaceholder) notice.remove();
      }
    };
    const unsubscribe = options.subscribe((message) => {
      if (!isComputerStreamMessage(message)) return;
      if (message.filePath != null) filePath = message.filePath;
      const next = computerStreamReason(message.line);
      if (next === "") reason = null;
      else if (next != null) reason = next;
      sync();
    });
    const Observer = doc.defaultView?.MutationObserver ?? globalThis.MutationObserver;
    const observer = new Observer(sync);
    const start = () => {
      if (disconnected) return;
      observer.observe(doc.documentElement ?? doc, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
      sync();
    };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
    return { disconnect() {
      disconnected = true;
      observer.disconnect();
      unsubscribe();
    } };
  }
  function installComputerStreamNoticeSafely(ipc) {
    try {
      return installComputerStreamNotice({
        subscribe: (listener) => {
          const wrapped = (_event, payload) => listener(payload);
          ipc.on(COMPUTER_STREAM_CHANNEL, wrapped);
          return () => ipc.off(COMPUTER_STREAM_CHANNEL, wrapped);
        }
      });
    } catch (error) {
      console.warn(`${NOTICE_LOG_TAG} not installed`, error);
      return null;
    }
  }

  // source/shared/persistence.ts
  var CLIENT_PERSISTENCE_CHANNELS = {
    read: "sand:client-persistence-read",
    write: "sand:client-persistence-write",
    remove: "sand:client-persistence-remove",
    listKeys: "sand:client-persistence-list-keys",
    migrate: "sand:client-persistence-migrate"
  };

  // source/electron-preload/coordinator-port-bridge.ts
  function createCoordinatorPortBroker(options) {
    let owner = null;
    return {
      bridge: {
        claim(consumer) {
          if (owner != null) return null;
          owner = consumer;
          return {
            request: () => {
              if (owner !== consumer) return;
              options.invokeRequest();
            },
            release: () => {
              if (owner !== consumer) return;
              owner = null;
            }
          };
        }
      },
      deliver(port) {
        owner?.onPort(port);
      }
    };
  }
  function wrapTransferredCoordinatorPort(port) {
    return {
      postMessage: (message) => port.postMessage(message),
      close: () => port.close(),
      start: () => port.start(),
      addEventListener: (type, listener) => {
        if (type === "message") {
          port.addEventListener("message", (event) => listener({ data: event.data }));
          return;
        }
        port.addEventListener("close", () => listener({}));
      }
    };
  }

  // source/shared/rpc/main.ts
  var MAIN_RPC_CONTRACT_NAME = "main";
  var MAIN_METHOD_TABLE = {
    openExternal: { args: "object" },
    submitFeedback: { args: "object" },
    getDesktopEnvironment: { args: "none" },
    getWindowState: { args: "none" },
    minimizeWindow: { args: "none" },
    toggleMaximizeWindow: { args: "none" },
    closeWindow: { args: "none" },
    resizeWindowWidth: { args: "object" },
    setTitleBarOverlayTone: { args: "object" },
    getThemeState: { args: "none" },
    setThemePreference: { args: "object" },
    getEgressTunnelEnabled: { args: "none" },
    setEgressTunnelEnabled: { args: "object" },
    getEgressTunnelStatus: { args: "none" },
    getWebauthnProxyEnabled: { args: "none" },
    setWebauthnProxyEnabled: { args: "object" },
    getUpdateStatus: { args: "none" },
    checkForUpdates: { args: "none" },
    setUpdateTrack: { args: "object" },
    quitAndInstallUpdate: { args: "none" },
    setAutoUpdateWhenIdleOptIn: { args: "object" },
    getBoxMigrationStatus: { args: "none" },
    markDeepLinksReady: { args: "none" },
    getOnboardingSeen: { args: "none" },
    setOnboardingSeen: { args: "object" },
    getTimeZone: { args: "none" },
    setTimeZoneOverride: { args: "object" },
    getAutoReviewInstructions: { args: "none" },
    setAutoReviewInstructions: { args: "object" },
    getLocalToolPermission: { args: "none" },
    getLocalToolPermissionCeiling: { args: "none" },
    setLocalToolPermission: { args: "object" },
    recordLocalToolApproval: { args: "object" },
    clearLocalToolApprovals: { args: "none" },
    getSidebarCollapsed: { args: "none" },
    setSidebarCollapsed: { args: "object" },
    pickAvatarSource: { args: "none" },
    pickAvatarFile: { args: "none" },
    generateAgentAvatarImage: { args: "object" },
    resolveAttachmentMedia: { args: "object" },
    readAttachmentText: { args: "object" },
    readAttachmentBytes: { args: "object" },
    stageAttachmentBytes: { args: "object" },
    downloadAttachment: { args: "object" },
    commitStagedAttachments: { args: "object" },
    discardStagedAttachment: { args: "object" },
    forceRecreateComputer: { args: "none" },
    updateComputer: { args: "object" },
    forceReconnectGateway: { args: "none" },
    getExperimentsSnapshot: { args: "none" },
    applyFeatureFlagOverride: { args: "object" },
    refreshFeatureFlags: { args: "none" },
    startRpcTraceWindow: { args: "none" },
    getAgentDefaultModel: { args: "none" },
    setAgentDefaultModel: { args: "object" },
    getComputerUseModel: { args: "none" },
    setComputerUseModel: { args: "object" },
    getHostPinnedAgents: { args: "none" },
    setHostPinnedAgents: { args: "object" },
    getHostSidebarSections: { args: "none" },
    setHostSidebarSections: { args: "object" },
    getAvailableModels: { args: "none" },
    getInferenceRouter: { args: "none" },
    setInferenceRouter: { args: "object" },
    getBoxRuntime: { args: "none" },
    setBoxRuntime: { args: "object" },
    transcribeAudio: { args: "object" },
    getCursorAuthStatus: { args: "none" },
    loginCursor: { args: "none" },
    cancelCursorLogin: { args: "none" },
    logoutCursor: { args: "none" },
    updateCursorAccountName: { args: "object" },
    getCursorNamePrompt: { args: "none" },
    getCursorAvatar: { args: "none" },
    getCursorWeeklyUsage: { args: "none" },
    getCursorUsageSummary: { args: "none" },
    getCursorPrReviewPreferences: { args: "none" },
    getCursorPrivacyModeEnabled: { args: "none" },
    getSandAccess: { args: "none" },
    getSandAccessFresh: { args: "none" },
    invokeCursorDashboardAction: { args: "object" },
    cancelCursorSandTrial: { args: "none" },
    reportAgentLoad: { args: "object" },
    reportAccessBlocked: { args: "object" },
    reportAgentsUnreachable: { args: "object" },
    reportRecoveryAction: { args: "object" },
    reportRebuildLifecycle: { args: "object" },
    reportReconciliation: { args: "object" },
    reportBoxVisibility: { args: "object" },
    reportSendLatency: { args: "object" },
    reportSendAck: { args: "object" },
    reportReactionAck: { args: "object" },
    reportRenderTtfr: { args: "object" },
    reportRenderStream: { args: "object" },
    reportVncSession: { args: "object" },
    reportVncLiveness: { args: "object" },
    reportOpenComputer: { args: "object" },
    reportUpdatePrompt: { args: "object" },
    reportSigninGate: { args: "object" },
    reportOnboardingStep: { args: "object" },
    reportClientFailure: { args: "object" },
    openCloudAgent: { args: "object" },
    getLinkMetadata: { args: "object" },
    listSecrets: { args: "none" },
    revealSecret: { args: "object" },
    upsertSecrets: { args: "object" },
    removeSecrets: { args: "object" },
    getMcpState: { args: "none" },
    getEffectivePlugins: { args: "none" },
    getMcpCatalog: { args: "none" },
    getMcpTeamPopularity: { args: "none" },
    getMcpPluginLogo: { args: "object" },
    installEntry: { args: "object" },
    updatePluginInstall: { args: "object" },
    removeMcpServer: { args: "object" },
    uninstallPlugin: { args: "object" },
    authenticateMcpServer: { args: "object" },
    renameMcpAccount: { args: "object" },
    removeMcpAccount: { args: "object" },
    setMcpCustomInstructions: { args: "object" },
    listMcpServerTools: { args: "object" },
    toggleMcpToolDisabled: { args: "object" },
    // Voice calls (30 September 2026): electron-main/voice/voice-call-service.ts.
    getVoiceCallAvailability: { args: "none" },
    startVoiceCall: { args: "object" },
    noteVoiceCallAgent: { args: "object" },
    listVoiceCallVoices: { args: "none" },
    getAgentVoice: { args: "object" },
    setAgentVoice: { args: "object" },
    getVoicePreviewUrl: { args: "object" },
    rateVoiceCall: { args: "object" }
  };

  // source/electron-preload/rpc-edge-runtime.ts
  var EDGE_UNKNOWN_METHOD = "edge/unknown-method";
  var EDGE_HANDLER_FAILED = "edge/handler-failed";
  var EdgeCallFailure = class extends Error {
    name = "EdgeCallFailure";
    code;
    detail;
    constructor(failure) {
      super(`${failure.code}: ${failure.detail}`);
      this.code = failure.code;
      this.detail = failure.detail;
    }
  };
  function isEdgeReplyEnvelope(value) {
    return typeof value === "object" && value != null && "ok" in value && typeof value.ok === "boolean";
  }
  function methodChannel(edge, method) {
    return `sand-rpc:${edge}:m:${method}`;
  }
  function eventChannel(edge, event) {
    return `sand-rpc:${edge}:e:${event}`;
  }
  function bridgeRpcEdge(edge, table, transport, hasEvents = false) {
    const bridge = {};
    const callMethod = async (method, payload) => {
      let reply;
      try {
        reply = await transport.invoke(methodChannel(edge, method), payload);
      } catch (error) {
        throw new EdgeCallFailure({
          code: EDGE_UNKNOWN_METHOD,
          detail: error instanceof Error ? error.message : String(error)
        });
      }
      if (!isEdgeReplyEnvelope(reply)) {
        throw new EdgeCallFailure({ code: EDGE_HANDLER_FAILED, detail: "The edge replied outside its envelope." });
      }
      if (reply.ok) return reply.value;
      throw new EdgeCallFailure(reply.failure);
    };
    for (const [method, row] of Object.entries(table)) {
      bridge[method] = row.args === "none" ? () => callMethod(method, {}) : (args) => callMethod(method, args);
    }
    if (hasEvents) {
      bridge.subscribe = (handlers) => {
        const unsubscribes = [];
        for (const [event, listener] of Object.entries(handlers)) {
          if (listener != null) unsubscribes.push(transport.on(eventChannel(edge, event), listener));
        }
        return () => {
          for (const unsubscribe of unsubscribes) unsubscribe();
        };
      };
    }
    return bridge;
  }

  // source/electron-preload/preload.ts
  function createMainEdgeTransport(ipc) {
    return {
      invoke: (channel, payload) => ipc.invoke(channel, payload),
      on: (channel, listener) => {
        const wrapped = (_event, payload) => listener(payload);
        ipc.on(channel, wrapped);
        return () => ipc.off(channel, wrapped);
      }
    };
  }
  function subscribeIpc(ipc, channel, listener) {
    const wrapped = (_event, payload) => listener(payload);
    ipc.on(channel, wrapped);
    return () => ipc.off(channel, wrapped);
  }
  var DESKTOP_TELEMETRY_CHANNELS = {
    reportAgentLoad: "sand:report-agent-load",
    reportBoxVisibility: "sand:report-box-visibility",
    reportSendLatency: "sand:report-send-latency",
    reportHeapMetrics: "sand:report-heap-metrics",
    reportSendAck: "sand:report-send-ack",
    reportReactionAck: "sand:report-reaction-ack",
    reportRenderTtfr: "sand:report-render-ttfr",
    reportRenderStream: "sand:report-render-stream",
    reportAgentsUnreachable: "sand:report-agents-unreachable",
    reportAccessBlocked: "sand:report-access-blocked",
    reportRecoveryAction: "sand:report-recovery-action",
    reportRebuildLifecycle: "sand:report-rebuild-lifecycle",
    reportReconciliation: "sand:report-reconciliation",
    reportVncSession: "sand:report-vnc-session",
    reportVncLiveness: "sand:report-vnc-liveness",
    reportOpenComputer: "sand:report-open-computer",
    reportUpdatePrompt: "sand:report-update-prompt",
    reportSigninGate: "sand:report-signin-gate",
    reportOnboardingStep: "sand:report-onboarding-step",
    reportClientFailure: "sand:report-client-failure",
    noteSentryConversation: "sand:sentry-conversation"
  };
  function createDesktopTelemetryBridge(ipc) {
    return Object.fromEntries(Object.entries(DESKTOP_TELEMETRY_CHANNELS).map(([method, channel]) => [
      method,
      (report) => ipc.send(channel, report)
    ]));
  }
  function readPrimaryPreloadInitialState(ipc) {
    return {
      experimentSnapshot: ipc.sendSync("sand:experiments-snapshot-sync"),
      themeState: ipc.sendSync("sand:theme-get-sync"),
      egressTunnelEnabled: ipc.sendSync("sand:egress-tunnel-get-sync") === true,
      webauthnProxyEnabled: ipc.sendSync("sand:webauthn-proxy-get-sync") === true,
      egressTunnelStatus: ipc.sendSync("sand:egress-tunnel-status-get-sync")
    };
  }
  function hasDevRestart(env) {
    return env.SAND_RESTART_EXIT_CODE != null && env.SAND_RESTART_EXIT_CODE.length > 0;
  }
  function createDesktopPreloadBridge(options) {
    const { ipc, mainEdge } = options;
    const env = options.env ?? define_process_env_default;
    const isDevRestartEnabled = options.devRestartEnabled ?? hasDevRestart(env);
    const edge = (method, ...args) => mainEdge[method](...args);
    const subscribe = (event, listener) => mainEdge.subscribe({ [event]: listener });
    const initialState = options.initialState ?? readPrimaryPreloadInitialState(ipc);
    const desktop = {
      resolveAttachmentMedia: (url) => edge("resolveAttachmentMedia", { source: url }),
      readAttachmentText: (path) => edge("readAttachmentText", { path }),
      readAttachmentBytes: (path, maxBytes) => edge("readAttachmentBytes", { path, maxBytes }),
      downloadAttachment: (path, suggestedName) => edge("downloadAttachment", { path, suggestedName }),
      getLinkMetadata: (url) => edge("getLinkMetadata", { url }),
      async openExternal(url) {
        await edge("openExternal", { url });
      },
      async openCloudAgent(bcId) {
        await edge("openCloudAgent", { bcId });
      },
      stageAttachmentBytes: (filename, bytes) => edge("stageAttachmentBytes", { filename, bytes }),
      commitStagedAttachments: (paths, filenames) => edge("commitStagedAttachments", { paths, filenames }),
      async discardStagedAttachment(path) {
        await edge("discardStagedAttachment", { path });
      },
      mcp: {
        list: () => ipc.invoke("sand:mcp-list"),
        effectivePlugins: () => ipc.invoke("sand:mcp-effective-plugins"),
        catalog: () => ipc.invoke("sand:mcp-catalog"),
        teamPopularity: () => ipc.invoke("sand:mcp-team-popularity"),
        pluginLogo: (url) => ipc.invoke("sand:mcp-plugin-logo", { url }),
        install: (request) => ipc.invoke("sand:mcp-install", request),
        updatePluginInstall: (request) => ipc.invoke("sand:mcp-update-plugin-install", request),
        remove: (serverId) => ipc.invoke("sand:mcp-remove", { serverId }),
        uninstallPlugin: (pluginId) => ipc.invoke("sand:mcp-uninstall-plugin", { pluginId }),
        authenticate: (serverId, accountKey, trigger) => ipc.invoke("sand:mcp-auth", {
          serverId,
          ...accountKey != null ? { accountKey } : {},
          ...trigger != null ? { trigger } : {}
        }),
        renameAccount: (args) => ipc.invoke("sand:mcp-rename-account", args),
        removeAccount: (args) => ipc.invoke("sand:mcp-remove-account", args),
        setCustomInstructions: (args) => ipc.invoke("sand:mcp-set-instructions", args),
        listServerTools: (serverId) => ipc.invoke("sand:mcp-list-server-tools", { serverId }),
        toggleToolDisabled: (args) => ipc.invoke("sand:mcp-toggle-tool-disabled", args),
        onAuthCompleted: (listener) => subscribeIpc(ipc, "sand:mcp-auth-event", listener)
      },
      async forceGatewayReconnect() {
        await edge("forceReconnectGateway");
      },
      pickAvatarSource: () => edge("pickAvatarSource"),
      pickAvatarFile: () => edge("pickAvatarFile"),
      generateAgentAvatarImage: (description) => edge("generateAgentAvatarImage", { description }),
      onFocusAgent: (listener) => subscribe("focus-agent", listener),
      onDeepLink: (listener) => subscribe("deep-link", listener),
      async deepLinksReady() {
        await edge("markDeepLinksReady");
      },
      getBoxMigrationStatus: () => edge("getBoxMigrationStatus"),
      onBoxMigration: (listener) => subscribe("box-migration", listener),
      onDevBoxRebuild: (listener) => subscribe("dev-box-rebuild", listener),
      onOpenFeedback: (listener) => subscribe("open-feedback", () => listener()),
      onOpenAbout: (listener) => subscribe("open-about", () => listener()),
      submitFeedback: (payload) => edge("submitFeedback", payload),
      onWidgetGallery: (listener) => subscribeIpc(ipc, "sand:dev-widget-gallery", listener),
      onForceOnboarding: (listener) => subscribe("force-onboarding", () => listener()),
      transcribeAudio: (audio, mimeType, language) => edge("transcribeAudio", { audio, mimeType, language }),
      // Voice calls (30 September 2026): the chat header's phone button and the
      // voice picker in the agent's character settings, patched into the
      // pinned window by scripts/lib/router-renderer-patch.mjs.
      voiceCall: {
        getAvailability: () => edge("getVoiceCallAvailability"),
        start: (agentId, agentName) => edge("startVoiceCall", { agentId, agentName }),
        noteAgent: (agentId, agentName) => edge("noteVoiceCallAgent", { agentId, agentName }),
        listVoices: () => edge("listVoiceCallVoices"),
        getAgentVoice: (agentId) => edge("getAgentVoice", { agentId }),
        setAgentVoice: (agentId, voiceId) => edge("setAgentVoice", { agentId, voiceId }),
        previewUrl: (voiceId) => edge("getVoicePreviewUrl", { voiceId }),
        // The thumbs on a finished call's card in the chat (2 October 2026).
        rateCall: (conversationId, like) => edge("rateVoiceCall", { conversationId, like })
      },
      cursorAccount: {
        getStatus: () => edge("getCursorAuthStatus"),
        login: () => edge("loginCursor"),
        cancelLogin: () => edge("cancelCursorLogin"),
        logout: () => edge("logoutCursor"),
        updateName: (name) => edge("updateCursorAccountName", { name }),
        // The name sheet after onboarding (1 October 2026): whether to ask, and Google's first name to offer.
        getNamePrompt: () => edge("getCursorNamePrompt"),
        getAvatar: () => edge("getCursorAvatar"),
        getWeeklyUsage: () => edge("getCursorWeeklyUsage"),
        getUsageSummary: () => edge("getCursorUsageSummary"),
        getPrReviewPreferences: () => edge("getCursorPrReviewPreferences"),
        getPrivacyModeEnabled: () => edge("getCursorPrivacyModeEnabled"),
        getSandAccess: () => edge("getSandAccess"),
        getSandAccessFresh: () => edge("getSandAccessFresh"),
        invokeDashboardAction: (request) => edge("invokeCursorDashboardAction", request),
        cancelTrial: () => edge("cancelCursorSandTrial"),
        onStatusChanged: (listener) => subscribe("cursor-auth-changed", listener)
      },
      experiments: {
        initialSnapshot: initialState.experimentSnapshot,
        getSnapshot: () => edge("getExperimentsSnapshot"),
        async applyFeatureFlagOverride(command) {
          await edge("applyFeatureFlagOverride", { command });
        },
        async refresh() {
          await edge("refreshFeatureFlags");
        },
        async startRpcTraceWindow() {
          return await edge("startRpcTraceWindow") === true;
        },
        onChanged: (listener) => subscribe("experiments-changed", listener)
      },
      platform: options.platform ?? "darwin",
      isDev: isDevRestartEnabled,
      getWindowState: () => edge("getWindowState"),
      onWindowStateEvent: (listener) => subscribe("window-state", listener),
      getZoomFactor: () => options.webFrame.getZoomFactor(),
      onZoomFactorEvent: (listener) => subscribe("zoom-factor-changed", ({ factor }) => listener(factor)),
      windowControls: {
        async minimize() {
          await edge("minimizeWindow");
        },
        async toggleMaximize() {
          await edge("toggleMaximizeWindow");
        },
        async close() {
          await edge("closeWindow");
        },
        async setTitleBarOverlayTone(isOverlayTone) {
          await edge("setTitleBarOverlayTone", { isOverlayTone });
        },
        resizeWidth: (deltaWidth) => edge("resizeWindowWidth", { deltaWidth })
      },
      foreverBox: {
        forceRecreate: () => edge("forceRecreateComputer"),
        update: (id, force = false) => edge("updateComputer", { id, force }),
        onVncUserPresence: (listener) => subscribe("vnc-user-presence", ({ isPresent }) => listener(isPresent)),
        onDevBoxPullProgress: (listener) => subscribe("dev-box-pull-progress", listener),
        egressTunnel: {
          initial: initialState.egressTunnelEnabled,
          get: async () => await edge("getEgressTunnelEnabled") === true,
          set: async (enabled) => await edge("setEgressTunnelEnabled", { enabled }) === true,
          onChanged: (listener) => subscribe("egress-tunnel-changed", (enabled) => listener(enabled === true)),
          initialStatus: initialState.egressTunnelStatus,
          getStatus: () => edge("getEgressTunnelStatus"),
          onStatusChanged: (listener) => subscribe("egress-tunnel-status-changed", listener)
        },
        webauthnProxy: {
          initial: initialState.webauthnProxyEnabled,
          get: async () => await edge("getWebauthnProxyEnabled") === true,
          set: async (enabled) => await edge("setWebauthnProxyEnabled", { enabled }) === true,
          onChanged: (listener) => subscribe("webauthn-proxy-changed", (enabled) => listener(enabled === true))
        }
      },
      onboarding: {
        getSeen: () => edge("getOnboardingSeen"),
        async setSeen(seen) {
          await edge("setOnboardingSeen", { seen });
        },
        onSkip: (listener) => subscribe("skip-onboarding", () => listener())
      },
      telemetry: createDesktopTelemetryBridge(ipc),
      timeZone: {
        get: () => edge("getTimeZone"),
        setOverride: (timeZone) => edge("setTimeZoneOverride", { timeZone })
      },
      autoReviewInstructions: {
        get: () => edge("getAutoReviewInstructions"),
        set: (instructions) => edge("setAutoReviewInstructions", { instructions })
      },
      localToolPermission: {
        get: () => edge("getLocalToolPermission"),
        set: (permission) => edge("setLocalToolPermission", { permission }),
        ceiling: () => edge("getLocalToolPermissionCeiling"),
        async recordApproval(approvalId, action, target) {
          await edge("recordLocalToolApproval", { approvalId, action, target });
        },
        async clearApprovals() {
          await edge("clearLocalToolApprovals");
        }
      },
      theme: {
        initial: initialState.themeState,
        get: () => edge("getThemeState"),
        set: (preference) => edge("setThemePreference", { preference }),
        onChanged: (listener) => subscribe("theme-changed", listener)
      },
      secrets: {
        list: () => ipc.invoke("sand:secrets-list"),
        reveal: (key) => ipc.invoke("sand:secrets-reveal", { key }),
        upsert: (entries) => ipc.invoke("sand:secrets-upsert", { entries }),
        remove: (keys) => ipc.invoke("sand:secrets-delete", { keys })
      },
      agent: {
        getPinnedAgents: () => edge("getHostPinnedAgents"),
        setPinnedAgents: (pinnedAgentIds) => edge("setHostPinnedAgents", { pinnedAgentIds }),
        getSidebarSections: () => edge("getHostSidebarSections"),
        setSidebarSections: (sections) => edge("setHostSidebarSections", { sections }),
        getDefaultModel: () => edge("getAgentDefaultModel"),
        setDefaultModel: (model) => edge("setAgentDefaultModel", { model }),
        getComputerUseModel: () => edge("getComputerUseModel"),
        setComputerUseModel: (model) => edge("setComputerUseModel", { model }),
        getAvailableModels: () => edge("getAvailableModels"),
        getInferenceRouter: () => edge("getInferenceRouter"),
        setInferenceRouter: (provider) => edge("setInferenceRouter", { provider }),
        getBoxRuntime: () => edge("getBoxRuntime"),
        setBoxRuntime: (mode) => edge("setBoxRuntime", { mode }),
        clientPersistence: {
          read: (key) => ipc.invoke(CLIENT_PERSISTENCE_CHANNELS.read, { key }),
          async write(key, value) {
            await ipc.invoke(CLIENT_PERSISTENCE_CHANNELS.write, { key, value });
          },
          async remove(key) {
            await ipc.invoke(CLIENT_PERSISTENCE_CHANNELS.remove, { key });
          },
          listKeys: (prefix) => ipc.invoke(CLIENT_PERSISTENCE_CHANNELS.listKeys, { prefix }),
          migrateFromLocalStorage: (entries) => ipc.invoke(CLIENT_PERSISTENCE_CHANNELS.migrate, { entries })
        }
      },
      update: {
        getStatus: () => edge("getUpdateStatus"),
        check: () => edge("checkForUpdates"),
        setTrack: (track) => edge("setUpdateTrack", { track }),
        async quitAndInstall() {
          await edge("quitAndInstallUpdate");
        },
        setAutoUpdateWhenIdleOptIn: (enabled) => edge("setAutoUpdateWhenIdleOptIn", { enabled }),
        onStatusEvent: (listener) => subscribe("update-status", listener)
      }
    };
    if (isDevRestartEnabled) desktop.devRestart = async () => {
      await ipc.invoke("sand:dev-restart");
    };
    desktop.attachProdBox = {
      getStatus: () => ipc.invoke("sand:attach-prod-box-status"),
      setEnabled: (enabled, attachOptions) => ipc.invoke("sand:attach-prod-box-set-enabled", {
        enabled,
        isRestartMainApp: attachOptions?.isRestartMainApp
      })
    };
    return desktop;
  }
  function installPrimaryPreload(options) {
    const env = options.env ?? define_process_env_default;
    const devRestartEnabled = options.devRestartEnabled ?? hasDevRestart(env);
    const initialState = options.initialState ?? readPrimaryPreloadInitialState(options.ipc);
    const broker = options.coordinatorBroker ?? createCoordinatorPortBroker({ invokeRequest: () => {
      void options.ipc.invoke("sand:coordinator-port-request");
    } });
    const desktop = createDesktopPreloadBridge({ ...options, env, devRestartEnabled, initialState });
    options.contextBridge.exposeInMainWorld("desktop", desktop);
    options.contextBridge.exposeInMainWorld("coordinatorPort", broker.bridge);
    options.ipc.on("sand:coordinator-port", (event) => {
      const port = event.ports[0];
      if (port != null) broker.deliver(wrapTransferredCoordinatorPort(port));
    });
    installComputerStreamNoticeSafely(options.ipc);
    return { desktop, coordinatorPort: broker.bridge };
  }
  function installPrimaryPreloadEntrypoint(electron, env = define_process_env_default) {
    const devRestartEnabled = hasDevRestart(env);
    const initialState = readPrimaryPreloadInitialState(electron.ipcRenderer);
    const coordinatorBroker = createCoordinatorPortBroker({ invokeRequest: () => {
      void electron.ipcRenderer.invoke("sand:coordinator-port-request");
    } });
    const transport = createMainEdgeTransport(electron.ipcRenderer);
    const mainEdge = bridgeRpcEdge(MAIN_RPC_CONTRACT_NAME, MAIN_METHOD_TABLE, transport, true);
    return installPrimaryPreload({
      ipc: electron.ipcRenderer,
      webFrame: electron.webFrame,
      contextBridge: electron.contextBridge,
      mainEdge,
      platform: "darwin",
      env,
      initialState,
      devRestartEnabled,
      coordinatorBroker
    });
  }

  // source/shared/rpc/coordinator-port.ts
  var COORDINATOR_PROTOCOL_VERSION = 1;
  var COORDINATOR_UNKNOWN_METHOD = "unknown-method";
  var COORDINATOR_CANCELLED = "cancelled";
  function reject(detail) {
    return { accepted: false, rejection: { code: "malformed-frame", detail } };
  }
  function accept(frame) {
    return { accepted: true, frame };
  }
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  function isNonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
  }
  function parseCoordinatorFrame(value) {
    if (!isRecord(value)) return reject("frame must be an object");
    switch (value.kind) {
      case "lifecycle":
        return parseLifecycle(value);
      case "request": {
        if (!isNonEmptyString(value.requestId)) return reject("request.requestId must be a non-empty string");
        if (!isNonEmptyString(value.method)) return reject("request.method must be a non-empty string");
        if (!("args" in value)) return reject("request.args is missing");
        return accept({ kind: "request", requestId: value.requestId, method: value.method, args: value.args });
      }
      case "cancel":
        if (!isNonEmptyString(value.requestId)) return reject("cancel.requestId must be a non-empty string");
        return accept({ kind: "cancel", requestId: value.requestId });
      case "reply": {
        if (!isNonEmptyString(value.requestId)) return reject("reply.requestId must be a non-empty string");
        const outcome = parseReplyOutcome(value.outcome);
        if (outcome == null) return reject("reply.outcome is not a valid outcome");
        return accept({ kind: "reply", requestId: value.requestId, outcome });
      }
      case "event":
        if (!isNonEmptyString(value.family)) return reject("event.family must be a non-empty string");
        if (!("payload" in value)) return reject("event.payload is missing");
        return accept({ kind: "event", family: value.family, payload: value.payload });
      default:
        return reject("frame.kind must be lifecycle, request, cancel, reply, or event");
    }
  }
  function parseLifecycle(value) {
    switch (value.phase) {
      case "hello":
      case "ready":
        if (typeof value.protocolVersion !== "number") return reject(`lifecycle.${value.phase}.protocolVersion must be a number`);
        return accept({ kind: "lifecycle", phase: value.phase, protocolVersion: value.protocolVersion });
      case "shutdown": {
        if (value.reason !== "requested" && value.reason !== "protocol-error") return reject("lifecycle.shutdown.reason must be requested or protocol-error");
        if (value.reason === "protocol-error") {
          if (typeof value.detail !== "string" || value.detail.length === 0) return reject("lifecycle.shutdown.detail must name the breach for a protocol-error shutdown");
        } else if (value.detail !== null) return reject("lifecycle.shutdown.detail must be null for a requested shutdown");
        return accept({ kind: "lifecycle", phase: "shutdown", reason: value.reason, detail: value.detail });
      }
      default:
        return reject("lifecycle.phase must be hello, ready, or shutdown");
    }
  }
  function parseReplyOutcome(value) {
    if (!isRecord(value)) return null;
    if (value.status === "ok") return "value" in value ? { status: "ok", value: value.value } : null;
    if (value.status !== "failed" || !isRecord(value.failure)) return null;
    const { code, message, transportKind } = value.failure;
    if (!isNonEmptyString(code) || typeof message !== "string") return null;
    return { status: "failed", failure: { code, message, ...isNonEmptyString(transportKind) ? { transportKind } : {} } };
  }

  // source/node-agent-coordinator/renderer-port-server.ts
  function createRendererPortServer(port, options = {}) {
    let phase = "awaiting-hello";
    const { promise: settled, resolve: resolveSettled } = Promise.withResolvers();
    const inFlight = /* @__PURE__ */ new Map();
    const settle = (settlement) => {
      if (phase === "settled") return;
      phase = "settled";
      for (const controller of inFlight.values()) controller.abort();
      inFlight.clear();
      port.close();
      resolveSettled(settlement);
    };
    const breach = (detail) => {
      if (phase === "settled") return;
      port.post({ kind: "lifecycle", phase: "shutdown", reason: "protocol-error", detail });
      settle({ outcome: "protocol-breach", detail });
    };
    const reply = (requestId, outcome) => port.post({ kind: "reply", requestId, outcome });
    const dispatchRequest = (requestId, method, args) => {
      const dispatch = options.dispatchRequest;
      if (dispatch == null) {
        reply(requestId, { status: "failed", failure: { code: COORDINATOR_UNKNOWN_METHOD, message: "no method table serves this session yet" } });
        return;
      }
      const controller = new AbortController();
      inFlight.set(requestId, controller);
      void dispatch(method, args, controller.signal).then(
        (outcome) => {
          if (phase !== "serving" || inFlight.get(requestId) !== controller) return;
          inFlight.delete(requestId);
          reply(requestId, outcome);
        },
        () => breach(`request ${requestId} dispatch rejected instead of settling`)
      );
    };
    const handleFrame = (frame) => {
      if (frame.kind === "lifecycle" && frame.phase === "shutdown") {
        settle({ outcome: "shutdown-requested" });
        return;
      }
      if (frame.kind === "reply" || frame.kind === "event") {
        breach(`client posted a server-direction ${frame.kind} frame`);
        return;
      }
      if (frame.kind === "lifecycle" && frame.phase === "ready") {
        breach("client posted a server-direction ready frame");
        return;
      }
      if (phase === "awaiting-hello") {
        if (frame.kind !== "lifecycle") {
          breach(`${frame.kind} frame before hello`);
          return;
        }
        if (frame.protocolVersion !== COORDINATOR_PROTOCOL_VERSION) {
          breach(`hello.protocolVersion ${frame.protocolVersion} is not the supported ${COORDINATOR_PROTOCOL_VERSION}`);
          return;
        }
        phase = "serving";
        port.post({ kind: "lifecycle", phase: "ready", protocolVersion: COORDINATOR_PROTOCOL_VERSION });
        options.onServing?.();
        return;
      }
      if (frame.kind === "lifecycle") {
        breach("hello repeated on a live session");
        return;
      }
      if (frame.kind === "request") {
        if (inFlight.has(frame.requestId)) {
          breach(`request.requestId ${frame.requestId} reused while in flight`);
          return;
        }
        dispatchRequest(frame.requestId, frame.method, frame.args);
        return;
      }
      const controller = inFlight.get(frame.requestId);
      if (controller == null) return;
      inFlight.delete(frame.requestId);
      controller.abort();
      reply(frame.requestId, { status: "failed", failure: { code: COORDINATOR_CANCELLED, message: "request cancelled" } });
    };
    return {
      handleMessage(value) {
        if (phase === "settled") return;
        const intake = parseCoordinatorFrame(value);
        if (!intake.accepted) {
          breach(intake.rejection.detail);
          return;
        }
        handleFrame(intake.frame);
      },
      handlePortClosed() {
        settle({ outcome: "port-closed" });
      },
      postEvent(family, payload) {
        if (phase === "serving") port.post({ kind: "event", family, payload });
      },
      settled
    };
  }

  // demo/scenario.ts
  var MIN = 6e4;
  var NOW = Date.now();
  var at = (minutesAgo) => NOW - minutesAgo * MIN;
  var you = (id, minutesAgo, content) => ({
    kind: "message",
    id,
    role: "user",
    content,
    isStreaming: false,
    timestampMs: at(minutesAgo)
  });
  var says = (id, minutesAgo, content) => ({
    kind: "send-message",
    id,
    message: { type: "text", content },
    timestampMs: at(minutesAgo)
  });
  var card = (id, minutesAgo, message, extra = {}) => ({
    kind: "send-message",
    id,
    message,
    timestampMs: at(minutesAgo),
    ...extra
  });
  var file = (id, minutesAgo, path) => card(id, minutesAgo, { type: "attachment", url: `file:///home/box/${encodeURI(path)}` });
  var toTeammate = (id, minutesAgo, peer, content) => ({
    kind: "message",
    id,
    role: "assistant",
    content,
    isStreaming: false,
    timestampMs: at(minutesAgo),
    toAgent: { ...peer, kind: "agent" }
  });
  var fromTeammate = (id, minutesAgo, peer, content) => ({
    kind: "message",
    id,
    role: "user",
    content,
    isStreaming: false,
    timestampMs: at(minutesAgo),
    fromAgent: peer
  });
  var earlierCall = (prefix, minutesAgo, callId, seconds, lines) => {
    const peer = { id: `voice-call:${callId}:${seconds}`, name: "Bass" };
    return lines.map(([speaker, content], index) => speaker === "you" ? fromTeammate(`${prefix}${index}`, minutesAgo, peer, content) : toTeammate(`${prefix}${index}`, minutesAgo, peer, content));
  };
  var AGENTS = [
    { id: "simeon", name: "Simeon", title: "Chief of Staff", description: "Runs your day and hands work to the rest of the team.", color: "blue", minutesAgo: 0 },
    { id: "mila", name: "Mila", title: "Inbox and calendar", description: "Answers what she can and keeps your mornings free.", color: "violet", minutesAgo: 25 },
    { id: "yodo", name: "Yodo", title: "Launch manager", description: "Keeps the launch on track in Linear and Slack.", color: "red", minutesAgo: 95 },
    { id: "iris", name: "Iris", title: "Customer support", description: "Answers tickets from your help docs and flags the hard ones.", color: "mint", minutesAgo: 70 },
    { id: "theo", name: "Theo", title: "Bookkeeping", description: "Keeps the books, the runway and the invoices straight.", color: "green", minutesAgo: 60 * 3 },
    { id: "scout", name: "Scout", title: "Customer research", description: "Reads what customers say and brings back what matters.", color: "cyan", minutesAgo: 60 * 26 }
  ];
  var GROUP = {
    id: "launch-squad",
    name: "Launch squad",
    description: "Thursday's launch, with Simeon, Scout and Yodo.",
    memberIds: ["simeon", "scout", "yodo"],
    minutesAgo: 40
  };
  var TRANSCRIPTS = {
    simeon: [],
    mila: [
      you("l0u", 60 * 30, "Keep my mornings free for deep work. Nothing before 11."),
      says("l0a", 60 * 30 - 1, "Done. I moved four meetings this week to the afternoon, and I'll suggest later times when someone asks for a morning."),
      says("l1a", 26, "Overnight: 38 emails. I answered 6 and filed the rest. One needs you: **Acme**'s lawyers sent redlines on the renewal."),
      says("l1b", 25, "Here's a reply that agrees to their payment terms if they sign for two years. Change anything, then send."),
      card("l1d", 25, { type: "email-draft", draft: { from: "bass@northbeam.com", to: ["jordan.lee@acmehealth.com"], subject: "Re: Renewal terms", body: "Hi Jordan,\n\nThanks for the redlines. We can agree to 60-day payment terms if Acme renews for two years. Everything else in the draft stands.\n\nIf that works for you, I'll send the updated contract today.\n\nBest,\nBass" } }, { draftSendState: "editable" })
    ],
    iris: [
      you("i0u", 60 * 48, "Answer the support tickets you're sure about. Send me anything with a refund or an unhappy customer."),
      says("i0a", 60 * 48 - 1, "I'll answer from your help docs, so I need your support inbox in **Gmail** and the docs in **Notion**."),
      card("i0c", 60 * 48 - 1, { type: "connectors", connectors: ["Gmail", "Notion"] }),
      says("i0b", 60 * 48 - 3, "Both connected. I'll leave refunds and anything unhappy for you."),
      says("i1a", 70, "Yesterday: 23 tickets answered, a median of 4 minutes to reply. One is yours: **Brightline** is asking for a $960 refund for September.")
    ],
    theo: [
      you("t0u", 60 * 5, "What's our runway?"),
      says("t0a", 60 * 5 - 1, "**19 months** at September's spend of $41,200. Revenue was **$48,200**, up 12% on August. That's from **Stripe** and **QuickBooks**, closed through 30 September."),
      file("t0f", 60 * 5 - 1, "finance/September close.xlsx"),
      // A call from before calls were written as one line: the window still draws it as a call.
      ...earlierCall("t1c", 60 * 4, "call-demo-theo", 71, [
        ["you", "Theo, are any invoices late?"],
        ["agent", "Two. Acme Health owes $4,200, 34 days late, and Halden & Co $1,800."],
        ["you", "Send them both a polite reminder."],
        ["agent", "Will do, from your Gmail."]
      ]),
      says("t1a", 60 * 3, "Both reminders went out from **Gmail**. I'll tell you when they pay.")
    ],
    scout: [
      you("s0u", 60 * 27, "What are customers saying about onboarding since the redesign?"),
      says("s0a", 60 * 26 + 30, 'I read the 14 interview notes in **Notion** and 212 **Intercom** conversations from the last 30 days. Three things stand out:\n\n1. **Setup takes too long.** 9 of 14 people stalled at the workspace step.\n2. **Templates work.** People who picked one were twice as likely to invite a teammate.\n3. **The words confuse.** "Workspace" and "project" get mixed up in 31 tickets.'),
      file("s0f", 60 * 26 + 29, "research/Onboarding research, September.pdf"),
      says("s0b", 60 * 26 + 29, "The quotes behind each theme are on page 3."),
      // A call on its own: the window draws it as one "Voice chat" line.
      ...earlierCall("s1c", 60 * 20, "call-demo-scout", 109, [
        ["you", "Hey Scout, what's the one thing customers complain about most?"],
        ["agent", "Setup. Nine of fourteen people stalled at the workspace step."],
        ["you", "Okay. Put that at the top of the review doc."],
        ["agent", "Done, it's the first slide now."]
      ])
    ],
    yodo: [
      you("y0u", 60 * 50, "Keep the launch on track. Post a standup in Slack every morning."),
      says("y0a", 60 * 50 - 1, "I'll need **Linear** and **Slack** for that."),
      card("y0c", 60 * 50 - 1, { type: "connectors", connectors: ["Linear", "Slack"] }),
      says("y0b", 60 * 50 - 3, "Both connected. Every morning at 9:00 I'll post the launch board in #launch and flag anything stuck for more than a day."),
      // A call during which Yodo asked Scout something: the teammate exchange and the call's lines
      // sit side by side in the chat.
      toTeammate("y2t", 60 * 3, { id: "scout", name: "Scout" }, "Bass asked for the latest NPS for the launch review. Can you send it?"),
      fromTeammate("y2f", 60 * 3, { id: "scout", name: "Scout" }, "NPS is 41, up from 34 last month."),
      ...earlierCall("y2c", 60 * 3, "call-demo-yodo", 92, [
        ["you", "Yodo, can you get the latest NPS from Scout for the review?"],
        ["agent", "Asking Scout now."],
        ["agent", "It's 41, up from 34 last month."],
        ["you", "Great, thanks."]
      ]),
      says("y1a", 95, "Today's standup is up in #launch:\n\n- **12 of 15** launch tickets done\n- 2 waiting on design review with Dana\n- **LIN-482**, the pricing page bug, is in code review"),
      file("y1f", 95, "launch/Launch tracker.xlsx")
    ]
  };
  var GROUP_TRANSCRIPT = [
    { author: null, entry: you("g0u", 58, "Honest check: can we still ship Thursday?") },
    { author: "yodo", entry: says("g0y", 56, "Engineering says yes if **LIN-482** merges by Wednesday noon. It's in review now.") },
    { author: "scout", entry: says("g0s", 55, "From the research, what customers care about is the new setup flow. The pricing page change can wait.") },
    { author: "simeon", entry: says("g0m", 54, "Then keep Thursday. I'll move the pricing page to the fast-follow list and let Dana and Marcus know.") },
    { author: null, entry: you("g1u", 45, "Do it.") },
    { author: "simeon", entry: says("g1m", 40, "Done. Moved in **Linear** and posted in #launch on **Slack**.") }
  ];
  var step = (at2, id, name, doing, done, ms, detail, target) => [
    { at: at2, kind: "step", agent: "simeon", id, name, summary: doing, status: "running", ...detail == null ? {} : { detail }, ...target == null ? {} : { target } },
    { at: at2 + ms, kind: "step", agent: "simeon", id, name, summary: done, status: "completed" }
  ];
  function openingScript() {
    return [
      { at: 900, kind: "user", agent: "simeon", entry: you("m0u", 0, "Morning. Where are we on Thursday's launch?") },
      { at: 1500, kind: "typing", agent: "simeon", on: true },
      ...step(2100, "m1", "CallMcpTool", "Checking Linear", "Checked Linear", 1300, "Linear"),
      { at: 4e3, kind: "append", agent: "simeon", entry: says("m0a", 0, "Thursday is on track: 12 of 15 launch tickets are done in **Linear**, and the review is Thursday at 2 pm.") },
      ...step(6800, "m4", "SendToAgent", "Asking Scout for customer quotes", "Messages from Scout", 1500, void 0, "scout"),
      { at: 7200, kind: "append", agent: "simeon", entry: toTeammate("m4t", 0, { id: "scout", name: "Scout" }, "Can you pull three customer quotes for Thursday's review?") },
      { at: 8100, kind: "append", agent: "simeon", entry: fromTeammate("m4f", 0, { id: "scout", name: "Scout" }, "Here are three, all about the new setup flow. They're in the review doc.") },
      ...step(8500, "m5", "SendToAgent", "Asking Yodo about the last tickets", "Messages from Yodo", 1300, void 0, "yodo"),
      { at: 8800, kind: "append", agent: "simeon", entry: toTeammate("m5t", 0, { id: "yodo", name: "Yodo" }, "Where are the last launch tickets?") },
      { at: 9600, kind: "append", agent: "simeon", entry: fromTeammate("m5f", 0, { id: "yodo", name: "Yodo" }, "Both closed this morning. 14 of 15 are done; the last one is the pricing page, after launch.") },
      { at: 1e4, kind: "append", agent: "simeon", entry: says("m1a", 0, "Scout pulled three customer quotes and Yodo closed the last two tickets. The review doc is ready.") },
      { at: 10300, kind: "append", agent: "simeon", entry: file("m1f", 0, "docs/Launch review.docx") },
      { at: 10400, kind: "typing", agent: "simeon", on: false },
      { at: 12600, kind: "user", agent: "simeon", entry: you("m2u", 0, "Looks great. Send the agenda to Dana and Marcus, and check in like this every Monday.") },
      { at: 13300, kind: "react", agent: "simeon", entryId: "m2u", emoji: "\u{1F44D}", by: "simeon" },
      { at: 13600, kind: "typing", agent: "simeon", on: true },
      ...step(14e3, "m6", "CallMcpTool", "Sending the agenda from Gmail", "Sent the agenda from Gmail", 1300, "Gmail"),
      ...step(15500, "m7", "UpdateState", "Creating routine Monday launch check", "Created routine Monday launch check", 1e3),
      { at: 16800, kind: "append", agent: "simeon", entry: says("m2a", 0, "Done. The agenda went out from **Gmail**.") },
      { at: 16900, kind: "typing", agent: "simeon", on: false }
    ];
  }
  function onboardingScript(agent, stage) {
    const typing = (at2, on) => ({ at: at2, kind: "typing", agent, on });
    const append = (at2, entry) => ({ at: at2, kind: "append", agent, entry });
    const question = (id, prompt, labels, helpText) => card(id, 0, { type: "widget", widget: { prompt, ...helpText == null ? {} : { helpText }, options: labels.map((label) => ({ label })), allowCustom: true } });
    if (stage === 0) {
      return [
        typing(700, true),
        append(2600, says("o0a", 0, "Hi Bass, I'm Simeon, your COO. Before I start staffing your team, I'd like to know where you want me first.")),
        append(3600, question("o0q", "What should I mainly help you with?", ["Run my day: calendar and inbox", "Keep my projects moving", "Prepare me for meetings", "Lead my other agents"], "Pick one, or type your own. You can hand me a real task instead, and I'll just start on it.")),
        typing(3700, false)
      ];
    }
    if (stage === 1) {
      return [
        typing(500, true),
        append(2200, says("o1a", 0, "Good. For that I need to see your calendar and your email.")),
        append(2600, card("o1c", 0, { type: "connector", connector: "Google Calendar", variant: "connect", reason: "To know your day and protect your time" })),
        append(2800, card("o1g", 0, { type: "connector", connector: "Gmail", variant: "connect", reason: "To sort what needs you and draft replies" })),
        append(3800, question("o1q", "How should I check in with you?", ["A short brief every morning", "Only when something needs me", "A recap at the end of the day"])),
        typing(3900, false)
      ];
    }
    return [
      typing(500, true),
      append(2e3, says("o2a", 0, "Got it. Connect those two and I'll send your first brief tomorrow at 8. Until then, hand me anything and I'll start on it.")),
      typing(2100, false)
    ];
  }

  // source/shared/channels.ts
  var DISCORD_PLATFORM = "discord";
  var SLACK_PLATFORM = "slack";
  var CONNECTOR_MANIFESTS = [
    {
      platform: DISCORD_PLATFORM,
      displayName: "Discord",
      blurb: "Message in Discord servers and DMs through a bot the user owns.",
      credentialLabel: "bot token",
      availability: "available",
      connectGuide: [
        "The user creates an application at discord.com/developers, adds a Bot, turns on the Message Content Intent under Privileged Gateway Intents, and invites the bot to their server with the bot scope and the Send Messages and Read Message History permissions.",
        'Ask for the bot token with a secret-request (connector "discord", field "token"); the connection opens within a few seconds of it being stored. A DM to the bot or a message in a channel it can read wakes you; the address is discord:<channel id>.'
      ].join("\n")
    },
    {
      platform: SLACK_PLATFORM,
      displayName: "Slack",
      blurb: "Message in Slack channels and DMs through a Socket Mode app the user owns.",
      credentialLabel: "app token and bot token",
      availability: "available",
      connectGuide: [
        "The user creates an app at api.slack.com/apps, enables Socket Mode (which issues an app-level token, xapp-\u2026, with connections:write), subscribes the bot to the message.channels, message.groups, message.im and reaction_added events, gives it the chat:write, channels:history, groups:history, im:history, users:read and files:write scopes, and installs it to the workspace (which issues the bot token, xoxb-\u2026).",
        'Two tokens are needed: ask for the app token with a secret-request (connector "slack", field "token") and the bot token with a second one (connector "slack", field "botToken"). The connection opens once both are stored. A DM to the app or a message in a channel it is a member of wakes you; the address is slack:<channel id>.'
      ].join("\n")
    }
  ];

  // demo/backend.ts
  var ok = (value) => ({ status: "ok", value });
  var unanswered = { main: /* @__PURE__ */ new Set(), coordinator: /* @__PURE__ */ new Set(), ipc: /* @__PURE__ */ new Set() };
  var CONNECTED = [
    { id: "900001", name: "Gmail", identifier: "gmail", url: "https://gmailmcp.googleapis.com/mcp/v1" },
    { id: "900002", name: "Google Calendar", identifier: "google-calendar", url: "https://calendarmcp.googleapis.com/mcp/v1" },
    { id: "900003", name: "Stripe", identifier: "stripe", url: "https://mcp.stripe.com" },
    { id: "900004", name: "QuickBooks", identifier: "quickbooks", url: "https://api.simeonlabs.com/v1/desktop/apps/quickbooks/mcp" },
    { id: "900005", name: "Notion", identifier: "notion", url: "https://mcp.notion.com/mcp" },
    { id: "900006", name: "Intercom", identifier: "intercom", url: "https://mcp.intercom.com/mcp" },
    { id: "900007", name: "Slack", identifier: "slack", url: "https://mcp.slack.com/mcp" },
    { id: "900008", name: "Linear", identifier: "linear", url: "https://mcp.linear.app/mcp" }
  ];
  var connectedServer = (s) => ({
    id: s.id,
    name: s.name,
    serverIdentifier: s.identifier,
    accountKey: "default",
    rowServerIdentifier: s.identifier,
    transport: "http",
    url: s.url,
    toolCount: 12,
    customInstructions: "",
    isTeamServer: false,
    pluginId: s.identifier,
    status: "connected"
  });
  function createDemoBackend(hooks) {
    const scale = hooks.timeScale ?? 1;
    const asked = typeof location !== "undefined" ? new URLSearchParams(location.search).get("theme") : null;
    const dark = asked === "dark" || asked !== "light" && typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = dark ? { preference: "dark", resolved: "dark" } : { preference: "light", resolved: "light" };
    const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
    const fresh = params.has("onboarding");
    let onboardingSeen = !fresh;
    let personName = fresh ? null : "Bass";
    let onboardingStage = 0;
    const signedIn = { kind: "logged-in", authId: "demo|bass", email: "bass@simeonlabs.com", displayName: "Bass F", freshness: 1 };
    let authStatus = fresh ? { kind: "logged-out" } : signedIn;
    const persisted = /* @__PURE__ */ new Map();
    const epoch = "demo-" + Math.random().toString(36).slice(2);
    const sequences = /* @__PURE__ */ new Map();
    const stamp = (replicaKey) => {
      const sequence = (sequences.get(replicaKey) ?? 0) + 1;
      sequences.set(replicaKey, sequence);
      return { replicaKey, epoch, sequence };
    };
    const group = { id: GROUP.id, name: GROUP.name, title: "", description: GROUP.description, color: "blue", minutesAgo: GROUP.minutesAgo, isGroup: true, memberIds: GROUP.memberIds };
    const rows = new Map(fresh ? [] : [...AGENTS.map((a) => [a.id, a]), [group.id, group]]);
    const nameOf = (id) => rows.get(id)?.name ?? id;
    const transcripts = new Map(Object.entries(TRANSCRIPTS).map(([id, entries]) => [id, [...entries]]));
    transcripts.set(group.id, GROUP_TRANSCRIPT.map(({ author, entry }) => author == null ? entry : { ...entry, author: { id: author, name: nameOf(author) } }));
    const outlines = /* @__PURE__ */ new Map();
    const running = /* @__PURE__ */ new Map();
    const lastActivity = new Map([...rows.values()].map((r) => [r.id, at(r.minutesAgo)]));
    const unread = /* @__PURE__ */ new Set([group.id]);
    let activeAgentId = "simeon";
    let snapshotSeq = 0;
    let openingStarted = false;
    const lastText = (entries) => {
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e.kind === "message" && typeof e.content === "string") return { id: e.id, text: e.content };
        if (e.kind === "send-message") {
          const m = e.message;
          const by = e.author?.name ? `${e.author.name}: ` : "";
          if (m?.type === "text") return { id: e.id, text: by + m.content };
          if (m?.type === "widget") return { id: e.id, text: m.widget.prompt };
          if (m?.type === "connector") return { id: e.id, text: m.variant === "connected" ? `${m.connector} connected` : `Connect ${m.connector}` };
          if (m?.type === "connectors") return { id: e.id, text: `Connected ${m.connectors.join(" and ")}` };
          if (m?.type === "attachment") return { id: e.id, text: decodeURIComponent(String(m.url).split("/").pop() ?? "Sent a file") };
          if (m?.type === "email-draft") return { id: e.id, text: `Draft: ${m.draft.subject}` };
        }
      }
      return null;
    };
    const plain = (text) => text.replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
    const summary = (row) => {
      const entries = transcripts.get(row.id) ?? [];
      const last = lastText(entries);
      const time = lastActivity.get(row.id) ?? at(row.minutesAgo);
      const run = running.get(row.id);
      const isUnread = unread.has(row.id) && row.id !== activeAgentId;
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        title: row.title,
        avatarDataUrl: null,
        avatarVersion: null,
        avatarShape: "cloud",
        avatarColor: row.color,
        createdAt: at(60 * 24 * 12),
        updatedAt: time,
        path: `/demo/${row.id}/store.db`,
        isActive: row.id === activeAgentId,
        isRunning: run != null,
        isRunningTurn: run != null,
        isComposingMessage: run?.composing ?? false,
        isRetrying: false,
        currentActivity: run?.activity,
        lastEntry: last == null ? null : { kind: "text", text: plain(last.text) },
        lastMessageId: last?.id ?? null,
        lastMessagePreview: last == null ? null : plain(last.text),
        newestEntryId: entries.at(-1)?.id ?? null,
        hasUnread: isUnread,
        unreadCount: isUnread ? 1 : 0,
        lastViewedAt: isUnread ? time - 1 : time,
        lastActivityAt: time,
        awaitingUserResponse: null,
        notificationsEnabled: true,
        notifyOnUpdatesEnabled: true,
        isHiddenFromSidebar: false,
        origin: "user",
        isGroup: row.isGroup === true,
        memberIds: [...row.memberIds ?? []],
        conversationPartnerIds: [],
        snapshotEpoch: epoch,
        snapshotSeq: ++snapshotSeq
      };
    };
    const roster = () => [...rows.values()].sort((a, b) => (lastActivity.get(b.id) ?? 0) - (lastActivity.get(a.id) ?? 0)).map(summary);
    const windowOf = (id) => ({ entries: transcripts.get(id) ?? [], threadCounts: {} });
    const pushAgent = (id) => {
      const row = rows.get(id);
      if (row == null) return;
      hooks.pushCoordinatorEvent("agent-upserted", { activeAgentId, agent: summary(row), ordered: stamp("roster") });
    };
    const pushTranscript = (agentId, event) => {
      hooks.pushCoordinatorEvent("transcript", { ...event, agentId, ordered: stamp(`transcript:${agentId}`) });
    };
    const append = (agentId, entry) => {
      const stamped = { ...entry, timestampMs: Date.now() };
      const list = transcripts.get(agentId) ?? [];
      list.push(stamped);
      transcripts.set(agentId, list);
      lastActivity.set(agentId, Date.now());
      if (agentId !== activeAgentId) unread.add(agentId);
      pushTranscript(agentId, { type: "appended", entry: stamped });
      pushAgent(agentId);
    };
    const update = (agentId, entryId, change) => {
      const list = transcripts.get(agentId) ?? [];
      const index = list.findIndex((e) => e.id === entryId);
      if (index < 0) return null;
      list[index] = change(list[index]);
      pushTranscript(agentId, { type: "updated", entry: list[index] });
      return list[index];
    };
    const setRunning = (agentId, on, activity) => {
      if (on) running.set(agentId, { composing: activity == null, activity });
      else running.delete(agentId);
      pushAgent(agentId);
    };
    const outline = (agentId, item) => {
      const list = outlines.get(agentId) ?? [];
      const index = list.findIndex((i) => i.id === item.id);
      if (index >= 0) list[index] = item;
      else list.push(item);
      outlines.set(agentId, list);
      hooks.pushCoordinatorEvent("outline", { type: index >= 0 ? "updated" : "appended", agentId, item });
    };
    async function play(beats) {
      const start = performance.now();
      for (const beat of beats) {
        const delay = beat.at * scale - (performance.now() - start);
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        switch (beat.kind) {
          case "user":
            append(beat.agent, beat.entry);
            break;
          case "typing":
            setRunning(beat.agent, beat.on);
            break;
          case "step":
            outline(beat.agent, { kind: "tool-call", id: beat.id, name: beat.name, status: beat.status === "running" ? "running" : "completed", summary: beat.summary });
            setRunning(beat.agent, true, beat.status === "running" ? { kind: "tool", tool: beat.name, detail: beat.detail ?? beat.summary, ...beat.target == null ? {} : { target: beat.target } } : void 0);
            break;
          case "append":
            append(beat.agent, beat.entry);
            break;
          case "react":
            update(beat.agent, beat.entryId, (e) => ({ ...e, reactions: [...e.reactions ?? [], { emoji: beat.emoji, by: beat.by }] }));
            break;
        }
      }
    }
    const main = {
      getThemeState: () => theme,
      setThemePreference: () => theme,
      getOnboardingSeen: () => onboardingSeen,
      setOnboardingSeen: (args) => {
        onboardingSeen = args?.seen ?? args?.value ?? true;
        return void 0;
      },
      getWindowState: () => ({ isFullScreen: false, isMaximized: false, isFocused: true }),
      getTimeZone: () => ({ timeZone: "Europe/Zurich", override: null }),
      getSidebarCollapsed: () => false,
      markDeepLinksReady: () => void 0,
      getCursorAuthStatus: () => authStatus,
      // In the app, Sign in opens the browser on app.simeonlabs.com and the window waits; here the browser step passes by itself.
      loginCursor: () => {
        authStatus = { kind: "logging-in" };
        hooks.pushMainEvent("cursor-auth-changed", authStatus);
        setTimeout(() => {
          authStatus = signedIn;
          hooks.pushMainEvent("cursor-auth-changed", authStatus);
        }, 1800);
        setTimeout(() => hooks.reconnectCoordinator?.(), 8e3);
        return authStatus;
      },
      cancelCursorLogin: () => {
        authStatus = { kind: "logged-out" };
        hooks.pushMainEvent("cursor-auth-changed", authStatus);
        return authStatus;
      },
      getSandAccess: () => ({ state: "granted", reason: "none" }),
      getSandAccessFresh: () => ({ state: "granted", reason: "none" }),
      getEgressTunnelStatus: () => null,
      getEgressTunnelEnabled: () => false,
      getWebauthnProxyEnabled: () => false,
      getUpdateStatus: () => ({ kind: "idle" }),
      getBoxMigrationStatus: () => null,
      getExperimentsSnapshot: () => null,
      getCursorUsageSummary: () => null,
      getCursorPrReviewPreferences: () => null,
      getHostPinnedAgents: () => [],
      getHostSidebarSections: () => [],
      getAgentDefaultModel: () => null,
      // Voice calls are on in the app, so the demo draws the phone button and the
      // voice picker. The call itself needs the Mac, a microphone and the
      // server's voice key, so pressing the button here starts nothing.
      getVoiceCallAvailability: () => ({ enabled: true, inCall: false }),
      noteVoiceCallAgent: () => void 0,
      startVoiceCall: () => ({ started: false }),
      listVoiceCallVoices: () => [{ id: "demo-aria", name: "Aria" }, { id: "demo-james", name: "James" }, { id: "demo-sarah", name: "Sarah" }],
      getAgentVoice: () => ({ voiceId: "demo-aria", isDefault: true }),
      setAgentVoice: (args) => ({ voiceId: args?.voiceId ?? null, isDefault: false }),
      getVoicePreviewUrl: () => null,
      getCursorAvatar: () => null,
      // A new account has not said what to call them yet: the window's name sheet.
      getCursorNamePrompt: () => ({ needed: personName == null, suggested: "Bass" }),
      updateCursorAccountName: (args) => {
        personName = typeof args?.name === "string" ? args.name : "Bass";
        return { ok: true };
      },
      resolveAttachmentMedia: () => null,
      getLinkMetadata: () => null,
      openExternal: () => void 0
    };
    const coordinator = {
      listAgents: () => roster(),
      countAgents: () => rows.size,
      searchAgents: () => [],
      searchMedia: () => [],
      getAgentTranscriptWindow: (args) => windowOf(args.id),
      getAgentTranscriptTail: (args) => windowOf(args.id),
      openAgentTail: (args) => {
        const previous = activeAgentId;
        activeAgentId = args.id;
        unread.delete(args.id);
        if (previous !== args.id) {
          pushAgent(previous);
          pushAgent(args.id);
        }
        return windowOf(args.id);
      },
      getAgentThread: () => ({ entries: [] }),
      getConversationOutline: (args) => outlines.get(args?.id ?? args?.agentId) ?? [],
      // Nobody types in the demo; the composer is inert (bridge.ts). A send that slips through is refused politely.
      sendPrompt: () => ({ accepted: false }),
      promptAcceptanceStatus: () => ({ status: "accepted" }),
      respondToWidget: (args) => {
        const agentId = args.agentId ?? activeAgentId;
        const updated = update(agentId, args.entryId, (e) => ({ ...e, respondedValue: args.value }));
        if (updated == null) return { accepted: false };
        if (fresh && onboardingStage < 2) void play(onboardingScript(agentId, ++onboardingStage));
        return { accepted: true };
      },
      createAgent: (args) => {
        const id = `agent-${rows.size + 1}`;
        const row = { id, name: String(args?.name ?? "New Agent"), title: String(args?.title ?? ""), description: String(args?.description ?? ""), color: args?.avatarColor ?? "blue", minutesAgo: 0 };
        rows.set(id, row);
        transcripts.set(id, []);
        lastActivity.set(id, Date.now());
        const previous = activeAgentId;
        activeAgentId = id;
        pushAgent(previous);
        pushAgent(id);
        if (args?.isKickstartRequested === true) void play(onboardingScript(id, 0));
        return { agent: summary(row) };
      },
      kickstartAgent: () => ({ isIntroductionInFlight: false }),
      dismissWidget: (args) => {
        update(args.agentId ?? activeAgentId, args.entryId, (e) => ({ ...e, widgetDismissed: true }));
        return {};
      },
      reactToMessage: (args) => {
        update(args.agentId ?? activeAgentId, args.entryId, (e) => {
          const reactions = [...e.reactions ?? []];
          const i = reactions.findIndex((r) => r.emoji === args.emoji && r.by === "user");
          if (i >= 0) reactions.splice(i, 1);
          else reactions.push({ emoji: args.emoji, by: "user" });
          return { ...e, reactions: reactions.length > 0 ? reactions : void 0 };
        });
        return void 0;
      },
      setAgentUnread: () => void 0,
      getTrays: () => [],
      getTeachRecordingStatus: () => ({ state: "idle" }),
      isAgentNetworkEnabled: () => true,
      isGlobalSearchEnabled: () => false,
      isEgressTunnelAvailable: () => false,
      getSharingState: () => ({ enabled: false, rooms: [] }),
      skillsCatalog: () => [],
      getSubagents: () => [],
      getAsyncTasks: () => [],
      getAgentWorkflows: () => [],
      getAgentAutomations: () => [],
      listAllAutomations: () => [],
      getAgentMemories: () => [],
      getAgentChannels: () => ({ manifests: CONNECTOR_MANIFESTS, connections: [] }),
      getForeverBoxStatus: () => ({ state: "ready" })
    };
    return {
      /** Simeon's conversation plays by itself as soon as the window is up. */
      onServing() {
        if (openingStarted || fresh) return;
        openingStarted = true;
        void play(openingScript());
      },
      sync(channel) {
        switch (channel) {
          case "sand:theme-get-sync":
            return theme;
          case "sand:egress-tunnel-get-sync":
            return false;
          case "sand:webauthn-proxy-get-sync":
            return false;
          default:
            return null;
        }
      },
      async main(method, args) {
        const handler = main[method];
        if (handler) return handler(args);
        unanswered.main.add(method);
        console.warn("[demo] main unanswered", method, args);
        return void 0;
      },
      async coordinator(method, args) {
        const handler = coordinator[method];
        if (handler) return ok(await handler(args));
        unanswered.coordinator.add(method);
        console.warn("[demo] coordinator unanswered", method, JSON.stringify(args)?.slice(0, 300));
        return { status: "failed", failure: { code: "unknown-method", message: `demo does not serve ${method}` } };
      },
      async ipc(channel, payload) {
        if (channel === "sand:client-persistence-read") return persisted.get(payload?.key) ?? null;
        if (channel === "sand:client-persistence-write") {
          persisted.set(payload?.key, payload?.value);
          return void 0;
        }
        if (channel === "sand:client-persistence-remove") {
          persisted.delete(payload?.key);
          return void 0;
        }
        if (channel === "sand:client-persistence-list-keys") return [...persisted.keys()].filter((k) => k.startsWith(payload?.prefix ?? ""));
        if (channel === "sand:client-persistence-migrate") return void 0;
        if (channel === "sand:mcp-list") return { servers: fresh ? [] : CONNECTED.map(connectedServer) };
        if (channel === "sand:mcp-catalog") return { entries: [] };
        unanswered.ipc.add(channel);
        console.warn("[demo] ipc unanswered", channel, payload);
        return void 0;
      }
    };
  }

  // demo/bridge.ts
  var TRACE = new URLSearchParams(location.search).has("trace");
  var trace = (...args) => {
    if (TRACE) console.log("[demo]", ...args);
  };
  var listeners = /* @__PURE__ */ new Map();
  var emit = (channel, event, payload) => {
    for (const listener of listeners.get(channel) ?? []) listener(event, payload);
  };
  var backend = createDemoBackend({
    // Twice the scripted pace: at 1x Simeon read as slow to think and answer (the founder, 28 September 2026).
    timeScale: 0.5,
    pushCoordinatorEvent: (family, payload) => server?.postEvent(family, payload),
    pushMainEvent: (event, payload) => emit(`sand-rpc:main:e:${event}`, {}, payload),
    reconnectCoordinator: () => openCoordinatorPort()
  });
  var server = null;
  Reflect.set(window, "__simeonDemo", backend);
  function openCoordinatorPort() {
    const channel = new MessageChannel();
    const serverPort = channel.port2;
    server = createRendererPortServer(
      { post: (frame) => serverPort.postMessage(frame), close: () => serverPort.close() },
      {
        dispatchRequest: async (method, args) => {
          const outcome = await backend.coordinator(method, args);
          trace("coordinator", method, args, outcome);
          return outcome;
        },
        onServing: () => backend.onServing()
      }
    );
    serverPort.addEventListener("message", (event) => server?.handleMessage(event.data));
    serverPort.start();
    emit("sand:coordinator-port", { ports: [channel.port1] });
  }
  var ipcRenderer = {
    async invoke(channel, payload) {
      if (channel === "sand:coordinator-port-request") {
        queueMicrotask(openCoordinatorPort);
        return void 0;
      }
      const main = /^sand-rpc:main:m:(.+)$/.exec(channel);
      if (main) {
        const value2 = await backend.main(main[1], payload);
        trace("main", main[1], payload, value2);
        return { ok: true, value: value2 };
      }
      const value = await backend.ipc(channel, payload);
      trace("ipc", channel, payload, value);
      return value;
    },
    sendSync(channel) {
      return backend.sync(channel);
    },
    send(channel, payload) {
      trace("send", channel, payload);
    },
    on(channel, listener) {
      if (!listeners.has(channel)) listeners.set(channel, /* @__PURE__ */ new Set());
      listeners.get(channel).add(listener);
    },
    off(channel, listener) {
      listeners.get(channel)?.delete(listener);
    }
  };
  var INERT_IN_DEMO = [
    ".sand-agents-sidebar__account button",
    ".sand-agents-sidebar__plugins",
    ".sand-agents-sidebar__new",
    ".sand-prompt-attach",
    ".sand-chat-header__computer"
  ].join(",");
  var COMPOSER = ".sand-prompt-shell";
  var isInert = (target) => target instanceof Element && target.closest(`${INERT_IN_DEMO},${COMPOSER}`) != null;
  for (const type of ["pointerdown", "mousedown", "click", "dblclick", "keydown", "keypress", "beforeinput", "paste", "drop"]) {
    window.addEventListener(type, (event) => {
      if (!isInert(event.target)) return;
      const inComposer = event.target instanceof Element && event.target.closest(COMPOSER) != null;
      if (event instanceof KeyboardEvent && !inComposer && event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }
  window.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete" || event.key === "Enter") {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener("focusin", (event) => {
    if (event.target instanceof HTMLElement && event.target.closest(COMPOSER) != null) event.target.blur();
  }, true);
  var quietComposers = () => {
    for (const shell of document.querySelectorAll(COMPOSER)) {
      if (!shell.hasAttribute("inert")) shell.setAttribute("inert", "");
      for (const editor of shell.querySelectorAll("[contenteditable=true]")) editor.setAttribute("contenteditable", "false");
    }
  };
  new MutationObserver(quietComposers).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["contenteditable"] });
  var demoStyle = document.createElement("style");
  demoStyle.textContent = `${COMPOSER},${COMPOSER} *{cursor:default!important;caret-color:transparent!important}
.sand-activity-mark>span[aria-hidden],.sand-activity-mark__label{opacity:1!important}
.sand-chat-header__computer{display:none!important}`;
  document.head.append(demoStyle);
  installPrimaryPreloadEntrypoint(
    {
      ipcRenderer,
      webFrame: { getZoomFactor: () => 1 },
      contextBridge: { exposeInMainWorld: (name, value) => Reflect.set(window, name, value) }
    },
    {}
  );
})();
