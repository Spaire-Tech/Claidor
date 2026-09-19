// vendor/openclaw-runtime/mac-arm64/third-party-extensions/lobsterai-model-compat/index.ts
import {
  buildAnthropicReplayPolicyForModel,
  buildGoogleGeminiReplayPolicy,
  buildOpenAICompatibleReplayPolicy
} from "openclaw/plugin-sdk/provider-model-shared";
import { createMoonshotKimiK3Wrapper } from "openclaw/plugin-sdk/provider-stream-shared";

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/lobsterai-model-compat/profileMapping.ts
var LobsterAIModelRuntimeProfile = {
  MoonshotKimiK3: "moonshot-kimi-k3"
};
var ModelProfileTransportDecision = {
  Passthrough: "passthrough",
  MoonshotKimiK3: "moonshot-kimi-k3",
  Reject: "reject"
};
var isRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var isModelRef = (value) => {
  const separatorIndex = value.indexOf("/");
  return separatorIndex > 0 && separatorIndex < value.length - 1 && !/\s/.test(value);
};
var parseModelProfileMap = (value) => {
  if (!isRecord(value)) return {};
  const result = {};
  for (const [modelRef, profile] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) {
    if (isModelRef(modelRef) && profile === LobsterAIModelRuntimeProfile.MoonshotKimiK3) {
      result[modelRef] = profile;
    }
  }
  return result;
};
var hasModelRuntimeProfile = (modelProfiles, provider, modelId, profile) => modelProfiles[`${provider}/${modelId}`] === profile;
var resolveModelProfileTransportDecision = (params) => {
  if (!hasModelRuntimeProfile(
    params.modelProfiles,
    params.provider,
    params.modelId,
    LobsterAIModelRuntimeProfile.MoonshotKimiK3
  )) {
    return { kind: ModelProfileTransportDecision.Passthrough };
  }
  if (params.modelApi !== "openai-completions") {
    return {
      kind: ModelProfileTransportDecision.Reject,
      expectedApi: "openai-completions",
      actualApi: params.modelApi ?? "missing"
    };
  }
  return { kind: ModelProfileTransportDecision.MoonshotKimiK3 };
};

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/lobsterai-model-compat/requestOptionsProtocol.ts
var LOBSTERAI_REQUEST_OPTIONS_FIELD = "lobsterai_options";
var LOBSTERAI_REQUEST_OPTIONS_VERSION = 1;

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/lobsterai-model-compat/requestOptions.ts
var isRecord2 = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var loadDefaultStreamFn = async () => {
  const { streamSimple } = await import("openclaw/plugin-sdk/llm");
  return streamSimple;
};
var resolveLobsterAIRequestThinkingLevel = (profile, requestedLevel) => profile.options.find((option) => option.openclawLevel === requestedLevel)?.level ?? profile.defaultLevel;
var applyRequestOptions = (payload, thinkingLevel) => {
  if (!isRecord2(payload)) return payload;
  payload[LOBSTERAI_REQUEST_OPTIONS_FIELD] = {
    version: LOBSTERAI_REQUEST_OPTIONS_VERSION,
    thinking: {
      level: thinkingLevel
    }
  };
  return payload;
};
var createLobsterAIRequestOptionsWrapper = (baseStreamFn, thinkingLevel) => {
  return async (model, context, options) => {
    const underlying = baseStreamFn ?? await loadDefaultStreamFn();
    const originalOnPayload = options?.onPayload;
    return underlying(model, context, {
      ...options,
      onPayload: (payload, payloadModel) => {
        const result = originalOnPayload?.(payload, payloadModel);
        if (result && typeof result.then === "function") {
          return Promise.resolve(result).then((resolved) => applyRequestOptions(resolved ?? payload, thinkingLevel));
        }
        return applyRequestOptions(result ?? payload, thinkingLevel);
      }
    });
  };
};

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/lobsterai-model-compat/thinkingProfileMapping.ts
var LobsterAIThinkingLevel = {
  Off: "off",
  Minimal: "minimal",
  Low: "low",
  Medium: "medium",
  High: "high",
  XHigh: "xhigh",
  Max: "max"
};
var LobsterAIOpenClawThinkingLevel = {
  Off: "off",
  Minimal: "minimal",
  Low: "low",
  Medium: "medium",
  High: "high",
  XHigh: "xhigh"
};
var LEVELS = new Set(Object.values(LobsterAIThinkingLevel));
var OPENCLAW_LEVELS = new Set(Object.values(LobsterAIOpenClawThinkingLevel));
var isRecord3 = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var isModelRef2 = (value) => {
  const separatorIndex = value.indexOf("/");
  return separatorIndex > 0 && separatorIndex < value.length - 1 && !/\s/.test(value);
};
var parseThinkingProfile = (value) => {
  if (!isRecord3(value) || !Array.isArray(value.options) || value.options.length === 0) {
    return void 0;
  }
  const options = [];
  const seenLevels = /* @__PURE__ */ new Set();
  const seenOpenClawLevels = /* @__PURE__ */ new Set();
  for (const rawOption of value.options) {
    if (!isRecord3(rawOption)) {
      return void 0;
    }
    const { level, openclawLevel } = rawOption;
    if (typeof level !== "string" || !LEVELS.has(level) || seenLevels.has(level) || typeof openclawLevel !== "string" || !OPENCLAW_LEVELS.has(openclawLevel) || seenOpenClawLevels.has(openclawLevel) || level === LobsterAIThinkingLevel.Off !== (openclawLevel === LobsterAIOpenClawThinkingLevel.Off)) {
      return void 0;
    }
    seenLevels.add(level);
    seenOpenClawLevels.add(openclawLevel);
    options.push({
      level,
      openclawLevel
    });
  }
  if (options.length === 1 && options[0]?.level === LobsterAIThinkingLevel.Off) {
    return void 0;
  }
  if (typeof value.defaultLevel !== "string" || !seenLevels.has(value.defaultLevel)) {
    return void 0;
  }
  return {
    options,
    defaultLevel: value.defaultLevel,
    ...value.requestOptionsVersion === LOBSTERAI_REQUEST_OPTIONS_VERSION ? { requestOptionsVersion: LOBSTERAI_REQUEST_OPTIONS_VERSION } : {}
  };
};
var parseThinkingProfileMap = (value) => {
  if (!isRecord3(value)) return {};
  const result = {};
  for (const [modelRef, rawProfile] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    const profile = parseThinkingProfile(rawProfile);
    if (isModelRef2(modelRef) && profile) {
      result[modelRef] = profile;
    }
  }
  return result;
};
var resolveOpenClawThinkingProfile = (profile, hasKimiK3RuntimeProfile) => {
  if (profile) {
    const defaultOpenClawLevel = profile.options.find(
      (option) => option.level === profile.defaultLevel
    )?.openclawLevel;
    if (!defaultOpenClawLevel) return void 0;
    return {
      levels: profile.options.map((option) => ({
        id: option.openclawLevel,
        label: option.level
      })),
      defaultLevel: defaultOpenClawLevel,
      preserveWhenCatalogReasoningFalse: true
    };
  }
  if (!hasKimiK3RuntimeProfile) return void 0;
  return {
    levels: [{ id: "max", label: "max" }],
    defaultLevel: "max",
    preserveWhenCatalogReasoningFalse: true
  };
};

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/lobsterai-model-compat/index.ts
var PLUGIN_ID = "lobsterai-model-compat";
var OPENAI_COMPLETIONS_API = "openai-completions";
var OPENAI_COMPATIBLE_APIS = /* @__PURE__ */ new Set([
  OPENAI_COMPLETIONS_API,
  "openai-responses",
  "openai-chatgpt-responses"
]);
var register = (api) => {
  const modelProfiles = parseModelProfileMap(api.pluginConfig?.modelProfiles);
  const thinkingProfiles = parseThinkingProfileMap(api.pluginConfig?.thinkingProfiles);
  const isKimiK3Profile = (provider, modelId) => hasModelRuntimeProfile(
    modelProfiles,
    provider,
    modelId,
    LobsterAIModelRuntimeProfile.MoonshotKimiK3
  );
  const resolveTransportDecision = (provider, modelId, modelApi) => resolveModelProfileTransportDecision({
    modelProfiles,
    provider,
    modelId,
    modelApi
  });
  const assertSupportedTransport = (provider, modelId, modelApi) => {
    const decision = resolveTransportDecision(provider, modelId, modelApi);
    if (decision.kind === ModelProfileTransportDecision.Reject) {
      throw new Error(
        `Kimi K3 compatibility requires ${decision.expectedApi} for ${provider}/${modelId}; received ${decision.actualApi}`
      );
    }
    return decision;
  };
  api.registerProvider({
    id: PLUGIN_ID,
    label: "Caisra Model Compatibility",
    hookAliases: ["lobsterai-server"],
    auth: [],
    buildReplayPolicy: (ctx) => {
      const modelApi = ctx.modelApi ?? ctx.model?.api;
      const modelId = ctx.modelId ?? "";
      const decision = assertSupportedTransport(ctx.provider, modelId, modelApi);
      if (decision.kind === ModelProfileTransportDecision.MoonshotKimiK3) {
        return buildOpenAICompatibleReplayPolicy(modelApi, {
          modelId,
          sanitizeToolCallIds: false,
          dropReasoningFromHistory: false
        });
      }
      if (modelApi && OPENAI_COMPATIBLE_APIS.has(modelApi)) {
        return buildOpenAICompatibleReplayPolicy(modelApi, {
          modelId,
          dropReasoningFromHistory: ctx.model?.reasoning !== true
        });
      }
      if (modelApi === "anthropic-messages") {
        return buildAnthropicReplayPolicyForModel(modelId);
      }
      if (modelApi === "google-generative-ai") {
        return buildGoogleGeminiReplayPolicy();
      }
      return void 0;
    },
    wrapStreamFn: (ctx) => {
      const decision = assertSupportedTransport(ctx.provider, ctx.modelId, ctx.model?.api);
      const baseStreamFn = decision.kind === ModelProfileTransportDecision.Passthrough ? ctx.streamFn : createMoonshotKimiK3Wrapper(ctx.streamFn);
      const thinkingProfile = thinkingProfiles[`${ctx.provider}/${ctx.modelId}`];
      if (thinkingProfile?.requestOptionsVersion === LOBSTERAI_REQUEST_OPTIONS_VERSION) {
        return createLobsterAIRequestOptionsWrapper(
          baseStreamFn,
          resolveLobsterAIRequestThinkingLevel(thinkingProfile, ctx.thinkingLevel)
        );
      }
      return baseStreamFn;
    },
    resolveThinkingProfile: ({ provider, modelId }) => resolveOpenClawThinkingProfile(
      thinkingProfiles[`${provider}/${modelId}`],
      isKimiK3Profile(provider, modelId)
    ),
    isModernModelRef: ({ provider, modelId }) => isKimiK3Profile(provider, modelId) || void 0
  });
};
var lobsterai_model_compat_default = {
  id: PLUGIN_ID,
  name: "Caisra Model Compatibility",
  description: "Applies explicit Caisra-managed model runtime profiles.",
  register
};
export {
  lobsterai_model_compat_default as default
};
