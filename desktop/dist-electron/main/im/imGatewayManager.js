"use strict";
/**
 * IM Gateway Manager
 * Unified manager for DingTalk, Feishu, NIM gateways
 * and Telegram, Discord, QQ, WeCom, Weixin, POPO, NeteaseBee via OpenClaw
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.IMGatewayManager = void 0;
const events_1 = require("events");
const coworkErrorClassify_1 = require("../../common/coworkErrorClassify");
const i18n_1 = require("../i18n");
const http_1 = require("./http");
const imChatHandler_1 = require("./imChatHandler");
const imCoworkHandler_1 = require("./imCoworkHandler");
const imDeliveryRoute_1 = require("./imDeliveryRoute");
const imScheduledTaskHandler_1 = require("./imScheduledTaskHandler");
const imStore_1 = require("./imStore");
const nimGateway_1 = require("./nimGateway");
const DINGTALK_OPENCLAW_CHANNEL = 'dingtalk-connector';
const WEIXIN_OPENCLAW_CHANNEL = 'openclaw-weixin';
const WEIXIN_ALREADY_CONNECTED_MESSAGE = '已连接过此 OpenClaw';
const CONNECTIVITY_TIMEOUT_MS = 10_000;
const INBOUND_ACTIVITY_WARN_AFTER_MS = 2 * 60 * 1000;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readString(value) {
    return typeof value === 'string' && value.trim() ? value : null;
}
function readNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function isWeixinAlreadyConnectedMessage(message) {
    return Boolean(message?.includes(WEIXIN_ALREADY_CONNECTED_MESSAGE));
}
class IMGatewayManager extends events_1.EventEmitter {
    nimGateway;
    imStore;
    chatHandler = null;
    coworkHandler = null;
    getLLMConfig = null;
    getSkillsPrompt = null;
    ensureCoworkReady = null;
    syncOpenClawConfig = null;
    ensureOpenClawGatewayConnected = null;
    getOpenClawGatewayClient = null;
    ensureOpenClawGatewayReady = null;
    getOpenClawSessionKeysForCoworkSession = null;
    createScheduledTask = null;
    // Cowork dependencies
    coworkRuntime = null;
    coworkStore = null;
    // DingTalk direct HTTP API token cache
    dingTalkAccessToken = null;
    dingTalkAccessTokenExpiry = 0;
    constructor(db, options) {
        super();
        this.imStore = new imStore_1.IMStore(db);
        this.nimGateway = new nimGateway_1.NimGateway();
        // Store Cowork dependencies if provided
        if (options?.coworkRuntime && options?.coworkStore) {
            this.coworkRuntime = options.coworkRuntime;
            this.coworkStore = options.coworkStore;
        }
        this.ensureCoworkReady = options?.ensureCoworkReady ?? null;
        this.syncOpenClawConfig = options?.syncOpenClawConfig ?? null;
        this.ensureOpenClawGatewayConnected = options?.ensureOpenClawGatewayConnected ?? null;
        this.getOpenClawGatewayClient = options?.getOpenClawGatewayClient ?? null;
        this.ensureOpenClawGatewayReady = options?.ensureOpenClawGatewayReady ?? null;
        this.getOpenClawSessionKeysForCoworkSession = options?.getOpenClawSessionKeysForCoworkSession ?? null;
        this.createScheduledTask = options?.createScheduledTask ?? null;
        // Forward gateway events
        this.setupGatewayEventForwarding();
    }
    /**
     * Set up event forwarding from gateways
     */
    setupGatewayEventForwarding() {
        // DingTalk runs via OpenClaw; no direct gateway events to forward
        // NIM runs via OpenClaw; no direct gateway events to forward
        // netease-bee runs via OpenClaw; no direct gateway events to forward
        // QQ runs via OpenClaw; no direct gateway events to forward
        // WeCom runs via OpenClaw; no direct gateway events to forward
        // Weixin runs via OpenClaw; no direct gateway events to forward
        // POPO runs via OpenClaw; no direct gateway events to forward
    }
    /**
     * Reconnect all disconnected gateways
     * Called when network is restored via IPC event
     */
    reconnectAllDisconnected() {
        console.log('[IMGatewayManager] Reconnecting all disconnected gateways...');
        // DingTalk runs via OpenClaw; no direct reconnect needed
        // NIM runs via OpenClaw; no direct reconnect needed
        // netease-bee runs via OpenClaw; no direct reconnect needed
        // QQ runs via OpenClaw; no direct reconnection needed
        // WeCom runs via OpenClaw; no direct reconnection needed
        // Weixin runs via OpenClaw; no direct reconnection needed
        // POPO runs via OpenClaw; no direct reconnection needed
    }
    /**
     * Initialize the manager with LLM and skills providers
     */
    initialize(options) {
        this.getLLMConfig = options.getLLMConfig;
        this.getSkillsPrompt = options.getSkillsPrompt ?? null;
        // Set up message handlers for gateways
        this.setupMessageHandlers();
    }
    /**
     * Set up message handlers for both gateways
     */
    setupMessageHandlers() {
        const messageHandler = async (message, replyFn) => {
            // Persist notification target whenever we receive a message
            this.persistNotificationTarget(message.platform);
            try {
                let response;
                // Always use Cowork mode if handler is available
                if (this.coworkHandler) {
                    if (this.ensureCoworkReady) {
                        await this.ensureCoworkReady();
                    }
                    console.log('[IMGatewayManager] Using Cowork mode for message processing');
                    response = await this.coworkHandler.processMessage(message);
                }
                else {
                    // Fallback to regular chat handler
                    if (!this.chatHandler) {
                        this.updateChatHandler();
                    }
                    if (!this.chatHandler) {
                        throw new Error('Chat handler not available');
                    }
                    response = await this.chatHandler.processMessage(message);
                }
                await replyFn(response);
            }
            catch (error) {
                console.error(`[IMGatewayManager] Error processing message: ${error.message}`);
                // Don't send "Replaced by a newer IM request" error to user, just log it
                if (error.message === 'Replaced by a newer IM request') {
                    return;
                }
                // Send error message to user
                try {
                    const errorKey = (0, coworkErrorClassify_1.classifyErrorKey)(error.message);
                    const friendlyMessage = errorKey ? (0, i18n_1.t)(errorKey) : error.message;
                    await replyFn(`${(0, i18n_1.t)('imErrorPrefix')}: ${friendlyMessage}`);
                }
                catch (replyError) {
                    console.error(`[IMGatewayManager] Failed to send error reply: ${replyError}`);
                }
            }
        };
        this.nimGateway.setMessageCallback(messageHandler);
    }
    /**
     * Persist the notification target for a platform after receiving a message.
     */
    persistNotificationTarget(platform) {
        try {
            let target = null;
            if (platform === 'nim') {
                target = this.nimGateway.getNotificationTarget();
            }
            // WeCom runs via OpenClaw; notification target not managed locally
            // Weixin runs via OpenClaw; notification target not managed locally
            // POPO runs via OpenClaw; notification target not managed locally
            if (target != null) {
                this.imStore.setNotificationTarget(platform, target);
            }
        }
        catch (err) {
            console.warn(`[IMGatewayManager] Failed to persist notification target for ${platform}:`, err.message);
        }
    }
    /**
     * Restore notification target from SQLite after gateway starts.
     */
    restoreNotificationTarget(platform) {
        try {
            const target = this.imStore.getNotificationTarget(platform);
            if (target == null)
                return;
            if (platform === 'nim') {
                this.nimGateway.setNotificationTarget(target);
            }
            // WeCom runs via OpenClaw; notification target not managed locally
            // Weixin runs via OpenClaw; notification target not managed locally
            // POPO runs via OpenClaw; notification target not managed locally
            console.log(`[IMGatewayManager] Restored notification target for ${platform}`);
        }
        catch (err) {
            console.warn(`[IMGatewayManager] Failed to restore notification target for ${platform}:`, err.message);
        }
    }
    /**
     * Update chat handler with current settings
     */
    updateChatHandler() {
        if (!this.getLLMConfig) {
            console.warn('[IMGatewayManager] LLM config provider not set');
            return;
        }
        const imSettings = this.imStore.getIMSettings();
        this.chatHandler = new imChatHandler_1.IMChatHandler({
            getLLMConfig: this.getLLMConfig,
            getSkillsPrompt: this.getSkillsPrompt || undefined,
            imSettings,
        });
        // Update or create Cowork handler if dependencies are available
        this.updateCoworkHandler();
    }
    /**
     * Update or create Cowork handler
     * Always creates handler if dependencies are available (Cowork mode is always enabled for IM)
     */
    updateCoworkHandler() {
        // Always create Cowork handler if we have the required dependencies
        if (this.coworkRuntime && this.coworkStore && !this.coworkHandler) {
            const detectScheduledTaskRequest = this.getLLMConfig && this.createScheduledTask
                ? (0, imScheduledTaskHandler_1.createIMScheduledTaskRequestDetector)({
                    getLLMConfig: this.getLLMConfig,
                })
                : undefined;
            this.coworkHandler = new imCoworkHandler_1.IMCoworkHandler({
                coworkRuntime: this.coworkRuntime,
                coworkStore: this.coworkStore,
                imStore: this.imStore,
                getSkillsPrompt: this.getSkillsPrompt || undefined,
                detectScheduledTaskRequest,
                createScheduledTask: this.createScheduledTask || undefined,
                sendAsyncReply: async (platform, conversationId, text) => {
                    return this.sendConversationReply(platform, conversationId, text);
                },
            });
            console.log('[IMGatewayManager] Cowork handler created');
        }
    }
    // ==================== Configuration ====================
    getConfig() {
        return this.imStore.getConfig();
    }
    getIMStore() {
        return this.imStore;
    }
    setConfig(config, options) {
        const previousConfig = this.imStore.getConfig();
        this.imStore.setConfig(config);
        // Update chat handler if settings changed
        if (config.settings) {
            this.updateChatHandler();
        }
        // NIM now runs via OpenClaw; config sync is handled by IPC handler
        // DingTalk now runs via OpenClaw; config sync is handled by IPC handler
        // Feishu now runs via OpenClaw; config sync is handled by IPC handler
        // Hot-update netease-bee config: sync OpenClaw config when credentials change.
        // Only perform sync when syncGateway is explicitly true (i.e. user clicked Save).
        if (options?.syncGateway && config['netease-bee']) {
            const oldNb = previousConfig['netease-bee'];
            const newNb = { ...oldNb, ...config['netease-bee'] };
            const credentialsChanged = newNb.clientId !== oldNb?.clientId ||
                newNb.secret !== oldNb?.secret;
            if (credentialsChanged) {
                console.log('[IMGatewayManager] netease-bee credentials changed, syncing OpenClaw config...');
                this.syncOpenClawConfig?.('im-config-change:netease-bee', {
                    restartGatewayIfRunning: options?.restartGatewayIfRunning,
                });
            }
        }
        // QQ runs via OpenClaw; config changes are synced via OpenClawConfigSync
        // WeCom runs via OpenClaw; config changes are synced via OpenClawConfigSync
        // Weixin runs via OpenClaw; config changes are synced via OpenClawConfigSync
        // POPO runs via OpenClaw; config changes are synced via OpenClawConfigSync
    }
    async restartGateway(platform) {
        console.log(`[IMGatewayManager] Restarting ${platform} gateway...`);
        await this.stopGateway(platform);
        await this.startGateway(platform);
        console.log(`[IMGatewayManager] ${platform} gateway restarted successfully`);
    }
    // ==================== Status ====================
    getStatus() {
        const config = this.getConfig();
        // Telegram runs via OpenClaw; reflect enabled+configured state per instance
        const telegramStatus = {
            instances: (config.telegram?.instances || []).map(inst => ({
                instanceId: inst.instanceId,
                instanceName: inst.instanceName,
                connected: Boolean(inst.enabled && inst.botToken),
                startedAt: null,
                lastError: null,
                botUsername: null,
                lastInboundAt: null,
                lastOutboundAt: null,
            })),
        };
        // Discord runs via OpenClaw; reflect enabled+configured state per instance
        const discordStatus = {
            instances: (config.discord?.instances || []).map(inst => ({
                instanceId: inst.instanceId,
                instanceName: inst.instanceName,
                connected: Boolean(inst.enabled && inst.botToken),
                starting: false,
                startedAt: null,
                lastError: null,
                botUsername: null,
                lastInboundAt: null,
                lastOutboundAt: null,
            })),
        };
        // DingTalk runs via OpenClaw; reflect enabled+configured state per instance
        const dingtalkStatus = {
            instances: (config.dingtalk?.instances || []).map(inst => ({
                instanceId: inst.instanceId,
                instanceName: inst.instanceName,
                connected: Boolean(inst.enabled && inst.clientId && inst.clientSecret),
                startedAt: null,
                lastError: null,
                lastInboundAt: null,
                lastOutboundAt: null,
            })),
        };
        // Feishu runs via OpenClaw; reflect enabled+configured state per instance
        const feishuStatus = {
            instances: (config.feishu?.instances || []).map(inst => ({
                instanceId: inst.instanceId,
                instanceName: inst.instanceName,
                connected: Boolean(inst.enabled && inst.appId && inst.appSecret),
                startedAt: null,
                botOpenId: null,
                error: null,
                lastInboundAt: null,
                lastOutboundAt: null,
            })),
        };
        return {
            dingtalk: dingtalkStatus,
            feishu: feishuStatus,
            telegram: telegramStatus,
            qq: {
                instances: (config.qq?.instances || []).map(inst => ({
                    instanceId: inst.instanceId,
                    instanceName: inst.instanceName,
                    connected: Boolean(inst.enabled && inst.appId && inst.appSecret),
                    startedAt: null,
                    lastError: null,
                    lastInboundAt: null,
                    lastOutboundAt: null,
                })),
            },
            discord: discordStatus,
            nim: {
                instances: (config.nim?.instances || []).map(inst => ({
                    instanceId: inst.instanceId,
                    instanceName: inst.instanceName,
                    connected: Boolean(inst.enabled && ((inst.nimToken && inst.nimToken.trim()) || (inst.appKey && inst.account && inst.token))),
                    startedAt: null,
                    lastError: null,
                    botAccount: inst.account || null,
                    lastInboundAt: null,
                    lastOutboundAt: null,
                })),
            },
            'netease-bee': (() => {
                const beeConfig = config['netease-bee'];
                return {
                    connected: Boolean(beeConfig?.enabled && beeConfig?.clientId && beeConfig?.secret),
                    startedAt: null,
                    lastError: null,
                    botAccount: null,
                    lastInboundAt: null,
                    lastOutboundAt: null,
                };
            })(),
            wecom: {
                instances: (config.wecom?.instances || []).map(inst => ({
                    instanceId: inst.instanceId,
                    instanceName: inst.instanceName,
                    connected: Boolean(inst.enabled && inst.botId && inst.secret),
                    startedAt: null,
                    lastError: null,
                    botId: inst.botId || null,
                    lastInboundAt: null,
                    lastOutboundAt: null,
                })),
            },
            weixin: {
                connected: Boolean(config.weixin?.enabled),
                accountId: config.weixin?.accountId?.trim() || null,
                startedAt: null,
                lastError: null,
                lastInboundAt: null,
                lastOutboundAt: null,
            },
            popo: {
                instances: (config.popo?.instances || []).map(inst => ({
                    instanceId: inst.instanceId,
                    instanceName: inst.instanceName,
                    connected: Boolean(inst.enabled && inst.appKey && inst.appSecret && inst.aesKey && (inst.connectionMode === 'websocket' || inst.token)),
                    startedAt: null,
                    lastError: null,
                    lastInboundAt: null,
                    lastOutboundAt: null,
                })),
            },
            email: {
                instances: (config.email?.instances || []).map(inst => ({
                    instanceId: inst.instanceId,
                    instanceName: inst.instanceName,
                    connected: Boolean(inst.enabled && inst.email),
                    startedAt: null,
                    lastError: null,
                    email: inst.email || null,
                    transport: inst.transport || null,
                    lastInboundAt: null,
                    lastOutboundAt: null,
                })),
            },
        };
    }
    async getStatusWithOpenClawRuntime() {
        const status = this.getStatus();
        const client = this.getOpenClawGatewayClient?.();
        if (!client)
            return status;
        try {
            const runtimeStatus = await this.requestOpenClawChannelsStatus(client);
            const weixinAccount = this.pickWeixinAccountSnapshot(runtimeStatus, status.weixin.accountId);
            if (!weixinAccount)
                return status;
            const configured = weixinAccount.configured === true;
            const running = weixinAccount.running === true;
            const runtimeEnabled = weixinAccount.enabled !== false;
            const localEnabled = this.getConfig().weixin?.enabled === true;
            const accountId = readString(weixinAccount.accountId) ?? status.weixin.accountId ?? null;
            status.weixin = {
                ...status.weixin,
                accountId,
                connected: Boolean(localEnabled && (running || (runtimeEnabled && configured && status.weixin.connected))),
                startedAt: readNumber(weixinAccount.lastStartAt),
                lastError: readString(weixinAccount.lastError),
                lastInboundAt: readNumber(weixinAccount.lastInboundAt),
                lastOutboundAt: readNumber(weixinAccount.lastOutboundAt),
            };
        }
        catch (error) {
            console.debug('[IMGatewayManager] failed to enrich Weixin status from OpenClaw runtime:', error);
        }
        return status;
    }
    async requestOpenClawChannelsStatus(client) {
        return client.request('channels.status', { probe: false, timeoutMs: 2000 });
    }
    getWeixinAccountSnapshots(runtimeStatus) {
        const rawAccounts = runtimeStatus.channelAccounts?.[WEIXIN_OPENCLAW_CHANNEL];
        if (!Array.isArray(rawAccounts))
            return [];
        return rawAccounts
            .filter(isRecord)
            .map((account) => account);
    }
    pickWeixinAccountSnapshot(runtimeStatus, preferredAccountId) {
        const accounts = this.getWeixinAccountSnapshots(runtimeStatus);
        if (accounts.length === 0)
            return null;
        const preferred = preferredAccountId?.trim();
        if (preferred) {
            const matched = accounts.find((account) => readString(account.accountId) === preferred);
            if (matched)
                return matched;
        }
        return accounts.find((account) => account.running === true)
            ?? accounts.find((account) => account.configured === true)
            ?? accounts[0];
    }
    async resolveWeixinRuntimeAccountId(client) {
        try {
            const runtimeStatus = await this.requestOpenClawChannelsStatus(client);
            const preferred = this.getConfig().weixin?.accountId;
            const account = this.pickWeixinAccountSnapshot(runtimeStatus, preferred);
            return readString(account?.accountId) ?? undefined;
        }
        catch (error) {
            console.debug('[IMGatewayManager] failed to resolve Weixin account from OpenClaw runtime:', error);
            return undefined;
        }
    }
    async testGateway(platform, configOverride) {
        // Telegram always uses OpenClaw mode
        if (platform === 'telegram') {
            return this.testTelegramOpenClawConnectivity(configOverride);
        }
        // Discord always uses OpenClaw mode
        if (platform === 'discord') {
            return this.testDiscordOpenClawConnectivity(configOverride);
        }
        // Feishu always uses OpenClaw mode
        if (platform === 'feishu') {
            return this.testFeishuOpenClawConnectivity(configOverride);
        }
        // DingTalk always uses OpenClaw mode
        if (platform === 'dingtalk') {
            return this.testDingTalkOpenClawConnectivity(configOverride);
        }
        if (platform === 'nim') {
            return this.testNimOpenClawConnectivity(configOverride);
        }
        // WeCom always uses OpenClaw mode
        if (platform === 'wecom') {
            return this.testWecomOpenClawConnectivity(configOverride);
        }
        // Weixin always uses OpenClaw mode
        if (platform === 'weixin') {
            return this.testWeixinOpenClawConnectivity(configOverride);
        }
        // POPO always uses OpenClaw mode
        if (platform === 'popo') {
            return this.testPopoOpenClawConnectivity(configOverride);
        }
        // QQ always uses OpenClaw mode
        if (platform === 'qq') {
            return this.testQQOpenClawConnectivity(configOverride);
        }
        // NetEase Bee is an internal relay channel with no standalone gateway to test
        if (platform === 'netease-bee') {
            return {
                platform,
                testedAt: Date.now(),
                verdict: 'warn',
                checks: [{
                        code: 'gateway_running',
                        level: 'info',
                        message: 'The Xiaomifeng channel does not support standalone connectivity testing.',
                    }],
            };
        }
        // Email connectivity test (IMAP login or WS API key validation)
        if (platform === 'email') {
            return this.testEmailConnectivity(configOverride);
        }
        const config = this.buildMergedConfig(configOverride);
        const checks = [];
        const testedAt = Date.now();
        const addCheck = (check) => {
            checks.push(check);
        };
        const missingCredentials = this.getMissingCredentials(platform, config);
        if (missingCredentials.length > 0) {
            addCheck({
                code: 'missing_credentials',
                level: 'fail',
                message: (0, i18n_1.t)('imMissingCredentials', { fields: missingCredentials.join(', ') }),
                suggestion: (0, i18n_1.t)('imFillCredentials'),
            });
            return {
                platform,
                testedAt,
                verdict: 'fail',
                checks,
            };
        }
        try {
            const authMessage = await this.withTimeout(this.runAuthProbe(platform, config), CONNECTIVITY_TIMEOUT_MS, (0, i18n_1.t)('imAuthProbeTimeout'));
            addCheck({
                code: 'auth_check',
                level: 'pass',
                message: authMessage,
            });
        }
        catch (error) {
            addCheck({
                code: 'auth_check',
                level: 'fail',
                message: (0, i18n_1.t)('imAuthFailed', { error: error.message }),
                suggestion: (0, i18n_1.t)('imAuthFailedSuggestion'),
            });
            return {
                platform,
                testedAt,
                verdict: 'fail',
                checks,
            };
        }
        const status = this.getStatus();
        const p = platform;
        let enabled;
        if (p === 'qq') {
            enabled = config.qq?.instances?.some(i => i.enabled) ?? false;
        }
        else if (p === 'feishu') {
            enabled = config.feishu?.instances?.some(i => i.enabled) ?? false;
        }
        else if (p === 'dingtalk') {
            enabled = config.dingtalk?.instances?.some(i => i.enabled) ?? false;
        }
        else if (p === 'wecom') {
            enabled = config.wecom?.instances?.some(i => i.enabled) ?? false;
        }
        else {
            enabled = Boolean(config[platform]?.enabled);
        }
        const connected = this.isConnected(platform);
        if (enabled && !connected) {
            addCheck({
                code: 'gateway_running',
                level: 'warn',
                message: (0, i18n_1.t)('imChannelEnabledNotConnected'),
                suggestion: (0, i18n_1.t)('imChannelEnabledNotConnectedSuggestion'),
            });
        }
        else {
            addCheck({
                code: 'gateway_running',
                level: connected ? 'pass' : 'info',
                message: connected ? (0, i18n_1.t)('imChannelRunning') : (0, i18n_1.t)('imChannelNotEnabled'),
                suggestion: connected ? undefined : (0, i18n_1.t)('imChannelNotEnabledSuggestion'),
            });
        }
        const startedAt = this.getStartedAtMs(platform, status);
        const lastInboundAt = this.getLastInboundAt(platform, status);
        const lastOutboundAt = this.getLastOutboundAt(platform, status);
        if (connected && startedAt && testedAt - startedAt >= INBOUND_ACTIVITY_WARN_AFTER_MS) {
            if (!lastInboundAt) {
                addCheck({
                    code: 'inbound_activity',
                    level: 'warn',
                    message: (0, i18n_1.t)('imNoInboundAfter2Min'),
                    suggestion: (0, i18n_1.t)('imNoInboundSuggestion'),
                });
            }
            else {
                addCheck({
                    code: 'inbound_activity',
                    level: 'pass',
                    message: (0, i18n_1.t)('imInboundDetected'),
                });
            }
        }
        else if (connected) {
            addCheck({
                code: 'inbound_activity',
                level: 'info',
                message: (0, i18n_1.t)('imGatewayJustStarted'),
            });
        }
        if (connected && lastInboundAt) {
            if (!lastOutboundAt) {
                addCheck({
                    code: 'outbound_activity',
                    level: 'warn',
                    message: (0, i18n_1.t)('imNoOutbound'),
                    suggestion: (0, i18n_1.t)('imNoOutboundSuggestion'),
                });
            }
            else {
                addCheck({
                    code: 'outbound_activity',
                    level: 'pass',
                    message: (0, i18n_1.t)('imOutboundDetected'),
                });
            }
        }
        else if (connected) {
            addCheck({
                code: 'outbound_activity',
                level: 'info',
                message: (0, i18n_1.t)('imNoInboundForOutboundCheck'),
            });
        }
        const lastError = this.getLastError(platform, status);
        if (lastError) {
            addCheck({
                code: 'platform_last_error',
                level: connected ? 'warn' : 'fail',
                message: (0, i18n_1.t)('imRecentError', { error: lastError }),
                suggestion: connected
                    ? (0, i18n_1.t)('imRecentErrorConnectedSuggestion')
                    : (0, i18n_1.t)('imRecentErrorDisconnectedSuggestion'),
            });
        }
        if (platform === 'qq') {
            addCheck({
                code: 'qq_guild_mention_hint',
                level: 'info',
                message: (0, i18n_1.t)('imQqOpenClawHint'),
                suggestion: (0, i18n_1.t)('imQqMentionHint'),
            });
        }
        return {
            platform,
            testedAt,
            verdict: this.calculateVerdict(checks),
            checks,
        };
    }
    // ==================== Gateway Control ====================
    async startGateway(platform) {
        // Ensure chat handler is ready
        this.updateChatHandler();
        if (platform === 'dingtalk') {
            // DingTalk runs via OpenClaw gateway (dingtalk-connector plugin)
            console.log('[IMGatewayManager] DingTalk in OpenClaw mode, syncing config instead of starting direct gateway');
            await this.syncOpenClawConfig?.('im-gateway-start:dingtalk');
            await this.ensureOpenClawGatewayConnected?.();
            return;
        }
        else if (platform === 'feishu') {
            // Feishu runs via OpenClaw gateway (feishu-openclaw-plugin)
            console.log('[IMGatewayManager] Feishu in OpenClaw mode, syncing config instead of starting direct gateway');
            await this.syncOpenClawConfig?.('im-gateway-start:feishu');
            await this.ensureOpenClawGatewayConnected?.();
            return;
        }
        else if (platform === 'telegram') {
            // Telegram always runs via OpenClaw gateway
            console.log('[IMGatewayManager] Telegram in OpenClaw mode, syncing config instead of starting direct gateway');
            await this.syncOpenClawConfig?.('im-gateway-start:telegram');
            // Connect the gateway WebSocket so channel events (e.g. Telegram messages) are received
            await this.ensureOpenClawGatewayConnected?.();
            return;
        }
        else if (platform === 'discord') {
            // Discord runs via OpenClaw gateway
            console.log('[IMGatewayManager] Discord in OpenClaw mode, syncing config instead of starting direct gateway');
            await this.syncOpenClawConfig?.('im-gateway-start:discord');
            await this.ensureOpenClawGatewayConnected?.();
            return;
        }
        else if (platform === 'nim') {
            // NIM runs via OpenClaw gateway (openclaw-nim plugin)
            console.log('[IMGatewayManager] NIM in OpenClaw mode, syncing config instead of starting direct gateway');
            await this.syncOpenClawConfig?.('im-gateway-start:nim');
            await this.ensureOpenClawGatewayConnected?.();
            return;
        }
        else if (platform === 'netease-bee') {
            // netease-bee runs via OpenClaw gateway
            console.log('[IMGatewayManager] netease-bee in OpenClaw mode, syncing config instead of starting direct gateway');
            await this.syncOpenClawConfig?.('im-gateway-start:netease-bee');
            await this.ensureOpenClawGatewayConnected?.();
            return;
        }
        else if (platform === 'qq') {
            // QQ runs via OpenClaw gateway (qqbot plugin)
            console.log('[IMGatewayManager] QQ in OpenClaw mode, syncing config instead of starting direct gateway');
            await this.syncOpenClawConfig?.('im-gateway-start:qq');
            await this.ensureOpenClawGatewayConnected?.();
            return;
        }
        else if (platform === 'wecom') {
            // WeCom runs via OpenClaw gateway (wecom-openclaw-plugin)
            console.log('[IMGatewayManager] WeCom in OpenClaw mode, syncing config instead of starting direct gateway');
            await this.syncOpenClawConfig?.('im-gateway-start:wecom');
            await this.ensureOpenClawGatewayConnected?.();
            return;
        }
        else if (platform === 'weixin') {
            // Weixin runs via OpenClaw gateway (weixin-openclaw-plugin)
            console.debug('[IMGatewayManager] Weixin in OpenClaw mode, syncing config instead of starting direct gateway');
            await this.syncOpenClawConfig?.('im-gateway-start:weixin');
            await this.ensureOpenClawGatewayConnected?.();
            return;
        }
        else if (platform === 'popo') {
            // POPO runs via OpenClaw gateway (moltbot-popo plugin)
            console.log('[IMGatewayManager] POPO in OpenClaw mode, syncing config instead of starting direct gateway');
            await this.syncOpenClawConfig?.('im-gateway-start:popo');
            await this.ensureOpenClawGatewayConnected?.();
            return;
        }
        // Restore persisted notification target
        this.restoreNotificationTarget(platform);
    }
    async stopGateway(platform) {
        if (platform === 'dingtalk') {
            // DingTalk runs via OpenClaw gateway
            console.log('[IMGatewayManager] DingTalk in OpenClaw mode, syncing disabled config');
            await this.syncOpenClawConfig?.('im-gateway-stop:dingtalk');
            return;
        }
        else if (platform === 'feishu') {
            // Feishu runs via OpenClaw gateway
            console.log('[IMGatewayManager] Feishu in OpenClaw mode, syncing disabled config');
            await this.syncOpenClawConfig?.('im-gateway-stop:feishu');
            return;
        }
        else if (platform === 'telegram') {
            // Telegram always runs via OpenClaw gateway
            console.log('[IMGatewayManager] Telegram in OpenClaw mode, syncing disabled config');
            await this.syncOpenClawConfig?.('im-gateway-stop:telegram');
            return;
        }
        else if (platform === 'discord') {
            // Discord runs via OpenClaw gateway
            console.log('[IMGatewayManager] Discord in OpenClaw mode, syncing disabled config');
            await this.syncOpenClawConfig?.('im-gateway-stop:discord');
            return;
        }
        else if (platform === 'nim') {
            // NIM runs via OpenClaw gateway
            console.log('[IMGatewayManager] NIM in OpenClaw mode, syncing disabled config');
            await this.syncOpenClawConfig?.('im-gateway-stop:nim');
            return;
        }
        else if (platform === 'netease-bee') {
            // netease-bee runs via OpenClaw gateway
            console.log('[IMGatewayManager] netease-bee in OpenClaw mode, syncing disabled config');
            await this.syncOpenClawConfig?.('im-gateway-stop:netease-bee');
            return;
        }
        else if (platform === 'qq') {
            // QQ runs via OpenClaw gateway
            console.log('[IMGatewayManager] QQ in OpenClaw mode, syncing disabled config');
            await this.syncOpenClawConfig?.('im-gateway-stop:qq');
            return;
        }
        else if (platform === 'wecom') {
            // WeCom runs via OpenClaw gateway
            console.log('[IMGatewayManager] WeCom in OpenClaw mode, syncing disabled config');
            await this.syncOpenClawConfig?.('im-gateway-stop:wecom');
            return;
        }
        else if (platform === 'weixin') {
            // Weixin runs via OpenClaw gateway
            console.debug('[IMGatewayManager] Weixin in OpenClaw mode, syncing disabled config');
            await this.syncOpenClawConfig?.('im-gateway-stop:weixin');
            return;
        }
        else if (platform === 'popo') {
            // POPO runs via OpenClaw gateway
            console.log('[IMGatewayManager] POPO in OpenClaw mode, syncing disabled config');
            await this.syncOpenClawConfig?.('im-gateway-stop:popo');
            return;
        }
    }
    /**
     * Start all enabled gateways.
     *
     * OpenClaw platforms (dingtalk/feishu/telegram/discord/qq/wecom/weixin/popo/nim) are batched
     * so that `syncOpenClawConfig` + `ensureOpenClawGatewayConnected` are called
     * only **once** regardless of how many OpenClaw platforms are enabled.
     * This avoids N serial gateway restarts which cause message loss, Telegram
     * `getUpdates` conflicts, and rate-limit issues.
     */
    async startAllEnabled() {
        const config = this.getConfig();
        // Ensure chat handler is ready (called once instead of per-platform)
        this.updateChatHandler();
        // --- OpenClaw platforms: collect and batch into a single sync ---
        const openClawPlatformsToStart = [];
        const dingtalkInstances = config.dingtalk?.instances || [];
        if (dingtalkInstances.some(i => i.enabled && i.clientId && i.clientSecret)) {
            openClawPlatformsToStart.push('dingtalk');
        }
        const feishuInstances = config.feishu?.instances || [];
        if (feishuInstances.some(i => i.enabled && i.appId && i.appSecret)) {
            openClawPlatformsToStart.push('feishu');
        }
        const telegramInstances = config.telegram?.instances || [];
        if (telegramInstances.some(i => i.enabled && i.botToken)) {
            openClawPlatformsToStart.push('telegram');
        }
        const discordInstances = config.discord?.instances || [];
        if (discordInstances.some(i => i.enabled && i.botToken)) {
            openClawPlatformsToStart.push('discord');
        }
        const qqInstances = config.qq?.instances || [];
        if (qqInstances.some(i => i.enabled && i.appId && i.appSecret)) {
            openClawPlatformsToStart.push('qq');
        }
        const wecomInstances = config.wecom?.instances || [];
        if (wecomInstances.some(i => i.enabled && i.botId && i.secret)) {
            openClawPlatformsToStart.push('wecom');
        }
        if (config.weixin?.enabled) {
            openClawPlatformsToStart.push('weixin');
        }
        const popoInstances = config.popo?.instances || [];
        if (popoInstances.some(i => i.enabled && i.appKey && i.appSecret && i.aesKey && (i.connectionMode === 'websocket' || i.token))) {
            openClawPlatformsToStart.push('popo');
        }
        const nimInstances = config.nim?.instances || [];
        if (nimInstances.some(i => i.enabled && ((i.nimToken && i.nimToken.trim()) || (i.appKey && i.account && i.token)))) {
            openClawPlatformsToStart.push('nim');
        }
        if (config['netease-bee']?.enabled && config['netease-bee']?.clientId && config['netease-bee']?.secret) {
            openClawPlatformsToStart.push('netease-bee');
        }
        if (openClawPlatformsToStart.length > 0) {
            console.log(`[IMGatewayManager] Starting OpenClaw platforms in batch: ${openClawPlatformsToStart.join(', ')}`);
            try {
                await this.syncOpenClawConfig?.(`im-gateway-start-batch:${openClawPlatformsToStart.join(',')}`);
                await this.ensureOpenClawGatewayConnected?.();
            }
            catch (error) {
                console.error(`[IMGatewayManager] Failed to start OpenClaw platforms: ${error.message}`);
            }
        }
    }
    async stopAll() {
        // All platforms run via OpenClaw; nothing to stop directly
    }
    isAnyConnected() {
        return false;
    }
    isConnected(platform) {
        if (platform === 'dingtalk') {
            // DingTalk runs via OpenClaw; consider it connected when any instance is enabled and configured
            const config = this.getConfig();
            const dingtalkInstances = config.dingtalk?.instances || [];
            return dingtalkInstances.some(i => i.enabled && i.clientId && i.clientSecret);
        }
        if (platform === 'feishu') {
            // Feishu runs via OpenClaw; consider it connected when any instance is enabled and configured
            const config = this.getConfig();
            const feishuInstances = config.feishu?.instances || [];
            return feishuInstances.some(i => i.enabled && i.appId && i.appSecret);
        }
        if (platform === 'telegram') {
            // Telegram runs via OpenClaw; consider it connected when any instance is enabled and configured
            const config = this.getConfig();
            const telegramInstances = config.telegram?.instances || [];
            return telegramInstances.some(i => i.enabled && i.botToken);
        }
        if (platform === 'discord') {
            // Discord runs via OpenClaw; consider it connected when any instance is enabled and configured
            const config = this.getConfig();
            const discordInstances = config.discord?.instances || [];
            return discordInstances.some(i => i.enabled && i.botToken);
        }
        if (platform === 'nim') {
            // NIM runs via OpenClaw; consider it connected when enabled and configured
            const config = this.getConfig();
            const nimInstances = config.nim?.instances || [];
            return nimInstances.some(i => i.enabled && ((i.nimToken && i.nimToken.trim()) || (i.appKey && i.account && i.token)));
        }
        if (platform === 'netease-bee') {
            // netease-bee runs via OpenClaw; status comes from OpenClaw
            const config = this.getConfig();
            return Boolean(config['netease-bee']?.enabled && config['netease-bee']?.clientId && config['netease-bee']?.secret);
        }
        if (platform === 'qq') {
            // QQ runs via OpenClaw; consider it connected when any instance is enabled and configured
            const config = this.getConfig();
            const qqInstances = config.qq?.instances || [];
            return qqInstances.some(i => i.enabled && i.appId && i.appSecret);
        }
        if (platform === 'wecom') {
            // WeCom runs via OpenClaw; consider it connected when any instance is enabled and configured
            const config = this.getConfig();
            const wecomInstances = config.wecom?.instances || [];
            return wecomInstances.some(i => i.enabled && i.botId && i.secret);
        }
        if (platform === 'weixin') {
            const config = this.getConfig();
            return Boolean(config.weixin?.enabled);
        }
        if (platform === 'popo') {
            // POPO runs via OpenClaw; consider it connected when any instance is enabled and configured
            const config = this.getConfig();
            const popoInsts = config.popo?.instances || [];
            return popoInsts.some(i => i.enabled && i.appKey && i.appSecret && i.aesKey && (i.connectionMode === 'websocket' || i.token));
        }
        return false;
    }
    async sendNotification(platform, _text) {
        if (!this.isConnected(platform)) {
            console.warn(`[IMGatewayManager] Cannot send notification: ${platform} is not connected`);
            return false;
        }
        try {
            if (platform === 'nim') {
                // NIM runs via OpenClaw; notifications not yet supported via plugin
                console.log('[IMGatewayManager] NIM notification via OpenClaw not yet supported');
            }
            else if (platform === 'qq') {
                // QQ runs via OpenClaw; notifications are handled by the qqbot plugin
                console.log('[IMGatewayManager] QQ notification via OpenClaw not yet supported');
            }
            else if (platform === 'wecom') {
                // WeCom runs via OpenClaw; notifications are handled by the wecom-openclaw-plugin
                console.log('[IMGatewayManager] WeCom notification via OpenClaw not yet supported');
            }
            else if (platform === 'weixin') {
                // Weixin runs via OpenClaw; notifications are handled by the weixin-openclaw-plugin
                console.debug('[IMGatewayManager] Weixin notification via OpenClaw not yet supported');
            }
            else if (platform === 'popo') {
                // POPO runs via OpenClaw; notifications are handled by the moltbot-popo plugin
                console.log('[IMGatewayManager] POPO notification via OpenClaw not yet supported');
            }
            else if (platform === 'netease-bee') {
                // netease-bee runs via OpenClaw; notifications not yet supported
                console.log('[IMGatewayManager] netease-bee notification via OpenClaw not yet supported');
            }
            return true;
        }
        catch (error) {
            console.error(`[IMGatewayManager] Failed to send notification via ${platform}:`, error.message);
            return false;
        }
    }
    async sendNotificationWithMedia(platform, _text) {
        if (!this.isConnected(platform)) {
            console.warn(`[IMGatewayManager] Cannot send notification: ${platform} is not connected`);
            return false;
        }
        try {
            if (platform === 'nim') {
                // NIM runs via OpenClaw; notifications not yet supported via plugin
                console.log('[IMGatewayManager] NIM notification with media via OpenClaw not yet supported');
            }
            else if (platform === 'qq') {
                // QQ runs via OpenClaw; notifications are handled by the qqbot plugin
                console.log('[IMGatewayManager] QQ notification with media via OpenClaw not yet supported');
            }
            else if (platform === 'wecom') {
                // WeCom runs via OpenClaw; notifications are handled by the wecom-openclaw-plugin
                console.log('[IMGatewayManager] WeCom notification with media via OpenClaw not yet supported');
            }
            else if (platform === 'weixin') {
                // Weixin runs via OpenClaw; notifications are handled by the weixin-openclaw-plugin
                console.debug('[IMGatewayManager] Weixin notification with media via OpenClaw not yet supported');
            }
            else if (platform === 'popo') {
                // POPO runs via OpenClaw; notifications are handled by the moltbot-popo plugin
                console.log('[IMGatewayManager] POPO notification with media via OpenClaw not yet supported');
            }
            else if (platform === 'netease-bee') {
                // netease-bee runs via OpenClaw; notifications not yet supported
                console.log('[IMGatewayManager] netease-bee notification via OpenClaw not yet supported');
            }
            return true;
        }
        catch (error) {
            console.error(`[IMGatewayManager] Failed to send notification with media via ${platform}:`, error.message);
            return false;
        }
    }
    async testTelegramOpenClawConnectivity(configOverride) {
        const checks = [];
        const testedAt = Date.now();
        const platform = 'telegram';
        // Resolve the Telegram config — pick first enabled instance with a botToken
        const mergedConfig = this.buildMergedConfig(configOverride);
        const instances = mergedConfig.telegram?.instances || [];
        const tgInstance = instances.find(i => i.enabled && i.botToken) || instances[0];
        const botToken = tgInstance?.botToken || '';
        // Check 1: Bot token present
        if (!botToken) {
            checks.push({
                code: 'missing_credentials',
                level: 'fail',
                message: (0, i18n_1.t)('imTelegramMissingBotToken'),
                suggestion: (0, i18n_1.t)('imTelegramFillBotToken'),
            });
            return { platform, testedAt, verdict: 'fail', checks };
        }
        // Check 2: Auth probe via Telegram API (getMe)
        try {
            const response = await this.withTimeout((0, http_1.fetchJsonWithTimeout)(`https://api.telegram.org/bot${botToken}/getMe`, {}, CONNECTIVITY_TIMEOUT_MS), CONNECTIVITY_TIMEOUT_MS, (0, i18n_1.t)('imAuthProbeTimeout'));
            if (response?.ok && response.result?.username) {
                checks.push({
                    code: 'auth_check',
                    level: 'pass',
                    message: (0, i18n_1.t)('imTelegramAuthPassed', { username: response.result.username }),
                });
            }
            else {
                checks.push({
                    code: 'auth_check',
                    level: 'fail',
                    message: (0, i18n_1.t)('imTelegramAuthFailed', { error: response?.description || (0, i18n_1.t)('imTelegramAuthFailedUnknown') }),
                    suggestion: (0, i18n_1.t)('imTelegramCheckToken'),
                });
                return { platform, testedAt, verdict: 'fail', checks };
            }
        }
        catch (error) {
            checks.push({
                code: 'auth_check',
                level: 'fail',
                message: (0, i18n_1.t)('imTelegramAuthFailed', { error: error.message }),
                suggestion: (0, i18n_1.t)('imTelegramCheckTokenNetwork'),
            });
            return { platform, testedAt, verdict: 'fail', checks };
        }
        // Check 3: OpenClaw Gateway running
        checks.push({
            code: 'gateway_running',
            level: 'info',
            message: (0, i18n_1.t)('imTelegramOpenClawHint'),
        });
        const verdict = checks.some(c => c.level === 'fail')
            ? 'fail'
            : checks.some(c => c.level === 'warn')
                ? 'warn'
                : 'pass';
        return { platform, testedAt, verdict, checks };
    }
    async testDiscordOpenClawConnectivity(configOverride) {
        const checks = [];
        const testedAt = Date.now();
        const platform = 'discord';
        const mergedConfig = this.buildMergedConfig(configOverride);
        const discordInstances = mergedConfig.discord?.instances || [];
        const dcConfig = discordInstances.find(i => i.enabled) || discordInstances[0];
        const botToken = dcConfig?.botToken || '';
        // Check 1: Bot token present
        if (!botToken) {
            checks.push({
                code: 'missing_credentials',
                level: 'fail',
                message: (0, i18n_1.t)('imDiscordMissingBotToken'),
                suggestion: (0, i18n_1.t)('imDiscordFillBotToken'),
            });
            return { platform, testedAt, verdict: 'fail', checks };
        }
        // Check 2: Auth probe via Discord API (/users/@me)
        try {
            const response = await this.withTimeout((0, http_1.fetchJsonWithTimeout)('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bot ${botToken}` } }, CONNECTIVITY_TIMEOUT_MS), CONNECTIVITY_TIMEOUT_MS, (0, i18n_1.t)('imAuthProbeTimeout'));
            const username = response?.username
                ? `${response.username}${response.discriminator && response.discriminator !== '0' ? `#${response.discriminator}` : ''}`
                : 'unknown';
            checks.push({
                code: 'auth_check',
                level: 'pass',
                message: (0, i18n_1.t)('imDiscordAuthPassed', { username }),
            });
        }
        catch (error) {
            checks.push({
                code: 'auth_check',
                level: 'fail',
                message: (0, i18n_1.t)('imDiscordAuthFailed', { error: error.message }),
                suggestion: (0, i18n_1.t)('imDiscordCheckTokenNetwork'),
            });
            return { platform, testedAt, verdict: 'fail', checks };
        }
        // Check 3: OpenClaw Gateway running info
        checks.push({
            code: 'gateway_running',
            level: 'info',
            message: (0, i18n_1.t)('imDiscordOpenClawHint'),
        });
        // Check 4: Group mention hint
        checks.push({
            code: 'discord_group_requires_mention',
            level: 'info',
            message: (0, i18n_1.t)('imDiscordGroupMention'),
        });
        const verdict = checks.some(c => c.level === 'fail')
            ? 'fail'
            : checks.some(c => c.level === 'warn')
                ? 'warn'
                : 'pass';
        return { platform, testedAt, verdict, checks };
    }
    async testFeishuOpenClawConnectivity(configOverride) {
        const checks = [];
        const testedAt = Date.now();
        const platform = 'feishu';
        const mergedConfig = this.buildMergedConfig(configOverride);
        const feishuInstances = mergedConfig.feishu?.instances || [];
        const fsConfig = feishuInstances.find(i => i.enabled) || feishuInstances[0];
        // Check 1: Credentials present
        if (!fsConfig?.appId || !fsConfig?.appSecret) {
            const missing = [];
            if (!fsConfig?.appId)
                missing.push('appId');
            if (!fsConfig?.appSecret)
                missing.push('appSecret');
            checks.push({
                code: 'missing_credentials',
                level: 'fail',
                message: (0, i18n_1.t)('imMissingCredentials', { fields: missing.join(', ') }),
                suggestion: (0, i18n_1.t)('imFeishuFillAppIdSecret'),
            });
            return { platform, testedAt, verdict: 'fail', checks };
        }
        // Check 2: Auth probe via Feishu API
        try {
            const Lark = await Promise.resolve().then(() => __importStar(require('@larksuiteoapi/node-sdk')));
            const domain = this.resolveFeishuDomain(fsConfig.domain, Lark);
            const client = new Lark.Client({
                appId: fsConfig.appId,
                appSecret: fsConfig.appSecret,
                appType: Lark.AppType.SelfBuild,
                domain,
            });
            const response = await client.request({
                method: 'GET',
                url: '/open-apis/bot/v3/info',
            });
            if (response.code !== 0) {
                throw new Error(response.msg || `code ${response.code}`);
            }
            const botName = response.data?.app_name ?? response.data?.bot?.app_name ?? 'unknown';
            checks.push({
                code: 'auth_check',
                level: 'pass',
                message: (0, i18n_1.t)('imFeishuAuthPassed', { botName }),
            });
        }
        catch (error) {
            checks.push({
                code: 'auth_check',
                level: 'fail',
                message: (0, i18n_1.t)('imFeishuAuthFailed', { error: error.message }),
                suggestion: (0, i18n_1.t)('imFeishuCheckAppIdSecret'),
            });
            return { platform, testedAt, verdict: 'fail', checks };
        }
        // Check 3: OpenClaw Gateway running info
        checks.push({
            code: 'gateway_running',
            level: 'info',
            message: (0, i18n_1.t)('imFeishuOpenClawHint'),
        });
        // Check 4: Group mention hint
        checks.push({
            code: 'feishu_group_requires_mention',
            level: 'info',
            message: (0, i18n_1.t)('imFeishuGroupMention'),
            suggestion: (0, i18n_1.t)('imFeishuGroupMentionSuggestion'),
        });
        // Check 5: Event subscription hint
        checks.push({
            code: 'feishu_event_subscription_required',
            level: 'info',
            message: (0, i18n_1.t)('imFeishuEventSubscription'),
            suggestion: (0, i18n_1.t)('imFeishuEventSubscriptionSuggestion'),
        });
        const verdict = checks.some(c => c.level === 'fail')
            ? 'fail'
            : checks.some(c => c.level === 'warn')
                ? 'warn'
                : 'pass';
        return { platform, testedAt, verdict, checks };
    }
    async testDingTalkOpenClawConnectivity(configOverride) {
        const checks = [];
        const testedAt = Date.now();
        const platform = 'dingtalk';
        const mergedConfig = this.buildMergedConfig(configOverride);
        const dingtalkInstances = mergedConfig.dingtalk?.instances || [];
        const dtConfig = dingtalkInstances.find(i => i.enabled) || dingtalkInstances[0];
        // Check 1: Credentials present
        if (!dtConfig?.clientId || !dtConfig?.clientSecret) {
            const missing = [];
            if (!dtConfig?.clientId)
                missing.push('clientId');
            if (!dtConfig?.clientSecret)
                missing.push('clientSecret');
            checks.push({
                code: 'missing_credentials',
                level: 'fail',
                message: (0, i18n_1.t)('imMissingCredentials', { fields: missing.join(', ') }),
                suggestion: (0, i18n_1.t)('imDingtalkFillClientIdSecret'),
            });
            return { platform, testedAt, verdict: 'fail', checks };
        }
        // Check 2: Auth probe via DingTalk API
        try {
            const tokenUrl = `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(dtConfig.clientId)}&appsecret=${encodeURIComponent(dtConfig.clientSecret)}`;
            const resp = await this.withTimeout((0, http_1.fetchJsonWithTimeout)(tokenUrl, {}, CONNECTIVITY_TIMEOUT_MS), CONNECTIVITY_TIMEOUT_MS, (0, i18n_1.t)('imAuthProbeTimeout'));
            if (resp.errcode && resp.errcode !== 0) {
                throw new Error(resp.errmsg || `errcode ${resp.errcode}`);
            }
            checks.push({
                code: 'auth_check',
                level: 'pass',
                message: (0, i18n_1.t)('imDingtalkAuthPassed'),
            });
        }
        catch (error) {
            checks.push({
                code: 'auth_check',
                level: 'fail',
                message: (0, i18n_1.t)('imDingtalkAuthFailed', { error: error.message }),
                suggestion: (0, i18n_1.t)('imDingtalkCheckClientIdSecret'),
            });
            return { platform, testedAt, verdict: 'fail', checks };
        }
        // Check 3: OpenClaw Gateway running info
        checks.push({
            code: 'gateway_running',
            level: 'info',
            message: (0, i18n_1.t)('imDingtalkOpenClawHint'),
        });
        // Check 4: Bot membership hint
        checks.push({
            code: 'dingtalk_bot_membership_hint',
            level: 'info',
            message: (0, i18n_1.t)('imDingtalkBotMembership'),
            suggestion: (0, i18n_1.t)('imDingtalkBotMembershipSuggestion'),
        });
        const verdict = checks.some(c => c.level === 'fail')
            ? 'fail'
            : checks.some(c => c.level === 'warn')
                ? 'warn'
                : 'pass';
        return { platform, testedAt, verdict, checks };
    }
    async testWecomOpenClawConnectivity(configOverride) {
        const checks = [];
        const testedAt = Date.now();
        const platform = 'wecom';
        const mergedConfig = this.buildMergedConfig(configOverride);
        const wecomInstances = mergedConfig.wecom?.instances || [];
        const wcConfig = wecomInstances.find(i => i.enabled) || wecomInstances[0];
        // Check 1: Credentials present
        if (!wcConfig?.botId || !wcConfig?.secret) {
            const missing = [];
            if (!wcConfig?.botId)
                missing.push('botId');
            if (!wcConfig?.secret)
                missing.push('secret');
            checks.push({
                code: 'missing_credentials',
                level: 'fail',
                message: (0, i18n_1.t)('imMissingCredentials', { fields: missing.join(', ') }),
                suggestion: (0, i18n_1.t)('imWecomFillBotIdSecret'),
            });
            return { platform, testedAt, verdict: 'fail', checks };
        }
        // Check 2: Config completeness passes
        checks.push({
            code: 'auth_check',
            level: 'pass',
            message: (0, i18n_1.t)('imWecomConfigReady', { botId: wcConfig.botId }),
        });
        // Check 3: OpenClaw Gateway running info
        checks.push({
            code: 'gateway_running',
            level: 'info',
            message: (0, i18n_1.t)('imWecomOpenClawHint'),
        });
        const verdict = checks.some(c => c.level === 'fail')
            ? 'fail'
            : checks.some(c => c.level === 'warn')
                ? 'warn'
                : 'pass';
        return { platform, testedAt, verdict, checks };
    }
    async testWeixinOpenClawConnectivity(configOverride) {
        const checks = [];
        const testedAt = Date.now();
        const platform = 'weixin';
        const mergedConfig = this.buildMergedConfig(configOverride);
        const wxConfig = mergedConfig.weixin;
        // Weixin has no credentials; just check if enabled
        if (!wxConfig?.enabled) {
            checks.push({
                code: 'gateway_running',
                level: 'info',
                message: (0, i18n_1.t)('imWeixinNotEnabled'),
                suggestion: (0, i18n_1.t)('imWeixinEnableSuggestion'),
            });
            return { platform, testedAt, verdict: 'pass', checks };
        }
        // Config completeness passes (no credentials needed)
        checks.push({
            code: 'auth_check',
            level: 'pass',
            message: (0, i18n_1.t)('imWeixinConfigReady'),
        });
        // OpenClaw Gateway running info
        checks.push({
            code: 'gateway_running',
            level: 'info',
            message: (0, i18n_1.t)('imWeixinOpenClawHint'),
        });
        const verdict = checks.some(c => c.level === 'fail')
            ? 'fail'
            : checks.some(c => c.level === 'warn')
                ? 'warn'
                : 'pass';
        return { platform, testedAt, verdict, checks };
    }
    /**
     * Start Weixin QR code login via OpenClaw Gateway RPC.
     * Returns the QR code data URL and a session key for polling.
     */
    async weixinQrLoginStart() {
        const client = this.getOpenClawGatewayClient?.();
        if (!client) {
            await this.ensureOpenClawGatewayReady?.();
            const retryClient = this.getOpenClawGatewayClient?.();
            if (!retryClient) {
                return { message: 'The engine is not running. Start the engine first.' };
            }
            return this.doWeixinQrLoginStart(retryClient);
        }
        return this.doWeixinQrLoginStart(client);
    }
    async doWeixinQrLoginStart(client) {
        try {
            const result = await client.request('web.login.start', { force: true, timeoutMs: 300000, verbose: true });
            console.log('[IMGatewayManager] Weixin QR login start result:', result.message);
            return result;
        }
        catch (err) {
            console.error('[IMGatewayManager] Weixin QR login start failed:', err);
            return { message: `Failed to start Weixin login: ${String(err)}` };
        }
    }
    /**
     * Wait for Weixin QR code scan completion via OpenClaw Gateway RPC.
     */
    async weixinQrLoginWait(sessionKey) {
        const client = this.getOpenClawGatewayClient?.();
        if (!client) {
            return { connected: false, message: 'The engine is not connected.' };
        }
        try {
            const result = await client.request('web.login.wait', 
            // OpenClaw's current web.login.wait schema has no sessionKey field, so
            // the QR flow still has to pass the plugin session key through accountId.
            { timeoutMs: 480000, ...(sessionKey ? { accountId: sessionKey } : {}) });
            const alreadyConnected = result.alreadyConnected === true
                || isWeixinAlreadyConnectedMessage(result.message);
            const configuredAccountId = this.getConfig().weixin?.accountId?.trim() || undefined;
            const resolvedAccountId = result.accountId
                ?? (alreadyConnected ? configuredAccountId ?? await this.resolveWeixinRuntimeAccountId(client) : undefined);
            console.log('[IMGatewayManager] Weixin QR login wait completed:', JSON.stringify({
                connected: result.connected,
                alreadyConnected,
                accountId: resolvedAccountId,
            }));
            if (result.connected || alreadyConnected) {
                if (resolvedAccountId) {
                    this.setConfig({
                        weixin: {
                            ...this.getConfig().weixin,
                            enabled: true,
                            accountId: resolvedAccountId,
                        },
                    }, { syncGateway: false });
                }
                // Keep QR login consistent with Settings save semantics: persist the
                // account locally, then let the global Save action apply IM config to
                // OpenClaw and restart the gateway once if the fingerprint changed.
            }
            return {
                ...result,
                alreadyConnected,
                accountId: resolvedAccountId,
            };
        }
        catch (err) {
            console.error('[IMGatewayManager] Weixin QR login wait failed:', err);
            return { connected: false, message: `Login failed: ${String(err)}` };
        }
    }
    // ---------------------------------------------------------------------------
    // POPO QR code login (direct HTTP polling, no OpenClaw gateway RPC)
    // ---------------------------------------------------------------------------
    static POPO_QRCODE_BASE_URL = 'https://f2e.popo.netease.com/polymers/lobster-bot-h5/?pp_htb=1&pp_back_type=cross&taskToken=';
    static POPO_POLLING_API = 'https://open.popo.netease.com/open-apis/no-auth/openclaw/v1/polling';
    static POPO_COMPLETE_API = 'https://open.popo.netease.com/open-apis/no-auth/openclaw/v1/completed';
    static POPO_POLLING_INTERVAL_MS = 5_000;
    static POPO_POLLING_TIMEOUT_MS = 10 * 60_000;
    /**
     * Start POPO QR code login: generate a taskToken and return the QR URL.
     */
    popoQrLoginStart() {
        const { randomUUID } = require('crypto');
        const taskToken = randomUUID();
        const timeout = Date.now() + IMGatewayManager.POPO_POLLING_TIMEOUT_MS;
        const qrUrl = `${IMGatewayManager.POPO_QRCODE_BASE_URL}${taskToken}&timeout=${timeout}`;
        console.log('[IMGatewayManager] POPO QR login started, taskToken:', taskToken);
        return { qrUrl, taskToken, timeoutMs: IMGatewayManager.POPO_POLLING_TIMEOUT_MS };
    }
    /**
     * Poll POPO backend for QR scan result. Blocks until credentials are returned or timeout.
     * Returns { success, appKey, appSecret, aesKey } on success.
     */
    async popoQrLoginPoll(taskToken) {
        const deadline = Date.now() + IMGatewayManager.POPO_POLLING_TIMEOUT_MS;
        while (Date.now() < deadline) {
            try {
                const url = `${IMGatewayManager.POPO_POLLING_API}?taskToken=${taskToken}`;
                const resp = await fetch(url, {
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                    signal: AbortSignal.timeout(8_000),
                });
                if (resp.ok) {
                    const data = await resp.json();
                    if (data?.data?.status === 'CREATED' && data.data.result) {
                        const { appKey, appSecret, aesKey } = data.data.result;
                        if (appKey && appSecret && aesKey) {
                            console.log('[IMGatewayManager] POPO QR login got credentials');
                            // Notify server that setup is complete (best-effort)
                            void this.popoQrNotifyComplete(taskToken);
                            return { success: true, appKey, appSecret, aesKey, message: 'POPO 机器人绑定成功！' };
                        }
                    }
                }
            }
            catch {
                // Ignore individual poll errors, keep trying
            }
            await new Promise(r => setTimeout(r, IMGatewayManager.POPO_POLLING_INTERVAL_MS));
        }
        console.warn('[IMGatewayManager] POPO QR login poll timed out');
        return { success: false, message: '扫码超时，请重试。' };
    }
    async popoQrNotifyComplete(taskToken) {
        try {
            const url = `${IMGatewayManager.POPO_COMPLETE_API}?taskToken=${taskToken}`;
            await fetch(url, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(8_000),
            });
        }
        catch {
            console.warn('[IMGatewayManager] POPO QR notify complete failed (non-critical)');
        }
    }
    async testNimOpenClawConnectivity(configOverride) {
        const checks = [];
        const testedAt = Date.now();
        const platform = 'nim';
        const mergedConfig = this.buildMergedConfig(configOverride);
        const nimConfig = (mergedConfig.nim?.instances || []).find((inst) => Boolean((inst.nimToken && inst.nimToken.trim()) || inst.enabled || inst.appKey || inst.account || inst.token));
        if (!nimConfig || (!nimConfig.nimToken && (!nimConfig.appKey || !nimConfig.account || !nimConfig.token))) {
            const missing = [];
            if (!nimConfig?.nimToken) {
                if (!nimConfig?.appKey)
                    missing.push('appKey');
                if (!nimConfig?.account)
                    missing.push('account');
                if (!nimConfig?.token)
                    missing.push('token');
            }
            checks.push({
                code: 'missing_credentials',
                level: 'fail',
                message: (0, i18n_1.t)('imMissingCredentials', { fields: missing.join(', ') }),
                suggestion: (0, i18n_1.t)('imNimFillCredentials'),
            });
            return { platform, testedAt, verdict: 'fail', checks };
        }
        checks.push({
            code: 'auth_check',
            level: 'pass',
            message: (0, i18n_1.t)('imNimConfigReady', { account: nimConfig.account }),
        });
        checks.push({
            code: 'gateway_running',
            level: 'info',
            message: (0, i18n_1.t)('imNimOpenClawHint'),
        });
        checks.push({
            code: 'nim_p2p_only_hint',
            level: 'info',
            message: (0, i18n_1.t)('imNimP2pOnly'),
            suggestion: (0, i18n_1.t)('imNimP2pOnlySuggestion'),
        });
        const verdict = checks.some(c => c.level === 'fail')
            ? 'fail'
            : checks.some(c => c.level === 'warn')
                ? 'warn'
                : 'pass';
        return { platform, testedAt, verdict, checks };
    }
    /**
     * Test POPO connectivity when running via OpenClaw runtime.
     * Validates config completeness; actual connection is handled by OpenClaw.
     */
    async testPopoOpenClawConnectivity(configOverride) {
        const checks = [];
        const testedAt = Date.now();
        const platform = 'popo';
        const mergedConfig = this.buildMergedConfig(configOverride);
        const popoInstances = mergedConfig.popo?.instances || [];
        const popoConfig = popoInstances.find(i => i.enabled) || popoInstances[0];
        // Check 1: Credentials present
        const isWebhookMode = (popoConfig?.connectionMode ?? 'websocket') === 'webhook';
        const missing = [];
        if (!popoConfig?.appKey)
            missing.push('appKey');
        if (!popoConfig?.appSecret)
            missing.push('appSecret');
        if (isWebhookMode && !popoConfig?.token)
            missing.push('token');
        if (!popoConfig?.aesKey)
            missing.push('aesKey');
        if (missing.length > 0) {
            checks.push({
                code: 'missing_credentials',
                level: 'fail',
                message: (0, i18n_1.t)('imMissingCredentials', { fields: missing.join(', ') }),
                suggestion: isWebhookMode
                    ? (0, i18n_1.t)('imPopoFillWebhookCredentials')
                    : (0, i18n_1.t)('imPopoFillWsCredentials'),
            });
            return { platform, testedAt, verdict: 'fail', checks };
        }
        // Check 2: Config completeness passes
        checks.push({
            code: 'auth_check',
            level: 'pass',
            message: (0, i18n_1.t)('imPopoConfigReady'),
        });
        // Check 3: OpenClaw Gateway running info
        checks.push({
            code: 'gateway_running',
            level: 'info',
            message: (0, i18n_1.t)('imPopoOpenClawHint'),
        });
        const verdict = checks.some(c => c.level === 'fail')
            ? 'fail'
            : checks.some(c => c.level === 'warn')
                ? 'warn'
                : 'pass';
        return { platform, testedAt, verdict, checks };
    }
    async testQQOpenClawConnectivity(configOverride) {
        const checks = [];
        const testedAt = Date.now();
        const platform = 'qq';
        const mergedConfig = this.buildMergedConfig(configOverride);
        const qqInstances = mergedConfig.qq?.instances || [];
        const qqConfig = qqInstances.find(i => i.enabled) || qqInstances[0];
        // Check 1: Credentials present
        if (!qqConfig?.appId || !qqConfig?.appSecret) {
            const missing = [];
            if (!qqConfig?.appId)
                missing.push('appId');
            if (!qqConfig?.appSecret)
                missing.push('appSecret');
            checks.push({
                code: 'missing_credentials',
                level: 'fail',
                message: (0, i18n_1.t)('imMissingCredentials', { fields: missing.join(', ') }),
                suggestion: (0, i18n_1.t)('imQqFillAppIdSecret'),
            });
            return { platform, testedAt, verdict: 'fail', checks };
        }
        // Check 2: Auth probe via QQ Bot API
        try {
            const tokenResponse = await this.withTimeout((0, http_1.fetchJsonWithTimeout)('https://bots.qq.com/app/getAppAccessToken', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ appId: qqConfig.appId, clientSecret: qqConfig.appSecret }),
            }, CONNECTIVITY_TIMEOUT_MS), CONNECTIVITY_TIMEOUT_MS, (0, i18n_1.t)('imAuthProbeTimeout'));
            if (!tokenResponse.access_token) {
                throw new Error(tokenResponse.message || (0, i18n_1.t)('imQqAccessTokenFailed'));
            }
            checks.push({
                code: 'auth_check',
                level: 'pass',
                message: (0, i18n_1.t)('imQqAuthPassed'),
            });
        }
        catch (error) {
            checks.push({
                code: 'auth_check',
                level: 'fail',
                message: (0, i18n_1.t)('imQqAuthFailed', { error: error.message }),
                suggestion: (0, i18n_1.t)('imQqCheckAppIdSecret'),
            });
            return { platform, testedAt, verdict: 'fail', checks };
        }
        // Check 3: OpenClaw Gateway running info
        checks.push({
            code: 'gateway_running',
            level: 'info',
            message: (0, i18n_1.t)('imQqOpenClawHint'),
        });
        // Check 4: Mention hint
        checks.push({
            code: 'qq_mention_hint',
            level: 'info',
            message: (0, i18n_1.t)('imQqMentionHint'),
        });
        const verdict = checks.some(c => c.level === 'fail')
            ? 'fail'
            : checks.some(c => c.level === 'warn')
                ? 'warn'
                : 'pass';
        return { platform, testedAt, verdict, checks };
    }
    buildMergedConfig(configOverride) {
        const current = this.getConfig();
        if (!configOverride) {
            return current;
        }
        return {
            ...current,
            ...configOverride,
            dingtalk: configOverride.dingtalk || current.dingtalk,
            feishu: configOverride.feishu || current.feishu,
            qq: configOverride.qq || current.qq,
            telegram: configOverride.telegram || current.telegram,
            discord: configOverride.discord || current.discord,
            nim: { ...current.nim, ...(configOverride.nim || {}) },
            'netease-bee': { ...current['netease-bee'], ...(configOverride['netease-bee'] || {}) },
            wecom: configOverride.wecom || current.wecom,
            weixin: { ...current.weixin, ...(configOverride.weixin || {}) },
            popo: configOverride.popo || current.popo,
            settings: { ...current.settings, ...(configOverride.settings || {}) },
        };
    }
    getMissingCredentials(platform, config) {
        if (platform === 'dingtalk') {
            const dingtalkInstances = config.dingtalk?.instances || [];
            const dtInst = dingtalkInstances.find(i => i.enabled);
            if (!dtInst)
                return ['clientId', 'clientSecret'];
            const fields = [];
            if (!dtInst.clientId)
                fields.push('clientId');
            if (!dtInst.clientSecret)
                fields.push('clientSecret');
            return fields;
        }
        if (platform === 'feishu') {
            const feishuInstances = config.feishu?.instances || [];
            const fsInst = feishuInstances.find(i => i.enabled);
            if (!fsInst)
                return ['appId', 'appSecret'];
            const fields = [];
            if (!fsInst.appId)
                fields.push('appId');
            if (!fsInst.appSecret)
                fields.push('appSecret');
            return fields;
        }
        if (platform === 'telegram') {
            const telegramInstances = config.telegram?.instances || [];
            const tgInst = telegramInstances.find(i => i.enabled);
            if (!tgInst)
                return ['botToken'];
            return tgInst.botToken ? [] : ['botToken'];
        }
        if (platform === 'nim') {
            const nimInstances = config.nim?.instances || [];
            const nimInst = nimInstances.find(i => i.enabled);
            if (!nimInst)
                return ['appKey', 'account', 'token'];
            const fields = [];
            if (!nimInst.nimToken) {
                if (!nimInst.appKey)
                    fields.push('appKey');
                if (!nimInst.account)
                    fields.push('account');
                if (!nimInst.token)
                    fields.push('token');
            }
            return fields;
        }
        if (platform === 'netease-bee') {
            const fields = [];
            if (!config['netease-bee']?.clientId)
                fields.push('clientId');
            if (!config['netease-bee']?.secret)
                fields.push('secret');
            return fields;
        }
        if (platform === 'qq') {
            const qqInstances = config.qq?.instances || [];
            const qqInst = qqInstances.find(i => i.enabled);
            if (!qqInst)
                return ['appId', 'appSecret'];
            const fields = [];
            if (!qqInst.appId)
                fields.push('appId');
            if (!qqInst.appSecret)
                fields.push('appSecret');
            return fields;
        }
        if (platform === 'wecom') {
            const wecomInstances = config.wecom?.instances || [];
            const wcInst = wecomInstances.find(i => i.enabled);
            if (!wcInst)
                return ['botId', 'secret'];
            const fields = [];
            if (!wcInst.botId)
                fields.push('botId');
            if (!wcInst.secret)
                fields.push('secret');
            return fields;
        }
        if (platform === 'weixin') {
            // Weixin has no credentials; nothing to check
            return [];
        }
        if (platform === 'popo') {
            const popoInsts = config.popo?.instances || [];
            const popoInst = popoInsts.find(i => i.enabled);
            if (!popoInst)
                return ['appKey', 'appSecret', 'aesKey'];
            const fields = [];
            if (!popoInst.appKey)
                fields.push('appKey');
            if (!popoInst.appSecret)
                fields.push('appSecret');
            if ((popoInst.connectionMode ?? 'websocket') === 'webhook' && !popoInst.token)
                fields.push('token');
            if (!popoInst.aesKey)
                fields.push('aesKey');
            return fields;
        }
        const discordInstances = config.discord?.instances || [];
        const dcInst = discordInstances.find(i => i.enabled);
        return dcInst?.botToken ? [] : ['botToken'];
    }
    async runAuthProbe(platform, config) {
        if (platform === 'dingtalk') {
            const dingtalkInstances = config.dingtalk?.instances || [];
            const dtInst = dingtalkInstances.find(i => i.enabled && i.clientId && i.clientSecret);
            if (!dtInst) {
                throw new Error((0, i18n_1.t)('imConfigIncomplete'));
            }
            const tokenUrl = `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(dtInst.clientId)}&appsecret=${encodeURIComponent(dtInst.clientSecret)}`;
            const resp = await (0, http_1.fetchJsonWithTimeout)(tokenUrl, {}, CONNECTIVITY_TIMEOUT_MS);
            if (resp.errcode && resp.errcode !== 0) {
                throw new Error(resp.errmsg || `errcode ${resp.errcode}`);
            }
            return (0, i18n_1.t)('imDingtalkAuthPassed');
        }
        if (platform === 'feishu') {
            const feishuInstances = config.feishu?.instances || [];
            const fsInst = feishuInstances.find(i => i.enabled && i.appId && i.appSecret);
            if (!fsInst) {
                throw new Error((0, i18n_1.t)('imConfigIncomplete'));
            }
            const Lark = await Promise.resolve().then(() => __importStar(require('@larksuiteoapi/node-sdk')));
            const domain = this.resolveFeishuDomain(fsInst.domain, Lark);
            const client = new Lark.Client({
                appId: fsInst.appId,
                appSecret: fsInst.appSecret,
                appType: Lark.AppType.SelfBuild,
                domain,
            });
            const response = await client.request({
                method: 'GET',
                url: '/open-apis/bot/v3/info',
            });
            if (response.code !== 0) {
                throw new Error(response.msg || `code ${response.code}`);
            }
            const botName = response.data?.app_name ?? response.data?.bot?.app_name ?? 'unknown';
            return (0, i18n_1.t)('imFeishuAuthPassedWithBot', { botName });
        }
        if (platform === 'nim') {
            const nimInst = (config.nim?.instances || []).find(i => i.enabled && ((i.nimToken && i.nimToken.trim()) || (i.appKey && i.account && i.token)));
            if (!nimInst) {
                throw new Error((0, i18n_1.t)('imConfigIncomplete'));
            }
            return (0, i18n_1.t)('imNimConfigReady', { account: nimInst.account });
        }
        if (platform === 'netease-bee') {
            const nbConfig = config['netease-bee'];
            const clientId = nbConfig?.clientId;
            const secret = nbConfig?.secret;
            if (!clientId || !secret) {
                throw new Error((0, i18n_1.t)('imConfigIncomplete'));
            }
            return (0, i18n_1.t)('imNeteaseBeeConfigReady', { clientId });
        }
        if (platform === 'wecom') {
            const wecomInstances = config.wecom?.instances || [];
            const wcInst = wecomInstances.find(i => i.enabled && i.botId && i.secret);
            if (!wcInst) {
                throw new Error((0, i18n_1.t)('imConfigIncomplete'));
            }
            return (0, i18n_1.t)('imWecomConfigReadyOpenClaw', { botId: wcInst.botId });
        }
        if (platform === 'weixin') {
            // Weixin has no credentials to probe; just confirm enabled
            return (0, i18n_1.t)('imWeixinConfigReadyOpenClaw');
        }
        if (platform === 'popo') {
            const popoInsts = config.popo?.instances || [];
            const popoInst = popoInsts.find(i => i.enabled) || popoInsts[0];
            if (!popoInst)
                throw new Error((0, i18n_1.t)('imConfigIncomplete'));
            const { appKey, appSecret, token, aesKey, connectionMode } = popoInst;
            const isWebhook = (connectionMode ?? 'websocket') === 'webhook';
            if (!appKey || !appSecret || !aesKey || (isWebhook && !token)) {
                throw new Error((0, i18n_1.t)('imConfigIncomplete'));
            }
            return (0, i18n_1.t)('imPopoConfigReadyOpenClaw');
        }
        if (platform === 'qq') {
            const qqInstances = config.qq?.instances || [];
            const qqInst = qqInstances.find(i => i.enabled && i.appId && i.appSecret);
            if (!qqInst) {
                throw new Error((0, i18n_1.t)('imConfigIncomplete'));
            }
            const { appId, appSecret } = qqInst;
            // Verify credentials by requesting an AccessToken directly via HTTP
            // This avoids starting a full WebSocket connection just for auth check
            const tokenResponse = await (0, http_1.fetchJsonWithTimeout)('https://bots.qq.com/app/getAppAccessToken', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ appId, clientSecret: appSecret }),
            }, CONNECTIVITY_TIMEOUT_MS);
            if (!tokenResponse.access_token) {
                throw new Error(tokenResponse.message || (0, i18n_1.t)('imQqAccessTokenFailed'));
            }
            return (0, i18n_1.t)('imQqAuthPassed');
        }
        return (0, i18n_1.t)('imUnknownPlatform');
    }
    async sendConversationReply(platform, conversationId, text) {
        try {
            switch (platform) {
                default:
                    return this.sendNotificationWithMedia(platform, text);
            }
        }
        catch (error) {
            console.error(`[IMGatewayManager] Failed to send conversation reply for ${platform}:${conversationId}:`, error);
            return false;
        }
    }
    // ─── DingTalk direct HTTP API ──────────────────────────────────────────────
    async getDingTalkAccessToken(clientId, clientSecret) {
        const now = Date.now();
        if (this.dingTalkAccessToken && this.dingTalkAccessTokenExpiry > now + 60_000) {
            return this.dingTalkAccessToken;
        }
        const resp = await (0, http_1.fetchJsonWithTimeout)('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appKey: clientId, appSecret: clientSecret }),
        }, 10_000);
        if (!resp.accessToken) {
            throw new Error('DingTalk accessToken response missing token');
        }
        this.dingTalkAccessToken = resp.accessToken;
        this.dingTalkAccessTokenExpiry = now + ((resp.expireIn ?? 7200) * 1000);
        return this.dingTalkAccessToken;
    }
    async sendDingTalkDirectHttp(userId, text) {
        const dtInstances = this.imStore.getDingTalkInstances();
        const dtConfig = dtInstances.find(i => i.enabled && i.clientId && i.clientSecret);
        if (!dtConfig?.clientId || !dtConfig?.clientSecret) {
            console.warn('[IMGatewayManager] DingTalk direct send skipped: missing clientId/clientSecret');
            return false;
        }
        const token = await this.getDingTalkAccessToken(dtConfig.clientId, dtConfig.clientSecret);
        // Auto-detect markdown vs plain text.
        const hasMarkdown = /^[#*>\-]|[*_`#\[\]]/.test(text) || text.includes('\n');
        const msgKey = hasMarkdown ? 'sampleMarkdown' : 'sampleText';
        const msgParam = hasMarkdown
            ? { title: text.split('\n')[0].replace(/^[#*\s\->]+/, '').slice(0, 20) || 'Message', text }
            : { content: text };
        const body = {
            robotCode: dtConfig.clientId,
            userIds: [userId],
            msgKey,
            msgParam: JSON.stringify(msgParam),
        };
        console.log('[IMGatewayManager] DingTalk direct HTTP send', JSON.stringify({
            userId,
            msgKey,
            textLength: text.length,
        }));
        const resp = await (0, http_1.fetchJsonWithTimeout)('https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend', {
            method: 'POST',
            headers: {
                'x-acs-dingtalk-access-token': token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        }, 10_000);
        if (resp.processQueryKey) {
            console.log(`[IMGatewayManager] DingTalk direct send success: processQueryKey=${resp.processQueryKey}`);
            return true;
        }
        console.warn('[IMGatewayManager] DingTalk direct send unexpected response:', JSON.stringify(resp));
        return false;
    }
    async primeConversationReplyRoute(platform, conversationId, coworkSessionId) {
        if (platform !== 'dingtalk') {
            return;
        }
        try {
            const lookup = await this.lookupDingTalkConversationReplyRoute(conversationId, coworkSessionId);
            const resolved = lookup?.resolved;
            if (resolved) {
                this.cacheConversationReplyRoute('dingtalk', conversationId, resolved.route);
                const sendParams = (0, imDeliveryRoute_1.buildDingTalkSendParamsFromRoute)(resolved.route);
                console.log('[IMGatewayManager] Primed DingTalk reply route', JSON.stringify({
                    conversationId,
                    coworkSessionId: lookup.coworkSessionId,
                    sessionKey: resolved.sessionKey,
                    channel: resolved.route.channel,
                    target: sendParams?.target ?? resolved.route.to,
                    accountId: sendParams?.accountId ?? resolved.route.accountId ?? null,
                }));
                return;
            }
            // Fallback: construct route from session key JSON context.
            // When the OpenClaw session lacks deliveryContext (e.g. cron-triggered runs),
            // the session key itself may embed a JSON SessionContext with all needed info.
            const fallbackRoute = this.buildDingTalkRouteFromSessionKeys(lookup?.candidateSessionKeys ?? []);
            if (fallbackRoute) {
                this.cacheConversationReplyRoute('dingtalk', conversationId, fallbackRoute.route);
                console.log('[IMGatewayManager] Primed DingTalk reply route from session key context', JSON.stringify({
                    conversationId,
                    coworkSessionId,
                    sessionKey: fallbackRoute.sessionKey,
                    channel: fallbackRoute.route.channel,
                    target: fallbackRoute.route.to,
                    accountId: fallbackRoute.route.accountId ?? null,
                }));
            }
        }
        catch (error) {
            console.warn(`[IMGatewayManager] Failed to prime DingTalk reply route for ${conversationId}:`, error?.message || error);
        }
    }
    async resolveDingTalkConversationReplyTarget(conversationId) {
        let lookup = null;
        try {
            lookup = await this.lookupDingTalkConversationReplyRoute(conversationId);
        }
        catch (error) {
            console.warn(`[IMGatewayManager] Failed to query OpenClaw DingTalk reply route for ${conversationId}:`, error?.message || error);
        }
        if (!lookup?.resolved) {
            if (lookup) {
                console.warn(`[IMGatewayManager] No OpenClaw delivery route found for DingTalk session ${lookup.coworkSessionId}`, JSON.stringify({
                    conversationId,
                    candidateSessionKeys: lookup.candidateSessionKeys,
                    dingtalkSessionKeys: lookup.dingtalkSessionKeys,
                }));
            }
            const cachedRoute = this.imStore.getConversationReplyRoute('dingtalk', conversationId);
            if (cachedRoute) {
                const cachedSendParams = (0, imDeliveryRoute_1.buildDingTalkSendParamsFromRoute)(cachedRoute);
                if (cachedSendParams) {
                    console.log('[IMGatewayManager] Reused cached DingTalk reply route', JSON.stringify({
                        conversationId,
                        channel: cachedRoute.channel,
                        target: cachedSendParams.target,
                        accountId: cachedSendParams.accountId ?? null,
                    }));
                    return cachedSendParams;
                }
            }
            // Fallback: construct route from session key JSON context when OpenClaw
            // session lacks deliveryContext (common for cron-triggered runs).
            const fallbackRoute = this.buildDingTalkRouteFromSessionKeys(lookup?.candidateSessionKeys ?? []);
            if (fallbackRoute) {
                this.cacheConversationReplyRoute('dingtalk', conversationId, fallbackRoute.route);
                const fallbackSendParams = (0, imDeliveryRoute_1.buildDingTalkSendParamsFromRoute)(fallbackRoute.route);
                if (fallbackSendParams) {
                    console.log('[IMGatewayManager] Resolved DingTalk reply route from session key context', JSON.stringify({
                        conversationId,
                        sessionKey: fallbackRoute.sessionKey,
                        channel: fallbackRoute.route.channel,
                        target: fallbackSendParams.target,
                        accountId: fallbackSendParams.accountId ?? null,
                    }));
                    return fallbackSendParams;
                }
            }
            return null;
        }
        const { resolved } = lookup;
        this.cacheConversationReplyRoute('dingtalk', conversationId, resolved.route);
        const sendParams = (0, imDeliveryRoute_1.buildDingTalkSendParamsFromRoute)(resolved.route);
        if (!sendParams) {
            console.warn(`[IMGatewayManager] OpenClaw route for ${resolved.sessionKey} is not a DingTalk route: ${resolved.route.channel}`);
            return null;
        }
        console.log('[IMGatewayManager] Resolved DingTalk reply route', JSON.stringify({
            conversationId,
            coworkSessionId: lookup.coworkSessionId,
            sessionKey: resolved.sessionKey,
            channel: resolved.route.channel,
            target: sendParams.target,
            accountId: sendParams.accountId ?? null,
        }));
        return sendParams;
    }
    async lookupDingTalkConversationReplyRoute(conversationId, coworkSessionId) {
        const normalizedCoworkSessionId = coworkSessionId?.trim()
            || this.imStore.getSessionMapping(conversationId, 'dingtalk')?.coworkSessionId
            || '';
        if (!normalizedCoworkSessionId) {
            return null;
        }
        const result = await this.requestOpenClawGateway('sessions.list', {
            includeGlobal: true,
            includeUnknown: true,
            limit: 200,
        });
        const sessions = Array.isArray(result?.sessions) ? result.sessions : [];
        const candidateSessionKeys = [
            ...(this.getOpenClawSessionKeysForCoworkSession?.(normalizedCoworkSessionId) ?? []),
            ...(0, imDeliveryRoute_1.buildDingTalkSessionKeyCandidates)(conversationId),
        ];
        return {
            coworkSessionId: normalizedCoworkSessionId,
            candidateSessionKeys,
            dingtalkSessionKeys: this.collectSessionKeysByChannel(sessions, DINGTALK_OPENCLAW_CHANNEL),
            resolved: (0, imDeliveryRoute_1.resolveOpenClawDeliveryRouteForSessionKeys)(candidateSessionKeys, sessions)
                ?? (0, imDeliveryRoute_1.resolveManagedSessionDeliveryRoute)(normalizedCoworkSessionId, sessions),
        };
    }
    cacheConversationReplyRoute(platform, conversationId, route) {
        this.imStore.setConversationReplyRoute(platform, conversationId, route);
    }
    collectSessionKeysByChannel(sessions, channel) {
        const normalizedChannel = channel.trim().toLowerCase();
        const matches = [];
        for (const entry of sessions) {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                continue;
            }
            const record = entry;
            const key = typeof record.key === 'string' ? record.key.trim() : '';
            if (!key) {
                continue;
            }
            const deliveryContext = record.deliveryContext;
            const deliveryChannel = deliveryContext && typeof deliveryContext === 'object' && !Array.isArray(deliveryContext)
                ? (typeof deliveryContext.channel === 'string'
                    ? deliveryContext.channel
                    : undefined)
                : undefined;
            const lastChannel = typeof record.lastChannel === 'string' ? record.lastChannel : undefined;
            const routeChannel = (deliveryChannel ?? lastChannel ?? '').trim().toLowerCase();
            if (routeChannel !== normalizedChannel && !key.toLowerCase().includes(normalizedChannel)) {
                continue;
            }
            matches.push(key);
            if (matches.length >= 12) {
                break;
            }
        }
        return matches;
    }
    parseDingTalkConversationTarget(conversationId) {
        const parts = conversationId.split(':').filter(Boolean);
        if (parts.length < 2) {
            return null;
        }
        const accountId = parts[0]?.trim();
        if (!accountId) {
            return null;
        }
        // The dingtalk-connector plugin uses "__default__" as an internal account
        // lookup key.  The send API expects this key (or undefined for default),
        // NOT the actual clientId.  Omit it so the plugin uses its default account.
        const resolvedAccountId = accountId === '__default__' ? undefined : accountId;
        if ((parts[1] === 'user' || parts[1] === 'group') && parts[2]) {
            return {
                accountId: resolvedAccountId,
                target: `${parts[1]}:${parts.slice(2).join(':')}`,
            };
        }
        const senderId = parts[1]?.trim();
        if (!senderId) {
            return null;
        }
        return {
            accountId: resolvedAccountId,
            target: `user:${senderId}`,
        };
    }
    buildDingTalkRouteFromSessionKeys(sessionKeys) {
        for (const sessionKey of sessionKeys) {
            const jsonIdx = sessionKey.indexOf(':{');
            if (jsonIdx < 0) {
                continue;
            }
            const jsonStr = sessionKey.slice(jsonIdx + 1);
            let ctx;
            try {
                ctx = JSON.parse(jsonStr);
            }
            catch {
                continue;
            }
            if (!ctx || typeof ctx.channel !== 'string') {
                continue;
            }
            const channel = ctx.channel.trim().toLowerCase();
            if (channel !== 'dingtalk-connector' && channel !== 'dingtalk') {
                continue;
            }
            // Determine the target address from the session context.
            const chatType = typeof ctx.chattype === 'string' ? ctx.chattype : 'direct';
            const peerId = typeof ctx.peerid === 'string' ? ctx.peerid.trim() : '';
            const ctxConversationId = typeof ctx.conversationid === 'string' ? ctx.conversationid.trim() : '';
            if (!peerId && !ctxConversationId) {
                continue;
            }
            const to = chatType === 'group'
                ? `group:${ctxConversationId || peerId}`
                : `user:${peerId || ctxConversationId}`;
            // Keep the original accountId from the session context (e.g. '__default__').
            // The dingtalk-connector plugin uses this as an account lookup key, NOT the clientId.
            // When accountId is '__default__', omit it so the plugin uses its default account.
            let accountId = typeof ctx.accountid === 'string' ? ctx.accountid.trim() : undefined;
            if (!accountId || accountId === '__default__') {
                accountId = undefined;
            }
            return {
                sessionKey,
                route: {
                    channel: DINGTALK_OPENCLAW_CHANNEL,
                    to,
                    ...(accountId ? { accountId } : {}),
                },
            };
        }
        return null;
    }
    /**
     * Fetch the OpenClaw config schema (JSON Schema + uiHints) from the gateway.
     * Returns { schema, uiHints } or null if the gateway is unavailable.
     */
    async getOpenClawConfigSchema() {
        try {
            return await this.requestOpenClawGateway('config.schema', {});
        }
        catch (err) {
            console.warn('[IMGatewayManager] Failed to fetch config.schema from OpenClaw gateway:', err.message);
            return null;
        }
    }
    async requestOpenClawGateway(method, params) {
        let client = this.getOpenClawGatewayClient?.() ?? null;
        if (!client) {
            await this.ensureOpenClawGatewayReady?.();
            client = this.getOpenClawGatewayClient?.() ?? null;
        }
        if (!client) {
            throw new Error('The engine is not running.');
        }
        return client.request(method, params);
    }
    resolveFeishuDomain(domain, Lark) {
        if (domain === 'lark')
            return Lark.Domain.Lark;
        if (domain === 'feishu')
            return Lark.Domain.Feishu;
        return domain.replace(/\/+$/, '');
    }
    withTimeout(promise, timeoutMs, timeoutError) {
        let timeoutId = null;
        const timeoutPromise = new Promise((_resolve, reject) => {
            timeoutId = setTimeout(() => reject(new Error(timeoutError)), timeoutMs);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        });
    }
    getStartedAtMs(platform, status) {
        if (platform === 'feishu') {
            const startedAt = status.feishu.instances?.[0]?.startedAt;
            return startedAt ? Date.parse(startedAt) : null;
        }
        if (platform === 'dingtalk')
            return status.dingtalk.instances?.[0]?.startedAt ?? null;
        if (platform === 'telegram')
            return status.telegram.instances?.[0]?.startedAt ?? null;
        if (platform === 'nim')
            return status.nim.instances?.[0]?.startedAt ?? null;
        if (platform === 'netease-bee')
            return status['netease-bee'].startedAt;
        if (platform === 'qq')
            return status.qq.instances?.[0]?.startedAt ?? null;
        if (platform === 'wecom')
            return status.wecom.instances?.[0]?.startedAt ?? null;
        if (platform === 'weixin')
            return status.weixin.startedAt;
        if (platform === 'popo')
            return status.popo.instances?.[0]?.startedAt ?? null;
        return status.discord.instances?.[0]?.startedAt ?? null;
    }
    getLastInboundAt(platform, status) {
        if (platform === 'dingtalk')
            return status.dingtalk.instances?.[0]?.lastInboundAt ?? null;
        if (platform === 'feishu')
            return status.feishu.instances?.[0]?.lastInboundAt ?? null;
        if (platform === 'telegram')
            return status.telegram.instances?.[0]?.lastInboundAt ?? null;
        if (platform === 'nim')
            return status.nim.instances?.[0]?.lastInboundAt ?? null;
        if (platform === 'netease-bee')
            return status['netease-bee'].lastInboundAt;
        if (platform === 'qq')
            return status.qq.instances?.[0]?.lastInboundAt ?? null;
        if (platform === 'wecom')
            return status.wecom.instances?.[0]?.lastInboundAt ?? null;
        if (platform === 'weixin')
            return status.weixin.lastInboundAt;
        if (platform === 'popo')
            return status.popo.instances?.[0]?.lastInboundAt ?? null;
        return status.discord.instances?.[0]?.lastInboundAt ?? null;
    }
    getLastOutboundAt(platform, status) {
        if (platform === 'dingtalk')
            return status.dingtalk.instances?.[0]?.lastOutboundAt ?? null;
        if (platform === 'feishu')
            return status.feishu.instances?.[0]?.lastOutboundAt ?? null;
        if (platform === 'telegram')
            return status.telegram.instances?.[0]?.lastOutboundAt ?? null;
        if (platform === 'nim')
            return status.nim.instances?.[0]?.lastOutboundAt ?? null;
        if (platform === 'netease-bee')
            return status['netease-bee'].lastOutboundAt;
        if (platform === 'qq')
            return status.qq.instances?.[0]?.lastOutboundAt ?? null;
        if (platform === 'wecom')
            return status.wecom.instances?.[0]?.lastOutboundAt ?? null;
        if (platform === 'weixin')
            return status.weixin.lastOutboundAt;
        if (platform === 'popo')
            return status.popo.instances?.[0]?.lastOutboundAt ?? null;
        return status.discord.instances?.[0]?.lastOutboundAt ?? null;
    }
    getLastError(platform, status) {
        if (platform === 'dingtalk')
            return status.dingtalk.instances?.[0]?.lastError ?? null;
        if (platform === 'feishu')
            return status.feishu.instances?.[0]?.error ?? null;
        if (platform === 'telegram')
            return status.telegram.instances?.[0]?.lastError ?? null;
        if (platform === 'nim')
            return status.nim.instances?.[0]?.lastError ?? null;
        if (platform === 'netease-bee')
            return status['netease-bee'].lastError;
        if (platform === 'qq')
            return status.qq.instances?.[0]?.lastError ?? null;
        if (platform === 'wecom')
            return status.wecom.instances?.[0]?.lastError ?? null;
        if (platform === 'weixin')
            return status.weixin.lastError;
        if (platform === 'popo')
            return status.popo.instances?.[0]?.lastError ?? null;
        return status.discord.instances?.[0]?.lastError ?? null;
    }
    // ==================== Feishu Bot Install Helpers ====================
    /** Lazy-load and cache the feishu-auth module (avoid repeated dynamic import overhead). */
    _feishuAuthModule = null;
    async getFeishuAuthModule() {
        if (!this._feishuAuthModule) {
            this._feishuAuthModule = await Promise.resolve().then(() => __importStar(require('@larksuite/openclaw-lark-tools/dist/utils/feishu-auth.js')));
        }
        return this._feishuAuthModule;
    }
    /**
     * Start the Feishu Device Flow onboarding: init + begin.
     * Returns data needed to render a QR code in the UI.
     * Also caches isLark so that pollFeishuInstall uses the correct domain.
     */
    _feishuInstallIsLark = false;
    async startFeishuInstallQrcode(isLark) {
        const { FeishuAuth } = await this.getFeishuAuthModule();
        this._feishuInstallIsLark = isLark;
        const auth = new FeishuAuth();
        auth.setDomain(isLark);
        await auth.init();
        const resp = await auth.begin();
        return {
            url: resp.verification_uri_complete,
            deviceCode: resp.device_code,
            interval: resp.interval ?? 5,
            expireIn: resp.expire_in ?? 300,
        };
    }
    /**
     * Poll Feishu Device Flow for the result of a QR code scan.
     * Uses the domain set during startFeishuInstallQrcode to ensure consistency.
     */
    async pollFeishuInstall(deviceCode) {
        const { FeishuAuth } = await this.getFeishuAuthModule();
        const auth = new FeishuAuth();
        auth.setDomain(this._feishuInstallIsLark);
        const resp = await auth.poll(deviceCode);
        if (resp.error) {
            if (resp.error === 'authorization_pending' || resp.error === 'slow_down') {
                return { done: false };
            }
            return { done: false, error: resp.error_description || resp.error };
        }
        if (resp.client_id && resp.client_secret) {
            const domain = resp.user_info?.tenant_brand === 'lark' ? 'lark' : 'feishu';
            return { done: true, appId: resp.client_id, appSecret: resp.client_secret, domain };
        }
        return { done: false };
    }
    /**
     * Validate existing Feishu app credentials (App ID + App Secret).
     */
    async verifyFeishuCredentials(appId, appSecret) {
        const { validateAppCredentials } = await this.getFeishuAuthModule();
        try {
            const valid = await validateAppCredentials(appId, appSecret);
            if (valid) {
                return { success: true };
            }
            return { success: false, error: (0, i18n_1.t)('feishuVerifyCredentialsFailed') };
        }
        catch (err) {
            return { success: false, error: err?.message || (0, i18n_1.t)('feishuVerifyFailed') };
        }
    }
    // ==================== DingTalk Bot Install Helpers ====================
    static DINGTALK_REGISTRATION_BASE_URL = 'https://oapi.dingtalk.com';
    static DINGTALK_REGISTRATION_SOURCE = 'DING_DWS_CLAW';
    /**
     * Start the DingTalk Device Flow onboarding: init + begin.
     * Returns data needed to render a QR code in the UI.
     */
    async startDingTalkInstallQrcode() {
        const baseUrl = IMGatewayManager.DINGTALK_REGISTRATION_BASE_URL;
        const source = IMGatewayManager.DINGTALK_REGISTRATION_SOURCE;
        // Step 1: init — obtain nonce
        const initResp = await fetch(`${baseUrl}/app/registration/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source }),
        });
        const initData = await initResp.json();
        if (initData.errcode !== 0 || !initData.nonce) {
            throw new Error(initData.errmsg || 'DingTalk registration init failed');
        }
        // Step 2: begin — obtain device_code + QR url
        const beginResp = await fetch(`${baseUrl}/app/registration/begin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nonce: initData.nonce }),
        });
        const beginData = await beginResp.json();
        if (beginData.errcode !== 0 || !beginData.device_code || !beginData.verification_uri_complete) {
            throw new Error(beginData.errmsg || 'DingTalk registration begin failed');
        }
        return {
            url: beginData.verification_uri_complete,
            deviceCode: beginData.device_code,
            interval: beginData.interval ?? 5,
            expireIn: beginData.expires_in ?? 600,
        };
    }
    /**
     * Poll DingTalk Device Flow for the result of a QR code scan.
     */
    async pollDingTalkInstall(deviceCode) {
        const baseUrl = IMGatewayManager.DINGTALK_REGISTRATION_BASE_URL;
        const pollResp = await fetch(`${baseUrl}/app/registration/poll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_code: deviceCode }),
        });
        const pollData = await pollResp.json();
        if (pollData.errcode !== 0) {
            return { done: false, error: pollData.errmsg || 'poll error' };
        }
        const status = (pollData.status ?? '').toUpperCase();
        if (status === 'SUCCESS' && pollData.client_id && pollData.client_secret) {
            return { done: true, clientId: pollData.client_id, clientSecret: pollData.client_secret };
        }
        if (status === 'FAIL') {
            return { done: false, error: pollData.fail_reason || 'authorization failed' };
        }
        if (status === 'EXPIRED') {
            return { done: false, error: 'authorization expired' };
        }
        // WAITING or other — keep polling
        return { done: false };
    }
    /**
     * Validate existing DingTalk app credentials (Client ID + Client Secret).
     */
    async verifyDingTalkCredentials(clientId, clientSecret) {
        try {
            const resp = await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ appKey: clientId, appSecret: clientSecret }),
            });
            const data = await resp.json();
            if (data.accessToken) {
                return { success: true };
            }
            return { success: false, error: data.message || (0, i18n_1.t)('dingtalkVerifyCredentialsFailed') };
        }
        catch (err) {
            return { success: false, error: (err instanceof Error ? err.message : undefined) || (0, i18n_1.t)('dingtalkVerifyFailed') };
        }
    }
    calculateVerdict(checks) {
        if (checks.some((check) => check.level === 'fail')) {
            return 'fail';
        }
        if (checks.some((check) => check.level === 'warn')) {
            return 'warn';
        }
        return 'pass';
    }
    async testEmailConnectivity(configOverride) {
        const checks = [];
        const testedAt = Date.now();
        const platform = 'email';
        const mergedConfig = this.buildMergedConfig(configOverride);
        const emailInstances = mergedConfig.email?.instances || [];
        const inst = emailInstances.find(i => i.enabled) || emailInstances[0];
        if (!inst) {
            checks.push({
                code: 'missing_credentials',
                level: 'fail',
                message: (0, i18n_1.t)('imMissingCredentials', { fields: 'email' }),
            });
            return { platform, testedAt, verdict: 'fail', checks };
        }
        if (!inst.email) {
            checks.push({
                code: 'missing_credentials',
                level: 'fail',
                message: (0, i18n_1.t)('imMissingCredentials', { fields: 'email address' }),
            });
            return { platform, testedAt, verdict: 'fail', checks };
        }
        if (inst.transport === 'imap') {
            // IMAP mode: test IMAP login via raw TLS socket
            const missing = [];
            if (!inst.password)
                missing.push('password');
            if (!inst.imapHost)
                missing.push('IMAP host');
            if (missing.length > 0) {
                checks.push({
                    code: 'missing_credentials',
                    level: 'fail',
                    message: (0, i18n_1.t)('imMissingCredentials', { fields: missing.join(', ') }),
                });
                return { platform, testedAt, verdict: 'fail', checks };
            }
            try {
                const tls = await Promise.resolve().then(() => __importStar(require('tls')));
                await new Promise((resolve, reject) => {
                    let greeted = false;
                    let settled = false;
                    const timer = setTimeout(() => {
                        if (!settled) {
                            settled = true;
                            socket.destroy();
                            reject(new Error((0, i18n_1.t)('imAuthProbeTimeout')));
                        }
                    }, CONNECTIVITY_TIMEOUT_MS);
                    const socket = tls.connect({
                        host: inst.imapHost,
                        port: inst.imapPort || 993,
                        rejectUnauthorized: true,
                    });
                    let buffer = '';
                    socket.on('data', (data) => {
                        buffer += data.toString();
                        const lines = buffer.split('\r\n');
                        buffer = lines.pop() || '';
                        for (const line of lines) {
                            if (!line)
                                continue;
                            // Wait for server greeting before sending LOGIN
                            if (!greeted && line.startsWith('* OK')) {
                                greeted = true;
                                const tag = 'A001';
                                const loginCmd = `${tag} LOGIN "${inst.email}" "${inst.password}"\r\n`;
                                socket.write(loginCmd);
                                continue;
                            }
                            // Check LOGIN response
                            if (greeted && line.startsWith('A001')) {
                                clearTimeout(timer);
                                socket.destroy();
                                if (!settled) {
                                    settled = true;
                                    if (line.includes('OK')) {
                                        resolve();
                                    }
                                    else {
                                        reject(new Error(line.replace(/^A001\s*/, '')));
                                    }
                                }
                                return;
                            }
                        }
                    });
                    socket.on('error', (err) => {
                        clearTimeout(timer);
                        if (!settled) {
                            settled = true;
                            reject(err);
                        }
                    });
                    socket.on('close', () => {
                        clearTimeout(timer);
                        if (!settled) {
                            settled = true;
                            reject(new Error('Connection closed'));
                        }
                    });
                });
                checks.push({
                    code: 'auth_check',
                    level: 'pass',
                    message: (0, i18n_1.t)('imEmailImapAuthPassed'),
                });
            }
            catch (error) {
                checks.push({
                    code: 'auth_check',
                    level: 'fail',
                    message: `${(0, i18n_1.t)('imEmailImapAuthFailed')}: ${error.message}`,
                    suggestion: (0, i18n_1.t)('imAuthFailedSuggestion'),
                });
                return { platform, testedAt, verdict: 'fail', checks };
            }
        }
        else if (inst.transport === 'ws') {
            // WS mode: validate API Key by exchanging for IM token
            if (!inst.apiKey) {
                checks.push({
                    code: 'missing_credentials',
                    level: 'fail',
                    message: (0, i18n_1.t)('imMissingCredentials', { fields: 'API Key' }),
                });
                return { platform, testedAt, verdict: 'fail', checks };
            }
            try {
                const result = await this.withTimeout((0, http_1.fetchJsonWithTimeout)('https://claw.163.com/claw-api-gateway/open/v1/mail/auth/im-token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${inst.apiKey}`,
                    },
                    body: JSON.stringify({ uid: inst.email }),
                }, CONNECTIVITY_TIMEOUT_MS), CONNECTIVITY_TIMEOUT_MS, (0, i18n_1.t)('imAuthProbeTimeout'));
                if (!result.success) {
                    throw new Error(result.message || `API returned code ${result.code}`);
                }
                checks.push({
                    code: 'auth_check',
                    level: 'pass',
                    message: (0, i18n_1.t)('imEmailWsAuthPassed'),
                });
            }
            catch (error) {
                checks.push({
                    code: 'auth_check',
                    level: 'fail',
                    message: `${(0, i18n_1.t)('imAuthFailed', { error: error.message })}`,
                    suggestion: (0, i18n_1.t)('imAuthFailedSuggestion'),
                });
                return { platform, testedAt, verdict: 'fail', checks };
            }
        }
        // Gateway running status
        const status = this.getStatus();
        const emailStatus = status.email?.instances?.find((s) => s.instanceId === inst.instanceId);
        const connected = emailStatus?.connected ?? false;
        if (inst.enabled && !connected) {
            checks.push({
                code: 'gateway_running',
                level: 'warn',
                message: (0, i18n_1.t)('imChannelEnabledNotConnected'),
                suggestion: (0, i18n_1.t)('imChannelEnabledNotConnectedSuggestion'),
            });
        }
        else {
            checks.push({
                code: 'gateway_running',
                level: connected ? 'pass' : 'info',
                message: connected ? (0, i18n_1.t)('imChannelRunning') : (0, i18n_1.t)('imChannelNotEnabled'),
            });
        }
        return { platform, testedAt, verdict: this.calculateVerdict(checks), checks };
    }
}
exports.IMGatewayManager = IMGatewayManager;
//# sourceMappingURL=imGatewayManager.js.map