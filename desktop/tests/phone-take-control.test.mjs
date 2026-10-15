/**
 * The phone's browser view, engine side (15 October 2026): the agent's tab
 * streamed on `GET /tab-view`, and the two buttons under it. Take control
 * stops a working agent and makes the computer the person's until they hand
 * it back, which resumes the agent with its own sentence; Stop task stops the
 * agent and its helpers, and a stopped helper's result does not wake it.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => readFile(path.join(repoRoot, "source", file), "utf8");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  try {
    return await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("GET /tab-view streams the agent's tab as server-sent events, with the gateway's token, and closing it gives the tab back", async () => {
  const gateway = await load("source/host/gateway-server.ts", "gateway-tab-view");
  const opened = [];
  const closed = [];
  let sink;
  const tabView = {
    async open(agentId, request, given) {
      opened.push({ agentId, request });
      if (agentId === "no-browser") return { ok: false, reason: "no-browser" };
      sink = given;
      setTimeout(() => { void sink.send({ type: "tab", url: "https://appleid.apple.com/", title: "Sign in" }); void sink.send({ type: "frame", jpeg: "AAAA", width: 390, height: 700 }); }, 10);
      return { ok: true, close: (reason) => closed.push(reason) };
    },
  };
  const server = await gateway.startGatewayServer({ api: { getAgentAvatar: async () => ({}) }, subscribe: () => () => {}, getHealth: () => ({}), startedAt: 0, authToken: "secret", tabView });
  const base = `http://127.0.0.1:${server.port}`;
  try {
    assert.equal((await fetch(`${base}/tab-view?agent=a1`)).status, 401, "the gateway's token is required");
    assert.equal((await fetch(`${base}/tab-view`, { headers: { authorization: "Bearer secret" } })).status, 400);
    const unavailable = await fetch(`${base}/tab-view?agent=no-browser`, { headers: { authorization: "Bearer secret" } });
    assert.equal(await unavailable.text(), 'data: {"type":"closed","reason":"no-browser"}\n\n', "no browser: one closed event, then the end");

    const controller = new AbortController();
    const response = await fetch(`${base}/tab-view?agent=a1&width=390&height=700&control=1`, { headers: { authorization: "Bearer secret" }, signal: controller.signal });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/event-stream");
    assert.equal(response.headers.get("content-encoding"), null, "pictures are not gzipped");
    assert.deepEqual(opened.at(-1), { agentId: "a1", request: { width: 390, height: 700, control: true } });
    const reader = response.body.getReader();
    let text = "";
    while (!text.includes('"type":"frame"')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    assert.match(text, /data: \{"type":"tab","url":"https:\/\/appleid\.apple\.com\/","title":"Sign in"\}\n\n/);
    assert.match(text, /data: \{"type":"frame","jpeg":"AAAA","width":390,"height":700\}\n\n/);
    controller.abort();
    for (let i = 0; i < 100 && closed.length === 0; i += 1) await wait(10);
    assert.deepEqual(closed, ["viewer-closed"], "the phone going away closes the view");
    await assert.rejects(sink.send({ type: "frame", jpeg: "B", width: 1, height: 1 }), "a picture for a viewer gone fails, so the engine stops");
  } finally {
    await server.close();
  }
});

function fakeApi(handlers) {
  return new Proxy({}, { get: (_target, name) => handlers[name] ?? (() => undefined) });
}

async function gatewayApi({ working, pending = null }) {
  const module = await load("source/host/host-gateway-api.ts", "gateway-api-control");
  const calls = [];
  const session = fakeApi({
    pendingHandoff: () => pending,
    startHandoff: (request) => { calls.push(["startHandoff", request]); return { kind: "started", requestId: "r1" }; },
    endHandoff: async (id, trigger) => { calls.push(["endHandoff", id, trigger]); },
  });
  const manager = fakeApi({
    isAgentWorking: (id) => { calls.push(["isAgentWorking", id]); return working; },
    stopAgentTask: async (id) => { calls.push(["stopAgentTask", id]); return { stopped: true }; },
  });
  const extensions = { api: (id) => id === "session" ? session : id === "transcript" ? manager : fakeApi({}) };
  const tabViews = { input: async (id, value) => { calls.push(["tabInput", id, value]); return { ok: true, focus: "password" }; } };
  const api = module.createHostGatewayApi({ extensions, hostEvents: { emit() {} }, decorateForeverBoxStatus: (s) => s, getHealth: () => ({ isBusy: false }), kickstartIfPending: async () => false, requestDiskSaverAudit: async () => false, releaseAgentBox: async () => {}, handleDesktopMcpAuthCompletion: async () => {}, forgetLocalToolPermission() {}, tabViews });
  return { api, calls };
}

test("Take control stops a working agent and hands the person the computer; an idle agent is left alone", async () => {
  const working = await gatewayApi({ working: true });
  assert.deepEqual(await working.api.takeComputerControl({ id: "a1" }), { handoff: true });
  assert.deepEqual(working.calls, [
    ["isAgentWorking", "a1"],
    ["stopAgentTask", "a1"],
    ["startHandoff", { agentId: "a1", instruction: "You took control of the computer.", source: "person" }],
  ]);
  const idle = await gatewayApi({ working: false });
  assert.deepEqual(await idle.api.takeComputerControl({ id: "a1" }), { handoff: false });
  assert.deepEqual(idle.calls, [["isAgentWorking", "a1"]], "nothing stopped, no hand-off");
  assert.deepEqual(await idle.api.tabViewInput({ id: "a1", input: { kind: "tap", x: 1, y: 2 } }), { ok: true, focus: "password" });
  assert.deepEqual(idle.calls.at(-1), ["tabInput", "a1", { kind: "tap", x: 1, y: 2 }]);
});

test("Stop task ends an open hand-off without waking the agent, then stops it", async () => {
  const { api, calls } = await gatewayApi({ working: false, pending: { requestId: "r1", instruction: "Sign in" } });
  assert.deepEqual(await api.stopAgentTask({ id: "a1" }), { stopped: true });
  assert.deepEqual(calls, [["endHandoff", "a1", "stopped"], ["stopAgentTask", "a1"]]);
  const host = await src("host/sand-host.ts");
  assert.match(host, /if \(event\.trigger === "stopped"\) return;\n\s*await optionalMethod\(this\.transcript, "resumeAfterBoxHandoff"\)/, "a stopped hand-off resumes nothing");
  const protocol = await src("host/gateway-protocol.ts");
  for (const command of ["tabViewInput", "takeComputerControl", "stopAgentTask"]) assert.match(protocol, new RegExp(`${command}: \\(api: GatewayApi, body: string\\) => api\\.${command}\\(parseCommandArgs\\(body\\)\\)`));
});

test("a hand-off the person started ends as taken-back; Stop task's ends as cancelled", async () => {
  const { decideBoxHandBack, BoxHandoffService } = await load("source/host/extensions/session/box-handoff-service.ts", "handoff-service");
  assert.deepEqual(decideBoxHandBack({ requestId: "r", instruction: "x", source: "person" }, "button"), { kind: "end", requestId: "r", resolution: "completed", trigger: "taken-back" });
  assert.deepEqual(decideBoxHandBack({ requestId: "r", instruction: "x" }, "button"), { kind: "end", requestId: "r", resolution: "completed", trigger: "button" }, "the agent's own hand-off is unchanged");
  assert.deepEqual(decideBoxHandBack({ requestId: "r", instruction: "x", source: "person" }, "stopped"), { kind: "end", requestId: "r", resolution: "cancelled", trigger: "stopped" });
  const ended = [];
  const service = new BoxHandoffService({ onEnded: (event) => { ended.push(event); } });
  service.start({ agentId: "a1", instruction: "You took control of the computer.", source: "person" });
  assert.equal(service.get("a1").source, "person");
  await service.end("a1", "button");
  assert.equal(ended[0].trigger, "taken-back");
});

test("the agent handed back a computer the person took over is told so, and carries on", async () => {
  const { BoxHandoffResume } = await load("source/host/extensions/transcript/box-handoff-resume.ts", "handoff-resume");
  const resume = new BoxHandoffResume({});
  const prompts = [];
  resume.resumeWithHiddenPrompt = async (_agentId, prompt) => { prompts.push(prompt); };
  await resume.resumeAfterBoxHandoff("a1", "taken-back");
  assert.match(prompts[0], /^\[The user took over your computer while you were working \(that stopped your run\) and has now handed it back\./);
  assert.match(prompts[0], /carry on with the task they gave you from where things now stand/);
  await resume.resumeAfterBoxHandoff("a1", "button");
  assert.match(prompts[1], /^\[The user handed the box back to you\./, "the agent's own hand-off keeps its sentence");
});

test("Stop task interrupts the run and every helper, and a stopped helper's result wakes no one", async () => {
  const { AgentLifecycle } = await load("source/host/extensions/transcript/agent-lifecycle.ts", "agent-lifecycle-stop");
  const { CompletionRevivals } = await load("source/host/extensions/transcript/completion-revivals.ts", "completion-revivals-stop");
  const events = [];
  const tm = {
    telemetry: { reportTurnInterrupt: (event) => events.push(["interrupt", event.reason, event.hadActiveRun]), reportSubagentRevival: (event) => events.push(["revival", event.outcome, event.reason]) },
    sessions: { deletedAgentIds: new Set() },
    execution: { canExecute: true },
    roster: { emitAgentUpdate: async (id) => events.push(["update", id]) },
  };
  const revivals = new CompletionRevivals(tm);
  revivals.reviveForSubagentCompletions = async (id) => events.push(["revived", id]);
  const runner = {
    hasRunningSubagents: () => true,
    interruptAll: (reason) => { events.push(["interruptAll", reason]); return true; },
    // The helper settles while the run drains: its result arrives mid-stop.
    drainBackgroundSubagents: async () => { revivals.handleBackgroundSubagentCompletion({ parentAgentId: "a1", subagentAgentId: "h1", subagentType: "browserUse" }); },
  };
  tm.backgroundWakes = { completionRevivals: revivals, pendingSubagentCompletions: revivals.pendingSubagentCompletions };
  tm.runnerRegistry = { runners: new Map([["a1", runner]]), activeGroupMemberRunners: new Map() };
  tm.runLifecycle = { runningAgentIds: () => new Set(["a1"]), drainExclusiveRuns: async () => {} };
  const lifecycle = new AgentLifecycle(tm);
  assert.equal(lifecycle.isAgentWorking("a1"), true);
  assert.deepEqual(await lifecycle.stopAgentTask("a1"), { stopped: true });
  assert.deepEqual(events, [
    ["interruptAll", "stopped by the person"],
    ["interrupt", "stopped_by_person", true],
    ["revival", "dropped", "stopped_by_person"],
    ["update", "a1"],
  ]);
  assert.equal(revivals.stoppingAgentIds.size, 0, "after the stop, results wake the agent again");
  revivals.handleBackgroundSubagentCompletion({ parentAgentId: "a1", subagentAgentId: "h2", subagentType: "browserUse" });
  assert.deepEqual(events.at(-1), ["revived", "a1"], "a helper started after the stop is heard");
});
