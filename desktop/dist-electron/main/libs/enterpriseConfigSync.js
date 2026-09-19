"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEnterpriseConfigPath = resolveEnterpriseConfigPath;
exports.syncEnterpriseConfig = syncEnterpriseConfig;
exports.mergeOpenClawConfigs = mergeOpenClawConfigs;
exports.mergeEnterpriseOpenclawConfig = mergeEnterpriseOpenclawConfig;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("../../shared/openclawEngine/constants");
const safeFileReplace_1 = require("./safeFileReplace");
const SANDBOX_MODE_MAP = {
    'off': 'local',
    'non-main': 'auto',
    'all': 'sandbox',
};
const ENTERPRISE_CONFIG_DIR = 'enterprise-config';
const MANIFEST_FILE = 'manifest.json';
const ACCOUNT_COMPAT_CHANNEL_KEYS = ['feishu', 'dingtalk', 'dingtalk-connector', 'qqbot', 'wecom', 'moltbot-popo'];
const ACCOUNT_COMPAT_CHANNEL_TOP_LEVEL_MAP = {
    feishu: {
        enabled: 'enabled',
        appId: 'appId',
        appSecret: 'appSecret',
        domain: 'domain',
        dmPolicy: 'dmPolicy',
        allowFrom: 'allowFrom',
        groupPolicy: 'groupPolicy',
        groupAllowFrom: 'groupAllowFrom',
        groups: 'groups',
        historyLimit: 'historyLimit',
        streaming: 'streaming',
        replyMode: 'replyMode',
        blockStreaming: 'blockStreaming',
        footer: 'footer',
        blockStreamingCoalesce: 'blockStreamingCoalesce',
        mediaMaxMb: 'mediaMaxMb',
    },
    dingtalk: {
        enabled: 'enabled',
        clientId: 'clientId',
        clientSecret: 'clientSecret',
        dmPolicy: 'dmPolicy',
        allowFrom: 'allowFrom',
        groupPolicy: 'groupPolicy',
        sessionTimeout: 'sessionTimeout',
        separateSessionByConversation: 'separateSessionByConversation',
        groupSessionScope: 'groupSessionScope',
        sharedMemoryAcrossConversations: 'sharedMemoryAcrossConversations',
        gatewayBaseUrl: 'gatewayBaseUrl',
    },
    'dingtalk-connector': {
        enabled: 'enabled',
        clientId: 'clientId',
        clientSecret: 'clientSecret',
        dmPolicy: 'dmPolicy',
        allowFrom: 'allowFrom',
        groupPolicy: 'groupPolicy',
        sessionTimeout: 'sessionTimeout',
        separateSessionByConversation: 'separateSessionByConversation',
        groupSessionScope: 'groupSessionScope',
        sharedMemoryAcrossConversations: 'sharedMemoryAcrossConversations',
        gatewayBaseUrl: 'gatewayBaseUrl',
    },
    qqbot: {
        enabled: 'enabled',
        appId: 'appId',
        clientSecret: 'appSecret',
        dmPolicy: 'dmPolicy',
        allowFrom: 'allowFrom',
        groupPolicy: 'groupPolicy',
        groupAllowFrom: 'groupAllowFrom',
        historyLimit: 'historyLimit',
        markdownSupport: 'markdownSupport',
        imageServerBaseUrl: 'imageServerBaseUrl',
    },
    wecom: {
        enabled: 'enabled',
        connectionMode: 'connectionMode',
        botId: 'botId',
        secret: 'secret',
        websocketUrl: 'websocketUrl',
        dmPolicy: 'dmPolicy',
        allowFrom: 'allowFrom',
        groupPolicy: 'groupPolicy',
        groupAllowFrom: 'groupAllowFrom',
        sendThinkingMessage: 'sendThinkingMessage',
    },
    'moltbot-popo': {
        enabled: 'enabled',
        connectionMode: 'connectionMode',
        appKey: 'appKey',
        appSecret: 'appSecret',
        token: 'token',
        aesKey: 'aesKey',
        webhookBaseUrl: 'webhookBaseUrl',
        webhookPath: 'webhookPath',
        webhookPort: 'webhookPort',
        dmPolicy: 'dmPolicy',
        allowFrom: 'allowFrom',
        groupPolicy: 'groupPolicy',
        groupAllowFrom: 'groupAllowFrom',
        textChunkLimit: 'textChunkLimit',
        richTextChunkLimit: 'richTextChunkLimit',
    },
};
const ACCOUNT_COMPAT_CHANNEL_TOP_LEVEL_CREDENTIAL_KEYS = {
    feishu: ['appId', 'appSecret'],
    dingtalk: ['clientId', 'clientSecret'],
    'dingtalk-connector': ['clientId', 'clientSecret'],
    qqbot: ['appId', 'appSecret', 'clientSecret', 'clientSecretFile'],
    wecom: ['botId', 'secret'],
    'moltbot-popo': ['appKey', 'appSecret', 'token', 'aesKey'],
};
const ACCOUNT_COMPAT_CHANNEL_ACCOUNT_CREDENTIAL_KEYS = {
    feishu: ['appId', 'appSecret'],
    dingtalk: ['clientId', 'clientSecret'],
    'dingtalk-connector': ['clientId', 'clientSecret'],
    qqbot: ['appId', 'clientSecret', 'appSecret', 'clientSecretFile'],
    wecom: ['botId', 'secret'],
    'moltbot-popo': ['appKey', 'appSecret', 'token', 'aesKey'],
};
function resolveMergeMode(value) {
    if (!value)
        return null;
    return value === 'overwrite' ? 'overwrite' : 'merge';
}
function resolveEnterprisePluginsSourceDir(configPath) {
    const pluginsDir = path_1.default.join(configPath, 'plugins');
    return fs_1.default.existsSync(pluginsDir) ? pluginsDir : null;
}
function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function normalizeOptionalString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function readAccountsFromChannelConfig(cfg) {
    if (!isRecord(cfg) || !isRecord(cfg.accounts))
        return null;
    const accounts = {};
    for (const [accountId, accountCfg] of Object.entries(cfg.accounts)) {
        if (isRecord(accountCfg)) {
            accounts[accountId] = accountCfg;
        }
    }
    return accounts;
}
function buildTopLevelAccountOverlay(channelKey, cfg) {
    if (!isRecord(cfg))
        return {};
    const keyMap = ACCOUNT_COMPAT_CHANNEL_TOP_LEVEL_MAP[channelKey];
    const overlay = {};
    for (const [accountKey, topLevelKey] of Object.entries(keyMap)) {
        if (Object.prototype.hasOwnProperty.call(cfg, topLevelKey)) {
            overlay[accountKey] = cfg[topLevelKey];
        }
    }
    return overlay;
}
function hasAccountCredentialFields(channelKey, cfg) {
    return ACCOUNT_COMPAT_CHANNEL_ACCOUNT_CREDENTIAL_KEYS[channelKey].some((key) => (Object.prototype.hasOwnProperty.call(cfg, key) && cfg[key] !== undefined && cfg[key] !== null && cfg[key] !== ''));
}
function normalizeMultiAccountChannelConfig(channelKey, cfg, fallbackAccounts) {
    if (!isRecord(cfg))
        return cfg;
    const overlay = buildTopLevelAccountOverlay(channelKey, cfg);
    const currentAccounts = readAccountsFromChannelConfig(cfg) ?? fallbackAccounts;
    if (!currentAccounts || Object.keys(currentAccounts).length === 0) {
        return cfg;
    }
    if (Object.keys(overlay).length === 0) {
        return cfg;
    }
    const normalizedAccounts = {};
    for (const [accountId, accountCfg] of Object.entries(currentAccounts)) {
        if (accountId === 'default' && !hasAccountCredentialFields(channelKey, accountCfg)) {
            continue;
        }
        normalizedAccounts[accountId] = { ...accountCfg, ...overlay };
    }
    return {
        ...cfg,
        accounts: normalizedAccounts,
    };
}
function stripTopLevelAccountCredentialFields(channelKey, cfg) {
    const accounts = readAccountsFromChannelConfig(cfg);
    if (!isRecord(cfg) || !accounts) {
        return cfg;
    }
    const sanitized = { ...cfg };
    if (accounts.default && !hasAccountCredentialFields(channelKey, accounts.default)) {
        const sanitizedAccounts = { ...accounts };
        delete sanitizedAccounts.default;
        sanitized.accounts = sanitizedAccounts;
    }
    const stripKeys = channelKey === 'wecom'
        ? Object.values(ACCOUNT_COMPAT_CHANNEL_TOP_LEVEL_MAP.wecom)
        : ACCOUNT_COMPAT_CHANNEL_TOP_LEVEL_CREDENTIAL_KEYS[channelKey];
    for (const key of stripKeys) {
        delete sanitized[key];
    }
    return sanitized;
}
function stripMergedChannelTopLevelAccountCredentialFields(config) {
    const channels = isRecord(config.channels) ? config.channels : null;
    if (!channels)
        return config;
    let changed = false;
    const sanitizedChannels = { ...channels };
    for (const channelKey of ACCOUNT_COMPAT_CHANNEL_KEYS) {
        const channelCfg = channels[channelKey];
        const sanitizedCfg = stripTopLevelAccountCredentialFields(channelKey, channelCfg);
        if (sanitizedCfg !== channelCfg) {
            changed = true;
            sanitizedChannels[channelKey] = sanitizedCfg;
        }
    }
    return changed
        ? { ...config, channels: sanitizedChannels }
        : config;
}
/**
 * Check if an enterprise config package exists at the well-known path.
 * Returns the directory path if manifest.json is found, null otherwise.
 */
