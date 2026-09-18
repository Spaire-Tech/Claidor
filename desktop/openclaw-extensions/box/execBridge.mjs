#!/usr/bin/env node
/**
 * Stands in for a process that is not on this machine.
 *
 * The engine's sandbox exec path spawns a local child and treats its stdio as
 * the command's stdio. A box has no local process to spawn, so this script is
 * spawned instead: it opens one socket to the broker, streams stdin up,
 * streams stdout and stderr down, and exits with the box's exit code.
 *
 * One socket per Shell tool call. That is the one round trip per shell command
 * counted in `docs/product/agent-computer-plan.md` §5.
 *
 * Plain .mjs: it is spawned by node directly, so it must run without a build.
 */
import process from 'node:process';

import {
  BRIDGE_ENV,
  buildExecSocketUrl,
  decodeServerFrame,
  encodeExecRequest,
  encodeSignal,
  encodeStdin,
  encodeStdinClose,
} from './execProtocol.mjs';

/** Exit codes that are ours, not the command's. */
const EXIT_BRIDGE_MISCONFIGURED = 78;
const EXIT_BRIDGE_TRANSPORT = 79;

function fail(code, message) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    fail(EXIT_BRIDGE_MISCONFIGURED, `Box bridge is missing ${name}.`);
  }
  return value;
}

function parseEnvJson(raw) {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function main() {
  const broker = required(BRIDGE_ENV.broker);
  const token = required(BRIDGE_ENV.token);
  const boxId = required(BRIDGE_ENV.boxId);
  // A command may legitimately be empty, so it is read without `required`.
  const command = process.env[BRIDGE_ENV.command] ?? '';
  const workdir = process.env[BRIDGE_ENV.workdir] || undefined;
  const env = parseEnvJson(process.env[BRIDGE_ENV.env]);
  const usePty = process.env[BRIDGE_ENV.pty] === '1';

  let socketUrl;
  try {
    socketUrl = buildExecSocketUrl(broker, boxId);
  } catch (error) {
    fail(EXIT_BRIDGE_MISCONFIGURED, `Box bridge cannot build its endpoint: ${error.message}`);
    return;
  }

  // Node 22 ships a global WebSocket. Keeping the plugin dependency-free
  // matters: it is copied into the packaged runtime without node_modules.
  if (typeof WebSocket !== 'function') {
    fail(EXIT_BRIDGE_TRANSPORT, 'Box bridge needs a WebSocket; this Node build has none.');
    return;
  }

  const socket = new WebSocket(socketUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  socket.binaryType = 'arraybuffer';

  let settled = false;
  const finish = (code) => {
    if (settled) {
      return;
    }
    settled = true;
    // Let buffered stdout drain before the process goes away, or the tail of a
    // command's output is lost and the agent reads a truncated result.
    const done = () => process.exit(code);
    if (process.stdout.writableLength === 0) {
      done();
      return;
    }
    process.stdout.write('', done);
  };

  socket.addEventListener('open', () => {
    socket.send(encodeExecRequest({ command, workdir, env, usePty }));
    process.stdin.on('data', (chunk) => {
      if (socket.readyState === 1) {
        socket.send(encodeStdin(chunk));
      }
    });
    process.stdin.on('end', () => {
      if (socket.readyState === 1) {
        socket.send(encodeStdinClose());
      }
    });
    process.stdin.resume();
  });

  socket.addEventListener('message', (event) => {
    const frame = decodeServerFrame(event.data);
    switch (frame.t) {
      case 'stdout':
        process.stdout.write(frame.data);
        break;
      case 'stderr':
        process.stderr.write(frame.data);
        break;
      case 'exit':
        finish(frame.code ?? 0);
        break;
      case 'error':
        process.stderr.write(`${frame.message}\n`);
        finish(EXIT_BRIDGE_TRANSPORT);
        break;
      default:
        break;
    }
  });

  socket.addEventListener('error', () => {
    // The event carries no useful detail in Node's implementation; the close
    // handler reports the reason.
  });

  socket.addEventListener('close', (event) => {
    if (settled) {
      return;
    }
    const reason = event.reason ? `: ${event.reason}` : '';
    process.stderr.write(`Box connection closed before the command finished${reason}\n`);
    finish(EXIT_BRIDGE_TRANSPORT);
  });

  // The engine kills this process to abort a tool call. Pass that on, so the
  // command in the box dies too instead of running on unattended.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (socket.readyState === 1) {
        socket.send(encodeSignal(signal));
      }
      finish(EXIT_BRIDGE_TRANSPORT);
    });
  }
}

main().catch((error) => {
  fail(EXIT_BRIDGE_TRANSPORT, `Box bridge failed: ${error?.message ?? String(error)}`);
});
