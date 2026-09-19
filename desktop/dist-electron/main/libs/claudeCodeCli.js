"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.claudeCliModelRef = exports.CLAUDE_CODE_MODELS = exports.CLAUDE_CODE_FAST_MODEL = exports.CLAUDE_CODE_STRONG_MODEL = exports.CLAUDE_CLI_PROVIDER = exports.CLAUDE_CLI_ENV = void 0;
exports.claudeCliCandidates = claudeCliCandidates;
exports.findClaudeCli = findClaudeCli;
exports.lookupClaudeOnPath = lookupClaudeOnPath;
exports.resolveClaudeCli = resolveClaudeCli;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
/**
 * Where the Claude Code command lives on this computer, and which models
 * it is asked for.
 *
 * The engine can run a turn through the installed Claude Code app
 * instead of calling a model API itself (`agents.defaults.model.primary
 * = "claude-cli/<model>"`; the engine's own planner does exactly this).
 * It defaults the command to `claude`, which is fine from a terminal and
 * wrong from a macOS app: a GUI process starts with a bare PATH and
 * never sees Homebrew or the user's npm prefix. So the app finds the
 * binary itself and hands the engine the absolute path.
 *
 * The order: an override (`CAISRA_CLAUDE_CLI`), then `which`, then the
 * places Claude Code's own installers put it. Pure list, injectable
 * existence check, so it is tested without a filesystem.
 *
 * Whether the mechanic is on at all is `claudeCodeMode.ts`.
 */
exports.CLAUDE_CLI_ENV = 'CAISRA_CLAUDE_CLI';
/** The engine's provider id for "run this through the Claude Code CLI". */
exports.CLAUDE_CLI_PROVIDER = 'claude-cli';
/**
 * The model a job runs on. Opus: Caisra is an agent holding a strict
 * contract, and the founder wants the product judged on the model that
 * holds it.
 */
exports.CLAUDE_CODE_STRONG_MODEL = 'claude-opus-5';
/** The model a plain question runs on; see `turnRouting.ts`. */
exports.CLAUDE_CODE_FAST_MODEL = 'claude-sonnet-5';
/** Every model a turn may be routed to; the engine is told to allow each. */
exports.CLAUDE_CODE_MODELS = [exports.CLAUDE_CODE_STRONG_MODEL, exports.CLAUDE_CODE_FAST_MODEL];
const claudeCliModelRef = (model) => `${exports.CLAUDE_CLI_PROVIDER}/${model}`;
exports.claudeCliModelRef = claudeCliModelRef;
function claudeCliCandidates(options) {
    const exe = options.platform === 'win32' ? 'claude.exe' : 'claude';
    const home = options.home;
    const override = options.env[exports.CLAUDE_CLI_ENV]?.trim();
    const fromLookup = (options.lookup ?? []).map(one => one.trim()).filter(Boolean);
    const usual = options.platform === 'win32'
        ? [
            path_1.default.join(home, '.claude', 'local', exe),
            path_1.default.join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
            path_1.default.join(home, 'AppData', 'Roaming', 'npm', exe),
        ]
        : [
            path_1.default.join(home, '.claude', 'local', 'claude'),
            '/opt/homebrew/bin/claude',
            '/usr/local/bin/claude',
            path_1.default.join(home, '.npm-global', 'bin', 'claude'),
            path_1.default.join(home, '.local', 'bin', 'claude'),
            path_1.default.join(home, '.volta', 'bin', 'claude'),
            path_1.default.join(home, '.bun', 'bin', 'claude'),
        ];
    const seen = new Set();
    const out = [];
    for (const candidate of [...(override ? [override] : []), ...fromLookup, ...usual]) {
        if (!seen.has(candidate)) {
            seen.add(candidate);
            out.push(candidate);
        }
    }
    return out;
}
/** The first candidate that exists, or null. */
function findClaudeCli(candidates, exists = file => {
    try {
        return fs_1.default.statSync(file).isFile();
    }
    catch {
        return false;
    }
}) {
    return candidates.find(exists) ?? null;
}
/** `which claude`, from this process's PATH plus the usual macOS additions. */
function lookupClaudeOnPath(env = process.env) {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    const extra = process.platform === 'win32' ? [] : ['/opt/homebrew/bin', '/usr/local/bin', path_1.default.join(os_1.default.homedir(), '.local', 'bin')];
    const PATH = [env.PATH ?? '', ...extra].filter(Boolean).join(path_1.default.delimiter);
    try {
        const result = (0, child_process_1.spawnSync)(checker, ['claude'], { encoding: 'utf8', env: { ...env, PATH }, timeout: 5_000, windowsHide: true });
        if (result.status !== 0 || !result.stdout)
            return [];
        return result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    }
    catch {
        return [];
    }
}
/** Everything above in one call. */
function resolveClaudeCli(env = process.env) {
    return findClaudeCli(claudeCliCandidates({
        home: os_1.default.homedir(), platform: process.platform, env, lookup: lookupClaudeOnPath(env),
    }));
}
//# sourceMappingURL=claudeCodeCli.js.map