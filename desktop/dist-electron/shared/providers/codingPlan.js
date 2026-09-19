"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCodingPlanBaseUrl = resolveCodingPlanBaseUrl;
const constants_1 = require("./constants");
function resolveCodingPlanBaseUrl(providerName, codingPlanEnabled, apiFormat, currentBaseUrl) {
    if (!codingPlanEnabled) {
        return { baseUrl: currentBaseUrl, effectiveFormat: apiFormat };
    }
    const def = constants_1.ProviderRegistry.get(providerName);
    if (!def?.codingPlanSupported || !def.codingPlanUrls) {
        return { baseUrl: currentBaseUrl, effectiveFormat: apiFormat };
    }
    const effectiveFormat = def.preferredCodingPlanFormat ?? apiFormat;
    const url = def.codingPlanUrls[effectiveFormat];
    if (!url) {
        return { baseUrl: currentBaseUrl, effectiveFormat: apiFormat };
    }
    return { baseUrl: url, effectiveFormat };
}
//# sourceMappingURL=codingPlan.js.map