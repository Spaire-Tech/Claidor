"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCoworkRailPreview = exports.stripCoworkRailPreviewMarkdown = exports.COWORK_RAIL_TOOLTIP_PREVIEW_MAX_LENGTH = exports.COWORK_RAIL_PREVIEW_MAX_LENGTH = void 0;
exports.COWORK_RAIL_PREVIEW_MAX_LENGTH = 50;
exports.COWORK_RAIL_TOOLTIP_PREVIEW_MAX_LENGTH = 180;
const COWORK_RAIL_PROPOSED_PLAN_TAG_PATTERN = /<\/?proposed_?plan\b[^>]*>/gi;
const COWORK_RAIL_INCOMPLETE_PROPOSED_PLAN_TAG_PATTERN = /<\/?proposed_?plan\b\s*/gi;
const COWORK_RAIL_LEADING_PLAN_SECTION_LABEL_PATTERN = /^(?:#{1,6}\s*)?(?:Summary|Implementation Approach|Key Changes|Validation|Assumptions or Questions)(?:\s*[:：]|\s+|(?=为))\s*/i;
const stripCoworkRailPreviewMarkdown = (value) => value
    .replace(COWORK_RAIL_PROPOSED_PLAN_TAG_PATTERN, ' ')
    .replace(COWORK_RAIL_INCOMPLETE_PROPOSED_PLAN_TAG_PATTERN, ' ')
    .replace(/^#+\s+/gm, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[*_~>]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(COWORK_RAIL_LEADING_PLAN_SECTION_LABEL_PATTERN, '')
    .trim();
exports.stripCoworkRailPreviewMarkdown = stripCoworkRailPreviewMarkdown;
const getCoworkRailPreview = (content, fallback, maxLength = exports.COWORK_RAIL_PREVIEW_MAX_LENGTH) => {
    const stripped = (0, exports.stripCoworkRailPreviewMarkdown)(content);
    return stripped.slice(0, maxLength) || fallback;
};
exports.getCoworkRailPreview = getCoworkRailPreview;
//# sourceMappingURL=rail.js.map