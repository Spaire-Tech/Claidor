"use strict";
/**
 * Provider Constants & Registry — Single Source of Truth
 *
 * All LLM provider identifiers, default configurations, and metadata are
 * defined here as a unified registry. Both main and renderer processes
 * import from this module.
 *
 * When adding a new provider:
 * 1. Add the provider key to ProviderName
 * 2. Add the OpenClaw provider ID to OpenClawProviderId (if different)
 * 3. Add one record to the PROVIDER_DEFINITIONS array
 *    — that's it, types and lookups are derived automatically.
 *
 * Follows the same pattern as PlatformRegistry in src/shared/platform/.
 * String literal constants follow AGENTS.md "String Literal Constants" spec,
 * modeled after src/scheduledTask/constants.ts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderRegistry = exports.ProviderAuthType = exports.AuthType = exports.ApiFormat = exports.OpenClawApi = exports.OpenClawProviderId = exports.ProviderName = exports.parseOpenClawTransportApi = exports.parseModelRole = exports.ModelRole = void 0;
// ═══════════════════════════════════════════════════════
// 1. String Literal Constants
// ═══════════════════════════════════════════════════════
// ─── Model Role ─────────────────────────────────────────────────────────
// What a model is *for*, as the server declares it on each row of
// /api/models/available. The app does not choose a model per message: it
// cannot know how hard a task is before doing it, a routing round trip
// costs a beat in an app whose whole feel is timing, and a price that
// moves for reasons a person cannot see makes the usage meter
// untrustworthy. So there is one model they talk to and cheap ones for
// machinery they never see, and the policy lives on the server so it can
// change with a deploy instead of a release.
exports.ModelRole = {
    /** Every reply the person reads. */
    Primary: 'primary',
    /** Sub-agents, compaction, the memory flush, heartbeats. Never read as "the agent". */
    Cheap: 'cheap',
    /** Answers when the primary's provider is down. Never the default, never shown. */
    Fallback: 'fallback',
};
const MODEL_ROLE_VALUES = new Set(Object.values(exports.ModelRole));
/** A role the server sent, or undefined for anything else — including the
 *  `null` an older or role-less row carries. */
const parseModelRole = (value) => (typeof value === 'string' && MODEL_ROLE_VALUES.has(value)
    ? value
    : undefined);
exports.parseModelRole = parseModelRole;
/** The subset the server may name for one of its own models. The other
 *  two transports exist for providers a person configures themselves. */
const SERVER_TRANSPORT_APIS = new Set([
    'anthropic-messages',
    'openai-completions',
    'openai-responses',
]);
/** A transport the engine understands, or undefined for anything else —
 *  including the field being absent, which is what an older server sends. */
const parseOpenClawTransportApi = (value) => (typeof value === 'string' && SERVER_TRANSPORT_APIS.has(value)
    ? value
    : undefined);
