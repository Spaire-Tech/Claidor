"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenClawTranscriptSafetyErrorCode = exports.OpenClawTranscriptSafetyStatus = exports.OpenClawTranscriptSafetyLimit = void 0;
exports.OpenClawTranscriptSafetyLimit = {
    SoftBytes: 32 * 1024 * 1024,
    HardBytes: 64 * 1024 * 1024,
    SoftConfigValue: '32mb',
};
exports.OpenClawTranscriptSafetyStatus = {
    Safe: 'safe',
    CompactionRequired: 'compaction_required',
    Blocked: 'blocked',
    Unknown: 'unknown',
};
exports.OpenClawTranscriptSafetyErrorCode = {
    ActiveTranscriptOversized: 'OPENCLAW_ACTIVE_TRANSCRIPT_OVERSIZED',
};
//# sourceMappingURL=constants.js.map