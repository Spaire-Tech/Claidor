"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkinWorkflowRegistry = void 0;
const constants_1 = require("../../shared/skin/constants");
const kit_1 = require("../../shared/skin/kit");
const mediaGenerationPolicy_1 = require("../mediaGenerationPolicy");
const MAX_PARENT_DEPTH = 16;
class SkinWorkflowRegistry {
    options;
    states = new Map();
    constructor(options) {
        this.options = options;
    }
    prepareTurn(input) {
        const requestedWorkflowKind = this.resolveTrustedWorkflowKind(input.kitIds);
        const workflowKind = requestedWorkflowKind
            ?? this.resolve(input.sessionId)?.state.workflowKind;
        if (!workflowKind) {
            return { mediaSelection: input.mediaSelection };
        }
        if (requestedWorkflowKind) {
            const existing = this.states.get(input.sessionId);
            if (!existing || existing.workflowKind !== workflowKind) {
                this.states.set(input.sessionId, { workflowKind });
            }
        }
        if (!input.mediaGenerationEntitled) {
            return { workflowKind };
        }
        const selectedImageModelId = input.mediaSelection?.imageModelId
            ?? (input.mediaSelection?.mode === mediaGenerationPolicy_1.MediaSelectionMode.Image
                ? input.mediaSelection.modelId
                : undefined);
        return {
            workflowKind,
            mediaSelection: {
                mode: mediaGenerationPolicy_1.MediaSelectionMode.Image,
                ...(selectedImageModelId ? { imageModelId: selectedImageModelId } : {}),
                ...(input.mediaSelection?.modelName
                    ? { modelName: input.mediaSelection.modelName }
                    : {}),
            },
        };
    }
    resolve(sessionId) {
        let current = sessionId?.trim() || null;
        const seen = new Set();
        for (let depth = 0; current && depth < MAX_PARENT_DEPTH; depth += 1) {
            if (seen.has(current))
                return undefined;
            seen.add(current);
            const state = this.states.get(current);
            if (state) {
                return {
                    ownerSessionId: current,
                    state,
                };
            }
            try {
                current = this.options.getParentSessionId(current);
            }
            catch (error) {
                console.warn('[SkinWorkflow] failed to resolve parent workflow state:', error);
                return undefined;
            }
        }
        return undefined;
    }
    recordDraft(sessionId, skinId) {
        const resolved = this.resolve(sessionId);
        if (resolved)
            resolved.state.draftSkinId = skinId;
    }
    finishWorkflow(sessionId) {
        const resolved = this.resolve(sessionId);
        if (resolved)
            this.states.delete(resolved.ownerSessionId);
    }
    handleRuntimeComplete(_sessionId) {
        // Native image_generate finishes through a background wake after the
        // runtime emits complete. Keep the transaction until apply/deactivate,
        // an error, or session deletion. Follow-up turns may omit the Kit after
        // the renderer clears its one-turn capability selection.
    }
    handleRuntimeError(sessionId) {
        this.states.delete(sessionId);
    }
    handleSessionDeleted(sessionId) {
        this.states.delete(sessionId);
    }
    resolveTrustedWorkflowKind(kitIds) {
        if (!kitIds?.includes(kit_1.SkinPackKitId.BuiltIn))
            return undefined;
        const installedKit = this.options.getInstalledKits()[kit_1.SkinPackKitId.BuiltIn];
        return installedKit?.workflowKind === constants_1.SkinWorkflowKind.SkinPack
            ? constants_1.SkinWorkflowKind.SkinPack
            : undefined;
    }
}
exports.SkinWorkflowRegistry = SkinWorkflowRegistry;
//# sourceMappingURL=skinWorkflowRegistry.js.map