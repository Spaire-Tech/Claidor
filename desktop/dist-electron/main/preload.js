"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const constants_1 = require("../scheduledTask/constants");
const constants_2 = require("../shared/activity/constants");
const constants_3 = require("../shared/agent/constants");
const constants_4 = require("../shared/app/constants");
const constants_5 = require("../shared/appSettings/constants");
const constants_6 = require("../shared/appUpdate/constants");
const constants_7 = require("../shared/artifactPreview/constants");
const constants_8 = require("../shared/askInput/constants");
const constants_9 = require("../shared/asr/constants");
const constants_10 = require("../shared/auth/constants");
const constants_11 = require("../shared/browserCredentials/constants");
const constants_12 = require("../shared/browserWebAccess/constants");
const constants_13 = require("../shared/clipboard/constants");
const constants_14 = require("../shared/connections/constants");
const proposal_1 = require("../shared/connections/proposal");
const constants_15 = require("../shared/cowork/constants");
const constants_16 = require("../shared/dataMigration/constants");
const constants_17 = require("../shared/dialog/constants");
const constants_18 = require("../shared/dshEngine/constants");
const constants_19 = require("../shared/enterpriseAccount/constants");
const constants_20 = require("../shared/htmlShare/constants");
const constants_21 = require("../shared/library/constants");
const constants_22 = require("../shared/localWebServices/constants");
const constants_23 = require("../shared/mcp/constants");
const constants_24 = require("../shared/onboarding/constants");
const constants_25 = require("../shared/openclawEngine/constants");
const constants_26 = require("../shared/permissions/constants");
const constants_27 = require("../shared/projects/constants");
const constants_28 = require("../shared/reactions/constants");
const constants_29 = require("../shared/rooms/constants");
const constants_30 = require("../shared/settings/constants");
const constants_31 = require("../shared/shareDeployment/constants");
const constants_32 = require("../shared/shell/constants");
const constants_33 = require("../shared/site/constants");
const constants_34 = require("../shared/skin/constants");
const constants_35 = require("../shared/speech/constants");
const constants_36 = require("../shared/staffing/constants");
const roster_1 = require("../shared/staffing/roster");
const nimQrLogin_1 = require("./ipcHandlers/nimQrLogin");
const constants_37 = require("./openclawSession/constants");
const constants_38 = require("./openclawSessionPolicy/constants");
// 暴露安全的 API 到渲染进程
electron_1.contextBridge.exposeInMainWorld('electron', {
    platform: process.platform,
    arch: process.arch,
    store: {
        get: (key) => electron_1.ipcRenderer.invoke('store:get', key),
        set: (key, value) => electron_1.ipcRenderer.invoke('store:set', key, value),
        remove: (key) => electron_1.ipcRenderer.invoke('store:remove', key),
    },
    skills: {
        list: () => electron_1.ipcRenderer.invoke('skills:list'),
        setEnabled: (options) => electron_1.ipcRenderer.invoke('skills:setEnabled', options),
        delete: (id) => electron_1.ipcRenderer.invoke('skills:delete', id),
        download: (source) => electron_1.ipcRenderer.invoke('skills:download', source),
        upgrade: (skillId, downloadUrl) => electron_1.ipcRenderer.invoke('skills:upgrade', skillId, downloadUrl),
        confirmInstall: (pendingId, action) => electron_1.ipcRenderer.invoke('skills:confirmInstall', pendingId, action),
        getRoot: () => electron_1.ipcRenderer.invoke('skills:getRoot'),
        autoRoutingPrompt: () => electron_1.ipcRenderer.invoke('skills:autoRoutingPrompt'),
        getConfig: (skillId) => electron_1.ipcRenderer.invoke('skills:getConfig', skillId),
        setConfig: (skillId, config) => electron_1.ipcRenderer.invoke('skills:setConfig', skillId, config),
        getEmailAccountsConfig: (skillId) => electron_1.ipcRenderer.invoke('skills:getEmailAccountsConfig', skillId),
        setEmailAccountsConfig: (skillId, config) => electron_1.ipcRenderer.invoke('skills:setEmailAccountsConfig', skillId, config),
        testEmailAccountConnectivity: (skillId, account) => electron_1.ipcRenderer.invoke('skills:testEmailAccountConnectivity', skillId, account),
        testEmailConnectivity: (skillId, config) => electron_1.ipcRenderer.invoke('skills:testEmailConnectivity', skillId, config),
        fetchMarketplace: () => electron_1.ipcRenderer.invoke('skills:fetchMarketplace'),
        detectFromOpenClaw: () => electron_1.ipcRenderer.invoke('skills:detectFromOpenClaw'),
        syncFromOpenClaw: () => electron_1.ipcRenderer.invoke('skills:syncFromOpenClaw'),
        refreshPluginSkillIds: () => electron_1.ipcRenderer.invoke('skills:refreshPluginSkillIds'),
        onChanged: (callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on('skills:changed', handler);
            return () => electron_1.ipcRenderer.removeListener('skills:changed', handler);
        },
    },
    mcp: {
        list: () => electron_1.ipcRenderer.invoke(constants_23.McpIpcChannel.List),
        create: (data) => electron_1.ipcRenderer.invoke(constants_23.McpIpcChannel.Create, data),
        update: (id, data) => electron_1.ipcRenderer.invoke(constants_23.McpIpcChannel.Update, id, data),
        delete: (id) => electron_1.ipcRenderer.invoke(constants_23.McpIpcChannel.Delete, id),
        deleteByRegistryId: (registryId) => electron_1.ipcRenderer.invoke(constants_23.McpIpcChannel.DeleteByRegistryId, registryId),
        setEnabled: (options) => electron_1.ipcRenderer.invoke(constants_23.McpIpcChannel.SetEnabled, options),
        setEnabledByRegistryId: (options) => electron_1.ipcRenderer.invoke(constants_23.McpIpcChannel.SetEnabledByRegistryId, options),
        retryLaunchResolution: (id) => electron_1.ipcRenderer.invoke(constants_23.McpIpcChannel.RetryLaunchResolution, id),
        fetchMarketplace: () => electron_1.ipcRenderer.invoke(constants_23.McpIpcChannel.FetchMarketplace),
        connectQichacha: () => electron_1.ipcRenderer.invoke(constants_23.McpIpcChannel.ConnectQichacha),
        onChanged: (callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on(constants_23.McpIpcChannel.Changed, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_23.McpIpcChannel.Changed, handler);
        },
    },
    kits: {
        fetchStore: () => electron_1.ipcRenderer.invoke('kits:fetchStore'),
        install: (params) => electron_1.ipcRenderer.invoke('kits:install', params),
        uninstall: (kitId) => electron_1.ipcRenderer.invoke('kits:uninstall', kitId),
        listInstalled: () => electron_1.ipcRenderer.invoke('kits:listInstalled'),
    },
    skin: {
        getActive: () => electron_1.ipcRenderer.invoke(constants_34.SkinIpc.GetActive),
        list: () => electron_1.ipcRenderer.invoke(constants_34.SkinIpc.List),
        apply: (skinId, boundThemeId) => electron_1.ipcRenderer.invoke(constants_34.SkinIpc.Apply, skinId, boundThemeId),
        bindTheme: (skinId, themeId) => electron_1.ipcRenderer.invoke(constants_34.SkinIpc.BindTheme, skinId, themeId),
        deactivate: () => electron_1.ipcRenderer.invoke(constants_34.SkinIpc.Deactivate),
        delete: (skinId) => electron_1.ipcRenderer.invoke(constants_34.SkinIpc.Delete, skinId),
        onChanged: (callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on(constants_34.SkinIpc.Changed, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_34.SkinIpc.Changed, handler);
        },
    },
    permissions: {
        checkCalendar: () => electron_1.ipcRenderer.invoke(constants_26.PermissionIpcChannel.CheckCalendar),
        requestCalendar: () => electron_1.ipcRenderer.invoke(constants_26.PermissionIpcChannel.RequestCalendar),
    },
    enterprise: {
        getConfig: () => electron_1.ipcRenderer.invoke('enterprise:getConfig'),
    },
    enterpriseAccount: {
        getContext: () => electron_1.ipcRenderer.invoke(constants_19.EnterpriseAccountIpcChannel.GetContext),
        getIdentities: () => electron_1.ipcRenderer.invoke(constants_19.EnterpriseAccountIpcChannel.GetIdentities),
        requestQuotaIncrease: (enterpriseId, requestType) => (electron_1.ipcRenderer.invoke(constants_19.EnterpriseAccountIpcChannel.RequestQuotaIncrease, enterpriseId, requestType)),
        onContextInvalidated: (callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on(constants_19.EnterpriseAccountIpcChannel.ContextInvalidated, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_19.EnterpriseAccountIpcChannel.ContextInvalidated, handler);
        },
    },
    api: {
        // 普通 API 请求（非流式）
        fetch: (options) => electron_1.ipcRenderer.invoke('api:fetch', options),
        // 流式 API 请求
        stream: (options) => electron_1.ipcRenderer.invoke('api:stream', options),
        // 取消流式请求
        cancelStream: (requestId) => electron_1.ipcRenderer.invoke('api:stream:cancel', requestId),
        // 监听流式数据
        onStreamData: (requestId, callback) => {
            const handler = (_event, chunk) => callback(chunk);
            electron_1.ipcRenderer.on(`api:stream:${requestId}:data`, handler);
            return () => electron_1.ipcRenderer.removeListener(`api:stream:${requestId}:data`, handler);
        },
        // 监听流式完成
        onStreamDone: (requestId, callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on(`api:stream:${requestId}:done`, handler);
            return () => electron_1.ipcRenderer.removeListener(`api:stream:${requestId}:done`, handler);
        },
        // 监听流式错误
        onStreamError: (requestId, callback) => {
            const handler = (_event, error) => callback(error);
            electron_1.ipcRenderer.on(`api:stream:${requestId}:error`, handler);
            return () => electron_1.ipcRenderer.removeListener(`api:stream:${requestId}:error`, handler);
        },
        // 监听流式取消
        onStreamAbort: (requestId, callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on(`api:stream:${requestId}:abort`, handler);
            return () => electron_1.ipcRenderer.removeListener(`api:stream:${requestId}:abort`, handler);
        },
    },
    ipcRenderer: {
        send: (channel, ...args) => {
            electron_1.ipcRenderer.send(channel, ...args);
        },
        on: (channel, func) => {
            const handler = (_event, ...args) => func(...args);
            electron_1.ipcRenderer.on(channel, handler);
            return () => electron_1.ipcRenderer.removeListener(channel, handler);
        },
    },
    window: {
        minimize: () => electron_1.ipcRenderer.send('window-minimize'),
        toggleMaximize: () => electron_1.ipcRenderer.send('window-maximize'),
        close: () => electron_1.ipcRenderer.send('window-close'),
        isMaximized: () => electron_1.ipcRenderer.invoke('window:isMaximized'),
        showSystemMenu: (position) => electron_1.ipcRenderer.send('window:showSystemMenu', position),
        onStateChanged: (callback) => {
            const handler = (_event, state) => callback(state);
            electron_1.ipcRenderer.on('window:state-changed', handler);
            return () => electron_1.ipcRenderer.removeListener('window:state-changed', handler);
        },
    },
    getApiConfig: () => electron_1.ipcRenderer.invoke('get-api-config'),
    checkApiConfig: (options) => electron_1.ipcRenderer.invoke('check-api-config', options),
    saveApiConfig: (config) => electron_1.ipcRenderer.invoke('save-api-config', config),
    generateSessionTitle: (userInput) => electron_1.ipcRenderer.invoke('generate-session-title', userInput),
    getRecentCwds: (limit) => electron_1.ipcRenderer.invoke('get-recent-cwds', limit),
    dsh: {
        getState: () => electron_1.ipcRenderer.invoke(constants_18.DshIpcChannel.GetState),
        getConfig: () => electron_1.ipcRenderer.invoke(constants_18.DshIpcChannel.GetConfig),
        setEnabled: (enabled) => electron_1.ipcRenderer.invoke(constants_18.DshIpcChannel.SetEnabled, enabled),
        openWorkbench: () => electron_1.ipcRenderer.invoke(constants_18.DshIpcChannel.OpenWorkbench),
        stop: () => electron_1.ipcRenderer.invoke(constants_18.DshIpcChannel.Stop),
    },
    openclaw: {
        engine: {
            getStatus: () => electron_1.ipcRenderer.invoke(constants_25.OpenClawEngineIpc.GetStatus),
            install: () => electron_1.ipcRenderer.invoke(constants_25.OpenClawEngineIpc.Install),
            retryInstall: () => electron_1.ipcRenderer.invoke(constants_25.OpenClawEngineIpc.RetryInstall),
            restartGateway: () => electron_1.ipcRenderer.invoke(constants_25.OpenClawEngineIpc.RestartGateway),
            repairGatewayState: () => electron_1.ipcRenderer.invoke(constants_25.OpenClawEngineIpc.RepairGatewayState),
            onProgress: (callback) => {
                const handler = (_event, status) => callback(status);
                electron_1.ipcRenderer.on(constants_25.OpenClawEngineIpc.OnProgress, handler);
                return () => electron_1.ipcRenderer.removeListener(constants_25.OpenClawEngineIpc.OnProgress, handler);
            },
        },
        sessionPolicy: {
            get: () => electron_1.ipcRenderer.invoke(constants_38.OpenClawSessionPolicyIpc.Get),
            set: (config) => electron_1.ipcRenderer.invoke(constants_38.OpenClawSessionPolicyIpc.Set, config),
        },
        session: {
            patch: (options) => electron_1.ipcRenderer.invoke(constants_37.OpenClawSessionIpc.Patch, options),
        },
        browser: {
            getStatus: (options) => electron_1.ipcRenderer.invoke(constants_12.BrowserIpc.GetStatus, options),
            listProfiles: () => electron_1.ipcRenderer.invoke(constants_12.BrowserIpc.ListProfiles),
            test: (options) => electron_1.ipcRenderer.invoke(constants_12.BrowserIpc.Test, options),
            resetProfile: (options) => electron_1.ipcRenderer.invoke(constants_12.BrowserIpc.ResetProfile, options),
            getHostState: (request) => electron_1.ipcRenderer.invoke(constants_12.BrowserIpc.GetHostState, request),
            setHostView: (request) => electron_1.ipcRenderer.invoke(constants_12.BrowserIpc.SetHostView, request),
            navigateHost: (request) => electron_1.ipcRenderer.invoke(constants_12.BrowserIpc.NavigateHost, request),
            goBackHost: (request) => electron_1.ipcRenderer.invoke(constants_12.BrowserIpc.GoBackHost, request),
            goForwardHost: (request) => electron_1.ipcRenderer.invoke(constants_12.BrowserIpc.GoForwardHost, request),
            reloadHost: (request) => electron_1.ipcRenderer.invoke(constants_12.BrowserIpc.ReloadHost, request),
            stopHost: (request) => electron_1.ipcRenderer.invoke(constants_12.BrowserIpc.StopHost, request),
            selectHostPage: (request) => electron_1.ipcRenderer.invoke(constants_12.BrowserIpc.SelectHostPage, request),
            closeHostPage: (request) => electron_1.ipcRenderer.invoke(constants_12.BrowserIpc.CloseHostPage, request),
            resolveCredentialSavePrompt: (request) => electron_1.ipcRenderer.invoke(constants_12.BrowserIpc.ResolveCredentialSavePrompt, request),
            onHostState: (callback) => {
                const handler = (_event, hostEvent) => callback(hostEvent);
                electron_1.ipcRenderer.on(constants_12.BrowserIpc.HostState, handler);
                return () => electron_1.ipcRenderer.removeListener(constants_12.BrowserIpc.HostState, handler);
            },
            credentials: {
                getAvailability: () => electron_1.ipcRenderer.invoke(constants_11.BrowserCredentialIpc.GetAvailability),
                list: () => electron_1.ipcRenderer.invoke(constants_11.BrowserCredentialIpc.List),
                save: (request) => electron_1.ipcRenderer.invoke(constants_11.BrowserCredentialIpc.Save, request),
                delete: (request) => electron_1.ipcRenderer.invoke(constants_11.BrowserCredentialIpc.Delete, request),
            },
        },
        dataMigration: {
            backup: () => electron_1.ipcRenderer.invoke(constants_16.DataMigrationIpc.Backup),
            restore: () => electron_1.ipcRenderer.invoke(constants_16.DataMigrationIpc.Restore),
            getLastRestoreResult: () => electron_1.ipcRenderer.invoke(constants_16.DataMigrationIpc.GetLastRestoreResult),
        },
    },
    agents: {
        list: async () => {
            const result = await electron_1.ipcRenderer.invoke(constants_3.AgentIpcChannel.List);
            return result?.success ? result.agents : [];
        },
        get: async (id) => {
            const result = await electron_1.ipcRenderer.invoke(constants_3.AgentIpcChannel.Get, id);
            return result?.success ? result.agent : null;
        },
        create: async (request) => {
            const result = await electron_1.ipcRenderer.invoke(constants_3.AgentIpcChannel.Create, request);
            return result?.success ? result.agent : null;
        },
        update: async (id, updates) => {
            const result = await electron_1.ipcRenderer.invoke(constants_3.AgentIpcChannel.Update, id, updates);
            return result?.success ? result.agent : null;
        },
        reorder: async (agentIds) => {
            const result = await electron_1.ipcRenderer.invoke(constants_3.AgentIpcChannel.Reorder, agentIds);
            return result?.success ? result.agents : null;
        },
        cleanupLegacyIdentityBlock: async (id) => {
            const result = await electron_1.ipcRenderer.invoke(constants_3.AgentIpcChannel.CleanupLegacyIdentityBlock, id);
            return result?.result ?? {
                status: constants_3.AgentLegacyIdentityCleanupStatus.Failed,
                error: result?.error || 'Failed to clean legacy identity block',
            };
        },
        delete: async (id) => {
            const result = await electron_1.ipcRenderer.invoke(constants_3.AgentIpcChannel.Delete, id);
            return result?.success ? result.deleted : false;
        },
        presets: async () => {
            const result = await electron_1.ipcRenderer.invoke(constants_3.AgentIpcChannel.Presets);
            return result?.success ? result.presets : [];
        },
        presetTemplates: async () => {
            const result = await electron_1.ipcRenderer.invoke(constants_3.AgentIpcChannel.PresetTemplates);
            return result?.success ? result.presets : [];
        },
        addPreset: async (presetId) => {
            const result = await electron_1.ipcRenderer.invoke(constants_3.AgentIpcChannel.AddPreset, presetId);
            return result?.success ? result.agent : null;
        },
    },
    connections: {
        connect: (id) => electron_1.ipcRenderer.invoke(constants_14.ConnectionsIpcChannel.Connect, id),
        disconnect: (id) => electron_1.ipcRenderer.invoke(constants_14.ConnectionsIpcChannel.Disconnect, id),
    },
    cowork: {
        // Session management
        startSession: (options) => electron_1.ipcRenderer.invoke('cowork:session:start', options),
        continueSession: (options) => electron_1.ipcRenderer.invoke('cowork:session:continue', options),
        submitBtw: (options) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.SubmitBtw, options),
        abortBtw: (options) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.AbortBtw, options),
        submitSteer: (options) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.SubmitSteer, options),
        runGoalCommand: (options) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.GoalCommand, options),
        stopSession: (sessionId) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.StopSession, sessionId),
        deleteSession: (sessionId) => electron_1.ipcRenderer.invoke('cowork:session:delete', sessionId),
        deleteSessions: (sessionIds) => electron_1.ipcRenderer.invoke('cowork:session:deleteBatch', sessionIds),
        setSessionPinned: (options) => electron_1.ipcRenderer.invoke('cowork:session:pin', options),
        renameSession: (options) => electron_1.ipcRenderer.invoke('cowork:session:rename', options),
        forkSession: (options) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.ForkSession, options),
        getSession: (sessionId) => electron_1.ipcRenderer.invoke('cowork:session:get', sessionId),
        markSessionViewed: (sessionId) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.MarkSessionViewed, sessionId),
        setActiveSession: (sessionId) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.SetActiveSession, sessionId),
        seedNewUserWelcomeTask: (options) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.SeedNewUserWelcomeTask, options),
        notifyOpenSessionFromNotificationReady: () => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.OpenSessionFromNotificationReady),
        remoteManaged: (sessionId) => electron_1.ipcRenderer.invoke('cowork:session:remoteManaged', sessionId),
        listSessions: (options) => electron_1.ipcRenderer.invoke('cowork:session:list', options),
        getSessionMessages: (options) => electron_1.ipcRenderer.invoke('cowork:session:getMessages', options),
        getSessionSearchMessages: (options) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.GetSessionSearchMessages, options),
        getSessionMessageRailIndex: (sessionId) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.GetSessionMessageRailIndex, sessionId),
        getContextUsage: (sessionId) => electron_1.ipcRenderer.invoke('cowork:session:contextUsage', sessionId),
        compactContext: (sessionId) => electron_1.ipcRenderer.invoke('cowork:session:compactContext', sessionId),
        exportResultImage: (options) => electron_1.ipcRenderer.invoke('cowork:session:exportResultImage', options),
        captureImageChunk: (options) => electron_1.ipcRenderer.invoke('cowork:session:captureImageChunk', options),
        saveResultImage: (options) => electron_1.ipcRenderer.invoke('cowork:session:saveResultImage', options),
        exportSessionText: (options) => electron_1.ipcRenderer.invoke('cowork:session:exportText', options),
        exportSessionDiagnostics: (options) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.ExportSessionDiagnostics, options),
        // Subagent tracking
        getSubTaskHistory: (options) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.SubTaskHistory, options),
        listSubagentSessions: (parentSessionId) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.SubagentList, { parentSessionId }),
        listSubagentSessionsByAgent: (options) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.SubagentListByAgent, options),
        deleteSubagentSession: (options) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.SubagentDelete, options),
        // Media task management
        cancelMediaTask: (taskId) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.CancelMediaTask, taskId),
        // Permission handling
        respondToPermission: (options) => electron_1.ipcRenderer.invoke('cowork:permission:respond', options),
        // Configuration
        getConfig: () => electron_1.ipcRenderer.invoke('cowork:config:get'),
        setConfig: (config) => electron_1.ipcRenderer.invoke('cowork:config:set', config),
        // Session temp storage (.cowork-temp) maintenance
        getTempStorageUsage: () => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.TempStorageUsage),
        cleanTempStorage: (options) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.TempStorageClean, options),
        // `agentId` is optional and means main when absent: every agent has
        // its own workspace and its own MEMORY.md, and the settings screens
        // that called these first only ever meant main.
        listMemoryEntries: (input) => electron_1.ipcRenderer.invoke('cowork:memory:listEntries', input),
        createMemoryEntry: (input) => electron_1.ipcRenderer.invoke('cowork:memory:createEntry', input),
        updateMemoryEntry: (input) => electron_1.ipcRenderer.invoke('cowork:memory:updateEntry', input),
        deleteMemoryEntry: (input) => electron_1.ipcRenderer.invoke('cowork:memory:deleteEntry', input),
        getMemoryStats: () => electron_1.ipcRenderer.invoke('cowork:memory:getStats'),
        readMemoryFileRaw: () => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.MemoryReadRaw),
        writeMemoryFileRaw: (input) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.MemoryWriteRaw, input),
        getDreamingStatus: () => electron_1.ipcRenderer.invoke('cowork:dreaming:status'),
        getDreamDiary: () => electron_1.ipcRenderer.invoke('cowork:dreaming:diary'),
        readBootstrapFile: (filename, options) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.BootstrapRead, filename, options),
        writeBootstrapFile: (filename, content, options) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.BootstrapWrite, filename, content, options),
        // Stream event listeners
        onStreamMessage: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on('cowork:stream:message', handler);
            return () => electron_1.ipcRenderer.removeListener('cowork:stream:message', handler);
        },
        onStreamMessageUpdate: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on('cowork:stream:messageUpdate', handler);
            return () => electron_1.ipcRenderer.removeListener('cowork:stream:messageUpdate', handler);
        },
        onMediaStatusPollUpdate: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on(constants_15.CoworkIpcChannel.MediaStatusPollUpdate, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_15.CoworkIpcChannel.MediaStatusPollUpdate, handler);
        },
        onStreamSessionStatus: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on('cowork:stream:sessionStatus', handler);
            return () => electron_1.ipcRenderer.removeListener('cowork:stream:sessionStatus', handler);
        },
        onStreamContextUsage: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on('cowork:stream:contextUsage', handler);
            return () => electron_1.ipcRenderer.removeListener('cowork:stream:contextUsage', handler);
        },
        onStreamGoal: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on(constants_15.CoworkIpcChannel.StreamGoal, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_15.CoworkIpcChannel.StreamGoal, handler);
        },
        onStreamBtwResult: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on(constants_15.CoworkIpcChannel.StreamBtwResult, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_15.CoworkIpcChannel.StreamBtwResult, handler);
        },
        onStreamContextMaintenance: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on('cowork:stream:contextMaintenance', handler);
            return () => electron_1.ipcRenderer.removeListener('cowork:stream:contextMaintenance', handler);
        },
        onStreamPermission: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on('cowork:stream:permission', handler);
            return () => electron_1.ipcRenderer.removeListener('cowork:stream:permission', handler);
        },
        onStreamPermissionDismiss: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on('cowork:stream:permissionDismiss', handler);
            return () => electron_1.ipcRenderer.removeListener('cowork:stream:permissionDismiss', handler);
        },
        onStreamComplete: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on('cowork:stream:complete', handler);
            return () => electron_1.ipcRenderer.removeListener('cowork:stream:complete', handler);
        },
        onStreamError: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on('cowork:stream:error', handler);
            return () => electron_1.ipcRenderer.removeListener('cowork:stream:error', handler);
        },
        onSessionsChanged: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on(constants_15.CoworkIpcChannel.SessionsChanged, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_15.CoworkIpcChannel.SessionsChanged, handler);
        },
        onSessionModelOverrideChanged: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on(constants_15.CoworkIpcChannel.SessionModelOverrideChanged, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_15.CoworkIpcChannel.SessionModelOverrideChanged, handler);
        },
        onOpenSessionFromNotification: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on(constants_15.CoworkIpcChannel.OpenSessionFromNotification, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_15.CoworkIpcChannel.OpenSessionFromNotification, handler);
        },
    },
    dialog: {
        selectDirectory: () => electron_1.ipcRenderer.invoke('dialog:selectDirectory'),
        selectFile: (options) => electron_1.ipcRenderer.invoke('dialog:selectFile', options),
        selectFiles: (options) => electron_1.ipcRenderer.invoke('dialog:selectFiles', options),
        getPathForFile: (file) => electron_1.webUtils.getPathForFile(file),
        saveInlineFile: (options) => electron_1.ipcRenderer.invoke('dialog:saveInlineFile', options),
        readFileAsDataUrl: (filePath) => electron_1.ipcRenderer.invoke('dialog:readFileAsDataUrl', filePath),
        statFile: (filePath) => electron_1.ipcRenderer.invoke(constants_17.DialogIpc.StatFile, filePath),
        readTextFile: (filePath) => electron_1.ipcRenderer.invoke(constants_17.DialogIpc.ReadTextFile, filePath),
        saveFileCopy: (filePath) => electron_1.ipcRenderer.invoke(constants_17.DialogIpc.SaveFileCopy, filePath),
        generateThumbnail: (request) => electron_1.ipcRenderer.invoke(constants_17.DialogIpc.GenerateThumbnail, request),
        cancelThumbnail: (requestId) => electron_1.ipcRenderer.invoke(constants_17.DialogIpc.CancelThumbnail, requestId),
        showMessageBox: (options) => electron_1.ipcRenderer.invoke('dialog:showMessageBox', options),
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
        list: () => electron_1.ipcRenderer.invoke(constants_27.ProjectIpc.List),
        create: (name, memberIds, folder) => electron_1.ipcRenderer.invoke(constants_27.ProjectIpc.Create, name, memberIds, folder),
        update: (id, changes) => electron_1.ipcRenderer.invoke(constants_27.ProjectIpc.Update, id, changes),
        remove: (id) => electron_1.ipcRenderer.invoke(constants_27.ProjectIpc.Delete, id),
    },
    /** Rooms: a conversation with more than one agent in it. */
    rooms: {
        list: () => electron_1.ipcRenderer.invoke(constants_29.RoomIpc.List),
        create: (name, memberIds) => electron_1.ipcRenderer.invoke(constants_29.RoomIpc.Create, name, memberIds),
        update: (id, changes) => electron_1.ipcRenderer.invoke(constants_29.RoomIpc.Update, id, changes),
        remove: (id) => electron_1.ipcRenderer.invoke(constants_29.RoomIpc.Delete, id),
    },
    /** The agent's tapback on the person's message, from `ReactToMessage`. */
    reactions: {
        onAgent: (callback) => {
            const handler = (_event, reaction) => callback(reaction);
            electron_1.ipcRenderer.on(constants_28.ReactionIpc.Agent, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_28.ReactionIpc.Agent, handler);
        },
    },
    askInput: {
        onRequested: (callback) => {
            const handler = (_event, request) => callback(request);
            electron_1.ipcRenderer.on(constants_8.AskInputIpc.Requested, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_8.AskInputIpc.Requested, handler);
        },
        onDismissed: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on(constants_8.AskInputIpc.Dismissed, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_8.AskInputIpc.Dismissed, handler);
        },
        respond: (requestId, response) => electron_1.ipcRenderer.invoke(constants_8.AskInputIpc.Respond, requestId, response),
    },
    createAgent: {
        onRequested: (callback) => {
            const handler = (_event, ask) => callback(ask);
            electron_1.ipcRenderer.on(constants_36.CreateAgentIpc.Requested, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_36.CreateAgentIpc.Requested, handler);
        },
        onDismissed: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on(constants_36.CreateAgentIpc.Dismissed, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_36.CreateAgentIpc.Dismissed, handler);
        },
        onCreated: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on(constants_36.CreateAgentIpc.Created, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_36.CreateAgentIpc.Created, handler);
        },
        respond: (requestId, answer) => electron_1.ipcRenderer.invoke(constants_36.CreateAgentIpc.Respond, requestId, answer),
    },
    roster: {
        onRequested: (callback) => {
            const handler = (_event, ask) => callback(ask);
            electron_1.ipcRenderer.on(roster_1.RosterIpc.Requested, handler);
            return () => electron_1.ipcRenderer.removeListener(roster_1.RosterIpc.Requested, handler);
        },
        onDismissed: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on(roster_1.RosterIpc.Dismissed, handler);
            return () => electron_1.ipcRenderer.removeListener(roster_1.RosterIpc.Dismissed, handler);
        },
        respond: (requestId, answer) => electron_1.ipcRenderer.invoke(roster_1.RosterIpc.Respond, requestId, answer),
    },
    proposeConnector: {
        onRequested: (callback) => {
            const handler = (_event, ask) => callback(ask);
            electron_1.ipcRenderer.on(proposal_1.ProposeConnectorIpc.Requested, handler);
            return () => electron_1.ipcRenderer.removeListener(proposal_1.ProposeConnectorIpc.Requested, handler);
        },
        onDismissed: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on(proposal_1.ProposeConnectorIpc.Dismissed, handler);
            return () => electron_1.ipcRenderer.removeListener(proposal_1.ProposeConnectorIpc.Dismissed, handler);
        },
        respond: (requestId, answer) => electron_1.ipcRenderer.invoke(proposal_1.ProposeConnectorIpc.Respond, requestId, answer),
    },
    settings: {
        getExecPolicy: () => electron_1.ipcRenderer.invoke(constants_30.SettingsChannel.GetExecPolicy),
        setExecPolicy: (policy) => electron_1.ipcRenderer.invoke(constants_30.SettingsChannel.SetExecPolicy, policy),
    },
    shell: {
        openPath: (filePath) => electron_1.ipcRenderer.invoke(constants_32.ShellIpc.OpenPath, filePath),
        showItemInFolder: (filePath) => electron_1.ipcRenderer.invoke(constants_32.ShellIpc.ShowItemInFolder, filePath),
        openExternal: (url) => electron_1.ipcRenderer.invoke(constants_32.ShellIpc.OpenExternal, url),
        openHtmlInBrowser: (htmlContent) => electron_1.ipcRenderer.invoke(constants_32.ShellIpc.OpenHtmlInBrowser, htmlContent),
        getAppsForFile: (filePath) => electron_1.ipcRenderer.invoke(constants_32.ShellIpc.GetAppsForFile, filePath),
        getBrowserApps: (options) => electron_1.ipcRenderer.invoke(constants_32.ShellIpc.GetBrowserApps, options),
        openPathWithApp: (filePath, appPath) => electron_1.ipcRenderer.invoke(constants_32.ShellIpc.OpenPathWithApp, filePath, appPath),
        openUrlWithApp: (url, appPath) => electron_1.ipcRenderer.invoke(constants_32.ShellIpc.OpenUrlWithApp, url, appPath),
    },
    clipboard: {
        writeText: (text) => electron_1.ipcRenderer.invoke(constants_13.ClipboardIpc.WriteText, text),
        writeImageFromFile: (filePath) => electron_1.ipcRenderer.invoke(constants_13.ClipboardIpc.WriteImageFromFile, filePath),
        writeImageFromDataUrl: (dataUrl) => electron_1.ipcRenderer.invoke(constants_13.ClipboardIpc.WriteImageFromDataUrl, dataUrl),
    },
    htmlShare: {
        createFromHtmlFile: (options) => electron_1.ipcRenderer.invoke(constants_20.HtmlShareIpc.CreateFromHtmlFile, options),
        updateFromHtmlFile: (options) => electron_1.ipcRenderer.invoke(constants_20.HtmlShareIpc.UpdateFromHtmlFile, options),
        getByHtmlFile: (options) => electron_1.ipcRenderer.invoke(constants_20.HtmlShareIpc.GetByHtmlFile, options),
        createFromArtifactFile: (options) => electron_1.ipcRenderer.invoke(constants_20.HtmlShareIpc.CreateFromArtifactFile, options),
        updateFromArtifactFile: (options) => electron_1.ipcRenderer.invoke(constants_20.HtmlShareIpc.UpdateFromArtifactFile, options),
        getByArtifactFile: (options) => electron_1.ipcRenderer.invoke(constants_20.HtmlShareIpc.GetByArtifactFile, options),
        createFromGeneratedVideo: (options) => electron_1.ipcRenderer.invoke(constants_20.HtmlShareIpc.CreateFromGeneratedVideo, options),
        getGeneratedVideoSource: (options) => electron_1.ipcRenderer.invoke(constants_20.HtmlShareIpc.GetGeneratedVideoSource, options),
        resolveLegacyGeneratedVideoSource: (options) => electron_1.ipcRenderer.invoke(constants_20.HtmlShareIpc.ResolveLegacyGeneratedVideoSource, options),
        getBySource: (options) => electron_1.ipcRenderer.invoke(constants_20.HtmlShareIpc.GetBySource, options),
        updateStatus: (options) => electron_1.ipcRenderer.invoke(constants_20.HtmlShareIpc.UpdateStatus, options),
        updateAccessMode: (options) => electron_1.ipcRenderer.invoke(constants_20.HtmlShareIpc.UpdateAccessMode, options),
        disable: (shareId) => electron_1.ipcRenderer.invoke(constants_20.HtmlShareIpc.Disable, shareId),
        deletePermanently: (shareId) => electron_1.ipcRenderer.invoke(constants_20.HtmlShareIpc.DeletePermanently, shareId),
        get: (shareId) => electron_1.ipcRenderer.invoke(constants_20.HtmlShareIpc.Get, shareId),
        getQuota: () => electron_1.ipcRenderer.invoke(constants_20.HtmlShareIpc.GetQuota),
        getTrialPolicy: () => electron_1.ipcRenderer.invoke(constants_20.HtmlShareIpc.GetTrialPolicy),
        getAnalytics: (options) => electron_1.ipcRenderer.invoke(constants_20.HtmlShareIpc.GetAnalytics, options),
    },
    shareDeployment: {
        detectProjectCandidates: (options) => electron_1.ipcRenderer.invoke(constants_31.ShareDeploymentIpc.DetectProjectCandidates, options),
        analyzeProjectDirectory: (options) => electron_1.ipcRenderer.invoke(constants_31.ShareDeploymentIpc.AnalyzeProjectDirectory, options),
        selectPersistencePath: (options) => electron_1.ipcRenderer.invoke(constants_31.ShareDeploymentIpc.SelectPersistencePath, options),
        createNodeDeployment: (options) => electron_1.ipcRenderer.invoke(constants_31.ShareDeploymentIpc.CreateNodeDeployment, options),
        get: (deploymentId) => electron_1.ipcRenderer.invoke(constants_31.ShareDeploymentIpc.Get, deploymentId),
        getByLocalService: (options) => electron_1.ipcRenderer.invoke(constants_31.ShareDeploymentIpc.GetByLocalService, options),
        getPersistence: (deploymentId) => electron_1.ipcRenderer.invoke(constants_31.ShareDeploymentIpc.GetPersistence, deploymentId),
        downloadPersistenceArchive: (options) => electron_1.ipcRenderer.invoke(constants_31.ShareDeploymentIpc.DownloadPersistenceArchive, options),
    },
    sites: {
        list: (options = {}) => electron_1.ipcRenderer.invoke(constants_33.SiteIpc.List, options),
        get: (shareId) => electron_1.ipcRenderer.invoke(constants_33.SiteIpc.Get, shareId),
        updateTitle: (input) => electron_1.ipcRenderer.invoke(constants_33.SiteIpc.UpdateTitle, input),
        updateAccessMode: (input) => electron_1.ipcRenderer.invoke(constants_33.SiteIpc.UpdateAccessMode, input),
        updateAccessStatus: (input) => electron_1.ipcRenderer.invoke(constants_33.SiteIpc.UpdateAccessStatus, input),
        delete: (shareId) => electron_1.ipcRenderer.invoke(constants_33.SiteIpc.Delete, shareId),
        getAnalytics: (shareId, options = {}) => electron_1.ipcRenderer.invoke(constants_33.SiteIpc.GetAnalytics, shareId, options),
        getDeploymentQuota: (options = {}) => electron_1.ipcRenderer.invoke(constants_33.SiteIpc.GetDeploymentQuota, options),
        createQuotaReservation: (input) => electron_1.ipcRenderer.invoke(constants_33.SiteIpc.CreateQuotaReservation, input),
        releaseQuotaReservation: (reservationId) => electron_1.ipcRenderer.invoke(constants_33.SiteIpc.ReleaseQuotaReservation, reservationId),
    },
    library: {
        listLocal: (options = {}) => electron_1.ipcRenderer.invoke(constants_21.LibraryIpc.ListLocal, options),
        listCloud: (options = {}) => electron_1.ipcRenderer.invoke(constants_21.LibraryIpc.ListCloud, options),
        getLocalItems: (input) => electron_1.ipcRenderer.invoke(constants_21.LibraryIpc.GetLocalItems, input),
        getLocalDetail: (itemId) => electron_1.ipcRenderer.invoke(constants_21.LibraryIpc.GetLocalDetail, itemId),
        recordCandidates: (candidates) => electron_1.ipcRenderer.invoke(constants_21.LibraryIpc.RecordCandidates, candidates),
        addLocalFiles: (filePaths) => electron_1.ipcRenderer.invoke(constants_21.LibraryIpc.AddLocalFiles, filePaths),
        setFavorite: (input) => electron_1.ipcRenderer.invoke(constants_21.LibraryIpc.SetFavorite, input),
        openLocal: (itemId) => electron_1.ipcRenderer.invoke(constants_21.LibraryIpc.OpenLocal, itemId),
        revealLocal: (itemId) => electron_1.ipcRenderer.invoke(constants_21.LibraryIpc.RevealLocal, itemId),
        repairIndex: () => electron_1.ipcRenderer.invoke(constants_21.LibraryIpc.RepairIndex),
        getIndexStatus: () => electron_1.ipcRenderer.invoke(constants_21.LibraryIpc.GetIndexStatus),
        getBackfillState: () => electron_1.ipcRenderer.invoke(constants_21.LibraryIpc.GetBackfillState),
        setBackfillState: (state) => electron_1.ipcRenderer.invoke(constants_21.LibraryIpc.SetBackfillState, state),
        onChanged: (callback) => {
            const handler = (_event, payload) => {
                callback(payload);
            };
            electron_1.ipcRenderer.on(constants_21.LibraryIpc.Changed, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_21.LibraryIpc.Changed, handler);
        },
    },
    asr: {
        createRealtimeSession: (options) => electron_1.ipcRenderer.invoke(constants_9.AsrIpcChannel.CreateRealtimeSession, options),
    },
    speech: {
        status: () => electron_1.ipcRenderer.invoke(constants_35.SpeechIpc.Status),
        start: () => electron_1.ipcRenderer.invoke(constants_35.SpeechIpc.Start),
        chunk: (sessionId, pcm16) => {
            electron_1.ipcRenderer.send(constants_35.SpeechIpc.Chunk, sessionId, pcm16);
        },
        stop: (sessionId) => electron_1.ipcRenderer.invoke(constants_35.SpeechIpc.Stop, sessionId),
        cancel: (sessionId) => electron_1.ipcRenderer.invoke(constants_35.SpeechIpc.Cancel, sessionId),
        onEvent: (callback) => {
            const handler = (_event, speechEvent) => callback(speechEvent);
            electron_1.ipcRenderer.on(constants_35.SpeechIpc.Event, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_35.SpeechIpc.Event, handler);
        },
    },
    onboarding: {
        status: () => electron_1.ipcRenderer.invoke(constants_24.OnboardingIpc.Status),
        runTask: (task) => electron_1.ipcRenderer.invoke(constants_24.OnboardingIpc.RunTask, task),
        openResult: (task, ref) => electron_1.ipcRenderer.invoke(constants_24.OnboardingIpc.OpenResult, task, ref),
    },
    artifact: {
        watchFile: (filePath) => electron_1.ipcRenderer.invoke('artifact:watchFile', filePath),
        unwatchFile: (filePath) => electron_1.ipcRenderer.invoke('artifact:unwatchFile', filePath),
        onFileChanged: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on('artifact:file:changed', handler);
            return () => {
                electron_1.ipcRenderer.removeListener('artifact:file:changed', handler);
            };
        },
        createPreviewSession: (filePath) => electron_1.ipcRenderer.invoke(constants_7.ArtifactPreviewIpc.CreateSession, filePath),
        createOfficePreviewSession: (filePath) => electron_1.ipcRenderer.invoke(constants_7.ArtifactPreviewIpc.CreateOfficeSession, filePath),
        destroyPreviewSession: (sessionId) => electron_1.ipcRenderer.invoke(constants_7.ArtifactPreviewIpc.DestroySession, sessionId),
        clearBrowserCookies: async () => {
            try {
                return await electron_1.ipcRenderer.invoke(constants_7.ArtifactPreviewIpc.ClearBrowserCookies);
            }
            catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
        clearBrowserCache: async () => {
            try {
                return await electron_1.ipcRenderer.invoke(constants_7.ArtifactPreviewIpc.ClearBrowserCache);
            }
            catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
        saveBrowserAnnotationAsset: (input) => electron_1.ipcRenderer.invoke(constants_7.ArtifactPreviewIpc.SaveBrowserAnnotationAsset, input),
        readBrowserAnnotationAsset: (input) => electron_1.ipcRenderer.invoke(constants_7.ArtifactPreviewIpc.ReadBrowserAnnotationAsset, input),
        deleteBrowserAnnotationAsset: (input) => electron_1.ipcRenderer.invoke(constants_7.ArtifactPreviewIpc.DeleteBrowserAnnotationAsset, input),
        deleteBrowserAnnotationBatchAssets: (input) => electron_1.ipcRenderer.invoke(constants_7.ArtifactPreviewIpc.DeleteBrowserAnnotationBatchAssets, input),
        listLocalWebServices: (options) => electron_1.ipcRenderer.invoke(constants_22.LocalWebServicesIpc.List, options),
    },
    autoLaunch: {
        get: () => electron_1.ipcRenderer.invoke(constants_5.AppSettingsIpc.GetAutoLaunch),
        set: (enabled) => electron_1.ipcRenderer.invoke(constants_5.AppSettingsIpc.SetAutoLaunch, enabled),
    },
    preventSleep: {
        get: () => electron_1.ipcRenderer.invoke(constants_5.AppSettingsIpc.GetPreventSleep),
        set: (enabled) => electron_1.ipcRenderer.invoke(constants_5.AppSettingsIpc.SetPreventSleep, enabled),
    },
    appInfo: {
        getVersion: () => electron_1.ipcRenderer.invoke('app:getVersion'),
        getBuildInfo: () => electron_1.ipcRenderer.invoke('app:getBuildInfo'),
        getComputerName: () => electron_1.ipcRenderer.invoke('app:getComputerName'),
        getSystemLocale: () => electron_1.ipcRenderer.invoke('app:getSystemLocale'),
        getKeyfromAttribution: () => electron_1.ipcRenderer.invoke(constants_4.AppIpcChannel.GetKeyfromAttribution),
        relaunch: () => electron_1.ipcRenderer.invoke('app:relaunch'),
        openSystemNotificationSettings: () => electron_1.ipcRenderer.invoke(constants_4.AppIpcChannel.OpenSystemNotificationSettings),
    },
    activity: {
        getSlot: (input) => electron_1.ipcRenderer.invoke(constants_2.ActivityIpc.HostGetSlot, input),
        getContext: (input) => electron_1.ipcRenderer.invoke(constants_2.ActivityIpc.HostGetContext, input),
        executeAction: (input) => electron_1.ipcRenderer.invoke(constants_2.ActivityIpc.HostExecuteAction, input),
    },
    appUpdate: {
        getState: () => electron_1.ipcRenderer.invoke(constants_6.AppUpdateIpc.GetState),
        checkNow: (options) => electron_1.ipcRenderer.invoke(constants_6.AppUpdateIpc.CheckNow, options),
        retryDownload: () => electron_1.ipcRenderer.invoke(constants_6.AppUpdateIpc.RetryDownload),
        installReady: () => electron_1.ipcRenderer.invoke(constants_6.AppUpdateIpc.InstallReady),
        getCompletedUpdate: () => electron_1.ipcRenderer.invoke(constants_6.AppUpdateIpc.GetCompletedUpdate),
        getActiveWorkloads: () => electron_1.ipcRenderer.invoke(constants_6.AppUpdateIpc.GetActiveWorkloads),
        onStateChanged: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on(constants_6.AppUpdateIpc.StateChanged, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_6.AppUpdateIpc.StateChanged, handler);
        },
    },
    plugins: {
        list: () => electron_1.ipcRenderer.invoke('plugins:list'),
        detect: () => electron_1.ipcRenderer.invoke('plugins:detect'),
        sync: () => electron_1.ipcRenderer.invoke('plugins:sync'),
        install: (params) => electron_1.ipcRenderer.invoke('plugins:install', params),
        uninstall: (pluginId) => electron_1.ipcRenderer.invoke('plugins:uninstall', pluginId),
        setEnabled: (pluginId, enabled) => electron_1.ipcRenderer.invoke('plugins:set-enabled', pluginId, enabled),
        getConfigSchema: (pluginId) => electron_1.ipcRenderer.invoke('plugins:get-config-schema', pluginId),
        saveConfig: (pluginId, config) => electron_1.ipcRenderer.invoke('plugins:save-config', pluginId, config),
        batchSave: (changes) => electron_1.ipcRenderer.invoke('plugins:batch-save', changes),
        checkUpdates: (pluginIds) => electron_1.ipcRenderer.invoke('plugins:check-updates', pluginIds),
        update: (pluginId) => electron_1.ipcRenderer.invoke('plugins:update', pluginId),
        onInstallLog: (callback) => {
            const handler = (_event, line) => callback(line);
            electron_1.ipcRenderer.on('plugins:install-log', handler);
            return () => electron_1.ipcRenderer.removeListener('plugins:install-log', handler);
        },
    },
    log: {
        getPath: () => electron_1.ipcRenderer.invoke('log:getPath'),
        openFolder: () => electron_1.ipcRenderer.invoke('log:openFolder'),
        exportZip: () => electron_1.ipcRenderer.invoke('log:exportZip'),
        fromRenderer: (level, tag, message) => electron_1.ipcRenderer.send('log:fromRenderer', level, tag, message),
    },
    im: {
        // Configuration
        getConfig: () => electron_1.ipcRenderer.invoke('im:config:get'),
        setConfig: (config, options) => electron_1.ipcRenderer.invoke('im:config:set', config, options),
        syncConfig: () => electron_1.ipcRenderer.invoke('im:config:sync'),
        // Gateway control
        startGateway: (platform) => electron_1.ipcRenderer.invoke('im:gateway:start', platform),
        stopGateway: (platform) => electron_1.ipcRenderer.invoke('im:gateway:stop', platform),
        testGateway: (platform, configOverride) => electron_1.ipcRenderer.invoke('im:gateway:test', platform, configOverride),
        // Status
        getStatus: () => electron_1.ipcRenderer.invoke('im:status:get'),
        getLocalIp: () => electron_1.ipcRenderer.invoke('im:getLocalIp'),
        // OpenClaw config schema
        getOpenClawConfigSchema: () => electron_1.ipcRenderer.invoke('im:openclaw:config-schema'),
        // Weixin QR login
        weixinQrLoginStart: () => electron_1.ipcRenderer.invoke('im:weixin:qr-login-start'),
        weixinQrLoginWait: (sessionKey) => electron_1.ipcRenderer.invoke('im:weixin:qr-login-wait', sessionKey),
        // POPO QR login
        popoQrLoginStart: () => electron_1.ipcRenderer.invoke('im:popo:qr-login-start'),
        popoQrLoginPoll: (taskToken) => electron_1.ipcRenderer.invoke('im:popo:qr-login-poll', taskToken),
        // POPO Multi-Instance
        addPopoInstance: (name) => electron_1.ipcRenderer.invoke('im:popo:instance:add', name),
        deletePopoInstance: (instanceId) => electron_1.ipcRenderer.invoke('im:popo:instance:delete', instanceId),
        setPopoInstanceConfig: (instanceId, config, options) => electron_1.ipcRenderer.invoke('im:popo:instance:config:set', instanceId, config, options),
        // Pairing
        listPairingRequests: (platform) => electron_1.ipcRenderer.invoke('im:pairing:list', platform),
        approvePairingCode: (platform, code) => electron_1.ipcRenderer.invoke('im:pairing:approve', platform, code),
        rejectPairingRequest: (platform, code) => electron_1.ipcRenderer.invoke('im:pairing:reject', platform, code),
        // DingTalk Multi-Instance
        addDingTalkInstance: (name) => electron_1.ipcRenderer.invoke('im:dingtalk:instance:add', name),
        deleteDingTalkInstance: (instanceId) => electron_1.ipcRenderer.invoke('im:dingtalk:instance:delete', instanceId),
        setDingTalkInstanceConfig: (instanceId, config, options) => electron_1.ipcRenderer.invoke('im:dingtalk:instance:config:set', instanceId, config, options),
        // NIM Multi-Instance
        addNimInstance: (name) => electron_1.ipcRenderer.invoke('im:nim:instance:add', name),
        deleteNimInstance: (instanceId) => electron_1.ipcRenderer.invoke('im:nim:instance:delete', instanceId),
        setNimInstanceConfig: (instanceId, config, options) => electron_1.ipcRenderer.invoke('im:nim:instance:config:set', instanceId, config, options),
        nimQrLoginStart: () => electron_1.ipcRenderer.invoke(nimQrLogin_1.NimQrLoginIpc.Start),
        nimQrLoginPoll: (uuid) => electron_1.ipcRenderer.invoke(nimQrLogin_1.NimQrLoginIpc.Poll, uuid),
        // QQ Multi-Instance
        addQQInstance: (name) => electron_1.ipcRenderer.invoke('im:qq:instance:add', name),
        deleteQQInstance: (instanceId) => electron_1.ipcRenderer.invoke('im:qq:instance:delete', instanceId),
        setQQInstanceConfig: (instanceId, config, options) => electron_1.ipcRenderer.invoke('im:qq:instance:config:set', instanceId, config, options),
        // Feishu Multi-Instance
        addFeishuInstance: (name) => electron_1.ipcRenderer.invoke('im:feishu:instance:add', name),
        deleteFeishuInstance: (instanceId) => electron_1.ipcRenderer.invoke('im:feishu:instance:delete', instanceId),
        setFeishuInstanceConfig: (instanceId, config, options) => electron_1.ipcRenderer.invoke('im:feishu:instance:config:set', instanceId, config, options),
        // Email Multi-Instance
        addEmailInstance: (name) => electron_1.ipcRenderer.invoke('im:email:instance:add', name),
        deleteEmailInstance: (instanceId) => electron_1.ipcRenderer.invoke('im:email:instance:delete', instanceId),
        setEmailInstanceConfig: (instanceId, config, options) => electron_1.ipcRenderer.invoke('im:email:instance:config:set', instanceId, config, options),
        // WeCom Multi-Instance
        addWecomInstance: (name) => electron_1.ipcRenderer.invoke('im:wecom:instance:add', name),
        deleteWecomInstance: (instanceId) => electron_1.ipcRenderer.invoke('im:wecom:instance:delete', instanceId),
        setWecomInstanceConfig: (instanceId, config, options) => electron_1.ipcRenderer.invoke('im:wecom:instance:config:set', instanceId, config, options),
        // Telegram Multi-Instance
        addTelegramInstance: (name) => electron_1.ipcRenderer.invoke('im:telegram:instance:add', name),
        deleteTelegramInstance: (instanceId) => electron_1.ipcRenderer.invoke('im:telegram:instance:delete', instanceId),
        setTelegramInstanceConfig: (instanceId, config, options) => electron_1.ipcRenderer.invoke('im:telegram:instance:config:set', instanceId, config, options),
        // Discord Multi-Instance
        addDiscordInstance: (name) => electron_1.ipcRenderer.invoke('im:discord:instance:add', name),
        deleteDiscordInstance: (instanceId) => electron_1.ipcRenderer.invoke('im:discord:instance:delete', instanceId),
        setDiscordInstanceConfig: (instanceId, config, options) => electron_1.ipcRenderer.invoke('im:discord:instance:config:set', instanceId, config, options),
        // Event listeners
        onStatusChange: (callback) => {
            const handler = (_event, status) => callback(status);
            electron_1.ipcRenderer.on('im:status:change', handler);
            return () => electron_1.ipcRenderer.removeListener('im:status:change', handler);
        },
        onMessageReceived: (callback) => {
            const handler = (_event, message) => callback(message);
            electron_1.ipcRenderer.on('im:message:received', handler);
            return () => electron_1.ipcRenderer.removeListener('im:message:received', handler);
        },
    },
    scheduledTasks: {
        // Task CRUD
        list: () => electron_1.ipcRenderer.invoke(constants_1.IpcChannel.List),
        get: (id) => electron_1.ipcRenderer.invoke(constants_1.IpcChannel.Get, id),
        create: (input) => electron_1.ipcRenderer.invoke(constants_1.IpcChannel.Create, input),
        update: (id, input) => electron_1.ipcRenderer.invoke(constants_1.IpcChannel.Update, id, input),
        delete: (id) => electron_1.ipcRenderer.invoke(constants_1.IpcChannel.Delete, id),
        toggle: (id, enabled) => electron_1.ipcRenderer.invoke(constants_1.IpcChannel.Toggle, id, enabled),
        // Execution
        runManually: (id) => electron_1.ipcRenderer.invoke(constants_1.IpcChannel.RunManually, id),
        stop: (id) => electron_1.ipcRenderer.invoke(constants_1.IpcChannel.Stop, id),
        // Run history
        listRuns: (taskId, limit, offset, filter) => electron_1.ipcRenderer.invoke(constants_1.IpcChannel.ListRuns, taskId, limit, offset, filter),
        countRuns: (taskId) => electron_1.ipcRenderer.invoke(constants_1.IpcChannel.CountRuns, taskId),
        listAllRuns: (limit, offset, filter) => electron_1.ipcRenderer.invoke(constants_1.IpcChannel.ListAllRuns, limit, offset, filter),
        resolveSession: (input) => electron_1.ipcRenderer.invoke(constants_1.IpcChannel.ResolveSession, input),
        // Delivery channels
        listChannels: () => electron_1.ipcRenderer.invoke(constants_1.IpcChannel.ListChannels),
        listChannelConversations: (channel, accountId, filterAccountId) => electron_1.ipcRenderer.invoke(constants_1.IpcChannel.ListChannelConversations, channel, accountId, filterAccountId),
        // Stream event listeners
        onStatusUpdate: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on(constants_1.IpcChannel.StatusUpdate, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_1.IpcChannel.StatusUpdate, handler);
        },
        onRunUpdate: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on(constants_1.IpcChannel.RunUpdate, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_1.IpcChannel.RunUpdate, handler);
        },
        onRefresh: (callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on(constants_1.IpcChannel.Refresh, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_1.IpcChannel.Refresh, handler);
        },
    },
    networkStatus: {
        send: (status) => electron_1.ipcRenderer.send('network:status-change', status),
    },
    auth: {
        login: (loginUrl) => electron_1.ipcRenderer.invoke(constants_10.AuthIpcChannel.Login, { loginUrl }),
        exchange: (code) => electron_1.ipcRenderer.invoke(constants_10.AuthIpcChannel.Exchange, { code }),
        getUser: () => electron_1.ipcRenderer.invoke(constants_10.AuthIpcChannel.GetUser),
        getQuota: () => electron_1.ipcRenderer.invoke(constants_10.AuthIpcChannel.GetQuota),
        logout: () => electron_1.ipcRenderer.invoke(constants_10.AuthIpcChannel.Logout),
        refreshToken: () => electron_1.ipcRenderer.invoke(constants_10.AuthIpcChannel.RefreshToken),
        getAccessToken: () => electron_1.ipcRenderer.invoke(constants_10.AuthIpcChannel.GetAccessToken),
        getModels: () => electron_1.ipcRenderer.invoke(constants_10.AuthIpcChannel.GetModels),
        getPricingCatalog: () => electron_1.ipcRenderer.invoke(constants_10.AuthIpcChannel.GetPricingCatalog),
        getProfileSummary: () => electron_1.ipcRenderer.invoke(constants_10.AuthIpcChannel.GetProfileSummary),
        claimCreditsFinalReward: (campaignCode) => electron_1.ipcRenderer.invoke(constants_10.AuthIpcChannel.ClaimCreditsFinalReward, { campaignCode }),
        getActiveClientBanner: () => electron_1.ipcRenderer.invoke(constants_10.AuthIpcChannel.GetActiveClientBanner),
        getActiveClientBanners: () => electron_1.ipcRenderer.invoke(constants_10.AuthIpcChannel.GetActiveClientBanners),
        getClientBannerSnapshot: () => electron_1.ipcRenderer.invoke(constants_10.AuthIpcChannel.GetClientBannerSnapshot),
        getPendingCallback: () => electron_1.ipcRenderer.invoke(constants_10.AuthIpcChannel.GetPendingCallback),
        onCallback: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on(constants_10.AuthIpcChannel.Callback, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_10.AuthIpcChannel.Callback, handler);
        },
        onQuotaChanged: (callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on(constants_10.AuthIpcChannel.QuotaChanged, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_10.AuthIpcChannel.QuotaChanged, handler);
        },
        onSessionChanged: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on(constants_10.AuthIpcChannel.SessionChanged, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_10.AuthIpcChannel.SessionChanged, handler);
        },
        onLifecycleEvent: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on(constants_10.AuthIpcChannel.LifecycleEvent, handler);
            return () => electron_1.ipcRenderer.removeListener(constants_10.AuthIpcChannel.LifecycleEvent, handler);
        },
    },
    media: {
        getModels: (type) => electron_1.ipcRenderer.invoke(constants_15.CoworkIpcChannel.GetMediaModels, type),
        getTaskStatus: (taskId, type) => electron_1.ipcRenderer.invoke('media:getTaskStatus', taskId, type),
    },
    feishu: {
        install: {
            qrcode: (isLark) => electron_1.ipcRenderer.invoke('feishu:install:qrcode', { isLark }),
            poll: (deviceCode) => electron_1.ipcRenderer.invoke('feishu:install:poll', { deviceCode }),
            verify: (appId, appSecret) => electron_1.ipcRenderer.invoke('feishu:install:verify', { appId, appSecret }),
        },
    },
    dingtalk: {
        install: {
            qrcode: () => electron_1.ipcRenderer.invoke('dingtalk:install:qrcode'),
            poll: (deviceCode) => electron_1.ipcRenderer.invoke('dingtalk:install:poll', { deviceCode }),
            verify: (clientId, clientSecret) => electron_1.ipcRenderer.invoke('dingtalk:install:verify', { clientId, clientSecret }),
        },
    },
    githubCopilot: {
        requestDeviceCode: () => electron_1.ipcRenderer.invoke('github-copilot:request-device-code'),
        pollForToken: (deviceCode, interval, expiresIn) => electron_1.ipcRenderer.invoke('github-copilot:poll-for-token', {
            deviceCode,
            interval,
            expiresIn,
        }),
        cancelPolling: () => electron_1.ipcRenderer.invoke('github-copilot:cancel-polling'),
        signOut: () => electron_1.ipcRenderer.invoke('github-copilot:sign-out'),
        refreshToken: () => electron_1.ipcRenderer.invoke('github-copilot:refresh-token'),
        onTokenUpdated: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on('github-copilot:token-updated', handler);
            return () => electron_1.ipcRenderer.removeListener('github-copilot:token-updated', handler);
        },
    },
    openaiCodexOAuth: {
        start: () => electron_1.ipcRenderer.invoke('openai-codex-oauth:start'),
        cancel: () => electron_1.ipcRenderer.invoke('openai-codex-oauth:cancel'),
        logout: () => electron_1.ipcRenderer.invoke('openai-codex-oauth:logout'),
        status: () => electron_1.ipcRenderer.invoke('openai-codex-oauth:status'),
    },
    xaiOAuth: {
        start: () => electron_1.ipcRenderer.invoke('xai-oauth:start'),
        cancel: () => electron_1.ipcRenderer.invoke('xai-oauth:cancel'),
        logout: () => electron_1.ipcRenderer.invoke('xai-oauth:logout'),
        status: () => electron_1.ipcRenderer.invoke('xai-oauth:status'),
        onDeviceCode: (callback) => {
            const handler = (_event, info) => callback(info);
            electron_1.ipcRenderer.on('xai-oauth:device-code', handler);
            return () => electron_1.ipcRenderer.removeListener('xai-oauth:device-code', handler);
        },
    },
});
//# sourceMappingURL=preload.js.map