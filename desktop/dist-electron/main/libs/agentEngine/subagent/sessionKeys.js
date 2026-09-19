"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAgentIdFromSubagentSessionKey = exports.isSubagentSessionKey = void 0;
const isSubagentSessionKey = (sessionKey) => sessionKey.includes(':subagent:');
exports.isSubagentSessionKey = isSubagentSessionKey;
const parseAgentIdFromSubagentSessionKey = (sessionKey) => {
    const match = sessionKey.match(/^agent:([^:]+):subagent:/);
    return match?.[1]?.trim() || null;
};
exports.parseAgentIdFromSubagentSessionKey = parseAgentIdFromSubagentSessionKey;
//# sourceMappingURL=sessionKeys.js.map