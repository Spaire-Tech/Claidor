"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePluginSkillIdsFromReport = updatePluginSkillIdsFromReport;
const path_1 = __importDefault(require("path"));
/**
 * Extract plugin-provided skill IDs from an OpenClaw status report
 * and update the SkillManager's cached set.
 *
 * Skills whose baseDir resides inside the LobsterAI user SKILLs directory
 * are excluded — those are user-installed (e.g. from the skill marketplace)
 * and should remain deletable.
 */
function updatePluginSkillIdsFromReport(sm, report) {
    const pluginIds = new Set();
    const skillsRoot = path_1.default.resolve(sm.getSkillsRoot());
    for (const entry of report.skills ?? []) {
        if (entry.source === 'openclaw-extra') {
            // Skip skills inside the LobsterAI user SKILLs directory —
            // these are user-installed marketplace skills, not plugin-provided.
            if (entry.baseDir) {
                const resolved = path_1.default.resolve(entry.baseDir);
                if (resolved.startsWith(skillsRoot + path_1.default.sep) || resolved === skillsRoot) {
                    continue;
                }
            }
            const id = entry.skillKey || (entry.baseDir ? path_1.default.basename(entry.baseDir) : '');
            if (id)
                pluginIds.add(id);
        }
    }
    sm.setPluginSkillIds(pluginIds);
}
//# sourceMappingURL=openClawSync.js.map