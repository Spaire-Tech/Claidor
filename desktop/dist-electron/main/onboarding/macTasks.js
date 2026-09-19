"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAppleScript = exports.APPEARANCE_SETTINGS_URL = exports.escapeAppleScript = void 0;
exports.riddleNoteScript = riddleNoteScript;
exports.showNoteScript = showNoteScript;
exports.appearanceScript = appearanceScript;
exports.explainFailure = explainFailure;
exports.currentAppearance = currentAppearance;
exports.availableTasks = availableTasks;
exports.onboardingStatus = onboardingStatus;
exports.runOnboardingTask = runOnboardingTask;
exports.openOnboardingResult = openOnboardingResult;
const child_process_1 = require("child_process");
const electron_1 = require("electron");
const constants_1 = require("../../shared/onboarding/constants");
/**
 * The three small things Yodo does on the Mac during onboarding, and
 * the truth about what this computer can do.
 *
 * Each task is one AppleScript through `osascript`, which is how a Mac
 * app talks to another app. macOS asks the person once, in its own
 * dialog, whether Caisra may control Notes or System Events; that comes
 * after our own "Allow access" card, not instead of it. If they say no
 * to macOS, `osascript` fails with -1743 and the person is told where to
 * turn it on.
 *
 * The founder: *"the permission must come and the thing should actually
 * do the work. if its a riddle, have one ready … message needs iMessage,
 * that one is a bit complex … we'll make it unavailable until we figure
 * it out. settings is straightforward. the ai tho has to be smart enough
 * to see if the mac is in light or dark mode currently."*
 *
 * The scripts are built by pure functions so a test can read them; the
 * runner is injectable so nothing here needs a Mac to be tested.
 */
/** macOS: "Not authorized to send Apple events to <app>." */
const NOT_AUTHORIZED = /-1743|not authori[sz]ed to send apple events/i;
const escapeAppleScript = (text) => (text.replace(/\\/g, '\\\\').replace(/"/g, '\\"'));
exports.escapeAppleScript = escapeAppleScript;
const escapeHtml = (text) => (text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
/** The note, as Notes takes it: a name and an HTML body. Answers with the note's id. */
function riddleNoteScript() {
    const body = [
        `<div>${escapeHtml(constants_1.RIDDLE.question)}</div>`,
        '<div><br></div>',
        '<div>— Yodo</div>',
        '<div><br></div>',
        '<div><br></div>',
        '<div><br></div>',
        `<div>Answer: ${escapeHtml(constants_1.RIDDLE.answer)}</div>`,
    ].join('');
    return [
        'tell application "Notes"',
        `  set theNote to make new note at folder "Notes" of default account with properties {name:"${(0, exports.escapeAppleScript)(constants_1.RIDDLE.title)}", body:"${(0, exports.escapeAppleScript)(body)}"}`,
        '  return id of theNote',
        'end tell',
    ].join('\n');
}
/** Show one note by id, front and centre. */
function showNoteScript(noteId) {
    return [
        'tell application "Notes"',
        '  activate',
        `  show note id "${(0, exports.escapeAppleScript)(noteId)}"`,
        'end tell',
    ].join('\n');
}
/** Flip the Mac's appearance. System Events owns that switch. */
function appearanceScript(dark) {
    return [
        'tell application "System Events"',
        '  tell appearance preferences',
        `    set dark mode to ${dark ? 'true' : 'false'}`,
        '  end tell',
        'end tell',
    ].join('\n');
}
/** The Appearance pane of System Settings, by its URL scheme. */
exports.APPEARANCE_SETTINGS_URL = 'x-apple.systempreferences:com.apple.Appearance-Settings.extension';
/** `osascript`, one script, its stdout. */
const runAppleScript = script => new Promise((resolve, reject) => {
    (0, child_process_1.execFile)('osascript', ['-e', script], { timeout: 20_000 }, (error, stdout, stderr) => {
        if (error) {
            const message = (stderr || error.message || '').trim();
            reject(new Error(message || 'osascript failed'));
            return;
        }
        resolve(String(stdout).trim());
    });
});
exports.runAppleScript = runAppleScript;
/** What the person is told when a script does not go through. */
function explainFailure(app, error) {
    const message = error instanceof Error ? error.message : String(error);
    if (NOT_AUTHORIZED.test(message)) {
        return `macOS did not let Caisra control ${app}. You can allow it in System Settings → Privacy & Security → Automation.`;
    }
    return message.replace(/^\d+:\d+:\s*execution error:\s*/i, '').trim() || `${app} did not answer.`;
}
function currentAppearance(isDark = () => electron_1.nativeTheme.shouldUseDarkColors) {
    return isDark() ? constants_1.Appearance.Dark : constants_1.Appearance.Light;
}
/** Which tasks this computer can do. Messages is not one of them yet. */
function availableTasks(platform) {
    if (platform !== 'darwin')
        return [];
    return [constants_1.OnboardingTask.Notes, constants_1.OnboardingTask.Appearance];
}
function onboardingStatus(deps = {}) {
    const platform = deps.platform ?? process.platform;
    return {
        platform,
        appearance: currentAppearance(deps.isDark),
        available: availableTasks(platform),
    };
}
/**
 * Do the task. The result's `ref` is what `openResult` needs later: the
 * note's id, or the appearance that was set.
 */
async function runOnboardingTask(task, deps = {}) {
    const platform = deps.platform ?? process.platform;
    const run = deps.run ?? exports.runAppleScript;
    if (!availableTasks(platform).includes(task)) {
        return { ok: false, task, reason: task === constants_1.OnboardingTask.Messages ? 'Messages is not wired up yet.' : 'This only works on a Mac.' };
    }
    try {
        if (task === constants_1.OnboardingTask.Notes) {
            const noteId = await run(riddleNoteScript());
            console.log(`[Onboarding] riddle left in Notes (${noteId || 'no id returned'})`);
            return { ok: true, task, ref: noteId };
        }
        const toDark = currentAppearance(deps.isDark) !== constants_1.Appearance.Dark;
        await run(appearanceScript(toDark));
        console.log(`[Onboarding] appearance set to ${toDark ? 'dark' : 'light'}`);
        return { ok: true, task, ref: toDark ? constants_1.Appearance.Dark : constants_1.Appearance.Light };
    }
    catch (error) {
        const reason = explainFailure(task === constants_1.OnboardingTask.Notes ? 'Notes' : 'System Settings', error);
        console.warn(`[Onboarding] ${task} failed: ${reason}`);
        return { ok: false, task, reason };
    }
}
/** The result card's button. */
async function openOnboardingResult(task, ref, deps = {}) {
    const run = deps.run ?? exports.runAppleScript;
    const openExternal = deps.openExternal ?? (url => electron_1.shell.openExternal(url));
    if (task === constants_1.OnboardingTask.Notes) {
        if (ref) {
            await run(showNoteScript(ref));
        }
        else {
            await run('tell application "Notes" to activate');
        }
        return;
    }
    if (task === constants_1.OnboardingTask.Appearance) {
        await openExternal(exports.APPEARANCE_SETTINGS_URL);
    }
}
//# sourceMappingURL=macTasks.js.map