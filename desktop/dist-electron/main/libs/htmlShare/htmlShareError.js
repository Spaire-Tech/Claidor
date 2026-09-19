"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HtmlShareUserError = void 0;
exports.createHtmlShareSizeError = createHtmlShareSizeError;
exports.sanitizeOptionalHtmlShareContent = sanitizeOptionalHtmlShareContent;
exports.serializeHtmlShareFailure = serializeHtmlShareFailure;
const constants_1 = require("../../../shared/htmlShare/constants");
class HtmlShareUserError extends Error {
    code;
    failureKind;
    details;
    constructor(options) {
        super(options.message);
        this.name = 'HtmlShareUserError';
        this.code = options.code;
        this.failureKind = options.failureKind;
        this.details = options.details;
    }
}
exports.HtmlShareUserError = HtmlShareUserError;
function createHtmlShareSizeError(failureKind, message, details) {
    return new HtmlShareUserError({
        message,
        code: constants_1.HtmlShareErrorCode.TooLarge,
        failureKind,
        details,
    });
}
function sanitizeOptionalHtmlShareContent(value, maxLength) {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== 'string') {
        throw new Error('content must be a string.');
    }
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error('content is required.');
    }
    if (trimmed.length > maxLength) {
        throw createHtmlShareSizeError(constants_1.HtmlShareFailureKind.InputTooLong, 'content is too long.', { field: constants_1.HtmlShareFailureField.Content });
    }
    return trimmed;
}
function serializeHtmlShareFailure(error, fallbackMessage) {
    if (error instanceof HtmlShareUserError) {
        return {
            success: false,
            code: error.code,
            failureKind: error.failureKind,
            details: error.details,
            error: error.message,
        };
    }
    return {
        success: false,
        failureKind: constants_1.HtmlShareFailureKind.Unknown,
        error: error instanceof Error ? error.message : fallbackMessage,
    };
}
//# sourceMappingURL=htmlShareError.js.map