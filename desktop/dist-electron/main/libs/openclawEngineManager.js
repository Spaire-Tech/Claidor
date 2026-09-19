"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenClawEngineManager = exports.isOpenClawGatewayHeapOutOfMemory = exports.isOpenClawConfigStartupFailure = void 0;
exports.buildOpenClawGatewayExecArgv = buildOpenClawGatewayExecArgv;
exports.buildOpenClawCompileCacheEnv = buildOpenClawCompileCacheEnv;
const child_process_1 = require("child_process");
const crypto_1 = __importDefault(require("crypto"));
const electron_1 = require("electron");
const events_1 = require("events");
const fs_1 = __importDefault(require("fs"));
const net_1 = __importDefault(require("net"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("../../shared/eventTriggers/constants");
const constants_2 = require("../../shared/openclawEngine/constants");
const coworkUtil_1 = require("./coworkUtil");
const gatewayLogRotation_1 = require("./gatewayLogRotation");
const installerResourceRecovery_1 = require("./installerResourceRecovery");
const noProxyEnv_1 = require("./noProxyEnv");
const openaiCodexAuth_1 = require("./openaiCodexAuth");
const openclawCronLegacyMigration_1 = require("./openclawCronLegacyMigration");
const openclawGatewayLock_1 = require("./openclawGatewayLock");
const openclawLocalExtensions_1 = require("./openclawLocalExtensions");
const openclawMemoryIndexMigration_1 = require("./openclawMemoryIndexMigration");
const openclawWorkerShims_1 = require("./openclawWorkerShims");
const pythonRuntime_1 = require("./pythonRuntime");
const gwDiagTs = () => {
    const d = new Date();
    const p = (n, w = 2) => String(n).padStart(w, '0');
    const tz = d.getTimezoneOffset();
    const sign = tz <= 0 ? '+' : '-';
    const abs = Math.abs(tz);
    return `[GW-RESTART-DIAG] ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
};
const systemProxy_1 = require("./systemProxy");
const DEFAULT_OPENCLAW_VERSION = '2026.2.23';
const DEFAULT_GATEWAY_PORT = 18789;
const GATEWAY_PORT_SCAN_LIMIT = 80;
const GATEWAY_BOOT_TIMEOUT_MS = 300 * 1000;
const GATEWAY_MAX_RESTART_ATTEMPTS = 5;
const GATEWAY_RESTART_DELAYS = [3_000, 5_000, 10_000, 20_000, 30_000];
// How long a gateway-initiated restart (SIGUSR1 in-process restart after a
// config change) is trusted to complete before LobsterAI resumes managing the
// process itself.
const GATEWAY_SELF_RESTART_WINDOW_MS = 30_000;
const OPENCLAW_GATEWAY_MAX_OLD_SPACE_MB = 4096;
const OPENCLAW_GATEWAY_MAX_OLD_SPACE_OPTION = `--max-old-space-size=${OPENCLAW_GATEWAY_MAX_OLD_SPACE_MB}`;
const NODE_MAX_OLD_SPACE_RE = /(?:^|\s)--max-old-space-size(?:=|\s|$)/;
const GATEWAY_RECENT_OUTPUT_LINE_LIMIT = 80;
const OPENCLAW_CONFIG_STARTUP_FAILURE_PATTERNS = [
    /invalid config(?:\s+at|:|\s)/i,
    /config validation failed:/i,
    /json5 parse failed:/i,
    /failed to parse .* as json5/i,
    /openclaw\.json[\s\S]{0,240}(?:syntaxerror|unexpected token|invalid)/i,
    /(?:syntaxerror|unexpected token|invalid)[\s\S]{0,240}openclaw\.json/i,
];
const OPENCLAW_GATEWAY_HEAP_OOM_PATTERNS = [
    /JavaScript heap out of memory/i,
    /Ineffective mark-compacts near heap limit/i,
    /Allocation failed - process out of memory/i,
];
const isOpenClawConfigStartupFailure = (text) => {
    if (!text)
        return false;
    return OPENCLAW_CONFIG_STARTUP_FAILURE_PATTERNS.some((pattern) => pattern.test(text));
};
exports.isOpenClawConfigStartupFailure = isOpenClawConfigStartupFailure;
const isOpenClawGatewayHeapOutOfMemory = (text) => {
    if (!text)
        return false;
    return OPENCLAW_GATEWAY_HEAP_OOM_PATTERNS.some((pattern) => pattern.test(text));
};
exports.isOpenClawGatewayHeapOutOfMemory = isOpenClawGatewayHeapOutOfMemory;
const parseJsonFile = (filePath) => {
    try {
        const raw = fs_1.default.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
};
const ensureDir = (dirPath) => {
    fs_1.default.mkdirSync(dirPath, { recursive: true });
};
const findPath = (candidates) => {
    for (const candidate of candidates) {
        if (candidate && fs_1.default.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
};
const isPortAvailable = async (port) => {
    return await new Promise((resolve) => {
        const server = net_1.default.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close(() => resolve(true));
        });
        server.listen(port, '127.0.0.1');
    });
};
const isPortReachable = (host, port, timeoutMs = 1200) => {
    return new Promise((resolve) => {
        const socket = new net_1.default.Socket();
        let settled = false;
        const done = (result) => {
            if (settled)
                return;
            settled = true;
            try {
                socket.destroy();
            }
            catch {
                // ignore
            }
            resolve(result);
        };
        socket.setTimeout(timeoutMs);
        socket.once('connect', () => done(true));
        socket.once('timeout', () => done(false));
        socket.once('error', () => done(false));
        socket.connect(port, host);
    });
};
const isGatewayProcessAlive = (child) => {
    if (!child)
        return false;
    if ('pid' in child && typeof child.pid === 'number') {
        // For ChildProcess, also check it hasn't already exited.
        if ('exitCode' in child && child.exitCode !== null)
            return false;
        return true;
    }
    return false;
};
const fetchWithTimeout = async (url, timeoutMs) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort();
    }, timeoutMs);
    try {
        return await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            cache: 'no-store',
        });
    }
    finally {
        clearTimeout(timeout);
    }
};
function buildOpenClawGatewayExecArgv(existingNodeOptions) {
    if (NODE_MAX_OLD_SPACE_RE.test(existingNodeOptions?.trim() ?? '')) {
        return [];
    }
    return [OPENCLAW_GATEWAY_MAX_OLD_SPACE_OPTION];
}
function buildOpenClawCompileCacheEnv(compileCacheDir) {
    return {
        NODE_COMPILE_CACHE: compileCacheDir,
        // The cache is already configured by LobsterAI. Prevent the packaged
        // launcher from respawning through Electron Helper as if it were Node.
        OPENCLAW_PACKAGED_COMPILE_CACHE_RESPAWNED: '1',
    };
}
class OpenClawEngineManager extends events_1.EventEmitter {
    baseDir;
    logsDir;
    stateDir;
    gatewayTokenPath;
    hookTokenPath;
    gatewayPortPath;
    configPath;
    desiredVersion;
    status;
    gatewayProcess = null;
    gatewayRecentOutput = new WeakMap();
    gatewayGenerationByProcess = new WeakMap();
    gatewayFailureByProcess = new WeakMap();
    expectedGatewayExits = new WeakSet();
    gatewayGeneration = 0;
    lastGatewayFailure = null;
    gatewayRestartTimer = null;
    gatewayRestartAttempt = 0;
    shutdownRequested = false;
    gatewayPort = null;
    startGatewayPromise = null;
    secretEnvVars = {};
    gatewaySpawnedAt = null;
    gatewayLogPrunedDateKey = null;
    gatewaySelfRestartNotedAt = null;
    constructor() {
        super();
        const userDataPath = electron_1.app.getPath('userData');
        this.baseDir = path_1.default.join(userDataPath, 'openclaw');
        this.logsDir = path_1.default.join(this.baseDir, 'logs');
        this.stateDir = path_1.default.join(this.baseDir, 'state');
        this.gatewayTokenPath = path_1.default.join(this.stateDir, 'gateway-token');
        this.hookTokenPath = path_1.default.join(this.stateDir, constants_1.EVENT_TRIGGER_TOKEN_FILE);
        this.gatewayPortPath = path_1.default.join(this.stateDir, 'gateway-port.json');
        this.configPath = path_1.default.join(this.stateDir, 'openclaw.json');
        ensureDir(this.baseDir);
        ensureDir(this.logsDir);
        ensureDir(this.stateDir);
        this.pruneGatewayLogsIfNeeded();
        const runtime = this.resolveRuntimeMetadata();
        this.desiredVersion = runtime.version || DEFAULT_OPENCLAW_VERSION;
        this.status = runtime.root
            ? {
                phase: 'ready',
                version: this.desiredVersion,
                message: 'The engine is ready.',
                canRetry: false,
            }
            : {
                phase: 'not_installed',
                version: null,
                message: `The bundled engine is missing. Expected: ${runtime.expectedPathHint}`,
                canRetry: true,
            };
    }
    /**
     * Set secret environment variables to inject into the gateway process.
     * These contain the plaintext values for `${VAR}` placeholders in openclaw.json.
     */
    setSecretEnvVars(vars) {
        this.secretEnvVars = vars;
    }
    /** Return the current secret env vars snapshot (for change detection). */
    getSecretEnvVars() {
        return this.secretEnvVars;
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    emit(event, ...args) {
        return super.emit(event, ...args);
    }
    getStatus() {
        return this.withGatewayStatusFields(this.status);
    }
    setExternalError(message) {
        const runtime = this.resolveRuntimeMetadata();
        this.setStatus({
            phase: 'error',
            version: runtime.version || this.status.version || null,
            message: message.slice(0, 500),
            canRetry: true,
        });
        return this.getStatus();
    }
    getDesiredVersion() {
        return this.desiredVersion;
    }
    getBaseDir() {
        return this.baseDir;
    }
    getStateDir() {
        return this.stateDir;
    }
    getConfigPath() {
        return this.configPath;
    }
    /** Return the resolved bundled runtime root for pre-gateway CLI migrations. */
    /**
     * The entry the gateway is forked from, for a one-off CLI command.
     *
     * Public because `mcp login` is the only caller of the engine's OAuth
     * code and there is no gateway route for it, so the app has to run the
     * same file the gateway runs — against the same state dir, or it signs
     * somebody into nothing.
     */
    resolveCliEntry() {
        const runtimeRoot = this.getRuntimeRoot();
        return runtimeRoot ? this.resolveOpenClawEntry(runtimeRoot) : null;
    }
    getRuntimeRoot() {
        return this.resolveRuntimeMetadata().root;
    }
    /**
     * Restore an interrupted packaged Windows install before a startup config
     * sync invokes runtime CLI migrations. The installer can leave an empty
     * resources/cfmind directory behind, which still resolves as a runtime root
     * even though its CLI entry is missing. Recovery is a no-op outside packaged
     * Windows builds and when the runtime entry is already present.
     */
    async prepareRuntimeForStartupConfigSync(reason = 'startup-config-sync') {
        await this.maybeRecoverInstallerResources(reason);
    }
    getGatewayLogPath() {
        return (0, gatewayLogRotation_1.getGatewayLogPath)(this.logsDir);
    }
    getRecentGatewayLogEntries() {
        return (0, gatewayLogRotation_1.getRecentGatewayLogEntries)(this.logsDir);
    }
    getLastGatewayFailure(maxAgeMs = 60_000) {
        const failure = this.lastGatewayFailure;
        if (!failure || Date.now() - failure.detectedAt > maxAgeMs) {
            return null;
        }
        return { ...failure };
    }
    getGatewayProcessPid() {
        const child = this.gatewayProcess;
        if (!child || !isGatewayProcessAlive(child)) {
            return null;
        }
        return 'pid' in child && typeof child.pid === 'number' ? child.pid : null;
    }
    /**
     * Called when the gateway announced it is restarting itself (WS close 1012
     * "service restart" after an OpenClaw config reload). While the window is
     * active LobsterAI must not kill/respawn the process: the gateway is between
     * releasing and re-acquiring its single-instance lock, and a TerminateProcess
     * there leaves a poisoned (empty) lock file behind.
     */
    noteGatewaySelfRestart(reason) {
        this.gatewaySelfRestartNotedAt = Date.now();
        console.log(`${gwDiagTs()} gateway self-restart detected (${reason}); deferring supervisor restarts for up to ${GATEWAY_SELF_RESTART_WINDOW_MS}ms`);
    }
    isGatewaySelfRestartActive() {
        if (this.gatewaySelfRestartNotedAt == null) {
            return false;
        }
        if (Date.now() - this.gatewaySelfRestartNotedAt > GATEWAY_SELF_RESTART_WINDOW_MS) {
            this.gatewaySelfRestartNotedAt = null;
            return false;
        }
        // An in-process restart keeps the same pid; if the process is gone the
        // self-restart failed and normal crash handling owns recovery again.
        if (!isGatewayProcessAlive(this.gatewayProcess)) {
            this.gatewaySelfRestartNotedAt = null;
            return false;
        }
        return true;
    }
    clearGatewaySelfRestart() {
        this.gatewaySelfRestartNotedAt = null;
    }
    /**
     * Reclaim stale gateway lock files. Safe only when we have no live gateway
     * child (locks with a live owner are never touched, so the worst case of a
     * misjudged call is a no-op).
     */
    cleanupStaleGatewayLocksSafely(context) {
        if (isGatewayProcessAlive(this.gatewayProcess)) {
            return;
        }
        try {
            const results = (0, openclawGatewayLock_1.cleanupStaleGatewayLocks)({ configPath: this.configPath });
            for (const result of results) {
                const owner = result.ownerPid != null ? ` ownerPid=${result.ownerPid}` : '';
                if (result.action === openclawGatewayLock_1.GatewayLockCleanupAction.KeptAliveOwner) {
                    console.warn(`${gwDiagTs()} gateway lock kept (owner alive)${owner} path=${result.lockPath} context=${context}`);
                }
                else if (result.action === openclawGatewayLock_1.GatewayLockCleanupAction.RemoveFailed) {
                    console.warn(`${gwDiagTs()} gateway lock remove failed${owner} path=${result.lockPath} context=${context}`);
                }
                else {
                    console.log(`${gwDiagTs()} stale gateway lock reclaimed (${result.action})${owner} path=${result.lockPath} context=${context}`);
                }
            }
        }
        catch (err) {
            console.warn(`${gwDiagTs()} gateway lock cleanup failed (non-fatal) context=${context}:`, err);
        }
    }
    pruneGatewayLogsIfNeeded(now = new Date()) {
        const dateKey = (0, gatewayLogRotation_1.formatGatewayLogDateKey)(now);
        if (this.gatewayLogPrunedDateKey === dateKey)
            return;
        (0, gatewayLogRotation_1.pruneGatewayLogs)(this.logsDir, now);
        this.gatewayLogPrunedDateKey = dateKey;
    }
    /**
     * Resolve the directory where the OpenClaw gateway writes its daily rolling
     * logs (openclaw-YYYY-MM-DD.log).  Returns null when no candidate exists.
     */
    getOpenClawDailyLogDir() {
        if (process.platform === 'win32') {
            const runtime = this.resolveRuntimeMetadata();
            if (runtime.root) {
                const drive = path_1.default.parse(runtime.root).root;
                const preferred = path_1.default.join(drive, 'tmp', 'openclaw');
                if (fs_1.default.existsSync(preferred))
                    return preferred;
            }
            const fallback = path_1.default.join(os_1.default.tmpdir(), 'openclaw');
            return fs_1.default.existsSync(fallback) ? fallback : null;
        }
        // macOS / Linux
        if (fs_1.default.existsSync('/tmp/openclaw'))
            return '/tmp/openclaw';
        try {
            const uid = process.getuid?.();
            if (uid != null) {
                const fallback = path_1.default.join(os_1.default.tmpdir(), `openclaw-${uid}`);
                if (fs_1.default.existsSync(fallback))
                    return fallback;
            }
        }
        catch { /* getuid unavailable */ }
        return null;
    }
    getGatewayConnectionInfo() {
        const runtime = this.resolveRuntimeMetadata();
        const port = this.gatewayPort ?? this.readGatewayPort();
        const token = this.readGatewayToken();
        const clientEntryPath = runtime.root ? this.resolveGatewayClientEntry(runtime.root) : null;
        return {
            version: runtime.version,
            port,
            token,
            url: port ? `ws://127.0.0.1:${port}` : null,
            clientEntryPath,
            generation: this.gatewayGeneration,
        };
    }
    async ensureReady(_options = {}) {
        const runtime = this.resolveRuntimeMetadata();
        this.desiredVersion = runtime.version || DEFAULT_OPENCLAW_VERSION;
        if (!runtime.root) {
            this.setStatus({
                phase: 'not_installed',
                version: null,
                message: `The bundled engine is missing. Expected: ${runtime.expectedPathHint}`,
                canRetry: true,
            });
            return this.getStatus();
        }
        const localExtensionSync = (0, openclawLocalExtensions_1.syncLocalOpenClawExtensionsIntoRuntime)(runtime.root);
        if (localExtensionSync.copied.length > 0) {
            console.log(`[Engine] synced local extensions: ${localExtensionSync.copied.join(', ')}`);
        }
        // Clean up third-party plugins that may linger in dist/extensions/ after an
        // overlay upgrade from a version that placed them there.
        try {
            const pkg = JSON.parse(fs_1.default.readFileSync(path_1.default.join(electron_1.app.getAppPath(), 'package.json'), 'utf8'));
            const thirdPartyIds = (pkg.openclaw?.plugins ?? [])
                .map((p) => p.id)
                .filter((id) => typeof id === 'string');
            const localIds = (0, openclawLocalExtensions_1.listLocalOpenClawExtensionIds)();
            // Include renamed plugin ids so their old dirs get cleaned up
            const renamedIds = ['feishu-openclaw-plugin'];
            const allNonBundledIds = [...new Set([...thirdPartyIds, ...localIds, ...renamedIds])];
            const cleaned = (0, openclawLocalExtensions_1.cleanupStaleThirdPartyPluginsFromBundledDir)(runtime.root, allNonBundledIds);
            if (cleaned.length > 0) {
                console.log(`[Engine] cleaned stale plugins from bundled scan dirs: ${cleaned.join(', ')}`);
            }
        }
        catch {
            // Best-effort cleanup; don't block startup.
        }
        if (this.status.phase === 'running') {
            return this.getStatus();
        }
        this.setStatus({
            phase: 'ready',
            version: this.desiredVersion,
            message: 'The engine is ready.',
            canRetry: false,
        });
        return this.getStatus();
    }
    async startGateway(reason = 'unknown') {
        if (this.startGatewayPromise) {
            console.log(`${gwDiagTs()} startGateway: already in progress, reusing existing promise (new reason=${reason})`);
            return this.startGatewayPromise;
        }
        console.log(`${gwDiagTs()} startGateway: reason=${reason}, currentPhase=${this.status.phase}, port=${this.gatewayPort ?? 'none'}`);
        this.startGatewayPromise = this.doStartGateway().finally(() => {
            this.startGatewayPromise = null;
        });
        return this.startGatewayPromise;
    }
    async doStartGateway() {
        this.shutdownRequested = false;
        const t0 = Date.now();
        const elapsed = () => `${Date.now() - t0}ms`;
        // Heal installs where the installer's win-resources.tar extraction never
        // finished (killed or frozen by security software): the runtime entry is
        // missing but the preserved archive can restore it. Cheap no-op when the
        // runtime is intact.
        await this.maybeRecoverInstallerResources('gateway-start');
        const ensured = await this.ensureReady();
        console.log(`[Engine] startGateway: ensureReady done (${elapsed()}), phase=${ensured.phase}`);
        if (ensured.phase !== 'ready' && ensured.phase !== 'running') {
            return ensured;
        }
        if (isGatewayProcessAlive(this.gatewayProcess)) {
            if (this.isGatewaySelfRestartActive()) {
                // The gateway is mid self-restart (lock release/reacquire window):
                // killing it now poisons the lock file. Let it finish; callers retry
                // through their normal ready-wait paths.
                console.log(`${gwDiagTs()} startGateway: gateway self-restart in progress, leaving process alone (${elapsed()})`);
                return this.getStatus();
            }
            const port = this.gatewayPort ?? this.readGatewayPort();
            if (port) {
                const healthy = await this.isGatewayHealthy(port);
                console.log(`[Engine] startGateway: existing process health check (${elapsed()}), healthy=${healthy}`);
                if (healthy) {
                    this.gatewayPort = port;
                    if (this.status.phase !== 'running') {
                        this.setStatus({
                            phase: 'running',
                            version: this.desiredVersion,
                            message: `The engine is running on loopback:${port}.`,
                            canRetry: false,
                        });
                    }
                    return this.getStatus();
                }
                console.warn(`${gwDiagTs()} startGateway: existing process unhealthy on port=${port}, stopping it (${elapsed()})`);
            }
            else {
                console.warn(`${gwDiagTs()} startGateway: existing process alive but port unknown, stopping it (${elapsed()})`);
            }
            await this.stopGatewayProcess(this.gatewayProcess);
            this.gatewayProcess = null;
        }
        const runtime = this.resolveRuntimeMetadata();
        console.log(`[Engine] startGateway: resolveRuntimeMetadata done (${elapsed()}), root=${runtime.root ? 'found' : 'missing'}`);
        if (!runtime.root) {
            this.setStatus({
                phase: 'not_installed',
                version: null,
                message: `The bundled engine is missing. Expected: ${runtime.expectedPathHint}`,
                canRetry: true,
            });
            return this.getStatus();
        }
        this.ensureBareEntryFiles(runtime.root);
        console.log(`[Engine] startGateway: ensureBareEntryFiles done (${elapsed()})`);
        const openclawEntry = this.resolveOpenClawEntry(runtime.root);
        console.log(`[Engine] startGateway: resolveOpenClawEntry done (${elapsed()}), entry=${openclawEntry}`);
        if (!openclawEntry) {
            this.setStatus({
                phase: 'error',
                version: runtime.version,
                message: `The engine entry file is missing in runtime: ${runtime.root}.`,
                errorCode: constants_2.OpenClawEngineErrorCode.RuntimeEntryMissing,
                canRetry: true,
            });
            return this.getStatus();
        }
        const token = this.ensureGatewayToken();
        console.log(`[Engine] startGateway: ensureGatewayToken done (${elapsed()})`);
        const port = await this.resolveGatewayPort();
        console.log(`[Engine] startGateway: resolveGatewayPort done (${elapsed()}), port=${port}`);
        this.gatewayPort = port;
        this.writeGatewayPort(port);
        this.ensureConfigFile();
        // A force-killed (or crashed) gateway can leave a stale/empty lock file
        // that blocks every new gateway for OpenClaw's 30s staleness window.
        this.cleanupStaleGatewayLocksSafely('pre-spawn');
        console.log(`[Engine] startGateway: pre-fork setup done (${elapsed()})`);
        this.setStatus({
            phase: 'starting',
            version: runtime.version,
            progressPercent: 10,
            message: 'Starting the engine...',
            canRetry: false,
        });
        const compileCacheDir = path_1.default.join(this.stateDir, '.compile-cache');
        console.log(`[Engine] compile cache dir: ${compileCacheDir}`);
        const electronNodeRuntimePath = (0, coworkUtil_1.getElectronNodeRuntimePath)();
        const cliShimDir = this.ensureBundledCliShims();
        const skillsRoot = (0, coworkUtil_1.getSkillsRoot)().replace(/\\/g, '/');
        const env = {
            ...process.env,
            SKILLS_ROOT: skillsRoot,
            LOBSTERAI_SKILLS_ROOT: skillsRoot,
            CAISRA_SKILLS_ROOT: skillsRoot,
            OPENCLAW_HOME: this.baseDir,
            OPENCLAW_STATE_DIR: this.stateDir,
            OPENCLAW_CONFIG_PATH: this.configPath,
            // Point the OpenAI provider's ChatGPT/Codex auth lookup at our app-managed
            // directory so it doesn't fight with a system Codex CLI install
            // (~/.codex/auth.json).  See src/main/libs/openaiCodexAuth.ts.
            CODEX_HOME: (0, openaiCodexAuth_1.getCodexHomeDir)(),
            OPENCLAW_GATEWAY_TOKEN: token,
            OPENCLAW_GATEWAY_PORT: String(port),
            OPENCLAW_NO_RESPAWN: '1',
            OPENCLAW_ENGINE_VERSION: runtime.version || DEFAULT_OPENCLAW_VERSION,
            // Point to dist/extensions for runtime-bundled plugins that satisfy the
            // bundled-channel-entry contract.  Third-party plugins (in extensions/)
            // are discovered separately via plugins.load.paths in openclaw.json.
            OPENCLAW_BUNDLED_PLUGINS_DIR: path_1.default.join(runtime.root, 'dist', 'extensions'),
            // Disable Bonjour/mDNS LAN discovery advertising.  LobsterAI is a
            // desktop app with a loopback-only gateway — LAN service broadcast is
            // unnecessary and its watchdog can flood stderr with re-advertise
            // warnings on Windows.  See openclaw/openclaw#33609, #63153.
            OPENCLAW_DISABLE_BONJOUR: '1',
            // Enable debug-level logging so gateway emits phase-level detail during startup.
            OPENCLAW_LOG_LEVEL: 'debug',
            // Enable V8 compile cache for both CJS and ESM modules.
            // This env var works for import() (ESM), unlike enableCompileCache() which is CJS-only.
            ...buildOpenClawCompileCacheEnv(compileCacheDir),
            LOBSTERAI_ELECTRON_PATH: electronNodeRuntimePath.replace(/\\/g, '/'),
            LOBSTERAI_OPENCLAW_ENTRY: openclawEntry.replace(/\\/g, '/'),
            // Inject secret values for ${VAR} placeholders in openclaw.json.
            // This keeps plaintext credentials out of the config file on disk.
            ...this.secretEnvVars,
        };
        // Ensure the gateway process uses the host's local timezone for logging.
        // macOS does not set TZ in the environment by default (it uses NSTimeZone/ICU),
        // so Electron child processes may fall back to UTC for date formatting.
        if (!env.TZ) {
            const hostTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (hostTimezone) {
                env.TZ = hostTimezone;
                console.log(`[Engine] injected TZ=${hostTimezone} into gateway env`);
            }
        }
        if (cliShimDir) {
            // Plain object is case-sensitive: the spread key from process.env on Windows is "Path",
            // not "PATH". We must read the actual key to avoid creating a PATH with only cliShimDir.
            const currentPath = env.PATH || env.Path || '';
            env.PATH = [cliShimDir, currentPath].filter(Boolean).join(path_1.default.delimiter);
        }
        // Prepend bundled/user Python runtime paths so gateway exec commands
        // find the LobsterAI-managed Python instead of the Windows Store stub.
        (0, pythonRuntime_1.appendPythonRuntimeToEnv)(env);
        // Inject node/npm/npx shims so gateway exec commands can use them.
        // The shims wrap Electron as a Node.js runtime via ELECTRON_RUN_AS_NODE=1.
        const npmBinDir = electron_1.app.isPackaged
            ? path_1.default.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'npm', 'bin')
            : path_1.default.join(electron_1.app.getAppPath(), 'node_modules', 'npm', 'bin');
        const nodeShimDir = (0, coworkUtil_1.ensureElectronNodeShim)(electronNodeRuntimePath, npmBinDir);
        if (nodeShimDir) {
            const curPath = env.PATH || env.Path || '';
            env.PATH = [nodeShimDir, curPath].filter(Boolean).join(path_1.default.delimiter);
            env.LOBSTERAI_NPM_BIN_DIR = npmBinDir || '';
        }
        if ((0, systemProxy_1.isSystemProxyEnabled)()) {
            const { proxyUrl, targetUrl } = await (0, systemProxy_1.resolveSystemProxyUrlForTargets)();
            (0, systemProxy_1.setActiveSystemProxyUrl)(proxyUrl);
            if (proxyUrl) {
                env.http_proxy = proxyUrl;
                env.https_proxy = proxyUrl;
                env.HTTP_PROXY = proxyUrl;
                env.HTTPS_PROXY = proxyUrl;
                // Loopback must bypass the proxy, otherwise gateway children (e.g. skill
                // scripts curling 127.0.0.1 bridge servers) fail health checks intermittently.
                const mergedNoProxy = (0, noProxyEnv_1.mergeNoProxyValue)(env.no_proxy, env.NO_PROXY);
                env.no_proxy = mergedNoProxy;
                env.NO_PROXY = mergedNoProxy;
                console.log(`[Engine] Injected system proxy for gateway via ${targetUrl}:`, proxyUrl, `(no_proxy=${mergedNoProxy})`);
            }
        }
        await (0, openclawCronLegacyMigration_1.migrateLegacyCronStorageWithDoctor)({
            stateDir: this.stateDir,
            runtimeRoot: runtime.root,
            electronNodeRuntimePath,
            env,
        });
        await (0, openclawMemoryIndexMigration_1.migrateAllFtsOnlyMemoryIndexes)({
            stateDir: this.stateDir,
            configPath: this.configPath,
            runtimeRoot: runtime.root,
            electronNodeRuntimePath,
            env,
        });
        const forkArgs = ['gateway', '--bind', 'loopback', '--port', String(port), '--token', token, '--verbose'];
        const gatewayExecArgv = buildOpenClawGatewayExecArgv(process.env.NODE_OPTIONS);
        if (gatewayExecArgv.length > 0) {
            console.log(`[Engine] gateway V8 old-space limit set to ${OPENCLAW_GATEWAY_MAX_OLD_SPACE_MB}MB`);
        }
        else {
            console.log('[Engine] gateway V8 old-space limit is controlled by existing NODE_OPTIONS');
        }
        console.log(`[Engine] forking gateway: entry=${openclawEntry}, cwd=${runtime.root}, port=${port}, args=${JSON.stringify(forkArgs)}`);
        // On Windows, use child_process.spawn with ELECTRON_RUN_AS_NODE=1 instead of
        // utilityProcess.fork(). Benchmark shows utilityProcess has ~5x overhead for
        // cold ESM compilation on Windows (163s vs 34s for a 28MB bundle).
        let child;
        if (process.platform === 'win32') {
            child = (0, child_process_1.spawn)(process.execPath, [...gatewayExecArgv, openclawEntry, ...forkArgs], {
                cwd: runtime.root,
                env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
            });
        }
        else {
            child = electron_1.utilityProcess.fork(openclawEntry, forkArgs, {
                cwd: runtime.root,
                execArgv: gatewayExecArgv,
                env,
                stdio: 'pipe',
                serviceName: 'Caisra Engine',
            });
        }
        console.log(`[Engine] startGateway: gateway process created (${elapsed()}), platform=${process.platform}, launcher=${process.platform === 'win32' ? 'spawn' : 'utilityProcess'}`);
        this.gatewayProcess = child;
        this.gatewayGeneration += 1;
        this.gatewayGenerationByProcess.set(child, this.gatewayGeneration);
        this.gatewaySpawnedAt = Date.now();
        this.attachGatewayProcessLogs(child);
        this.attachGatewayExitHandlers(child);
        // Wait for the spawn event to confirm the process started (pid becomes available).
        child.once('spawn', () => {
            console.log(`[Engine] gateway process spawned (${elapsed()}), pid=${child.pid}`);
        });
        const ready = await this.waitForGatewayReady(port, GATEWAY_BOOT_TIMEOUT_MS);
        console.log(`[Engine] startGateway: waitForGatewayReady returned (${elapsed()}), ready=${ready}`);
        if (!ready) {
            if (this.status.phase !== 'error') {
                this.setStatus({
                    phase: 'error',
                    version: runtime.version,
                    message: 'The engine failed to become healthy in time.',
                    canRetry: true,
                });
            }
            this.stopGatewayProcess(child);
            return this.getStatus();
        }
        console.log(`[Engine] startGateway: gateway is running, total startup time: ${elapsed()}`);
        // Reset restart counter on successful start — gateway is healthy
        this.gatewayRestartAttempt = 0;
        this.setStatus({
            phase: 'running',
            version: runtime.version,
            progressPercent: 100,
            message: `The engine is running on loopback:${port}.`,
            canRetry: false,
        });
        return this.getStatus();
    }
    async stopGateway() {
        this.shutdownRequested = true;
        // The supervisor is explicitly taking over; any self-restart window is moot.
        this.clearGatewaySelfRestart();
        if (this.gatewayRestartTimer) {
            clearTimeout(this.gatewayRestartTimer);
            this.gatewayRestartTimer = null;
        }
        if (this.gatewayProcess) {
            console.log('[Engine] stopping gateway process...');
            await this.stopGatewayProcess(this.gatewayProcess);
            console.log('[Engine] gateway process stopped');
            this.gatewayProcess = null;
            // On Windows the kill is TerminateProcess — the gateway had no chance
            // to release its single-instance lock, so reclaim it now.
            this.cleanupStaleGatewayLocksSafely('post-stop');
        }
        const runtime = this.resolveRuntimeMetadata();
        this.setStatus({
            phase: runtime.root ? 'ready' : 'not_installed',
            version: runtime.version,
            message: runtime.root
                ? 'The engine is ready. It is not running.'
                : `The bundled engine is missing. Expected: ${runtime.expectedPathHint}`,
            canRetry: !runtime.root,
        });
    }
    async restartGateway(reason = 'unknown') {
        const pid = this.gatewayProcess && 'pid' in this.gatewayProcess ? this.gatewayProcess.pid : 'none';
        console.log(`${gwDiagTs()} restartGateway: reason=${reason}, pid=${pid}, port=${this.gatewayPort ?? 'none'}`);
        console.log(`${gwDiagTs()} restartGateway: stopping existing gateway...`);
        await this.stopGateway();
        // Reset restart counter on manual restart so user can always retry
        this.gatewayRestartAttempt = 0;
        console.log(`${gwDiagTs()} restartGateway: starting gateway with new env...`);
        return this.startGateway(`restart:${reason}`);
    }
    buildGatewayHttpUrl(port) {
        return port ? `http://localhost:${port}/` : null;
    }
    resolveStatusGatewayPort(phase) {
        if (phase !== 'running' && phase !== 'starting') {
            return null;
        }
        return this.gatewayPort ?? this.readGatewayPort();
    }
    withGatewayStatusFields(status) {
        const port = status.gatewayPort ?? this.resolveStatusGatewayPort(status.phase);
        return {
            ...status,
            gatewayPort: port,
            gatewayHttpUrl: this.buildGatewayHttpUrl(port),
        };
    }
    /**
     * Finish an interrupted installation on packaged Windows builds: when the
     * NSIS installer was stopped before unpacking win-resources.tar, the app
     * ships with empty cfmind/python-win/SKILLs directories while the archive
     * still sits next to them. Extracting it restores the runtime in place;
     * the archive is preserved on failure so the next attempt can retry.
     */
    async maybeRecoverInstallerResources(reason) {
        if (process.platform !== 'win32' || !electron_1.app.isPackaged) {
            return;
        }
        const statusBeforeRecovery = this.status;
        let statusTouched = false;
        try {
            const result = await (0, installerResourceRecovery_1.recoverInstallerResourcesFromTar)(process.resourcesPath, reason, ({ bytes, totalBytes }) => {
                statusTouched = true;
                this.setStatus({
                    phase: 'installing',
                    version: this.status.version,
                    progressPercent: totalBytes > 0 ? Math.min(99, Math.floor((bytes / totalBytes) * 100)) : undefined,
                    message: 'Recovering bundled resources from the installer archive...',
                    canRetry: false,
                });
            });
            if (result.attempted && result.success) {
                // Runtime version metadata was unreadable while the files were missing.
                const runtime = this.resolveRuntimeMetadata();
                this.desiredVersion = runtime.version || this.desiredVersion;
                this.setStatus({
                    phase: 'ready',
                    version: this.desiredVersion,
                    message: 'The engine was recovered from installer resources.',
                    canRetry: false,
                });
            }
            else if (statusTouched) {
                this.setStatus(statusBeforeRecovery);
            }
        }
        catch (error) {
            console.error('[Engine] installer resource recovery attempt failed:', error);
            if (statusTouched) {
                this.setStatus(statusBeforeRecovery);
            }
        }
    }
    resolveRuntimeMetadata() {
        const candidateRoots = electron_1.app.isPackaged
            ? [path_1.default.join(process.resourcesPath, 'cfmind')]
            : [
                path_1.default.join(electron_1.app.getAppPath(), 'vendor', 'openclaw-runtime', 'current'),
                path_1.default.join(process.cwd(), 'vendor', 'openclaw-runtime', 'current'),
            ];
        // Resolve symlinks so the gateway doesn't refuse to traverse them
        // (e.g. vendor/openclaw-runtime/current -> win-x64).
        const runtimeRoot = (() => {
            const found = findPath(candidateRoots);
            if (!found)
                return null;
            try {
                return fs_1.default.realpathSync(found);
            }
            catch {
                return found;
            }
        })();
        const expectedPathHint = electron_1.app.isPackaged
            ? path_1.default.join(process.resourcesPath, 'cfmind')
            : path_1.default.join(electron_1.app.getAppPath(), 'vendor', 'openclaw-runtime', 'current');
        if (!runtimeRoot) {
            return {
                root: null,
                version: null,
                expectedPathHint,
            };
        }
        return {
            root: runtimeRoot,
            version: this.readRuntimeVersion(runtimeRoot) || DEFAULT_OPENCLAW_VERSION,
            expectedPathHint,
        };
    }
    readRuntimeVersion(runtimeRoot) {
        const fromRootPackage = parseJsonFile(path_1.default.join(runtimeRoot, 'package.json'))?.version;
        if (typeof fromRootPackage === 'string' && fromRootPackage.trim()) {
            return fromRootPackage.trim();
        }
        const fromOpenClawPackage = parseJsonFile(path_1.default.join(runtimeRoot, 'node_modules', 'openclaw', 'package.json'))?.version;
        if (typeof fromOpenClawPackage === 'string' && fromOpenClawPackage.trim()) {
            return fromOpenClawPackage.trim();
        }
        const fromBuildInfo = parseJsonFile(path_1.default.join(runtimeRoot, 'runtime-build-info.json'))?.version;
        if (typeof fromBuildInfo === 'string' && fromBuildInfo.trim()) {
            return fromBuildInfo.trim();
        }
        return null;
    }
    ensureBareEntryFiles(runtimeRoot) {
        const t0 = Date.now();
        // Fast path: if gateway-bundle.mjs exists, skip full dist extraction.
        // The bundle is the primary entry; dist/ modules are only needed as fallback.
        const bundlePath = path_1.default.join(runtimeRoot, 'gateway-bundle.mjs');
        if (fs_1.default.existsSync(bundlePath)) {
            console.log('[Engine] ensureBareEntryFiles: bundle exists, skipping dist extraction');
            this.ensureControlUiFiles(runtimeRoot);
            this.ensureOpenClawWorkerShimsForBundle(runtimeRoot);
            console.log(`[Engine] ensureBareEntryFiles: completed in ${Date.now() - t0}ms`);
            return;
        }
        console.log('[Engine] ensureBareEntryFiles: no bundle found, checking bare files');
        const bareEntry = path_1.default.join(runtimeRoot, 'openclaw.mjs');
        const bareDistEntry = path_1.default.join(runtimeRoot, 'dist', 'entry.js');
        if (fs_1.default.existsSync(bareEntry) && fs_1.default.existsSync(bareDistEntry)) {
            return;
        }
        const asarRoot = path_1.default.join(runtimeRoot, 'gateway.asar');
        const asarEntry = path_1.default.join(asarRoot, 'openclaw.mjs');
        if (!fs_1.default.existsSync(asarEntry)) {
            return;
        }
        console.log('[Engine] ensureBareEntryFiles: extracting from gateway.asar (no bundle)');
        try {
            if (!fs_1.default.existsSync(bareEntry)) {
                fs_1.default.writeFileSync(bareEntry, fs_1.default.readFileSync(asarEntry));
                console.log('[Engine] Extracted openclaw.mjs');
            }
            const asarDist = path_1.default.join(asarRoot, 'dist');
            const bareDist = path_1.default.join(runtimeRoot, 'dist');
            if (fs_1.default.existsSync(asarDist) && !fs_1.default.existsSync(bareDistEntry)) {
                this.copyDirFromAsar(asarDist, bareDist);
                console.log('[Engine] Extracted dist/');
            }
            console.log('[Engine] Entry files extracted successfully.');
        }
        catch (err) {
            console.error('[Engine] Failed to extract entry files from gateway.asar:', err);
        }
    }
    /**
     * Extract only dist/control-ui/ from gateway.asar if not already on disk.
     * The control-ui directory contains static HTML/CSS/JS assets served by the
     * gateway's admin UI and must exist as bare files on the filesystem.
     */
    ensureControlUiFiles(runtimeRoot) {
        const controlUiIndex = path_1.default.join(runtimeRoot, 'dist', 'control-ui', 'index.html');
        if (fs_1.default.existsSync(controlUiIndex)) {
            return;
        }
        const asarControlUi = path_1.default.join(runtimeRoot, 'gateway.asar', 'dist', 'control-ui');
        if (!fs_1.default.existsSync(asarControlUi)) {
            // control-ui may already exist as bare files from the build (see build-openclaw-runtime.sh)
            return;
        }
        console.log('[Engine] Extracting dist/control-ui/ from gateway.asar...');
        try {
            this.copyDirFromAsar(asarControlUi, path_1.default.join(runtimeRoot, 'dist', 'control-ui'));
            console.log('[Engine] Extracted dist/control-ui/');
        }
        catch (err) {
            console.error('[Engine] Failed to extract dist/control-ui/ from gateway.asar:', err);
        }
    }
    ensureOpenClawWorkerShimsForBundle(runtimeRoot) {
        try {
            const result = (0, openclawWorkerShims_1.ensureOpenClawWorkerShims)(runtimeRoot);
            const changedCount = result.created.length + result.updated.length;
            if (changedCount > 0) {
                console.log(`[Engine] Ensured ${changedCount} worker shim(s) for bundled gateway.`);
            }
            if (result.missingTargets.length > 0) {
                console.warn(`[Engine] Skipped ${result.missingTargets.length} worker shim(s) because target files are missing.`);
            }
            if (result.protectedExisting.length > 0) {
                console.warn(`[Engine] Skipped ${result.protectedExisting.length} worker shim(s) because existing files are not LobsterAI shims.`);
            }
        }
        catch (error) {
            console.warn('[Engine] Failed to ensure worker shims for bundled gateway:', error);
        }
    }
    ensureBundledCliShims() {
        const shimDir = path_1.default.join(this.stateDir, 'bin');
        const shellWrapper = [
            '#!/usr/bin/env bash',
            'if [ -z "${LOBSTERAI_OPENCLAW_ENTRY:-}" ]; then',
            '  echo "LOBSTERAI_OPENCLAW_ENTRY is not set" >&2',
            '  exit 127',
            'fi',
            'if [ -n "${LOBSTERAI_ELECTRON_PATH:-}" ]; then',
            '  exec env ELECTRON_RUN_AS_NODE=1 "${LOBSTERAI_ELECTRON_PATH}" "${LOBSTERAI_OPENCLAW_ENTRY}" "$@"',
            'fi',
            'if command -v node >/dev/null 2>&1; then',
            '  exec node "${LOBSTERAI_OPENCLAW_ENTRY}" "$@"',
            'fi',
            'echo "Neither LOBSTERAI_ELECTRON_PATH nor node is available for the engine CLI." >&2',
            'exit 127',
            '',
        ].join('\n');
        const windowsWrapper = [
            '@echo off',
            'if "%LOBSTERAI_OPENCLAW_ENTRY%"=="" (',
            '  echo LOBSTERAI_OPENCLAW_ENTRY is not set 1>&2',
            '  exit /b 127',
            ')',
            'if not "%LOBSTERAI_ELECTRON_PATH%"=="" (',
            '  set ELECTRON_RUN_AS_NODE=1',
            '  "%LOBSTERAI_ELECTRON_PATH%" "%LOBSTERAI_OPENCLAW_ENTRY%" %*',
            '  exit /b %ERRORLEVEL%',
            ')',
            'node "%LOBSTERAI_OPENCLAW_ENTRY%" %*',
            '',
        ].join('\r\n');
        try {
            ensureDir(shimDir);
            for (const commandName of ['openclaw', 'claw']) {
                const shellPath = path_1.default.join(shimDir, commandName);
                const existingShell = fs_1.default.existsSync(shellPath) ? fs_1.default.readFileSync(shellPath, 'utf8') : '';
                if (existingShell !== shellWrapper) {
                    fs_1.default.writeFileSync(shellPath, shellWrapper, 'utf8');
                    fs_1.default.chmodSync(shellPath, 0o755);
                }
                if (process.platform === 'win32') {
                    const cmdPath = path_1.default.join(shimDir, `${commandName}.cmd`);
                    const existingCmd = fs_1.default.existsSync(cmdPath) ? fs_1.default.readFileSync(cmdPath, 'utf8') : '';
                    if (existingCmd !== windowsWrapper) {
                        fs_1.default.writeFileSync(cmdPath, windowsWrapper, 'utf8');
                    }
                }
            }
            return shimDir;
        }
        catch (error) {
            console.error('[Engine] Failed to prepare CLI shims:', error);
            return null;
        }
    }
    copyDirFromAsar(srcDir, destDir) {
        fs_1.default.mkdirSync(destDir, { recursive: true });
        const entries = fs_1.default.readdirSync(srcDir, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path_1.default.join(srcDir, entry.name);
            const destPath = path_1.default.join(destDir, entry.name);
            if (entry.isDirectory()) {
                this.copyDirFromAsar(srcPath, destPath);
            }
            else {
                fs_1.default.writeFileSync(destPath, fs_1.default.readFileSync(srcPath));
            }
        }
    }
    resolveOpenClawEntry(runtimeRoot) {
        // Bundle fast-path via CJS launcher is only needed on Windows where
        // the launcher also normalizes argv and file URL handling. On macOS/Linux,
        // ensureBareEntryFiles already skips extraction when bundle exists,
        // but this method falls through to gateway.asar/openclaw.mjs which
        // ESM loads directly without a CJS wrapper.
        if (process.platform === 'win32') {
            const bundlePath = path_1.default.join(runtimeRoot, 'gateway-bundle.mjs');
            if (fs_1.default.existsSync(bundlePath)) {
                console.log('[Engine] resolveOpenClawEntry: using bundle fast path');
                return this.ensureGatewayLauncherCjsForBundle(runtimeRoot);
            }
        }
        const esmEntry = findPath([
            path_1.default.join(runtimeRoot, 'openclaw.mjs'),
            path_1.default.join(runtimeRoot, 'dist', 'entry.js'),
            path_1.default.join(runtimeRoot, 'dist', 'entry.mjs'),
            path_1.default.join(runtimeRoot, 'gateway.asar', 'openclaw.mjs'),
        ]);
        if (!esmEntry)
            return null;
        // On Windows, keep a CJS wrapper so ESM imports are loaded through file://
        // URLs and drive letters (e.g. "D:") are not misinterpreted as schemes.
        // Work around this by generating a CJS wrapper that imports the ESM entry via file:// URL.
        if (process.platform === 'win32') {
            return this.ensureGatewayLauncherCjs(runtimeRoot, esmEntry);
        }
        return esmEntry;
    }
    ensureGatewayLauncherCjs(runtimeRoot, esmEntry) {
        const launcherPath = path_1.default.join(runtimeRoot, 'gateway-launcher.cjs');
        const esmBasename = path_1.default.basename(esmEntry);
        const expectedContent = `// Auto-generated CJS wrapper for Windows ESM compatibility.\n` +
            `// On Windows, load the ESM gateway through file:// URLs so drive letters\n` +
            `// (e.g. "D:") are not misinterpreted as URL schemes.\n` +
            `const { pathToFileURL } = require('node:url');\n` +
            `const path = require('node:path');\n` +
            `const fs = require('node:fs');\n` +
            `// Enable V8 compile cache to speed up subsequent startups.\n` +
            `// Cache is stored per-user so it survives app restarts and reboots.\n` +
            `try {\n` +
            `  const { enableCompileCache } = require('node:module');\n` +
            `  const ccDir = path.join(process.env.OPENCLAW_STATE_DIR || __dirname, '.compile-cache');\n` +
            `  enableCompileCache(ccDir);\n` +
            `  process.stderr.write('[openclaw-launcher] compile-cache dir=' + require('node:module').getCompileCacheDir() + '\\n');\n` +
            `} catch (_) {}\n` +
            `const esmEntry = path.join(__dirname, '${esmBasename}');\n` +
            `// Patch argv so openclaw's isMainModule() recognizes this as the main entry.\n` +
            `// In standard Node.js: process.argv = [execPath, scriptPath, ...args]\n` +
            `// Some Electron launch paths provide process.argv = [execPath, ...args] (no scriptPath)\n` +
            `// We must detect which layout we have to avoid overwriting the 'gateway' command arg.\n` +
            `// Use fs.realpathSync to resolve symlinks/junctions so that e.g.\n` +
            `// "...current/gateway-launcher.cjs" (junction) matches "...win-x64/gateway-launcher.cjs".\n` +
            `const _realpath = (p) => { try { return fs.realpathSync(path.resolve(p)); } catch { return path.resolve(p); } };\n` +
            `const _launcherInArgv = process.argv[1] &&\n` +
            `  _realpath(process.argv[1]).toLowerCase() === _realpath(__filename).toLowerCase();\n` +
            `if (_launcherInArgv) {\n` +
            `  process.argv[1] = esmEntry;\n` +
            `} else {\n` +
            `  process.argv.splice(1, 0, esmEntry);\n` +
            `}\n` +
            `process.stderr.write('[openclaw-launcher] argv=' + JSON.stringify(process.argv) + '\\n');\n` +
            `process.stderr.write('[openclaw-launcher] node=' + process.versions.node + '\\n');\n` +
            `// Keep the event loop alive while openclaw's fire-and-forget import chain\n` +
            `// loads its full module graph and starts the gateway server. Without this,\n` +
            `// Electron child launchers may exit before the async work completes.\n` +
            `const _keepAlive = setInterval(() => {}, 30000);\n` +
            `const t0 = Date.now();\n` +
            `// Strategy 1: Try the esbuild single-file bundle via dynamic import().\n` +
            `// The bundle collapses ~1100 ESM modules into one file, eliminating the\n` +
            `// expensive ESM module resolution overhead in Electron child processes.\n` +
            `// We use import() (not require()) to avoid the ESM loader re-entrancy lock\n` +
            `// that causes microtask deadlocks when require(esm) is used.\n` +
            `const bundlePath = path.join(__dirname, 'gateway-bundle.mjs');\n` +
            `if (fs.existsSync(bundlePath)) {\n` +
            `  // Patch argv[1] to the bundle path so openclaw's isMainModule() matches.\n` +
            `  // isMainModule compares basename(import.meta.url) with basename(argv[1]);\n` +
            `  // both will be "gateway-bundle.mjs", satisfying the basename equality check.\n` +
            `  // argv[1] was already patched to esmEntry above; just overwrite it.\n` +
            `  process.argv[1] = bundlePath;\n` +
            `  process.stderr.write('[openclaw-launcher] argv(patched for bundle)=' + JSON.stringify(process.argv) + '\\n');\n` +
            `  const bundleUrl = pathToFileURL(bundlePath).href;\n` +
            `  process.stderr.write('[openclaw-launcher] loading bundle via import(): ' + bundleUrl + '\\n');\n` +
            `  import(bundleUrl).then(() => {\n` +
            `    process.stderr.write('[openclaw-launcher] import(gateway-bundle.mjs) ok (' + (Date.now() - t0) + 'ms)\\n');\n` +
            `    try { require('node:module').flushCompileCache(); } catch (_) {}\n` +
            `  }).catch((err) => {\n` +
            `    process.stderr.write('[openclaw-launcher] import(gateway-bundle.mjs) failed (' + (Date.now() - t0) + 'ms): ' + (err.stack || err) + '\\n');\n` +
            `    process.stderr.write('[openclaw-launcher] Falling back to multi-file dist...\\n');\n` +
            `    return _loadFallback();\n` +
            `  });\n` +
            `} else {\n` +
            `  _loadFallback();\n` +
            `}\n` +
            `// Fallback: load the original multi-file dist.\n` +
            `function _loadFallback() {\n` +
            `  try {\n` +
            `    try {\n` +
            `      const wf = require('./dist/warning-filter.js');\n` +
            `      if (typeof wf.installProcessWarningFilter === 'function') {\n` +
            `        wf.installProcessWarningFilter();\n` +
            `      }\n` +
            `    } catch (_) {}\n` +
            `    require('./dist/entry.js');\n` +
            `    process.stderr.write('[openclaw-launcher] require(entry.js) ok (' + (Date.now() - t0) + 'ms)\\n');\n` +
            `    try { require('node:module').flushCompileCache(); } catch (_) {}\n` +
            `  } catch (err) {\n` +
            `    process.stderr.write('[openclaw-launcher] require(entry.js) failed (' + (Date.now() - t0) + 'ms): ' + err.message + '\\n');\n` +
            `    const entryPath = path.join(__dirname, 'dist', 'entry.js');\n` +
            `    const importUrl = pathToFileURL(entryPath).href;\n` +
            `    process.stderr.write('[openclaw-launcher] falling back to import(): ' + importUrl + '\\n');\n` +
            `    import(importUrl).then(() => {\n` +
            `      process.stderr.write('[openclaw-launcher] import() ok (' + (Date.now() - t0) + 'ms)\\n');\n` +
            `    }).catch((err2) => {\n` +
            `      process.stderr.write('[openclaw-launcher] ERROR (' + (Date.now() - t0) + 'ms): ' + (err2.stack || err2) + '\\n');\n` +
            `      process.exit(1);\n` +
            `    });\n` +
            `  }\n` +
            `}\n`;
        try {
            const existing = fs_1.default.existsSync(launcherPath) ? fs_1.default.readFileSync(launcherPath, 'utf8') : '';
            if (existing !== expectedContent) {
                fs_1.default.writeFileSync(launcherPath, expectedContent, 'utf8');
                console.log(`[Engine] Generated gateway-launcher.cjs for Windows ESM compat`);
            }
        }
        catch (err) {
            console.error('[Engine] Failed to write gateway-launcher.cjs:', err);
            return esmEntry;
        }
        return launcherPath;
    }
    /**
     * Generate a simplified CJS launcher that loads gateway-bundle.mjs directly.
     * Unlike ensureGatewayLauncherCjs(), this version does not include a fallback
     * to dist/entry.js because the bundle is guaranteed to exist.
     */
    ensureGatewayLauncherCjsForBundle(runtimeRoot) {
        const launcherPath = path_1.default.join(runtimeRoot, 'gateway-launcher.cjs');
        const expectedContent = `// Auto-generated CJS launcher for Windows — bundle-only mode.\n` +
            `// Loads gateway-bundle.mjs directly without dist/ fallback.\n` +
            `const { pathToFileURL } = require('node:url');\n` +
            `const path = require('node:path');\n` +
            `const fs = require('node:fs');\n` +
            `const _log = (msg) => process.stderr.write('[openclaw-launcher] ' + msg + '\\n');\n` +
            `const _t0 = Date.now();\n` +
            `const _elapsed = () => (Date.now() - _t0) + 'ms';\n` +
            `// ─── Compile cache setup ───\n` +
            `try {\n` +
            `  const { enableCompileCache, getCompileCacheDir } = require('node:module');\n` +
            `  const _ccDir = path.join(process.env.OPENCLAW_STATE_DIR || __dirname, '.compile-cache');\n` +
            `  enableCompileCache(_ccDir);\n` +
            `  _log('compile-cache dir=' + getCompileCacheDir());\n` +
            `} catch (_) {}\n` +
            `// ─── Load bundle ───\n` +
            `const bundlePath = path.join(__dirname, 'gateway-bundle.mjs');\n` +
            `const _realpath = (p) => { try { return fs.realpathSync(path.resolve(p)); } catch { return path.resolve(p); } };\n` +
            `const _launcherInArgv = process.argv[1] &&\n` +
            `  _realpath(process.argv[1]).toLowerCase() === _realpath(__filename).toLowerCase();\n` +
            `if (_launcherInArgv) {\n` +
            `  process.argv[1] = bundlePath;\n` +
            `} else {\n` +
            `  process.argv.splice(1, 0, bundlePath);\n` +
            `}\n` +
            `const _keepAlive = setInterval(() => {}, 30000);\n` +
            `const bundleUrl = pathToFileURL(bundlePath).href;\n` +
            `try { const _sz = fs.statSync(bundlePath).size; _log('bundle size=' + (_sz / 1024 / 1024).toFixed(1) + 'MB'); } catch (_) {}\n` +
            `_log('loading bundle (' + _elapsed() + ')');\n` +
            `import(bundleUrl).then(() => {\n` +
            `  _log('import ok (' + _elapsed() + ')');\n` +
            `}).catch((err) => {\n` +
            `  _log('import failed (' + _elapsed() + '): ' + (err.stack || err));\n` +
            `  process.exit(1);\n` +
            `});\n`;
        try {
            const existing = fs_1.default.existsSync(launcherPath) ? fs_1.default.readFileSync(launcherPath, 'utf8') : '';
            if (existing !== expectedContent) {
                if (existing) {
                    console.log('[Engine] Overwriting existing gateway-launcher.cjs (switching to bundle-only mode)');
                }
                fs_1.default.writeFileSync(launcherPath, expectedContent, 'utf8');
                console.log('[Engine] Generated gateway-launcher.cjs for bundle-only mode');
            }
        }
        catch (err) {
            console.error('[Engine] Failed to write gateway-launcher.cjs:', err);
            // Fall back to the legacy launcher generation
            const esmEntry = findPath([
                path_1.default.join(runtimeRoot, 'openclaw.mjs'),
                path_1.default.join(runtimeRoot, 'gateway.asar', 'openclaw.mjs'),
            ]);
            if (esmEntry)
                return this.ensureGatewayLauncherCjs(runtimeRoot, esmEntry);
            return launcherPath;
        }
        return launcherPath;
    }
    resolveGatewayClientEntry(runtimeRoot) {
        const distRoots = [
            path_1.default.join(runtimeRoot, 'dist'),
            path_1.default.join(runtimeRoot, 'gateway.asar', 'dist'),
        ];
        for (const distRoot of distRoots) {
            const clientEntry = this.findGatewayClientEntryFromDistRoot(distRoot);
            if (clientEntry) {
                return clientEntry;
            }
        }
        return null;
    }
    findGatewayClientEntryFromDistRoot(distRoot) {
        // v2026.4.5+: GatewayClient is exported via the plugin-sdk public subpath
        // (openclaw/plugin-sdk/gateway-runtime). The class is no longer in a
        // standalone client-*.js chunk — it was merged into a shared chunk with
        // minified export names (e.g. `n, r, t`), which breaks duck-type detection
        // in loadGatewayClientCtor(). The plugin-sdk barrel re-exports the named
        // `GatewayClient` symbol, so we prefer this stable entry point.
        const pluginSdkGatewayRuntime = path_1.default.join(distRoot, 'plugin-sdk', 'gateway-runtime.js');
        if (fs_1.default.existsSync(pluginSdkGatewayRuntime)) {
            return pluginSdkGatewayRuntime;
        }
        // Pre-v2026.4.5: GatewayClient lived in a dedicated file under dist/.
        const gatewayClient = path_1.default.join(distRoot, 'gateway', 'client.js');
        if (fs_1.default.existsSync(gatewayClient)) {
            return gatewayClient;
        }
        const directClient = path_1.default.join(distRoot, 'client.js');
        if (fs_1.default.existsSync(directClient)) {
            return directClient;
        }
        // Last resort: match any client-*.js file in dist root. Note that since
        // v2026.4.5 this may resolve to an unrelated RPC utilities chunk, so this
        // fallback is only meaningful for older versions.
        try {
            if (!fs_1.default.existsSync(distRoot) || !fs_1.default.statSync(distRoot).isDirectory()) {
                return null;
            }
            const candidates = fs_1.default.readdirSync(distRoot)
                .filter((name) => /^client(?:-.*)?\.js$/i.test(name))
                .sort();
            if (candidates.length > 0) {
                return path_1.default.join(distRoot, candidates[0]);
            }
        }
        catch {
            // ignore
        }
        return null;
    }
    ensureGatewayToken() {
        try {
            const existing = fs_1.default.readFileSync(this.gatewayTokenPath, 'utf8').trim();
            if (existing) {
                return existing;
            }
        }
        catch {
            // ignore
        }
        const token = crypto_1.default.randomBytes(24).toString('hex');
        ensureDir(path_1.default.dirname(this.gatewayTokenPath));
        fs_1.default.writeFileSync(this.gatewayTokenPath, token, 'utf8');
        return token;
    }
    getGatewayToken() {
        return this.readGatewayToken();
    }
    /**
     * The token a local automation presents to wake an agent.
     *
     * Separate from the gateway token on purpose. The gateway token can
     * drive the whole engine; this one can only post an event. Something
     * that needs to trigger a routine should not be handed the keys to
     * everything, and a script somebody pastes a token into is exactly the
     * place that distinction earns its keep.
     *
     * Generated once and kept. Rotating it on every start would break
     * every automation somebody had set up, silently, at the worst moment.
     */
    ensureHookToken() {
        try {
            const existing = fs_1.default.readFileSync(this.hookTokenPath, 'utf8').trim();
            if (existing)
                return existing;
        }
        catch {
            // Not written yet.
        }
        const token = crypto_1.default.randomBytes(24).toString('hex');
        ensureDir(path_1.default.dirname(this.hookTokenPath));
        fs_1.default.writeFileSync(this.hookTokenPath, token, { encoding: 'utf8', mode: 0o600 });
        return token;
    }
    readGatewayToken() {
        try {
            const token = fs_1.default.readFileSync(this.gatewayTokenPath, 'utf8').trim();
            return token || null;
        }
        catch {
            return null;
        }
    }
    ensureConfigFile() {
        ensureDir(path_1.default.dirname(this.configPath));
        if (!fs_1.default.existsSync(this.configPath)) {
            fs_1.default.writeFileSync(this.configPath, JSON.stringify({ gateway: { mode: 'local' } }, null, 2) + '\n', 'utf8');
            return;
        }
        // Ensure gateway.mode is set even if config already exists
        try {
            const raw = fs_1.default.readFileSync(this.configPath, 'utf8');
            const config = JSON.parse(raw);
            if (!config.gateway?.mode) {
                config.gateway = { ...config.gateway, mode: 'local' };
                fs_1.default.writeFileSync(this.configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
            }
        }
        catch {
            // ignore parse errors
        }
    }
    writeGatewayPort(port) {
        fs_1.default.writeFileSync(this.gatewayPortPath, JSON.stringify({ port, updatedAt: Date.now() }, null, 2), 'utf8');
    }
    readGatewayPort() {
        const payload = parseJsonFile(this.gatewayPortPath);
        if (!payload || typeof payload.port !== 'number' || !Number.isInteger(payload.port)) {
            return null;
        }
        if (payload.port <= 0 || payload.port > 65535) {
            return null;
        }
        return payload.port;
    }
    async resolveGatewayPort() {
        const candidates = [];
        candidates.push(DEFAULT_GATEWAY_PORT);
        if (this.gatewayPort)
            candidates.push(this.gatewayPort);
        const persisted = this.readGatewayPort();
        if (persisted)
            candidates.push(persisted);
        const uniqCandidates = Array.from(new Set(candidates));
        for (const candidate of uniqCandidates) {
            if (await isPortAvailable(candidate)) {
                return candidate;
            }
        }
        // Scan ports in parallel batches of 10 for faster resolution.
        const BATCH_SIZE = 10;
        for (let batch = 0; batch * BATCH_SIZE < GATEWAY_PORT_SCAN_LIMIT; batch += 1) {
            const batchStart = DEFAULT_GATEWAY_PORT + batch * BATCH_SIZE + 1;
            const batchEnd = Math.min(batchStart + BATCH_SIZE, DEFAULT_GATEWAY_PORT + GATEWAY_PORT_SCAN_LIMIT + 1);
            const portBatch = Array.from({ length: batchEnd - batchStart }, (_, i) => batchStart + i);
            const results = await Promise.all(portBatch.map(async (p) => (await isPortAvailable(p)) ? p : null));
            const available = results.find((p) => p !== null);
            if (available != null) {
                return available;
            }
        }
        throw new Error('No available loopback port for the engine.');
    }
    async isGatewayHealthy(port, verbose = false) {
        const probeUrls = [
            `http://127.0.0.1:${port}/health`,
            `http://127.0.0.1:${port}/healthz`,
            `http://127.0.0.1:${port}/ready`,
            `http://127.0.0.1:${port}/`,
        ];
        // Run all HTTP probes in parallel and resolve as soon as any succeeds.
        // Previously these ran sequentially, costing up to 4*1200ms per tick.
        const httpResults = [];
        const httpProbes = probeUrls.map(async (url, i) => {
            try {
                const response = await fetchWithTimeout(url, 1500);
                if (verbose)
                    httpResults[i] = `${url} → ${response.status}`;
                if (response.status < 500)
                    return true;
            }
            catch (err) {
                if (verbose)
                    httpResults[i] = `${url} → ${err.message || err}`;
            }
            return false;
        });
        // Also probe TCP reachability in parallel as fallback.
        const tcpProbe = isPortReachable('127.0.0.1', port, 1500);
        const results = await Promise.all([...httpProbes, tcpProbe]);
        const healthy = results.some(Boolean);
        if (verbose && !healthy) {
            const tcpResult = results[results.length - 1] ? 'reachable' : 'unreachable';
            console.log(`[Engine] health probe details: tcp=${tcpResult}, ${httpResults.join(', ')}`);
        }
        return healthy;
    }
    waitForGatewayReady(port, timeoutMs) {
        const startedAt = Date.now();
        let pollCount = 0;
        return new Promise((resolve) => {
            const tick = async () => {
                if (this.shutdownRequested) {
                    console.log('[Engine] waitForGatewayReady: shutdown requested, giving up');
                    resolve(false);
                    return;
                }
                if (!this.gatewayProcess) {
                    console.log('[Engine] waitForGatewayReady: gateway process is gone (exited early), giving up');
                    resolve(false);
                    return;
                }
                pollCount += 1;
                const elapsedMs = Date.now() - startedAt;
                // Log verbose probe details every 10 polls (~6s) to diagnose health check failures.
                const verboseProbe = pollCount % 10 === 0;
                const healthy = await this.isGatewayHealthy(port, verboseProbe);
                if (healthy) {
                    console.log(`[Engine] waitForGatewayReady: gateway healthy after ${elapsedMs}ms (${pollCount} polls)`);
                    resolve(true);
                    return;
                }
                if (elapsedMs >= timeoutMs) {
                    console.log(`[Engine] waitForGatewayReady: timed out after ${timeoutMs}ms (${pollCount} polls)`);
                    resolve(false);
                    return;
                }
                // Update progress from 10% → 90% during the wait, so the UI shows meaningful feedback.
                const progress = Math.min(90, 10 + Math.round((elapsedMs / timeoutMs) * 80));
                this.setStatus({
                    phase: 'starting',
                    version: this.status.version,
                    progressPercent: progress,
                    message: `Starting the engine... (${Math.round(elapsedMs / 1000)}s)`,
                    canRetry: false,
                });
                if (pollCount % 5 === 0) {
                    console.log(`[Engine] waitForGatewayReady: poll #${pollCount}, elapsed=${elapsedMs}ms, progress=${progress}%`);
                }
                setTimeout(() => {
                    void tick();
                }, 600);
            };
            void tick();
        });
    }
    stopGatewayProcess(child) {
        const pid = 'pid' in child ? child.pid : undefined;
        console.log(`${gwDiagTs()} stopGatewayProcess: sending graceful kill to pid=${pid}`);
        this.expectedGatewayExits.add(child);
        return new Promise((resolve) => {
            // Already exited — resolve immediately.
            if ('exitCode' in child && child.exitCode !== null) {
                resolve();
                return;
            }
            const timeoutMs = 5_000;
            let settled = false;
            const done = () => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(forceTimer);
                resolve();
            };
            // Listen for exit (ChildProcess) or exit (UtilityProcess).
            child.once('exit', done);
            // First attempt: graceful kill.
            try {
                child.kill();
            }
            catch {
                // ignore
            }
            // Fallback: force-kill after 1.2s if still alive, then hard-timeout at 5s.
            const forceTimer = setTimeout(() => {
                console.log(`${gwDiagTs()} stopGatewayProcess: graceful kill timed out after 1.2s, force-killing pid=${pid}`);
                try {
                    if ('pid' in child && typeof child.pid === 'number') {
                        child.kill();
                    }
                }
                catch {
                    // ignore
                }
                // Guarantee we don't block shutdown forever.
                setTimeout(done, 2_000);
            }, 1_200);
            // Hard timeout: always resolve within timeoutMs.
            setTimeout(done, timeoutMs);
        });
    }
    // Workaround: Electron child-process logs can contain UTC timestamps.
    static rewriteUtcTimestamps(text) {
        return text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, (utc) => {
            const d = new Date(utc);
            if (Number.isNaN(d.getTime()))
                return utc;
            const pad = (n) => String(n).padStart(2, '0');
            const ms = String(d.getMilliseconds()).padStart(3, '0');
            const offsetMin = -d.getTimezoneOffset();
            const sign = offsetMin >= 0 ? '+' : '-';
            const absH = Math.floor(Math.abs(offsetMin) / 60);
            const absM = Math.abs(offsetMin) % 60;
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}${sign}${pad(absH)}:${pad(absM)}`;
        });
    }
    attachGatewayProcessLogs(child) {
        ensureDir(this.logsDir);
        this.pruneGatewayLogsIfNeeded();
        const appendRecentOutput = (chunk, stream) => {
            const text = typeof chunk === 'string' ? chunk : chunk.toString();
            const lines = text
                .split(/\r?\n/)
                .map((line) => line.trimEnd())
                .filter((line) => line.length > 0)
                .map((line) => `[${stream}] ${line}`);
            if (lines.length === 0)
                return;
            const recent = this.gatewayRecentOutput.get(child) ?? [];
            recent.push(...lines);
            if (recent.length > GATEWAY_RECENT_OUTPUT_LINE_LIMIT) {
                recent.splice(0, recent.length - GATEWAY_RECENT_OUTPUT_LINE_LIMIT);
            }
            this.gatewayRecentOutput.set(child, recent);
        };
        const appendLog = (chunk, stream) => {
            appendRecentOutput(chunk, stream);
            this.pruneGatewayLogsIfNeeded();
            const text = typeof chunk === 'string' ? chunk : chunk.toString();
            const line = `[${new Date().toISOString()}] [${stream}] ${text}`;
            fs_1.default.appendFile(this.getGatewayLogPath(), line, () => {
                // best-effort log append
            });
        };
        // Log elapsed time when gateway emits key startup milestones.
        // This fills the observability gap between "import ok" and "[gateway] ready".
        const logStartupMilestone = (text) => {
            if (!this.gatewaySpawnedAt)
                return;
            if (/\[gateway\]/.test(text)) {
                const elapsed = Date.now() - this.gatewaySpawnedAt;
                const summary = text.replace(/\n+$/g, '').split('\n')[0].trim();
                console.log(`[Engine] startup milestone (${elapsed}ms since spawn): ${summary}`);
            }
        };
        child.stdout?.on('data', (chunk) => {
            appendLog(chunk, 'stdout');
            const text = typeof chunk === 'string' ? chunk : chunk.toString();
            logStartupMilestone(text);
            console.log(`[Engine stdout] ${OpenClawEngineManager.rewriteUtcTimestamps(text)}`);
        });
        child.stderr?.on('data', (chunk) => {
            appendLog(chunk, 'stderr');
            const text = typeof chunk === 'string' ? chunk : chunk.toString();
            const recentOutput = (this.gatewayRecentOutput.get(child) ?? []).join('\n');
            this.recordGatewayFatalFailure(child, recentOutput);
            logStartupMilestone(text);
            console.error(`[Engine stderr] ${OpenClawEngineManager.rewriteUtcTimestamps(text)}`);
        });
    }
    recordGatewayFatalFailure(child, output) {
        if (!(0, exports.isOpenClawGatewayHeapOutOfMemory)(output))
            return;
        const existing = this.gatewayFailureByProcess.get(child);
        if (existing?.kind === constants_2.OpenClawGatewayFailureKind.HeapOutOfMemory)
            return;
        const failure = {
            generation: this.gatewayGenerationByProcess.get(child) ?? this.gatewayGeneration,
            kind: constants_2.OpenClawGatewayFailureKind.HeapOutOfMemory,
            detectedAt: Date.now(),
        };
        this.gatewayFailureByProcess.set(child, failure);
        this.lastGatewayFailure = failure;
        console.error(`${gwDiagTs()} gateway fatal failure detected: `
            + `generation=${failure.generation}, kind=${failure.kind}`);
    }
    attachGatewayExitHandlers(child) {
        child.once('error', (...args) => {
            const errorMsg = args[0] instanceof Error
                ? args[0].message
                : `${args[0]}${args[1] ? ` (${args[1]})` : ''}`;
            console.error(`${gwDiagTs()} gateway process error event: ${errorMsg}`);
            // Don't delete from expectedGatewayExits here — the 'exit' event always
            // follows and handles cleanup. Deleting here would cause 'exit' to miss
            // the expected-exit guard, triggering a spurious restart.
            if (this.expectedGatewayExits.has(child))
                return;
            if (this.shutdownRequested)
                return;
            this.setStatus({
                phase: 'error',
                version: this.status.version,
                message: `Engine process error: ${errorMsg}`,
                canRetry: true,
            });
        });
        child.once('exit', (code, signal) => {
            console.log(`${gwDiagTs()} gateway process exited with code=${code}, signal=${signal ?? 'none'}`);
            const recentOutput = (this.gatewayRecentOutput.get(child) ?? []).join('\n');
            this.gatewayRecentOutput.delete(child);
            if (this.gatewayProcess === child) {
                this.gatewayProcess = null;
                // A self-restart never exits the process; if it exited anyway the
                // self-restart failed and normal crash handling owns recovery.
                this.clearGatewaySelfRestart();
            }
            if (this.expectedGatewayExits.has(child)) {
                this.expectedGatewayExits.delete(child);
                return;
            }
            if (this.shutdownRequested)
                return;
            let tail = recentOutput;
            try {
                tail = tail || fs_1.default.readFileSync(this.getGatewayLogPath(), 'utf8').split('\n').slice(-30).join('\n');
                console.error(`${gwDiagTs()} gateway log tail (last 30 lines before crash):\n${tail}`);
            }
            catch { /* log file may not exist */ }
            this.recordGatewayFatalFailure(child, tail);
            const detectedFailure = this.gatewayFailureByProcess.get(child);
            const processFailure = detectedFailure
                ? { ...detectedFailure, exitCode: code }
                : null;
            if (processFailure) {
                this.gatewayFailureByProcess.set(child, processFailure);
                this.lastGatewayFailure = processFailure;
            }
            if ((0, exports.isOpenClawConfigStartupFailure)(tail)) {
                console.error(`${gwDiagTs()} gateway exited during startup because OpenClaw config is invalid; auto-restart suppressed`);
                this.gatewayRestartAttempt = 0;
                this.setStatus({
                    phase: 'error',
                    version: this.status.version,
                    message: 'The engine could not start because openclaw.json is invalid. Repair the config or use Quick Repair before restarting.',
                    canRetry: true,
                });
                return;
            }
            if (processFailure?.kind === constants_2.OpenClawGatewayFailureKind.HeapOutOfMemory) {
                this.setStatus({
                    phase: 'error',
                    version: this.status.version,
                    message: `The engine ran out of JavaScript heap memory (code=${code ?? 'null'}).`,
                    canRetry: true,
                });
                this.scheduleGatewayRestart();
                return;
            }
            this.setStatus({
                phase: 'error',
                version: this.status.version,
                message: `The engine exited unexpectedly (code=${code ?? 'null'}).`,
                canRetry: true,
            });
            this.scheduleGatewayRestart();
        });
    }
    scheduleGatewayRestart() {
        if (this.shutdownRequested)
            return;
        if (this.gatewayRestartTimer)
            return;
        if (this.gatewayRestartAttempt >= GATEWAY_MAX_RESTART_ATTEMPTS) {
            console.error(`${gwDiagTs()} gateway auto-restart limit reached (${GATEWAY_MAX_RESTART_ATTEMPTS} attempts), giving up`);
            this.setStatus({
                phase: 'error',
                version: this.status.version,
                message: `The engine failed to start after ${GATEWAY_MAX_RESTART_ATTEMPTS} attempts. Check model configuration or restart manually.`,
                canRetry: true,
            });
            return;
        }
        const delay = GATEWAY_RESTART_DELAYS[Math.min(this.gatewayRestartAttempt, GATEWAY_RESTART_DELAYS.length - 1)];
        this.gatewayRestartAttempt++;
        console.log(`${gwDiagTs()} scheduling gateway restart attempt ${this.gatewayRestartAttempt}/${GATEWAY_MAX_RESTART_ATTEMPTS} in ${delay}ms`);
        console.log(`${gwDiagTs()} restart context: port=${this.gatewayPort ?? 'none'}, configPath=${this.configPath}, stateDir=${this.stateDir}`);
        this.gatewayRestartTimer = setTimeout(() => {
            this.gatewayRestartTimer = null;
            if (this.shutdownRequested)
                return;
            void this.startGateway('auto-restart-after-crash');
        }, delay);
    }
    setStatus(next) {
        this.status = {
            ...next,
            message: next.message ? next.message.slice(0, 500) : undefined,
        };
        this.emit('status', this.getStatus());
    }
}
exports.OpenClawEngineManager = OpenClawEngineManager;
//# sourceMappingURL=openclawEngineManager.js.map