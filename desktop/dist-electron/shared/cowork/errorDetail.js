"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoworkErrorModelSource = void 0;
exports.isCoworkErrorModelSource = isCoworkErrorModelSource;
exports.buildCoworkErrorDetail = buildCoworkErrorDetail;
exports.formatCoworkErrorDetailText = formatCoworkErrorDetailText;
exports.parseCoworkErrorDetail = parseCoworkErrorDetail;
/**
 * Where the failing model comes from in LobsterAI terms, so users can tell at
 * a glance whether an error concerns the LobsterAI plan, a vendor coding plan
 * they configured, or their own custom provider.
 */
exports.CoworkErrorModelSource = {
    LobsterAIPlan: 'lobsterai-plan',
    CodingPlan: 'coding-plan',
    CustomProvider: 'custom-provider',
    BuiltinOAuth: 'builtin-oauth',
    BuiltinProvider: 'builtin-provider',
};
const COWORK_ERROR_MODEL_SOURCE_VALUES = new Set(Object.values(exports.CoworkErrorModelSource));
function isCoworkErrorModelSource(value) {
    return typeof value === 'string' && COWORK_ERROR_MODEL_SOURCE_VALUES.has(value);
}
const COWORK_ERROR_DETAIL_METADATA_KEYS = [
    'provider',
    'model',
    'httpCode',
    'providerErrorType',
    'providerErrorMessagePreview',
    'rawErrorPreview',
    'failoverReason',
    'providerRuntimeFailureKind',
];
const normalizeField = (value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
};
/**
 * Builds the persisted error detail, or undefined when it would carry no
 * information beyond the user-facing message (so metadata stays lean and the
 * UI only offers the disclosure when there is something extra to show).
 */
function buildCoworkErrorDetail(input) {
    const detail = {};
    for (const key of COWORK_ERROR_DETAIL_METADATA_KEYS) {
        const value = normalizeField(input.metadata?.[key]);
        if (value)
            detail[key] = value;
    }
    if (input.modelSource && isCoworkErrorModelSource(input.modelSource)) {
        detail.modelSource = input.modelSource;
    }
    const providerDisplayName = normalizeField(input.providerDisplayName);
    if (providerDisplayName) {
        detail.providerDisplayName = providerDisplayName;
    }
    const rawErrorMessage = normalizeField(input.rawErrorMessage);
    const displayMessage = normalizeField(input.displayMessage);
    if (rawErrorMessage && rawErrorMessage !== displayMessage) {
        detail.rawErrorMessage = rawErrorMessage;
    }
    return Object.keys(detail).length > 0 ? detail : undefined;
}
const COWORK_ERROR_DETAIL_DISPLAY_ORDER = [
    'provider',
    'providerDisplayName',
    'model',
    'modelSource',
    'httpCode',
    'providerErrorType',
    'failoverReason',
    'providerRuntimeFailureKind',
    'providerErrorMessagePreview',
    'rawErrorMessage',
    'rawErrorPreview',
];
/**
 * Multi-line `key: value` text for the technical-details disclosure and its
 * copy action. Values are already redacted upstream; this is display-only
 * formatting.
 */
function formatCoworkErrorDetailText(detail) {
    const lines = [];
    for (const key of COWORK_ERROR_DETAIL_DISPLAY_ORDER) {
        const value = normalizeField(detail[key]);
        if (value)
            lines.push(`${key}: ${value}`);
    }
    return lines.join('\n');
}
function parseCoworkErrorDetail(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const record = value;
    const detail = {};
    for (const key of COWORK_ERROR_DETAIL_DISPLAY_ORDER) {
        const raw = record[key];
        if (typeof raw !== 'string')
            continue;
        if (key === 'modelSource') {
            const normalized = normalizeField(raw);
            if (normalized && isCoworkErrorModelSource(normalized))
                detail.modelSource = normalized;
            continue;
        }
        const normalized = normalizeField(raw);
        if (normalized)
            detail[key] = normalized;
    }
    return Object.keys(detail).length > 0 ? detail : null;
}
//# sourceMappingURL=errorDetail.js.map