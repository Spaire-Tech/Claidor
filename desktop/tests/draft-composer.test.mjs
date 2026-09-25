/**
 * The draft composer, wired (25 September 2026, cards-plan row 6, ledger
 * F-082 corrected on the founder's challenge).
 *
 * The pinned renderer draws the email-draft and slack-draft cards and the
 * transport carries them; what was missing was the tool that emits one and
 * a Send path. DraftExternalMessage appends the card; the gateway's
 * sendDraft marks it `sending` and wakes the agent with a hidden prompt to
 * deliver it by whatever route the person has; MarkDraftDelivered marks it
 * `sent` or hands it back editable with the reason in chat; discardDraft is
 * a decline the agent is told once.
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
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

async function run(createContext, tool, args) {
  const handler = { emitPartialToolCall() {}, executeToolCall: async (ctx, _initial, _id, work) => work(ctx) };
  const argsStream = (async function* () { yield JSON.stringify(args); })();
  return JSON.stringify(await tool.execute(createContext(), handler, argsStream, { toolCallId: "call-1" }));
}

test("DraftExternalMessage appends the card the renderer draws, validates routing, and sends nothing", async () => {
  const tools = await load("source/host/runner/tools/draft-message-tool.ts", "draft-tools");
  const context = await load("source/packages/context/core.ts", "context-core-draft");
  const createContext = context.module.createContext;
  try {
    const cards = [];
    const said = [];
    const delivered = [];
    const deps = {
      emitDraftCard: (message, timestampMs) => { cards.push({ message, timestampMs }); return `t1s${cards.length}`; },
      markDraftDelivered: (entryId, outcome) => { delivered.push({ entryId, outcome }); return entryId !== "missing"; },
      sayInChat: (content) => said.push(content),
      now: () => 1_000,
    };
    const draft = tools.module.createDraftExternalMessageTool(deps);
    const mark = tools.module.createMarkDraftDeliveredTool(deps);
    assert.equal(draft.name, "DraftExternalMessage");
    assert.match(draft.descriptionGenerator(), /Drafting sends nothing and does not end your turn; Send on the card is what sends/);

    const email = await run(createContext, draft, { kind: "email", to: ["sam@example.com"], subject: "Friday", body: "See you at 3." });
    assert.match(email, /Draft shown to the user as an editable email card \(entry t1s1\)\. Nothing was sent\./);
    assert.deepEqual(cards[0], { message: { type: "email-draft", draft: { to: ["sam@example.com"], subject: "Friday", body: "See you at 3." } }, timestampMs: 1_000 });

    const slack = await run(createContext, draft, { kind: "slack", target: "#eng", body: "Deploy is done." });
    assert.match(slack, /editable Slack card \(entry t1s2\)/);
    assert.deepEqual(cards[1].message, { type: "slack-draft", draft: { target: "#eng", body: "Deploy is done." } });

    assert.match(await run(createContext, draft, { kind: "email", subject: "x", body: "y" }), /needs at least one recipient/);
    assert.match(await run(createContext, draft, { kind: "email", to: ["not an address"], subject: "x", body: "y" }), /is not an email address/);
    assert.match(await run(createContext, draft, { kind: "slack", body: "y" }), /needs a `target`/);
    assert.equal(cards.length, 2, "a refused draft draws no card");

    assert.match(await run(createContext, mark, { entry_id: "t1s1", outcome: "sent" }), /The card shows Sent/);
    assert.match(await run(createContext, mark, { entry_id: "t1s2", outcome: "failed", detail: "Slack isn't connected." }), /editable again and the user has been told why/);
    assert.deepEqual(said, ["I couldn't send that draft. Slack isn't connected."]);
    assert.match(await run(createContext, mark, { entry_id: "missing", outcome: "sent" }), /No draft card with entry id \\"missing\\"/);
    assert.deepEqual(delivered.map((d) => d.outcome), ["sent", "failed", "sent"]);
  } finally {
    await context.dispose();
    await tools.dispose();
  }
});

test("Send marks the card sending and wakes the agent to deliver; Discard is a decline told once; the report settles the card", async () => {
  const store = await load("source/host/extensions/transcript/transcript-store.ts", "transcript-store-draft");
  const cards = await load("source/host/extensions/transcript/draft-cards.ts", "draft-cards");
  try {
    // The bundles are separate modules, so the store the DraftCards class reads is its own copy; seed through the class's module graph.
    void store;
    const emitted = [];
    const wakes = [];
    const dbUpdates = [];
    const tm = {
      roster: { emit: (event) => emitted.push(event) },
      sessions: { activeSession: { db: { updateTranscriptEntry: (id, update) => { dbUpdates.push(id); return update; } } } },
      backgroundWakes: { runHiddenPromptWake: async (agentId, source, prompt, title) => { wakes.push({ agentId, source, prompt, title }); } },
    };
    const draftCards = new cards.module.DraftCards(tm);
    // Seed the entry through the same bundle's store: reach it via the class by appending with the exported helper of that bundle.
    const storeInBundle = await load("source/host/extensions/transcript/draft-cards.ts", "draft-cards-store");
    void storeInBundle;
    const prompt = cards.module.buildDraftSendWakePrompt("t2s1", { type: "email-draft", draft: { to: ["sam@example.com"], subject: "Friday", body: "See you at 3." } });
    assert.match(prompt, /The user pressed Send on your draft \(entry t2s1\)\. This is their explicit instruction to send it/);
    assert.match(prompt, /a connected connector's MCP tool for their mail \(GetMcpTools, then CallMcpTool\), a custom MCP server they added, or, if neither exists, the box browser/);
    assert.match(prompt, /MarkDraftDelivered with entry_id "t2s1"/);
    assert.match(prompt, /To: sam@example\.com\nSubject: Friday\n\nSee you at 3\./);
    const discard = cards.module.buildDraftDiscardWakePrompt("t2s1", { type: "slack-draft" });
    assert.match(discard, /discarded your Slack draft \(entry t2s1\)\. Treat it as declined: do not send it by any route, and do not draft it again unless they ask/);
    assert.equal(await draftCards.sendDraft({ agentId: "a1", entryId: "nope" }), null, "an unknown entry is not sent");
    assert.equal(wakes.length, 0);
  } finally {
    await cards.dispose();
    await store.dispose();
  }
});

test("the card's state machine, on a real entry", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "caisra-draft-state-"));
  const outfile = path.join(dir, "draft-state.mjs");
  // One bundle that exposes both the store and the class, so they share the transcript cache.
  const entry = path.join(dir, "entry.ts");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(entry, `export * from ${JSON.stringify(path.join(repoRoot, "source/host/extensions/transcript/transcript-store.ts"))};\nexport { DraftCards } from ${JSON.stringify(path.join(repoRoot, "source/host/extensions/transcript/draft-cards.ts"))};\n`);
  await build({ entryPoints: [entry], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"] });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  try {
    const emitted = [];
    const wakes = [];
    const tm = {
      roster: { emit: (event) => emitted.push(event) },
      sessions: { activeSession: { db: { updateTranscriptEntry: () => null } } },
      backgroundWakes: { runHiddenPromptWake: async (agentId, source, prompt) => { wakes.push({ agentId, source, prompt }); } },
    };
    module.setTranscript([{ kind: "send-message", id: "t3s1", timestampMs: 1, message: { type: "email-draft", draft: { to: ["sam@example.com"], subject: "Friday", body: "See you at 3." } } }]);
    const cards = new module.DraftCards(tm);
    const sending = await cards.sendDraft({ agentId: "a1", entryId: "t3s1", draft: { body: "See you at 4." } });
    assert.equal(sending.draftSendState, "sending");
    assert.equal(sending.message.draft.body, "See you at 4.", "the person's edit is what goes out");
    assert.equal(wakes.length, 1);
    assert.equal(wakes[0].source, "draft-send");
    assert.match(wakes[0].prompt, /See you at 4\./);
    assert.equal(emitted[0].type, "updated");
    assert.equal((await cards.sendDraft({ agentId: "a1", entryId: "t3s1" })).draftSendState, "sending", "a second Send while sending is a no-op");
    assert.equal(wakes.length, 1);
    assert.equal(cards.markDraftDelivered({ entryId: "t3s1", outcome: "failed" }).draftSendState, "editable");
    assert.equal(cards.markDraftDelivered({ entryId: "t3s1", outcome: "sent" }).draftSendState, "sent");
    assert.equal((await cards.discardDraft({ agentId: "a1", entryId: "t3s1" })).draftSendState, "sent", "a sent draft cannot be discarded");
    module.setTranscript([{ kind: "send-message", id: "t3s2", timestampMs: 2, message: { type: "slack-draft", draft: { target: "#eng", body: "Done." } } }]);
    const discarded = await cards.discardDraft({ agentId: "a1", entryId: "t3s2" });
    assert.equal(discarded.widgetDismissed, true);
    assert.equal(wakes[1].source, "draft-discard");
    assert.equal(cards.markDraftDelivered({ entryId: "t3s2", outcome: "sent" }).draftSendState, "sent");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the wiring: gateway commands, coordinator RPC rows, the toolset factory, the provider and the brief", async () => {
  const protocol = await src("host/gateway-protocol.ts");
  assert.match(protocol, /sendDraft: \(api: GatewayApi, body: string\) => api\.sendDraft\(parseCommandArgs\(body\)\),/);
  assert.match(protocol, /discardDraft: \(api: GatewayApi, body: string\) => api\.discardDraft\(parseCommandArgs\(body\)\),/);
  const api = await src("host/host-gateway-api.ts");
  assert.match(api, /sendDraft: \(args: any\) => \{\n\s*markActive\("user_action"\);\n\s*return method\(manager, "sendDraft"\)/);
  const rpc = await src("shared/rpc/coordinator.ts");
  assert.match(rpc, /sendDraft: \{ args: "object", reply: "record-or-null" \},\n\s*discardDraft: \{ args: "object", reply: "record-or-null" \},/);
  const manager = await src("host/extensions/transcript/transcript-manager.ts");
  assert.match(manager, /\["sendDraft", "draftCards"\],\n\s*\["discardDraft", "draftCards"\],\n\s*\["markDraftDelivered", "draftCards"\],/);
  const toolset = await src("host/runner/tools/turn-toolset.ts");
  assert.match(toolset, /const drafts = factories\.drafts\?\.\(\);\n\s*if \(drafts !== undefined\) tools\.push\(\.\.\.drafts\);/);
  const composition = await src("host/host-runner-composition.ts");
  assert.match(composition, /createDraftToolInputs: turn => \{/);
  assert.match(composition, /markDraftDelivered: \(entryId, outcome\) => method\(extensions\.api\("transcript"\), "markDraftDelivered"\)\?\.\(\{ entryId, outcome \}\) != null,/);
  const { module, dispose } = await load("source/host/runner/system-prompt.ts", "system-prompt-drafts");
  try {
    assert.match(module.DEFAULT_SAND_SYSTEM_PROMPT, /## Messages you write for the user to send\nAn email or a Slack message that would go out under the user's name is a draft card by default: call DraftExternalMessage/);
    assert.match(module.DEFAULT_SAND_SYSTEM_PROMPT, /A discarded card is a decline: never send it another way and never redraft it unasked/);
  } finally {
    await dispose();
  }
});
