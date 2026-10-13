/**
 * The checkout card (13 October 2026): one card for each purchase, before
 * any money is asked for (source/shared/node/link-wallet/purchase-card.ts).
 * RequestPurchase checks the person's Link and posts the card; the apps'
 * Allow and Deny come back through the gateway (answerPurchase); Allow asks
 * Link, the host watches Link while the person approves in the Link app,
 * and the agent is woken once, with what to do next. Link is faked here.
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
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

async function run(tool, args) {
  const context = await load("source/packages/context/core.ts", `context-${Math.random().toString(36).slice(2)}`);
  try {
    const handler = { emitPartialToolCall() {}, executeToolCall: async (ctx, _initial, _id, work) => work(ctx) };
    const argsStream = (async function* () { yield JSON.stringify(args); })();
    return JSON.stringify(await tool.execute(context.module.createContext(), handler, argsStream, { toolCallId: "call-1" }));
  } finally {
    await context.dispose();
  }
}

const until = async (check, what) => {
  for (let i = 0; i < 200; i += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`timed out waiting for ${what}`);
};

const ARGS = {
  merchant_name: "NCVSS",
  checkout_url: "https://ncvss.com/checkout/abc",
  items: [{ name: "Linen shirt, white", quantity: 1, unit_amount: 7200, description: "Size M" }],
  total: 8000,
  totals: [{ type: "subtotal", label: "Subtotal", amount: 7200 }, { type: "shipping", label: "Shipping", amount: 800 }],
};

test("the card's words: money, the site, Link's context, one key per card, Link's states, the wakes", async () => {
  const { module, dispose } = await load("source/shared/node/link-wallet/purchase-card.ts", "purchase-card");
  try {
    const card = module;
    assert.equal(card.formatPurchaseMoney(8000, "usd"), "$80.00");
    assert.equal(card.formatPurchaseMoney(500, "jpy"), "¥500");
    assert.equal(card.formatPurchaseMoney(1999, "eur"), "€19.99");
    assert.equal(card.purchaseDomain("https://www.ncvss.com/checkout?x=1"), "ncvss.com");
    assert.equal(card.purchaseDomain(""), "");
    const context = card.purchaseLinkContext("Shirt", { merchant: "NCVSS", domain: "ncvss.com", total: "$80.00", items: [{ name: "Linen shirt", quantity: 2 }] });
    assert.ok(context.length >= 100, "Link refuses under 100 characters");
    assert.match(context, /Linen shirt ×2 from NCVSS \(ncvss\.com\) for \$80\.00/);
    const key = card.purchaseIdempotencyKey("a1", "t3s2", 42);
    assert.equal(key, card.purchaseIdempotencyKey("a1", "t3s2", 42), "the same card asks Link once");
    assert.notEqual(key, card.purchaseIdempotencyKey("a2", "t3s2", 42));
    assert.ok(new TextEncoder().encode(key).length <= 255);
    assert.equal(card.purchaseStateForLinkStatus("pending_approval"), "approving");
    assert.equal(card.purchaseStateForLinkStatus("approved"), "approved");
    assert.equal(card.purchaseStateForLinkStatus("denied"), "denied");
    assert.equal(card.purchaseStateForLinkStatus("expired"), "expired");
    assert.equal(card.purchaseStateForLinkStatus("mystery"), undefined);
    const data = { merchant: "NCVSS", domain: "ncvss.com", url: "https://ncvss.com/checkout/abc", total: "$80.00", test: false };
    const approved = card.buildPurchaseApprovedWakePrompt("t3s2", data, "lsrq_9");
    for (const words of ["pay_checkout", "lsrq_9", "Place order", "MarkPurchaseDone", "t3s2", "never press Pay again", "https://ncvss.com/checkout/abc"]) assert.ok(approved.includes(words), words);
    assert.match(card.buildPurchaseDeniedWakePrompt("t3s2", data), /pressed Deny.*Link was never asked/s);
    assert.match(card.buildPurchaseClosedWakePrompt("t3s2", data, "expired"), /expired\. Nothing was paid/);
  } finally {
    await dispose();
  }
});

test("RequestPurchase checks Link first, posts the card with the paying card and the picture, and ends the turn; MarkPurchaseDone closes it", async () => {
  const { module, dispose } = await load("source/host/runner/tools/purchase-tool.ts", "purchase-tool");
  try {
    const cards = [];
    const asked = [];
    const marks = [];
    let facts = { ok: true, paymentMethodId: "csmrpd_visa", card: { brand: "Visa", last4: "1234" } };
    const deps = {
      checkoutFacts: (request) => { asked.push(request); return facts == null ? undefined : Promise.resolve(facts); },
      capturePreview: async (url) => url.includes("ncvss.com") ? { url: "file:///data/agents/a1/assets/abc.jpg", width: 1280, height: 800 } : undefined,
      emitCard: (message, at) => { cards.push({ message, at }); return `t3s${cards.length}`; },
      markPurchaseDone: async (args) => { marks.push(args); return args.entryId === "missing" ? { ok: false, message: "No checkout card with entry id \"missing\" in this chat." } : { ok: true }; },
      now: () => 7,
    };
    const request = module.createRequestPurchaseTool(deps);
    const done = module.createMarkPurchaseDoneTool(deps);
    assert.equal(request.name, "RequestPurchase");
    assert.match(request.descriptionGenerator(), /only way to pay for anything/);

    const shown = await run(request, ARGS);
    assert.match(shown, /The checkout card for \$80\.00 at ncvss\.com with Visa ending 1234 is in the chat \(entry t3s1\)/);
    assert.match(shown, /Link has not been asked yet/);
    assert.deepEqual(asked[0], { amount: 8000, currency: "usd" });
    const { message } = cards[0];
    assert.equal(message.type, "purchase");
    assert.equal(message.content, "Checkout at ncvss.com · $80.00", "what an older app shows");
    assert.deepEqual(message.purchase.card, { brand: "Visa", last4: "1234" });
    assert.deepEqual(message.purchase.preview, { url: "file:///data/agents/a1/assets/abc.jpg", width: 1280, height: 800 });
    assert.equal(message.purchase.domain, "ncvss.com");
    assert.equal(message.purchase.total, "$80.00");
    assert.deepEqual(message.purchase.items, [{ name: "Linen shirt, white", quantity: 1, unitAmount: 7200, description: "Size M" }]);
    assert.equal(message.purchase.link.paymentMethodId, "csmrpd_visa");
    assert.ok(message.purchase.link.context.length >= 100);
    assert.doesNotMatch(JSON.stringify(message), /4242|"number"|cvc/, "never a card number");

    // Link says no first: the agent hears why and no card is drawn.
    facts = { ok: false, message: "$80.00 is more than the $50.00 the person's Link limits leave today." };
    assert.match(await run(request, ARGS), /leave today/);
    facts = undefined;
    assert.match(await run(request, ARGS), /Link runs on the cloud computer/);
    facts = { ok: true, paymentMethodId: "csmrpd_visa", card: { brand: "Visa", last4: "1234" } };
    assert.match(await run(request, { ...ARGS, checkout_url: "http://ncvss.com/checkout" }), /https address/);
    assert.match(await run(request, { ...ARGS, credential_type: "link_pay_token" }), /needs merchant_account_id/);
    assert.equal(cards.length, 1, "a refused purchase draws no card");

    assert.match(await run(done, { entry_id: "t3s1", outcome: "ordered", order_number: "#1042" }), /The card shows the order/);
    assert.deepEqual(marks[0], { entryId: "t3s1", outcome: "ordered", order: "#1042" });
    assert.match(await run(done, { entry_id: "missing", outcome: "failed" }), /No checkout card/);
  } finally {
    await dispose();
  }
});

/** A transcript manager with one open agent (a1) and one closed (a2), each with a checkout card. */
function fakeManager(cardMessage) {
  const entry = (id) => ({ kind: "send-message", id, timestampMs: 42, message: structuredClone(cardMessage) });
  const db = (entries) => ({
    entries,
    getTranscriptEntries: () => entries,
    updateTranscriptEntry: (id, update) => { const index = entries.findIndex((item) => item.id === id); if (index >= 0) entries[index] = update(entries[index]); },
  });
  const open = db([entry("t3s1")]);
  const closed = db([entry("t9s1")]);
  const emitted = [];
  const wakes = [];
  const tm = {
    sessions: { activeSession: { id: "a1", db: open }, liveSessions: new Map(), inMemoryTranscriptAgentId: "a1", isAgentGone: () => false },
    sessionStore: {
      readAgentTranscriptEntries: (agentId) => agentId === "a2" ? closed.entries : [],
      withAgentDb: async (agentId, fn) => fn(agentId === "a2" ? closed : db([]), "/tmp/a2.db"),
    },
    roster: { emit: (event, agentId) => emitted.push({ ...event, agentId }), emitAgentUpdate: async () => undefined },
    backgroundWakes: { runHiddenPromptWake: async (agentId, source, prompt) => { wakes.push({ agentId, source, prompt }); } },
  };
  return { tm, open, closed, emitted, wakes };
}

