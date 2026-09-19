"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerModelRefResolutionStatus = void 0;
exports.shouldSyncServerModelConfig = shouldSyncServerModelConfig;
exports.syncServerModelConfigIfNeeded = syncServerModelConfigIfNeeded;
exports.parsePrimaryModelRef = parsePrimaryModelRef;
exports.resolveManagedSessionModelTarget = resolveManagedSessionModelTarget;
exports.resolveQualifiedAgentModelRef = resolveQualifiedAgentModelRef;
exports.resolveServerModelRefForRun = resolveServerModelRefForRun;
exports.buildAgentEntry = buildAgentEntry;
exports.buildManagedAgentEntries = buildManagedAgentEntries;
exports.migrateAgentModelRefs = migrateAgentModelRefs;
const node_path_1 = __importDefault(require("node:path"));
const avatar_1 = require("../../shared/agent/avatar");
const constants_1 = require("../../shared/providers/constants");
exports.ServerModelRefResolutionStatus = {
    Server: 'server',
    NonServer: 'non_server',
    Ambiguous: 'ambiguous',
    RefreshRequired: 'refresh_required',
    Unresolved: 'unresolved',
};
function shouldSyncServerModelConfig(options) {
    return options.forceConfigSync === true
        || options.metadataChanged
        || options.modelsMissingFromConfig;
}
async function syncServerModelConfigIfNeeded(options) {
    if (!shouldSyncServerModelConfig(options)) {
        return false;
    }
    const result = await options.sync();
    if (!result.success) {
        throw new Error(result.error || 'Failed to sync server model configuration.');
    }
    return true;
}
const LegacyQualifiedProviderMigration = {
    [constants_1.OpenClawProviderId.OpenAI]: [constants_1.OpenClawProviderId.OpenAICodex],
    [constants_1.OpenClawProviderId.Minimax]: [constants_1.OpenClawProviderId.MinimaxPortal],
    [constants_1.OpenClawProviderId.OpenAICodex]: [constants_1.OpenClawProviderId.OpenAI],
};
function normalizeSubagentAllowAgentIds(agent) {
    const seen = new Set();
    const allowAgentIds = [];
    const selfId = agent.id.trim();
    for (const id of agent.subagentAllowAgentIds ?? []) {
        const normalized = id.trim();
        if (!normalized || normalized === selfId || seen.has(normalized))
            continue;
        seen.add(normalized);
        allowAgentIds.push(normalized);
    }
    return allowAgentIds;
}
function buildSubagentConfig(agent) {
    const selectedAgentIds = normalizeSubagentAllowAgentIds(agent);
    const selfId = agent.id.trim();
    if (!selfId || selectedAgentIds.length === 0) {
        return undefined;
    }
    return {
        allowAgents: [selfId, ...selectedAgentIds],
        requireAgentId: true,
    };
}
function parsePrimaryModelRef(primaryModel) {
    const normalized = primaryModel.trim();
    const slashIndex = normalized.indexOf('/');
    if (!normalized || slashIndex <= 0 || slashIndex === normalized.length - 1) {
        return null;
    }
    const providerId = normalized.slice(0, slashIndex).trim();
    const modelId = normalized.slice(slashIndex + 1).trim();
    if (!providerId || !modelId) {
        return null;
    }
    return {
        providerId,
        modelId,
        primaryModel: `${providerId}/${modelId}`,
    };
}
function resolveManagedSessionModelTarget(options) {
    const fallbackTarget = parsePrimaryModelRef(options.fallbackPrimaryModel);
    const explicitModel = options.agentModel.trim();
    const currentProviderId = options.currentProviderId?.trim() || '';
    if (!explicitModel) {
        if (fallbackTarget)
            return fallbackTarget;
        return {
            providerId: currentProviderId,
            modelId: '',
            primaryModel: currentProviderId ? `${currentProviderId}/` : '',
        };
    }
    const explicitTarget = parsePrimaryModelRef(explicitModel);
    if (explicitTarget) {
        return explicitTarget;
    }
    const matchingProviders = Object.entries(options.availableProviders)
        .filter(([, config]) => config.models.some((model) => model.id === explicitModel))
        .map(([providerId]) => providerId);
    if (fallbackTarget && matchingProviders.includes(fallbackTarget.providerId)) {
        return {
            providerId: fallbackTarget.providerId,
            modelId: explicitModel,
            primaryModel: `${fallbackTarget.providerId}/${explicitModel}`,
        };
    }
    if (matchingProviders.length === 1) {
        return {
            providerId: matchingProviders[0],
            modelId: explicitModel,
            primaryModel: `${matchingProviders[0]}/${explicitModel}`,
        };
    }
    if (currentProviderId) {
        return {
            providerId: currentProviderId,
            modelId: explicitModel,
            primaryModel: `${currentProviderId}/${explicitModel}`,
        };
    }
    if (fallbackTarget) {
        return {
            providerId: fallbackTarget.providerId,
            modelId: explicitModel,
            primaryModel: `${fallbackTarget.providerId}/${explicitModel}`,
        };
    }
    return {
        providerId: '',
        modelId: explicitModel,
        primaryModel: explicitModel,
    };
}
function resolveQualifiedAgentModelRef(options) {
    const explicitModel = options.agentModel.trim();
    if (!explicitModel) {
        return { status: 'unresolved', modelId: '' };
    }
    const explicitTarget = parsePrimaryModelRef(explicitModel);
    if (explicitTarget) {
        const providerModels = options.availableProviders[explicitTarget.providerId]?.models ?? [];
        if (providerModels.some((model) => model.id === explicitTarget.modelId)) {
            return {
                status: 'qualified',
                primaryModel: explicitTarget.primaryModel,
            };
        }
        const migrationProviders = LegacyQualifiedProviderMigration[explicitTarget.providerId] ?? [];
        const matchingProviders = Object.entries(options.availableProviders)
            .filter(([providerId, config]) => (migrationProviders.includes(providerId)
            && config.models.some((model) => model.id === explicitTarget.modelId)))
            .map(([providerId]) => providerId);
        if (matchingProviders.length === 1) {
            return {
                status: 'qualified',
                primaryModel: `${matchingProviders[0]}/${explicitTarget.modelId}`,
            };
        }
        return {
            status: 'qualified',
            primaryModel: explicitTarget.primaryModel,
        };
    }
    const matchingProviders = Object.entries(options.availableProviders)
        .filter(([, config]) => config.models.some((model) => model.id === explicitModel))
        .map(([providerId]) => providerId);
    if (matchingProviders.length === 1) {
        return {
            status: 'qualified',
            primaryModel: `${matchingProviders[0]}/${explicitModel}`,
        };
    }
    if (matchingProviders.length > 1) {
        return {
            status: 'ambiguous',
            modelId: explicitModel,
            providerIds: matchingProviders,
        };
    }
    return {
        status: 'unresolved',
        modelId: explicitModel,
    };
}
/**
 * Resolve whether a run model reference belongs to lobsterai-server without
 * silently assigning a historical bare id to the wrong provider.
 *
 * The candidate callback is intentionally checked before accepting a custom
 * provider match. This keeps a stale bare package K3 id fail-closed while the
 * authenticated package catalog is still loading.
 */
