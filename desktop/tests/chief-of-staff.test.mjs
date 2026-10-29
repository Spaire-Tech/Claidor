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
  assert.equal(words.staffingMessage("Bass F", "Run his inbox.", "en-US"), "Bass staffed you to run his inbox.", "English as before");
  // In the person's language (22 October 2026): never English glued to the brief.
  assert.equal(words.staffingMessage("Bass F", "Bass t’a confié sa boîte mail : trie ce qui l’attend.", "fr"), "Bass t’a confié sa boîte mail : trie ce qui l’attend.");
  assert.equal(words.staffingMessage("Bass F", "Trie la boîte mail de Bass.", "fr-CA"), "Trie la boîte mail de Bass.", "the name in its first words");
  assert.equal(words.staffingMessage("Bass F", "Gère sa boîte mail.", "fr"), "Bass t’a confié ce travail. Gère sa boîte mail.");
  assert.equal(words.staffingMessage("Bass F", "Kümmere dich um sein Postfach.", "de"), "Bass hat dir diese Aufgabe übertragen. Kümmere dich um sein Postfach.");
  assert.equal(words.staffingMessage(null, "Gère la compta.", "fr"), "Gère la compta.", "no name: as written");
  assert.match(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /^\[first run\] This is your very first turn as the person's Chief of Staff\./);
  assert.match(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /What's the first thing you'd hand to a person if you hired one today\?/);
  assert.match(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /GetMcpServerStatus/);
  assert.match(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /Do not propose connectors for yourself/);
  assert.match(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /staffed you to/);
  assert.match(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /three roles at most for a first team/);
  assert.match(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /ask what you recommend, recommend/);
  assert.match(words.chiefOfStaffSection("Bass F"), /^## Chief of staff\n/);
  assert.match(words.chiefOfStaffSection("Bass F"), /"Bass staffed you to …"/);
  assert.match(words.chiefOfStaffSection("Bass F", "en"), /Every brief you write to an agent starts with "Bass staffed you to …"\./);
  assert.match(words.chiefOfStaffSection("Bass F", "fr"), /Every brief you write to an agent is in French, as everything the person can read, and opens by saying Bass staffed it for the job/);
  assert.match(words.staffedFirstRunCue({ fromName: "Simeon", personName: "Bass F" }), /^\[first run\] You were just created, and the message below from Simeon is your first/);
  assert.match(words.staffedFirstRunCue({ fromName: "Simeon", personName: "Bass F" }), /write to your user, Bass with SendMessage/);
});

