"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsChannel = exports.EXEC_POLICY_KEY = exports.DEFAULT_EXEC_POLICY = exports.ExecPolicy = void 0;
exports.enginePolicyFor = enginePolicyFor;
exports.engineExecModeFor = engineExecModeFor;
exports.asExecPolicy = asExecPolicy;
/**
 * How much the agent may do on this computer without asking.
 *
 * This is the most important setting in the product and until now it did
 * not exist, which would be a small thing except that upstream pinned it
 * to the most permissive value and wrote a comment saying so:
 *
 *     // Ensure exec-approvals.json has security=full + ask=off so the
 *     // gateway never triggers approval-pending for any command.
 *
 * That ran on every config sync. `bash-tools.exec.ts` in the engine
 * treats `security: "full"` with `ask: "off"` as a full bypass, so the
 * approval card the design is built around — "Allow Perrin to run
 * commands on your local computer?" — could not fire. Not because the
 * listener was missing, which was a separate bug and is fixed; because
 * the engine had been told never to ask.
 *
 * `direction.md`, from the founder: *every action on the computer asks
 * first*. So the default here is `Ask`, and the value is a person's to
 * change.
 *
 * The three values map onto the engine's own exec modes
 * (`infra/exec-approvals.ts`, `resolveExecPolicyForMode`) — this is not a
 * parallel vocabulary, it is the engine's, named the way the settings
 * screen says it:
 *
 * | here | engine mode | security | ask | autoReview |
 * |---|---|---|---|---|
 * | `Ask`   | `ask`  | allowlist | on-miss | false |
 * | `Auto`  | `auto` | allowlist | on-miss | true  |
 * | `Allow` | `full` | full      | off     | false |
 */
exports.ExecPolicy = {
    /** Ask before anything that is not already allowed. The default. */
    Ask: 'ask',
    /** The same, but the agent reviews its own action first. */
    Auto: 'auto',
    /** Never ask. What upstream forced, now a choice. */
    Allow: 'allow',
};
exports.DEFAULT_EXEC_POLICY = exports.ExecPolicy.Ask;
/** Where the choice is kept, in the app-wide `kv` table. */
exports.EXEC_POLICY_KEY = 'exec_policy';
/**
 * What to write into `exec-approvals.json` for a policy.
 *
 * Kept here rather than in the sync so both processes and the tests read
 * one table. The engine derives the same three from its `ExecMode`; if it
 * ever changes them, this is the single place that has to follow.
 */
function enginePolicyFor(policy) {
    switch (policy) {
        case exports.ExecPolicy.Allow:
            return { security: 'full', ask: 'off', autoReview: false };
        case exports.ExecPolicy.Auto:
            return { security: 'allowlist', ask: 'on-miss', autoReview: true };
        case exports.ExecPolicy.Ask:
        default:
            return { security: 'allowlist', ask: 'on-miss', autoReview: false };
    }
}
/**
 * The engine's `tools.exec.mode` for a policy.
 *
 * The approvals file above carries security and ask; review is switched
 * on only by this mode (`bash-tools.exec.ts`, `resolveExecModePolicy`),
 * which until 17 September the app never wrote, so "Check, then ask"
 * asked every time and reviewed nothing. In `auto` the engine's own
 * reviewer runs first: the quick rules let everyday commands through and
 * name the risky ones, the model judges the rest, and only what those
 * flag reaches the person, with the reason on the card.
 */
function engineExecModeFor(policy) {
    switch (policy) {
        case exports.ExecPolicy.Allow:
            return 'full';
        case exports.ExecPolicy.Auto:
            return 'auto';
        case exports.ExecPolicy.Ask:
        default:
            return 'ask';
    }
}
/** Anything else that reaches this — an older build, a hand-edit — is `Ask`. */
function asExecPolicy(value) {
    return value === exports.ExecPolicy.Allow || value === exports.ExecPolicy.Auto || value === exports.ExecPolicy.Ask
        ? value
        : exports.DEFAULT_EXEC_POLICY;
}
/** The IPC channels behind the settings screen. */
exports.SettingsChannel = {
    GetExecPolicy: 'settings:getExecPolicy',
    SetExecPolicy: 'settings:setExecPolicy',
};
//# sourceMappingURL=constants.js.map