function resolveServerModelRefForRun(options) {
    const modelRef = options.modelRef.trim();
    if (!modelRef) {
        return {
            status: exports.ServerModelRefResolutionStatus.Unresolved,
            modelId: '',
        };
    }
    const explicitTarget = parsePrimaryModelRef(modelRef);
    if (explicitTarget) {
        if (explicitTarget.providerId === constants_1.OpenClawProviderId.LobsteraiServer) {
            return {
                status: exports.ServerModelRefResolutionStatus.Server,
                modelId: explicitTarget.modelId,
                primaryModel: explicitTarget.primaryModel,
            };
        }
        return {
            status: exports.ServerModelRefResolutionStatus.NonServer,
            modelId: explicitTarget.modelId,
            providerIds: [explicitTarget.providerId],
        };
    }
    const matchingProviders = Object.entries(options.availableProviders)
        .filter(([, config]) => config.models.some(model => model.id === modelRef))
        .map(([providerId]) => providerId);
    const serverMatched = matchingProviders.includes(constants_1.OpenClawProviderId.LobsteraiServer);
    if (serverMatched && matchingProviders.length === 1) {
        return {
            status: exports.ServerModelRefResolutionStatus.Server,
            modelId: modelRef,
            primaryModel: `${constants_1.OpenClawProviderId.LobsteraiServer}/${modelRef}`,
        };
    }
    if (serverMatched) {
        return {
            status: exports.ServerModelRefResolutionStatus.Ambiguous,
            modelId: modelRef,
            providerIds: matchingProviders,
        };
    }
    if (options.isKnownServerModelCandidate?.(modelRef)) {
        return {
            status: exports.ServerModelRefResolutionStatus.RefreshRequired,
            modelId: modelRef,
        };
    }
    if (matchingProviders.length === 0) {
        return {
            status: exports.ServerModelRefResolutionStatus.Unresolved,
            modelId: modelRef,
        };
    }
    return {
        status: exports.ServerModelRefResolutionStatus.NonServer,
        modelId: modelRef,
        providerIds: matchingProviders,
    };
}
function buildAgentEntry(agent, fallbackPrimaryModel, options) {
    const qualified = options?.lockToDefault
        ? null
        : resolveQualifiedAgentModelRef({
            agentModel: agent.model,
            availableProviders: options?.availableProviders ?? {},
        });
    const primaryModel = qualified?.status === 'qualified' ? qualified.primaryModel : fallbackPrimaryModel;
    const legacyIcon = (0, avatar_1.isDesignedAgentAvatarIcon)(agent.icon) ? '' : agent.icon;
    const subagentConfig = buildSubagentConfig(agent);
    return {
        id: agent.id,
        ...(agent.isDefault ? { default: true } : {}),
        ...(agent.name ? { name: agent.name } : {}),
        ...(agent.name || legacyIcon ? {
            identity: {
                ...(agent.name ? { name: agent.name } : {}),
                ...(legacyIcon ? { emoji: legacyIcon } : {}),
            },
        } : {}),
        ...(agent.skillIds && agent.skillIds.length > 0 ? { skills: agent.skillIds } : {}),
        ...(subagentConfig ? { subagents: subagentConfig } : {}),
        ...(options?.workspace ? { workspace: options.workspace } : {}),
        ...(agent.workingDirectory?.trim() ? { cwd: node_path_1.default.resolve(agent.workingDirectory.trim()) } : {}),
        model: {
            primary: primaryModel,
        },
    };
}
function buildManagedAgentEntries({ agents, fallbackPrimaryModel, stateDir, availableProviders, lockToDefault, }) {
    return agents
        .filter((agent) => agent.id !== 'main' && agent.enabled)
        .map((agent) => buildAgentEntry(agent, fallbackPrimaryModel, stateDir
        ? { workspace: node_path_1.default.join(stateDir, `workspace-${agent.id}`), availableProviders, lockToDefault }
        : { availableProviders, lockToDefault }));
}
// Provider IDs that were renamed in past refactors. Any stored agent model ref
// using an old ID is rewritten to the current ID on startup.
const RENAMED_PROVIDER_IDS = {
    'github-copilot': 'lobsterai-copilot',
};
/**
 * Migrate unqualified or renamed agent model refs to fully-qualified form.
 * Returns the number of agents whose model binding was updated.
 */
