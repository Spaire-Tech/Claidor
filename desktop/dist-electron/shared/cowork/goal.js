"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoworkGoalStatus = void 0;
exports.isCoworkGoalStatus = isCoworkGoalStatus;
exports.normalizeCoworkGoal = normalizeCoworkGoal;
exports.formatCoworkGoalTokenCount = formatCoworkGoalTokenCount;
exports.formatCoworkGoalUsage = formatCoworkGoalUsage;
exports.formatCoworkGoalElapsed = formatCoworkGoalElapsed;
exports.formatCoworkGoalCompletionDuration = formatCoworkGoalCompletionDuration;
exports.CoworkGoalStatus = {
    Active: 'active',
    Paused: 'paused',
    Blocked: 'blocked',
    UsageLimited: 'usage_limited',
    BudgetLimited: 'budget_limited',
    Complete: 'complete',
};
function isCoworkGoalStatus(value) {
    return typeof value === 'string'
        && Object.values(exports.CoworkGoalStatus).includes(value);
}
const readFiniteNumber = (record, key) => {
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};
const readOptionalString = (record, key) => {
    const value = record[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
};
function normalizeCoworkGoal(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const record = value;
    const id = readOptionalString(record, 'id');
    const objective = readOptionalString(record, 'objective');
    const status = record.status;
    const createdAt = readFiniteNumber(record, 'createdAt');
    const updatedAt = readFiniteNumber(record, 'updatedAt');
    if (!id || !objective || !isCoworkGoalStatus(status) || createdAt === undefined || updatedAt === undefined) {
        return null;
    }
    return {
        id,
        objective,
        status,
        createdAt,
        updatedAt,
        ...(readFiniteNumber(record, 'tokenStart') !== undefined ? { tokenStart: readFiniteNumber(record, 'tokenStart') } : {}),
        ...(typeof record.tokenStartFresh === 'boolean' ? { tokenStartFresh: record.tokenStartFresh } : {}),
        tokensUsed: Math.max(0, Math.floor(readFiniteNumber(record, 'tokensUsed') ?? 0)),
        ...(readFiniteNumber(record, 'tokenBudget') !== undefined ? { tokenBudget: Math.max(0, Math.floor(readFiniteNumber(record, 'tokenBudget') ?? 0)) } : {}),
        ...(readFiniteNumber(record, 'continuationTurns') !== undefined ? { continuationTurns: Math.max(0, Math.floor(readFiniteNumber(record, 'continuationTurns') ?? 0)) } : {}),
        ...(readOptionalString(record, 'lastStatusNote') ? { lastStatusNote: readOptionalString(record, 'lastStatusNote') } : {}),
        ...(readFiniteNumber(record, 'pausedAt') !== undefined ? { pausedAt: readFiniteNumber(record, 'pausedAt') } : {}),
        ...(readFiniteNumber(record, 'blockedAt') !== undefined ? { blockedAt: readFiniteNumber(record, 'blockedAt') } : {}),
        ...(readFiniteNumber(record, 'completedAt') !== undefined ? { completedAt: readFiniteNumber(record, 'completedAt') } : {}),
        ...(readFiniteNumber(record, 'usageLimitedAt') !== undefined ? { usageLimitedAt: readFiniteNumber(record, 'usageLimitedAt') } : {}),
        ...(readFiniteNumber(record, 'budgetLimitedAt') !== undefined ? { budgetLimitedAt: readFiniteNumber(record, 'budgetLimitedAt') } : {}),
    };
}
function formatCoworkGoalTokenCount(value) {
    if (value === undefined || !Number.isFinite(value) || value <= 0)
        return '0';
    if (value < 1000)
        return String(Math.round(value));
    if (value < 1_000_000) {
        const rounded = value >= 10_000 ? Math.round(value / 1000) : Math.round(value / 100) / 10;
        return `${rounded}k`;
    }
    const rounded = value >= 10_000_000
        ? Math.round(value / 1_000_000)
        : Math.round(value / 100_000) / 10;
    return `${rounded}m`;
}
function formatCoworkGoalUsage(goal) {
    if (goal.tokenBudget !== undefined && goal.tokenBudget > 0) {
        return `${formatCoworkGoalTokenCount(goal.tokensUsed)}/${formatCoworkGoalTokenCount(goal.tokenBudget)}`;
    }
    return goal.tokensUsed > 0 ? `${formatCoworkGoalTokenCount(goal.tokensUsed)} used` : null;
}
function formatCoworkGoalDurationMs(elapsedMs) {
    const totalSeconds = Math.floor(elapsedMs / 1000);
    if (totalSeconds < 1)
        return null;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0)
        return `${hours}h ${minutes}m`;
    if (minutes > 0)
        return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}
function formatCoworkGoalElapsed(goal, now = Date.now()) {
    if (goal.status !== exports.CoworkGoalStatus.Active)
        return null;
    return formatCoworkGoalDurationMs(Math.max(0, now - goal.createdAt));
}
function formatCoworkGoalCompletionDuration(goal) {
    if (goal.status !== exports.CoworkGoalStatus.Complete)
        return null;
    const completedAt = goal.completedAt ?? goal.updatedAt;
    return formatCoworkGoalDurationMs(Math.max(0, completedAt - goal.createdAt));
}
//# sourceMappingURL=goal.js.map