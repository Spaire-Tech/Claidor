"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.findTailAlignment = exports.applyLocalTimestampsToEntries = exports.isSameReconciledEntry = exports.isSameHistoryEntry = exports.buildGatewayMediaMetadata = exports.getLocalMediaAttachmentsKey = void 0;
const path = __importStar(require("path"));
const isRecord = (value) => {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};
const normalizeLocalMediaPathKey = (value) => {
    if (typeof value !== 'string')
        return '';
    return value.trim().replace(/\\/g, '/').toLowerCase();
};
const getLocalMediaAttachmentsKey = (metadata) => {
    if (!isRecord(metadata) || !Array.isArray(metadata.localMediaAttachments)) {
        return '';
    }
    return metadata.localMediaAttachments
        .map((item) => {
        if (!isRecord(item))
            return '';
        const localPath = normalizeLocalMediaPathKey(item.localPath);
        if (!localPath)
            return '';
        const mimeType = typeof item.mimeType === 'string' ? item.mimeType.trim().toLowerCase() : '';
        return `${localPath}\x1e${mimeType}`;
    })
        .filter(Boolean)
        .sort()
        .join('\x1f');
};
exports.getLocalMediaAttachmentsKey = getLocalMediaAttachmentsKey;
const buildGatewayMediaMetadata = (entry) => {
    const attachments = entry.mediaAttachments
        ?.map((attachment) => {
        const localPath = attachment.localPath.trim();
        if (!localPath)
            return null;
        const mimeType = attachment.mimeType?.trim();
        return {
            localPath,
            ...(mimeType ? { mimeType } : {}),
            name: path.basename(localPath),
        };
    })
        .filter((attachment) => attachment !== null);
    return attachments?.length ? { localMediaAttachments: attachments } : undefined;
};
exports.buildGatewayMediaMetadata = buildGatewayMediaMetadata;
const isSameHistoryEntry = (left, right) => left.role === right.role && left.text === right.text;
exports.isSameHistoryEntry = isSameHistoryEntry;
const isSameReconciledEntry = (left, right) => {
    return (0, exports.isSameHistoryEntry)(left, right)
        && (0, exports.getLocalMediaAttachmentsKey)(left.metadata) === (0, exports.getLocalMediaAttachmentsKey)(right.metadata);
};
exports.isSameReconciledEntry = isSameReconciledEntry;
const historyEntryKey = (entry) => {
    return `${entry.role}\x1f${entry.text}`;
};
const isValidMessageTimestamp = (value) => {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
};
const applyLocalTimestampsToEntries = (entries, localEntries) => {
    const localTimestamps = new Map();
    for (const entry of localEntries) {
        if (!isValidMessageTimestamp(entry.timestamp))
            continue;
        const key = historyEntryKey(entry);
        const timestamps = localTimestamps.get(key) ?? [];
        timestamps.push(entry.timestamp);
        localTimestamps.set(key, timestamps);
    }
    return entries.map((entry) => {
        if (isValidMessageTimestamp(entry.timestamp)) {
            return entry;
        }
        const timestamps = localTimestamps.get(historyEntryKey(entry));
        const timestamp = timestamps?.shift();
        return timestamp != null ? { ...entry, timestamp } : entry;
    });
};
exports.applyLocalTimestampsToEntries = applyLocalTimestampsToEntries;
/**
 * Find the tail-alignment point between local and authoritative entries.
 *
 * `chat.history` can return a bounded tail window that starts in the middle of
 * a turn, often with an assistant entry before the first user anchor. Prefer a
 * full role/text overlap first; then fall back to user-message anchors and
 * report both the local and authoritative start indices so leading orphan
 * assistant entries are not duplicated into the local prefix on every poll.
 */
const findTailAlignment = (localEntries, authEntries) => {
    if (authEntries.length === 0)
        return null;
    if (localEntries.length === 0)
        return { localIdx: 0, authIdx: 0 };
    const maxEntryOverlap = Math.min(localEntries.length, authEntries.length);
    for (let overlap = maxEntryOverlap; overlap >= 1; overlap -= 1) {
        const localStart = localEntries.length - overlap;
        let match = true;
        for (let idx = 0; idx < overlap; idx += 1) {
            if (!(0, exports.isSameHistoryEntry)(localEntries[localStart + idx], authEntries[idx])) {
                match = false;
                break;
            }
        }
        if (match) {
            return { localIdx: localStart, authIdx: 0 };
        }
    }
    const localUsers = [];
    for (let i = 0; i < localEntries.length; i++) {
        if (localEntries[i].role === 'user') {
            localUsers.push({ idx: i, text: localEntries[i].text });
        }
    }
    const authUsers = [];
    for (let i = 0; i < authEntries.length; i++) {
        const entry = authEntries[i];
        if (entry.role === 'user') {
            authUsers.push({ idx: i, text: entry.text });
        }
    }
    if (authUsers.length === 0 || localUsers.length === 0) {
        return { localIdx: 0, authIdx: 0 };
    }
    const maxK = Math.min(localUsers.length, authUsers.length);
    for (let k = maxK; k >= 1; k--) {
        const localStart = localUsers.length - k;
        let match = true;
        for (let j = 0; j < k; j++) {
            if (localUsers[localStart + j].text !== authUsers[j].text) {
                match = false;
                break;
            }
        }
        if (match) {
            const localIdx = localUsers[localStart].idx;
            const authIdx = authUsers[0].idx;
            if (authIdx > 0) {
                const leadingLocalIdx = localIdx - authIdx;
                const leadingAuthAlreadyPresent = leadingLocalIdx >= 0
                    && authEntries.slice(0, authIdx).every((entry, idx) => (0, exports.isSameHistoryEntry)(localEntries[leadingLocalIdx + idx], entry));
                if (!leadingAuthAlreadyPresent) {
                    return {
                        localIdx: Math.max(0, leadingLocalIdx),
                        authIdx: 0,
                    };
                }
            }
            return {
                localIdx,
                authIdx,
            };
        }
    }
    return null;
};
exports.findTailAlignment = findTailAlignment;
//# sourceMappingURL=openclawConversationReconciliation.js.map