#!/usr/bin/env node
/**
 * The cloud computer's supervisor: PID 1 of the container, started by
 * start-simeon-box.
 *
 * What it keeps alive, each restarted with a backoff when it exits:
 *   - the primary desktop on :1 (simeon-desktop brings its pieces up and
 *     registers each one under /tmp/sand-desktop/d1/<name>.json; so does
 *     start-window for a fork desktop under dN/; this process restarts any
 *     registered piece that dies, in order: the X server first, the rest
 *     once it answers);
 *   - the exec daemon on 1337 (/home/box/box-exec-daemon/main.cjs);
 *   - the window router on 1339 and the fork screens' websockify on 6081;
 *   - the host (/home/box/sand-host/host-main.cjs) when the bundle is
 *     mounted, on the gateway port the environment names.
 *
 * What it writes, every tick (5 s), where the host reads it:
 *   - /tmp/sand-supervisor/desktop-health.json, the shape
 *     desktop-health-forwarder.ts parses: {updatedAtMs, revision,
 *     supervisionEnabled, total, up, down, crashlooping, restartsInWindow,
 *     components:[{name:"d1/xvfb", up, crashloop, restartsInWindow,
 *     downReason?}]};
 *   - /tmp/sand-supervisor/status.json, for anyone reading the box;
 *   - /home/box/sand-data/.sand-host-crash.json when the host dies
 *     unexpectedly (the host forwards it as telemetry).
 *
 * What it reads: /tmp/sand-supervisor/command.json, a one-slot mailbox
 * {id, kind: "ping" | "restart" | "upgrade", ...} acknowledged by writing
 * /tmp/sand-supervisor/acks/<id>. "restart" restarts the host; "upgrade" is
 * answered with a log line and an ack: on Simeon's cloud a new host bundle
 * is a new container with the new bundle mounted (docs/services-core.md),
 * never a swap inside a running one (the bundle is mounted read-only).
 *
 * Logs to stdout, one line per event, prefixed [simeon-supervisor]; the
 * container's log is the record. On SIGTERM it stops everything and exits.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const SUPERVISOR_DIR = "/tmp/sand-supervisor";
const COMMAND_PATH = `${SUPERVISOR_DIR}/command.json`;
const ACKS_DIR = `${SUPERVISOR_DIR}/acks`;
const STATUS_PATH = `${SUPERVISOR_DIR}/status.json`;
const DESKTOP_HEALTH_PATH = `${SUPERVISOR_DIR}/desktop-health.json`;
const DESKTOP_DIR = "/tmp/sand-desktop";
const DATA_ROOT = process.env.SAND_DATA_ROOT?.trim() || "/home/box/sand-data";
const CRASH_MARKER_PATH = `${DATA_ROOT}/.sand-host-crash.json`;
const HOST_DIR = "/home/box/sand-host";
const HOST_MAIN = `${HOST_DIR}/host-main.cjs`;
const HOST_VERSION_PATH = `${HOST_DIR}/version`;
const HOST_LOG = "/tmp/sand-host.log";
const EXEC_DAEMON_MAIN = "/home/box/box-exec-daemon/main.cjs";
const EXEC_DAEMON_PORT = 1337;
const ROUTER_PORT = 1339;
const FORK_EXEC_BASE = 14000;
const FORK_NOVNC_PORT = 6081;
const NOVNC_TOKEN_DIR = "/tmp/sand-novnc-tokens.d";

const TICK_MS = numberFromEnv("SIMEON_SUPERVISOR_TICK_MS", 5_000, 250);
const RESTART_WINDOW_MS = numberFromEnv("SAND_DESKTOP_RESTART_WINDOW_MS", 600_000, 1_000);
const MAX_RESTARTS_IN_WINDOW = numberFromEnv("SAND_DESKTOP_MAX_RESTARTS", 8, 1);
const HOST_SUPERVISION = process.env.SAND_SUPERVISOR_ENABLED === "1" || process.env.SAND_SUPERVISOR_ENABLED == null;
const DESKTOP_SUPERVISION = !["1", "true", "yes"].includes((process.env.SAND_DESKTOP_SUPERVISION_DISABLED ?? "").trim().toLowerCase());

function numberFromEnv(name, fallback, minimum) {
  const raw = process.env[name]?.trim();
  if (raw == null || raw.length === 0 || !/^\d+$/.test(raw)) return fallback;
  return Math.max(minimum, Number.parseInt(raw, 10));
}

function log(message) {
  process.stdout.write(`[simeon-supervisor] ${new Date().toISOString()} ${message}\n`);
}

function writeAtomic(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  const part = `${file}.part`;
  writeFileSync(part, content);
  renameSync(part, file);
}

function readText(file) {
  try { return readFileSync(file, "utf8"); } catch { return null; }
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function portListening(port, host = "127.0.0.1") {
  return new Promise(resolve => {
    const socket = net.connect({ port, host });
    const done = value => { socket.destroy(); resolve(value); };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(500, () => done(false));
  });
}

function openLog(file) {
  try { return openSync(file, "a"); } catch { return "ignore"; }
}

/** One process this supervisor owns outright (not read from the registry). */
class Service {
  constructor({ name, argv, env = {}, logFile, cwd = "/", port, onExit, oneShotMarker }) {
    this.name = name; this.argv = argv; this.env = env; this.logFile = logFile; this.cwd = cwd; this.port = port; this.onExit = onExit;
    // A one-shot service (the desktop bring-up) is run again only when its
    // marker is gone, never because it finished.
    this.oneShotMarker = oneShotMarker;
    this.child = undefined; this.startedAt = 0; this.exits = []; this.nextStartAt = 0; this.backoffMs = 1_000; this.stopping = false; this.lastExitCode = undefined;
  }
  get running() { return this.child != null && this.child.exitCode == null && this.child.signalCode == null; }
  get restartsInWindow() { const since = Date.now() - RESTART_WINDOW_MS; this.exits = this.exits.filter(at => at >= since); return this.exits.length; }
  get crashloop() { return this.restartsInWindow >= MAX_RESTARTS_IN_WINDOW; }
  start() {
    if (this.running || this.stopping) return;
    const fd = this.logFile == null ? "inherit" : openLog(this.logFile);
    this.child = spawn(this.argv[0], this.argv.slice(1), { cwd: this.cwd, env: { ...process.env, ...this.env }, stdio: ["ignore", fd, fd], detached: true });
    this.startedAt = Date.now();
    const pid = this.child.pid;
    log(`${this.name}: started pid ${pid}${this.port == null ? "" : ` (port ${this.port})`}`);
    this.child.once("exit", (code, signal) => {
      const uptime = Date.now() - this.startedAt;
      this.lastExitCode = code;
      if (this.oneShotMarker != null && code === 0) { log(`${this.name}: done`); this.nextStartAt = Date.now() + 5_000; return; }
      log(`${this.name}: exited (code ${code}, signal ${signal}) after ${Math.round(uptime / 1000)} s`);
      this.exits.push(Date.now());
      if (uptime >= 60_000) this.backoffMs = 1_000;
      this.nextStartAt = Date.now() + this.backoffMs;
      this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
      this.onExit?.({ code, signal, uptime, pid });
    });
  }
  tick() {
    if (this.running || this.stopping) return;
    if (this.oneShotMarker != null && this.lastExitCode === 0 && existsSync(this.oneShotMarker)) return;
    if (this.crashloop) return;
    if (Date.now() >= this.nextStartAt) this.start();
  }
  stop() {
    this.stopping = true;
    if (!this.running) return;
    try { process.kill(-this.child.pid, "SIGTERM"); } catch { try { this.child.kill("SIGTERM"); } catch {} }
  }
  kill() {
    if (!this.running) return;
    try { process.kill(-this.child.pid, "SIGKILL"); } catch { try { this.child.kill("SIGKILL"); } catch {} }
  }
  restart(reason) {
    log(`${this.name}: restart (${reason})`);
    this.exits = []; this.backoffMs = 1_000; this.nextStartAt = 0;
    if (this.running) { try { process.kill(-this.child.pid, "SIGTERM"); } catch {} }
  }
}