function resolveEnterpriseConfigPath() {
    const configPath = path_1.default.join(electron_1.app.getPath('userData'), ENTERPRISE_CONFIG_DIR);
    const manifestPath = path_1.default.join(configPath, MANIFEST_FILE);
    if (fs_1.default.existsSync(manifestPath)) {
        return configPath;
    }
    return null;
}
/**
 * Read the enterprise config package and sync into SQLite.
 * Called once on startup, before openclawConfigSync.
 */
function syncEnterpriseConfig(configPath, store, imStore, mcpUpsertByName, mcpClearAll, coworkSetConfig, getWorkingDirectory, syncAgent) {
    const manifestPath = path_1.default.join(configPath, MANIFEST_FILE);
    let manifest;
    try {
        const raw = fs_1.default.readFileSync(manifestPath, 'utf-8');
        manifest = JSON.parse(raw);
    }
    catch (error) {
        console.error('[Enterprise] failed to parse manifest.json, skipping enterprise config:', error);
        return null;
    }
    console.log(`[Enterprise] detected enterprise config: ${manifest.name} v${manifest.version}`);
    try {
        console.log(`[Enterprise] manifest: ${JSON.stringify(manifest, null, 2)}`);
    }
    catch { /* ignore serialization errors */ }
    // Check if enterprise config version has changed since last sync.
    // Skip file copy operations (skills, agents) if version is unchanged.
    const previousManifest = store.get('enterprise_config');
    const versionChanged = previousManifest?.version !== manifest.version;
    store.set('enterprise_config', manifest);
    if (manifest.autoAcceptPrivacy) {
        store.set('privacy_agreed', true);
    }
    // SQLite writes are cheap — always sync to ensure consistency.
    if (manifest.sync.openclaw) {
        syncModelConfig(configPath, store);
        syncIMChannels(configPath, imStore);
        syncCoworkConfig(configPath, coworkSetConfig);
        syncOpenClawAgentList(configPath, syncAgent);
    }
    const agentsForce = manifest.sync.agents === 'force';
    const pluginsMode = resolveMergeMode(manifest.sync.plugins);
    // File copy operations — only run when version changes to avoid
    // unnecessary I/O on every startup.
    if (versionChanged) {
        if (manifest.sync.skills) {
            const skillsMode = manifest.sync.skills === 'overwrite' ? 'overwrite' : 'merge';
            syncSkills(configPath, store, skillsMode);
        }
        if (manifest.sync.agents) {
            syncAgents(configPath, getWorkingDirectory(), agentsForce);
        }
        if (pluginsMode) {
            syncPlugins(configPath, pluginsMode);
        }
        if (manifest.sync.mcp) {
            const mcpMode = manifest.sync.mcp === 'overwrite' ? 'overwrite' : 'merge';
            syncMcpServers(configPath, mcpUpsertByName, mcpClearAll, mcpMode);
        }
    }
    else {
        // Agents: force mode always copies, default mode only copies missing files
        if (manifest.sync.agents) {
            syncAgents(configPath, getWorkingDirectory(), agentsForce);
        }
        if (pluginsMode) {
            syncPlugins(configPath, pluginsMode);
        }
        console.log('[Enterprise] version unchanged, skipping file copy for skills and MCP');
    }
    console.log('[Enterprise] config sync completed');
    return manifest;
}
const API_FORMAT_MAP = {
    'anthropic-messages': 'anthropic',
    'openai-completions': 'openai',
};
/**
 * Reverse-map openclaw.json models.providers → app_config.providers.
 * Enterprise openclaw.json should use real provider names as keys
 * (e.g., 'deepseek', 'anthropic') instead of the generic 'lobster'.
 */
