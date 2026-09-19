"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLI_TIMEOUT_MS = void 0;
exports.runOpenClawCli = runOpenClawCli;
const node_child_process_1 = require("node:child_process");
/** Nothing here should take minutes. A hang is a failure, not patience. */
exports.CLI_TIMEOUT_MS = 60_000;
function runOpenClawCli(environment, args, timeoutMs = exports.CLI_TIMEOUT_MS) {
    return new Promise(resolve => {
        const child = (0, node_child_process_1.spawn)(process.execPath, [environment.entry, ...args], {
            cwd: environment.runtimeRoot,
            env: {
                ...process.env,
                // The state dir is the whole point: it is where the engine keeps
                // the OAuth tokens, so a command run against a different one
                // would sign somebody into nothing.
                OPENCLAW_HOME: environment.baseDir,
                OPENCLAW_STATE_DIR: environment.stateDir,
                OPENCLAW_CONFIG_PATH: environment.configPath,
                OPENCLAW_NO_RESPAWN: '1',
                ELECTRON_RUN_AS_NODE: '1',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        let output = '';
        const take = (chunk) => { output += chunk.toString('utf8'); };
        child.stdout?.on('data', take);
        child.stderr?.on('data', take);
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            output += '\nThe engine did not answer in time.';
        }, timeoutMs);
        child.once('error', error => {
            clearTimeout(timer);
            resolve({ code: null, output: `${output}\n${error.message}`.trim() });
        });
        child.once('close', code => {
            clearTimeout(timer);
            resolve({ code, output });
        });
    });
}
//# sourceMappingURL=openclawCli.js.map