exports.parseOpenClawTransportApi = parseOpenClawTransportApi;
// ─── Provider Name ──────────────────────────────────────────────────────
// providerName identifies the LobsterAI internal provider (config key).
exports.ProviderName = {
    OpenAI: 'openai',
    Gemini: 'gemini',
    Xai: 'xai',
    Anthropic: 'anthropic',
    DeepSeek: 'deepseek',
    Moonshot: 'moonshot',
    Zhipu: 'zhipu',
    Minimax: 'minimax',
    Youdaozhiyun: 'youdaozhiyun',
    Qwen: 'qwen',
    Qianfan: 'qianfan',
    Xiaomi: 'xiaomi',
    StepFun: 'stepfun',
    Volcengine: 'volcengine',
    OpenRouter: 'openrouter',
    Ollama: 'ollama',
    LmStudio: 'lm-studio',
    Custom: 'custom',
    LobsteraiServer: 'lobsterai-server',
    Copilot: 'github-copilot',
};
// ─── OpenClaw Provider ID ───────────────────────────────────────────────
// OpenClaw gateway provider identifiers. May differ from ProviderName.
exports.OpenClawProviderId = {
    LobsteraiServer: 'lobsterai-server',
    Moonshot: 'moonshot',
    Google: 'google',
    Xai: 'xai',
    Anthropic: 'anthropic',
    OpenAI: 'openai',
    OpenAICodex: 'openai-codex',
    DeepSeek: 'deepseek',
    Qianfan: 'qianfan',
    Qwen: 'qwen',
    Zai: 'zai', // OpenClaw official provider ID for Zhipu/GLM
    Volcengine: 'volcengine',
    Minimax: 'minimax',
    MinimaxPortal: 'minimax-portal',
    Youdaozhiyun: 'youdaozhiyun',
    StepFun: 'stepfun',
    Xiaomi: 'xiaomi',
    OpenRouter: 'openrouter',
    Copilot: 'github-copilot',
    LobsteraiCopilot: 'lobsterai-copilot',
    Ollama: 'ollama',
    LmStudio: 'lm-studio',
    Lobster: 'lobster',
};
// ─── OpenClaw API Protocol ──────────────────────────────────────────────
exports.OpenClawApi = {
    AnthropicMessages: 'anthropic-messages',
    OpenAICompletions: 'openai-completions',
    OpenAIResponses: 'openai-responses',
    OpenAICodexResponses: 'openai-codex-responses',
    OpenAIChatGPTResponses: 'openai-chatgpt-responses',
    GoogleGenerativeAI: 'google-generative-ai',
};
// ─── API Format (provider default protocol format) ──────────────────────
exports.ApiFormat = {
    OpenAI: 'openai',
    Anthropic: 'anthropic',
    Gemini: 'gemini',
};
// ─── Auth Type ──────────────────────────────────────────────────────────
exports.AuthType = {
    ApiKey: 'api-key',
    OAuth: 'oauth',
};
exports.ProviderAuthType = {
    ApiKey: 'apikey',
    OAuth: 'oauth',
};
// ═══════════════════════════════════════════════════════
// 3. Provider Definitions — the single source of truth
//    Array order = Chinese UI display order
//    (CHINA first, then GLOBAL, matching existing config.ts order).
// ═══════════════════════════════════════════════════════
const DEEPSEEK_V4_CONTEXT_WINDOW = 1_000_000;
const PROVIDER_DEFINITIONS = [
    // ── China ──
    {
        id: exports.ProviderName.DeepSeek,
        label: 'DeepSeek',
        website: 'https://platform.deepseek.com',
        apiKeyUrl: 'https://platform.deepseek.com/api_keys',
        openClawProviderId: exports.OpenClawProviderId.DeepSeek,
        defaultBaseUrl: 'https://api.deepseek.com',
        defaultApiFormat: exports.ApiFormat.OpenAI,
        codingPlanSupported: false,
        switchableBaseUrls: {
            anthropic: 'https://api.deepseek.com/anthropic',
            openai: 'https://api.deepseek.com',
        },
        region: 'china',
        enPriority: 0,
        defaultModels: [
            { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', supportsImage: false, supportsThinking: true, contextWindow: DEEPSEEK_V4_CONTEXT_WINDOW },
            { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', supportsImage: false, supportsThinking: true, contextWindow: DEEPSEEK_V4_CONTEXT_WINDOW },
            { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', supportsImage: false, supportsThinking: true },
        ],
    },
    {
        id: exports.ProviderName.Moonshot,
        label: 'Moonshot',
        website: 'https://platform.moonshot.cn',
        apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
        openClawProviderId: exports.OpenClawProviderId.Moonshot,
        // Moonshot's /anthropic endpoint does not fully implement the Anthropic Messages spec
        // (no tool use, incomplete streaming, etc.). API connectivity tests pass, but actual
        // cowork sessions fail to send/receive messages. Force OpenAI-compatible format instead.
        defaultBaseUrl: 'https://api.moonshot.cn/v1',
        defaultApiFormat: exports.ApiFormat.OpenAI,
        codingPlanSupported: true,
        codingPlanUrls: {
            openai: 'https://api.kimi.com/coding/v1',
            anthropic: 'https://api.kimi.com/coding',
        },
        preferredCodingPlanFormat: 'anthropic',
        switchableBaseUrls: {
            anthropic: 'https://api.moonshot.cn/anthropic',
            openai: 'https://api.moonshot.cn/v1',
        },
        region: 'china',
        enPriority: 0,
        defaultModels: [
            { id: 'kimi-k3', name: 'Kimi K3', supportsImage: true, supportsVideo: true, supportsThinking: true, contextWindow: 1_048_576, maxTokens: 8_192 },
            { id: 'kimi-k2.6', name: 'Kimi K2.6', supportsImage: true, supportsThinking: true, contextWindow: 262_144 },
            { id: 'kimi-k2.5', name: 'Kimi K2.5', supportsImage: true, supportsThinking: true, contextWindow: 262_144 },
        ],
        codingPlanModels: [{ id: 'kimi-for-coding', name: 'Kimi K2.5', supportsImage: true, supportsThinking: true, contextWindow: 256_000 }],
    },
    {
        id: exports.ProviderName.Qwen,
        label: 'Qwen',
        website: 'https://dashscope.console.aliyun.com',
        apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey',
        openClawProviderId: exports.OpenClawProviderId.Qwen,
        defaultBaseUrl: 'https://dashscope.aliyuncs.com/apps/anthropic',
        defaultApiFormat: exports.ApiFormat.Anthropic,
        codingPlanSupported: true,
        codingPlanUrls: {
            openai: 'https://coding.dashscope.aliyuncs.com/v1',
            anthropic: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
        },
        preferredCodingPlanFormat: 'openai',
        switchableBaseUrls: {
            anthropic: 'https://dashscope.aliyuncs.com/apps/anthropic',
            openai: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        },
        region: 'china',
        enPriority: 0,
        defaultModels: [
            { id: 'qwen3.6-plus', name: 'Qwen3.6 Plus', supportsImage: true, contextWindow: 1_000_000 },
            { id: 'qwen3.5-plus', name: 'Qwen3.5 Plus', supportsImage: true, contextWindow: 1_000_000 },
        ],
    },
    {
        id: exports.ProviderName.Zhipu,
        label: 'Zhipu',
        website: 'https://open.bigmodel.cn',
        apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
        openClawProviderId: exports.OpenClawProviderId.Zai,
        defaultBaseUrl: 'https://open.bigmodel.cn/api/anthropic',
        defaultApiFormat: exports.ApiFormat.Anthropic,
        codingPlanSupported: true,
        codingPlanUrls: {
            openai: 'https://open.bigmodel.cn/api/coding/paas/v4',
            anthropic: 'https://open.bigmodel.cn/api/anthropic',
        },
        preferredCodingPlanFormat: 'openai',
        switchableBaseUrls: {
            anthropic: 'https://open.bigmodel.cn/api/anthropic',
            openai: 'https://open.bigmodel.cn/api/paas/v4',
        },
        region: 'china',
        enPriority: 0,
        defaultModels: [
            { id: 'glm-5.1', name: 'GLM 5.1', supportsImage: false, supportsThinking: true, contextWindow: 202_800 },
            { id: 'glm-5', name: 'GLM 5', supportsImage: false, supportsThinking: true, contextWindow: 202_800 },
            { id: 'glm-4.7', name: 'GLM 4.7', supportsImage: false, supportsThinking: true, contextWindow: 204_800 },
        ],
    },
    {
        id: exports.ProviderName.Minimax,
        label: 'MiniMax',
        website: 'https://platform.minimaxi.com',
        apiKeyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
        openClawProviderId: exports.OpenClawProviderId.Minimax,
        defaultBaseUrl: 'https://api.minimaxi.com/anthropic',
        defaultApiFormat: exports.ApiFormat.Anthropic,
        codingPlanSupported: false,
        switchableBaseUrls: {
            anthropic: 'https://api.minimaxi.com/anthropic',
            openai: 'https://api.minimaxi.com/v1',
        },
        region: 'china',
        enPriority: 0,
        defaultModels: [
            { id: 'MiniMax-M3', name: 'MiniMax M3', supportsImage: true, supportsThinking: true, contextWindow: 1_000_000 },
            { id: 'MiniMax-M2.7', name: 'MiniMax M2.7', supportsImage: false, contextWindow: 204_800 },
            { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', supportsImage: false, contextWindow: 204_800 },
        ],
    },
    {
        id: exports.ProviderName.Volcengine,
        label: 'Volcengine',
        website: 'https://console.volcengine.com/ark',
        apiKeyUrl: 'https://console.volcengine.com/ark',
        openClawProviderId: exports.OpenClawProviderId.Volcengine,
        defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/compatible',
        defaultApiFormat: exports.ApiFormat.Anthropic,
        codingPlanSupported: true,
        codingPlanUrls: {
            openai: 'https://ark.cn-beijing.volces.com/api/coding/v3',
            anthropic: 'https://ark.cn-beijing.volces.com/api/coding',
        },
        switchableBaseUrls: {
            anthropic: 'https://ark.cn-beijing.volces.com/api/compatible',
            openai: 'https://ark.cn-beijing.volces.com/api/v3',
        },
        region: 'china',
        enPriority: 0,
        defaultModels: [
            { id: 'doubao-seed-2-0-pro-260215', name: 'Doubao-Seed-2.0-pro', supportsImage: true, supportsThinking: true },
            { id: 'ark-code-latest', name: 'Auto', supportsImage: true, supportsThinking: true },
            { id: 'doubao-seed-2-0-lite-260215', name: 'Doubao-Seed-2.0-lite', supportsImage: true, supportsThinking: true },
            { id: 'doubao-seed-2-0-mini-260215', name: 'Doubao-Seed-2.0-mini', supportsImage: true, supportsThinking: true },
        ],
    },
    {
        id: exports.ProviderName.Youdaozhiyun,
        label: 'Youdao',
        website: 'https://ai.youdao.com',
        apiKeyUrl: 'https://ai.youdao.com/console',
        openClawProviderId: exports.OpenClawProviderId.Youdaozhiyun,
        defaultBaseUrl: 'https://openapi.youdao.com/llmgateway/api/v1/chat/completions',
        defaultApiFormat: exports.ApiFormat.OpenAI,
        codingPlanSupported: false,
        region: 'china',
        enPriority: 0,
        defaultModels: [
            { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', supportsImage: false, supportsThinking: true },
            {
                id: 'deepseek-inhouse-reasoner',
                name: 'DeepSeek Reasoner (\u5b89\u5168)',
                supportsImage: false,
                supportsThinking: true,
            },
        ],
    },
    {
        id: exports.ProviderName.Qianfan,
        label: 'Qianfan',
        apiKeyUrl: 'https://console.bce.baidu.com/qianfan/ais/console/apiKey',
        openClawProviderId: exports.OpenClawProviderId.Qianfan,
        defaultBaseUrl: 'https://qianfan.baidubce.com/v2',
        defaultApiFormat: exports.ApiFormat.OpenAI,
        codingPlanSupported: true,
        codingPlanUrls: {
            openai: 'https://qianfan.baidubce.com/v2/coding/chat/completions',
        },
        preferredCodingPlanFormat: 'openai',
        region: 'china',
        enPriority: 0,
        defaultModels: [
            { id: 'kimi-k2.5', name: 'Kimi K2.5', supportsImage: false },
            { id: 'glm-5.1', name: 'GLM 5.1', supportsImage: false, supportsThinking: true },
            { id: 'minimax-m2.5', name: 'MiniMax M2.5', supportsImage: false },
            { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', supportsImage: false, supportsThinking: true, contextWindow: DEEPSEEK_V4_CONTEXT_WINDOW },
            { id: 'ernie-4.5-turbo-20260402', name: 'ERNIE 4.5 Turbo', supportsImage: false },
        ],
    },
    {
        id: exports.ProviderName.StepFun,
        label: 'StepFun',
        website: 'https://platform.stepfun.com',
        apiKeyUrl: 'https://platform.stepfun.com/interface-key',
        openClawProviderId: exports.OpenClawProviderId.StepFun,
        defaultBaseUrl: 'https://api.stepfun.com/v1',
        defaultApiFormat: exports.ApiFormat.OpenAI,
        codingPlanSupported: false,
        region: 'china',
        enPriority: 0,
        defaultModels: [{ id: 'step-3.5-flash', name: 'Step 3.5 Flash', supportsImage: false }],
    },
    {
        id: exports.ProviderName.Xiaomi,
        label: 'Xiaomi',
        website: 'https://dev.mi.com/platform',
        apiKeyUrl: 'https://dev.mi.com/platform',
        openClawProviderId: exports.OpenClawProviderId.Xiaomi,
        defaultBaseUrl: 'https://api.xiaomimimo.com/v1/chat/completions',
        defaultApiFormat: exports.ApiFormat.OpenAI,
        codingPlanSupported: true,
        codingPlanUrls: {
            openai: 'https://token-plan-cn.xiaomimimo.com/v1',
            anthropic: 'https://token-plan-cn.xiaomimimo.com/anthropic',
        },
        switchableBaseUrls: {
            anthropic: 'https://api.xiaomimimo.com/anthropic',
            openai: 'https://api.xiaomimimo.com/v1/chat/completions',
        },
        region: 'china',
        enPriority: 0,
        defaultModels: [
            { id: 'mimo-v2.5-pro', name: 'MiMo V2.5 Pro', supportsImage: false, supportsThinking: true, contextWindow: 1_000_000 },
            { id: 'mimo-v2.5', name: 'MiMo V2.5', supportsImage: true, supportsThinking: true, contextWindow: 1_000_000 },
        ],
    },
    {
        id: exports.ProviderName.Ollama,
        label: 'Ollama',
        website: 'https://ollama.com',
        openClawProviderId: exports.OpenClawProviderId.Ollama,
        defaultBaseUrl: 'http://localhost:11434/v1',
        defaultApiFormat: exports.ApiFormat.OpenAI,
        codingPlanSupported: false,
        switchableBaseUrls: {
            anthropic: 'http://localhost:11434',
            openai: 'http://localhost:11434/v1',
        },
        region: 'china',
        enPriority: 0,
        defaultModels: [
            { id: 'qwen3-coder-next', name: 'Qwen3-Coder-Next', supportsImage: false },
            { id: 'glm-4.7-flash', name: 'GLM 4.7 Flash', supportsImage: false },
        ],
    },
    {
        id: exports.ProviderName.LmStudio,
        label: 'LM Studio',
        website: 'https://lmstudio.ai',
        openClawProviderId: exports.OpenClawProviderId.LmStudio,
        defaultBaseUrl: 'http://localhost:1234/v1',
        defaultApiFormat: exports.ApiFormat.OpenAI,
        codingPlanSupported: false,
        switchableBaseUrls: {
            anthropic: 'http://localhost:1234',
            openai: 'http://localhost:1234/v1',
        },
        region: 'china',
        enPriority: 0,
        defaultModels: [],
    },
    // ── Global ──
    {
        id: exports.ProviderName.Copilot,
        label: 'GitHub Copilot',
        openClawProviderId: exports.OpenClawProviderId.LobsteraiCopilot,
        defaultBaseUrl: 'https://api.individual.githubcopilot.com',
        defaultApiFormat: exports.ApiFormat.OpenAI,
        codingPlanSupported: false,
        region: 'global',
        enPriority: 0,
        defaultModels: [
            { id: 'gpt-5-mini', name: 'GPT-5 mini', supportsImage: true },
            { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', supportsImage: true },
            { id: 'gpt-4.1', name: 'GPT-4.1', supportsImage: true },
            { id: 'gpt-4o', name: 'GPT-4o', supportsImage: true },
        ],
    },
    {
        id: exports.ProviderName.OpenAI,
        label: 'OpenAI',
        website: 'https://platform.openai.com',
        apiKeyUrl: 'https://platform.openai.com/api-keys',
        openClawProviderId: exports.OpenClawProviderId.OpenAI,
        defaultBaseUrl: 'https://api.openai.com/v1',
        defaultApiFormat: exports.ApiFormat.OpenAI,
        codingPlanSupported: false,
        region: 'global',
        enPriority: 1,
        defaultModels: [
            { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', supportsImage: true, supportsThinking: true, contextWindow: 1_050_000 },
            { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', supportsImage: true, supportsThinking: true, contextWindow: 1_050_000 },
            { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', supportsImage: true, supportsThinking: true, contextWindow: 1_050_000 },
            { id: 'gpt-5.5', name: 'GPT-5.5', supportsImage: true, supportsThinking: true },
            { id: 'gpt-5.4', name: 'GPT-5.4', supportsImage: true, supportsThinking: true },
        ],
    },
    {
        id: exports.ProviderName.Gemini,
        label: 'Gemini',
        website: 'https://aistudio.google.com',
        apiKeyUrl: 'https://aistudio.google.com/apikey',
        openClawProviderId: exports.OpenClawProviderId.Google,
        defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        defaultApiFormat: exports.ApiFormat.Gemini,
        codingPlanSupported: false,
        region: 'global',
        enPriority: 3,
        defaultModels: [
            { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', supportsImage: true, supportsThinking: true },
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', supportsImage: true, supportsThinking: true },
            { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', supportsImage: true, supportsThinking: true },
        ],
    },
    {
        id: exports.ProviderName.Xai,
        label: 'xAI (Grok)',
        website: 'https://console.x.ai',
        apiKeyUrl: 'https://console.x.ai',
        openClawProviderId: exports.OpenClawProviderId.Xai,
        defaultBaseUrl: 'https://api.x.ai/v1',
        defaultApiFormat: exports.ApiFormat.OpenAI,
        codingPlanSupported: false,
        region: 'global',
        enPriority: 4,
        // The pinned OpenClaw xai extension forward-resolves new grok-4.* IDs even
        // before they enter its built-in catalog; retired IDs are still pruned.
        defaultModels: [
            { id: 'grok-4.5', name: 'Grok 4.5', supportsImage: true, supportsThinking: true, contextWindow: 500_000 },
            { id: 'grok-4.3', name: 'Grok 4.3', supportsImage: true, supportsThinking: true, contextWindow: 1_000_000 },
            { id: 'grok-build-0.1', name: 'Grok Build 0.1', supportsImage: true, supportsThinking: true, contextWindow: 256_000 },
        ],
    },
    {
        id: exports.ProviderName.Anthropic,
        label: 'Anthropic',
        website: 'https://console.anthropic.com',
        apiKeyUrl: 'https://console.anthropic.com/settings/keys',
        openClawProviderId: exports.OpenClawProviderId.Anthropic,
        defaultBaseUrl: 'https://api.anthropic.com',
        defaultApiFormat: exports.ApiFormat.Anthropic,
        codingPlanSupported: false,
        region: 'global',
        enPriority: 2,
        defaultModels: [
            { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', supportsImage: true, supportsThinking: true, contextWindow: 1_048_576 },
            { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', supportsImage: true, supportsThinking: true, contextWindow: 1_048_576 },
            { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', supportsImage: true, supportsThinking: true, contextWindow: 1_048_576 },
        ],
    },
    {
        id: exports.ProviderName.OpenRouter,
        label: 'OpenRouter',
        website: 'https://openrouter.ai',
        apiKeyUrl: 'https://openrouter.ai/keys',
        openClawProviderId: exports.OpenClawProviderId.OpenRouter,
        defaultBaseUrl: 'https://openrouter.ai/api',
        defaultApiFormat: exports.ApiFormat.Anthropic,
        codingPlanSupported: false,
        switchableBaseUrls: {
            anthropic: 'https://openrouter.ai/api',
            openai: 'https://openrouter.ai/api/v1',
        },
        region: 'global',
        enPriority: 0,
        defaultModels: [
            { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', supportsImage: true, supportsThinking: true },
            { id: 'anthropic/claude-opus-4.7', name: 'Claude Opus 4.7', supportsImage: true, supportsThinking: true },
            { id: 'openai/gpt-5.5', name: 'GPT 5.5', supportsImage: true, supportsThinking: true },
            { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', supportsImage: true, supportsThinking: true },
        ],
    },
];
// ═══════════════════════════════════════════════════════
// 5. Registry Implementation
// ═══════════════════════════════════════════════════════
const isValidContextWindow = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
class ProviderRegistryImpl {
    defs;
    idIndex;
    modelCapabilityIndex;
    modelVideoCapabilityIndex;
    modelContextWindowIndex;
    modelMaxTokensIndex;
    constructor(definitions) {
        this.defs = definitions;
        const idx = new Map();
        const modelIdx = new Map();
        const modelVideoIdx = new Map();
        const contextWindowIdx = new Map();
        const maxTokensIdx = new Map();
        for (const def of definitions) {
            idx.set(def.id, def);
            for (const model of [...def.defaultModels, ...(def.codingPlanModels ?? [])]) {
                const existing = modelIdx.get(model.id);
                modelIdx.set(model.id, existing === true || model.supportsImage);
                const existingVideo = modelVideoIdx.get(model.id);
                modelVideoIdx.set(model.id, existingVideo === true || model.supportsVideo === true);
                if (isValidContextWindow(model.contextWindow)) {
                    const existingContextWindow = contextWindowIdx.get(model.id);
                    if (existingContextWindow === undefined || model.contextWindow > existingContextWindow) {
                        contextWindowIdx.set(model.id, model.contextWindow);
                    }
                }
                if (isValidContextWindow(model.maxTokens)) {
                    const existingMaxTokens = maxTokensIdx.get(model.id);
                    if (existingMaxTokens === undefined || model.maxTokens > existingMaxTokens) {
                        maxTokensIdx.set(model.id, model.maxTokens);
                    }
                }
            }
        }
        this.idIndex = idx;
        this.modelCapabilityIndex = modelIdx;
        this.modelVideoCapabilityIndex = modelVideoIdx;
        this.modelContextWindowIndex = contextWindowIdx;
        this.modelMaxTokensIndex = maxTokensIdx;
    }
    /** All provider IDs in definition order. */
    get providerIds() {
        return this.defs.map(d => d.id);
    }
    /** Get full definition for a provider. Returns undefined for unknown IDs. */
    get(id) {
        return this.idIndex.get(id);
    }
    /** Whether a provider supports codingPlan. */
    supportsCodingPlan(id) {
        return this.idIndex.get(id)?.codingPlanSupported ?? false;
    }
    /** Providers filtered by region, preserving definition order. */
    byRegion(region) {
        return this.defs.filter(d => d.region === region);
    }
    getCodingPlanUrl(id, format) {
        const def = this.idIndex.get(id);
        if (!def?.codingPlanSupported || !def.codingPlanUrls)
            return undefined;
        return def.codingPlanUrls[format];
    }
    getSwitchableBaseUrl(id, format) {
        return this.idIndex.get(id)?.switchableBaseUrls?.[format];
    }
    getOpenClawProviderId(providerName) {
        return this.idIndex.get(providerName)?.openClawProviderId ?? providerName ?? exports.OpenClawProviderId.Lobster;
    }
    getOpenClawProviderIdForConfig(providerName, providerConfig) {
        if (providerName === exports.ProviderName.Minimax && providerConfig.authType === exports.ProviderAuthType.OAuth) {
            return exports.OpenClawProviderId.MinimaxPortal;
        }
        return this.getOpenClawProviderId(providerName);
    }
    getProviderModelSupportsImage(providerName, modelId) {
        const def = this.idIndex.get(providerName);
        if (!def)
            return undefined;
        const model = [...def.defaultModels, ...(def.codingPlanModels ?? [])]
            .find(candidate => candidate.id === modelId);
        return model?.supportsImage;
    }
    getKnownModelSupportsImage(modelId) {
        return this.modelCapabilityIndex.get(modelId);
    }
    getProviderModelSupportsVideo(providerName, modelId) {
        const def = this.idIndex.get(providerName);
        if (!def)
            return undefined;
        const model = [...def.defaultModels, ...(def.codingPlanModels ?? [])]
            .find(candidate => candidate.id === modelId);
        return model?.supportsVideo;
    }
    getKnownModelSupportsVideo(modelId) {
        return this.modelVideoCapabilityIndex.get(modelId);
    }
    getProviderModelSupportsThinking(providerName, modelId) {
        const def = this.idIndex.get(providerName);
        if (!def)
            return undefined;
        const model = [...def.defaultModels, ...(def.codingPlanModels ?? [])]
            .find(candidate => candidate.id === modelId);
        return model?.supportsThinking;
    }
    getProviderModelContextWindow(providerName, modelId) {
        const def = this.idIndex.get(providerName);
        if (!def)
            return undefined;
        const model = [...def.defaultModels, ...(def.codingPlanModels ?? [])]
            .find(candidate => candidate.id === modelId);
        return model?.contextWindow;
    }
    getKnownModelContextWindow(modelId) {
        return this.modelContextWindowIndex.get(modelId);
    }
    getProviderModelMaxTokens(providerName, modelId) {
        const def = this.idIndex.get(providerName);
        if (!def)
            return undefined;
        const model = [...def.defaultModels, ...(def.codingPlanModels ?? [])]
            .find(candidate => candidate.id === modelId);
        return model?.maxTokens;
    }
    getKnownModelMaxTokens(modelId) {
        return this.modelMaxTokensIndex.get(modelId);
    }
    resolveModelSupportsImage(providerName, modelId, configuredSupportsImage) {
        const providerModelSupportsImage = this.getProviderModelSupportsImage(providerName, modelId);
        if (providerModelSupportsImage !== undefined) {
            return providerModelSupportsImage;
        }
        if (configuredSupportsImage === true) {
            return true;
        }
        const knownModelSupportsImage = this.getKnownModelSupportsImage(modelId);
        if (knownModelSupportsImage === true) {
            return true;
        }
        return configuredSupportsImage ?? false;
    }
    resolveModelSupportsThinking(providerName, modelId, configuredSupportsThinking) {
        const providerModelSupportsThinking = this.getProviderModelSupportsThinking(providerName, modelId);
        if (providerModelSupportsThinking !== undefined) {
            return providerModelSupportsThinking;
        }
        if (configuredSupportsThinking === true) {
            return true;
        }
        return configuredSupportsThinking ?? false;
    }
    resolveModelSupportsVideo(providerName, modelId, configuredSupportsVideo) {
        const providerModelSupportsVideo = this.getProviderModelSupportsVideo(providerName, modelId);
        if (providerModelSupportsVideo !== undefined) {
            return providerModelSupportsVideo;
        }
        if (configuredSupportsVideo === true) {
            return true;
        }
        const knownModelSupportsVideo = this.getKnownModelSupportsVideo(modelId);
        if (knownModelSupportsVideo === true) {
            return true;
        }
        return configuredSupportsVideo ?? false;
    }
    resolveModelContextWindow(providerName, modelId, configuredContextWindow) {
        if (isValidContextWindow(configuredContextWindow)) {
            return configuredContextWindow;
        }
        return this.getProviderModelContextWindow(providerName, modelId)
            ?? this.getKnownModelContextWindow(modelId);
    }
    resolveModelMaxTokens(providerName, modelId, configuredMaxTokens) {
        if (isValidContextWindow(configuredMaxTokens)) {
            return configuredMaxTokens;
        }
        return this.getProviderModelMaxTokens(providerName, modelId)
            ?? this.getKnownModelMaxTokens(modelId);
    }
    /** Provider IDs filtered by region. */
    idsByRegion(region) {
        return this.defs.filter(d => d.region === region).map(d => d.id);
    }
    /**
     * Provider IDs for English locale display:
     * EN_PRIORITY providers first (sorted by enPriority), then CHINA, then remaining GLOBAL.
     * ollama and custom are always pushed to the end, with custom last.
     */
    idsForEnLocale() {
        const priority = this.defs
            .filter(d => d.enPriority > 0)
            .sort((a, b) => a.enPriority - b.enPriority)
            .map(d => d.id);
        const china = this.idsByRegion('china');
        const global = this.idsByRegion('global');
        const orderedProviders = [...priority, ...china, ...global];
        const unique = [...new Set(orderedProviders)];
        // Move local providers (ollama, lm-studio) to the end
        const ollamaIdx = unique.indexOf(exports.ProviderName.Ollama);
        if (ollamaIdx !== -1) {
            unique.splice(ollamaIdx, 1);
        }
        const lmStudioIdx = unique.indexOf(exports.ProviderName.LmStudio);
        if (lmStudioIdx !== -1) {
            unique.splice(lmStudioIdx, 1);
        }
        unique.push(exports.ProviderName.Ollama);
        unique.push(exports.ProviderName.LmStudio);
        return unique;
    }
}
exports.ProviderRegistry = new ProviderRegistryImpl(PROVIDER_DEFINITIONS);
//# sourceMappingURL=constants.js.map