/** A desktop piece registered by simeon-desktop or start-window. */
class RegisteredComponent {
  constructor(id) { this.id = id; this.spec = undefined; this.exits = []; this.nextStartAt = 0; this.backoffMs = 1_000; this.downReason = undefined; this.pid = undefined; }
  get restartsInWindow() { const since = Date.now() - RESTART_WINDOW_MS; this.exits = this.exits.filter(at => at >= since); return this.exits.length; }
  get crashloop() { return this.restartsInWindow >= MAX_RESTARTS_IN_WINDOW; }
  readPid() {
    const text = readText(this.spec.pidFile);
    const pid = text == null ? NaN : Number.parseInt(text.trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : undefined;
  }
  async up() {
    const pid = this.readPid();
    this.pid = pid;
    if (pid == null || !isAlive(pid)) return false;
    if (this.spec.listenPort != null && !(await portListening(this.spec.listenPort))) { this.downReason = "port-not-listening"; return false; }
    return true;
  }
  respawn() {
    const spec = this.spec;
    const fd = openLog(spec.logFile);
    let child;
    try {
      child = spawn(spec.argv[0], spec.argv.slice(1), { cwd: "/", env: { ...process.env, ...spec.env }, stdio: ["ignore", fd, fd], detached: true });
    } catch (error) {
      log(`${this.id}: could not restart: ${error.message}`);
      this.downReason = "unknown";
      return;
    }
    child.unref();
    child.once("exit", (code, signal) => { this.downReason = signal != null ? `signal-${signal}` : `exit-${code}`; });
    writeFileSync(spec.pidFile, String(child.pid));
    this.pid = child.pid;
    this.exits.push(Date.now());
    this.nextStartAt = Date.now() + this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
    log(`${this.id}: restarted as pid ${child.pid} (${this.restartsInWindow} restarts in the last ${RESTART_WINDOW_MS / 60_000} min)`);
  }
}

function readRegistry() {
  const specs = new Map();
  let groups = [];
  try { groups = readdirSync(DESKTOP_DIR, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name); } catch { return specs; }
  for (const group of groups) {
    let files = [];
    try { files = readdirSync(path.join(DESKTOP_DIR, group)).filter(name => name.endsWith(".json") && !name.startsWith(".")); } catch { continue; }
    for (const file of files) {
      const text = readText(path.join(DESKTOP_DIR, group, file));
      if (text == null) continue;
      let parsed;
      try { parsed = JSON.parse(text); } catch { continue; }
      if (!Array.isArray(parsed?.argv) || parsed.argv.length === 0 || parsed.argv.some(item => typeof item !== "string" || item.length === 0)) continue;
      const name = file.slice(0, -".json".length);
      const env = {};
      for (const [key, value] of Object.entries(parsed.env ?? {})) if (typeof value === "string" && value.length > 0) env[key] = value;
      specs.set(`${group}/${name}`, {
        group, name,
        order: Number.isInteger(parsed.order) ? parsed.order : 0,
        logFile: typeof parsed.logFile === "string" && parsed.logFile.length > 0 ? parsed.logFile : `/tmp/${group}-${name}.log`,
        pidFile: typeof parsed.pidFile === "string" && parsed.pidFile.length > 0 ? parsed.pidFile : path.join(DESKTOP_DIR, group, `${name}.pid`),
        env, argv: parsed.argv,
        listenPort: Number.isInteger(parsed.listenPort) && parsed.listenPort > 0 && parsed.listenPort < 65536 ? parsed.listenPort : undefined,
      });
    }
  }
  return specs;
}

class Supervisor {
  constructor() {
    this.services = [];
    this.components = new Map();
    this.healthRevision = 0;
    this.lastHealthKey = "";
    this.appliedCommands = new Set();
    this.stopping = false;
    this.host = undefined;
    this.hostStopRequested = false;
  }

