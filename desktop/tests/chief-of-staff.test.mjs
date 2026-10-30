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
      runLifecycle: { inFlightRunCounts: new Map(), lastRequestIdBySession: new Map(), beginSessionRun() {}, endSessionRun() {}, enqueueExclusiveRun: async (_id, run) => { await run(); }, setSessionComposing: (_id, on) => order.push(on ? "typing" : "done typing") },
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
    const life = new lifecycle.AgentLifecycle(tm);
    const waits = [];
    life.pause = async (ms) => { waits.push(ms); };
    await life.kickstartAgent("a1", true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(prompts.length, 1, title);
    assert.match(prompts[0], expected, title);
    if (title !== "Chief of Staff") {
      assert.deepEqual(posted, [], "nobody else's hello is posted for them");
      assert.deepEqual(waits, [], "nor waited for");
      continue;
    }
    // The founder's words (29 October 2026), one message at a time after its typing (30 October 2026),
    // before his turn adds the card; the first says who he is.
    const hello = words.chiefOfStaffHello("Bass F", language);
    assert.deepEqual(posted.map((entry) => entry.kind), ["send-message", "send-message", "send-message", "send-message"]);
    assert.deepEqual(posted.map((entry) => entry.message), hello.map((content, index) => (index === 0 ? { type: "text", content, introduction: true } : { type: "text", content })));
    assert.equal(new Set(posted.map((entry) => entry.id)).size, 4, "each its own id");
    assert.ok(posted.every((entry, index) => index === 0 || entry.timestampMs >= posted[index - 1].timestampMs), "in order");
    assert.deepEqual(order, ["typing", "posted", "typing", "posted", "typing", "posted", "typing", "posted", "done typing", "run"]);
    assert.deepEqual(waits, [lifecycle.HELLO_OPEN_WAIT_MS, ...hello.map(lifecycle.helloTypingMs)], "nobody opened the chat: the longest wait, then each line's typing");
    for (const line of hello) assert.ok(prompts[0].includes(`"${line}"`), "his turn is told what he said");
    assert.match(prompts[0], /Do not greet them again or repeat any of it\. Your first turn is exactly one message: a question widget/);
  }
});