function migrateAgentModelRefs(options) {
    const { defaultModelRef, availableProviders, agents, updateAgent } = options;
    if (!defaultModelRef)
        return 0;
    let changed = 0;
    for (const agent of agents) {
        let normalizedModel = agent.model.trim();
        if (!normalizedModel)
            continue;
        // Apply explicit provider rename map before qualification so that renamed
        // provider IDs (e.g. 'github-copilot' → 'lobsterai-copilot') are corrected
        // even though resolveQualifiedAgentModelRef treats any slash-ref as valid.
        const slashIdx = normalizedModel.indexOf('/');
        if (slashIdx > 0) {
            const storedProviderId = normalizedModel.slice(0, slashIdx);
            const renamedId = RENAMED_PROVIDER_IDS[storedProviderId];
            if (renamedId) {
                normalizedModel = `${renamedId}${normalizedModel.slice(slashIdx)}`;
            }
        }
        const qualification = resolveQualifiedAgentModelRef({
            agentModel: normalizedModel,
            availableProviders,
        });
        if (qualification.status === 'ambiguous') {
            console.warn(`[Main] Skipped ambiguous agent model migration for "${agent.id}" because "${qualification.modelId}" matches multiple providers: ${qualification.providerIds.join(', ')}`);
            continue;
        }
        if (qualification.status !== 'qualified' || qualification.primaryModel === agent.model.trim()) {
            continue;
        }
        updateAgent(agent.id, { model: qualification.primaryModel });
        changed += 1;
    }
    return changed;
}
//# sourceMappingURL=openclawAgentModels.js.map