/** Link, scripted: what create answers, then what each look answers in turn. */
function fakeWallet(created, looks = []) {
  const calls = [];
  return {
    calls,
    requestSpend: async (request) => { calls.push(["create", request]); return created; },
    spendStatus: async (id, seconds) => { calls.push(["look", id, seconds]); return looks.shift() ?? { ok: false, code: "POLLING_TIMEOUT", message: "still waiting" }; },
    cancelSpend: async (id) => { calls.push(["cancel", id]); return true; },
    reportOutcome: async (args) => { calls.push(["report", args]); },
  };
}

test("Allow asks Link once, shows Link's approval link, watches Link, and wakes the agent to pay; then the card shows the order", async () => {
  const tool = await load("source/host/runner/tools/purchase-tool.ts", "purchase-tool-2");
  const cards = await load("source/host/extensions/transcript/purchase-cards.ts", "purchase-cards");
  try {
    let message;
    await run(tool.module.createRequestPurchaseTool({ checkoutFacts: () => Promise.resolve({ ok: true, paymentMethodId: "csmrpd_visa", card: { brand: "Visa", last4: "1234" } }), capturePreview: async () => undefined, emitCard: (posted) => { message = posted; return "t3s1"; }, markPurchaseDone: async () => ({ ok: true }) }), { ...ARGS, test: true });
    const { tm, open, emitted, wakes } = fakeManager(message);
    const purchases = new cards.module.PurchaseCards(tm, { retryDelayMs: 0, log: () => undefined });
    const wallet = fakeWallet(
      { ok: true, id: "lsrq_1", status: "pending_approval", approvalUrl: "https://app.link.com/activity/approve/lsrq_1" },
      [{ ok: false, code: "POLLING_TIMEOUT", message: "still pending" }, { ok: true, id: "lsrq_1", status: "approved" }],
    );

    // An app asking for a watch on a card that waits on the person never answers it.
    await purchases.answerPurchase({ agentId: "a1", entryId: "t3s1", resume: true }, wallet);
    assert.equal(open.entries[0].purchaseState, undefined);
    assert.equal(wallet.calls.length, 0);

    // Allow, pressed twice (two devices): Link is asked once.
    const [first, second] = await Promise.all([
      purchases.answerPurchase({ agentId: "a1", entryId: "t3s1", allow: true }, wallet),
      purchases.answerPurchase({ agentId: "a1", entryId: "t3s1", allow: true }, wallet),
    ]);
    assert.ok(first != null && second != null);
    assert.equal(wallet.calls.filter(([kind]) => kind === "create").length, 1);
    const [, sent] = wallet.calls.find(([kind]) => kind === "create");
    assert.equal(sent.amount, 8000);
    assert.equal(sent.merchantName, "NCVSS");
    assert.equal(sent.merchantUrl, "https://ncvss.com/checkout/abc");
    assert.equal(sent.paymentMethodId, "csmrpd_visa");
    assert.equal(sent.test, true);
    assert.match(sent.idempotencyKey, /^simeon-[0-9a-f]{40}$/);
    assert.ok(emitted.some((event) => event.entry.purchaseState === "approving" && event.entry.purchaseActionUrl === "https://app.link.com/activity/approve/lsrq_1" && event.agentId === "a1"), "the card shows Link's approval link");

    // Link approves after a look that timed out: the agent is woken once, to pay.
    await until(() => open.entries[0].purchaseState === "approved", "Link's approval");
    await until(() => wakes.length === 1, "the wake");
    assert.equal(wakes[0].source, "purchase-approved");
    assert.match(wakes[0].prompt, /lsrq_1/);
    assert.match(wakes[0].prompt, /pay_checkout/);
    assert.equal(open.entries[0].purchaseSpendRequestId, "lsrq_1");
    assert.equal(wallet.calls.filter(([kind]) => kind === "look").length, 2);

    // A late Allow changes nothing.
    await purchases.answerPurchase({ agentId: "a1", entryId: "t3s1", allow: true }, wallet);
    assert.equal(wallet.calls.filter(([kind]) => kind === "create").length, 1);

    // The agent paid: the card shows the order and Link hears it went through.
    const done = await purchases.markPurchaseDone({ agentId: "a1", entryId: "t3s1", outcome: "ordered", order: "#1042", detail: "Arrives Oct 18" }, wallet);
    assert.equal(done.ok, true);
    assert.equal(open.entries[0].purchaseState, "ordered");
    assert.equal(open.entries[0].purchaseOrder, "#1042");
    await until(() => wallet.calls.some(([kind]) => kind === "report"), "Link's report");
    assert.deepEqual(wallet.calls.find(([kind]) => kind === "report")[1], { domain: "ncvss.com", spendRequestId: "lsrq_1", outcome: "success", context: "Arrives Oct 18" });
    assert.equal(wakes.length, 1, "no second wake");
  } finally {
    await cards.dispose();
    await tool.dispose();
  }
});

