"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAuthExchangeIntentCurrent = exports.isAuthStateSnapshotCurrent = exports.shouldRemoveMediaTaskAfterPoll = exports.clearMediaTaskOwnerAliasesForOwner = exports.rememberMediaTaskOwnerAliases = exports.canAccessTrackedMediaTask = exports.rebindMediaAccountScope = exports.resolveAccountBoundValue = exports.bindAccountValue = exports.createAccountScopedFetch = exports.isMediaAccountScopeSnapshotCurrent = exports.isMediaAccountScopeCurrent = void 0;
const isMediaAccountScopeCurrent = (expected, current) => (current?.ownerAccountKey === expected.ownerAccountKey
    && current.accountGeneration === expected.accountGeneration);
exports.isMediaAccountScopeCurrent = isMediaAccountScopeCurrent;
const isMediaAccountScopeSnapshotCurrent = (expected, current) => (expected === null
    ? current === null
    : (0, exports.isMediaAccountScopeCurrent)(expected, current));
exports.isMediaAccountScopeSnapshotCurrent = isMediaAccountScopeSnapshotCurrent;
const createAccountScopedFetch = (expected, getCurrentScope, fetchWithAuth) => async (url, options) => {
    if (!(0, exports.isMediaAccountScopeCurrent)(expected, getCurrentScope())) {
        throw new Error('Account changed before the publishing request was sent');
    }
    const response = await fetchWithAuth(url, options);
    if (!(0, exports.isMediaAccountScopeCurrent)(expected, getCurrentScope())) {
        throw new Error('Account changed while the publishing request was running');
    }
    return response;
};
exports.createAccountScopedFetch = createAccountScopedFetch;
const bindAccountValue = (value, scope) => ({
    ...scope,
    value,
});
exports.bindAccountValue = bindAccountValue;
const resolveAccountBoundValue = (bound, currentScope) => (bound && (0, exports.isMediaAccountScopeCurrent)(bound, currentScope)
    ? bound.value
    : undefined);
exports.resolveAccountBoundValue = resolveAccountBoundValue;
const rebindMediaAccountScope = (ownerAccountKey, current) => (current?.ownerAccountKey === ownerAccountKey
    ? {
        ownerAccountKey,
        accountGeneration: current.accountGeneration,
    }
    : null);
exports.rebindMediaAccountScope = rebindMediaAccountScope;
const canAccessTrackedMediaTask = (trackedOwnerAccountKey, requestScope) => (trackedOwnerAccountKey != null
    && requestScope?.ownerAccountKey === trackedOwnerAccountKey);
exports.canAccessTrackedMediaTask = canAccessTrackedMediaTask;
const rememberMediaTaskOwnerAliases = (registry, ownerAccountKey, taskIds, maxAliases = 2_000) => {
    for (const rawTaskId of taskIds) {
        if (rawTaskId === null || rawTaskId === undefined)
            continue;
        const taskId = String(rawTaskId).trim();
        if (!taskId)
            continue;
        registry.delete(taskId);
        registry.set(taskId, ownerAccountKey);
    }
    while (registry.size > maxAliases) {
        const oldestTaskId = registry.keys().next().value;
        if (!oldestTaskId)
            break;
        registry.delete(oldestTaskId);
    }
};
exports.rememberMediaTaskOwnerAliases = rememberMediaTaskOwnerAliases;
const clearMediaTaskOwnerAliasesForOwner = (registry, ownerAccountKey) => {
    for (const [taskId, trackedOwnerAccountKey] of registry) {
        if (trackedOwnerAccountKey === ownerAccountKey) {
            registry.delete(taskId);
        }
    }
};
exports.clearMediaTaskOwnerAliasesForOwner = clearMediaTaskOwnerAliasesForOwner;
const shouldRemoveMediaTaskAfterPoll = (responseScope, currentScope, terminal) => (terminal && (0, exports.isMediaAccountScopeCurrent)(responseScope, currentScope));
exports.shouldRemoveMediaTaskAfterPoll = shouldRemoveMediaTaskAfterPoll;
const isAuthStateSnapshotCurrent = (expected, currentGeneration, currentTokens) => (currentGeneration === expected.accountGeneration
    && currentTokens?.accessToken === expected.accessToken
    && currentTokens.refreshToken === expected.refreshToken);
exports.isAuthStateSnapshotCurrent = isAuthStateSnapshotCurrent;
const isAuthExchangeIntentCurrent = (expected, activeIntentId, currentGeneration, currentTokens) => (activeIntentId === expected.intentId
    && currentGeneration === expected.accountGeneration
    && currentTokens?.accessToken === (expected.accessToken ?? undefined)
    && currentTokens?.refreshToken === (expected.refreshToken ?? undefined)
    && (currentTokens !== null
        || (expected.accessToken === null && expected.refreshToken === null)));
exports.isAuthExchangeIntentCurrent = isAuthExchangeIntentCurrent;
//# sourceMappingURL=mediaAccountIsolation.js.map