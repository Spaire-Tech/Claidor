"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDshProcessLaunch = buildDshProcessLaunch;
exports.spawnDshProcess = spawnDshProcess;
const child_process_1 = require("child_process");
const dshRuntime_1 = require("./dshRuntime");
// dsh's Cordis loader needs --expose-internals. Electron strips that switch
// from packaged utility processes, so every platform launches the Electron
// executable in its documented Node mode instead.
function buildDshProcessLaunch(options, platform = process.platform) {
    return {
        command: options.executablePath,
        args: [...dshRuntime_1.DSH_NODE_EXEC_ARGV, ...options.args],
        options: {
            cwd: options.cwd,
            env: { ...options.env, ELECTRON_RUN_AS_NODE: '1' },
            stdio: ['ignore', 'pipe', 'pipe'],
            ...(platform === 'win32' ? { windowsHide: true } : {}),
        },
    };
}
function spawnDshProcess(options) {
    const launch = buildDshProcessLaunch(options);
    return (0, child_process_1.spawn)(launch.command, launch.args, launch.options);
}
//# sourceMappingURL=dshProcessLauncher.js.map