test("Deny asks Link nothing; a decline in Link closes the card; a closed chat's card is updated in its own transcript", async () => {
  const tool = await load("source/host/runner/tools/purchase-tool.ts", "purchase-tool-3");
  const cards = await load("source/host/extensions/transcript/purchase-cards.ts", "purchase-cards-2");
  try {
    let message;
    await run(tool.module.createRequestPurchaseTool({ checkoutFacts: () => Promise.resolve({ ok: true, paymentMethodId: "csmrpd_visa", card: { brand: "Visa", last4: "1234" } }), capturePreview: async () => undefined, emitCard: (posted) => { message = posted; return "t3s1"; }, markPurchaseDone: async () => ({ ok: true }) }), ARGS);

    // Deny.
    {
      const { tm, open, wakes } = fakeManager(message);
      const purchases = new cards.module.PurchaseCards(tm, { retryDelayMs: 0, log: () => undefined });
      const wallet = fakeWallet({ ok: true, id: "lsrq_x", status: "pending_approval" });
      await purchases.answerPurchase({ agentId: "a1", entryId: "t3s1", allow: false }, wallet);
      assert.equal(open.entries[0].purchaseState, "denied");
      assert.equal(wallet.calls.length, 0, "Link was never asked");
      await until(() => wakes.length === 1, "the wake");
      assert.equal(wakes[0].source, "purchase-denied");
      const early = await purchases.markPurchaseDone({ agentId: "a1", entryId: "t3s1", outcome: "ordered" }, wallet);
      assert.equal(early.ok, true, "a closed card stays closed");
      assert.equal(open.entries[0].purchaseState, "denied");
    }

    // Declined in the Link app, in a chat that isn't open.
    {
      const { tm, closed, emitted, wakes } = fakeManager(message);
      const purchases = new cards.module.PurchaseCards(tm, { retryDelayMs: 0, log: () => undefined });
      const wallet = fakeWallet({ ok: true, id: "lsrq_2", status: "pending_approval" }, [{ ok: true, id: "lsrq_2", status: "denied" }]);
      await purchases.answerPurchase({ agentId: "a2", entryId: "t9s1", allow: true }, wallet);
      await until(() => closed.entries[0].purchaseState === "denied", "the decline");
      await until(() => wakes.length === 1, "the wake");
      assert.equal(wakes[0].agentId, "a2");
      assert.equal(wakes[0].source, "purchase-denied");
      assert.match(wakes[0].prompt, /declined in Link\. Nothing was paid/);
      assert.ok(emitted.every((event) => event.agentId === "a2"), "the apps hear it for that agent");
    }

    // Link refuses to make the card: the card says so in Link's words and the agent is told.
    {
      const { tm, open, wakes } = fakeManager(message);
      const purchases = new cards.module.PurchaseCards(tm, { retryDelayMs: 0, log: () => undefined });
      await purchases.answerPurchase({ agentId: "a1", entryId: "t3s1", allow: true }, fakeWallet({ ok: false, code: "SPEND_LIMIT", message: "Amount exceeds your daily limit." }));
      assert.equal(open.entries[0].purchaseState, "failed");
      assert.equal(open.entries[0].purchaseNote, "Amount exceeds your daily limit.");
      await until(() => wakes.length === 1, "the wake");
      assert.match(wakes[0].prompt, /could not be set up with Link: Amount exceeds your daily limit/);
    }
  } finally {
    await cards.dispose();
    await tool.dispose();
  }
});

