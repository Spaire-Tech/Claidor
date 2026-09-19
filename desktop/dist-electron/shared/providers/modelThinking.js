"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProductThinkingLevel = exports.resolveOpenClawThinkingLevel = exports.getModelThinkingLevels = exports.parseModelThinkingConfig = exports.parseOpenClawThinkingLevel = exports.parseModelThinkingLevel = exports.OpenClawThinkingLevel = exports.ModelThinkingLevel = void 0;
exports.ModelThinkingLevel = {
    Off: 'off',
    Minimal: 'minimal',
    Low: 'low',
    Medium: 'medium',
    High: 'high',
    XHigh: 'xhigh',
    Max: 'max',
};
exports.OpenClawThinkingLevel = {
    Off: 'off',
    Minimal: 'minimal',
    Low: 'low',
    Medium: 'medium',
    High: 'high',
    XHigh: 'xhigh',
};
const MODEL_THINKING_LEVEL_VALUES = new Set(Object.values(exports.ModelThinkingLevel));
const OPENCLAW_THINKING_LEVEL_VALUES = new Set(Object.values(exports.OpenClawThinkingLevel));
const parseModelThinkingLevel = (value) => (typeof value === 'string' && MODEL_THINKING_LEVEL_VALUES.has(value)
    ? value
    : undefined);
exports.parseModelThinkingLevel = parseModelThinkingLevel;
const parseOpenClawThinkingLevel = (value) => (typeof value === 'string' && OPENCLAW_THINKING_LEVEL_VALUES.has(value)
    ? value
    : undefined);
exports.parseOpenClawThinkingLevel = parseOpenClawThinkingLevel;
const parseModelThinkingConfig = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const candidate = value;
    if (!Array.isArray(candidate.options) || candidate.options.length === 0) {
        return undefined;
    }
    const options = [];
    const seenLevels = new Set();
    const seenOpenClawLevels = new Set();
    for (const rawOption of candidate.options) {
        if (!rawOption || typeof rawOption !== 'object' || Array.isArray(rawOption)) {
            return undefined;
        }
        const option = rawOption;
        const level = (0, exports.parseModelThinkingLevel)(option.level);
        const openclawLevel = (0, exports.parseOpenClawThinkingLevel)(option.openclawLevel);
        if (!level
            || !openclawLevel
            || seenLevels.has(level)
            || seenOpenClawLevels.has(openclawLevel)
            || (level === exports.ModelThinkingLevel.Off) !== (openclawLevel === exports.OpenClawThinkingLevel.Off)) {
            return undefined;
        }
        seenLevels.add(level);
        seenOpenClawLevels.add(openclawLevel);
        options.push({ level, openclawLevel });
    }
    if (options.length === 1 && options[0]?.level === exports.ModelThinkingLevel.Off) {
        return undefined;
    }
    const defaultLevel = (0, exports.parseModelThinkingLevel)(candidate.defaultLevel);
    if (!defaultLevel || !seenLevels.has(defaultLevel)) {
        return undefined;
    }
    return { options, defaultLevel };
};
exports.parseModelThinkingConfig = parseModelThinkingConfig;
const getModelThinkingLevels = (config) => config.options.map(option => option.level);
exports.getModelThinkingLevels = getModelThinkingLevels;
const resolveOpenClawThinkingLevel = (config, level) => (config.options.find(option => option.level === level)?.openclawLevel);
exports.resolveOpenClawThinkingLevel = resolveOpenClawThinkingLevel;
const resolveProductThinkingLevel = (config, openclawLevel) => (config.options.find(option => option.openclawLevel === openclawLevel)?.level);
exports.resolveProductThinkingLevel = resolveProductThinkingLevel;
//# sourceMappingURL=modelThinking.js.map