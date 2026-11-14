/**
 * No network in checks (14 November 2026).
 *
 * The engine's code knows the addresses of real services. A check that loads
 * it must never reach one, whatever a scenario or a scratch script forgets to
 * stand in for. Loading this file makes every connection that would leave
 * the machine fail: only this machine's own addresses and local sockets are
 * let through, and not the local port of a proxy the machine's settings name.
 *
 * The recorded test loads it itself (`harness.mjs`). Any other run of the
 * engine's code in a check loads it first:
 *
 *   node --require ./tests/recorded/no-network.cjs my-script.mjs
 *   NODE_OPTIONS="${NODE_OPTIONS:-} --require=/path/to/no-network.cjs" node …
 *
 * What it covers: the thread that loads it, every worker thread started
 * after that, and every Node program started after that with this same
 * `node` (they load this file before anything else). What it does not
 * cover: any other program (a shell, git, a browser), and a Node program
 * started through one of them.
 *
 * Every refusal is kept in `refused()`, so a test can say what was tried:
 * the ones of this thread and of its workers. A child program's are refused
 * all the same, but are not in the list.
 */
const net = require("node:net");
const dgram = require("node:dgram");
const path = require("node:path");
const childProcess = require("node:child_process");
const workerThreads = require("node:worker_threads");
const { syncBuiltinESMExports } = require("node:module");

// One list for every copy of this file in the thread. A run can load two copies (one named in NODE_OPTIONS, then the
// test tool's own): whichever refuses, both must be able to say so.
const shared = (globalThis[Symbol.for("simeon.checks.no-network")] ??= { refusals: [], listening: false, reporting: null, handedOn: false });
const refusals = shared.refusals;
const CHANNEL = "simeon.checks.no-network";

// A worker thread has a list of its own, which nobody asks. It tells the thread that started the run instead.
if (workerThreads.isMainThread && !shared.listening) {
  shared.listening = true;
  const channel = new workerThreads.BroadcastChannel(CHANNEL);
  channel.onmessage = (event) => refusals.push(event.data);
  channel.unref();
}

function note(entry) {
  refusals.push(entry);
  if (workerThreads.isMainThread) return;
  if (!shared.reporting) {
    shared.reporting = new workerThreads.BroadcastChannel(CHANNEL);
    shared.reporting.unref();
  }
  shared.reporting.postMessage({ ...entry, from: "a worker thread" });
}

const isLocal = (host) => {
  const name = String(host ?? "localhost").toLowerCase().replace(/^\[|\]$/g, "");
  return name === "localhost" || name === "::1" || name === "::" || name === "0.0.0.0" || name.startsWith("127.") || name.startsWith("::ffff:127.") || name.endsWith(".localhost");
};

// The machine's own way out may be a proxy on a local address, named in the usual settings. A connection to it leaves
// the machine as surely as one to a far address, so its port is refused too. Read once, as this file loads: a check
// may take the settings away later.
const proxyPorts = new Set();
for (const [name, value] of Object.entries(process.env)) {
  if (!/proxy/i.test(name) || /no_?proxy/i.test(name) || !value) continue;
  try {
    const address = new URL(value.includes("://") ? value : `http://${value}`);
    proxyPorts.add(Number(address.port || (address.protocol === "https:" ? 443 : 80)));
  } catch {
    // Not an address: nothing to refuse.
  }
}

function refusal(kind, host, port) {
  const error = new Error(`no network in checks: a ${kind} to ${host}${port === undefined ? "" : `:${port}`} was refused (tests/recorded/no-network.cjs)`);
  error.code = "ECONNREFUSED";
  error.refusedByChecks = true;
  note({ kind, host: String(host), port });
  return error;
}

// Connections. Every copy of this file puts its own check in front of whatever is there, another copy's included: the
// one in front refuses, so nothing is refused or listed twice.
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  // Node hands its own already-read arguments on as one list; anyone else's are read the way Node reads them.
  const read = Array.isArray(args[0]) ? args[0] : net._normalizeArgs(args);
  const options = read[0] ?? {};
  // A path means a local socket, as Node itself reads it: only a path that is there (http hands over `path: null`).
  const throughProxy = !options.path && isLocal(options.host) && proxyPorts.has(Number(options.port));
  if (!throughProxy && (options.path || isLocal(options.host))) return connect.apply(this, args);
  const error = refusal(throughProxy ? "connection through this machine's proxy" : "connection", options.host ?? "localhost", options.port);
  process.nextTick(() => this.destroy(error));
  return this;
};

