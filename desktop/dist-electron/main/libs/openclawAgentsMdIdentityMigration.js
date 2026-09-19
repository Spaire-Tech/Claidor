"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeLegacyAgentsMdIdentityBlock = removeLegacyAgentsMdIdentityBlock;
exports.cleanupLegacyAgentsMdIdentityBlockInWorkspace = cleanupLegacyAgentsMdIdentityBlockInWorkspace;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("../../shared/agent/constants");
const constants_2 = require("../../shared/openclawEngine/constants");
const AGENTS_MD_FILENAME = 'AGENTS.md';
const LOBSTERAI_MIGRATIONS_DIR = path_1.default.join('.lobsterai', 'migrations');
const LEGACY_IDENTITY_TITLE = '## Identity（必须遵守）';
const MAX_LEGACY_IDENTITY_BLOCK_CHARS = 20_000;
const TEMPLATE_ANCHORS = [
    'This folder is home. Treat it that way.',
    '## First Run',
    '## Session Startup',
    '## Every Session',
    '## Memory',
];
const detectLineEnding = (content) => (content.includes('\r\n') ? '\r\n' : '\n');
const normalizeLineEndings = (content) => content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const restoreLineEndings = (content, lineEnding) => lineEnding === '\n' ? content : content.replace(/\n/g, lineEnding);
const stripBom = (value) => value.replace(/^\uFEFF/, '');
const isBlank = (value) => stripBom(value).trim().length === 0;
const findFirstNonBlankLine = (lines, startIndex) => {
    for (let index = startIndex; index < lines.length; index += 1) {
        if (!isBlank(lines[index])) {
            return index;
        }
    }
    return -1;
};
const startsWithKnownTemplateAnchor = (line) => {
    const trimmed = line.trim();
    return TEMPLATE_ANCHORS.some(anchor => trimmed === anchor || trimmed.startsWith(`${anchor} `));
};
const buildNoChangeResult = (content, reason) => ({
    changed: false,
    nextContent: content,
    reason,
});
const trimTrailingWhitespace = (content) => content.replace(/[ \t\n]*$/u, '');
const removeLegacyBlockFromPreMarkerContent = (preMarkerContent) => {
    const lines = preMarkerContent.split('\n');
    const firstContentLineIndex = findFirstNonBlankLine(lines, 0);
    const hasLegacyTitle = lines.some(line => line.trim() === LEGACY_IDENTITY_TITLE);
    if (firstContentLineIndex < 0) {
        return buildNoChangeResult(preMarkerContent, constants_1.AgentLegacyIdentityCleanupSkipReason.NoLegacyBlock);
    }
    if (stripBom(lines[firstContentLineIndex]).trim() !== '# AGENTS.md - Your Workspace') {
        return buildNoChangeResult(preMarkerContent, hasLegacyTitle
            ? constants_1.AgentLegacyIdentityCleanupSkipReason.LowConfidence
            : constants_1.AgentLegacyIdentityCleanupSkipReason.NoLegacyBlock);
    }
    const titleLineIndex = findFirstNonBlankLine(lines, firstContentLineIndex + 1);
    if (titleLineIndex < 0 || lines[titleLineIndex].trim() !== LEGACY_IDENTITY_TITLE) {
        return buildNoChangeResult(preMarkerContent, hasLegacyTitle
            ? constants_1.AgentLegacyIdentityCleanupSkipReason.LowConfidence
            : constants_1.AgentLegacyIdentityCleanupSkipReason.NoLegacyBlock);
    }
    let separatorLineIndex = -1;
    for (let index = titleLineIndex + 1; index < lines.length; index += 1) {
        if (lines[index].trim() === '---') {
            separatorLineIndex = index;
            break;
        }
    }
    if (separatorLineIndex < 0) {
        return buildNoChangeResult(preMarkerContent, constants_1.AgentLegacyIdentityCleanupSkipReason.LowConfidence);
    }
    const anchorLineIndex = findFirstNonBlankLine(lines, separatorLineIndex + 1);
    if (anchorLineIndex < 0 || !startsWithKnownTemplateAnchor(lines[anchorLineIndex])) {
        return buildNoChangeResult(preMarkerContent, constants_1.AgentLegacyIdentityCleanupSkipReason.LowConfidence);
    }
    const removedContent = lines.slice(titleLineIndex, anchorLineIndex).join('\n');
    if (removedContent.length > MAX_LEGACY_IDENTITY_BLOCK_CHARS) {
        return buildNoChangeResult(preMarkerContent, constants_1.AgentLegacyIdentityCleanupSkipReason.LowConfidence);
    }
    const nextLines = [
        ...lines.slice(0, titleLineIndex),
        ...lines.slice(anchorLineIndex),
    ];
    return {
        changed: true,
        nextContent: nextLines.join('\n'),
        removedContent,
    };
};
function removeLegacyAgentsMdIdentityBlock(content) {
    const lineEnding = detectLineEnding(content);
    const normalized = normalizeLineEndings(content);
    const markerIndex = (0, constants_2.findAgentsMdManagedMarker)(normalized)?.index ?? -1;
    const preMarkerContent = markerIndex >= 0 ? normalized.slice(0, markerIndex) : normalized;
    const managedContent = markerIndex >= 0 ? normalized.slice(markerIndex) : '';
    const result = removeLegacyBlockFromPreMarkerContent(preMarkerContent);
    if (!result.changed) {
        return {
            ...result,
            nextContent: content,
        };
    }
    const nextPreMarkerContent = trimTrailingWhitespace(result.nextContent);
    const nextNormalized = managedContent
        ? `${nextPreMarkerContent}\n\n${managedContent}`
        : `${nextPreMarkerContent}\n`;
    return {
        changed: true,
        nextContent: restoreLineEndings(nextNormalized, lineEnding),
        removedContent: restoreLineEndings(result.removedContent, lineEnding),
    };
}
const formatBackupTimestamp = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/u, 'Z');
const buildBackupPath = (workspaceDir, originalContent, now) => {
    const hash = crypto_1.default.createHash('sha256').update(originalContent).digest('hex').slice(0, 12);
    return path_1.default.join(workspaceDir, LOBSTERAI_MIGRATIONS_DIR, `agents-md-before-legacy-identity-cleanup-${formatBackupTimestamp(now)}-${hash}.md`);
};
const atomicWriteFile = (filePath, content) => {
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs_1.default.writeFileSync(tmpPath, content, 'utf8');
    fs_1.default.renameSync(tmpPath, filePath);
};
function cleanupLegacyAgentsMdIdentityBlockInWorkspace(workspaceDir, now = new Date()) {
    try {
        const agentsMdPath = path_1.default.join(workspaceDir, AGENTS_MD_FILENAME);
        if (!fs_1.default.existsSync(agentsMdPath)) {
            return {
                status: constants_1.AgentLegacyIdentityCleanupStatus.Skipped,
                reason: constants_1.AgentLegacyIdentityCleanupSkipReason.NoAgentsMd,
            };
        }
        const originalContent = fs_1.default.readFileSync(agentsMdPath, 'utf8');
        const removal = removeLegacyAgentsMdIdentityBlock(originalContent);
        if (removal.changed === false) {
            return {
                status: constants_1.AgentLegacyIdentityCleanupStatus.Skipped,
                reason: removal.reason,
            };
        }
        const backupPath = buildBackupPath(workspaceDir, originalContent, now);
        fs_1.default.mkdirSync(path_1.default.dirname(backupPath), { recursive: true });
        if (!fs_1.default.existsSync(backupPath)) {
            fs_1.default.writeFileSync(backupPath, originalContent, 'utf8');
        }
        atomicWriteFile(agentsMdPath, removal.nextContent);
        return {
            status: constants_1.AgentLegacyIdentityCleanupStatus.Cleaned,
            backupPath,
            removedChars: removal.removedContent.length,
        };
    }
    catch (error) {
        return {
            status: constants_1.AgentLegacyIdentityCleanupStatus.Failed,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
//# sourceMappingURL=openclawAgentsMdIdentityMigration.js.map