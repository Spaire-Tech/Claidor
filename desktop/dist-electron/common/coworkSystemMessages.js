"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInternalCompactionSystemText = exports.ContextCompactionStatus = exports.ContextCompactionMode = exports.CoworkSystemMessageKind = void 0;
exports.CoworkSystemMessageKind = {
    ContextCompaction: 'context_compaction',
    ForkCompactionSummary: 'fork_compaction_summary',
};
exports.ContextCompactionMode = {
    Auto: 'auto',
    Manual: 'manual',
};
exports.ContextCompactionStatus = {
    Running: 'running',
    Completed: 'completed',
    Retrying: 'retrying',
    Failed: 'failed',
};
const INTERNAL_COMPACTION_SYSTEM_TEXT_RE = /^[\s`*_~"'()[\]{}<>.,!?;:=+\-]*compaction[\s`*_~"'()[\]{}<>.,!?;:=+\-]*$/i;
const isInternalCompactionSystemText = (text) => {
    return INTERNAL_COMPACTION_SYSTEM_TEXT_RE.test(text.trim());
};
exports.isInternalCompactionSystemText = isInternalCompactionSystemText;
//# sourceMappingURL=coworkSystemMessages.js.map