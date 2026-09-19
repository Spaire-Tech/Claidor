"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveOpenClawThinkingLevelForModel = void 0;
const providers_1 = require("../../shared/providers");
const claudeSettings_1 = require("./claudeSettings");
const LOBSTERAI_SERVER_MODEL_PREFIX = `${providers_1.OpenClawProviderId.LobsteraiServer}/`;
const resolveOpenClawThinkingLevelForModel = (modelRef, productLevel) => {
    const normalizedModelRef = modelRef.trim();
    const normalizedProductLevel = (0, providers_1.parseModelThinkingLevel)(productLevel);
    if (!normalizedProductLevel
        || !normalizedModelRef.startsWith(LOBSTERAI_SERVER_MODEL_PREFIX)) {
        return productLevel;
    }
    const modelId = normalizedModelRef.slice(LOBSTERAI_SERVER_MODEL_PREFIX.length);
    const thinkingConfig = (0, claudeSettings_1.getServerModelMetadata)(modelId)?.thinkingConfig;
    if (!thinkingConfig)
        return productLevel;
    // Server capability metadata can change between app launches. A persisted
    // product level that the model no longer advertises must follow the latest
    // server default; forwarding the stale value can make sessions.patch fail
    // while the renderer already displays the new default.
    const supportedProductLevel = thinkingConfig.options.some(option => option.level === normalizedProductLevel)
        ? normalizedProductLevel
        : thinkingConfig.defaultLevel;
    return (0, providers_1.resolveOpenClawThinkingLevel)(thinkingConfig, supportedProductLevel)
        ?? productLevel;
};
exports.resolveOpenClawThinkingLevelForModel = resolveOpenClawThinkingLevelForModel;
//# sourceMappingURL=openclawModelThinkingLevels.js.map