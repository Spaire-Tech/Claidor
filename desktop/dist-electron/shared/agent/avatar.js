"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeAgentAvatarIcon = exports.isDesignedAgentAvatarIcon = exports.parseAgentAvatarIcon = exports.DefaultAgentAvatarIcon = exports.encodeAgentAvatarIcon = exports.isAgentAvatarSvg = exports.DefaultAgentAvatar = exports.AgentAvatarSvg = exports.AgentAvatarIconSeparator = exports.AgentAvatarIconFormat = void 0;
exports.AgentAvatarIconFormat = {
    Svg: 'agent-avatar-svg',
};
exports.AgentAvatarIconSeparator = {
    Value: ':',
};
exports.AgentAvatarSvg = {
    Lobster: 'lobster',
    Code: 'code',
    Repair: 'repair',
    Briefcase: 'briefcase',
    ShoppingCart: 'shopping-cart',
    Data: 'data',
    Document: 'document',
    Folder: 'folder',
    Tag: 'tag',
    Brain: 'brain',
    GraduationCap: 'graduation-cap',
    Books: 'books',
    Experiment: 'experiment',
    Diagnosis: 'diagnosis',
    Scales: 'scales',
    Translation: 'translation',
    TranslationAlt: 'translation-alt',
    Creation: 'creation',
    Artboard: 'artboard',
    Music: 'music',
    Entertainment: 'entertainment',
    Headphones: 'headphones',
    Inspiration: 'inspiration',
    Lightning: 'lightning',
    Travel: 'travel',
    Fitness: 'fitness',
    Meditation: 'meditation',
    Heart: 'heart',
    PottedPlant: 'potted-plant',
    Pet: 'pet',
};
const AGENT_AVATAR_PART_COUNT = 2;
const AGENT_AVATAR_SVGS = new Set(Object.values(exports.AgentAvatarSvg));
exports.DefaultAgentAvatar = {
    svg: exports.AgentAvatarSvg.Lobster,
};
const isAgentAvatarSvg = (value) => {
    return AGENT_AVATAR_SVGS.has(value);
};
exports.isAgentAvatarSvg = isAgentAvatarSvg;
const LegacyAgentAvatarIconFormat = {
    Designed: 'agent-avatar',
};
const encodeAgentAvatarIcon = (avatar) => {
    return [
        exports.AgentAvatarIconFormat.Svg,
        avatar.svg,
    ].join(exports.AgentAvatarIconSeparator.Value);
};
exports.encodeAgentAvatarIcon = encodeAgentAvatarIcon;
exports.DefaultAgentAvatarIcon = (0, exports.encodeAgentAvatarIcon)(exports.DefaultAgentAvatar);
const parseAgentAvatarIcon = (value) => {
    const normalized = value?.trim() ?? '';
    if (!normalized)
        return null;
    const parts = normalized.split(exports.AgentAvatarIconSeparator.Value);
    if (parts[0] === LegacyAgentAvatarIconFormat.Designed) {
        return null;
    }
    if (parts.length !== AGENT_AVATAR_PART_COUNT)
        return null;
    const [format, svg] = parts;
    if (format !== exports.AgentAvatarIconFormat.Svg)
        return null;
    if (!(0, exports.isAgentAvatarSvg)(svg))
        return null;
    return { svg };
};
exports.parseAgentAvatarIcon = parseAgentAvatarIcon;
const isDesignedAgentAvatarIcon = (value) => {
    return (0, exports.parseAgentAvatarIcon)(value) !== null;
};
exports.isDesignedAgentAvatarIcon = isDesignedAgentAvatarIcon;
const normalizeAgentAvatarIcon = (value) => {
    const normalized = value?.trim() ?? '';
    const avatar = (0, exports.parseAgentAvatarIcon)(normalized);
    if (avatar)
        return (0, exports.encodeAgentAvatarIcon)(avatar);
    return exports.DefaultAgentAvatarIcon;
};
exports.normalizeAgentAvatarIcon = normalizeAgentAvatarIcon;
//# sourceMappingURL=avatar.js.map