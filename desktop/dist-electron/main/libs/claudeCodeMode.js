"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLAUDE_CODE_ENV = void 0;
exports.decideClaudeCodeMode = decideClaudeCodeMode;
exports.claudeCodeMode = claudeCodeMode;
const electron_1 = require("electron");
const claudeCodeCli_1 = require("./claudeCodeCli");
/**
 * Whether this app runs its turns through the Claude Code app on this
 * computer instead of a model API.
 *
 * **Off, since 17 September 2026.** Every build, development or
 * packaged, runs on the account's model through the metered proxy. The
 * founder, after three evenings on the other path: *"i want out of the
 * model. bring me back to my old open ai model - the one before we
 * switch to claude code, the api … claude code is a coding assistant.
 * nothing to do with any of this."* The last straw was its permission
 * protocol changing under us: the allow reply this engine sends was
 * accepted by one Claude Code version and refused by the next, with a
 * schema error in the person's thread and no file written (review item
 * 66). A coding CLI's stdio contract is not a model API, and the app
 * should not depend on it.
 *
 * The mechanic stays in the tree, off. `CAISRA_CLAUDE_CODE=1` is the
 * one way to turn it on, for a developer at a terminal; there is no
 * screen and no build that does it by itself. Whichever way it goes is
 * logged once at `[ClaudeCode]`.
 *
 * Nothing here reads or copies Claude Code's credentials. The engine
 * spawns the installed `claude` command and Claude Code signs itself in.
 */
exports.CLAUDE_CODE_ENV = 'CAISRA_CLAUDE_CODE';
const isOn = (value) => ['1', 'true', 'on', 'yes'].includes(value);
const isOff = (value) => ['0', 'false', 'off', 'no'].includes(value);
/** Pure, so the rule is tested without Electron or a filesystem. */
function decideClaudeCodeMode(input) {
    const flag = input.env[exports.CLAUDE_CODE_ENV]?.trim().toLowerCase() ?? '';
    if (isOff(flag)) {
        return { enabled: false, command: input.command, reason: `${exports.CLAUDE_CODE_ENV}=${flag}` };
    }
    if (isOn(flag)) {
        return {
            enabled: true,
            command: input.command,
            reason: input.command
                ? `${exports.CLAUDE_CODE_ENV}=${flag}, claude at ${input.command}`
                : `${exports.CLAUDE_CODE_ENV}=${flag}, but no claude command was found; the engine will try a bare \`claude\``,
        };
    }
    return {
        enabled: false,
        command: input.command,
        reason: `the account's model through the proxy carries every ${input.packaged ? 'packaged' : 'development'} build; ${exports.CLAUDE_CODE_ENV}=1 is the only way on`,
    };
}
let decided;
/** The decision for this process, made on first ask and logged once. */
function claudeCodeMode() {
    if (!decided) {
        decided = decideClaudeCodeMode({
            env: process.env,
            packaged: electron_1.app.isPackaged,
            command: (0, claudeCodeCli_1.resolveClaudeCli)(),
        });
        console.log(`[ClaudeCode] ${decided.enabled ? 'on' : 'off'}: ${decided.reason}`);
    }
    return decided;
}
//# sourceMappingURL=claudeCodeMode.js.map