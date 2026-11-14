/**
 * No network in checks (14 November 2026).
 *
 * The engine's code knows the addresses of real services. A check that loads
 * it must never reach one, whatever a scenario or a scratch script forgets to
 * stand in for. Loading this file makes every connection that would leave
 * the machine fail: only this machine's own addresses and local sockets are
 * let through.
 *
 * The recorded test loads it itself (`harness.mjs`). Any other run of the
 * engine's code in a check loads it first:
 *
 *   node --require ./tests/recorded/no-network.cjs my-script.mjs
 *   NODE_OPTIONS=--require=/path/to/no-network.cjs node …
 *
 * Every refusal is kept in `refused()`, so a test can say what was tried.
 */
const net = require("node:net");
const dgram = require("node:dgram");

const refusals = [];
const isLocal = (host) => {
  const name = String(host ?? "localhost").toLowerCase().replace(/^\[|\]$/g, "");
  return name === "localhost" || name === "::1" || name === "::" || name === "0.0.0.0" || name.startsWith("127.") || name.startsWith("::ffff:127.") || name.endsWith(".localhost");
};
function refusal(kind, host, port) {
  const error = new Error(`no network in checks: a ${kind} to ${host}${port === undefined ? "" : `:${port}`} was refused (tests/recorded/no-network.cjs)`);
  error.code = "ECONNREFUSED";
  error.refusedByChecks = true;
  refusals.push({ kind, host: String(host), port });
  return error;
}

if (!net.Socket.prototype.connect.guardedByChecks) {
  const connect = net.Socket.prototype.connect;
  const guarded = function (...args) {
    // Node hands its own already-read arguments on as one list; anyone else's are read the way Node reads them.
    const read = Array.isArray(args[0]) ? args[0] : net._normalizeArgs(args);
    const options = read[0] ?? {};
    // A path means a local socket, as Node itself reads it: only a path that is there (http hands over `path: null`).
    if (options.path || isLocal(options.host)) return connect.apply(this, args);
    const error = refusal("connection", options.host, options.port);
    process.nextTick(() => this.destroy(error));
    return this;
  };
  guarded.guardedByChecks = true;
  net.Socket.prototype.connect = guarded;

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
}

module.exports = {
  /** What was refused since the last `forget()`: `{ kind, host, port }` each. */
  refused: () => refusals.slice(),
  forget: () => { refusals.length = 0; },
};
