/**
 * Simeon staffs (7 October 2026, the founder: "Simeon main job is to
 * delegate … onboarding should be him delegating"). Offline:
 *
 * - his first run is his own cue, chosen by title, and the generic cue stays
 *   for every other agent;
 * - a brief always opens "<first name> staffed you to …";
 * - CreateAgent with a brief delivers it as the agent's first message and
 *   runs no generic greeting; without one it behaves as before;
 * - a brief that is an agent's first message gets the staffed first-run cue
 *   in front of it, and the greeting is no longer owed;
 * - the prompt carries the Chief of Staff's section for him and nobody else.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"] });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  await rm(temporary, { recursive: true, force: true });
  return module;
}

const words = await loadModule("source/shared/agents/chief-of-staff.ts", "chief-of-staff");

test("the Chief of Staff is known by title, and a brief opens with the person's first name", () => {
  assert.equal(words.isChiefOfStaffTitle("Chief of Staff"), true);
  assert.equal(words.isChiefOfStaffTitle(" coo "), true);
  assert.equal(words.isChiefOfStaffTitle("Inbox"), false);
  assert.equal(words.isChiefOfStaffTitle(undefined), false);
  assert.equal(words.personFirstName("Bass F"), "Bass");
  assert.equal(words.personFirstName("  "), null);
  assert.equal(words.staffingMessage("Bass F", "Run his inbox: sort what needs him, draft replies."), "Bass staffed you to run his inbox: sort what needs him, draft replies.");
  assert.equal(words.staffingMessage("Bass F", "to run his inbox."), "Bass staffed you to run his inbox.");
  assert.equal(words.staffingMessage("Bass F", "Bass staffed you to run his inbox."), "Bass staffed you to run his inbox.");
  assert.equal(words.staffingMessage(null, "Run the books."), "Your user staffed you to run the books.");
  assert.match(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /^\[first run\] This is your very first turn as the person's Chief of Staff\./);
  assert.match(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /What's the first thing you'd hand to a person if you hired one today\?/);
  assert.match(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /GetMcpServerStatus/);
  assert.match(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /Do not propose connectors for yourself/);
  assert.match(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /staffed you to/);
  assert.match(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /three roles at most for a first team/);
  assert.match(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /ask what you recommend, recommend/);
  assert.match(words.chiefOfStaffSection("Bass F"), /^## Chief of staff\n/);
  assert.match(words.chiefOfStaffSection("Bass F"), /"Bass staffed you to …"/);
  assert.match(words.staffedFirstRunCue({ fromName: "Simeon", personName: "Bass F" }), /^\[first run\] You were just created, and the message below from Simeon is your first/);
  assert.match(words.staffedFirstRunCue({ fromName: "Simeon", personName: "Bass F" }), /write to your user, Bass with SendMessage/);
});

test("the lifecycle runs the Chief of Staff's own first run by title, and the generic one for everyone else", async () => {
  const lifecycle = await loadModule("source/host/extensions/transcript/agent-lifecycle.ts", "agent-lifecycle-cos");
  for (const [title, expected] of [["Chief of Staff", /as the person's Chief of Staff/], ["Inbox", /^\[first run\] This is your very first turn\. The user just created you/]]) {
    let pending = true;
    const prompts = [];
    const session = { id: "a1", db: { getIntroductionPending: () => pending, setIntroductionPending: (value) => { pending = value; }, getTranscriptEntries: () => [], getAgentPurpose: () => null } };
    const tm = {
      sessionStore: { getAgentProfileText: (id) => (id === "a1" ? { name: "Simeon", description: "", title } : null) },
      sessions: { activeSession: null, resolveBackgroundSession: async () => session },
      groupChat: { isGroupSession: () => false, isRemoteRoomSession: () => false },
      execution: { canExecute: true, isRunReady: async () => true },
      runLifecycle: { inFlightRunCounts: new Map(), lastRequestIdBySession: new Map(), beginSessionRun() {}, endSessionRun() {}, enqueueExclusiveRun: async (_id, run) => { await run(); } },
      runnerRegistry: { getRunner: () => ({ run: async (prompt) => { prompts.push(prompt); return { aborted: false, sentMessageCount: 2 }; } }) },
      turnRuntime: { activeRequestSources: new Map() },
      automationRuntime: { ensureHiddenTurnReply: async () => true },
      upgradeResume: { markAgentResumePending() {} },
      trayErrors: { pushError() {} },
      roster: { emitAgentUpdate: async () => {} },
      telemetry: { reportAgentError() {} },
    };
    await new lifecycle.AgentLifecycle(tm).kickstartAgent("a1", true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(prompts.length, 1, title);
    assert.match(prompts[0], expected, title);
  }
});

test("CreateAgent with a brief delivers it first and skips the generic greeting; without one, as before", async () => {
  const tools = await loadModule("source/host/runner/tools/sand-agent-management-tools.ts", "agent-management-cos");
  const calls = [];
  const dependencies = {
    create: async (profile, options) => { calls.push(["create", profile, options]); return { id: "agent-nora", name: profile.name }; },
    brief: async (id, message) => { calls.push(["brief", id, message]); return "Sent."; },
    getPersonName: () => "Bass F",
    update: async () => null,
  };
  const context = await loadModule("source/packages/context/core.ts", "context-core-cos");
  const run = async (tool, args) => {
    const handler = { emitPartialToolCall() {}, executeToolCall: async (ctx, _initial, _id, work) => work(ctx) };
    const argsStream = (async function* () { yield JSON.stringify(args); })();
    return JSON.stringify(await tool.execute(context.createContext(), handler, argsStream, { toolCallId: "call-1" }));
  };
  const tool = tools.createCreateAgentTool(dependencies);
  const staffed = await run(tool, { name: "Nora", description: "Runs the inbox.", title: "Inbox", brief: "Run his inbox: sort what needs him, draft the replies." });
  assert.deepEqual(calls, [
    ["create", { name: "Nora", description: "Runs the inbox.", title: "Inbox" }, { startIntroduction: false }],
    ["brief", "agent-nora", "Bass staffed you to run his inbox: sort what needs him, draft the replies."],
  ]);
  assert.match(staffed, /delivered your brief as its first message/);
  calls.length = 0;
  const plain = await run(tool, { name: "Max", description: "" });
  assert.deepEqual(calls, [["create", { name: "Max", description: "" }, { startIntroduction: true }]]);
  assert.match(plain, /It introduces itself to the user in its own chat now/);
});

test("a brief that is an agent's first message carries the staffed cue, and the prompt carries his section for him only", async () => {
  const messaging = await readFile(path.join(repoRoot, "source/host/extensions/transcript/agent-to-agent-messaging.ts"), "utf8");
  assert.match(messaging, /const isStaffing = session\.db\.getIntroductionPending\?\.\(\) === true && index === 0;\n\s*if \(isStaffing\) session\.db\.setIntroductionPending\(false\);/);
  assert.match(messaging, /staffedFirstRunCue\(\{ fromName: message\.from\.name, personName: this\.tm\.requestContextUserFullName\?\.\(\) \?\? null \}\)/);
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  assert.match(composition, /method\(extensions\.api\("transcript"\), "setUserFullNameResolver"\)/);
  assert.match(composition, /if \(options\?\.startIntroduction !== false\) void Promise\.resolve\(method\(transcript, "kickstartCreatedAgent"\)/);
  assert.match(composition, /brief: async \(agentId: string, message: string\) => String\(await sendToAgent\(agentId, message, undefined, false\)/);
  const assembly = await readFile(path.join(repoRoot, "source/host/runner/system-prompt-assembly.ts"), "utf8");
  assert.match(assembly, /if \(!deps\.isSubagentRunner && isChiefOfStaffTitle\(deps\.agentProfileProvider\(\)\?\.title\)\) add\(chiefOfStaffSection\(deps\.requestContext\.resolve\(\)\.userFullName\)\);/);
  const profileWatch = await readFile(path.join(repoRoot, "source/host/extensions/transcript/profile-watch.ts"), "utf8");
  assert.match(profileWatch, /title: profile\?\.title \?\? "",/);
});