  start() {
    mkdirSync(ACKS_DIR, { recursive: true });
    mkdirSync(NOVNC_TOKEN_DIR, { recursive: true });
    log(`started (tick ${TICK_MS} ms, host supervision ${HOST_SUPERVISION ? "on" : "off"}, desktop supervision ${DESKTOP_SUPERVISION ? "on" : "off"}, host bundle ${existsSync(HOST_MAIN) ? "present" : "absent"}, exec daemon ${existsSync(EXEC_DAEMON_MAIN) ? "present" : "absent"})`);

    this.services.push(new Service({
      name: "desktop :1",
      argv: ["/usr/local/bin/simeon-desktop"],
      env: { DISPLAY: ":1" },
      logFile: "/tmp/start-desktop.log",
      oneShotMarker: `${DESKTOP_DIR}/d1/xvfb.json`,
    }));
    if (existsSync(EXEC_DAEMON_MAIN)) {
      this.services.push(new Service({
        name: "exec daemon",
        argv: ["/usr/bin/env", "-u", "SAND_GATEWAY_TOKEN", "-u", "SAND_INFERENCE_RENEWAL_CREDENTIAL", "node", EXEC_DAEMON_MAIN],
        env: { DISPLAY: ":1", SAND_BOX_WORKSPACE_ROOT: "/workspace", SAND_BOX_EXEC_DAEMON_PORT: String(EXEC_DAEMON_PORT), SAND_BOX_TERMINALS_DIRECTORY: "/tmp/sand-box-terminals" },
        cwd: "/workspace",
        logFile: "/tmp/exec-daemon.log",
        port: EXEC_DAEMON_PORT,
      }));
    } else {
      log(`no exec daemon at ${EXEC_DAEMON_MAIN}: shells, files, screenshots and clicks are unavailable until a container is made with the bundle mounted`);
    }
    this.services.push(new Service({
      name: "window router",
      argv: ["node", "/usr/local/bin/simeon-window-router.mjs", String(ROUTER_PORT), String(EXEC_DAEMON_PORT), String(FORK_EXEC_BASE)],
      logFile: "/tmp/sand-window-router.log",
      port: ROUTER_PORT,
    }));
    this.services.push(new Service({
      name: "fork websockify",
      argv: ["websockify", "--web=/usr/share/novnc", "--heartbeat=30", "--token-plugin", "TokenFile", "--token-source", NOVNC_TOKEN_DIR, `0.0.0.0:${FORK_NOVNC_PORT}`],
      logFile: "/tmp/novnc-forks.log",
      port: FORK_NOVNC_PORT,
    }));
    if (HOST_SUPERVISION && existsSync(HOST_MAIN)) {
      this.host = new Service({
        name: "host",
        argv: ["node", "--disable-warning=ExperimentalWarning", HOST_MAIN],
        env: { SAND_PACKAGED: "1", SAND_DATA_ROOT: DATA_ROOT, SAND_HOST_IN_BOX: "1", SAND_HOST_LOG_FILE: HOST_LOG },
        cwd: HOST_DIR,
        logFile: HOST_LOG,
        port: Number.parseInt(process.env.SAND_HOST_PORT ?? "1340", 10) || 1340,
        onExit: exit => this.recordHostExit(exit),
      });
      this.services.push(this.host);
    }
    for (const service of this.services) service.start();
    this.timer = setInterval(() => { void this.tick(); }, TICK_MS);
    void this.tick();
  }

