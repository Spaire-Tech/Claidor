/**
 * A long command on the agent's computer keeps running in the background
 * (12 November 2026, the founder: "a long command keeps running in the
 * background, and the agent is woken automatically when it finishes").
 *
 * The computer's command runner (`source/box-exec-daemon/server.ts`) used to
 * stop a Shell command when its wait (`block_until_ms`) ran out, and ran one
 * started with `block_until_ms: 0` in the foreground until it ended. Now a
 * command that outlives its wait, or is started in the background, is moved
 * there: the stream ends with `backgrounded` and its shell id, and its output
 * and end go to its terminal file, whose footer the engine's watch reads to
 * wake the agent. A background command is stopped at its limit, and the
 * footer says so; a file left without a footer by an earlier runner is
 * closed when the runner starts. These tests run the real runner on this
 * machine, over its wire, with short commands.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";
import { createPromiseClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

const BACKGROUND = 2;
const CANCEL = 1;

async function withDaemon(options, run) {
  const daemonModule = await loadModule("source/box-exec-daemon/server.ts", "box-exec-daemon-background");
  const exec = await loadModule("source/packages/proto/generated/agent/v1/exec_service_connect.ts", "exec-service-background");
  const messages = await loadModule("source/packages/proto/generated/agent/v1/exec_pb.ts", "exec-messages-background");
  const footers = await loadModule("source/shared/background-commands.ts", "background-commands");
  const workspace = await mkdtemp(path.join(os.tmpdir(), "simeon-box-workspace-"));
  const terminals = options.terminals ?? await mkdtemp(path.join(os.tmpdir(), "simeon-box-terminals-"));
  if (options.beforeStart) await options.beforeStart(terminals);
  const daemon = await daemonModule.module.startBoxExecDaemon({ port: 0, workspaceRoot: workspace, terminalsDirectory: terminals, computerUse: false, ...(options.backgroundLimitMs === undefined ? {} : { backgroundLimitMs: options.backgroundLimitMs }) });
  const transport = createConnectTransport({ baseUrl: daemon.url, httpVersion: "1.1", interceptors: [next => request => { request.header.set("authorization", "Bearer local"); return next(request); }] });
  const client = createPromiseClient(exec.module.ExecService, transport);
  let nextId = 1;
  /** One Shell command over the wire: every stream event, in order. */
  const shell = async (args, signal) => {
    const id = nextId++;
    const request = new messages.module.ExecServerMessage({ id, execId: `sh-${id}`, message: { case: "shellStreamArgs", value: { command: args.command, workingDirectory: "", timeout: args.timeout ?? 0, timeoutBehavior: args.timeoutBehavior ?? BACKGROUND, isBackground: args.isBackground ?? false, ...(args.hardTimeout === undefined ? {} : { hardTimeout: args.hardTimeout }) } } });
    const events = [];
    for await (const element of client.exec(request, signal === undefined ? {} : { signal })) {
      const message = element.element.case === "execClientMessage" ? element.element.value.message : undefined;
      if (message?.case === "shellStream") events.push(message.value.event);
    }
    return events;
  };
  /** The terminal file once its footer is written. */
  const ended = async (shellId, timeoutMs = 10_000) => {
    const file = path.join(daemon.terminalsDirectory, `${shellId}.txt`);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const content = await readFile(file, "utf8").catch(() => "");
      if (footers.module.parseShellTerminalFooter(content).isComplete) return content;
      if (Date.now() > deadline) throw new Error(`no footer in ${file}: ${JSON.stringify(content)}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  try {
    await run({ shell, ended, daemon, parse: footers.module.parseShellTerminalFooter });
  } finally {
    await daemon.stop();
    await rm(workspace, { recursive: true, force: true });
    await rm(terminals, { recursive: true, force: true });
    await Promise.all([daemonModule.dispose(), exec.dispose(), messages.dispose(), footers.dispose()]);
  }
}

test("a command that outlives its wait is moved to the background, keeps running, and its file gets the whole output and the footer", async () => {
  await withDaemon({}, async ({ shell, ended, parse }) => {
    // The command runs three seconds and its wait is 300 ms. The call must answer well before the command could
    // have ended; the bound leaves two seconds for a busy machine to start a shell (with one second and a bound
    // of 900 ms, a busy Mac failed this at the engine's check before a release, 13 November 2026).
    const started = Date.now();
    const events = await shell({ command: "echo first; sleep 3; echo second", timeout: 300 });
    const took = Date.now() - started;
    assert.ok(took < 2_500, `the Shell call answered at its wait, not when the command ended (${took} ms)`);
    const cases = events.map(event => event.case);
    assert.deepEqual(cases.filter(name => name !== "stdout"), ["start", "backgrounded"], "no exit: it is still running");
    const heard = events.filter(event => event.case === "stdout").map(event => event.value.data).join("");
    assert.match(heard, /first/);
    assert.doesNotMatch(heard, /second/, "it answered before the command's last line, whatever the clock says");
    const backgrounded = events.at(-1).value;
    assert.ok(backgrounded.shellId >= 1_000, "a shell id the agent waits on");
    assert.equal(backgrounded.msToWait, 300);
    assert.equal(backgrounded.reason, 1, "moved there because its wait ran out");
    assert.ok(backgrounded.pid > 0);
    const file = await ended(backgrounded.shellId);
    assert.match(file, /^---\n/);
    assert.match(file, /command: "echo first; sleep 3; echo second"/);
    assert.match(file, /first\n[\s\S]*second\n/, "the output before and after the move, in order");
    const footer = parse(file);
    assert.deepEqual(footer, { isComplete: true, exitCode: 0 });
  });
});

test("block_until_ms 0 starts the command in the background at once; a failure's exit code reaches the footer", async () => {
  await withDaemon({}, async ({ shell, ended, parse }) => {
    const events = await shell({ command: "sleep 0.5; echo done; exit 3", timeout: 0, isBackground: true });
    assert.deepEqual(events.map(event => event.case), ["start", "backgrounded"]);
    const backgrounded = events[1].value;
    assert.equal(backgrounded.msToWait, undefined, "started there, not moved after a wait");
    const file = await ended(backgrounded.shellId);
    assert.match(file, /done/);
    assert.equal(parse(file).exitCode, 3);
  });
});

test("a quick command still answers in the foreground with its exit, background or not", async () => {
  await withDaemon({}, async ({ shell }) => {
    const events = await shell({ command: "echo hello", timeout: 5_000 });
    assert.deepEqual(events.map(event => event.case), ["start", "stdout", "exit"]);
    assert.equal(events.at(-1).value.code, 0);
  });
});

test("a caller that did not ask for the background still has its command stopped at its timeout", async () => {
  await withDaemon({}, async ({ shell }) => {
    const started = Date.now();
    const events = await shell({ command: "sleep 5", timeout: 200, timeoutBehavior: CANCEL });
    assert.ok(Date.now() - started < 3_000);
    assert.equal(events.at(-1).case, "exit");
    assert.notEqual(events.at(-1).value.code, 0);
  });
});

test("ending the stream once it is in the background leaves the command running", async () => {
  await withDaemon({}, async ({ shell, ended, parse }) => {
    const controller = new AbortController();
    const events = await shell({ command: "sleep 0.6; echo survived", timeout: 0, isBackground: true }, controller.signal);
    controller.abort();
    const file = await ended(events.at(-1).value.shellId);
    assert.match(file, /survived/);
    assert.equal(parse(file).exitCode, 0);
  });
});

test("a command the turn stops before its wait ends is stopped, as before", async () => {
  await withDaemon({}, async ({ shell, daemon }) => {
    const marker = path.join(daemon.workspaceRoot, "should-not-exist");
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);
    await shell({ command: `sleep 1; touch ${marker}`, timeout: 5_000 }, controller.signal).catch(() => []);
    await new Promise(resolve => setTimeout(resolve, 1_500));
    await assert.rejects(readFile(marker), /ENOENT/, "the command was stopped with the turn");
  });
});

test("a background command is stopped at its limit, and its footer says why", async () => {
  await withDaemon({ backgroundLimitMs: 400 }, async ({ shell, ended, parse }) => {
    const events = await shell({ command: "sleep 30", timeout: 0, isBackground: true });
    const started = Date.now();
    const file = await ended(events.at(-1).value.shellId);
    assert.ok(Date.now() - started < 5_000, "stopped at the limit, not when it would have ended");
    const footer = parse(file);
    assert.equal(footer.isComplete, true);
    assert.equal(footer.exitCode, 143, "ended by SIGTERM, as a shell reads it");
    assert.match(footer.stopped, /the limit for this background command/);
  });
});

test("the caller's shorter hard limit wins over the runner's", async () => {
  await withDaemon({}, async ({ shell, ended, parse }) => {
    const events = await shell({ command: "sleep 30", timeout: 0, isBackground: true, hardTimeout: 300 });
    const footer = parse(await ended(events.at(-1).value.shellId));
    assert.equal(footer.exitCode, 143);
    assert.match(footer.stopped, /300 ms/);
  });
});

test("the two-hour limit is what the agents are told", async () => {
  const daemonModule = await loadModule("source/box-exec-daemon/server.ts", "box-exec-daemon-limit");
  const shared = await loadModule("source/shared/background-commands.ts", "background-commands-limit");
  try {
    assert.equal(shared.module.BACKGROUND_COMMAND_LIMIT_MS, 2 * 60 * 60 * 1_000);
    assert.equal(shared.module.BACKGROUND_COMMAND_LIMIT_WORDS, "2 hours");
    assert.equal(daemonModule.module.backgroundLimitWords(shared.module.BACKGROUND_COMMAND_LIMIT_MS), "stopped after running 2 hours, the limit for a background command");
    assert.ok(shared.module.BACKGROUND_COMMAND_HOLD_MS > shared.module.BACKGROUND_COMMAND_LIMIT_MS, "the computer is held past the limit, never less");
  } finally {
    await Promise.all([daemonModule.dispose(), shared.dispose()]);
  }
});

test("a file an earlier runner left without a footer is closed when the runner starts, and its id is not reused", async () => {
  let leftOver;
  await withDaemon({
    beforeStart: async (terminals) => {
      leftOver = path.join(terminals, "1000.txt");
      await writeFile(leftOver, "---\npid: 1\ncommand: \"npm run build\"\nstatus: running\nrunning_for_ms: 0\n---\nhalf the output\n");
      await writeFile(path.join(terminals, "1001.txt"), "---\npid: 2\n---\nall\n\n---\nexit_code: 0\nended_at: x\n---\n");
    },
  }, async ({ shell, parse }) => {
    const closed = parse(await readFile(leftOver, "utf8"));
    assert.equal(closed.isComplete, true);
    assert.equal(closed.isStreamFailure, true, "its end was not recorded");
    assert.match(await readFile(leftOver, "utf8"), /command runner restarted/);
    const finished = await readFile(leftOver.replace("1000", "1001"), "utf8");
    assert.equal((finished.match(/\n---\n/g) ?? []).length, 3, "a finished file is left as it was");
    const events = await shell({ command: "sleep 0.2", timeout: 0, isBackground: true });
    assert.ok(![1000, 1001].includes(events.at(-1).value.shellId));
  });
});
