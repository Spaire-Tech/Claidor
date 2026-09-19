"use strict";
// Manages the bundled DeepSeek Harness (dsh) runtime as a child process:
// resolve the vendored runtime, spawn `web` on a loopback port, poll for
// readiness, and stop it with the app. The runtime always uses Electron's
// Node mode because its Cordis plugin loader needs a Node switch that packaged
// Electron utility processes filter out.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DshEngineManager = void 0;
exports.getDshEngineManager = getDshEngineManager;
const electron_1 = require("electron");
const fs = __importStar(require("fs"));
const http = __importStar(require("http"));
const net = __importStar(require("net"));
const path = __importStar(require("path"));
const constants_1 = require("../../shared/dshEngine/constants");
const dshConfigSync_1 = require("./dshConfigSync");
const dshProcessLauncher_1 = require("./dshProcessLauncher");
const dshRuntime_1 = require("./dshRuntime");
const dshRuntimeInstaller_1 = require("./dshRuntimeInstaller");
let dshPackageMetaCache = null;
function readDshPackageMeta() {
    if (dshPackageMetaCache)
        return dshPackageMetaCache;
    let meta = {};
    try {
        const raw = fs.readFileSync(path.join(electron_1.app.getAppPath(), 'package.json'), 'utf8');
        meta = JSON.parse(raw).dsh ?? {};
    }
    catch (error) {
        console.warn('[DSH] Could not read the pinned runtime metadata from package.json', error);
    }
    dshPackageMetaCache = meta;
    return meta;
}
function resolveHostDshTargetId() {
    if (process.platform === 'darwin')
        return process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
    if (process.platform === 'win32')
        return 'win-x64';
    return 'linux-x64';
}
function resolvePinnedDshRuntimeIdentity() {
    const meta = readDshPackageMeta();
    const version = meta.version?.trim();
    if (!version)
        return null;
    const target = resolveHostDshTargetId();
    const artifact = (0, dshRuntimeInstaller_1.resolveDshArtifactFromConfig)(meta.runtimes ?? null, target, version);
    return { version, target, sha256: artifact?.sha256 };
}
// A first start on Windows pays for the whole runtime tree being read (and
// virus-scanned) once: measured 74s cold on a Win11 dev box against 2.5s warm.
// A 60s budget turned that into a spurious "engine failed to start" that a
// second click then fixed, so the cap is for a wedged child, not a slow one —
// a child that dies is caught by the liveness check, not by this.
const READY_TIMEOUT_MS = 180_000;
const READY_POLL_INTERVAL_MS = 250;
// dsh starts listening before its plugin tree finishes loading, so a boot
// failure answers the first probe with 200 and exits ~50ms later. Ready on that
// first 200 opens the workbench onto a dead port: a blank window whose only
// symptom is ERR_CONNECTION_REFUSED in its devtools. Re-probe after this settle
// so a runtime that dies during boot is reported as a failure instead.
const READY_SETTLE_MS = 750;
const READY_PROGRESS_LOG_INTERVAL_MS = 15_000;
const STOP_GRACE_MS = 5_000;
const LOG_RING_MAX_LINES = 400;
class DshEngineManager {
    child = null;
    generation = 0;
    state = {
        phase: constants_1.DshEnginePhase.Stopped,
        port: null,
        version: null,
        errorCode: null,
        sessionStoreShared: true,
        install: null,
    };
    logRing = [];
    listeners = new Set();
    quitHookInstalled = false;
    startPromise = null;
    managedSettingsSource = null;
    workingDirectorySource = null;
    sharedHomeLock = null;
    homeDirectorySource = null;
    // DSH_HOME for the child. The kit points this at the machine's dsh home so
    // plugins, credentials, and presets match a standalone install; returning
    // null falls back to our private home (used when another writer holds it).
    setHomeDirectorySource(source) {
        this.homeDirectorySource = source;
    }
    // Claimed just before the child spawns and released when it stops, so a
    // second LobsterAI instance can see that the shared session store is taken.
    setSharedHomeLock(lock) {
        this.sharedHomeLock = lock;
        this.setState({ sessionStoreShared: lock !== null });
    }
    // The child's cwd becomes the workbench's default session directory and the
    // root for project-level skills. Left at the runtime install directory it
    // would put new sessions outside every workspace and point a
    // workspace-write agent at our own vendored runtime.
    setWorkingDirectorySource(source) {
        this.workingDirectorySource = source;
    }
    resolveWorkingDirectory(fallback) {
        return (0, dshRuntime_1.resolveDshWorkingDirectory)([this.workingDirectorySource?.(), electron_1.app.getPath('home')], isExistingDirectory, fallback);
    }
    // The kit integration registers a source that renders LobsterAI providers
    // into dsh settings (see dshConfigSync). It runs on every start so the child
    // always boots against current provider config, with keys passed via env.
    setManagedSettingsSource(source) {
        this.managedSettingsSource = source;
    }
    getState() {
        return { ...this.state };
    }
    onStateChange(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    getWebUrl() {
        return this.state.phase === constants_1.DshEnginePhase.Ready && this.state.port ? `http://127.0.0.1:${this.state.port}` : null;
    }
    getRecentLogs() {
        return [...this.logRing];
    }
    // Kit-installed runtimes (downloaded archives) live under userData. The app's
    // package metadata selects one exact version from this side-by-side store.
    getRuntimeInstallBaseDir() {
        return path.join(electron_1.app.getPath('userData'), 'dsh-runtime');
    }
    // Downloads and installs the pinned runtime when it is not present yet.
    // Resolves the installed root, or null when the app carries no artifact for
    // this platform (dev builds read vendor/dsh-runtime instead). Progress is
    // published on the engine state so the settings card can show it.
    async ensureRuntimeInstalled() {
        const present = this.resolveRuntime();
        if (present)
            return present.root;
        const meta = readDshPackageMeta();
        const pinnedVersion = meta.version?.trim();
        if (!pinnedVersion) {
            console.warn('[DSH] No pinned runtime version configured');
            return null;
        }
        const artifact = (0, dshRuntimeInstaller_1.resolveDshArtifactFromConfig)(meta.runtimes ?? null, resolveHostDshTargetId(), pinnedVersion);
        if (!artifact) {
            console.warn(`[DSH] No runtime artifact configured for ${resolveHostDshTargetId()}`);
            return null;
        }
        console.log(`[DSH] Installing runtime ${artifact.version} for ${artifact.target}`);
        this.setState({
            phase: constants_1.DshEnginePhase.Installing,
            errorCode: null,
            install: { stage: constants_1.DshInstallStage.Manifest, receivedBytes: 0, totalBytes: artifact.size },
        });
        try {
            const result = await (0, dshRuntimeInstaller_1.installDshRuntime)({
                artifact,
                baseDir: this.getRuntimeInstallBaseDir(),
                expectedTarget: artifact.target,
                onProgress: (progress) => this.publishInstallProgress(progress),
            });
            console.log(`[DSH] Runtime ${result.version} ready at ${result.root}`);
            this.setState({ phase: constants_1.DshEnginePhase.Stopped, install: null });
            return result.root;
        }
        catch (error) {
            // The caller reports the message; the state carries the red dot so the
            // card does not sit on "installing" after the install gave up.
            this.setState({ phase: constants_1.DshEnginePhase.Failed, errorCode: constants_1.DshEngineErrorCode.InstallFailed, install: null });
            throw error;
        }
    }
    publishInstallProgress(progress) {
        const previous = this.state.install;
        const next = progress.stage === constants_1.DshInstallStage.Download
            ? { stage: progress.stage, receivedBytes: progress.receivedBytes, totalBytes: progress.totalBytes }
            : { stage: progress.stage, receivedBytes: previous?.receivedBytes ?? 0, totalBytes: previous?.totalBytes ?? 0 };
        if (!(0, dshRuntime_1.shouldPublishInstallProgress)(previous, next))
            return;
        this.setState({ install: next });
        if (next.stage !== constants_1.DshInstallStage.Download) {
            console.log(`[DSH] Runtime install: ${next.stage}`);
            return;
        }
        const percent = (0, dshRuntime_1.dshInstallPercent)(next);
        if (percent % 25 === 0)
            console.log(`[DSH] Downloading runtime ${percent}%`);
    }
    resolveRuntime() {
        const pinned = resolvePinnedDshRuntimeIdentity();
        if (!pinned) {
            console.warn('[DSH] Cannot resolve a runtime without package.json dsh.version');
            return null;
        }
        const installedRoot = (0, dshRuntimeInstaller_1.resolveInstalledDshRuntime)(this.getRuntimeInstallBaseDir(), pinned.version, {
            target: pinned.target,
            sha256: pinned.sha256,
        });
        if (installedRoot) {
            return {
                root: installedRoot,
                entry: path.join(installedRoot, ...dshRuntime_1.DSH_RUNTIME_ENTRY_RELPATH.split('/')),
                buildInfo: readBuildInfo(installedRoot),
            };
        }
        const candidates = (0, dshRuntime_1.resolveDshRuntimeCandidates)({
            isPackaged: electron_1.app.isPackaged,
            resourcesPath: process.resourcesPath,
            appPath: electron_1.app.getAppPath(),
            cwd: process.cwd(),
            joinPath: path.join,
        });
        for (const candidate of candidates) {
            if (!fs.existsSync(candidate))
                continue;
            // Resolve the vendor/dsh-runtime/current symlink; dsh path checks reject
            // paths that traverse unresolved links.
            const root = fs.realpathSync(candidate);
            const buildInfo = readBuildInfo(root);
            if (!buildInfo || buildInfo.dshVersion !== pinned.version || buildInfo.target !== pinned.target) {
                console.warn(`[DSH] Ignoring runtime at ${root}: expected ${pinned.version}/${pinned.target}, ` +
                    `got ${buildInfo ? `${buildInfo.dshVersion}/${buildInfo.target}` : 'missing build info'}`);
                continue;
            }
            const layout = (0, dshRuntime_1.validateDshRuntimeLayout)(root, fs.existsSync, path.join);
            if (!layout.ok) {
                console.warn(`[DSH] Runtime at ${root} is incomplete, missing: ${layout.missing.join(', ')}`);
                continue;
            }
            return { root, entry: path.join(root, ...dshRuntime_1.DSH_RUNTIME_ENTRY_RELPATH.split('/')), buildInfo };
        }
        return null;
    }
    getDshHomeDir() {
        return this.homeDirectorySource?.() ?? this.getPrivateDshHomeDir();
    }
    getPrivateDshHomeDir() {
        return path.join(electron_1.app.getPath('userData'), constants_1.DSH_STATE_DIR_NAME);
    }
    async start() {
        if (this.state.phase === constants_1.DshEnginePhase.Ready && this.child)
            return this.getState();
        if (this.startPromise)
            return this.startPromise;
        this.startPromise = this.doStart().finally(() => {
            this.startPromise = null;
        });
        return this.startPromise;
    }
    async stop() {
        const child = this.child;
        this.generation += 1;
        this.child = null;
        if (child) {
            await this.terminateChild(child);
            this.sharedHomeLock?.release();
        }
        if (this.state.phase !== constants_1.DshEnginePhase.Failed && this.state.phase !== constants_1.DshEnginePhase.NotInstalled) {
            this.setState({ phase: constants_1.DshEnginePhase.Stopped, port: null, errorCode: null });
        }
    }
    async doStart() {
        // A start can be requested before Electron finishes booting (an early MCP
        // tool call or an autostart hook). app.getPath throws until the app is
        // ready, so wait rather than fail the request.
        if (!electron_1.app.isReady()) {
            await electron_1.app.whenReady();
        }
        await this.stop();
        this.logRing.length = 0;
        const generation = this.generation;
        const runtime = this.resolveRuntime();
        if (!runtime) {
            console.error('[DSH] No usable runtime found. Run `npm run dsh:runtime:host` in dev.');
            this.setState({ phase: constants_1.DshEnginePhase.NotInstalled, port: null, errorCode: constants_1.DshEngineErrorCode.RuntimeMissing });
            return this.getState();
        }
        this.setState({
            phase: constants_1.DshEnginePhase.Starting,
            port: null,
            version: runtime.buildInfo?.dshVersion ?? null,
            errorCode: null,
        });
        const dshHome = this.getDshHomeDir();
        fs.mkdirSync(dshHome, { recursive: true });
        let managedEnv = {};
        if (this.managedSettingsSource) {
            try {
                const managed = this.managedSettingsSource();
                if (managed) {
                    const { warnings } = await (0, dshConfigSync_1.writeDshManagedSettings)(dshHome, managed);
                    for (const warning of warnings)
                        console.warn(`[DSH] Settings merge: ${warning}`);
                    managedEnv = managed.envVars;
                }
            }
            catch (error) {
                console.error('[DSH] Failed to sync managed settings; starting without them', error);
            }
        }
        const port = await allocateLoopbackPort();
        const env = (0, dshRuntime_1.buildDshSpawnEnv)({
            baseEnv: { ...process.env, ...managedEnv },
            dshHome,
            timeZone: resolveTimeZone(),
        });
        const args = (0, dshRuntime_1.buildDshWebArgs)(runtime.entry, port);
        const workingDirectory = this.resolveWorkingDirectory(runtime.root);
        console.log(`[DSH] Starting runtime ${runtime.buildInfo?.dshVersion ?? 'unknown'} on 127.0.0.1:${port} (cwd=${workingDirectory})`);
        let child;
        try {
            child = (0, dshProcessLauncher_1.spawnDshProcess)({
                executablePath: process.execPath,
                args,
                cwd: workingDirectory,
                env,
            });
        }
        catch (error) {
            console.error('[DSH] Failed to spawn runtime', error);
            this.setState({ phase: constants_1.DshEnginePhase.Failed, port: null, errorCode: constants_1.DshEngineErrorCode.SpawnFailed });
            return this.getState();
        }
        this.child = child;
        this.sharedHomeLock?.claim(port);
        this.installQuitHook();
        this.wireChildStreams(child, generation);
        const readyError = await this.waitForReady(port, generation);
        if (this.generation !== generation)
            return this.getState();
        if (readyError) {
            const startupError = (0, dshRuntime_1.classifyDshStartupError)(this.logRing.slice(-40).join('\n'), readyError);
            // A child that already exited dumped its output from the exit handler; a
            // wedged one is still running and has not, so carry the tail here.
            const tail = this.child ? `. Recent output:\n${this.logRing.slice(-20).join('\n')}` : '';
            console.error(`[DSH] Runtime did not become ready: ${startupError}${tail}`);
            await this.stop();
            this.setState({ phase: constants_1.DshEnginePhase.Failed, port: null, errorCode: startupError });
            return this.getState();
        }
        console.log(`[DSH] Ready at http://127.0.0.1:${port}`);
        this.setState({ phase: constants_1.DshEnginePhase.Ready, port, errorCode: null });
        this.pruneSupersededInstalledRuntimes(runtime);
        return this.getState();
    }
    pruneSupersededInstalledRuntimes(runtime) {
        const pinned = resolvePinnedDshRuntimeIdentity();
        if (!pinned)
            return;
        const installBase = this.getRuntimeInstallBaseDir();
        if (path.resolve(runtime.root) !== path.resolve((0, dshRuntimeInstaller_1.installedDshRuntimeRoot)(installBase, pinned.version)))
            return;
        const markedReady = (0, dshRuntimeInstaller_1.markInstalledDshRuntimeReady)(installBase, pinned.version, {
            target: pinned.target,
            sha256: pinned.sha256,
        });
        if (!markedReady) {
            console.warn(`[DSH] Could not mark runtime ${pinned.version} as ready; keeping prior runtimes`);
            return;
        }
        void (0, dshRuntimeInstaller_1.pruneInstalledDshRuntimes)(installBase, pinned.version, 1)
            .then(({ removed }) => {
            if (removed.length > 0)
                console.log(`[DSH] Removed superseded runtimes: ${removed.join(', ')}`);
        })
            .catch((error) => console.warn('[DSH] Could not prune superseded runtimes', error));
    }
    wireChildStreams(child, generation) {
        const append = (chunk) => {
            const lines = String(chunk).split(/\r?\n/).filter((line) => line.length > 0);
            this.logRing.push(...lines);
            if (this.logRing.length > LOG_RING_MAX_LINES) {
                this.logRing.splice(0, this.logRing.length - LOG_RING_MAX_LINES);
            }
        };
        child.stdout?.on('data', append);
        child.stderr?.on('data', append);
        child.on('exit', (code) => {
            if (this.generation !== generation)
                return;
            this.child = null;
            // A boot failure prints its stack on the child's own streams and nowhere
            // else, and the generation guard above already filtered out the stops we
            // asked for, so any exit reaching here owes the main log its output.
            if (code !== 0) {
                console.error(`[DSH] Runtime exited (code=${code ?? 'null'}). Recent output:\n${this.logRing.slice(-40).join('\n')}`);
            }
            if (this.state.phase === constants_1.DshEnginePhase.Ready) {
                console.warn(`[DSH] Runtime exited unexpectedly (code=${code ?? 'null'})`);
                this.setState({ phase: constants_1.DshEnginePhase.Stopped, port: null, errorCode: null });
            }
        });
    }
    // Resolves null once the web server answers and keeps answering, or the error
    // code on failure.
    async waitForReady(port, generation) {
        const startedAt = Date.now();
        const deadline = startedAt + READY_TIMEOUT_MS;
        let nextProgressLog = startedAt + READY_PROGRESS_LOG_INTERVAL_MS;
        while (Date.now() < deadline) {
            if (this.generation !== generation || !this.child)
                return constants_1.DshEngineErrorCode.CrashedEarly;
            const status = await probeHttpStatus(port);
            if (status === 200)
                return this.confirmStillServing(port, generation);
            if (Date.now() >= nextProgressLog) {
                console.log(`[DSH] Still waiting for the runtime on 127.0.0.1:${port} (${Math.round((Date.now() - startedAt) / 1000)}s)`);
                nextProgressLog = Date.now() + READY_PROGRESS_LOG_INTERVAL_MS;
            }
            await delay(READY_POLL_INTERVAL_MS);
        }
        return constants_1.DshEngineErrorCode.ReadyTimeout;
    }
    // See READY_SETTLE_MS: a first 200 only proves the HTTP server bound, not that
    // the runtime survived boot.
    async confirmStillServing(port, generation) {
        await delay(READY_SETTLE_MS);
        if (this.generation !== generation || !this.child)
            return constants_1.DshEngineErrorCode.CrashedEarly;
        return (await probeHttpStatus(port)) === 200 ? null : constants_1.DshEngineErrorCode.CrashedEarly;
    }
    async terminateChild(child) {
        const exited = new Promise((resolve) => {
            child.once('exit', () => resolve());
        });
        try {
            child.kill();
        }
        catch {
            return;
        }
        const timedOut = await Promise.race([exited.then(() => false), delay(STOP_GRACE_MS).then(() => true)]);
        if (timedOut) {
            try {
                if ('pid' in child && typeof child.pid === 'number' && 'exitCode' in child) {
                    child.kill('SIGKILL');
                }
                else {
                    child.kill();
                }
            }
            catch {
                // Already gone.
            }
            await Promise.race([exited, delay(1_000)]);
        }
    }
    installQuitHook() {
        if (this.quitHookInstalled)
            return;
        this.quitHookInstalled = true;
        electron_1.app.on('will-quit', () => {
            const child = this.child;
            this.generation += 1;
            this.child = null;
            if (child) {
                try {
                    child.kill();
                }
                catch {
                    // Already gone.
                }
            }
            this.sharedHomeLock?.release();
        });
    }
    setState(patch) {
        this.state = { ...this.state, ...patch };
        for (const listener of this.listeners) {
            try {
                listener(this.getState());
            }
            catch (error) {
                console.error('[DSH] State listener failed', error);
            }
        }
    }
}
exports.DshEngineManager = DshEngineManager;
function isExistingDirectory(candidate) {
    try {
        return fs.statSync(candidate).isDirectory();
    }
    catch {
        return false;
    }
}
function readBuildInfo(runtimeRoot) {
    const buildInfoPath = path.join(runtimeRoot, 'runtime-build-info.json');
    if (!fs.existsSync(buildInfoPath))
        return null;
    return (0, dshRuntime_1.parseDshRuntimeBuildInfo)(fs.readFileSync(buildInfoPath, 'utf8'));
}
function allocateLoopbackPort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (address && typeof address === 'object') {
                const { port } = address;
                server.close(() => resolve(port));
            }
            else {
                server.close(() => reject(new Error('Could not allocate a loopback port')));
            }
        });
    });
}
function probeHttpStatus(port) {
    return new Promise((resolve) => {
        const request = http.get({ host: '127.0.0.1', port, path: '/', timeout: 2_000 }, (response) => {
            response.resume();
            resolve(response.statusCode ?? 0);
        });
        request.on('timeout', () => request.destroy(new Error('timeout')));
        request.on('error', () => resolve(0));
    });
}
function resolveTimeZone() {
    if (process.env.TZ)
        return undefined;
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    catch {
        return undefined;
    }
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
let dshEngineManagerInstance = null;
function getDshEngineManager() {
    if (!dshEngineManagerInstance) {
        dshEngineManagerInstance = new DshEngineManager();
    }
    return dshEngineManagerInstance;
}
//# sourceMappingURL=dshEngineManager.js.map