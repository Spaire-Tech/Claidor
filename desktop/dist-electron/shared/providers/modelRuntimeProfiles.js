"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findKimiK3ReservedCustomParamKeys = exports.KIMI_K3_RESERVED_CUSTOM_PARAM_KEYS = exports.resolveModelRuntimeProfile = exports.normalizeModelIdForComparison = exports.parseModelRuntimeProfile = exports.applyModelRuntimeProfileMetadata = exports.getModelRuntimeProfileDefinition = exports.MODEL_RUNTIME_PROFILES = exports.KIMI_K3_RUNTIME_PROFILE = exports.LOBSTERAI_CLIENT_CAPABILITIES = exports.THINKING_LEVEL_CONTROL_CAPABILITY = exports.KIMI_K3_AGENTIC_CAPABILITY = exports.LOBSTERAI_CLIENT_VERSION_HEADER = exports.LOBSTERAI_CLIENT_CAPABILITIES_HEADER = exports.ModelRuntimeProfileSource = exports.ModelRuntimeProfile = void 0;
const constants_1 = require("./constants");
exports.ModelRuntimeProfile = {
    MoonshotKimiK3: 'moonshot-kimi-k3',
};
exports.ModelRuntimeProfileSource = {
    BuiltIn: 'built-in',
    Custom: 'custom',
    Server: 'server',
};
exports.LOBSTERAI_CLIENT_CAPABILITIES_HEADER = 'X-LobsterAI-Client-Capabilities';
exports.LOBSTERAI_CLIENT_VERSION_HEADER = 'X-LobsterAI-Client-Version';
exports.KIMI_K3_AGENTIC_CAPABILITY = 'kimi-k3-agentic-v1';
exports.THINKING_LEVEL_CONTROL_CAPABILITY = 'thinking-level-control-v1';
exports.LOBSTERAI_CLIENT_CAPABILITIES = [
    exports.KIMI_K3_AGENTIC_CAPABILITY,
    exports.THINKING_LEVEL_CONTROL_CAPABILITY,
].join(',');
const KIMI_K3_REASONING_EFFORTS = [
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
];
exports.KIMI_K3_RUNTIME_PROFILE = {
    reasoning: true,
    input: ['text', 'image', 'video'],
    contextWindow: 1_048_576,
    maxTokens: 8_192,
    thinkingLevelMap: {
        off: null,
        minimal: 'max',
        low: 'max',
        medium: 'max',
        high: 'max',
        xhigh: 'max',
        max: 'max',
    },
    compat: {
        maxTokensField: 'max_tokens',
        supportsUsageInStreaming: false,
        requiresStringContent: true,
        supportsReasoningEffort: true,
        supportedReasoningEfforts: KIMI_K3_REASONING_EFFORTS,
    },
};
exports.MODEL_RUNTIME_PROFILES = {
    [exports.ModelRuntimeProfile.MoonshotKimiK3]: exports.KIMI_K3_RUNTIME_PROFILE,
};
const getModelRuntimeProfileDefinition = (profile) => exports.MODEL_RUNTIME_PROFILES[profile];
exports.getModelRuntimeProfileDefinition = getModelRuntimeProfileDefinition;
const applyModelRuntimeProfileMetadata = (metadata, profile) => {
    if (!profile) {
        return metadata;
    }
    const definition = (0, exports.getModelRuntimeProfileDefinition)(profile);
    return {
        ...metadata,
        supportsImage: definition.input.includes('image'),
        supportsVideo: definition.input.includes('video'),
        supportsThinking: definition.reasoning,
        contextWindow: definition.contextWindow,
        maxTokens: definition.maxTokens,
    };
};
exports.applyModelRuntimeProfileMetadata = applyModelRuntimeProfileMetadata;
const MODEL_RUNTIME_PROFILE_VALUES = new Set(Object.values(exports.ModelRuntimeProfile));
const parseModelRuntimeProfile = (value) => (typeof value === 'string' && MODEL_RUNTIME_PROFILE_VALUES.has(value)
    ? value
    : undefined);
exports.parseModelRuntimeProfile = parseModelRuntimeProfile;
const normalizeModelIdForComparison = (modelId) => modelId.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
exports.normalizeModelIdForComparison = normalizeModelIdForComparison;
const isKimiK3ModelId = (modelId) => (0, exports.normalizeModelIdForComparison)(modelId) === 'kimik3';
const resolveModelRuntimeProfile = ({ source, providerId, modelId, api, serverRuntimeProfile, }) => {
    if (api !== constants_1.OpenClawApi.OpenAICompletions) {
        return undefined;
    }
    if (source === exports.ModelRuntimeProfileSource.Server) {
        if (providerId !== constants_1.OpenClawProviderId.LobsteraiServer) {
            return undefined;
        }
        return (0, exports.parseModelRuntimeProfile)(serverRuntimeProfile);
    }
    if (source !== exports.ModelRuntimeProfileSource.BuiltIn
        && source !== exports.ModelRuntimeProfileSource.Custom) {
        return undefined;
    }
    return isKimiK3ModelId(modelId)
        ? exports.ModelRuntimeProfile.MoonshotKimiK3
        : undefined;
};
exports.resolveModelRuntimeProfile = resolveModelRuntimeProfile;
exports.KIMI_K3_RESERVED_CUSTOM_PARAM_KEYS = [
    'compat',
    'frequencyPenalty',
    'frequency_penalty',
    'maxCompletionTokens',
    'maxTokens',
    'max_completion_tokens',
    'max_tokens',
    'n',
    'presencePenalty',
    'presence_penalty',
    'reasoning',
    'reasoningEffort',
    'reasoning_effort',
    'requiresStringContent',
    'streamOptions',
    'stream_options',
    'supportedReasoningEfforts',
    'supportsReasoningEffort',
    'supportsUsageInStreaming',
    'temperature',
    'thinking',
    'thinkingLevelMap',
    'topP',
    'top_p',
];
const KIMI_K3_RESERVED_CUSTOM_PARAM_KEY_SET = new Set(exports.KIMI_K3_RESERVED_CUSTOM_PARAM_KEYS);
const findKimiK3ReservedCustomParamKeys = (customParams) => {
    if (!customParams) {
        return [];
    }
    return Object.keys(customParams)
        .filter(key => KIMI_K3_RESERVED_CUSTOM_PARAM_KEY_SET.has(key))
        .sort();
};
exports.findKimiK3ReservedCustomParamKeys = findKimiK3ReservedCustomParamKeys;
//# sourceMappingURL=modelRuntimeProfiles.js.map