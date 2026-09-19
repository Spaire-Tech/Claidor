"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpUrlValidationError = exports.McpUrlProtocol = void 0;
exports.normalizeMcpServerUrlInput = normalizeMcpServerUrlInput;
exports.McpUrlProtocol = {
    Http: 'http:',
    Https: 'https:',
};
exports.McpUrlValidationError = {
    Empty: 'empty',
    Invalid: 'invalid',
    Multiple: 'multiple',
};
const URL_CANDIDATE_RE = /https?:\/\/[^\s"'<>\uFF0C\u3002\uFF1B]+/gi;
const TRAILING_PUNCTUATION_RE = /[),.;:!?\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u3001]+$/;
function parseHttpUrl(value) {
    if (/\s/.test(value)) {
        return null;
    }
    try {
        const url = new URL(value);
        if (url.protocol !== exports.McpUrlProtocol.Http && url.protocol !== exports.McpUrlProtocol.Https) {
            return null;
        }
        return url.href;
    }
    catch {
        return null;
    }
}
function trimUrlCandidate(value) {
    return value.trim().replace(TRAILING_PUNCTUATION_RE, '');
}
function normalizeMcpServerUrlInput(input) {
    const trimmed = (input || '').trim();
    if (!trimmed) {
        return { ok: false, error: exports.McpUrlValidationError.Empty };
    }
    const direct = parseHttpUrl(trimmed);
    if (direct) {
        return { ok: true, url: direct, extracted: false };
    }
    const candidates = Array.from(trimmed.matchAll(URL_CANDIDATE_RE))
        .map(match => trimUrlCandidate(match[0]))
        .map(parseHttpUrl)
        .filter((url) => Boolean(url));
    const uniqueCandidates = Array.from(new Set(candidates));
    if (uniqueCandidates.length === 1) {
        return { ok: true, url: uniqueCandidates[0], extracted: true };
    }
    if (uniqueCandidates.length > 1) {
        return { ok: false, error: exports.McpUrlValidationError.Multiple };
    }
    return { ok: false, error: exports.McpUrlValidationError.Invalid };
}
//# sourceMappingURL=url.js.map