  recordHostExit({ code, signal, uptime }) {
    if (this.hostStopRequested || this.stopping) { this.hostStopRequested = false; return; }
    if (existsSync(CRASH_MARKER_PATH)) return;
    const marker = {
      schemaVersion: 1,
      errorClass: signal != null ? "signal_exit" : code === 0 ? "unexpected_clean_exit" : "nonzero_exit",
      exitSignal: signal ?? "none",
      ...(code == null ? {} : { exitCode: code }),
      startedAtMs: Date.now() - uptime,
      crashedAtMs: Date.now(),
      uptimeMs: uptime,
    };
    try { writeAtomic(CRASH_MARKER_PATH, JSON.stringify(marker)); } catch (error) { log(`host crash marker write failed: ${error.message}`); }
  }

  async tick() {
    if (this.stopping) return;
    try {
      for (const service of this.services) service.tick();
      if (DESKTOP_SUPERVISION) await this.manageDesktop();
      this.processCommand();
      this.writeHealth();
      this.writeStatus();
    } catch (error) {
      log(`tick failed: ${error.stack ?? error.message}`);
    }
  }

  async manageDesktop() {
    const specs = readRegistry();
    for (const id of [...this.components.keys()]) if (!specs.has(id)) this.components.delete(id);
    const ordered = [...specs.entries()].sort(([a, sa], [b, sb]) => sa.order - sb.order || a.localeCompare(b));
    const rootDown = new Set();
    for (const [id, spec] of ordered) {
      let component = this.components.get(id);
      if (component == null) { component = new RegisteredComponent(id); this.components.set(id, component); }
      component.spec = spec;
      component.downReason = undefined;
      const up = await component.up();
      component.isUp = up;
      if (up) continue;
      if (spec.order !== 0 && rootDown.has(spec.group)) { component.downReason = "awaiting-dependency"; continue; }
      if (spec.order === 0) rootDown.add(spec.group);
      if (component.crashloop) { component.downReason = component.downReason ?? "unknown"; continue; }
      if (Date.now() < component.nextStartAt) continue;
      if (component.downReason == null) component.downReason = "unknown";
      component.respawn();
    }
  }

