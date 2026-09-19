"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAgentModelRoleRefs = resolveAgentModelRoleRefs;
exports.buildAgentModelRoleDefaults = buildAgentModelRoleDefaults;
const providers_1 = require("../../shared/providers");
/**
 * The first model the server offers for each role, as a `provider/model`
 * ref. A role the server sent no model for is simply absent: writing a ref
 * to a model the engine has not been given would fail at the moment it was
 * needed, which for the fallback is the worst possible moment.
 *
 * First rather than last, and deliberately: if a future catalogue ever
 * carried two models in one role, the order the server sent them in is the
 * only thing expressing a preference.
 */
function resolveAgentModelRoleRefs(models, providerId) {
    const refs = {};
    if (!providerId)
        return refs;
    for (const model of models) {
        const modelId = model.modelId?.trim();
        if (!modelId || !model.role)
            continue;
        const ref = `${providerId}/${modelId}`;
        if (model.role === providers_1.ModelRole.Primary && !refs.primary)
            refs.primary = ref;
        else if (model.role === providers_1.ModelRole.Cheap && !refs.cheap)
            refs.cheap = ref;
        else if (model.role === providers_1.ModelRole.Fallback && !refs.fallback)
            refs.fallback = ref;
    }
    return refs;
}
/**
 * The `agents.defaults` fragments the roles fill in. Each is its own object
 * so a caller can spread it into the block it belongs to without the
 * shapes of those blocks being restated here.
 *
 * Every field is omitted when its role has no model, so a partial catalogue
 * degrades to the engine's own defaults instead of to a broken reference.
 */
function buildAgentModelRoleDefaults(refs) {
    return {
        model: refs.fallback ? { fallbacks: [refs.fallback] } : {},
        compaction: refs.cheap
            ? { model: refs.cheap, memoryFlush: { model: refs.cheap } }
            : {},
        heartbeat: refs.cheap ? { model: refs.cheap } : {},
        ...(refs.cheap ? { subagents: { model: refs.cheap } } : {}),
    };
}
//# sourceMappingURL=agentModelRoles.js.map