const send = dgram.Socket.prototype.send;
dgram.Socket.prototype.send = function (...args) {
  // send(msg[, offset, length][, port][, address][, callback]): the address is the last text among the arguments.
  const address = args.slice(1).filter((value) => typeof value === "string").at(-1);
  if (address === undefined || isLocal(address)) return send.apply(this, args);
  const error = refusal("datagram", address);
  const callback = args.findLast((value) => typeof value === "function");
  if (callback) process.nextTick(callback, error);
  else process.nextTick(() => this.emit("error", error));
};

// Worker threads and Node programs started from here load this file before anything else. Done once in a thread,
// however many copies are loaded: the first copy's path is the one handed on.
if (!shared.handedOn) {
  shared.handedOn = true;
  const preload = `--require=${__filename}`;

  // A worker gets the options it would have had, and this file.
  const Worker = workerThreads.Worker;
  const withGuard = (options, inherited) => ({ ...options, execArgv: [...(options?.execArgv ?? inherited), preload] });
  const GuardedWorker = function (filename, options) {
    const target = new.target ?? GuardedWorker;
    try {
      return Reflect.construct(Worker, [filename, withGuard(options, process.execArgv)], target);
    } catch (error) {
      // Some options of this thread cannot be given to a worker by name; it then gets this file alone.
      if (error?.code !== "ERR_WORKER_INVALID_EXEC_ARGV" || options?.execArgv) throw error;
      return Reflect.construct(Worker, [filename, withGuard(options, [])], target);
    }
  };
  GuardedWorker.prototype = Worker.prototype;
  Object.setPrototypeOf(GuardedWorker, Worker);
  workerThreads.Worker = GuardedWorker;

  // A Node program gets it through its NODE_OPTIONS, whatever environment the part gives it. Other programs are
  // left exactly as they are started.
  const isNode = (file) => typeof file === "string" && (file === process.execPath || /^node(\.exe)?$/i.test(path.basename(file)));
  const quoted = `--require="${__filename.replace(/[\\"]/g, "\\$&")}"`;
  const optionsWithGuard = (value) => (value === undefined || value === "" ? quoted : value.includes(__filename) ? value : `${value} ${quoted}`);

  // spawn, exec, execFile and fork all start their program here, with the environment as a list of "NAME=value".
  const start = childProcess.ChildProcess.prototype.spawn;
  childProcess.ChildProcess.prototype.spawn = function (options) {
    if (options && isNode(options.file) && Array.isArray(options.envPairs)) {
      const at = options.envPairs.findIndex((pair) => pair.startsWith("NODE_OPTIONS="));
      const pairs = options.envPairs.slice();
      if (at === -1) pairs.push(`NODE_OPTIONS=${optionsWithGuard(undefined)}`);
      else pairs[at] = `NODE_OPTIONS=${optionsWithGuard(pairs[at].slice("NODE_OPTIONS=".length))}`;
      options = { ...options, envPairs: pairs };
    }
    return start.call(this, options);
  };

  // The two that wait for their program do not pass through there.
  for (const name of ["spawnSync", "execFileSync"]) {
    const original = childProcess[name];
    childProcess[name] = function (file, ...rest) {
      if (!isNode(file)) return original.call(this, file, ...rest);
      // The options are the last plain object among the arguments, when there is one.
      const at = rest.findLastIndex((value) => value !== null && typeof value === "object" && !Array.isArray(value));
      const options = at === -1 ? {} : rest[at];
      const env = { ...(options.env ?? process.env) };
      env.NODE_OPTIONS = optionsWithGuard(env.NODE_OPTIONS);
      const next = at === -1 ? [...rest, { env }] : rest.with(at, { ...options, env });
      return original.call(this, file, ...next);
    };
  }

  // Code that names these by `import { Worker } from …` sees the guarded ones too.
  syncBuiltinESMExports();
}

module.exports = {
  /** What was refused since the last `forget()`: `{ kind, host, port }` each, with `from` when a worker thread tried. */
  refused: () => refusals.slice(),
  forget: () => { refusals.length = 0; },
};
