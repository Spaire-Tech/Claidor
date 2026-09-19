"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoworkSteerRejectReason = exports.CoworkSteerStatus = void 0;
exports.CoworkSteerStatus = {
    Pending: 'pending',
    Accepted: 'accepted',
    Rejected: 'rejected',
};
exports.CoworkSteerRejectReason = {
    NoActiveTurn: 'no_active_turn',
    NotStreaming: 'not_streaming',
    ContextMaintenance: 'context_maintenance',
    RuntimeUnsupported: 'runtime_unsupported',
    RuntimeRejected: 'runtime_rejected',
    EmptyInput: 'empty_input',
    Unknown: 'unknown',
};
//# sourceMappingURL=steer.js.map