function syncModelConfig(configPath, store) {
    const openclawPath = path_1.default.join(configPath, 'openclaw.json');
    if (!fs_1.default.existsSync(openclawPath)) {
        console.log('[Enterprise] no openclaw.json found, skipping model config sync');
        return;
    }
    try {
        const raw = fs_1.default.readFileSync(openclawPath, 'utf-8');
        const config = JSON.parse(raw);
        const models = config.models;
        const agents = config.agents;
        if (!models?.providers || Object.keys(models.providers).length === 0) {
            console.log('[Enterprise] no models.providers in openclaw.json, skipping model config sync');
            return;
        }
        // Build app_config.providers from openclaw providers
        const appProviders = {};
        const allModels = [];
        for (const [providerId, providerConfig] of Object.entries(models.providers)) {
            const apiFormat = API_FORMAT_MAP[providerConfig.api] ?? 'anthropic';
            const providerModels = (providerConfig.models ?? []).map((m) => ({
                id: m.id,
                name: m.name ?? m.id,
                supportsImage: Array.isArray(m.input) && m.input.includes('image'),
            }));
            // Resolve apiKey: use plain text value, skip placeholders like ${LOBSTER_...}
            const apiKey = typeof providerConfig.apiKey === 'string' && !providerConfig.apiKey.startsWith('${')
                ? providerConfig.apiKey
                : '';
            appProviders[providerId] = {
                enabled: true,
                apiKey,
                baseUrl: providerConfig.baseUrl ?? '',
                apiFormat,
                models: providerModels,
            };
            for (const m of providerModels) {
                allModels.push({ ...m, provider: providerId, providerKey: providerId });
            }
        }
        // Resolve default model from agents.defaults.model.primary ("provider/modelId")
        let defaultModel = allModels[0]?.id ?? '';
        let defaultModelProvider = Object.keys(appProviders)[0] ?? '';
        const primary = agents?.defaults?.model?.primary;
        if (primary && primary.includes('/')) {
            const slashIdx = primary.indexOf('/');
            defaultModelProvider = primary.slice(0, slashIdx);
            defaultModel = primary.slice(slashIdx + 1);
        }
        // Resolve api config from default provider
        const defaultProvider = appProviders[defaultModelProvider];
        const apiKey = defaultProvider?.apiKey ?? '';
        const baseUrl = defaultProvider?.baseUrl ?? '';
        // Merge with existing app_config to preserve theme/language/etc
        const existing = store.get('app_config') ?? {};
        const appConfig = {
            ...existing,
            api: { key: apiKey, baseUrl },
            model: {
                availableModels: allModels,
                defaultModel,
                defaultModelProvider,
            },
            providers: appProviders,
        };
        store.set('app_config', appConfig);
        console.log(`[Enterprise] synced ${Object.keys(appProviders).length} provider(s) to app_config`);
    }
    catch (error) {
        console.error('[Enterprise] failed to sync model config:', error);
    }
}
function syncIMChannels(configPath, imStore) {
    const openclawPath = path_1.default.join(configPath, 'openclaw.json');
    if (!fs_1.default.existsSync(openclawPath)) {
        console.log('[Enterprise] no openclaw.json found, skipping IM channel sync');
        return;
    }
    try {
        const raw = fs_1.default.readFileSync(openclawPath, 'utf-8');
        const config = JSON.parse(raw);
        const channels = config.channels;
        if (!channels) {
            console.log('[Enterprise] no channels in openclaw.json, skipping IM sync');
            return;
        }
        const resolveInstanceId = (accountId, instances) => {
            const existing = instances.find((inst) => (inst.instanceId === accountId
                || inst.instanceId.startsWith(accountId)
                || inst.instanceId.slice(0, 8) === accountId));
            return existing?.instanceId ?? accountId;
        };
        const syncAccountConfigs = (cfg, instances, setInstanceConfig, mapAccountConfig, channelKey) => {
            const accounts = readAccountsFromChannelConfig(normalizeMultiAccountChannelConfig(channelKey, cfg));
            if (!accounts)
                return false;
            for (const [accountId, accountCfg] of Object.entries(accounts)) {
                setInstanceConfig(resolveInstanceId(accountId, instances), mapAccountConfig(accountId, accountCfg));
            }
            return true;
        };
        // Use platform-specific setters so values are merged with defaults.
        // For multi-instance platforms (feishu, dingtalk, qq, wecom), update existing
        // instances when present so enterprise config changes propagate correctly.
        const PLATFORM_SETTERS = {
            'telegram': (cfg) => {
                if (cfg && Array.isArray(cfg.instances)) {
                    imStore.setTelegramMultiInstanceConfig(cfg);
                    return;
                }
                imStore.setTelegramOpenClawConfig(cfg);
            },
            'discord': (cfg) => {
                if (cfg && Array.isArray(cfg.instances)) {
                    imStore.setDiscordMultiInstanceConfig(cfg);
                    return;
                }
                imStore.setDiscordOpenClawConfig(cfg);
            },
            'feishu': (cfg) => {
                const instances = imStore.getFeishuInstances();
                if (syncAccountConfigs(cfg, instances, (instanceId, config) => imStore.setFeishuInstanceConfig(instanceId, config), (accountId, accountCfg) => ({
                    enabled: accountCfg.enabled,
                    instanceName: typeof accountCfg.name === 'string' ? accountCfg.name : accountId,
                    appId: accountCfg.appId,
                    appSecret: accountCfg.appSecret,
                    domain: accountCfg.domain,
                    dmPolicy: accountCfg.dmPolicy,
                    allowFrom: accountCfg.allowFrom,
                    groupPolicy: accountCfg.groupPolicy,
                    groupAllowFrom: accountCfg.groupAllowFrom,
                    groups: accountCfg.groups,
                    historyLimit: accountCfg.historyLimit,
                    streaming: accountCfg.streaming,
                    replyMode: accountCfg.replyMode,
                    blockStreaming: accountCfg.blockStreaming,
                    footer: accountCfg.footer,
                    blockStreamingCoalesce: accountCfg.blockStreamingCoalesce,
                    mediaMaxMb: accountCfg.mediaMaxMb,
                }), 'feishu')) {
                    return;
                }
                if (instances.length > 0) {
                    for (const inst of instances) {
                        imStore.setFeishuInstanceConfig(inst.instanceId, cfg);
                    }
                }
                else {
                    imStore.setFeishuOpenClawConfig(cfg);
                }
            },
            'dingtalk': (cfg) => {
                const instances = imStore.getDingTalkInstances();
                if (syncAccountConfigs(cfg, instances, (instanceId, config) => imStore.setDingTalkInstanceConfig(instanceId, config), (accountId, accountCfg) => ({
                    enabled: accountCfg.enabled,
                    instanceName: typeof accountCfg.name === 'string' ? accountCfg.name : accountId,
                    clientId: accountCfg.clientId,
                    clientSecret: accountCfg.clientSecret,
                    dmPolicy: accountCfg.dmPolicy,
                    allowFrom: accountCfg.allowFrom,
                    groupPolicy: accountCfg.groupPolicy,
                    sessionTimeout: accountCfg.sessionTimeout,
                    separateSessionByConversation: accountCfg.separateSessionByConversation,
                    groupSessionScope: accountCfg.groupSessionScope,
                    sharedMemoryAcrossConversations: accountCfg.sharedMemoryAcrossConversations,
                    gatewayBaseUrl: accountCfg.gatewayBaseUrl,
                }), 'dingtalk')) {
                    return;
                }
                if (instances.length > 0) {
                    for (const inst of instances) {
                        imStore.setDingTalkInstanceConfig(inst.instanceId, cfg);
                    }
                }
                else {
                    imStore.setDingTalkOpenClawConfig(cfg);
                }
            },
            'dingtalk-connector': (cfg) => {
                const instances = imStore.getDingTalkInstances();
                if (syncAccountConfigs(cfg, instances, (instanceId, config) => imStore.setDingTalkInstanceConfig(instanceId, config), (accountId, accountCfg) => ({
                    enabled: accountCfg.enabled,
                    instanceName: typeof accountCfg.name === 'string' ? accountCfg.name : accountId,
                    clientId: accountCfg.clientId,
                    clientSecret: accountCfg.clientSecret,
                    dmPolicy: accountCfg.dmPolicy,
                    allowFrom: accountCfg.allowFrom,
                    groupPolicy: accountCfg.groupPolicy,
                    sessionTimeout: accountCfg.sessionTimeout,
                    separateSessionByConversation: accountCfg.separateSessionByConversation,
                    groupSessionScope: accountCfg.groupSessionScope,
                    sharedMemoryAcrossConversations: accountCfg.sharedMemoryAcrossConversations,
                    gatewayBaseUrl: accountCfg.gatewayBaseUrl,
                }), 'dingtalk-connector')) {
                    return;
                }
                if (instances.length > 0) {
                    for (const inst of instances) {
                        imStore.setDingTalkInstanceConfig(inst.instanceId, cfg);
                    }
                }
                else {
                    imStore.setDingTalkOpenClawConfig(cfg);
                }
            },
            'qqbot': (cfg) => {
                const instances = imStore.getQQInstances();
                if (syncAccountConfigs(cfg, instances, (instanceId, config) => imStore.setQQInstanceConfig(instanceId, config), (accountId, accountCfg) => ({
                    enabled: accountCfg.enabled,
                    instanceName: typeof accountCfg.name === 'string' ? accountCfg.name : accountId,
                    appId: accountCfg.appId,
                    appSecret: accountCfg.clientSecret ?? accountCfg.appSecret,
                    dmPolicy: accountCfg.dmPolicy,
                    allowFrom: accountCfg.allowFrom,
                    groupPolicy: accountCfg.groupPolicy,
                    groupAllowFrom: accountCfg.groupAllowFrom,
                    historyLimit: accountCfg.historyLimit,
                    markdownSupport: accountCfg.markdownSupport,
                    imageServerBaseUrl: accountCfg.imageServerBaseUrl,
                }), 'qqbot')) {
                    return;
                }
                if (instances.length > 0) {
                    for (const inst of instances) {
                        imStore.setQQInstanceConfig(inst.instanceId, cfg);
                    }
                }
                else {
                    imStore.setQQConfig(cfg);
                }
            },
            'wecom': (cfg) => {
                const instances = imStore.getWecomInstances();
                if (syncAccountConfigs(cfg, instances, (instanceId, config) => imStore.setWecomInstanceConfig(instanceId, config), (accountId, accountCfg) => ({
                    enabled: accountCfg.enabled,
                    instanceName: typeof accountCfg.name === 'string' ? accountCfg.name : accountId,
                    botId: accountCfg.botId,
                    secret: accountCfg.secret,
                    dmPolicy: accountCfg.dmPolicy,
                    allowFrom: accountCfg.allowFrom,
                    groupPolicy: accountCfg.groupPolicy,
                    groupAllowFrom: accountCfg.groupAllowFrom,
                    sendThinkingMessage: accountCfg.sendThinkingMessage,
                }), 'wecom')) {
                    return;
                }
                if (instances.length > 0) {
                    for (const inst of instances) {
                        imStore.setWecomInstanceConfig(inst.instanceId, cfg);
                    }
                }
                else {
                    imStore.setWecomConfig(cfg);
                }
            },
            'moltbot-popo': (cfg) => {
                const normalizedCfg = normalizeMultiAccountChannelConfig('moltbot-popo', cfg);
                const accounts = readAccountsFromChannelConfig(normalizedCfg);
                if (accounts) {
                    const instances = Object.entries(accounts).map(([accountId, accountCfg], idx) => ({
                        ...accountCfg,
                        instanceId: accountId,
                        instanceName: accountCfg.name || `POPO Bot ${idx + 1}`,
                    }));
                    imStore.setPopoMultiInstanceConfig({ instances });
                    return;
                }
                // Legacy single-account format: wrap as first instance
                const { randomUUID } = require('crypto');
                const instanceId = randomUUID();
                imStore.setPopoInstanceConfig(instanceId, {
                    ...cfg,
                    instanceId,
                    instanceName: 'POPO Bot 1',
                });
            },
            'nim': (cfg) => {
                if (cfg && typeof cfg.accounts === 'object' && !Array.isArray(cfg.accounts)) {
                    imStore.setNimMultiInstanceConfig({ instances: Object.values(cfg.accounts) });
                    return;
                }
                if (cfg && Array.isArray(cfg.instances)) {
                    imStore.setNimMultiInstanceConfig(cfg);
                    return;
                }
                imStore.setNimConfig(cfg);
            },
            'openclaw-weixin': (cfg) => imStore.setWeixinConfig(cfg),
            'netease-bee': (cfg) => imStore.setNeteaseBeeChanConfig(cfg),
        };
        let syncedCount = 0;
        for (const [channelKey, channelConfig] of Object.entries(channels)) {
            const setter = PLATFORM_SETTERS[channelKey];
            if (!setter) {
                console.warn(`[Enterprise] unknown channel key "${channelKey}", skipping`);
                continue;
            }
            setter(channelConfig);
            syncedCount++;
        }
        console.log(`[Enterprise] synced ${syncedCount} IM channel(s) to im_config`);
    }
    catch (error) {
        console.error('[Enterprise] failed to sync IM channels:', error);
    }
}
function syncCoworkConfig(configPath, setConfig) {
    const openclawPath = path_1.default.join(configPath, 'openclaw.json');
    if (!fs_1.default.existsSync(openclawPath))
        return;
    try {
        const raw = fs_1.default.readFileSync(openclawPath, 'utf-8');
        const config = JSON.parse(raw);
        const agents = config.agents;
        const updates = {};
        updates.agentEngine = 'openclaw';
        if (agents?.defaults?.sandbox?.mode) {
            const mapped = SANDBOX_MODE_MAP[agents.defaults.sandbox.mode];
            if (mapped) {
                updates.executionMode = mapped;
            }
        }
        if (agents?.defaults?.cwd) {
            updates.workingDirectory = agents.defaults.cwd;
        }
        setConfig(updates);
        console.log(`[Enterprise] synced cowork config: ${JSON.stringify(updates)}`);
    }
    catch (error) {
        console.error('[Enterprise] failed to sync cowork config:', error);
    }
}
function readEnterpriseAgentConfig(entry) {
    if (!isRecord(entry))
        return null;
    const id = normalizeOptionalString(entry.id);
    if (!id)
        return null;
    const identity = isRecord(entry.identity) ? entry.identity : {};
    const model = isRecord(entry.model) ? entry.model : {};
    const skills = Array.isArray(entry.skills)
        ? entry.skills.filter((skill) => typeof skill === 'string' && skill.trim().length > 0)
        : [];
    return {
        id,
        name: normalizeOptionalString(identity.name) ?? id,
        description: normalizeOptionalString(entry.description),
        systemPrompt: normalizeOptionalString(entry.systemPrompt),
        identity: normalizeOptionalString(entry.instructions) ?? normalizeOptionalString(entry.identityText),
        model: normalizeOptionalString(model.primary) ?? '',
        icon: normalizeOptionalString(identity.emoji) ?? '',
        skillIds: skills,
        enabled: entry.enabled !== false,
        isDefault: entry.default === true || id === 'main',
    };
}
function syncOpenClawAgentList(configPath, syncAgent) {
    if (!syncAgent)
        return;
    const openclawPath = path_1.default.join(configPath, 'openclaw.json');
    if (!fs_1.default.existsSync(openclawPath))
        return;
    try {
        const raw = fs_1.default.readFileSync(openclawPath, 'utf-8');
        const config = JSON.parse(raw);
        const agents = isRecord(config.agents) ? config.agents : null;
        const list = Array.isArray(agents?.list) ? agents.list : [];
        let syncedCount = 0;
        for (const entry of list) {
            const agent = readEnterpriseAgentConfig(entry);
            if (!agent)
                continue;
            syncAgent(agent);
            syncedCount++;
        }
        if (syncedCount > 0) {
            console.log(`[Enterprise] synced ${syncedCount} agent config(s) to Lobster agents`);
        }
    }
    catch (error) {
        console.error('[Enterprise] failed to sync OpenClaw agents:', error);
    }
}
function syncSkills(configPath, store, mode) {
    const skillsDir = path_1.default.join(configPath, 'skills');
    if (!fs_1.default.existsSync(skillsDir)) {
        console.log('[Enterprise] no skills/ directory found, skipping skills sync');
        return;
    }
    const userDataSkillsDir = path_1.default.join(electron_1.app.getPath('userData'), 'SKILLs');
    if (!fs_1.default.existsSync(userDataSkillsDir)) {
        fs_1.default.mkdirSync(userDataSkillsDir, { recursive: true });
    }
    // In overwrite mode, remove all existing non-bundled skills first
    if (mode === 'overwrite') {
        const existingEntries = fs_1.default.readdirSync(userDataSkillsDir, { withFileTypes: true });
        for (const entry of existingEntries) {
            if (!entry.isDirectory())
                continue;
            const dirPath = path_1.default.join(userDataSkillsDir, entry.name);
            try {
                fs_1.default.rmSync(dirPath, { recursive: true, force: true });
            }
            catch (error) {
                console.warn(`[Enterprise] failed to remove existing skill "${entry.name}":`, error);
            }
        }
    }
    const entries = fs_1.default.readdirSync(skillsDir, { withFileTypes: true });
    const skillNames = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const src = path_1.default.join(skillsDir, entry.name);
        const dest = path_1.default.join(userDataSkillsDir, entry.name);
        try {
            copyDirRecursive(src, dest);
            skillNames.push(entry.name);
        }
        catch (error) {
            console.warn(`[Enterprise] failed to copy skill "${entry.name}":`, error);
        }
    }
    if (skillNames.length > 0) {
        try {
            const existing = mode === 'overwrite'
                ? {}
                : (store.get('skills_state') ?? {});
            for (const name of skillNames) {
                existing[name] = { enabled: true };
            }
            store.set('skills_state', existing);
        }
        catch (error) {
            console.warn('[Enterprise] failed to update skills_state:', error);
        }
    }
    console.log(`[Enterprise] synced ${skillNames.length} skill(s) (mode: ${mode})`);
}
function copyDirRecursive(src, dest) {
    if (!fs_1.default.existsSync(dest)) {
        fs_1.default.mkdirSync(dest, { recursive: true });
    }
    const entries = fs_1.default.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path_1.default.join(src, entry.name);
        const destPath = path_1.default.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        }
        else {
            fs_1.default.copyFileSync(srcPath, destPath);
        }
    }
}
function syncAgents(configPath, workspaceDir, force) {
    const agentsDir = path_1.default.join(configPath, 'agents');
    if (!fs_1.default.existsSync(agentsDir)) {
        console.log('[Enterprise] no agents/ directory found, skipping agents sync');
        return;
    }
    const targetDir = workspaceDir || path_1.default.join(electron_1.app.getPath('home'), '.openclaw', 'workspace');
    if (!fs_1.default.existsSync(targetDir)) {
        try {
            fs_1.default.mkdirSync(targetDir, { recursive: true });
        }
        catch (error) {
            console.warn(`[Enterprise] failed to prepare agents workspace at ${targetDir}, skipping agents sync:`, error);
            return;
        }
    }
    // Copy all files from enterprise agents/ to workspace directory
    const entries = fs_1.default.readdirSync(agentsDir, { withFileTypes: true });
    let copiedCount = 0;
    for (const entry of entries) {
        const src = path_1.default.join(agentsDir, entry.name);
        const dest = path_1.default.join(targetDir, entry.name);
        // Default: only copy if target does not exist (preserve user modifications)
        // Force: always overwrite
        if (!force && fs_1.default.existsSync(dest))
            continue;
        try {
            if (entry.isDirectory()) {
                copyDirRecursive(src, dest);
            }
            else {
                fs_1.default.copyFileSync(src, dest);
            }
            copiedCount++;
        }
        catch (error) {
            console.warn(`[Enterprise] failed to copy agent file "${entry.name}":`, error);
        }
    }
    console.log(`[Enterprise] synced ${copiedCount} agent file(s) to ${targetDir}`);
}
function syncMcpServers(configPath, upsertByName, clearAll, mode) {
    const mcpPath = path_1.default.join(configPath, 'mcp', 'servers.json');
    if (!fs_1.default.existsSync(mcpPath)) {
        console.log('[Enterprise] no mcp/servers.json found, skipping MCP sync');
        return;
    }
    try {
        const raw = fs_1.default.readFileSync(mcpPath, 'utf-8');
        const servers = JSON.parse(raw);
        if (!Array.isArray(servers)) {
            console.warn('[Enterprise] mcp/servers.json is not an array, skipping');
            return;
        }
        if (mode === 'overwrite') {
            clearAll();
        }
        let syncedCount = 0;
        for (const server of servers) {
            if (!server.name) {
                console.warn('[Enterprise] MCP server entry missing name, skipping');
                continue;
            }
            try {
                upsertByName({
                    name: server.name,
                    description: server.description || '',
                    transportType: server.transportType || 'stdio',
                    command: server.command,
                    args: server.args,
                    env: server.env,
                });
                syncedCount++;
            }
            catch (error) {
                console.warn(`[Enterprise] failed to upsert MCP server "${server.name}":`, error);
            }
        }
        console.log(`[Enterprise] synced ${syncedCount} MCP server(s) (mode: ${mode})`);
    }
    catch (error) {
        console.error('[Enterprise] failed to sync MCP servers:', error);
    }
}
function syncPlugins(configPath, mode) {
    const pluginsDir = resolveEnterprisePluginsSourceDir(configPath);
    if (!pluginsDir) {
        console.log('[Enterprise] no plugins/ directory found, skipping plugin sync');
        return;
    }
    const pluginCount = fs_1.default.readdirSync(pluginsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
    console.log(`[Enterprise] registered ${pluginCount} plugin(s) from ${pluginsDir} (mode: ${mode})`);
}
/**
 * Deep merge source into target. Source values win on conflict.
 * Arrays are replaced (not concatenated).
 */
function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        const srcVal = source[key];
        const tgtVal = result[key];
        if (srcVal && typeof srcVal === 'object' && !Array.isArray(srcVal) &&
            tgtVal && typeof tgtVal === 'object' && !Array.isArray(tgtVal)) {
            result[key] = deepMerge(tgtVal, srcVal);
        }
        else {
            result[key] = srcVal;
        }
    }
    return result;
}
function readPluginLoadPaths(config) {
    const plugins = config.plugins;
    if (!plugins || typeof plugins !== 'object' || Array.isArray(plugins)) {
        return [];
    }
    const load = plugins.load;
    if (!load || typeof load !== 'object' || Array.isArray(load)) {
        return [];
    }
    const paths = load.paths;
    if (!Array.isArray(paths)) {
        return [];
    }
    return paths.filter((value) => typeof value === 'string' && value.length > 0);
}
function stripPluginIndexManagedKeys(config) {
    if (!isRecord(config.plugins))
        return config;
    const managedKeys = constants_1.OPENCLAW_PLUGIN_INDEX_MANAGED_KEYS;
    const plugins = Object.fromEntries(Object.entries(config.plugins).filter(([key]) => !managedKeys.includes(key)));
    if (Object.keys(plugins).length === 0) {
        const { plugins: _plugins, ...rest } = config;
        return rest;
    }
    return { ...config, plugins };
}
function mergeOpenClawConfigs(runtimeConfig, enterpriseConfig) {
    const normalizedEnterpriseConfig = { ...enterpriseConfig };
    const runtimeChannels = isRecord(runtimeConfig.channels) ? runtimeConfig.channels : null;
    const enterpriseChannels = isRecord(enterpriseConfig.channels) ? enterpriseConfig.channels : null;
    if (enterpriseChannels) {
        const normalizedChannels = { ...enterpriseChannels };
        for (const channelKey of ACCOUNT_COMPAT_CHANNEL_KEYS) {
            const enterpriseChannelCfg = enterpriseChannels[channelKey];
            if (!enterpriseChannelCfg)
                continue;
            const runtimeChannelCfg = runtimeChannels?.[channelKey];
            normalizedChannels[channelKey] = normalizeMultiAccountChannelConfig(channelKey, enterpriseChannelCfg, readAccountsFromChannelConfig(runtimeChannelCfg));
        }
        normalizedEnterpriseConfig.channels = normalizedChannels;
    }
    const merged = stripMergedChannelTopLevelAccountCredentialFields(deepMerge(runtimeConfig, normalizedEnterpriseConfig));
    const mergedPluginLoadPaths = Array.from(new Set([
        ...readPluginLoadPaths(runtimeConfig),
        ...readPluginLoadPaths(normalizedEnterpriseConfig),
    ]));
    if (mergedPluginLoadPaths.length === 0) {
        return stripPluginIndexManagedKeys(merged);
    }
    const existingPlugins = merged.plugins;
    const plugins = existingPlugins && typeof existingPlugins === 'object' && !Array.isArray(existingPlugins)
        ? { ...existingPlugins }
        : {};
    const existingLoad = plugins.load;
    const load = existingLoad && typeof existingLoad === 'object' && !Array.isArray(existingLoad)
        ? { ...existingLoad }
        : {};
    load.paths = mergedPluginLoadPaths;
    plugins.load = load;
    merged.plugins = plugins;
    return stripPluginIndexManagedKeys(merged);
}
/**
 * Merge enterprise openclaw.json fields into the runtime-generated openclaw.json.
 * Called AFTER openclawConfigSync generates the runtime config.
 * Enterprise values override generated values; fields not in enterprise config are preserved.
 */