test("the lifecycle runs the Chief of Staff's own first run by title, and the generic one for everyone else", async () => {
  const lifecycle = await loadModule("source/host/extensions/transcript/agent-lifecycle.ts", "agent-lifecycle-cos");
  for (const [title, expected, language] of [["Chief of Staff", /as the person's Chief of Staff/, undefined], ["Chief of Staff", /as the person's Chief of Staff/, "fr"], ["Inbox", /^\[first run\] This is your very first turn\. The user just created you/, undefined]]) {
    let pending = true;
    const prompts = [];
    const posted = [];
    const order = [];
    const session = { id: "a1", db: { getIntroductionPending: () => pending, setIntroductionPending: (value) => { pending = value; }, getTranscriptEntries: () => posted, getAgentPurpose: () => null, appendTranscriptEntry: (entry) => { posted.push(entry); order.push("posted"); } } };
    const tm = {
      sessionStore: { getAgentProfileText: (id) => (id === "a1" ? { name: "Simeon", description: "", title } : null), markSessionActivity() {} },
      sessions: { activeSession: null, resolveBackgroundSession: async () => session },
      groupChat: { isGroupSession: () => false, isRemoteRoomSession: () => false },
      execution: { canExecute: true, isRunReady: async () => true },
      runLifecycle: { inFlightRunCounts: new Map(), lastRequestIdBySession: new Map(), beginSessionRun() {}, endSessionRun() {}, enqueueExclusiveRun: async (_id, run) => { await run(); } },
      runnerRegistry: { getRunner: () => ({ run: async (prompt) => { prompts.push(prompt); order.push("run"); return { aborted: false, sentMessageCount: 1 }; } }) },
      turnRuntime: { activeRequestSources: new Map() },
      automationRuntime: { ensureHiddenTurnReply: async () => true },
      upgradeResume: { markAgentResumePending() {} },
      trayErrors: { pushError() {} },
      roster: { emitAgentUpdate: async () => {} },
      telemetry: { reportAgentError() {} },
      requestContextUserFullName: () => "Bass F",
      userLanguage: () => language,
    };
    await new lifecycle.AgentLifecycle(tm).kickstartAgent("a1", true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(prompts.length, 1, title);
    assert.match(prompts[0], expected, title);
    if (title !== "Chief of Staff") {
      assert.deepEqual(posted, [], "nobody else's hello is posted for them");
      continue;
    }
    // The founder's words (29 October 2026), four messages posted at once, before his turn adds the card.
    const hello = words.chiefOfStaffHello("Bass F", language);
    assert.deepEqual(posted.map((entry) => entry.kind), ["send-message", "send-message", "send-message", "send-message"]);
    assert.deepEqual(posted.map((entry) => entry.message), hello.map((content) => ({ type: "text", content })));
    assert.equal(new Set(posted.map((entry) => entry.id)).size, 4, "each its own id");
    assert.ok(posted.every((entry, index) => index === 0 || entry.timestampMs > posted[index - 1].timestampMs), "in order");
    assert.ok(posted[3].timestampMs - posted[0].timestampMs < 50, "together");
    assert.deepEqual(order, ["posted", "posted", "posted", "posted", "run"]);
    for (const line of hello) assert.ok(prompts[0].includes(`"${line}"`), "his turn is told what he said");
    assert.match(prompts[0], /Do not greet them again or repeat any of it\. Your first turn is exactly one message: a question widget/);
  }
});

test("his hello lands in the open chat the same way, each message its own id", async () => {
  const lifecycle = await loadModule("source/host/extensions/transcript/agent-lifecycle.ts", "agent-lifecycle-open");
  const shown = [];
  let pending = true;
  const session = { id: "a1", db: { getIntroductionPending: () => pending, setIntroductionPending: (value) => { pending = value; }, getTranscriptEntries: () => [], getAgentPurpose: () => null, appendTranscriptEntry() { throw new Error("the open chat appends through the send pipeline"); } } };
  const tm = {
    sessionStore: { getAgentProfileText: () => ({ name: "Simeon", description: "", title: "Chief of Staff" }), markSessionActivity() {} },
    sessions: { activeSession: session, resolveBackgroundSession: async () => session },
    sendPipeline: { appendSendMessageEntry: (entry) => shown.push(entry) },
    groupChat: { isGroupSession: () => false, isRemoteRoomSession: () => false },
    execution: { canExecute: true, isRunReady: async () => true },
    runLifecycle: { inFlightRunCounts: new Map(), lastRequestIdBySession: new Map(), beginSessionRun() {}, endSessionRun() {}, enqueueExclusiveRun: async (_id, run) => { await run(); } },
    runnerRegistry: { getRunner: () => ({ run: async () => ({ aborted: false, sentMessageCount: 1 }) }) },
    turnRuntime: { activeRequestSources: new Map() },
    automationRuntime: { ensureHiddenTurnReply: async () => true },
    upgradeResume: { markAgentResumePending() {} },
    trayErrors: { pushError() {} },
    roster: { emitAgentUpdate: async () => {} },
    telemetry: { reportAgentError() {} },
    requestContextUserFullName: () => undefined,
  };
  await new lifecycle.AgentLifecycle(tm).kickstartAgent("a1", true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(shown.map((entry) => entry.message.content), words.chiefOfStaffHello(null));
  assert.equal(new Set(shown.map((entry) => entry.id)).size, 4);
  assert.equal(pending, false, "the introduction is done");
});

test("Simeon's hello is the founder's, in the person's language", async () => {
  assert.deepEqual(words.chiefOfStaffHello("Bassirou Fall"), [
    "Hi Bassirou, my name is Simeon, and I'm your Chief of Staff.",
    "What I do is help build a team of agents to help you get things done. Each one has a job to do and its own computer to do it on, so they can use your apps, browse the web, and take care of things while you're busy doing everything else.",
    "You can check in on them anytime, watch them work, or jump in and take over. I'll keep an eye on the bigger picture and bring you in when something needs your attention.",
    "Unless you have any questions for me, I'd like to hire your first teammate.",
  ]);
  assert.equal(words.chiefOfStaffHello(null)[0], "Hi, my name is Simeon, and I'm your Chief of Staff.");
  assert.equal(words.chiefOfStaffHello("Bass", "fr")[0], "Salut Bass, je m’appelle Simeon, et je suis ton bras droit.");
  assert.equal(words.chiefOfStaffHello("Bass", "de")[0], "Hallo Bass, ich heiße Simeon und bin dein Chief of Staff.");
  // The demos (the site's live one, the apps' own) say it as the engine does.
  const scenario = await readFile(path.join(repoRoot, "demo/scenario.ts"), "utf8");
  const appDemo = await readFile(path.join(repoRoot, "../ios/SimeonCore/Sources/SimeonCore/Demo.swift"), "utf8");
  for (const line of words.chiefOfStaffHello("Bass")) {
    assert.ok(scenario.includes(JSON.stringify(line)), `the site's demo: ${line}`);
    assert.ok(appDemo.includes(JSON.stringify(line)), `the apps' demo: ${line}`);
  }
  for (const language of ["fr", "es", "de", "nl", "it", "pt-BR", "sv", "pl", "tr"]) {
    const said = words.chiefOfStaffHello("Bass", language);
    assert.equal(said.length, 4, language);
    assert.match(said[0], /Bass/, language);
    assert.ok(said.every((line, index) => line !== words.chiefOfStaffHello("Bass")[index]), `${language}: translated`);
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
  assert.match(assembly, /if \(!deps\.isSubagentRunner && isChiefOfStaffTitle\(deps\.agentProfileProvider\(\)\?\.title\)\) add\(chiefOfStaffSection\(deps\.requestContext\.resolve\(\)\.userFullName, deps\.userLanguage\?\.\(\)\)\);/);
  const profileWatch = await readFile(path.join(repoRoot, "source/host/extensions/transcript/profile-watch.ts"), "utf8");
  assert.match(profileWatch, /title: profile\?\.title \?\? "",/);
});

test("the title given at New Agent is the agent's role in its own prompt, and the first hello names it", async () => {
  const assembly = await readFile(path.join(repoRoot, "source/host/runner/system-prompt-assembly.ts"), "utf8");
  assert.match(assembly, /const role = profile\.title\?\.trim\(\) \?\? "";\n\s*if \(role\.length > 0 && !sharedRoom\) lines\.push\(`Role: \$\{role\}\. This is the job the user made you for; work as that role\.`\);/);
  const { SAND_ONBOARDING_KICKSTART_PROMPT } = await loadModule("source/shared/agents/onboarding.ts", "onboarding");
  assert.match(SAND_ONBOARDING_KICKSTART_PROMPT, /say who you are \(and your role, when your profile gives you one\); if you have neither a description nor a role yet, say you're a blank slate/);
});