  processCommand() {
    const text = readText(COMMAND_PATH);
    if (text == null) return;
    let command;
    try { command = JSON.parse(text); } catch { log("command.json unreadable; removed"); unlinkSync(COMMAND_PATH); return; }
    const id = typeof command?.id === "string" ? command.id : "";
    const kind = typeof command?.kind === "string" ? command.kind : "";
    if (id.length === 0 || kind.length === 0) { log("command.json without id or kind; removed"); unlinkSync(COMMAND_PATH); return; }
    const ackPath = path.join(ACKS_DIR, id.replace(/[^a-zA-Z0-9_.-]/g, "_"));
    if (existsSync(ackPath) || this.appliedCommands.has(id)) { unlinkSync(COMMAND_PATH); return; }
    switch (kind) {
      case "ping":
        break;
      case "restart":
        if (this.host != null) { this.hostStopRequested = true; this.host.restart(`command ${id}`); }
        break;
      case "upgrade":
        log(`upgrade ${id} (version ${command.version ?? "?"}): on Simeon's cloud a new host bundle is a new container with the bundle mounted, not a swap inside this one; acknowledged without a swap`);
        break;
      default:
        log(`command ${id}: unknown kind ${kind}; removed`);
        unlinkSync(COMMAND_PATH);
        return;
    }
    writeFileSync(ackPath, String(Date.now()));
    this.appliedCommands.add(id);
    unlinkSync(COMMAND_PATH);
    log(`command ${id} (${kind}) applied`);
    this.lastCommand = { id, kind };
  }

  writeHealth() {
    const components = [];
    if (DESKTOP_SUPERVISION) {
      for (const [id, component] of [...this.components.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        components.push({
          name: id,
          up: component.isUp === true,
          crashloop: component.crashloop,
          restartsInWindow: component.restartsInWindow,
          ...(component.isUp === true || component.downReason == null ? {} : { downReason: component.downReason }),
        });
      }
      for (const service of this.services) {
        if (service === this.host || service.name.startsWith("desktop")) continue;
        const name = service.name === "window router" ? "shared/fork-router" : service.name === "fork websockify" ? "shared/fork-websockify" : `shared/${service.name.replace(/\s+/g, "-")}`;
        components.push({ name, up: service.running, crashloop: service.crashloop, restartsInWindow: service.restartsInWindow, ...(service.running ? {} : { downReason: "unknown" }) });
      }
    }
    const key = JSON.stringify(components.map(component => [component.name, component.up, component.crashloop, component.downReason ?? ""]));
    if (key !== this.lastHealthKey) { this.healthRevision += 1; this.lastHealthKey = key; }
    const up = components.filter(component => component.up).length;
    writeAtomic(DESKTOP_HEALTH_PATH, JSON.stringify({
      updatedAtMs: Date.now(),
      revision: this.healthRevision,
      supervisionEnabled: DESKTOP_SUPERVISION,
      total: components.length,
      up,
      down: components.length - up,
      crashlooping: components.filter(component => component.crashloop).length,
      restartsInWindow: components.reduce((sum, component) => sum + component.restartsInWindow, 0),
      components,
    }));
  }

  writeStatus() {
    writeAtomic(STATUS_PATH, JSON.stringify({
      updatedAtMs: Date.now(),
      pid: process.pid,
      imageVersion: readText("/etc/simeon-box-version")?.trim() ?? null,
      hostBundlePresent: existsSync(HOST_MAIN),
      hostRunning: this.host?.running === true,
      hostVersion: readText(HOST_VERSION_PATH)?.trim() || null,
      execDaemonRunning: this.services.find(service => service.name === "exec daemon")?.running === true,
      services: this.services.map(service => ({ name: service.name, running: service.running, pid: service.child?.pid ?? null, restartsInWindow: service.restartsInWindow })),
      lastCommandId: this.lastCommand?.id ?? null,
      lastCommandKind: this.lastCommand?.kind ?? null,
    }));
  }

  async stop(signal) {
    if (this.stopping) return;
    this.stopping = true;
    clearInterval(this.timer);
    log(`received ${signal}, stopping`);
    this.hostStopRequested = true;
    for (const service of this.services) service.stop();
    for (const component of this.components.values()) { const pid = component.readPid(); if (pid != null && isAlive(pid)) { try { process.kill(-pid, "SIGTERM"); } catch { try { process.kill(pid, "SIGTERM"); } catch {} } } }
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline && this.services.some(service => service.running)) await new Promise(resolve => setTimeout(resolve, 200));
    for (const service of this.services) service.kill();
    try { rmSync(DESKTOP_DIR, { recursive: true, force: true }); } catch {}
    log("stopped");
    process.exit(0);
  }
}

const supervisor = new Supervisor();
process.on("SIGTERM", () => { void supervisor.stop("SIGTERM"); });
process.on("SIGINT", () => { void supervisor.stop("SIGINT"); });
// PID 1 reaps: a child of a child that exits is ours to wait for.
process.on("SIGCHLD", () => {});
supervisor.start();
