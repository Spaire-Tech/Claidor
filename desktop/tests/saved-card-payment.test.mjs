/**
 * Paying with a card the person saved in the Credentials Store (9 November
 * 2026): a third wallet beside Link and Shop
 * (source/shared/node/credentials-store/card-wallet.ts). The checkout card
 * offers the saved cards (never an expired one), Allow confirmed on the
 * person's device is the approval, and PayWithSavedCard has the host type
 * the card into the checkout on its own site; the agent never sees the
 * number. The store and the page fill are faked here; the fill itself runs
 * against a real Chromium in link-wallet.test.mjs.
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
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron", "playwright", "playwright-core"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

async function run(tool, args) {
  const context = await load("source/packages/context/core.ts", `context-${Math.random().toString(36).slice(2)}`);
  try {
    const handler = { emitPartialToolCall() {}, executeToolCall: async (ctx, _initial, _id, work) => work(ctx) };
    const argsStream = (async function* () { yield JSON.stringify(args); })();
    const result = JSON.parse(JSON.stringify(await tool.execute(context.module.createContext(), handler, argsStream, { toolCallId: "call-1" })));
    return typeof result?.success?.currentStep === "string" ? result.success.currentStep : JSON.stringify(result);
  } finally {
    await context.dispose();
  }
}

const TRAVEL = "3e31af4d-8041-4e9d-8c76-4d5e6f708192";
const OLD = "4f42b05e-9152-4fae-9d87-5e6f708192a3";
const HOME = "1c1f8d2b-6e2f-4c7b-8a54-2b3c4d5e6f70";
const NUMBER = "4242424242424242";

/** The server as this computer reads it: cards listed by their last four; one read whole with its number. */
function fakeStoreApi() {
  const calls = [];
  const rows = {
    [TRAVEL]: { id: TRAVEL, kind: "card", name: "Travel", cardholder: "Ada Lovelace", brand: "visa", last4: "4242", expiry: "08/28", hasSecurityCode: true, billingId: HOME, hints: "", number: NUMBER, securityCode: "123" },
    [OLD]: { id: OLD, kind: "card", name: "", cardholder: "", brand: "mastercard", last4: "4444", expiry: "01/20", hasSecurityCode: true, billingId: "", hints: "", number: "5555555555554444", securityCode: "321" },
    [HOME]: { id: HOME, kind: "contact", name: "Home", hints: "", fullName: "Ada Lovelace", email: "ada@example.com", phone: "", addressLine1: "12 St James's Square", addressLine2: "", city: "London", region: "", postalCode: "SW1Y 4LB", country: "GB" },
  };
  const api = async (pathName) => {
    calls.push(pathName);
    if (pathName === "credentials") return { entries: Object.values(rows).map(({ number: _n, securityCode: _c, ...rest }) => rest) };
    const row = rows[pathName.split("/")[1]];
    if (row == null) throw new Error("That entry isn't in your Credentials Store anymore.");
    return { entry: row };
  };
  return { api, calls };
}

const ARGS = {
  merchant_name: "NCVSS",
  checkout_url: "https://ncvss.com/checkout/abc",
  items: [{ name: "Linen shirt, white", quantity: 1, unit_amount: 7200 }],
  total: 8000,
};

function fakeManager(cardMessage) {
  const entries = [{ kind: "send-message", id: "t3s1", timestampMs: 42, message: structuredClone(cardMessage) }];
  const db = { entries, getTranscriptEntries: () => entries, updateTranscriptEntry: (id, update) => { const index = entries.findIndex((item) => item.id === id); if (index >= 0) entries[index] = update(entries[index]); } };
  const wakes = [];
  const tm = {
    sessions: { activeSession: { id: "a1", db }, liveSessions: new Map(), inMemoryTranscriptAgentId: "a1", isAgentGone: () => false },
    sessionStore: { readAgentTranscriptEntries: () => [], withAgentDb: async () => null },
    roster: { emit: () => undefined, emitAgentUpdate: async () => undefined },
    backgroundWakes: { runHiddenPromptWake: async (agentId, source, prompt) => { wakes.push({ agentId, source, prompt }); } },
  };
  return { tm, entries, wakes };
}