function mergeEnterpriseOpenclawConfig(runtimeConfigPath) {
    const enterprisePath = resolveEnterpriseConfigPath();
    if (!enterprisePath)
        return false;
    const enterpriseOpenclawPath = path_1.default.join(enterprisePath, 'openclaw.json');
    if (!fs_1.default.existsSync(enterpriseOpenclawPath) || !fs_1.default.existsSync(runtimeConfigPath))
        return false;
    try {
        const runtimeRaw = fs_1.default.readFileSync(runtimeConfigPath, 'utf-8');
        const runtimeConfig = JSON.parse(runtimeRaw);
        const enterpriseRaw = fs_1.default.readFileSync(enterpriseOpenclawPath, 'utf-8');
        const enterpriseConfig = JSON.parse(enterpriseRaw);
        const merged = mergeOpenClawConfigs(runtimeConfig, enterpriseConfig);
        const currentNormalized = `${JSON.stringify(runtimeConfig, null, 2)}\n`;
        const mergedRaw = `${JSON.stringify(merged, null, 2)}\n`;
        if (currentNormalized === mergedRaw)
            return false;
        const existingMode = fs_1.default.statSync(runtimeConfigPath).mode & 0o777;
        (0, safeFileReplace_1.safelyReplaceTextFileSync)({
            filePath: runtimeConfigPath,
            content: mergedRaw,
            mode: existingMode,
            tempLabel: 'enterprise-merge',
        });
        console.log('[Enterprise] merged enterprise openclaw.json into runtime config');
        return true;
    }
    catch (error) {
        console.error('[Enterprise] failed to merge enterprise openclaw.json:', error);
        return false;
    }
}
//# sourceMappingURL=enterpriseConfigSync.js.map