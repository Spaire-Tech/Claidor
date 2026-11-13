/**
 * The agent is woken when a command it left running in the background on
 * its computer finishes (12 November 2026). Tessa said "Now I'm switching on
 * the two Azure services. That takes a few minutes" and then nothing came
 * until the founder wrote "let me know": her instructions said she would be
 * "notified the moment it completes", and nothing ever did.
 *
 * Now the Shell result that says a command was moved to the background is
 * caught where every Shell call reaches the computer (the turn's resource
 * accessor, `remote-box-resources.ts`), on Simeon's model and in Claude Code
 * alike (Claude Code's Shell is the same tool, over MCP); the runner watches
 * the command's file (`watchBackgroundShell`), and its end wakes the agent
 * through the existing wake (`CompletionRevivals`). A command whose end the
 * agent read itself in a turn wakes no one. The instructions say so.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TERMINALS = "/root/.simeon/projects/workspace/terminals";

async function load() {
  // Inside the desktop folder: the Shell tool's command parser loads tree-sitter from its node_modules.
  const dir = await mkdtemp(path.join(repoRoot, ".tmp-background-wake-"));
  // jsonc-parser stays external, as in the loop's own test (its UMD build requires its parts at run time).
  const outfile = path.join(dir, "wake.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/background-wake-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron", "jsonc-parser"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

/** The computer as the turn's accessor reaches it: Shell streams and file reads answered by the test. */
function computer(m, { stream, read }) {
  const box = {
    async ensureReady() {
      return {
        terminalsFolder: TERMINALS,
        remoteAccessor: {
          get(resource) {
            if (resource === m.shellStreamExecutorResource) return { execute: (_context, args) => stream(args) };
            if (resource === m.readExecutorResource) return { execute: async (_context, args) => read(args) };
            throw new Error("not reached in this test");
          },
        },
      };
    },
  };
  const backgrounded = [];
  const seen = [];
  const accessor = m.createRemoteBoxResourceAccessor({
    remoteBox: box,
    remoteBoxHasDesktop: false,
    resolveBoxId: () => "agent-1",
    getConversationId: () => "agent-1",
    setRemoteBoxTerminalsFolder() {},
    autoReviewGate: { assertNoPendingApproval() {}, currentModes: () => ({}) },
    auditShellCommand() {},
    computerUse: { getOrCreateNavigationProbe: () => undefined, recordAuditIntent() {} },
    probeNavigationAfterComputerUse() {},
    onShellBackgrounded: (shell) => backgrounded.push(shell),
    onBackgroundShellSeenFinished: (id) => seen.push(id),
  });
  return { accessor, backgrounded, seen };
}

/** A Shell command that answers after its wait: some output, then moved to the background as shell 4242. */
function movedAfterWait(m) {
  return async function* (args) {
    yield new m.ShellStream({ event: { case: "start", value: new m.ShellStreamStart() } });
    yield new m.ShellStream({ event: { case: "stdout", value: new m.ShellStreamStdout({ data: "Registering Microsoft.App\n" }) } });
    yield new m.ShellStream({ event: { case: "backgrounded", value: new m.ShellStreamBackgrounded({ shellId: 4242, command: args.command, workingDirectory: args.workingDirectory, pid: 77, msToWait: args.timeout, reason: m.ShellBackgroundReason.TIMEOUT }) } });
  };
}

function boxShell(m, accessor, extra = {}) {
  return m.createShellTool(accessor, { surface: "isolated_box", toolName: "Shell", awaitToolIdentifier: "BOX_AWAIT", enableBlockUntilMs: true, defaultBlockUntilMs: 30_000, terminalsFolder: TERMINALS, enableJobCompletionNotifications: true, ...extra });
}

const readOf = (m, content) => new m.ReadResult({ result: { case: "success", value: new m.ReadSuccess({ path: "", output: { case: "content", value: content } }) } });

