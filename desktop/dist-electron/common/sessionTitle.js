"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_TITLE_MAX_CHARS = void 0;
exports.stripGoalCommandPrefixForDisplay = stripGoalCommandPrefixForDisplay;
exports.buildSessionTitleFromInput = buildSessionTitleFromInput;
exports.SESSION_TITLE_MAX_CHARS = 50;
const GOAL_START_COMMAND_PREFIX_RE = /^\/goal\s+(?:start|set|create)\s+/i;
function stripGoalCommandPrefixForDisplay(input) {
    return input.replace(GOAL_START_COMMAND_PREFIX_RE, '');
}
function buildSessionTitleFromInput(input, defaultTitle) {
    const normalizedInput = typeof input === 'string'
        ? stripGoalCommandPrefixForDisplay(input).replace(/\s+/g, ' ').trim()
        : '';
    if (!normalizedInput) {
        return defaultTitle;
    }
    const title = Array.from(normalizedInput)
        .slice(0, exports.SESSION_TITLE_MAX_CHARS)
        .join('')
        .trim();
    return title || defaultTitle;
}
//# sourceMappingURL=sessionTitle.js.map