test("the card is wired: the gateway takes answerPurchase, the turn ends on the card, it is never threaded, the prompt teaches the path", async () => {
  const gateway = await src("host/gateway-protocol.ts");
  assert.match(gateway, /answerPurchase: \(api: GatewayApi, body: string\) => api\.answerPurchase\(parseCommandArgs\(body\)\)/);
  assert.match(await src("shared/rpc/coordinator.ts"), /answerPurchase: \{ args: "object", reply: "record-or-null" \}/);
  assert.match(await src("host/host-gateway-api.ts"), /method\(manager, "answerPurchase"\)\([\s\S]*linkWallet/);
  assert.match(await src("host/extensions/transcript/transcript-manager.ts"), /\["answerPurchase", "purchaseCards"\]/);
  assert.match(await src("host/runner/sand-agent-runner.ts"), /update\.message\.type === "purchase"/);
  assert.equal((await src("host/extensions/transcript/send-message-shaping.ts")).match(/"purchase",/g)?.length, 2);
  const prompt = await src("host/runner/system-prompt.ts");
  for (const words of ["You can buy things for the user", "RequestPurchase", "get_wallet", "pay_checkout", "MarkPurchaseDone", "never for card details"]) assert.ok(prompt.includes(words), words);
  assert.match(await src("host/runner/prompt-collector-glue.ts"), /press Place order \(or Pay\) once/);
});
