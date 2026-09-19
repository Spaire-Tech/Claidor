"use strict";
/**
 * The first step of onboarding: Yodo, the Chief of Staff, meets the person.
 *
 * From the founder's canvas of 16 September 2026
 * (`docs/product/design/canvas-2026-09-16-onboarding.html`; the design's
 * own source is beside it as `-template.html`). The founder: *"the final
 * goal is to have the chief of staff create the first agents for the
 * user. i'll figure out the rest later. for now after get started it
 * should take them to the chat."*
 *
 * What is here is what the main process and the renderer must agree on:
 * the IPC channels, the three tasks, and what a task run answers with.
 * The script itself, and how it streams, is `script.ts`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ONBOARDING_LOGOS = exports.RIDDLE = exports.Appearance = exports.OnboardingTask = exports.OnboardingIpc = void 0;
exports.OnboardingIpc = {
    /** Platform, current appearance, which tasks can run here. */
    Status: 'onboarding:status',
    /** Do the thing the person allowed. Answers with a result card or a reason. */
    RunTask: 'onboarding:runTask',
    /** The result card's button: open the note, open the setting. */
    OpenResult: 'onboarding:openResult',
};
/** The three cards, in the canvas's order. */
exports.OnboardingTask = {
    /** Leave a riddle in Apple Notes. */
    Notes: 'notes',
    /** Switch the Mac's appearance. */
    Appearance: 'appearance',
    /** Text a pep talk for tomorrow morning. Not available yet. */
    Messages: 'messages',
};
exports.Appearance = {
    Light: 'light',
    Dark: 'dark',
};
/**
 * The one riddle. The founder: *"if its a riddle, have one ready. no
 * generate new one, lets just have one that we save."* It goes into a
 * note titled `RIDDLE.title`, answer at the bottom.
 */
exports.RIDDLE = {
    title: 'A riddle from Yodo',
    question: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?',
    answer: 'An echo.',
};
/** Where the app's logos live, for the cards. */
exports.ONBOARDING_LOGOS = {
    [exports.OnboardingTask.Notes]: 'apple-notes.webp',
    [exports.OnboardingTask.Appearance]: 'macos-settings.webp',
    [exports.OnboardingTask.Messages]: 'imessage.webp',
};
//# sourceMappingURL=constants.js.map