test("the saved cards pay: never an expired one, Allow confirmed is the approval, and the card is typed only on the checkout's site", async () => {
  const wallet = await load("source/shared/node/credentials-store/card-wallet.ts", "card-wallet");
  const store = await load("source/shared/node/credentials-store/credentials-store.ts", "credentials-store-pay");
  const tool = await load("source/host/runner/tools/purchase-tool.ts", "purchase-tool-card");
  const cards = await load("source/host/extensions/transcript/purchase-cards.ts", "purchase-cards-card");
  try {
    const server = fakeStoreApi();
    const fills = [];
    const lines = [];
    const cardWallet = wallet.module.createStoredCardWallet({
      store: store.module.createCredentialsStore(server.api),
      fill: async (request) => { fills.push(request); return { ok: true, page: "ncvss.com", filled: ["card number", "expiry", "security code", "name on card", "billing ZIP"], missing: [] }; },
      ports: () => [9224, 9223],
      now: () => new Date("2026-11-09T12:00:00Z"),
      log: (line) => lines.push(line),
    });

    // The cards an agent may pay with: the expired one is left out.
    const facts = await cardWallet.checkoutFacts({ amount: 8000, currency: "usd" });
    assert.equal(facts.ok, true);
    assert.equal(facts.paymentMethodId, TRAVEL);
    assert.deepEqual(facts.card, { brand: "visa", last4: "4242", name: "Travel" });
    assert.deepEqual(facts.cards.map((one) => one.id), [TRAVEL]);
    assert.equal(await cardWallet.hasCards(), true);
    assert.match((await cardWallet.checkoutFacts({ amount: 8000, currency: "usd", paymentMethodId: OLD })).message, /isn't in the user's Credentials Store/);

    // RequestPurchase with the saved card: the card names it; test mode is refused.
    let message;
    const deps = { checkoutFacts: async () => ({ ...(await cardWallet.checkoutFacts({ amount: 8000, currency: "usd" })), wallet: "card" }), capturePreview: async () => undefined, emitCard: (posted) => { message = posted; return "t3s1"; }, markPurchaseDone: async () => ({ ok: true }) };
    assert.match(await run(tool.module.createRequestPurchaseTool(deps), { ...ARGS, test: true }), /A saved card has no test mode/);
    const shown = await run(tool.module.createRequestPurchaseTool(deps), ARGS);
    assert.match(shown, /^The checkout card for \$80\.00 at ncvss\.com with their saved visa ending 4242 is in the chat/);
    assert.match(shown, /you pay with PayWithSavedCard and place the order/);
    assert.equal(message.purchase.wallet, "card");
    assert.equal(message.purchase.link.paymentMethodId, TRAVEL);
    assert.doesNotMatch(JSON.stringify(message), new RegExp(NUMBER), "never the number on the card");

    // Allow without the person's OK on their device approves nothing.
    const { tm, entries, wakes } = fakeManager(message);
    const purchases = new cards.module.PurchaseCards(tm, { retryDelayMs: 0, log: () => undefined });
    purchases.setStoredCardWallet(cardWallet);
    await purchases.answerPurchase({ agentId: "a1", entryId: "t3s1", allow: true }, undefined);
    assert.equal(entries[0].purchaseState, "failed");
    assert.match(entries[0].purchaseNote, /Allow needs your OK on your device/);

    // With it: approved at once, and the agent is woken to pay with the saved card.
    entries[0] = { kind: "send-message", id: "t3s1", timestampMs: 42, message: structuredClone(message) };
    wakes.length = 0;
    assert.match((await purchases.payWithSavedCard({ agentId: "a1", entryId: "t3s1" })).message, /hasn't allowed this checkout card yet/);
    await purchases.answerPurchase({ agentId: "a1", entryId: "t3s1", allow: true, approval: { approvedAt: Math.round(Date.now() / 1000), userId: "u1", authenticationMethod: "biometric_fingerprint" } }, undefined);
    assert.equal(entries[0].purchaseState, "approved");
    assert.equal(wakes.length, 1);
    assert.match(wakes[0].prompt, /the card they saved in their Credentials Store pays/);
    assert.match(wakes[0].prompt, /Call PayWithSavedCard with entry_id "t3s1"\. It types the saved card into the checkout on ncvss\.com, and nowhere else/);
    assert.doesNotMatch(wakes[0].prompt, /pay_checkout/);

    // PayWithSavedCard: the card read whole by the host, typed on the checkout's own site, and only which fields went in comes back.
    const paid = await run(tool.module.createPayWithSavedCardTool({ ...deps, payWithSavedCard: (entryId) => purchases.payWithSavedCard({ agentId: "a1", entryId }) }), { entry_id: "t3s1" });
    assert.match(paid, /The saved card is filled in on ncvss\.com \(card number, expiry, security code, name on card, billing ZIP\)/);
    assert.equal(fills.length, 1);
    assert.equal(fills[0].pageHint, "ncvss.com");
    assert.equal(fills[0].strictSite, true, "never another site's tab");
    assert.deepEqual(fills[0].ports, [9224, 9223], "the agent's own Chrome first");
    assert.deepEqual(fills[0].card, { number: NUMBER, cvc: "123", expMonth: 8, expYear: 2028, billing: { name: "Ada Lovelace", line1: "12 St James's Square", line2: "", city: "London", state: "", postalCode: "SW1Y 4LB", country: "GB" } });
    assert.doesNotMatch(paid, new RegExp(NUMBER));
    assert.doesNotMatch(JSON.stringify({ wakes, lines }), new RegExp(`${NUMBER}|"123"`), "no card number or code in a wake or the log");

    // MarkPurchaseDone closes it as with Link.
    const done = await purchases.markPurchaseDone({ agentId: "a1", entryId: "t3s1", outcome: "ordered", order: "1042" }, undefined);
    assert.equal(done.ok, true);
    assert.equal(entries[0].purchaseState, "ordered");
  } finally {
    await wallet.dispose();
    await store.dispose();
    await tool.dispose();
    await cards.dispose();
  }
});

test("the saved card comes first, in the host, the turn and the brief", async () => {
  const composition = await src("host/host-runner-composition.ts");
  assert.match(composition, /method\(extensions\.api\("transcript"\), "setStoredCardWallet"\)\?\.\(storedCardWallet\);/);
  assert.match(composition, /if \(asked == null && await storedCardWallet\.hasCards\(\)\.catch\(\(\) => false\)\) return await saved\(\);/);
  assert.match(composition, /payWithSavedCard: async \(entryId\) =>/);
  assert.match(await src("host/extensions/transcript/transcript-manager.ts"), /\["payWithSavedCard", "purchaseCards"\]/);
  assert.match(await src("host/runner/tools/turn-toolset.ts"), /asTurnTool\(createPayWithSavedCardTool\(input\.dependencies\)\)/);
  const brief = await src("host/runner/system-prompt.ts");
  assert.match(brief, /paid with a card the user saved in their Credentials Store when they have one/);
  assert.match(brief, /With a saved card, Allow is the approval: once woken, check the checkout, call PayWithSavedCard/);
});
