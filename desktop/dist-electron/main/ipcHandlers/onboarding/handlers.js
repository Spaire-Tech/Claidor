"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerOnboardingIpcHandlers = registerOnboardingIpcHandlers;
const electron_1 = require("electron");
const constants_1 = require("../../../shared/onboarding/constants");
const macTasks_1 = require("../../onboarding/macTasks");
/**
 * The bridge for the first step of onboarding. Three calls: what this
 * computer can do, do the one thing the person allowed, open what came
 * of it. Everything that decides anything is in `onboarding/macTasks.ts`.
 */
const isTask = (value) => (typeof value === 'string' && Object.values(constants_1.OnboardingTask).includes(value));
function registerOnboardingIpcHandlers(deps = {}) {
    electron_1.ipcMain.handle(constants_1.OnboardingIpc.Status, async () => (0, macTasks_1.onboardingStatus)(deps));
    electron_1.ipcMain.handle(constants_1.OnboardingIpc.RunTask, async (_event, task) => {
        if (!isTask(task))
            return { ok: false, task: constants_1.OnboardingTask.Notes, reason: 'No such task.' };
        return (0, macTasks_1.runOnboardingTask)(task, deps);
    });
    electron_1.ipcMain.handle(constants_1.OnboardingIpc.OpenResult, async (_event, task, ref) => {
        if (!isTask(task))
            return;
        try {
            await (0, macTasks_1.openOnboardingResult)(task, typeof ref === 'string' ? ref : '', deps);
        }
        catch (error) {
            console.warn('[Onboarding] open result failed:', error instanceof Error ? error.message : error);
        }
    });
}
//# sourceMappingURL=handlers.js.map