test("Claude Code's Shell, over the bridge: a command moved to the background is watched, and the answer says the agent will be woken", async () => {
  const { module: m, dispose } = await load();
  try {
    const { accessor, backgrounded } = computer(m, { stream: movedAfterWait(m), read: async () => { throw new Error("no read"); } });
    const controller = new AbortController();
    const [tool] = m.bridgeEngineTools([boxShell(m, accessor)], { ctx: m.createContext(), signal: controller.signal });
    assert.equal(tool.name, "Shell");
    const result = await tool.call({ command: "az provider register -n Microsoft.App --wait", description: "Switch on Container Apps" }, controller.signal);
    assert.equal(result.isError, undefined);
    const text = result.content.map((part) => part.text).join("\n");
    assert.match(text, /did not complete in 30000ms and was sent to the background/);
    assert.match(text, /Registering Microsoft\.App/, "the output written before the move");
    assert.match(text, /\/root\/\.simeon\/projects\/workspace\/terminals\/4242\.txt/, "a path the agent can read");
    assert.match(text, /you're woken with its result in a new turn, even if this turn has ended/);
    assert.deepEqual(backgrounded, [{ shellId: "4242", title: "Switch on Container Apps" }], "watched before the tool answered");
  } finally {
    await dispose();
  }
});

test("Simeon's own loop calls the same tool: started in the background with block_until_ms 0, watched under its command", async () => {
  const { module: m, dispose } = await load();
  try {
    const startedThere = async function* (args) {
      assert.equal(args.isBackground, true);
      yield new m.ShellStream({ event: { case: "start", value: new m.ShellStreamStart() } });
      yield new m.ShellStream({ event: { case: "backgrounded", value: new m.ShellStreamBackgrounded({ shellId: 5150, command: args.command, workingDirectory: args.workingDirectory }) } });
    };
    const { accessor, backgrounded } = computer(m, { stream: startedThere, read: async () => { throw new Error("no read"); } });
    const tool = boxShell(m, accessor);
    const controller = new AbortController();
    const handler = m.claudeCodeInteractionHandler({ signal: controller.signal });
    const output = await tool.execute(m.createContext(), handler, (async function* () { yield JSON.stringify({ command: "npm run build", block_until_ms: 0 }); })(), { toolCallId: "call-1" });
    const text = await tool.render(m.createContext(), output, {});
    const words = typeof text === "string" ? text : text.content.map((part) => part.text).join("\n");
    assert.match(words, /Background command started successfully/);
    assert.match(words, /you're woken with its result/);
    assert.deepEqual(backgrounded, [{ shellId: "5150", title: "npm run build" }]);
  } finally {
    await dispose();
  }
});

test("a command the person's computer started in the background (a wait of 0) still reads as started, not as late", async () => {
  const { module: m, dispose } = await load();
  try {
    const external = async function* (args) {
      yield new m.ShellStream({ event: { case: "start", value: new m.ShellStreamStart() } });
      yield new m.ShellStream({ event: { case: "backgrounded", value: new m.ShellStreamBackgrounded({ shellId: 7, command: args.command, workingDirectory: args.workingDirectory, msToWait: 0, reason: m.ShellBackgroundReason.TIMEOUT }) } });
    };
    const { accessor } = computer(m, { stream: external, read: async () => { throw new Error("no read"); } });
    const controller = new AbortController();
    const [tool] = m.bridgeEngineTools([m.createShellTool(accessor, { toolName: "ExternalShell", enableBlockUntilMs: true, defaultBlockUntilMs: 30_000 })], { ctx: m.createContext(), signal: controller.signal });
    const text = (await tool.call({ command: "npm run dev", block_until_ms: 0 }, controller.signal)).content[0].text;
    assert.match(text, /Background command started successfully/);
    assert.doesNotMatch(text, /did not complete in 0ms/);
    assert.doesNotMatch(text, /woken/, "nothing wakes the agent for a command on the person's computer");
  } finally {
    await dispose();
  }
});

test("a helper's Shell, without the note, says nothing of a wake; a command that ends in time is not watched", async () => {
  const { module: m, dispose } = await load();
  try {
    const quick = async function* (args) {
      yield new m.ShellStream({ event: { case: "start", value: new m.ShellStreamStart() } });
      yield new m.ShellStream({ event: { case: "stdout", value: new m.ShellStreamStdout({ data: "ok\n" }) } });
      yield new m.ShellStream({ event: { case: "exit", value: new m.ShellStreamExit({ code: 0, cwd: args.workingDirectory }) } });
    };
    const done = computer(m, { stream: quick, read: async () => { throw new Error("no read"); } });
    const controller = new AbortController();
    const [tool] = m.bridgeEngineTools([boxShell(m, done.accessor)], { ctx: m.createContext(), signal: controller.signal });
    const result = await tool.call({ command: "echo ok" }, controller.signal);
    assert.doesNotMatch(result.content[0].text, /woken/);
    assert.deepEqual(done.backgrounded, []);
    const helper = computer(m, { stream: movedAfterWait(m), read: async () => { throw new Error("no read"); } });
    const [helperTool] = m.bridgeEngineTools([boxShell(m, helper.accessor, { enableJobCompletionNotifications: false })], { ctx: m.createContext(), signal: controller.signal });
    const helperResult = await helperTool.call({ command: "make" }, controller.signal);
    assert.doesNotMatch(helperResult.content[0].text, /woken/);
    // (The await tool is named by its id here: the bridge was given the Shell alone.)
    assert.match(helperTool.description, /Use `BOX_AWAIT` to monitor the background command/, "a helper is told to wait itself");
    assert.doesNotMatch(helperTool.description, /You'll be notified/);
    assert.match(tool.description, /You'll be notified when the backgrounded command completes/, "the agent's Shell says it is woken");
  } finally {
    await dispose();
  }
});

test("reading the end of a background command's file in a turn means no wake is due; a file still running, or any other file, does not", async () => {
  const { module: m, dispose } = await load();
  try {
    const files = {
      [`${TERMINALS}/4242.txt`]: "---\npid: 77\n---\nRegistered\n\n---\nexit_code: 0\nelapsed_ms: 1\nended_at: x\n---\n",
      [`${TERMINALS}/5150.txt`]: "---\npid: 78\n---\nstill going\n",
      "/workspace/notes.txt": "x\n---\nexit_code: 0\n---\n",
    };
    const { accessor, seen } = computer(m, { stream: movedAfterWait(m), read: async (args) => readOf(m, files[args.path] ?? "") });
    const reader = accessor.get(m.readExecutorResource);
    for (const file of Object.keys(files)) await reader.execute(m.createContext(), { path: file, toolCallId: "r" });
    assert.deepEqual(seen, ["4242"]);
    assert.equal(m.terminalFileShellId(`${TERMINALS}/12.txt`, [TERMINALS]), "12");
    assert.equal(m.terminalFileShellId(`${TERMINALS}/12.txt.bak`, [TERMINALS]), undefined);
    assert.equal(m.terminalFileShellId("/tmp/sand-box-terminals/9.txt", ["/tmp/sand-box-terminals/", TERMINALS]), "9");
  } finally {
    await dispose();
  }
});

test("the watch reads the command's file until its footer, then hands its end to the wake; the agent can forget it first", async () => {
  const { module: m, dispose } = await load();
  try {
    const reads = ["---\npid: 77\n---\n", "---\npid: 77\n---\nRegistered\n\n---\nexit_code: 0\nelapsed_ms: 4\nended_at: x\n---\n"];
    const pollHost = {
      ctx: {},
      getConversationId: () => "agent-1",
      ensureBoxReady: async () => ({ terminalsFolder: TERMINALS, remoteAccessor: { read: async () => readOf(m, reads.shift() ?? "") } }),
      getConversationState: () => ({ turns: [] }),
      getBlob: async () => null,
      decodeConversationTurn: () => ({}),
      decodeUserMessage: () => ({ text: "", messageId: "" }),
      getConfirmedUserTurnWatermarkCache: () => undefined,
      setConfirmedUserTurnWatermarkCache() {},
      delay: async () => {},
    };
    const armed = [];
    const disarmed = [];
    const settled = [];
    const tasks = [];
    const polls = [];
    const watches = m.createBackgroundWatches({
      getConversationId: () => "agent-1",
      emitAsyncTasksChanged: () => tasks.push(watches?.pendingShellRewatchIds().length),
      pendingWakeArmedHandler: () => (event) => armed.push(event),
      pendingWakeDisarmedHandler: () => (event) => disarmed.push(event),
      backgroundShellSettledHandler: () => (event) => settled.push(event),
      notifyBackgroundWorkSettled() {},
      cloudAgentWatcher: () => null,
      pollShellTerminalFile: (id, cancelled, settle, wrote) => { polls.push({ id, cancelled, settle }); void m.pollShellTerminalFile(pollHost, id, cancelled, settle, wrote); },
    });
    watches.watchBackgroundShell("4242", { title: "Switch on Container Apps" });
    assert.deepEqual(armed, [{ parentAgentId: "agent-1", kind: "shell", workId: "4242", title: "Switch on Container Apps" }], "the wake is kept: it survives a restart and holds the computer");
    assert.equal(watches.hasRunningBackgroundShellWork(), true);
    assert.equal([...watches.shellRewatchEntries()][0][1].afterRestart, false, "not one reattached after a restart");
    for (let tries = 0; tries < 50 && settled.length === 0; tries += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(settled, [{ agentId: "agent-1", shellId: "4242", title: "Switch on Container Apps", status: "success", detail: undefined, outputPath: `${TERMINALS}/4242.txt` }]);
    assert.equal(watches.hasRunningBackgroundShellWork(), false);
    const prompt = m.buildShellRevivalPrompt(settled);
    assert.match(prompt, /^\[A background command just completed\]/);
    assert.match(prompt, /Background command "Switch on Container Apps" finished\./);
    assert.match(prompt, /Full output: \/root\/\.simeon\/projects\/workspace\/terminals\/4242\.txt/);

    // Forgotten before it ends: its watch stops and its kept wake is cleared.
    const quietWatches = m.createBackgroundWatches({
      getConversationId: () => "agent-1",
      emitAsyncTasksChanged() {},
      pendingWakeArmedHandler: () => () => {},
      pendingWakeDisarmedHandler: () => (event) => disarmed.push(event),
      backgroundShellSettledHandler: () => (event) => settled.push(event),
      notifyBackgroundWorkSettled() {},
      cloudAgentWatcher: () => null,
      pollShellTerminalFile: (id, cancelled, settle) => polls.push({ id, cancelled, settle }),
    });
    quietWatches.watchBackgroundShell("5150", { title: "npm run build" });
    assert.equal(quietWatches.forgetBackgroundShell("5150"), true);
    assert.equal(polls.at(-1).cancelled(), true, "its watch stops reading");
    polls.at(-1).settle("success");
    assert.equal(settled.length, 1, "no wake for it");
    assert.deepEqual(disarmed, [{ parentAgentId: "agent-1", kind: "shell", workId: "5150" }]);
    assert.equal(quietWatches.forgetBackgroundShell("5150"), false, "only once");
  } finally {
    await dispose();
  }
});

test("a command stopped at its limit says so in the wake", async () => {
  const { module: m, dispose } = await load();
  try {
    const stopped = "---\npid: 77\n---\nserving on :3000\n\n---\nexit_code: 143\nelapsed_ms: 7200000\nended_at: x\nstopped: \"stopped after running 2 hours, the limit for a background command\"\n---\n";
    assert.deepEqual(m.parseShellTerminalFooter(stopped), { isComplete: true, exitCode: 143, stopped: "stopped after running 2 hours, the limit for a background command" });
    let outcome;
    await m.pollShellTerminalFile({
      ctx: {},
      getConversationId: () => "agent-1",
      ensureBoxReady: async () => ({ terminalsFolder: TERMINALS, remoteAccessor: { read: async () => readOf(m, stopped) } }),
      delay: async () => {},
    }, "4242", () => false, (status, detail) => { outcome = { status, detail }; });
    assert.deepEqual(outcome, { status: "error", detail: "It was stopped after running 2 hours, the limit for a background command (exit_code=143)." });
  } finally {
    await dispose();
  }
});

/** The transcript side of a wake, as `CompletionRevivals` reaches it. */
function revivalHost(runner) {
  const reported = [];
  const tm = {
    pendingWakes: { enqueuePendingWake: (queue, agentId, items) => { queue.set(agentId, [...(queue.get(agentId) ?? []), ...items]); return true; }, clearSettledPendingWake() {} },
    execution: { canExecute: true },
    sessions: { resolveBackgroundSession: async (agentId) => ({ id: agentId }), deletedAgentIds: new Set() },
    runnerRegistry: { getRunner: () => runner },
    runLifecycle: { beginSessionRun() {}, endSessionRun() {}, enqueueExclusiveRun: async (_id, run) => await run(), lastRequestIdBySession: new Map() },
    turnRuntime: { activeRequestPrompts: new Map(), activeRequestSources: new Map() },
    widgetResponses: { collectUnansweredQuestionPrompts: () => ({}) },
    roster: { emitAgentUpdate: async () => {} },
    telemetry: { reportShellRevival: (event) => reported.push(event), reportAgentError() {} },
    upgradeResume: {},
    trayErrors: { pushError() {} },
  };
  return { tm, reported };
}

test("the end of a watched command wakes the agent in a hidden turn, unless it already read that end itself", async () => {
  const { module: m, dispose } = await load();
  try {
    const runs = [];
    const seenIds = new Set(["5150"]);
    const runner = {
      run: async (prompt, options) => { runs.push({ prompt, options }); return { aborted: false, sentMessageCount: 1 }; },
      takeBackgroundShellEndSeen: (id) => seenIds.delete(id),
    };
    const { tm, reported } = revivalHost(runner);
    const revivals = new m.CompletionRevivals(tm);
    revivals.handleBackgroundShellCompletion({ agentId: "tessa", shellId: "4242", title: "Switch on Container Apps", status: "success", outputPath: `${TERMINALS}/4242.txt` });
    for (let tries = 0; tries < 50 && runs.length === 0; tries += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(runs.length, 1);
    assert.match(runs[0].prompt, /Background command "Switch on Container Apps" finished\./);
    assert.equal(runs[0].options.hidden, true);
    assert.equal(runs[0].options.callReason, "wake");
    assert.equal(runs[0].options.isSilenceAllowed, true);
    assert.equal(reported.at(-1).outcome, "delivered");

    revivals.handleBackgroundShellCompletion({ agentId: "tessa", shellId: "5150", title: "npm run build", status: "success" });
    for (let tries = 0; tries < 50 && reported.length < 2; tries += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(runs.length, 1, "no second wake: the agent had that result already");
    assert.equal(reported.at(-1).outcome, "dropped");
    assert.equal(reported.at(-1).reason, "seen_in_turn");
  } finally {
    await dispose();
  }
});

// The cloud agent's report (13 November 2026): the chat of the agent that launched it shows it as a message from the
// cloud agent, written at the start of the turn that wakes the agent with it, as a teammate's message is.
test("a cloud agent's report is a message from it in the launching agent's chat, written in the turn that wakes the agent", async () => {
  const { module: m, dispose } = await load();
  try {
    const order = [], runs = [], written = [], revived = [];
    const runner = { run: async (prompt, options) => { order.push("run"); runs.push({ prompt, options }); return { aborted: false, sentMessageCount: 1 }; } };
    const { tm } = revivalHost(runner);
    const session = { id: "leo", db: { getTranscriptEntries: () => written, appendTranscriptEntry: (entry) => { order.push("line"); written.push(entry); } } };
    tm.sessions.resolveBackgroundSession = async () => session;
    tm.telemetry.reportSubagentRevival = (event) => revived.push(event);
    tm.backgroundWakes = { agentToAgent: new m.AgentToAgentMessaging(tm) };
    // The card is posted as the agent's own message is (`AgentLifecycle.post`), into a chat that isn't the open one.
    tm.sessionStore = { markSessionActivity() {} };
    tm.agentLifecycle = { post: (target, message) => m.AgentLifecycle.prototype.post.call({ tm }, target, message) };
    const revivals = new m.CompletionRevivals(tm);
    const settle = async (count) => { for (let tries = 0; tries < 50 && revived.length < count; tries += 1) await new Promise((resolve) => setTimeout(resolve, 5)); };

    revivals.handleBackgroundSubagentCompletion({ parentAgentId: "leo", subagentAgentId: "bc-1", subagentType: "cloud-agent", toolCallId: "", title: "Cloud agent bc-1", status: "completed", result: "The cloud agent finished.\nPull request: https://github.com/simeonlabs/demo/pull/12", cloudAgent: { name: "Windows app version bump", said: "Opened pull request #12 with the bump.", coder: "claude-code" } });
    await settle(1);
    assert.deepEqual(order, ["line", "line", "run"], "the line and the card are in the chat before the agent's turn starts");
    const { id, timestampMs, ...line } = written[0];
    assert.ok(typeof id === "string" && id !== "");
    assert.ok(timestampMs > 0);
    assert.deepEqual(line, { kind: "message", role: "user", content: "Opened pull request #12 with the bump.", isStreaming: false, fromAgent: { id: "bc-1", name: "Windows app version bump", kind: "cloud-agent", coder: "claude-code" } });
    // Its card comes right after its report, and only now that it has ended (13 November 2026).
    assert.equal(written.length, 2);
    assert.equal(written[1].kind, "send-message");
    assert.deepEqual(written[1].message, { type: "cloud-agent", bcId: "bc-1" });
    assert.notEqual(written[1].id, written[0].id);
    assert.match(runs[0].prompt, /Background task "Cloud agent bc-1" \(cloud-agent\) finished:\nThe cloud agent finished\.\nPull request: https:\/\/github\.com\/simeonlabs\/demo\/pull\/12/, "the agent is still woken with the report itself, and the cloud agent's id");
    assert.equal(runs[0].options.hidden, true);
    assert.equal(revived[0].outcome, "delivered");
    assert.match(runs[0].prompt, /The chat already shows this cloud agent's own report as a message from it, with its card right under it[^\n]*Don't send a cloud-agent card/, "the agent is told its report and card are there, so it sends neither again");

    // A helper's result is no message from a cloud agent, and a chat that can't take the line still wakes the agent.
    revivals.handleBackgroundSubagentCompletion({ parentAgentId: "leo", subagentAgentId: "task-1", subagentType: "explore", toolCallId: "t", title: "Look around", status: "completed", result: "Found it." });
    await settle(2);
    assert.equal(written.length, 2);
    assert.equal(runs.length, 2);
    assert.doesNotMatch(runs[1].prompt, /cloud agent's own report/, "a helper's end says nothing of a card");
    session.db.appendTranscriptEntry = () => { throw new Error("the chat's file is locked"); };
    revivals.handleBackgroundSubagentCompletion({ parentAgentId: "leo", subagentAgentId: "bc-2", subagentType: "cloud-agent", toolCallId: "", title: "Fix the build", status: "error", result: "The tests fail." });
    await settle(3);
    assert.equal(runs.length, 3);
    assert.match(runs[2].prompt, /The tests fail\./);
    assert.equal(revived[2].outcome, "delivered");

    // One with no words of its own shows the report, and one with no name is left for the apps to name. A watch that
    // gave up waiting (no `cloudAgent`: the cloud agent hasn't ended) shows no card.
    session.db.appendTranscriptEntry = (entry) => written.push(entry);
    revivals.handleBackgroundSubagentCompletion({ parentAgentId: "leo", subagentAgentId: "bc-3", subagentType: "cloud-agent", toolCallId: "", title: "Cloud agent bc-3", status: "completed", result: "The cloud agent finished." });
    await settle(4);
    assert.equal(written.length, 3);
    assert.equal(written[2].content, "The cloud agent finished.");
    assert.deepEqual(written[2].fromAgent, { id: "bc-3", name: "", kind: "cloud-agent" });

    // One that failed has its card too (the apps draw Failed), after what it said went wrong.
    revivals.handleBackgroundSubagentCompletion({ parentAgentId: "leo", subagentAgentId: "bc-4", subagentType: "cloud-agent", toolCallId: "", title: "Cloud agent bc-4", status: "error", result: "The cloud agent (bc-4) errored before finishing.\n\nClaude Code stopped: the build fails.", cloudAgent: { name: "Fix the build", said: "Claude Code stopped: the build fails.", coder: "claude-code" } });
    await settle(5);
    assert.equal(written[3].content, "Claude Code stopped: the build fails.");
    assert.deepEqual(written[4].message, { type: "cloud-agent", bcId: "bc-4" });
  } finally {
    await dispose();
  }
});

// The exchange with a cloud agent reads as one with a teammate (13 November 2026, the founder: "message to and message
// from, like messaging agents work ... the agent should answer him and say on it ... that card should only come once the
// job is done"): the launch is the agent's message to it, its first words are its message back, and the card waits.
test("a launch is the agent's message to the cloud agent, its first words are its message back, and its card waits for the end", async () => {
  const { module: m, dispose } = await load();
  try {
    const written = [], kept = [];
    const { tm } = revivalHost({});
    const session = { id: "leo", db: { getTranscriptEntries: () => written, appendTranscriptEntry: (entry) => written.push(entry) } };
    tm.sessions.liveSessions = new Map([["leo", session]]);
    tm.sessions.resolveBackgroundSession = async (agentId) => (agentId === "leo" ? session : null);
    tm.sessionStore = { markSessionActivity() {} };
    tm.pendingWakeStore = { listPending: () => kept, hasPending: (agentId, kind, workId) => kept.some((marker) => marker.agentId === agentId && marker.kind === kind && marker.workId === workId) };
    const messaging = new m.AgentToAgentMessaging(tm);
    const cloud = { id: "bc-1", name: "Polish the README", coder: "claude-code" };

    messaging.noteCloudAgentAsked("leo", cloud, "  Polish the README: fix the typos and add an install section.  ");
    assert.equal(written.length, 1);
    const { id, timestampMs, ...asked } = written[0];
    assert.ok(typeof id === "string" && id !== "" && timestampMs > 0);
    assert.deepEqual(asked, { kind: "message", role: "assistant", content: "Polish the README: fix the typos and add an install section.", isStreaming: false, toAgent: { id: "bc-1", name: "Polish the README", kind: "cloud-agent", coder: "claude-code" } });

    // Its "on it": a line from it in the same chat; said twice, written once; nothing said, nothing written.
    assert.equal(await messaging.noteCloudAgentSaid(cloud, "On it. I'll read the README first."), true);
    assert.equal(await messaging.noteCloudAgentSaid(cloud, "   "), false);
    assert.equal(written.length, 2);
    assert.deepEqual({ role: written[1].role, content: written[1].content, fromAgent: written[1].fromAgent }, { role: "user", content: "On it. I'll read the README first.", fromAgent: { id: "bc-1", name: "Polish the README", kind: "cloud-agent", coder: "claude-code" } });
    await messaging.noteCloudAgentSaid(cloud, "On it. I'll read the README first.");
    assert.equal(written.length, 2, "the same words aren't written twice in a row");

    // After a restart nobody remembers who asked: the kept wake says it. With neither, there is no chat to write in.
    const afterRestart = new m.AgentToAgentMessaging(tm);
    assert.equal(await afterRestart.noteCloudAgentSaid({ id: "bc-2", name: "Fix the build" }, "On it."), false);
    kept.push({ agentId: "leo", kind: "cloud-agent", workId: "bc-2" });
    assert.equal(await afterRestart.noteCloudAgentSaid({ id: "bc-2", name: "Fix the build" }, "On it."), true);
    assert.deepEqual(written[2].fromAgent, { id: "bc-2", name: "Fix the build", kind: "cloud-agent" });
    tm.sessions.deletedAgentIds.add("leo");
    assert.equal(await afterRestart.noteCloudAgentSaid({ id: "bc-2", name: "Fix the build" }, "Reading."), false);
    tm.sessions.deletedAgentIds.clear();

    // The card: never while the cloud agent runs; once it has ended, once per run.
    const card = (bcId) => ({ kind: "send-message", message: { type: "cloud-agent", bcId } });
    assert.equal(m.cloudAgentCardDue(written, "bc-1", true), false, "still running: the agent's own card isn't shown");
    assert.equal(m.cloudAgentCardDue(written, "bc-1", false), true, "ended, and no card yet");
    assert.equal(m.cloudAgentCardDue([...written, card("bc-1")], "bc-1", false), false, "its card is already there");
    assert.equal(m.cloudAgentCardDue([...written, card("bc-1")], "bc-2", false), true, "another cloud agent's card doesn't count");
    assert.equal(m.cloudAgentCardDue([...written, card("bc-1"), { kind: "message", role: "assistant", toAgent: { id: "bc-1" } }], "bc-1", false), true, "a follow-up starts a new run, which gets its own card at its end");
    assert.equal(m.cloudAgentCardDue([card("bc-9")], "bc-9", false), false);
    assert.equal(m.cloudAgentCardDue([], "bc-9", false), true, "an earlier chat with no lines: the card may be shown");

    // A chat that can't take a line never throws into the launch or the coding.
    session.db.appendTranscriptEntry = () => { throw new Error("the chat's file is locked"); };
    messaging.noteCloudAgentAsked("leo", cloud, "Again.");
    assert.equal(await messaging.noteCloudAgentSaid(cloud, "Something new."), false);
  } finally {
    await dispose();
  }
});

test("the instructions say what happens: woken when a background command ends, and only then", async () => {
  const { module: m, dispose } = await load();
  try {
    const prompt = m.buildSandBaseSystemPrompt({ cloudAgentsEnabled: false, videoSubagentOffered: false });
    const section = prompt.slice(prompt.indexOf("## Long-running commands"), prompt.indexOf("## Delegating background work"));
    assert.match(section, /you're woken with its result in a new turn, even after this turn has ended/);
    assert.match(section, /block_until_ms to 0/);
    assert.match(section, /Only a command in the background wakes you/);
    assert.match(section, /`az provider register`/);
    assert.match(section, /takes a few minutes/);
    assert.match(section, /stopped after 2 hours/);
    assert.match(section, /ExternalAwaitShell/);
    assert.doesNotMatch(section, /notified the moment it completes/);
    assert.doesNotMatch(section, /don't poll or await it/);
    const note = m.claudeCodeBriefNote();
    assert.match(note, /`mcp__simeon__Shell` command that goes to the background/);
    assert.match(note, /wakes you with its result in a new turn when it finishes, even after your turn has ended; nothing else wakes you/);
    assert.match(note, /Before you tell the person something takes a few minutes and end your turn/);
    assert.match(note, /\[A background command just completed\]/);
    assert.doesNotMatch(m.claudeCodeBriefNote("helper"), /wakes you/, "a helper is not woken");
  } finally {
    await dispose();
  }
});

async function loadRunner() {
  // Inside the desktop folder, so the packages left external resolve from node_modules.
  const dir = await mkdtemp(path.join(repoRoot, ".tmp-background-wake-runner-"));
  const outfile = path.join(dir, "runner.mjs");
  await build({
    stdin: {
      contents: [
        'export { SandAgentRunner } from "./source/host/runner/sand-agent-runner.ts";',
        'export { readExecutorResource } from "./source/packages/agent-exec/read.js";',
        'export { createContext } from "./source/packages/context/core.js";',
        'export { ReadResult, ReadSuccess } from "./source/packages/proto/generated/agent/v1/read_exec_pb.js";',
      ].join("\n"),
      resolveDir: repoRoot,
      loader: "ts",
    },
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    logLevel: "silent",
    packages: "external",
  });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

test("the agent's runner watches a command, keeps and clears its wake, and wakes the agent with its end", async () => {
  const { module: m, dispose } = await loadRunner();
  const before = process.env.SAND_SHELL_REWATCH_POLL_MS;
  process.env.SAND_SHELL_REWATCH_POLL_MS = "10";
  try {
    const files = new Map([["4242", "---\npid: 77\n---\n"], ["5150", "---\npid: 78\n---\n"]]);
    const box = {
      async ensureReady() {
        return {
          terminalsFolder: TERMINALS,
          remoteAccessor: {
            get(resource) {
              assert.equal(resource, m.readExecutorResource);
              return { execute: async (_context, args) => readOf(m, files.get(path.basename(args.path, ".txt")) ?? "") };
            },
          },
        };
      },
    };
    const runner = new m.SandAgentRunner({ conversationId: "tessa", ctx: m.createContext(), box });
    const armed = [];
    const disarmed = [];
    const woken = [];
    runner.setPendingWakeArmedHandler((event) => armed.push(event));
    runner.setPendingWakeDisarmedHandler((event) => disarmed.push(event));
    runner.setBackgroundShellHandler((completion) => woken.push(completion));

    runner.watchBackgroundShell("4242", { title: "Switch on Container Apps" });
    runner.watchBackgroundShell("5150", { title: "npm run build" });
    assert.deepEqual(armed.map((event) => event.workId), ["4242", "5150"]);
    assert.equal(runner.hasRunningBackgroundShellWork(), true, "the computer is held (`host-busy.ts`)");
    assert.deepEqual(runner.getPendingShellRewatchIds().sort(), ["4242", "5150"]);

    files.set("4242", "---\npid: 77\n---\nRegistered\n\n---\nexit_code: 0\nended_at: x\n---\n");
    for (let tries = 0; tries < 200 && woken.length === 0; tries += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(woken.length, 1);
    assert.equal(woken[0].agentId, "tessa");
    assert.equal(woken[0].shellId, "4242");
    assert.equal(woken[0].status, "success");
    assert.deepEqual(runner.getPendingShellRewatchIds(), ["5150"]);

    // The agent read the end of 5150 itself: its watch ends, its kept wake goes, and a wake already queued is dropped.
    assert.equal(runner.forgetBackgroundShell("5150"), true);
    assert.deepEqual(disarmed, [{ parentAgentId: "tessa", kind: "shell", workId: "5150" }]);
    assert.equal(runner.hasRunningBackgroundShellWork(), false);
    assert.equal(runner.takeBackgroundShellEndSeen("5150"), true);
    assert.equal(runner.takeBackgroundShellEndSeen("5150"), false, "once");
    assert.equal(runner.takeBackgroundShellEndSeen("4242"), false, "a command the agent did not read wakes it");

    // Stop task: every watched command is forgotten.
    runner.watchBackgroundShell("6000", { title: "npm test" });
    runner.watchBackgroundShell("6001", { title: "npm run lint" });
    assert.equal(runner.forgetBackgroundShells(), 2);
    assert.equal(runner.hasRunningBackgroundShellWork(), false);
    runner.dispose();
  } finally {
    if (before === undefined) delete process.env.SAND_SHELL_REWATCH_POLL_MS;
    else process.env.SAND_SHELL_REWATCH_POLL_MS = before;
    await dispose();
  }
});
