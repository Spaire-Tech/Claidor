"use strict";
/**
 * IM Gateway Type Definitions
 * Types for DingTalk, Feishu and Telegram IM bot integration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_IM_STATUS = exports.DEFAULT_WEIXIN_STATUS = exports.DEFAULT_POPO_MULTI_INSTANCE_STATUS = exports.DEFAULT_POPO_STATUS = exports.DEFAULT_WECOM_STATUS = exports.DEFAULT_QQ_STATUS = exports.DEFAULT_NETEASE_BEE_STATUS = exports.DEFAULT_NIM_MULTI_INSTANCE_STATUS = exports.DEFAULT_NIM_STATUS = exports.DEFAULT_DISCORD_STATUS = exports.DEFAULT_FEISHU_STATUS = exports.DEFAULT_DINGTALK_STATUS = exports.DEFAULT_IM_CONFIG = exports.DEFAULT_IM_SETTINGS = exports.DEFAULT_WEIXIN_CONFIG = exports.DEFAULT_POPO_MULTI_INSTANCE_CONFIG = exports.DEFAULT_POPO_CONFIG = exports.DEFAULT_WECOM_MULTI_INSTANCE_CONFIG = exports.DEFAULT_WECOM_CONFIG = exports.DEFAULT_FEISHU_MULTI_INSTANCE_CONFIG = exports.DEFAULT_QQ_MULTI_INSTANCE_CONFIG = exports.DEFAULT_QQ_CONFIG = exports.DEFAULT_TELEGRAM_MULTI_INSTANCE_CONFIG = exports.DEFAULT_TELEGRAM_OPENCLAW_CONFIG = exports.DEFAULT_NETEASE_BEE_CONFIG = exports.DEFAULT_NIM_CONFIG = exports.DEFAULT_NIM_MULTI_INSTANCE_CONFIG = exports.DEFAULT_NIM_OPENCLAW_CONFIG = exports.DEFAULT_DISCORD_MULTI_INSTANCE_CONFIG = exports.DEFAULT_DISCORD_OPENCLAW_CONFIG = exports.DEFAULT_FEISHU_OPENCLAW_CONFIG = exports.DEFAULT_DINGTALK_OPENCLAW_CONFIG = exports.MAX_EMAIL_INSTANCES = exports.DEFAULT_EMAIL_MULTI_INSTANCE_CONFIG = exports.DEFAULT_EMAIL_INSTANCE_CONFIG = exports.MAX_POPO_INSTANCES = exports.MAX_WECOM_INSTANCES = exports.MAX_QQ_INSTANCES = exports.MAX_NIM_INSTANCES = exports.MAX_DISCORD_INSTANCES = exports.MAX_TELEGRAM_INSTANCES = exports.MAX_FEISHU_INSTANCES = exports.DEFAULT_DINGTALK_MULTI_INSTANCE_CONFIG = exports.MAX_DINGTALK_INSTANCES = void 0;
// ==================== DingTalk Multi-Instance Types ====================
exports.MAX_DINGTALK_INSTANCES = 20;
exports.DEFAULT_DINGTALK_MULTI_INSTANCE_CONFIG = {
    instances: [],
};
// ==================== Feishu Multi-Instance Types ====================
exports.MAX_FEISHU_INSTANCES = 20;
// ==================== Telegram Multi-Instance Types ====================
exports.MAX_TELEGRAM_INSTANCES = 20;
exports.MAX_DISCORD_INSTANCES = 20;
// NIM supports max 3 instances (enabled or not), may use different accounts or AppKeys.
// See: https://doc.yunxin.163.com/messaging2/ai-guide/TMwNzk4MzU?platform=client#多实例配置
exports.MAX_NIM_INSTANCES = 3;
// ==================== QQ Multi-Instance Types ====================
exports.MAX_QQ_INSTANCES = 5;
// ==================== WeCom Multi-Instance Types ====================
exports.MAX_WECOM_INSTANCES = 20;
exports.MAX_POPO_INSTANCES = 20;
exports.DEFAULT_EMAIL_INSTANCE_CONFIG = {
    enabled: false,
    transport: 'ws',
    agentId: 'main',
    replyMode: 'complete',
    replyTo: 'sender',
    a2aEnabled: true,
    a2aMaxPingPongTurns: 20,
};
exports.DEFAULT_EMAIL_MULTI_INSTANCE_CONFIG = {
    instances: [],
};
exports.MAX_EMAIL_INSTANCES = 20;
// ==================== Default Configurations ====================
exports.DEFAULT_DINGTALK_OPENCLAW_CONFIG = {
    enabled: false,
    clientId: '',
    clientSecret: '',
    dmPolicy: 'open',
    allowFrom: [],
    groupPolicy: 'open',
    sessionTimeout: 1800000,
    separateSessionByConversation: true,
    groupSessionScope: 'group',
    sharedMemoryAcrossConversations: false,
    gatewayBaseUrl: '',
    debug: false,
};
exports.DEFAULT_FEISHU_OPENCLAW_CONFIG = {
    enabled: false,
    appId: '',
    appSecret: '',
    domain: 'feishu',
    dmPolicy: 'open',
    allowFrom: [],
    groupPolicy: 'open',
    groupAllowFrom: [],
    groups: { '*': { requireMention: true } },
    historyLimit: 50,
    streaming: true,
    replyMode: 'auto',
    blockStreaming: false,
    footer: { status: true, elapsed: true },
    mediaMaxMb: 30,
    debug: false,
};
exports.DEFAULT_DISCORD_OPENCLAW_CONFIG = {
    enabled: false,
    botToken: '',
    dmPolicy: 'open',
    allowFrom: [],
    groupPolicy: 'allowlist',
    groupAllowFrom: [],
    guilds: { '*': { requireMention: true } },
    historyLimit: 50,
    streaming: 'off',
    mediaMaxMb: 25,
    proxy: '',
    debug: false,
};
exports.DEFAULT_DISCORD_MULTI_INSTANCE_CONFIG = {
    instances: [],
};
exports.DEFAULT_NIM_OPENCLAW_CONFIG = {
    enabled: false,
    nimToken: '',
    appKey: '',
    account: '',
    token: '',
    antispamEnabled: true,
};
exports.DEFAULT_NIM_MULTI_INSTANCE_CONFIG = {
    instances: [],
};
/** @deprecated Use DEFAULT_NIM_OPENCLAW_CONFIG instead. */
exports.DEFAULT_NIM_CONFIG = exports.DEFAULT_NIM_OPENCLAW_CONFIG;
// ==================== NetEase Bee Types ====================
exports.DEFAULT_NETEASE_BEE_CONFIG = {
    enabled: false,
    clientId: '',
    secret: '',
};
exports.DEFAULT_TELEGRAM_OPENCLAW_CONFIG = {
    enabled: false,
    botToken: '',
    dmPolicy: 'open',
    allowFrom: [],
    groupPolicy: 'allowlist',
    groupAllowFrom: [],
    groups: { '*': { requireMention: true } },
    historyLimit: 50,
    replyToMode: 'off',
    linkPreview: true,
    streaming: 'off',
    mediaMaxMb: 5,
    proxy: '',
    webhookUrl: '',
    webhookSecret: '',
    debug: false,
};
exports.DEFAULT_TELEGRAM_MULTI_INSTANCE_CONFIG = {
    instances: [],
};
exports.DEFAULT_QQ_CONFIG = {
    enabled: false,
    appId: '',
    appSecret: '',
    dmPolicy: 'open',
    allowFrom: [],
    groupPolicy: 'open',
    groupAllowFrom: [],
    historyLimit: 50,
    markdownSupport: true,
    imageServerBaseUrl: '',
    debug: false,
};
exports.DEFAULT_QQ_MULTI_INSTANCE_CONFIG = {
    instances: [],
};
exports.DEFAULT_FEISHU_MULTI_INSTANCE_CONFIG = {
    instances: [],
};
exports.DEFAULT_WECOM_CONFIG = {
    enabled: false,
    botId: '',
    secret: '',
    dmPolicy: 'open',
    allowFrom: [],
    groupPolicy: 'open',
    groupAllowFrom: [],
    sendThinkingMessage: true,
    debug: true,
};
exports.DEFAULT_WECOM_MULTI_INSTANCE_CONFIG = { instances: [] };
exports.DEFAULT_POPO_CONFIG = {
    enabled: false,
    connectionMode: 'websocket',
    appKey: '',
    appSecret: '',
    token: '',
    aesKey: '',
    webhookBaseUrl: '',
    webhookPath: '/popo/callback',
    webhookPort: 3100,
    dmPolicy: 'open',
    allowFrom: [],
    groupPolicy: 'open',
    groupAllowFrom: [],
    textChunkLimit: 3000,
    richTextChunkLimit: 5000,
    debug: true,
};
exports.DEFAULT_POPO_MULTI_INSTANCE_CONFIG = { instances: [] };
exports.DEFAULT_WEIXIN_CONFIG = {
    enabled: false,
    accountId: '',
    dmPolicy: 'open',
    allowFrom: [],
    groupPolicy: 'open',
    groupAllowFrom: [],
    debug: true,
};
exports.DEFAULT_IM_SETTINGS = {
    systemPrompt: '',
    skillsEnabled: true,
};
exports.DEFAULT_IM_CONFIG = {
    dingtalk: exports.DEFAULT_DINGTALK_MULTI_INSTANCE_CONFIG,
    feishu: exports.DEFAULT_FEISHU_MULTI_INSTANCE_CONFIG,
    telegram: exports.DEFAULT_TELEGRAM_MULTI_INSTANCE_CONFIG,
    qq: exports.DEFAULT_QQ_MULTI_INSTANCE_CONFIG,
    discord: exports.DEFAULT_DISCORD_MULTI_INSTANCE_CONFIG,
    nim: exports.DEFAULT_NIM_MULTI_INSTANCE_CONFIG,
    'netease-bee': exports.DEFAULT_NETEASE_BEE_CONFIG,
    wecom: exports.DEFAULT_WECOM_MULTI_INSTANCE_CONFIG,
    popo: exports.DEFAULT_POPO_MULTI_INSTANCE_CONFIG,
    weixin: exports.DEFAULT_WEIXIN_CONFIG,
    email: exports.DEFAULT_EMAIL_MULTI_INSTANCE_CONFIG,
    settings: exports.DEFAULT_IM_SETTINGS,
};
exports.DEFAULT_DINGTALK_STATUS = {
    connected: false,
    startedAt: null,
    lastError: null,
    lastInboundAt: null,
    lastOutboundAt: null,
};
exports.DEFAULT_FEISHU_STATUS = {
    connected: false,
    startedAt: null,
    botOpenId: null,
    error: null,
    lastInboundAt: null,
    lastOutboundAt: null,
};
exports.DEFAULT_DISCORD_STATUS = {
    connected: false,
    starting: false,
    startedAt: null,
    lastError: null,
    botUsername: null,
    lastInboundAt: null,
    lastOutboundAt: null,
};
exports.DEFAULT_NIM_STATUS = {
    connected: false,
    startedAt: null,
    lastError: null,
    botAccount: null,
    lastInboundAt: null,
    lastOutboundAt: null,
};
exports.DEFAULT_NIM_MULTI_INSTANCE_STATUS = {
    instances: [],
};
exports.DEFAULT_NETEASE_BEE_STATUS = {
    connected: false,
    startedAt: null,
    lastError: null,
    botAccount: null,
    lastInboundAt: null,
    lastOutboundAt: null,
};
exports.DEFAULT_QQ_STATUS = {
    connected: false,
    startedAt: null,
    lastError: null,
    lastInboundAt: null,
    lastOutboundAt: null,
};
exports.DEFAULT_WECOM_STATUS = {
    connected: false,
    startedAt: null,
    lastError: null,
    botId: null,
    lastInboundAt: null,
    lastOutboundAt: null,
};
exports.DEFAULT_POPO_STATUS = {
    connected: false,
    startedAt: null,
    lastError: null,
    lastInboundAt: null,
    lastOutboundAt: null,
};
exports.DEFAULT_POPO_MULTI_INSTANCE_STATUS = { instances: [] };
exports.DEFAULT_WEIXIN_STATUS = {
    connected: false,
    accountId: null,
    startedAt: null,
    lastError: null,
    lastInboundAt: null,
    lastOutboundAt: null,
};
exports.DEFAULT_IM_STATUS = {
    dingtalk: { instances: [] },
    feishu: { instances: [] },
    telegram: { instances: [] },
    qq: { instances: [] },
    discord: { instances: [] },
    nim: exports.DEFAULT_NIM_MULTI_INSTANCE_STATUS,
    'netease-bee': exports.DEFAULT_NETEASE_BEE_STATUS,
    wecom: { instances: [] },
    popo: exports.DEFAULT_POPO_MULTI_INSTANCE_STATUS,
    weixin: exports.DEFAULT_WEIXIN_STATUS,
    email: { instances: [] },
};
//# sourceMappingURL=types.js.map