/** Simeon's chat for the hello's tests: `shown` through the open chat, `kept` straight to its record. */
function helloChat({ active = false } = {}) {
  const shown = [];
  const kept = [];
  const typing = [];
  const runs = [];
  const state = { pending: true };
  const session = { id: "a1", db: { getIntroductionPending: () => state.pending, setIntroductionPending: (value) => { state.pending = value; }, getTranscriptEntries: () => kept, getAgentPurpose: () => null, appendTranscriptEntry: (entry) => kept.push(entry) } };
  const tm = {
    sessionStore: { getAgentProfileText: () => ({ name: "Simeon", description: "", title: "Chief of Staff" }), markSessionActivity() {} },
    sessions: { activeSession: active ? session : null, resolveBackgroundSession: async () => session },
    sendPipeline: { appendSendMessageEntry: (entry) => shown.push(entry) },
    groupChat: { isGroupSession: () => false, isRemoteRoomSession: () => false },
    execution: { canExecute: true, isRunReady: async () => true },
    // In flight from its start to its end, as the real one counts it (`run-lifecycle.ts`).
    runLifecycle: { inFlightRunCounts: new Map(), lastRequestIdBySession: new Map(), beginSessionRun(begun) { this.inFlightRunCounts.set(begun, 1); }, endSessionRun(ended) { this.inFlightRunCounts.delete(ended); }, enqueueExclusiveRun: async (_id, run) => { await run(); }, setSessionComposing: (_id, on) => typing.push(on) },
    runnerRegistry: { getRunner: () => ({ run: async () => { runs.push(Date.now()); return { aborted: false, sentMessageCount: 1 }; } }) },
    turnRuntime: { activeRequestSources: new Map() },
    automationRuntime: { ensureHiddenTurnReply: async () => true },
    upgradeResume: { markAgentResumePending() {} },
    trayErrors: { pushError() {} },
    roster: { emitAgentUpdate: async () => {} },
    telemetry: { reportAgentError() {} },
    requestContextUserFullName: () => undefined,
  };
  return { session, tm, shown, kept, typing, runs, state };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

test("his hello lands in the open chat the same way, each message its own id", async () => {
  const lifecycle = await loadModule("source/host/extensions/transcript/agent-lifecycle.ts", "agent-lifecycle-open");
  const chat = helloChat({ active: true });
  const life = new lifecycle.AgentLifecycle(chat.tm);
  life.pause = async () => {};
  await life.kickstartAgent("a1", true);
  await tick();
  assert.deepEqual(chat.shown.map((entry) => entry.message.content), words.chiefOfStaffHello(null));
  assert.deepEqual(chat.kept, [], "the open chat appends through the send pipeline");
  assert.equal(new Set(chat.shown.map((entry) => entry.id)).size, 4);
  assert.equal(chat.state.pending, false, "the introduction is done");
});

test("his hello waits for his chat to open, then is written there; opened first, it starts at once", async () => {
  const lifecycle = await loadModule("source/host/extensions/transcript/agent-lifecycle.ts", "agent-lifecycle-wait");
  // The first run's hand-off asks for his introduction, then the app opens his chat (`Onboarding.handOff`).
  const chat = helloChat();
  const life = new lifecycle.AgentLifecycle(chat.tm);
  const waits = [];
  life.pause = (ms) => {
    waits.push(ms);
    return ms === lifecycle.HELLO_OPEN_WAIT_MS ? new Promise(() => {}) : Promise.resolve();
  };
  await life.kickstartAgent("a1", true);
  await tick();
  assert.deepEqual([...chat.shown, ...chat.kept], [], "nothing written before the chat is open");
  assert.deepEqual(chat.typing, [], "nor typing");
  assert.deepEqual(chat.runs, [], "nor his turn");
  // The app opens it: the gateway's `openAgentTail` reaches `kickstartIfPending(id, true)`.
  chat.tm.sessions.activeSession = chat.session;
  assert.equal(await life.kickstartAgent("a1", true, true), true, "the introduction is under way");
  await tick();
  assert.deepEqual(chat.shown.map((entry) => entry.message.content), words.chiefOfStaffHello(null));
  assert.deepEqual(chat.typing, [true, true, true, true, false]);
  assert.equal(chat.runs.length, 1, "then his turn");

  // His chat opened before the introduction began (the open itself started it): no wait.
  const opened = helloChat({ active: true });
  const first = new lifecycle.AgentLifecycle(opened.tm);
  const pauses = [];
  first.pause = async (ms) => { pauses.push(ms); };
  await first.kickstartAgent("a1", true, true);
  await tick();
  assert.ok(!pauses.includes(lifecycle.HELLO_OPEN_WAIT_MS), "no wait for an open chat");
  assert.equal(opened.shown.length, 4);
});

test("a chat opened partway through the hello takes the rest of it", async () => {
  const lifecycle = await loadModule("source/host/extensions/transcript/agent-lifecycle.ts", "agent-lifecycle-midway");
  const chat = helloChat();
  const life = new lifecycle.AgentLifecycle(chat.tm);
  let typed = 0;
  life.pause = async (ms) => {
    if (ms === lifecycle.HELLO_OPEN_WAIT_MS) return;
    // Opened while the second line is being typed (the longest wait over, nobody had).
    if (++typed === 2) chat.tm.sessions.activeSession = chat.session;
  };
  await life.kickstartAgent("a1", true);
  await tick();
  const hello = words.chiefOfStaffHello(null);
  assert.deepEqual(chat.kept.map((entry) => entry.message.content), hello.slice(0, 1), "to its record while closed");
  assert.deepEqual(chat.shown.map((entry) => entry.message.content), hello.slice(1), "through the open chat once open");
});

test("each line of the hello is typed for a while that grows with it", async () => {
  const lifecycle = await loadModule("source/host/extensions/transcript/agent-lifecycle.ts", "agent-lifecycle-typing");
  assert.equal(lifecycle.helloTypingMs("Hi."), 1_200, "a short line, the shortest typing");
  assert.equal(lifecycle.helloTypingMs("x".repeat(100)), 2_300);
  assert.equal(lifecycle.helloTypingMs("x".repeat(400)), 3_200, "a long one, the longest");
  const [hi, here, checkIn, hire] = words.chiefOfStaffHello("Bass").map(lifecycle.helloTypingMs);
  assert.ok(hi < here && here < checkIn && hire < checkIn, "the longest line types longest");
  const total = [hi, here, checkIn, hire].reduce((sum, ms) => sum + ms, 0);
  assert.ok(total > 6_000 && total < 12_000, `about eight seconds in all (${total} ms)`);
});

test("Simeon's hello is the founder's, in the person's language", async () => {
  assert.deepEqual(words.chiefOfStaffHello("Bassirou Fall"), [
    "Hi Bassirou, my name is Simeon, and I'm your Chief of Staff.",
    "I'm here to help you get things done by bringing the right agents onto your team.",
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

test("Simeon's first hire on a new account wears her face, under a woman's name", async () => {
  // The founder (30 October 2026): "i wanna influence the first avatar simeon always create. doesnt matter for what, it's her".
  assert.equal(words.FIRST_HIRE_FACE, "clay-06");
  const faces = JSON.parse(await readFile(path.join(repoRoot, "../ios/SimeonCore/Sources/SimeonCore/Resources/Faces/faces.json"), "utf8")).faces;
  assert.equal(faces.find((face) => face.id === words.FIRST_HIRE_FACE)?.gender, "female", "a woman's face, in the apps' catalogue");
  assert.equal(words.firstHireFace({ hiredByChiefOfStaff: true, teammates: 0, name: "Maya" }), "clay-06");
  assert.equal(words.firstHireFace({ hiredByChiefOfStaff: true, teammates: 0, name: "Xyla" }), "clay-06", "a name of neither list: hers");
  assert.equal(words.firstHireFace({ hiredByChiefOfStaff: true, teammates: 0, name: "Leo" }), null, "named as a man: the usual face, so name, face and voice agree");
  assert.equal(words.firstHireFace({ hiredByChiefOfStaff: true, teammates: 1, name: "Maya" }), null, "an account with a teammate already");
  assert.equal(words.firstHireFace({ hiredByChiefOfStaff: false, teammates: 0, name: "Maya" }), null, "another agent hiring");
  // Who counts: not the one hiring, a group, someone else's room, or the disk saver.
  const roster = [{ id: "simeon", title: "Chief of Staff" }, { id: "g1", isGroup: true }, { id: "room", remoteRoom: { roomId: "r" } }, { id: "saver", purpose: "disk-saver" }];
  assert.equal(words.teammateCount(roster, "simeon"), 0);
  assert.equal(words.teammateCount([...roster, { id: "iris", title: "Inbox" }], "simeon"), 1);
  // He is asked for a woman's name for her, at his first run and on CreateAgent's name.
  assert.match(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /a human first name, a woman's for this first hire \(her face is already chosen for her\)/);
  const tools = await readFile(path.join(repoRoot, "source/host/runner/tools/sand-agent-management-tools.ts"), "utf8");
  assert.match(tools, /The Chief of Staff's first hire on an account with no other teammate yet is a woman: give her a woman's first name\./);
  // The engine gives the face as it makes her, counting the teammates made before, one hire at a time.
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  assert.match(composition, /firstHireFace\(\{\s*hiredByChiefOfStaff: isChiefOfStaffTitle\(agents\.find\(\(agent\) => agent\.id === session\.id\)\?\.title\),\s*teammates: teammateCount\(agents, session\.id\),\s*name: input\.name\s*\}\)/);
  assert.match(composition, /\.\.\.\(face == null \? \{\} : \{ avatarShape: face \}\)/);
  assert.match(composition, /const made = hiring\.then\(async \(\) => \{[\s\S]*?"createBackgroundAgent"[\s\S]*?\}\);\s*hiring = made\.catch\(\(\) => \{\}\);/);
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
  assert.match(staffed, /Tell the user who you hired and where to find them\./, "with no card to show, the agent says it");
  calls.length = 0;
  const plain = await run(tool, { name: "Max", description: "" });
  assert.deepEqual(calls, [["create", { name: "Max", description: "" }, { startIntroduction: true }]]);
  assert.match(plain, /It introduces itself to the user in its own chat now/);

  // "Iris just joined your team" (30 October 2026): after the brief, the card in this chat, then one line on what happens next.
  calls.length = 0;
  const shown = await run(tools.createCreateAgentTool({ ...dependencies, announceJoined: (message) => calls.push(["card", message]) }), { name: "Nora", description: "Runs the inbox: sorts what needs him, drafts the replies, and keeps his calendar in step with what he answers.", title: "Inbox", summary: "Sorts your inbox and drafts your replies.", brief: "Run his inbox." });
  assert.deepEqual(calls.map(([kind]) => kind), ["create", "brief", "card"], "the brief first, then the card");
  assert.deepEqual(calls[2][1], { type: "agent-joined", agentId: "agent-nora", name: "Nora", line: "Sorts your inbox and drafts your replies.", content: "Nora just joined your team. Sorts your inbox and drafts your replies." });
  assert.match(shown, /The user now sees a card in this chat saying Nora just joined their team, with what it does and buttons to its chat and its profile\./);
  // The founder (30 October 2026): "do the one line after the card everywhere".
  assert.match(shown, /After it, send them one short line on what happens next, without repeating the card: that they'll hear from Nora in its own chat, and what it does there first\. Hiring several at once, one line after the last card\./);
  assert.doesNotMatch(shown, /don't announce/);
  assert.doesNotMatch(shown, /Tell the user who you hired/);
  calls.length = 0;
  await run(tools.createCreateAgentTool({ ...dependencies, announceJoined: (message) => calls.push(["card", message]) }), { name: "Max", description: "Keeps the books." });
  assert.deepEqual(calls.map(([kind]) => kind), ["create", "card"], "no brief: the card all the same");
  assert.equal(calls[1][1].line, "Keeps the books.", "no summary: the description, short");
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

test("the joined card's line is never long, and says the same in words for an app without the card", async () => {
  const joined = await loadModule("source/shared/agents/agent-joined.ts", "agent-joined");
  const { joinedLine, agentJoinedMessage, JOINED_LINE_MAX } = joined;
  assert.equal(JOINED_LINE_MAX, 64);
  assert.equal(joinedLine("  Sorts your   inbox and drafts your replies. ", null), "Sorts your inbox and drafts your replies.");
  assert.equal(joinedLine("\u201cSorts your inbox.\u201d", null), "Sorts your inbox.", "quotes taken off");
  assert.equal(joinedLine("", "Keeps the books."), "Keeps the books.", "no summary: the description");
  assert.equal(joinedLine(null, null), "");
  // Too long: its first sentence when that is short enough, else cut at a word, never past the longest.
  assert.equal(joinedLine("Sorts your inbox. Then drafts every reply for you to read, edit and send when you are ready.", null), "Sorts your inbox.");
  const long = joinedLine("Sorts your inbox every morning, drafts the replies, chases the people who owe you an answer and files the rest", null);
  assert.ok(long.length <= JOINED_LINE_MAX, long);
  assert.ok(long.endsWith("…"));
  assert.equal(long, "Sorts your inbox every morning, drafts the replies, chases the…");
  for (const text of ["x".repeat(200), "word ".repeat(40), "Ein sehr langer deutscher Satz über das Postfach und die Antworten, die Iris schreibt."]) {
    assert.ok(joinedLine(text, null).length <= JOINED_LINE_MAX, text);
  }
  assert.deepEqual(agentJoinedMessage({ agentId: "a2", name: "Iris", summary: "Trie ta boîte mail.", language: "fr" }), {
    type: "agent-joined", agentId: "a2", name: "Iris", line: "Trie ta boîte mail.", content: "Iris vient de rejoindre ton équipe. Trie ta boîte mail.",
  });
  assert.equal(agentJoinedMessage({ agentId: "a2", name: "Iris" }).content, "Iris just joined your team", "no line: the title alone");
  // The chat list says it too, and the composition sends it through the runner, so it counts as a message the person saw.
  const projection = await loadModule("source/host/extensions/session/session-projection.ts", "joined-preview");
  assert.equal(projection.lastMessagePreviewText({ type: "agent-joined", agentId: "a2", name: "Iris", line: "Sorts your inbox.", content: "" }), "Iris just joined your team");
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  assert.match(composition, /announceJoined: \(message: AgentJoinedMessage\) => \{[\s\S]*?const runner = builtRunner as \{ emitUpdate\?: [\s\S]*?runner\.emitUpdate\(update\);\n\s*else hooks\.transport\.onUpdate\(update\);/);
  assert.match(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /a summary, what it does for them in one short sentence of 50 characters at most/);
  // At his first run as everywhere else: the card, one line on what happens next, then the next question.
  assert.match(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /After the card, send one short line on what happens next, without repeating it: that they'll hear from the new agent in its own chat, and what it does there first\./);
  assert.match(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /After the first hire and that line, one more question widget: "Anything else you'd hand off today\?"/);
  assert.doesNotMatch(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /don't announce/);
  assert.doesNotMatch(words.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, /Then tell the person, in one or two sentences, who you hired/);
});
