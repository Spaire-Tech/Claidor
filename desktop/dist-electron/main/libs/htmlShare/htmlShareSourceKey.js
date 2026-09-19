"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildArtifactIdentityClientSourceKey = exports.buildArtifactFileClientSourceKey = exports.buildHtmlShareClientSourceKey = exports.normalizeHtmlShareSourceFilePath = void 0;
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("../../../shared/htmlShare/constants");
const safeDecodeFilePath = (value) => {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return value;
    }
};
const normalizeHtmlShareSourceFilePath = (filePath) => {
    let normalized = filePath.trim();
    if (/^file:\/\//i.test(normalized)) {
        normalized = safeDecodeFilePath(normalized.replace(/^file:\/\//i, ''));
    }
    if (/^\/[A-Za-z]:/.test(normalized)) {
        normalized = normalized.slice(1);
    }
    return path_1.default.resolve(normalized).replace(/\\/g, '/').toLowerCase();
};
exports.normalizeHtmlShareSourceFilePath = normalizeHtmlShareSourceFilePath;
const sha256 = (value) => crypto_1.default.createHash('sha256').update(value).digest('hex');
const buildHtmlShareClientSourceKey = (filePath) => (sha256(`${constants_1.HtmlShareSourceType.HtmlFile}:${(0, exports.normalizeHtmlShareSourceFilePath)(filePath)}`));
exports.buildHtmlShareClientSourceKey = buildHtmlShareClientSourceKey;
const buildArtifactFileClientSourceKey = (sourceType, filePath) => sha256(`${sourceType}:file:${(0, exports.normalizeHtmlShareSourceFilePath)(filePath)}`);
exports.buildArtifactFileClientSourceKey = buildArtifactFileClientSourceKey;
const buildArtifactIdentityClientSourceKey = (sourceType, sessionId, artifactId) => sha256(`${sourceType}:artifact:${sessionId}:${artifactId}`);
exports.buildArtifactIdentityClientSourceKey = buildArtifactIdentityClientSourceKey;
//# sourceMappingURL=htmlShareSourceKey.js.map