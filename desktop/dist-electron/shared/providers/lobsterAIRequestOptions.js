"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supportsLobsterAIRequestOptionsV1 = exports.parseLobsterAIRequestCapabilities = exports.LOBSTERAI_REQUEST_OPTIONS_VERSION = exports.LOBSTERAI_REQUEST_OPTIONS_FIELD = exports.LobsterAIRequestCapability = void 0;
exports.LobsterAIRequestCapability = {
    OptionsV1: 'lobsterai-options-v1',
};
exports.LOBSTERAI_REQUEST_OPTIONS_FIELD = 'lobsterai_options';
exports.LOBSTERAI_REQUEST_OPTIONS_VERSION = 1;
const LOBSTERAI_REQUEST_CAPABILITY_VALUES = new Set(Object.values(exports.LobsterAIRequestCapability));
const parseLobsterAIRequestCapabilities = (value) => {
    if (!Array.isArray(value))
        return undefined;
    const result = [];
    const seen = new Set();
    for (const candidate of value) {
        if (typeof candidate !== 'string'
            || !LOBSTERAI_REQUEST_CAPABILITY_VALUES.has(candidate)) {
            continue;
        }
        const capability = candidate;
        if (!seen.has(capability)) {
            seen.add(capability);
            result.push(capability);
        }
    }
    return result.length > 0 ? result : undefined;
};
exports.parseLobsterAIRequestCapabilities = parseLobsterAIRequestCapabilities;
const supportsLobsterAIRequestOptionsV1 = (capabilities) => capabilities?.includes(exports.LobsterAIRequestCapability.OptionsV1) === true;
exports.supportsLobsterAIRequestOptionsV1 = supportsLobsterAIRequestOptionsV1;
//# sourceMappingURL=lobsterAIRequestOptions.js.map