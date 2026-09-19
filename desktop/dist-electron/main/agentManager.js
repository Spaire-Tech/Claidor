"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentManager = void 0;
const presetAgents_1 = require("./presetAgents");
/**
 * AgentManager handles CRUD operations for agents and preset agent installation.
 * Agents are stored in the SQLite `agents` table via CoworkStore.
 */
class AgentManager {
    store;
    constructor(store) {
        this.store = store;
    }
    listAgents() {
        return this.store.listAgents();
    }
    getAgent(agentId) {
        return this.store.getAgent(agentId);
    }
    getDefaultAgent() {
        const agents = this.store.listAgents();
        return agents.find(a => a.isDefault) || agents[0];
    }
    createAgent(request, defaultModel) {
        return this.store.createAgent({
            ...request,
            model: request.model?.trim() || defaultModel?.trim() || '',
            workingDirectory: request.workingDirectory?.trim() || '',
        });
    }
    updateAgent(agentId, updates) {
        return this.store.updateAgent(agentId, {
            ...updates,
            ...(updates.workingDirectory !== undefined
                ? { workingDirectory: updates.workingDirectory.trim() }
                : {}),
        });
    }
    reorderAgents(agentIds) {
        return this.store.reorderAgents(agentIds);
    }
    deleteAgent(agentId) {
        return this.store.deleteAgent(agentId);
    }
    // --- Preset agents ---
    getPresetAgents() {
        const existingAgents = this.store.listAgents();
        const existingPresetIds = new Set(existingAgents.filter(a => a.source === 'preset').map(a => a.presetId));
        // Only return presets that haven't been added yet
        return presetAgents_1.PRESET_AGENTS.filter(p => !existingPresetIds.has(p.id));
    }
    getAllPresetAgents() {
        return presetAgents_1.PRESET_AGENTS;
    }
    addPresetAgent(presetId, defaultModel) {
        const preset = presetAgents_1.PRESET_AGENTS.find(p => p.id === presetId);
        if (!preset)
            return null;
        // Check if already installed
        const existing = this.store.getAgent(preset.id);
        if (existing)
            return existing;
        return this.store.createAgent({
            ...(0, presetAgents_1.presetToCreateRequest)(preset),
            model: defaultModel?.trim() || '',
            workingDirectory: '',
        });
    }
}
exports.AgentManager = AgentManager;
//# sourceMappingURL=agentManager.js.map