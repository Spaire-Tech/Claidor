"use strict";
const electron = require("electron");
const IpcChannel = {
  List: "scheduledTask:list",
  Get: "scheduledTask:get",
  Create: "scheduledTask:create",
  Update: "scheduledTask:update",
  Delete: "scheduledTask:delete",
  Toggle: "scheduledTask:toggle",
  RunManually: "scheduledTask:runManually",
  Stop: "scheduledTask:stop",
  ListRuns: "scheduledTask:listRuns",
  CountRuns: "scheduledTask:countRuns",
  ListAllRuns: "scheduledTask:listAllRuns",
  ResolveSession: "scheduledTask:resolveSession",
  ListChannels: "scheduledTask:listChannels",
  ListChannelConversations: "scheduledTask:listChannelConversations",
  StatusUpdate: "scheduledTask:statusUpdate",
  RunUpdate: "scheduledTask:runUpdate",
  Refresh: "scheduledTask:refresh"
};
const ActivityIpc = {
  HostGetSlot: "activity:host:get-slot",
  HostGetContext: "activity:host:get-context",
  HostExecuteAction: "activity:host:execute-action"
};
const AgentIpcChannel = {
  List: "agents:list",
  Get: "agents:get",
  Create: "agents:create",
  Update: "agents:update",
  Reorder: "agents:reorder",
  Delete: "agents:delete",
  CleanupLegacyIdentityBlock: "agents:cleanupLegacyIdentityBlock",
  Presets: "agents:presets",
  PresetTemplates: "agents:presetTemplates",
  AddPreset: "agents:addPreset"
};
const AgentLegacyIdentityCleanupStatus = {
  Failed: "failed"
};
const AppIpcChannel = {
  GetKeyfromAttribution: "app:getKeyfromAttribution",
  OpenSystemNotificationSettings: "app:openSystemNotificationSettings"
};
const AppSettingsIpc = {
  GetAutoLaunch: "app:getAutoLaunch",
  SetAutoLaunch: "app:setAutoLaunch",
  GetPreventSleep: "app:getPreventSleep",
  SetPreventSleep: "app:setPreventSleep"
};
const AppUpdateIpc = {
  GetState: "appUpdate:getState",
  CheckNow: "appUpdate:checkNow",
  RetryDownload: "appUpdate:retryDownload",
  InstallReady: "appUpdate:installReady",
  StateChanged: "appUpdate:stateChanged",
  GetCompletedUpdate: "appUpdate:getCompletedUpdate",
  GetActiveWorkloads: "appUpdate:getActiveWorkloads"
};
const ArtifactPreviewIpc = {
  CreateSession: "artifact:createPreviewSession",
  CreateOfficeSession: "artifact:createOfficePreviewSession",
  DestroySession: "artifact:destroyPreviewSession",
  ClearBrowserCookies: "artifact:browser:clearCookies",
  ClearBrowserCache: "artifact:browser:clearCache",
  SaveBrowserAnnotationAsset: "artifact:browserAnnotation:asset:save",
  ReadBrowserAnnotationAsset: "artifact:browserAnnotation:asset:read",
  DeleteBrowserAnnotationAsset: "artifact:browserAnnotation:asset:delete",
  DeleteBrowserAnnotationBatchAssets: "artifact:browserAnnotation:asset:deleteBatch"
};
const AskInputIpc = {
  /** main → renderer: draw a card. */
  Requested: "askInput:requested",
  /** main → renderer: the card is gone (timed out, or the turn ended). */
  Dismissed: "askInput:dismissed",
  /** renderer → main: what they typed, or that they declined. */
  Respond: "askInput:respond"
};
const AsrIpcChannel = {
  CreateRealtimeSession: "asr:realtime:createSession"
};
const AuthIpcChannel = {
  Callback: "auth:callback",
  ClaimCreditsFinalReward: "auth:claimCreditsFinalReward",
  Exchange: "auth:exchange",
  GetAccessToken: "auth:getAccessToken",
  GetActiveClientBanner: "auth:getActiveClientBanner",
  GetActiveClientBanners: "auth:getActiveClientBanners",
  GetClientBannerSnapshot: "auth:getClientBannerSnapshot",
  GetModels: "auth:getModels",
  GetPricingCatalog: "auth:getPricingCatalog",
  GetProfileSummary: "auth:getProfileSummary",
  GetPendingCallback: "auth:getPendingCallback",
  GetQuota: "auth:getQuota",
  GetUser: "auth:getUser",
  LifecycleEvent: "auth:lifecycleEvent",
  Login: "auth:login",
  Logout: "auth:logout",
  QuotaChanged: "auth:quotaChanged",
  RefreshToken: "auth:refreshToken",
  SessionChanged: "auth:sessionChanged"
};
const BrowserCredentialIpc = {
  GetAvailability: "openclaw:browser:credentials:getAvailability",
  List: "openclaw:browser:credentials:list",
  Save: "openclaw:browser:credentials:save",
  Delete: "openclaw:browser:credentials:delete"
};
const BrowserIpc = {
  GetStatus: "openclaw:browser:getStatus",
  ListProfiles: "openclaw:browser:listProfiles",
  Test: "openclaw:browser:test",
  ResetProfile: "openclaw:browser:resetProfile",
  GetHostState: "openclaw:browser:getHostState",
  SetHostView: "openclaw:browser:setHostView",
  NavigateHost: "openclaw:browser:navigateHost",
  GoBackHost: "openclaw:browser:goBackHost",
  GoForwardHost: "openclaw:browser:goForwardHost",
  ReloadHost: "openclaw:browser:reloadHost",
  StopHost: "openclaw:browser:stopHost",
  SelectHostPage: "openclaw:browser:selectHostPage",
  CloseHostPage: "openclaw:browser:closeHostPage",
  ResolveCredentialSavePrompt: "openclaw:browser:resolveCredentialSavePrompt",
  HostState: "openclaw:browser:hostState"
};
const ClipboardIpc = {
  WriteText: "clipboard:writeText",
  WriteImageFromFile: "clipboard:writeImageFromFile",
  WriteImageFromDataUrl: "clipboard:writeImageFromDataUrl"
};
const ConnectionsIpcChannel = {
  Connect: "connections:connect",
  Disconnect: "connections:disconnect"
};
const ProposeConnectorIpc = {
  /** main → renderer: draw the card. */
  Requested: "proposeConnector:requested",
  /** main → renderer: the card is gone (timed out, or the turn ended). */
  Dismissed: "proposeConnector:dismissed",
  /** renderer → main: connected, declined, or failed. */
  Respond: "proposeConnector:respond"
};
const CoworkIpcChannel = {
  CancelMediaTask: "cowork:media:cancel",
  GetMediaModels: "media:getModels",
  MediaStatusPollUpdate: "cowork:media:statusPollUpdate",
  ForkSession: "cowork:session:fork",
  StopSession: "cowork:session:stop",
  SubTaskHistory: "cowork:subTask:history",
  SubagentList: "cowork:subagent:list",
  SubagentListByAgent: "cowork:subagent:listByAgent",
  SubagentDelete: "cowork:subagent:delete",
  MarkSessionViewed: "cowork:session:markViewed",
  SetActiveSession: "cowork:session:setActive",
  SeedNewUserWelcomeTask: "cowork:session:seedNewUserWelcomeTask",
  ExportSessionDiagnostics: "cowork:session:exportDiagnostics",
  GetSessionMessageRailIndex: "cowork:session:getMessageRailIndex",
  GetSessionSearchMessages: "cowork:session:getSearchMessages",
  OpenSessionFromNotification: "cowork:session:openFromNotification",
  OpenSessionFromNotificationReady: "cowork:session:openFromNotificationReady",
  GoalCommand: "cowork:session:goalCommand",
  SubmitBtw: "cowork:session:submitBtw",
  AbortBtw: "cowork:session:abortBtw",
  SubmitSteer: "cowork:session:submitSteer",
  SessionModelOverrideChanged: "cowork:session:modelOverrideChanged",
  SessionsChanged: "cowork:sessions:changed",
  StreamBtwResult: "cowork:stream:btwResult",
  StreamGoal: "cowork:stream:goal",
  MemoryReadRaw: "cowork:memory:readRaw",
  MemoryWriteRaw: "cowork:memory:writeRaw",
  BootstrapRead: "cowork:bootstrap:read",
  BootstrapWrite: "cowork:bootstrap:write",
  TempStorageUsage: "cowork:tempStorage:usage",
  TempStorageClean: "cowork:tempStorage:clean"
};
const DataMigrationIpc = {
  Backup: "openclaw:dataMigration:backup",
  Restore: "openclaw:dataMigration:restore",
  GetLastRestoreResult: "openclaw:dataMigration:getLastRestoreResult"
};
const DialogIpc = {
  StatFile: "dialog:statFile",
  ReadTextFile: "dialog:readTextFile",
  SaveFileCopy: "dialog:saveFileCopy",
  GenerateThumbnail: "dialog:generateThumbnail",
  CancelThumbnail: "dialog:cancelThumbnail"
};
const DshIpcChannel = {
  GetState: "dsh:getState",
  GetConfig: "dsh:getConfig",
  SetEnabled: "dsh:setEnabled",
  OpenWorkbench: "dsh:openWorkbench",
  Stop: "dsh:stop"
};
const EnterpriseAccountIpcChannel = {
  GetContext: "enterpriseAccount:getContext",
  GetIdentities: "enterpriseAccount:getIdentities",
  RequestQuotaIncrease: "enterpriseAccount:requestQuotaIncrease",
  ContextInvalidated: "enterpriseAccount:contextInvalidated"
};
const HtmlShareIpc = {
  CreateFromHtmlFile: "htmlShare:createFromHtmlFile",
  UpdateFromHtmlFile: "htmlShare:updateFromHtmlFile",
  GetByHtmlFile: "htmlShare:getByHtmlFile",
  CreateFromArtifactFile: "htmlShare:createFromArtifactFile",
  UpdateFromArtifactFile: "htmlShare:updateFromArtifactFile",
  GetByArtifactFile: "htmlShare:getByArtifactFile",
  CreateFromGeneratedVideo: "htmlShare:createFromGeneratedVideo",
  GetGeneratedVideoSource: "htmlShare:getGeneratedVideoSource",
  ResolveLegacyGeneratedVideoSource: "htmlShare:resolveLegacyGeneratedVideoSource",
  GetBySource: "htmlShare:getBySource",
  UpdateStatus: "htmlShare:updateStatus",
  UpdateAccessMode: "htmlShare:updateAccessMode",
  Disable: "htmlShare:disable",
  DeletePermanently: "htmlShare:deletePermanently",
  Get: "htmlShare:get",
  GetQuota: "htmlShare:getQuota",
  GetTrialPolicy: "htmlShare:getTrialPolicy",
  GetAnalytics: "htmlShare:getAnalytics"
};
const LibraryIpc = {
  ListLocal: "library:listLocal",
  ListCloud: "library:listCloud",
  GetLocalItems: "library:getLocalItems",
  GetLocalDetail: "library:getLocalDetail",
  RecordCandidates: "library:recordCandidates",
  AddLocalFiles: "library:addLocalFiles",
  SetFavorite: "library:setFavorite",
  OpenLocal: "library:openLocal",
  RevealLocal: "library:revealLocal",
  RepairIndex: "library:repairIndex",
  GetIndexStatus: "library:getIndexStatus",
  GetBackfillState: "library:getBackfillState",
  SetBackfillState: "library:setBackfillState",
  Changed: "library:changed"
};
const WEB_EXTENSIONS = /* @__PURE__ */ new Set([".html", ".htm"]);
const SLIDE_EXTENSIONS = /* @__PURE__ */ new Set([".pptx"]);
const DOCUMENT_EXTENSIONS = /* @__PURE__ */ new Set([".docx", ".pdf", ".md", ".txt", ".log"]);
const SPREADSHEET_EXTENSIONS = /* @__PURE__ */ new Set([".xls", ".xlsx", ".csv", ".tsv"]);
const IMAGE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".avif",
  ".svg"
]);
const MEDIA_EXTENSIONS = /* @__PURE__ */ new Set([".mp4", ".webm", ".mov"]);
/* @__PURE__ */ new Set([
  ...WEB_EXTENSIONS,
  ...SLIDE_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
  ...SPREADSHEET_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
  ...MEDIA_EXTENSIONS,
  ".mermaid",
  ".mmd",
  ".jsx",
  ".tsx",
  ".css"
]);
const LocalWebServicesIpc = {
  List: "localWebServices:list"
};
const McpIpcChannel = {
  List: "mcp:list",
  Create: "mcp:create",
  Update: "mcp:update",
  Delete: "mcp:delete",
  DeleteByRegistryId: "mcp:deleteByRegistryId",
  SetEnabled: "mcp:setEnabled",
  SetEnabledByRegistryId: "mcp:setEnabledByRegistryId",
  RetryLaunchResolution: "mcp:retryLaunchResolution",
  FetchMarketplace: "mcp:fetchMarketplace",
  ConnectQichacha: "mcp:qichachaConnect",
  Changed: "mcp:changed"
};
const OnboardingIpc = {
  /** Platform, current appearance, which tasks can run here. */
  Status: "onboarding:status",
  /** Do the thing the person allowed. Answers with a result card or a reason. */
  RunTask: "onboarding:runTask",
  /** The result card's button: open the note, open the setting. */
  OpenResult: "onboarding:openResult"
};
const OpenClawEngineIpc = {
  GetStatus: "openclaw:engine:getStatus",
  Install: "openclaw:engine:install",
  RetryInstall: "openclaw:engine:retryInstall",
  RestartGateway: "openclaw:engine:restartGateway",
  RepairGatewayState: "openclaw:engine:repairGatewayState",
  OnProgress: "openclaw:engine:onProgress"
};
const PermissionIpcChannel = {
  CheckCalendar: "permissions:checkCalendar",
  RequestCalendar: "permissions:requestCalendar"
};
const ProjectIpc = {
  List: "projects:list",
  Create: "projects:create",
  Update: "projects:update",
  Delete: "projects:delete"
};
const ReactionIpc = {
  Agent: "reaction:agent"
};
const RoomIpc = {
  List: "rooms:list",
  Create: "rooms:create",
  Update: "rooms:update",
  Delete: "rooms:delete"
};
const SettingsChannel = {
  GetExecPolicy: "settings:getExecPolicy",
  SetExecPolicy: "settings:setExecPolicy"
};
const ShareDeploymentIpc = {
  DetectProjectCandidates: "shareDeployment:detectProjectCandidates",
  AnalyzeProjectDirectory: "shareDeployment:analyzeProjectDirectory",
  SelectPersistencePath: "shareDeployment:selectPersistencePath",
  CreateNodeDeployment: "shareDeployment:createNodeDeployment",
  Get: "shareDeployment:get",
  GetByLocalService: "shareDeployment:getByLocalService",
  GetPersistence: "shareDeployment:getPersistence",
  DownloadPersistenceArchive: "shareDeployment:downloadPersistenceArchive"
};
const ShellIpc = {
  OpenPath: "shell:openPath",
  ShowItemInFolder: "shell:showItemInFolder",
  OpenExternal: "shell:openExternal",
  OpenHtmlInBrowser: "shell:openHtmlInBrowser",
  GetAppsForFile: "shell:getAppsForFile",
  GetBrowserApps: "shell:getBrowserApps",
  OpenPathWithApp: "shell:openPathWithApp",
  OpenUrlWithApp: "shell:openUrlWithApp"
};
const SiteIpc = {
  List: "site:list",
  Get: "site:get",
  UpdateTitle: "site:updateTitle",
  UpdateAccessMode: "site:updateAccessMode",
  UpdateAccessStatus: "site:updateAccessStatus",
  Delete: "site:delete",
  GetAnalytics: "site:getAnalytics",
  GetDeploymentQuota: "site:getDeploymentQuota",
  CreateQuotaReservation: "site:createQuotaReservation",
  ReleaseQuotaReservation: "site:releaseQuotaReservation"
};
const SkinIpc = {
  GetActive: "skin:getActive",
  List: "skin:list",
  Apply: "skin:apply",
  BindTheme: "skin:bindTheme",
  Deactivate: "skin:deactivate",
  Delete: "skin:delete",
  Changed: "skin:changed"
};
const SpeechIpc = {
  /** renderer → main: begin a dictation; replies with the session id. */
  Start: "speech:start",
  /** renderer → main: a chunk of PCM16 16 kHz mono, as bytes. */
  Chunk: "speech:chunk",
  /** renderer → main: the person stopped; replies with the final text. */
  Stop: "speech:stop",
  /** renderer → main: throw the recording away. */
  Cancel: "speech:cancel",
  /** renderer → main: is the recogniser ready, downloading, or missing? */
  Status: "speech:status",
  /** main → renderer: readiness changes, download progress, partial text. */
  Event: "speech:event"
};
const CreateAgentIpc = {
  /** main → renderer: draw the card. */
  Requested: "createAgent:requested",
  /** main → renderer: the card is gone (timed out, or the turn ended). */
  Dismissed: "createAgent:dismissed",
  /** renderer → main: Stand up, or Not now. */
  Respond: "createAgent:respond",
  /** main → renderer: an agent now exists; reload the list. */
  Created: "createAgent:created"
};
const RosterIpc = {
  /** main → renderer: draw the card. */
  Requested: "roster:requested",
  /** main → renderer: the card is gone (timed out, or the turn ended). */
  Dismissed: "roster:dismissed",
  /** renderer → main: Stand them up, Something else, or Not now. */
  Respond: "roster:respond"
};
const NimQrLoginIpc = {
  Start: "im:nim:qr-login:start",
  Poll: "im:nim:qr-login:poll"
};
const OpenClawSessionIpc = {
  Patch: "openclaw:session:patch"
};
const OpenClawSessionPolicyIpc = {
  Get: "openclaw:sessionPolicy:get",
  Set: "openclaw:sessionPolicy:set"
};
electron.contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  arch: process.arch,
  store: {
    get: (key) => electron.ipcRenderer.invoke("store:get", key),
    set: (key, value) => electron.ipcRenderer.invoke("store:set", key, value),
    remove: (key) => electron.ipcRenderer.invoke("store:remove", key)
  },
  skills: {
    list: () => electron.ipcRenderer.invoke("skills:list"),
    setEnabled: (options) => electron.ipcRenderer.invoke("skills:setEnabled", options),
    delete: (id) => electron.ipcRenderer.invoke("skills:delete", id),
    download: (source) => electron.ipcRenderer.invoke("skills:download", source),
    upgrade: (skillId, downloadUrl) => electron.ipcRenderer.invoke("skills:upgrade", skillId, downloadUrl),
    confirmInstall: (pendingId, action) => electron.ipcRenderer.invoke("skills:confirmInstall", pendingId, action),
    getRoot: () => electron.ipcRenderer.invoke("skills:getRoot"),
    autoRoutingPrompt: () => electron.ipcRenderer.invoke("skills:autoRoutingPrompt"),
    getConfig: (skillId) => electron.ipcRenderer.invoke("skills:getConfig", skillId),
    setConfig: (skillId, config) => electron.ipcRenderer.invoke("skills:setConfig", skillId, config),
    getEmailAccountsConfig: (skillId) => electron.ipcRenderer.invoke("skills:getEmailAccountsConfig", skillId),
    setEmailAccountsConfig: (skillId, config) => electron.ipcRenderer.invoke("skills:setEmailAccountsConfig", skillId, config),
    testEmailAccountConnectivity: (skillId, account) => electron.ipcRenderer.invoke("skills:testEmailAccountConnectivity", skillId, account),
    testEmailConnectivity: (skillId, config) => electron.ipcRenderer.invoke("skills:testEmailConnectivity", skillId, config),
    fetchMarketplace: () => electron.ipcRenderer.invoke("skills:fetchMarketplace"),
    detectFromOpenClaw: () => electron.ipcRenderer.invoke("skills:detectFromOpenClaw"),
    syncFromOpenClaw: () => electron.ipcRenderer.invoke("skills:syncFromOpenClaw"),
    refreshPluginSkillIds: () => electron.ipcRenderer.invoke("skills:refreshPluginSkillIds"),
    onChanged: (callback) => {
      const handler = () => callback();
      electron.ipcRenderer.on("skills:changed", handler);
      return () => electron.ipcRenderer.removeListener("skills:changed", handler);
    }
  },
  mcp: {
    list: () => electron.ipcRenderer.invoke(McpIpcChannel.List),
    create: (data) => electron.ipcRenderer.invoke(McpIpcChannel.Create, data),
    update: (id, data) => electron.ipcRenderer.invoke(McpIpcChannel.Update, id, data),
    delete: (id) => electron.ipcRenderer.invoke(McpIpcChannel.Delete, id),
    deleteByRegistryId: (registryId) => electron.ipcRenderer.invoke(McpIpcChannel.DeleteByRegistryId, registryId),
    setEnabled: (options) => electron.ipcRenderer.invoke(McpIpcChannel.SetEnabled, options),
    setEnabledByRegistryId: (options) => electron.ipcRenderer.invoke(McpIpcChannel.SetEnabledByRegistryId, options),
    retryLaunchResolution: (id) => electron.ipcRenderer.invoke(McpIpcChannel.RetryLaunchResolution, id),
    fetchMarketplace: () => electron.ipcRenderer.invoke(McpIpcChannel.FetchMarketplace),
    connectQichacha: () => electron.ipcRenderer.invoke(McpIpcChannel.ConnectQichacha),
    onChanged: (callback) => {
      const handler = () => callback();
      electron.ipcRenderer.on(McpIpcChannel.Changed, handler);
      return () => electron.ipcRenderer.removeListener(McpIpcChannel.Changed, handler);
    }
  },
  kits: {
    fetchStore: () => electron.ipcRenderer.invoke("kits:fetchStore"),
    install: (params) => electron.ipcRenderer.invoke("kits:install", params),
    uninstall: (kitId) => electron.ipcRenderer.invoke("kits:uninstall", kitId),
    listInstalled: () => electron.ipcRenderer.invoke("kits:listInstalled")
  },
  skin: {
    getActive: () => electron.ipcRenderer.invoke(SkinIpc.GetActive),
    list: () => electron.ipcRenderer.invoke(SkinIpc.List),
    apply: (skinId, boundThemeId) => electron.ipcRenderer.invoke(SkinIpc.Apply, skinId, boundThemeId),
    bindTheme: (skinId, themeId) => electron.ipcRenderer.invoke(SkinIpc.BindTheme, skinId, themeId),
    deactivate: () => electron.ipcRenderer.invoke(SkinIpc.Deactivate),
    delete: (skinId) => electron.ipcRenderer.invoke(SkinIpc.Delete, skinId),
    onChanged: (callback) => {
      const handler = () => callback();
      electron.ipcRenderer.on(SkinIpc.Changed, handler);
      return () => electron.ipcRenderer.removeListener(SkinIpc.Changed, handler);
    }
  },
  permissions: {
    checkCalendar: () => electron.ipcRenderer.invoke(PermissionIpcChannel.CheckCalendar),
    requestCalendar: () => electron.ipcRenderer.invoke(PermissionIpcChannel.RequestCalendar)
  },
  enterprise: {
    getConfig: () => electron.ipcRenderer.invoke("enterprise:getConfig")
  },
  enterpriseAccount: {
    getContext: () => electron.ipcRenderer.invoke(EnterpriseAccountIpcChannel.GetContext),
    getIdentities: () => electron.ipcRenderer.invoke(EnterpriseAccountIpcChannel.GetIdentities),
    requestQuotaIncrease: (enterpriseId, requestType) => electron.ipcRenderer.invoke(EnterpriseAccountIpcChannel.RequestQuotaIncrease, enterpriseId, requestType),
    onContextInvalidated: (callback) => {
      const handler = () => callback();
      electron.ipcRenderer.on(EnterpriseAccountIpcChannel.ContextInvalidated, handler);
      return () => electron.ipcRenderer.removeListener(EnterpriseAccountIpcChannel.ContextInvalidated, handler);
    }
  },
  api: {
    // 普通 API 请求（非流式）
    fetch: (options) => electron.ipcRenderer.invoke("api:fetch", options),
    // 流式 API 请求
    stream: (options) => electron.ipcRenderer.invoke("api:stream", options),
    // 取消流式请求
    cancelStream: (requestId) => electron.ipcRenderer.invoke("api:stream:cancel", requestId),
    // 监听流式数据
    onStreamData: (requestId, callback) => {
      const handler = (_event, chunk) => callback(chunk);
      electron.ipcRenderer.on(`api:stream:${requestId}:data`, handler);
      return () => electron.ipcRenderer.removeListener(`api:stream:${requestId}:data`, handler);
    },
    // 监听流式完成
    onStreamDone: (requestId, callback) => {
      const handler = () => callback();
      electron.ipcRenderer.on(`api:stream:${requestId}:done`, handler);
      return () => electron.ipcRenderer.removeListener(`api:stream:${requestId}:done`, handler);
    },
    // 监听流式错误
    onStreamError: (requestId, callback) => {
      const handler = (_event, error) => callback(error);
      electron.ipcRenderer.on(`api:stream:${requestId}:error`, handler);
      return () => electron.ipcRenderer.removeListener(`api:stream:${requestId}:error`, handler);
    },
    // 监听流式取消
    onStreamAbort: (requestId, callback) => {
      const handler = () => callback();
      electron.ipcRenderer.on(`api:stream:${requestId}:abort`, handler);
      return () => electron.ipcRenderer.removeListener(`api:stream:${requestId}:abort`, handler);
    }
  },
  ipcRenderer: {
    send: (channel, ...args) => {
      electron.ipcRenderer.send(channel, ...args);
    },
    on: (channel, func) => {
      const handler = (_event, ...args) => func(...args);
      electron.ipcRenderer.on(channel, handler);
      return () => electron.ipcRenderer.removeListener(channel, handler);
    }
  },
  window: {
    minimize: () => electron.ipcRenderer.send("window-minimize"),
    toggleMaximize: () => electron.ipcRenderer.send("window-maximize"),
    close: () => electron.ipcRenderer.send("window-close"),
    isMaximized: () => electron.ipcRenderer.invoke("window:isMaximized"),
    showSystemMenu: (position) => electron.ipcRenderer.send("window:showSystemMenu", position),
    onStateChanged: (callback) => {
      const handler = (_event, state) => callback(state);
      electron.ipcRenderer.on("window:state-changed", handler);
      return () => electron.ipcRenderer.removeListener("window:state-changed", handler);
    }
  },
  getApiConfig: () => electron.ipcRenderer.invoke("get-api-config"),
  checkApiConfig: (options) => electron.ipcRenderer.invoke("check-api-config", options),
  saveApiConfig: (config) => electron.ipcRenderer.invoke("save-api-config", config),
  generateSessionTitle: (userInput) => electron.ipcRenderer.invoke("generate-session-title", userInput),
  getRecentCwds: (limit) => electron.ipcRenderer.invoke("get-recent-cwds", limit),
  dsh: {
    getState: () => electron.ipcRenderer.invoke(DshIpcChannel.GetState),
    getConfig: () => electron.ipcRenderer.invoke(DshIpcChannel.GetConfig),
    setEnabled: (enabled) => electron.ipcRenderer.invoke(DshIpcChannel.SetEnabled, enabled),
    openWorkbench: () => electron.ipcRenderer.invoke(DshIpcChannel.OpenWorkbench),
    stop: () => electron.ipcRenderer.invoke(DshIpcChannel.Stop)
  },
  openclaw: {
    engine: {
      getStatus: () => electron.ipcRenderer.invoke(OpenClawEngineIpc.GetStatus),
      install: () => electron.ipcRenderer.invoke(OpenClawEngineIpc.Install),
      retryInstall: () => electron.ipcRenderer.invoke(OpenClawEngineIpc.RetryInstall),
      restartGateway: () => electron.ipcRenderer.invoke(OpenClawEngineIpc.RestartGateway),
      repairGatewayState: () => electron.ipcRenderer.invoke(OpenClawEngineIpc.RepairGatewayState),
      onProgress: (callback) => {
        const handler = (_event, status) => callback(status);
        electron.ipcRenderer.on(OpenClawEngineIpc.OnProgress, handler);
        return () => electron.ipcRenderer.removeListener(OpenClawEngineIpc.OnProgress, handler);
      }
    },
    sessionPolicy: {
      get: () => electron.ipcRenderer.invoke(OpenClawSessionPolicyIpc.Get),
      set: (config) => electron.ipcRenderer.invoke(OpenClawSessionPolicyIpc.Set, config)
    },
    session: {
      patch: (options) => electron.ipcRenderer.invoke(OpenClawSessionIpc.Patch, options)
    },
    browser: {
      getStatus: (options) => electron.ipcRenderer.invoke(BrowserIpc.GetStatus, options),
      listProfiles: () => electron.ipcRenderer.invoke(BrowserIpc.ListProfiles),
      test: (options) => electron.ipcRenderer.invoke(BrowserIpc.Test, options),
      resetProfile: (options) => electron.ipcRenderer.invoke(BrowserIpc.ResetProfile, options),
      getHostState: (request) => electron.ipcRenderer.invoke(BrowserIpc.GetHostState, request),
      setHostView: (request) => electron.ipcRenderer.invoke(BrowserIpc.SetHostView, request),
      navigateHost: (request) => electron.ipcRenderer.invoke(BrowserIpc.NavigateHost, request),
      goBackHost: (request) => electron.ipcRenderer.invoke(BrowserIpc.GoBackHost, request),
      goForwardHost: (request) => electron.ipcRenderer.invoke(BrowserIpc.GoForwardHost, request),
      reloadHost: (request) => electron.ipcRenderer.invoke(BrowserIpc.ReloadHost, request),
      stopHost: (request) => electron.ipcRenderer.invoke(BrowserIpc.StopHost, request),
      selectHostPage: (request) => electron.ipcRenderer.invoke(BrowserIpc.SelectHostPage, request),
      closeHostPage: (request) => electron.ipcRenderer.invoke(BrowserIpc.CloseHostPage, request),
      resolveCredentialSavePrompt: (request) => electron.ipcRenderer.invoke(BrowserIpc.ResolveCredentialSavePrompt, request),
      onHostState: (callback) => {
        const handler = (_event, hostEvent) => callback(hostEvent);
        electron.ipcRenderer.on(BrowserIpc.HostState, handler);
        return () => electron.ipcRenderer.removeListener(BrowserIpc.HostState, handler);
      },
      credentials: {
        getAvailability: () => electron.ipcRenderer.invoke(BrowserCredentialIpc.GetAvailability),
        list: () => electron.ipcRenderer.invoke(BrowserCredentialIpc.List),
        save: (request) => electron.ipcRenderer.invoke(BrowserCredentialIpc.Save, request),
        delete: (request) => electron.ipcRenderer.invoke(BrowserCredentialIpc.Delete, request)
      }
    },
    dataMigration: {
      backup: () => electron.ipcRenderer.invoke(DataMigrationIpc.Backup),
      restore: () => electron.ipcRenderer.invoke(DataMigrationIpc.Restore),
      getLastRestoreResult: () => electron.ipcRenderer.invoke(DataMigrationIpc.GetLastRestoreResult)
    }
  },
  agents: {
    list: async () => {
      const result = await electron.ipcRenderer.invoke(AgentIpcChannel.List);
      return (result == null ? void 0 : result.success) ? result.agents : [];
    },
    get: async (id) => {
      const result = await electron.ipcRenderer.invoke(AgentIpcChannel.Get, id);
      return (result == null ? void 0 : result.success) ? result.agent : null;
    },
    create: async (request) => {
      const result = await electron.ipcRenderer.invoke(AgentIpcChannel.Create, request);
      return (result == null ? void 0 : result.success) ? result.agent : null;
    },
    update: async (id, updates) => {
      const result = await electron.ipcRenderer.invoke(AgentIpcChannel.Update, id, updates);
      return (result == null ? void 0 : result.success) ? result.agent : null;
    },
    reorder: async (agentIds) => {
      const result = await electron.ipcRenderer.invoke(AgentIpcChannel.Reorder, agentIds);
      return (result == null ? void 0 : result.success) ? result.agents : null;
    },
    cleanupLegacyIdentityBlock: async (id) => {
      const result = await electron.ipcRenderer.invoke(AgentIpcChannel.CleanupLegacyIdentityBlock, id);
      return (result == null ? void 0 : result.result) ?? {
        status: AgentLegacyIdentityCleanupStatus.Failed,
        error: (result == null ? void 0 : result.error) || "Failed to clean legacy identity block"
      };
    },
    delete: async (id) => {
      const result = await electron.ipcRenderer.invoke(AgentIpcChannel.Delete, id);
      return (result == null ? void 0 : result.success) ? result.deleted : false;
    },
    presets: async () => {
      const result = await electron.ipcRenderer.invoke(AgentIpcChannel.Presets);
      return (result == null ? void 0 : result.success) ? result.presets : [];
    },
    presetTemplates: async () => {
      const result = await electron.ipcRenderer.invoke(AgentIpcChannel.PresetTemplates);
      return (result == null ? void 0 : result.success) ? result.presets : [];
    },
    addPreset: async (presetId) => {
      const result = await electron.ipcRenderer.invoke(AgentIpcChannel.AddPreset, presetId);
      return (result == null ? void 0 : result.success) ? result.agent : null;
    }
  },
  connections: {
    connect: (id) => electron.ipcRenderer.invoke(ConnectionsIpcChannel.Connect, id),
    disconnect: (id) => electron.ipcRenderer.invoke(ConnectionsIpcChannel.Disconnect, id)
  },
  cowork: {
    // Session management
    startSession: (options) => electron.ipcRenderer.invoke("cowork:session:start", options),
    continueSession: (options) => electron.ipcRenderer.invoke("cowork:session:continue", options),
    submitBtw: (options) => electron.ipcRenderer.invoke(CoworkIpcChannel.SubmitBtw, options),
    abortBtw: (options) => electron.ipcRenderer.invoke(CoworkIpcChannel.AbortBtw, options),
    submitSteer: (options) => electron.ipcRenderer.invoke(CoworkIpcChannel.SubmitSteer, options),
    runGoalCommand: (options) => electron.ipcRenderer.invoke(CoworkIpcChannel.GoalCommand, options),
    stopSession: (sessionId) => electron.ipcRenderer.invoke(CoworkIpcChannel.StopSession, sessionId),
    deleteSession: (sessionId) => electron.ipcRenderer.invoke("cowork:session:delete", sessionId),
    deleteSessions: (sessionIds) => electron.ipcRenderer.invoke("cowork:session:deleteBatch", sessionIds),
    setSessionPinned: (options) => electron.ipcRenderer.invoke("cowork:session:pin", options),
    renameSession: (options) => electron.ipcRenderer.invoke("cowork:session:rename", options),
    forkSession: (options) => electron.ipcRenderer.invoke(CoworkIpcChannel.ForkSession, options),
    getSession: (sessionId) => electron.ipcRenderer.invoke("cowork:session:get", sessionId),
    markSessionViewed: (sessionId) => electron.ipcRenderer.invoke(CoworkIpcChannel.MarkSessionViewed, sessionId),
    setActiveSession: (sessionId) => electron.ipcRenderer.invoke(CoworkIpcChannel.SetActiveSession, sessionId),
    seedNewUserWelcomeTask: (options) => electron.ipcRenderer.invoke(CoworkIpcChannel.SeedNewUserWelcomeTask, options),
    notifyOpenSessionFromNotificationReady: () => electron.ipcRenderer.invoke(CoworkIpcChannel.OpenSessionFromNotificationReady),
    remoteManaged: (sessionId) => electron.ipcRenderer.invoke("cowork:session:remoteManaged", sessionId),
    listSessions: (options) => electron.ipcRenderer.invoke("cowork:session:list", options),
    getSessionMessages: (options) => electron.ipcRenderer.invoke("cowork:session:getMessages", options),
    getSessionSearchMessages: (options) => electron.ipcRenderer.invoke(CoworkIpcChannel.GetSessionSearchMessages, options),
    getSessionMessageRailIndex: (sessionId) => electron.ipcRenderer.invoke(CoworkIpcChannel.GetSessionMessageRailIndex, sessionId),
    getContextUsage: (sessionId) => electron.ipcRenderer.invoke("cowork:session:contextUsage", sessionId),
    compactContext: (sessionId) => electron.ipcRenderer.invoke("cowork:session:compactContext", sessionId),
    exportResultImage: (options) => electron.ipcRenderer.invoke("cowork:session:exportResultImage", options),
    captureImageChunk: (options) => electron.ipcRenderer.invoke("cowork:session:captureImageChunk", options),
    saveResultImage: (options) => electron.ipcRenderer.invoke("cowork:session:saveResultImage", options),
    exportSessionText: (options) => electron.ipcRenderer.invoke("cowork:session:exportText", options),
    exportSessionDiagnostics: (options) => electron.ipcRenderer.invoke(CoworkIpcChannel.ExportSessionDiagnostics, options),
    // Subagent tracking
    getSubTaskHistory: (options) => electron.ipcRenderer.invoke(CoworkIpcChannel.SubTaskHistory, options),
    listSubagentSessions: (parentSessionId) => electron.ipcRenderer.invoke(CoworkIpcChannel.SubagentList, { parentSessionId }),
    listSubagentSessionsByAgent: (options) => electron.ipcRenderer.invoke(CoworkIpcChannel.SubagentListByAgent, options),
    deleteSubagentSession: (options) => electron.ipcRenderer.invoke(CoworkIpcChannel.SubagentDelete, options),
    // Media task management
    cancelMediaTask: (taskId) => electron.ipcRenderer.invoke(CoworkIpcChannel.CancelMediaTask, taskId),
    // Permission handling
    respondToPermission: (options) => electron.ipcRenderer.invoke("cowork:permission:respond", options),
    // Configuration
    getConfig: () => electron.ipcRenderer.invoke("cowork:config:get"),
    setConfig: (config) => electron.ipcRenderer.invoke("cowork:config:set", config),
    // Session temp storage (.cowork-temp) maintenance
    getTempStorageUsage: () => electron.ipcRenderer.invoke(CoworkIpcChannel.TempStorageUsage),
    cleanTempStorage: (options) => electron.ipcRenderer.invoke(CoworkIpcChannel.TempStorageClean, options),
    // `agentId` is optional and means main when absent: every agent has
    // its own workspace and its own MEMORY.md, and the settings screens
    // that called these first only ever meant main.
    listMemoryEntries: (input) => electron.ipcRenderer.invoke("cowork:memory:listEntries", input),
    createMemoryEntry: (input) => electron.ipcRenderer.invoke("cowork:memory:createEntry", input),
    updateMemoryEntry: (input) => electron.ipcRenderer.invoke("cowork:memory:updateEntry", input),
    deleteMemoryEntry: (input) => electron.ipcRenderer.invoke("cowork:memory:deleteEntry", input),
    getMemoryStats: () => electron.ipcRenderer.invoke("cowork:memory:getStats"),
    readMemoryFileRaw: () => electron.ipcRenderer.invoke(CoworkIpcChannel.MemoryReadRaw),
    writeMemoryFileRaw: (input) => electron.ipcRenderer.invoke(CoworkIpcChannel.MemoryWriteRaw, input),
    getDreamingStatus: () => electron.ipcRenderer.invoke("cowork:dreaming:status"),
    getDreamDiary: () => electron.ipcRenderer.invoke("cowork:dreaming:diary"),
    readBootstrapFile: (filename, options) => electron.ipcRenderer.invoke(CoworkIpcChannel.BootstrapRead, filename, options),
    writeBootstrapFile: (filename, content, options) => electron.ipcRenderer.invoke(CoworkIpcChannel.BootstrapWrite, filename, content, options),
    // Stream event listeners
    onStreamMessage: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("cowork:stream:message", handler);
      return () => electron.ipcRenderer.removeListener("cowork:stream:message", handler);
    },
    onStreamMessageUpdate: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("cowork:stream:messageUpdate", handler);
      return () => electron.ipcRenderer.removeListener("cowork:stream:messageUpdate", handler);
    },
    onMediaStatusPollUpdate: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on(CoworkIpcChannel.MediaStatusPollUpdate, handler);
      return () => electron.ipcRenderer.removeListener(CoworkIpcChannel.MediaStatusPollUpdate, handler);
    },
    onStreamSessionStatus: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("cowork:stream:sessionStatus", handler);
      return () => electron.ipcRenderer.removeListener("cowork:stream:sessionStatus", handler);
    },
    onStreamContextUsage: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("cowork:stream:contextUsage", handler);
      return () => electron.ipcRenderer.removeListener("cowork:stream:contextUsage", handler);
    },
    onStreamGoal: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on(CoworkIpcChannel.StreamGoal, handler);
      return () => electron.ipcRenderer.removeListener(CoworkIpcChannel.StreamGoal, handler);
    },
    onStreamBtwResult: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on(CoworkIpcChannel.StreamBtwResult, handler);
      return () => electron.ipcRenderer.removeListener(CoworkIpcChannel.StreamBtwResult, handler);
    },
    onStreamContextMaintenance: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("cowork:stream:contextMaintenance", handler);
      return () => electron.ipcRenderer.removeListener("cowork:stream:contextMaintenance", handler);
    },
    onStreamPermission: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("cowork:stream:permission", handler);
      return () => electron.ipcRenderer.removeListener("cowork:stream:permission", handler);
    },
    onStreamPermissionDismiss: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("cowork:stream:permissionDismiss", handler);
      return () => electron.ipcRenderer.removeListener("cowork:stream:permissionDismiss", handler);
    },
    onStreamComplete: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("cowork:stream:complete", handler);
      return () => electron.ipcRenderer.removeListener("cowork:stream:complete", handler);
    },
    onStreamError: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("cowork:stream:error", handler);
      return () => electron.ipcRenderer.removeListener("cowork:stream:error", handler);
    },
    onSessionsChanged: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on(CoworkIpcChannel.SessionsChanged, handler);
      return () => electron.ipcRenderer.removeListener(CoworkIpcChannel.SessionsChanged, handler);
    },
    onSessionModelOverrideChanged: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on(CoworkIpcChannel.SessionModelOverrideChanged, handler);
      return () => electron.ipcRenderer.removeListener(CoworkIpcChannel.SessionModelOverrideChanged, handler);
    },
    onOpenSessionFromNotification: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on(CoworkIpcChannel.OpenSessionFromNotification, handler);
      return () => electron.ipcRenderer.removeListener(CoworkIpcChannel.OpenSessionFromNotification, handler);
    }
  },
  dialog: {
    selectDirectory: () => electron.ipcRenderer.invoke("dialog:selectDirectory"),
    selectFile: (options) => electron.ipcRenderer.invoke("dialog:selectFile", options),
    selectFiles: (options) => electron.ipcRenderer.invoke("dialog:selectFiles", options),
    getPathForFile: (file) => electron.webUtils.getPathForFile(file),
    saveInlineFile: (options) => electron.ipcRenderer.invoke("dialog:saveInlineFile", options),
    readFileAsDataUrl: (filePath) => electron.ipcRenderer.invoke("dialog:readFileAsDataUrl", filePath),
    statFile: (filePath) => electron.ipcRenderer.invoke(DialogIpc.StatFile, filePath),
    readTextFile: (filePath) => electron.ipcRenderer.invoke(DialogIpc.ReadTextFile, filePath),
    saveFileCopy: (filePath) => electron.ipcRenderer.invoke(DialogIpc.SaveFileCopy, filePath),
    generateThumbnail: (request) => electron.ipcRenderer.invoke(DialogIpc.GenerateThumbnail, request),
    cancelThumbnail: (requestId) => electron.ipcRenderer.invoke(DialogIpc.CancelThumbnail, requestId),
    showMessageBox: (options) => electron.ipcRenderer.invoke("dialog:showMessageBox", options)
  },
  /**
   * The card that asks the person to type something.
   *
   * Deliberately its own surface rather than part of `cowork`: what goes
   * through here is a password or a code, and it must not get folded into
   * the message plumbing by a later refactor. Nothing here reads a value
   * back — `respond` is one way, renderer to main.
   */
  /** Projects: a folder, the agents in it, and what they share. */
  projects: {
    list: () => electron.ipcRenderer.invoke(ProjectIpc.List),
    create: (name, memberIds, folder) => electron.ipcRenderer.invoke(ProjectIpc.Create, name, memberIds, folder),
    update: (id, changes) => electron.ipcRenderer.invoke(ProjectIpc.Update, id, changes),
    remove: (id) => electron.ipcRenderer.invoke(ProjectIpc.Delete, id)
  },
  /** Rooms: a conversation with more than one agent in it. */
  rooms: {
    list: () => electron.ipcRenderer.invoke(RoomIpc.List),
    create: (name, memberIds) => electron.ipcRenderer.invoke(RoomIpc.Create, name, memberIds),
    update: (id, changes) => electron.ipcRenderer.invoke(RoomIpc.Update, id, changes),
    remove: (id) => electron.ipcRenderer.invoke(RoomIpc.Delete, id)
  },
  /** The agent's tapback on the person's message, from `ReactToMessage`. */
  reactions: {
    onAgent: (callback) => {
      const handler = (_event, reaction) => callback(reaction);
      electron.ipcRenderer.on(ReactionIpc.Agent, handler);
      return () => electron.ipcRenderer.removeListener(ReactionIpc.Agent, handler);
    }
  },
  askInput: {
    onRequested: (callback) => {
      const handler = (_event, request) => callback(request);
      electron.ipcRenderer.on(AskInputIpc.Requested, handler);
      return () => electron.ipcRenderer.removeListener(AskInputIpc.Requested, handler);
    },
    onDismissed: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on(AskInputIpc.Dismissed, handler);
      return () => electron.ipcRenderer.removeListener(AskInputIpc.Dismissed, handler);
    },
    respond: (requestId, response) => electron.ipcRenderer.invoke(AskInputIpc.Respond, requestId, response)
  },
  createAgent: {
    onRequested: (callback) => {
      const handler = (_event, ask) => callback(ask);
      electron.ipcRenderer.on(CreateAgentIpc.Requested, handler);
      return () => electron.ipcRenderer.removeListener(CreateAgentIpc.Requested, handler);
    },
    onDismissed: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on(CreateAgentIpc.Dismissed, handler);
      return () => electron.ipcRenderer.removeListener(CreateAgentIpc.Dismissed, handler);
    },
    onCreated: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on(CreateAgentIpc.Created, handler);
      return () => electron.ipcRenderer.removeListener(CreateAgentIpc.Created, handler);
    },
    respond: (requestId, answer) => electron.ipcRenderer.invoke(CreateAgentIpc.Respond, requestId, answer)
  },
  roster: {
    onRequested: (callback) => {
      const handler = (_event, ask) => callback(ask);
      electron.ipcRenderer.on(RosterIpc.Requested, handler);
      return () => electron.ipcRenderer.removeListener(RosterIpc.Requested, handler);
    },
    onDismissed: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on(RosterIpc.Dismissed, handler);
      return () => electron.ipcRenderer.removeListener(RosterIpc.Dismissed, handler);
    },
    respond: (requestId, answer) => electron.ipcRenderer.invoke(RosterIpc.Respond, requestId, answer)
  },
  proposeConnector: {
    onRequested: (callback) => {
      const handler = (_event, ask) => callback(ask);
      electron.ipcRenderer.on(ProposeConnectorIpc.Requested, handler);
      return () => electron.ipcRenderer.removeListener(ProposeConnectorIpc.Requested, handler);
    },
    onDismissed: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on(ProposeConnectorIpc.Dismissed, handler);
      return () => electron.ipcRenderer.removeListener(ProposeConnectorIpc.Dismissed, handler);
    },
    respond: (requestId, answer) => electron.ipcRenderer.invoke(ProposeConnectorIpc.Respond, requestId, answer)
  },
  settings: {
    getExecPolicy: () => electron.ipcRenderer.invoke(SettingsChannel.GetExecPolicy),
    setExecPolicy: (policy) => electron.ipcRenderer.invoke(SettingsChannel.SetExecPolicy, policy)
  },
  shell: {
    openPath: (filePath) => electron.ipcRenderer.invoke(ShellIpc.OpenPath, filePath),
    showItemInFolder: (filePath) => electron.ipcRenderer.invoke(ShellIpc.ShowItemInFolder, filePath),
    openExternal: (url) => electron.ipcRenderer.invoke(ShellIpc.OpenExternal, url),
    openHtmlInBrowser: (htmlContent) => electron.ipcRenderer.invoke(ShellIpc.OpenHtmlInBrowser, htmlContent),
    getAppsForFile: (filePath) => electron.ipcRenderer.invoke(ShellIpc.GetAppsForFile, filePath),
    getBrowserApps: (options) => electron.ipcRenderer.invoke(ShellIpc.GetBrowserApps, options),
    openPathWithApp: (filePath, appPath) => electron.ipcRenderer.invoke(ShellIpc.OpenPathWithApp, filePath, appPath),
    openUrlWithApp: (url, appPath) => electron.ipcRenderer.invoke(ShellIpc.OpenUrlWithApp, url, appPath)
  },
  clipboard: {
    writeText: (text) => electron.ipcRenderer.invoke(ClipboardIpc.WriteText, text),
    writeImageFromFile: (filePath) => electron.ipcRenderer.invoke(ClipboardIpc.WriteImageFromFile, filePath),
    writeImageFromDataUrl: (dataUrl) => electron.ipcRenderer.invoke(ClipboardIpc.WriteImageFromDataUrl, dataUrl)
  },
  htmlShare: {
    createFromHtmlFile: (options) => electron.ipcRenderer.invoke(HtmlShareIpc.CreateFromHtmlFile, options),
    updateFromHtmlFile: (options) => electron.ipcRenderer.invoke(HtmlShareIpc.UpdateFromHtmlFile, options),
    getByHtmlFile: (options) => electron.ipcRenderer.invoke(HtmlShareIpc.GetByHtmlFile, options),
    createFromArtifactFile: (options) => electron.ipcRenderer.invoke(HtmlShareIpc.CreateFromArtifactFile, options),
    updateFromArtifactFile: (options) => electron.ipcRenderer.invoke(HtmlShareIpc.UpdateFromArtifactFile, options),
    getByArtifactFile: (options) => electron.ipcRenderer.invoke(HtmlShareIpc.GetByArtifactFile, options),
    createFromGeneratedVideo: (options) => electron.ipcRenderer.invoke(HtmlShareIpc.CreateFromGeneratedVideo, options),
    getGeneratedVideoSource: (options) => electron.ipcRenderer.invoke(HtmlShareIpc.GetGeneratedVideoSource, options),
    resolveLegacyGeneratedVideoSource: (options) => electron.ipcRenderer.invoke(HtmlShareIpc.ResolveLegacyGeneratedVideoSource, options),
    getBySource: (options) => electron.ipcRenderer.invoke(HtmlShareIpc.GetBySource, options),
    updateStatus: (options) => electron.ipcRenderer.invoke(HtmlShareIpc.UpdateStatus, options),
    updateAccessMode: (options) => electron.ipcRenderer.invoke(HtmlShareIpc.UpdateAccessMode, options),
    disable: (shareId) => electron.ipcRenderer.invoke(HtmlShareIpc.Disable, shareId),
    deletePermanently: (shareId) => electron.ipcRenderer.invoke(HtmlShareIpc.DeletePermanently, shareId),
    get: (shareId) => electron.ipcRenderer.invoke(HtmlShareIpc.Get, shareId),
    getQuota: () => electron.ipcRenderer.invoke(HtmlShareIpc.GetQuota),
    getTrialPolicy: () => electron.ipcRenderer.invoke(HtmlShareIpc.GetTrialPolicy),
    getAnalytics: (options) => electron.ipcRenderer.invoke(HtmlShareIpc.GetAnalytics, options)
  },
  shareDeployment: {
    detectProjectCandidates: (options) => electron.ipcRenderer.invoke(ShareDeploymentIpc.DetectProjectCandidates, options),
    analyzeProjectDirectory: (options) => electron.ipcRenderer.invoke(ShareDeploymentIpc.AnalyzeProjectDirectory, options),
    selectPersistencePath: (options) => electron.ipcRenderer.invoke(ShareDeploymentIpc.SelectPersistencePath, options),
    createNodeDeployment: (options) => electron.ipcRenderer.invoke(ShareDeploymentIpc.CreateNodeDeployment, options),
    get: (deploymentId) => electron.ipcRenderer.invoke(ShareDeploymentIpc.Get, deploymentId),
    getByLocalService: (options) => electron.ipcRenderer.invoke(ShareDeploymentIpc.GetByLocalService, options),
    getPersistence: (deploymentId) => electron.ipcRenderer.invoke(ShareDeploymentIpc.GetPersistence, deploymentId),
    downloadPersistenceArchive: (options) => electron.ipcRenderer.invoke(ShareDeploymentIpc.DownloadPersistenceArchive, options)
  },
  sites: {
    list: (options = {}) => electron.ipcRenderer.invoke(SiteIpc.List, options),
    get: (shareId) => electron.ipcRenderer.invoke(SiteIpc.Get, shareId),
    updateTitle: (input) => electron.ipcRenderer.invoke(SiteIpc.UpdateTitle, input),
    updateAccessMode: (input) => electron.ipcRenderer.invoke(SiteIpc.UpdateAccessMode, input),
    updateAccessStatus: (input) => electron.ipcRenderer.invoke(SiteIpc.UpdateAccessStatus, input),
    delete: (shareId) => electron.ipcRenderer.invoke(SiteIpc.Delete, shareId),
    getAnalytics: (shareId, options = {}) => electron.ipcRenderer.invoke(SiteIpc.GetAnalytics, shareId, options),
    getDeploymentQuota: (options = {}) => electron.ipcRenderer.invoke(SiteIpc.GetDeploymentQuota, options),
    createQuotaReservation: (input) => electron.ipcRenderer.invoke(SiteIpc.CreateQuotaReservation, input),
    releaseQuotaReservation: (reservationId) => electron.ipcRenderer.invoke(SiteIpc.ReleaseQuotaReservation, reservationId)
  },
  library: {
    listLocal: (options = {}) => electron.ipcRenderer.invoke(LibraryIpc.ListLocal, options),
    listCloud: (options = {}) => electron.ipcRenderer.invoke(LibraryIpc.ListCloud, options),
    getLocalItems: (input) => electron.ipcRenderer.invoke(LibraryIpc.GetLocalItems, input),
    getLocalDetail: (itemId) => electron.ipcRenderer.invoke(LibraryIpc.GetLocalDetail, itemId),
    recordCandidates: (candidates) => electron.ipcRenderer.invoke(LibraryIpc.RecordCandidates, candidates),
    addLocalFiles: (filePaths) => electron.ipcRenderer.invoke(LibraryIpc.AddLocalFiles, filePaths),
    setFavorite: (input) => electron.ipcRenderer.invoke(LibraryIpc.SetFavorite, input),
    openLocal: (itemId) => electron.ipcRenderer.invoke(LibraryIpc.OpenLocal, itemId),
    revealLocal: (itemId) => electron.ipcRenderer.invoke(LibraryIpc.RevealLocal, itemId),
    repairIndex: () => electron.ipcRenderer.invoke(LibraryIpc.RepairIndex),
    getIndexStatus: () => electron.ipcRenderer.invoke(LibraryIpc.GetIndexStatus),
    getBackfillState: () => electron.ipcRenderer.invoke(LibraryIpc.GetBackfillState),
    setBackfillState: (state) => electron.ipcRenderer.invoke(LibraryIpc.SetBackfillState, state),
    onChanged: (callback) => {
      const handler = (_event, payload) => {
        callback(payload);
      };
      electron.ipcRenderer.on(LibraryIpc.Changed, handler);
      return () => electron.ipcRenderer.removeListener(LibraryIpc.Changed, handler);
    }
  },
  asr: {
    createRealtimeSession: (options) => electron.ipcRenderer.invoke(AsrIpcChannel.CreateRealtimeSession, options)
  },
  speech: {
    status: () => electron.ipcRenderer.invoke(SpeechIpc.Status),
    start: () => electron.ipcRenderer.invoke(SpeechIpc.Start),
    chunk: (sessionId, pcm16) => {
      electron.ipcRenderer.send(SpeechIpc.Chunk, sessionId, pcm16);
    },
    stop: (sessionId) => electron.ipcRenderer.invoke(SpeechIpc.Stop, sessionId),
    cancel: (sessionId) => electron.ipcRenderer.invoke(SpeechIpc.Cancel, sessionId),
    onEvent: (callback) => {
      const handler = (_event, speechEvent) => callback(speechEvent);
      electron.ipcRenderer.on(SpeechIpc.Event, handler);
      return () => electron.ipcRenderer.removeListener(SpeechIpc.Event, handler);
    }
  },
  onboarding: {
    status: () => electron.ipcRenderer.invoke(OnboardingIpc.Status),
    runTask: (task) => electron.ipcRenderer.invoke(OnboardingIpc.RunTask, task),
    openResult: (task, ref) => electron.ipcRenderer.invoke(OnboardingIpc.OpenResult, task, ref)
  },
  artifact: {
    watchFile: (filePath) => electron.ipcRenderer.invoke("artifact:watchFile", filePath),
    unwatchFile: (filePath) => electron.ipcRenderer.invoke("artifact:unwatchFile", filePath),
    onFileChanged: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("artifact:file:changed", handler);
      return () => {
        electron.ipcRenderer.removeListener("artifact:file:changed", handler);
      };
    },
    createPreviewSession: (filePath) => electron.ipcRenderer.invoke(ArtifactPreviewIpc.CreateSession, filePath),
    createOfficePreviewSession: (filePath) => electron.ipcRenderer.invoke(ArtifactPreviewIpc.CreateOfficeSession, filePath),
    destroyPreviewSession: (sessionId) => electron.ipcRenderer.invoke(ArtifactPreviewIpc.DestroySession, sessionId),
    clearBrowserCookies: async () => {
      try {
        return await electron.ipcRenderer.invoke(ArtifactPreviewIpc.ClearBrowserCookies);
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    clearBrowserCache: async () => {
      try {
        return await electron.ipcRenderer.invoke(ArtifactPreviewIpc.ClearBrowserCache);
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    saveBrowserAnnotationAsset: (input) => electron.ipcRenderer.invoke(ArtifactPreviewIpc.SaveBrowserAnnotationAsset, input),
    readBrowserAnnotationAsset: (input) => electron.ipcRenderer.invoke(ArtifactPreviewIpc.ReadBrowserAnnotationAsset, input),
    deleteBrowserAnnotationAsset: (input) => electron.ipcRenderer.invoke(ArtifactPreviewIpc.DeleteBrowserAnnotationAsset, input),
    deleteBrowserAnnotationBatchAssets: (input) => electron.ipcRenderer.invoke(ArtifactPreviewIpc.DeleteBrowserAnnotationBatchAssets, input),
    listLocalWebServices: (options) => electron.ipcRenderer.invoke(LocalWebServicesIpc.List, options)
  },
  autoLaunch: {
    get: () => electron.ipcRenderer.invoke(AppSettingsIpc.GetAutoLaunch),
    set: (enabled) => electron.ipcRenderer.invoke(AppSettingsIpc.SetAutoLaunch, enabled)
  },
  preventSleep: {
    get: () => electron.ipcRenderer.invoke(AppSettingsIpc.GetPreventSleep),
    set: (enabled) => electron.ipcRenderer.invoke(AppSettingsIpc.SetPreventSleep, enabled)
  },
  appInfo: {
    getVersion: () => electron.ipcRenderer.invoke("app:getVersion"),
    getBuildInfo: () => electron.ipcRenderer.invoke("app:getBuildInfo"),
    getComputerName: () => electron.ipcRenderer.invoke("app:getComputerName"),
    getSystemLocale: () => electron.ipcRenderer.invoke("app:getSystemLocale"),
    getKeyfromAttribution: () => electron.ipcRenderer.invoke(AppIpcChannel.GetKeyfromAttribution),
    relaunch: () => electron.ipcRenderer.invoke("app:relaunch"),
    openSystemNotificationSettings: () => electron.ipcRenderer.invoke(AppIpcChannel.OpenSystemNotificationSettings)
  },
  activity: {
    getSlot: (input) => electron.ipcRenderer.invoke(ActivityIpc.HostGetSlot, input),
    getContext: (input) => electron.ipcRenderer.invoke(ActivityIpc.HostGetContext, input),
    executeAction: (input) => electron.ipcRenderer.invoke(ActivityIpc.HostExecuteAction, input)
  },
  appUpdate: {
    getState: () => electron.ipcRenderer.invoke(AppUpdateIpc.GetState),
    checkNow: (options) => electron.ipcRenderer.invoke(AppUpdateIpc.CheckNow, options),
    retryDownload: () => electron.ipcRenderer.invoke(AppUpdateIpc.RetryDownload),
    installReady: () => electron.ipcRenderer.invoke(AppUpdateIpc.InstallReady),
    getCompletedUpdate: () => electron.ipcRenderer.invoke(AppUpdateIpc.GetCompletedUpdate),
    getActiveWorkloads: () => electron.ipcRenderer.invoke(AppUpdateIpc.GetActiveWorkloads),
    onStateChanged: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on(AppUpdateIpc.StateChanged, handler);
      return () => electron.ipcRenderer.removeListener(AppUpdateIpc.StateChanged, handler);
    }
  },
  plugins: {
    list: () => electron.ipcRenderer.invoke("plugins:list"),
    detect: () => electron.ipcRenderer.invoke("plugins:detect"),
    sync: () => electron.ipcRenderer.invoke("plugins:sync"),
    install: (params) => electron.ipcRenderer.invoke("plugins:install", params),
    uninstall: (pluginId) => electron.ipcRenderer.invoke("plugins:uninstall", pluginId),
    setEnabled: (pluginId, enabled) => electron.ipcRenderer.invoke("plugins:set-enabled", pluginId, enabled),
    getConfigSchema: (pluginId) => electron.ipcRenderer.invoke("plugins:get-config-schema", pluginId),
    saveConfig: (pluginId, config) => electron.ipcRenderer.invoke("plugins:save-config", pluginId, config),
    batchSave: (changes) => electron.ipcRenderer.invoke("plugins:batch-save", changes),
    checkUpdates: (pluginIds) => electron.ipcRenderer.invoke("plugins:check-updates", pluginIds),
    update: (pluginId) => electron.ipcRenderer.invoke("plugins:update", pluginId),
    onInstallLog: (callback) => {
      const handler = (_event, line) => callback(line);
      electron.ipcRenderer.on("plugins:install-log", handler);
      return () => electron.ipcRenderer.removeListener("plugins:install-log", handler);
    }
  },
  log: {
    getPath: () => electron.ipcRenderer.invoke("log:getPath"),
    openFolder: () => electron.ipcRenderer.invoke("log:openFolder"),
    exportZip: () => electron.ipcRenderer.invoke("log:exportZip"),
    fromRenderer: (level, tag, message) => electron.ipcRenderer.send("log:fromRenderer", level, tag, message)
  },
  im: {
    // Configuration
    getConfig: () => electron.ipcRenderer.invoke("im:config:get"),
    setConfig: (config, options) => electron.ipcRenderer.invoke("im:config:set", config, options),
    syncConfig: () => electron.ipcRenderer.invoke("im:config:sync"),
    // Gateway control
    startGateway: (platform) => electron.ipcRenderer.invoke("im:gateway:start", platform),
    stopGateway: (platform) => electron.ipcRenderer.invoke("im:gateway:stop", platform),
    testGateway: (platform, configOverride) => electron.ipcRenderer.invoke("im:gateway:test", platform, configOverride),
    // Status
    getStatus: () => electron.ipcRenderer.invoke("im:status:get"),
    getLocalIp: () => electron.ipcRenderer.invoke("im:getLocalIp"),
    // OpenClaw config schema
    getOpenClawConfigSchema: () => electron.ipcRenderer.invoke("im:openclaw:config-schema"),
    // Weixin QR login
    weixinQrLoginStart: () => electron.ipcRenderer.invoke("im:weixin:qr-login-start"),
    weixinQrLoginWait: (sessionKey) => electron.ipcRenderer.invoke("im:weixin:qr-login-wait", sessionKey),
    // POPO QR login
    popoQrLoginStart: () => electron.ipcRenderer.invoke("im:popo:qr-login-start"),
    popoQrLoginPoll: (taskToken) => electron.ipcRenderer.invoke("im:popo:qr-login-poll", taskToken),
    // POPO Multi-Instance
    addPopoInstance: (name) => electron.ipcRenderer.invoke("im:popo:instance:add", name),
    deletePopoInstance: (instanceId) => electron.ipcRenderer.invoke("im:popo:instance:delete", instanceId),
    setPopoInstanceConfig: (instanceId, config, options) => electron.ipcRenderer.invoke("im:popo:instance:config:set", instanceId, config, options),
    // Pairing
    listPairingRequests: (platform) => electron.ipcRenderer.invoke("im:pairing:list", platform),
    approvePairingCode: (platform, code) => electron.ipcRenderer.invoke("im:pairing:approve", platform, code),
    rejectPairingRequest: (platform, code) => electron.ipcRenderer.invoke("im:pairing:reject", platform, code),
    // DingTalk Multi-Instance
    addDingTalkInstance: (name) => electron.ipcRenderer.invoke("im:dingtalk:instance:add", name),
    deleteDingTalkInstance: (instanceId) => electron.ipcRenderer.invoke("im:dingtalk:instance:delete", instanceId),
    setDingTalkInstanceConfig: (instanceId, config, options) => electron.ipcRenderer.invoke("im:dingtalk:instance:config:set", instanceId, config, options),
    // NIM Multi-Instance
    addNimInstance: (name) => electron.ipcRenderer.invoke("im:nim:instance:add", name),
    deleteNimInstance: (instanceId) => electron.ipcRenderer.invoke("im:nim:instance:delete", instanceId),
    setNimInstanceConfig: (instanceId, config, options) => electron.ipcRenderer.invoke("im:nim:instance:config:set", instanceId, config, options),
    nimQrLoginStart: () => electron.ipcRenderer.invoke(NimQrLoginIpc.Start),
    nimQrLoginPoll: (uuid) => electron.ipcRenderer.invoke(NimQrLoginIpc.Poll, uuid),
    // QQ Multi-Instance
    addQQInstance: (name) => electron.ipcRenderer.invoke("im:qq:instance:add", name),
    deleteQQInstance: (instanceId) => electron.ipcRenderer.invoke("im:qq:instance:delete", instanceId),
    setQQInstanceConfig: (instanceId, config, options) => electron.ipcRenderer.invoke("im:qq:instance:config:set", instanceId, config, options),
    // Feishu Multi-Instance
    addFeishuInstance: (name) => electron.ipcRenderer.invoke("im:feishu:instance:add", name),
    deleteFeishuInstance: (instanceId) => electron.ipcRenderer.invoke("im:feishu:instance:delete", instanceId),
    setFeishuInstanceConfig: (instanceId, config, options) => electron.ipcRenderer.invoke("im:feishu:instance:config:set", instanceId, config, options),
    // Email Multi-Instance
    addEmailInstance: (name) => electron.ipcRenderer.invoke("im:email:instance:add", name),
    deleteEmailInstance: (instanceId) => electron.ipcRenderer.invoke("im:email:instance:delete", instanceId),
    setEmailInstanceConfig: (instanceId, config, options) => electron.ipcRenderer.invoke("im:email:instance:config:set", instanceId, config, options),
    // WeCom Multi-Instance
    addWecomInstance: (name) => electron.ipcRenderer.invoke("im:wecom:instance:add", name),
    deleteWecomInstance: (instanceId) => electron.ipcRenderer.invoke("im:wecom:instance:delete", instanceId),
    setWecomInstanceConfig: (instanceId, config, options) => electron.ipcRenderer.invoke("im:wecom:instance:config:set", instanceId, config, options),
    // Telegram Multi-Instance
    addTelegramInstance: (name) => electron.ipcRenderer.invoke("im:telegram:instance:add", name),
    deleteTelegramInstance: (instanceId) => electron.ipcRenderer.invoke("im:telegram:instance:delete", instanceId),
    setTelegramInstanceConfig: (instanceId, config, options) => electron.ipcRenderer.invoke("im:telegram:instance:config:set", instanceId, config, options),
    // Discord Multi-Instance
    addDiscordInstance: (name) => electron.ipcRenderer.invoke("im:discord:instance:add", name),
    deleteDiscordInstance: (instanceId) => electron.ipcRenderer.invoke("im:discord:instance:delete", instanceId),
    setDiscordInstanceConfig: (instanceId, config, options) => electron.ipcRenderer.invoke("im:discord:instance:config:set", instanceId, config, options),
    // Event listeners
    onStatusChange: (callback) => {
      const handler = (_event, status) => callback(status);
      electron.ipcRenderer.on("im:status:change", handler);
      return () => electron.ipcRenderer.removeListener("im:status:change", handler);
    },
    onMessageReceived: (callback) => {
      const handler = (_event, message) => callback(message);
      electron.ipcRenderer.on("im:message:received", handler);
      return () => electron.ipcRenderer.removeListener("im:message:received", handler);
    }
  },
  scheduledTasks: {
    // Task CRUD
    list: () => electron.ipcRenderer.invoke(IpcChannel.List),
    get: (id) => electron.ipcRenderer.invoke(IpcChannel.Get, id),
    create: (input) => electron.ipcRenderer.invoke(IpcChannel.Create, input),
    update: (id, input) => electron.ipcRenderer.invoke(IpcChannel.Update, id, input),
    delete: (id) => electron.ipcRenderer.invoke(IpcChannel.Delete, id),
    toggle: (id, enabled) => electron.ipcRenderer.invoke(IpcChannel.Toggle, id, enabled),
    // Execution
    runManually: (id) => electron.ipcRenderer.invoke(IpcChannel.RunManually, id),
    stop: (id) => electron.ipcRenderer.invoke(IpcChannel.Stop, id),
    // Run history
    listRuns: (taskId, limit, offset, filter) => electron.ipcRenderer.invoke(IpcChannel.ListRuns, taskId, limit, offset, filter),
    countRuns: (taskId) => electron.ipcRenderer.invoke(IpcChannel.CountRuns, taskId),
    listAllRuns: (limit, offset, filter) => electron.ipcRenderer.invoke(IpcChannel.ListAllRuns, limit, offset, filter),
    resolveSession: (input) => electron.ipcRenderer.invoke(IpcChannel.ResolveSession, input),
    // Delivery channels
    listChannels: () => electron.ipcRenderer.invoke(IpcChannel.ListChannels),
    listChannelConversations: (channel, accountId, filterAccountId) => electron.ipcRenderer.invoke(
      IpcChannel.ListChannelConversations,
      channel,
      accountId,
      filterAccountId
    ),
    // Stream event listeners
    onStatusUpdate: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on(IpcChannel.StatusUpdate, handler);
      return () => electron.ipcRenderer.removeListener(IpcChannel.StatusUpdate, handler);
    },
    onRunUpdate: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on(IpcChannel.RunUpdate, handler);
      return () => electron.ipcRenderer.removeListener(IpcChannel.RunUpdate, handler);
    },
    onRefresh: (callback) => {
      const handler = () => callback();
      electron.ipcRenderer.on(IpcChannel.Refresh, handler);
      return () => electron.ipcRenderer.removeListener(IpcChannel.Refresh, handler);
    }
  },
  networkStatus: {
    send: (status) => electron.ipcRenderer.send("network:status-change", status)
  },
  auth: {
    login: (loginUrl) => electron.ipcRenderer.invoke(AuthIpcChannel.Login, { loginUrl }),
    exchange: (code) => electron.ipcRenderer.invoke(AuthIpcChannel.Exchange, { code }),
    getUser: () => electron.ipcRenderer.invoke(AuthIpcChannel.GetUser),
    getQuota: () => electron.ipcRenderer.invoke(AuthIpcChannel.GetQuota),
    logout: () => electron.ipcRenderer.invoke(AuthIpcChannel.Logout),
    refreshToken: () => electron.ipcRenderer.invoke(AuthIpcChannel.RefreshToken),
    getAccessToken: () => electron.ipcRenderer.invoke(AuthIpcChannel.GetAccessToken),
    getModels: () => electron.ipcRenderer.invoke(AuthIpcChannel.GetModels),
    getPricingCatalog: () => electron.ipcRenderer.invoke(AuthIpcChannel.GetPricingCatalog),
    getProfileSummary: () => electron.ipcRenderer.invoke(AuthIpcChannel.GetProfileSummary),
    claimCreditsFinalReward: (campaignCode) => electron.ipcRenderer.invoke(AuthIpcChannel.ClaimCreditsFinalReward, { campaignCode }),
    getActiveClientBanner: () => electron.ipcRenderer.invoke(AuthIpcChannel.GetActiveClientBanner),
    getActiveClientBanners: () => electron.ipcRenderer.invoke(AuthIpcChannel.GetActiveClientBanners),
    getClientBannerSnapshot: () => electron.ipcRenderer.invoke(AuthIpcChannel.GetClientBannerSnapshot),
    getPendingCallback: () => electron.ipcRenderer.invoke(AuthIpcChannel.GetPendingCallback),
    onCallback: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on(AuthIpcChannel.Callback, handler);
      return () => electron.ipcRenderer.removeListener(AuthIpcChannel.Callback, handler);
    },
    onQuotaChanged: (callback) => {
      const handler = () => callback();
      electron.ipcRenderer.on(AuthIpcChannel.QuotaChanged, handler);
      return () => electron.ipcRenderer.removeListener(AuthIpcChannel.QuotaChanged, handler);
    },
    onSessionChanged: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on(AuthIpcChannel.SessionChanged, handler);
      return () => electron.ipcRenderer.removeListener(AuthIpcChannel.SessionChanged, handler);
    },
    onLifecycleEvent: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on(AuthIpcChannel.LifecycleEvent, handler);
      return () => electron.ipcRenderer.removeListener(AuthIpcChannel.LifecycleEvent, handler);
    }
  },
  media: {
    getModels: (type) => electron.ipcRenderer.invoke(CoworkIpcChannel.GetMediaModels, type),
    getTaskStatus: (taskId, type) => electron.ipcRenderer.invoke("media:getTaskStatus", taskId, type)
  },
  feishu: {
    install: {
      qrcode: (isLark) => electron.ipcRenderer.invoke("feishu:install:qrcode", { isLark }),
      poll: (deviceCode) => electron.ipcRenderer.invoke("feishu:install:poll", { deviceCode }),
      verify: (appId, appSecret) => electron.ipcRenderer.invoke("feishu:install:verify", { appId, appSecret })
    }
  },
  dingtalk: {
    install: {
      qrcode: () => electron.ipcRenderer.invoke("dingtalk:install:qrcode"),
      poll: (deviceCode) => electron.ipcRenderer.invoke("dingtalk:install:poll", { deviceCode }),
      verify: (clientId, clientSecret) => electron.ipcRenderer.invoke("dingtalk:install:verify", { clientId, clientSecret })
    }
  },
  githubCopilot: {
    requestDeviceCode: () => electron.ipcRenderer.invoke("github-copilot:request-device-code"),
    pollForToken: (deviceCode, interval, expiresIn) => electron.ipcRenderer.invoke("github-copilot:poll-for-token", {
      deviceCode,
      interval,
      expiresIn
    }),
    cancelPolling: () => electron.ipcRenderer.invoke("github-copilot:cancel-polling"),
    signOut: () => electron.ipcRenderer.invoke("github-copilot:sign-out"),
    refreshToken: () => electron.ipcRenderer.invoke("github-copilot:refresh-token"),
    onTokenUpdated: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("github-copilot:token-updated", handler);
      return () => electron.ipcRenderer.removeListener("github-copilot:token-updated", handler);
    }
  },
  openaiCodexOAuth: {
    start: () => electron.ipcRenderer.invoke("openai-codex-oauth:start"),
    cancel: () => electron.ipcRenderer.invoke("openai-codex-oauth:cancel"),
    logout: () => electron.ipcRenderer.invoke("openai-codex-oauth:logout"),
    status: () => electron.ipcRenderer.invoke("openai-codex-oauth:status")
  },
  xaiOAuth: {
    start: () => electron.ipcRenderer.invoke("xai-oauth:start"),
    cancel: () => electron.ipcRenderer.invoke("xai-oauth:cancel"),
    logout: () => electron.ipcRenderer.invoke("xai-oauth:logout"),
    status: () => electron.ipcRenderer.invoke("xai-oauth:status"),
    onDeviceCode: (callback) => {
      const handler = (_event, info) => callback(info);
      electron.ipcRenderer.on("xai-oauth:device-code", handler);
      return () => electron.ipcRenderer.removeListener("xai-oauth:device-code", handler);
    }
  }
});
//# sourceMappingURL=preload.js.map
