/**
 * Booking a flight (13 October 2026; source/shared/node/flight-booking/).
 * "Book with Simeon" (or the agent's BookFlight) posts the traveller form;
 * Continue keeps the details on the computer and posts the flight's
 * checkout card; once Link approves, Simeon fills Duffel's card form, the
 * bank checks the card, the order is placed and the card shows the booking
 * reference. The server, Link and the browser are faked here.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  for (let i = 0; i < 400; i += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`timed out waiting for ${what}`);
};

const OFFER_ID = "off_0000AxyzTestOffer01";
const OFFER = {
  offerId: OFFER_ID,
  amount: "361.20",
  currency: "USD",
  amountMinor: 36120,
  total: "$361.20",
  expiresAt: "2026-11-12T10:00:00Z",
  documentsRequired: false,
  passengers: [{ id: "pas_0000AxyzTestPass01", type: "adult" }],
  airline: "Duffel Airways",
  airlineCode: "ZZ",
  conditionsUrl: "https://duffel.com/conditions",
  route: "Seattle to Los Angeles",
  roundTrip: false,
  card: { offerId: OFFER_ID, airline: "Duffel Airways", logo: "https://assets.duffel.com/ZZ.svg", date: "Thu, Nov 12", from: "SEA", to: "LAX", depart: "6:49 AM", arrive: "9:34 AM", duration: "2h 45m", stops: "Nonstop", priceNote: "1 adult · Economy · One way", returnTimes: "" },
  test: true,
};
const TRAVELLER = { id: "pas_0000AxyzTestPass01", title: "ms", gender: "f", given_name: "Amelia", family_name: "Earhart", born_on: "1987-07-24", email: "amelia@example.com", phone_number: "+1 (206) 555-0100" };
const SEARCH_CARD = { kind: "send-message", id: "t1s1", timestampMs: 1, message: { type: "text", content: `\`\`\`simeon-flights\n${JSON.stringify({ title: "Seattle to Los Angeles", offers: [{ offerId: OFFER_ID, airline: "Duffel Airways" }, { airline: "Older card, no id" }] })}\n\`\`\`` } };

test("the form, the travellers' checks and the flight's checkout card", async () => {
  const { module, dispose } = await load("source/shared/node/flight-booking/flight-booking.ts", "flight-booking");
  try {
    const prefill = module.travellerPrefill(2, { name: "Amelia Mary Earhart", email: "amelia@example.com", phone: "+12065550100" });
    assert.deepEqual(prefill, [{ given_name: "Amelia Mary", family_name: "Earhart", email: "amelia@example.com", phone_number: "+12065550100" }, {}], "Link's details for the first traveller only");
    const form = module.flightPassengersMessage(OFFER, prefill.slice(0, 1));
    assert.equal(form.type, "flight-passengers");
    assert.equal(form.content, "Traveller details for Seattle to Los Angeles · Thu, Nov 12 · $361.20");
    assert.equal(form.flight.offerId, OFFER_ID);
    assert.equal(form.flight.depart, "6:49 AM");
    assert.equal(form.flight.test, true);

    const today = new Date("2026-10-13T12:00:00Z");
    const good = module.checkTravellers([TRAVELLER], form.flight, today);
    assert.equal(good.ok, true);
    assert.equal(good.travellers[0].phone_number, "+12065550100");
    assert.equal(module.checkTravellers([], form.flight, today).ok, false, "one block per traveller");
    for (const [change, field] of [[{ given_name: "4m3lia" }, "given_name"], [{ title: "sir" }, "title"], [{ gender: "x" }, "gender"], [{ born_on: "2030-01-01" }, "born_on"], [{ born_on: "1987-02-30" }, "born_on"], [{ email: "amelia" }, "email"], [{ phone_number: "2065550100" }, "phone_number"], [{ id: "pas_someoneelse00" }, "id"]]) {
      const refused = module.checkTravellers([{ ...TRAVELLER, ...change }], form.flight, today);
      assert.equal(refused.ok, false, JSON.stringify(change));
      assert.equal(refused.field, field);
    }
    const needsPassport = { ...form.flight, documentsRequired: true };
    assert.equal(module.checkTravellers([TRAVELLER], needsPassport, today).field, "passport");
    const withPassport = module.checkTravellers([{ ...TRAVELLER, passport: { number: "533 401 372", issuing_country_code: "us", expires_on: "2030-01-01" } }], needsPassport, today);
    assert.deepEqual(withPassport.travellers[0].passport, { number: "533401372", issuing_country_code: "US", expires_on: "2030-01-01" });

    const card = module.flightCheckoutCard({ offer: OFFER, formEntryId: "t2s1", travellers: good.travellers, card: { brand: "Visa", last4: "4242" }, paymentMethodId: "csmrpd_visa" });
    assert.equal(card.type, "purchase", "Allow, Deny and Link work as for any purchase");
    assert.equal(card.content, "Flight Seattle to Los Angeles · Thu, Nov 12 · $361.20");
    assert.equal(card.purchase.merchant, "Duffel Airways");
    assert.equal(card.purchase.amount, 36120);
    assert.equal(card.purchase.total, "$361.20");
    assert.equal(card.purchase.test, true);
    assert.equal(card.purchase.link.test, true);
    assert.equal(card.purchase.link.paymentMethodId, "csmrpd_visa");
    assert.ok(card.purchase.link.context.length >= 100);
    assert.match(card.purchase.link.context, /Seattle to Los Angeles on Duffel Airways.*Amelia Earhart/);
    assert.deepEqual(card.purchase.flight.travellers, ["Amelia Earhart"]);
    assert.equal(card.purchase.flight.formEntryId, "t2s1");
    assert.doesNotMatch(JSON.stringify(card), /1987-07-24|amelia@example\.com|555/, "the chat keeps names, never the rest");
    assert.equal(module.purchaseFlightOf(card.purchase).offerId, OFFER_ID);
    assert.equal(module.purchaseFlightOf({ merchant: "NCVSS" }), undefined);

    const flight = card.purchase.flight;
    assert.match(module.buildFlightBookedWakePrompt("t2s2", flight, "RZPNX8", true), /booking reference RZPNX8.*test mode.*Don't book it again/s);
    assert.match(module.buildFlightUncertainWakePrompt("t2s2", flight), /Never book it again/);
    assert.match(module.buildFlightFailedWakePrompt("t2s2", flight, "The card was declined."), /was not booked.*declined.*don't retry/s);
  } finally {
    await dispose();
  }
});

test("BookFlight posts the traveller form and ends the turn; a gone offer is a sentence", async () => {
  const { module, dispose } = await load("source/host/runner/tools/book-flight-tool.ts", "book-flight-tool");
  const booking = await load("source/shared/node/flight-booking/flight-booking.ts", "flight-booking-2");
  try {
    const forms = [];
    let refuse = false;
    const tool = module.createBookFlightTool({
      prepareForm: async (offerId) => refuse ? { ok: false, message: "That flight's price is no longer available; search again for a fresh one." } : { ok: true, message: booking.module.flightPassengersMessage({ ...OFFER, offerId }, [{}]) },
      emitForm: (message) => { forms.push(message); return "t2s1"; },
    });
    assert.equal(tool.name, "BookFlight");
    const shown = await run(tool, { offer_id: OFFER_ID });
    assert.match(shown, /traveller form for Seattle to Los Angeles \(\$361\.20, Duffel's test mode/);
    assert.match(shown, /\(entry t2s1\)/);
    assert.match(shown, /Stop here/);
    assert.equal(forms.length, 1);
    refuse = true;
    assert.match(await run(tool, { offer_id: OFFER_ID }), /can't be booked: That flight's price is no longer available/);
    assert.equal(forms.length, 1);
    await assert.rejects(run(tool, { offer_id: "SEA-LAX" }), /off_/, "only an offer id from the search");
  } finally {
    await dispose();
    await booking.dispose();
  }
});

/** One open agent (a1) with a flight search card; appends and updates land in its entries. */
function fakeManager() {
  const entries = [structuredClone(SEARCH_CARD)];
  const db = {
    entries,
    getTranscriptEntries: () => entries,
    appendTranscriptEntry: (entry) => { entries.push(entry); return true; },
    updateTranscriptEntry: (id, update) => { const index = entries.findIndex((item) => item.id === id); if (index >= 0) entries[index] = update(entries[index]); },
  };
  const emitted = [];
  const wakes = [];
  const tm = {
    sessions: { activeSession: { id: "other" }, liveSessions: new Map([["a1", { id: "a1", db }]]), inMemoryTranscriptAgentId: "other", isAgentGone: () => false },
    sessionStore: { readAgentTranscriptEntries: () => [], withAgentDb: async () => null },
    roster: { emit: (event, agentId) => emitted.push({ ...event, agentId }), emitAgentUpdate: async () => undefined },
    backgroundWakes: { runHiddenPromptWake: async (agentId, source, prompt) => { wakes.push({ agentId, source, prompt }); } },
  };
  return { tm, entries, emitted, wakes };
}

function fakeWallet({ approve = true } = {}) {
  const calls = [];
  return {
    calls,
    personFacts: async () => ({ name: "Amelia Earhart", email: "amelia@example.com", phone: "+12065550100" }),
    checkoutFacts: async (request) => { calls.push(["facts", request]); return { ok: true, paymentMethodId: "csmrpd_visa", card: { brand: "Visa", last4: "4242" } }; },
    requestSpend: async (request) => { calls.push(["create", request]); return { ok: true, id: "lsrq_1", status: approve ? "approved" : "denied" }; },
    spendStatus: async () => ({ ok: false, code: "POLLING_TIMEOUT", message: "waiting" }),
    withCard: async (id, use) => { calls.push(["card", id]); return { ok: true, value: await use({ number: "4000002500003155", cvc: "123", expMonth: 12, expYear: 2030, billing: { name: "Amelia Earhart", line1: "1 Main St", line2: "", city: "Seattle", state: "WA", postalCode: "98101", country: "US" } }) }; },
    cancelSpend: async (id) => { calls.push(["cancel", id]); return true; },
    reportOutcome: async (args) => { calls.push(["report", args]); },
  };
}

async function harness({ offer = OFFER, order, payResult, approve = true } = {}) {
  const flights = await load("source/host/extensions/transcript/flight-bookings.ts", `flight-bookings-${Math.random().toString(36).slice(2)}`);
  const purchases = await load("source/host/extensions/transcript/purchase-cards.ts", `purchase-cards-${Math.random().toString(36).slice(2)}`);
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "simeon-flight-data-"));
  const { tm, entries, emitted, wakes } = fakeManager();
  const wallet = fakeWallet({ approve });
  const asked = [];
  const paid = [];
  let offerNow = offer;
  tm.purchaseCards = new purchases.module.PurchaseCards(tm, { retryDelayMs: 0, log: () => undefined });
  tm.flightBookings = new flights.module.FlightBookings(tm, { log: () => undefined });
  tm.flightBookings.setFlightBookingServices({
    api: async (route, json) => {
      asked.push([route, json]);
      if (route === "flights/offer") return offerNow;
      if (route === "flights/client-key") return { clientKey: "head.eyJ0b2tlbiI6InRvayJ9.sig", test: true };
      if (route === "flights/order") { if (order instanceof Error) throw order; return order ?? { booked: true, orderId: "ord_1", bookingReference: "RZPNX8", test: true }; }
      throw new Error(`unexpected ${route}`);
    },
    wallet: () => wallet,
    browserPort: () => 9223,
    backendUrl: () => "https://api.simeonlabs.com",
    dataDir: () => dataDir,
    pay: async (options) => { paid.push(options); options.onChallenge?.(); return payResult ?? { ok: true, threeDSecureSessionId: "3ds_0000Test", cardLast4: "8870", filled: ["card number"], challenged: true }; },
    say: async () => undefined,
  });
  return {
    tm, entries, emitted, wakes, wallet, asked, paid, dataDir,
    setOffer: (next) => { offerNow = next; },
    dispose: async () => { await flights.dispose(); await purchases.dispose(); await rm(dataDir, { recursive: true, force: true }); },
  };
}

test("Book with Simeon → the form → Continue keeps the details on the computer → the checkout card → Link approves → booked", async () => {
  const h = await harness();
  try {
    const started = await h.tm.flightBookings.startFlightBooking({ agentId: "a1", entryId: "t1s1", offerIndex: 0 });
    assert.equal(started.ok, true);
    const form = h.entries.find((entry) => entry.id === started.entryId);
    assert.equal(form.message.type, "flight-passengers");
    assert.deepEqual(form.message.prefill[0], { given_name: "Amelia", family_name: "Earhart", email: "amelia@example.com", phone_number: "+12065550100" });
    assert.ok(h.emitted.some((event) => event.type === "appended" && event.agentId === "a1" && event.entry.id === started.entryId), "the apps hear of it with its agent");
    assert.deepEqual(await h.tm.flightBookings.startFlightBooking({ agentId: "a1", entryId: "t1s1", offerIndex: 0 }), started, "a second tap opens the same form");
    assert.match((await h.tm.flightBookings.startFlightBooking({ agentId: "a1", entryId: "t1s1", offerIndex: 1 })).message, /older search/);

    const bad = await h.tm.flightBookings.submitFlightPassengers({ agentId: "a1", entryId: started.entryId, passengers: [{ ...TRAVELLER, phone_number: "2065550100" }] });
    assert.equal(bad.ok, false);
    assert.equal(bad.field, "phone_number");

    const sent = await h.tm.flightBookings.submitFlightPassengers({ agentId: "a1", entryId: started.entryId, passengers: [TRAVELLER] });
    assert.equal(sent.ok, true);
    const saved = h.entries.find((entry) => entry.id === started.entryId);
    assert.equal(saved.passengersState, "saved");
    assert.deepEqual(saved.passengersNames, ["Amelia Earhart"]);
    assert.equal(saved.passengersCheckoutId, sent.entryId);
    const file = path.join(h.dataDir, "flight-travellers", `a1--${started.entryId}.json`);
    assert.equal((await stat(file)).mode & 0o777, 0o600, "only this computer's owner reads it");
    assert.match(await readFile(file, "utf8"), /1987-07-24/);
    assert.doesNotMatch(JSON.stringify(h.entries), /1987-07-24|\+12065550100|555-0100|amelia@example\.com/, "never in the chat, not even what Link filled in");
    const checkout = h.entries.find((entry) => entry.id === sent.entryId);
    assert.equal(checkout.message.type, "purchase");
    assert.equal(checkout.message.purchase.flight.offerId, OFFER_ID);
    assert.deepEqual(await h.tm.flightBookings.submitFlightPassengers({ agentId: "a1", entryId: started.entryId, passengers: [TRAVELLER] }), sent, "Continue twice: the same card");

    // Allow → Link approves → Simeon pays and books.
    await h.tm.purchaseCards.answerPurchase({ agentId: "a1", entryId: sent.entryId, allow: true }, h.wallet);
    await until(() => h.entries.find((entry) => entry.id === sent.entryId).purchaseState === "ordered", "the booking");
    const booked = h.entries.find((entry) => entry.id === sent.entryId);
    assert.equal(booked.purchaseOrder, "RZPNX8");
    assert.equal(booked.purchaseNote, "Booked with Duffel Airways");
    assert.equal(booked.purchaseStep, undefined);
    const [, spend] = h.wallet.calls.find(([kind]) => kind === "create");
    assert.equal(spend.amount, 36120);
    assert.equal(spend.test, true);
    assert.equal(spend.merchantName, "Duffel Airways");
    assert.equal(h.paid.length, 1);
    assert.equal(h.paid[0].card.number, "4111110116638870", "Duffel's test mode gets Duffel's test card");
    assert.equal(h.paid[0].port, 9223);
    assert.match(h.paid[0].pageUrl, /^https:\/\/api\.simeonlabs\.com\/desktop\/flights\/pay#key=head\.eyJ0b2tlbiI6InRvayJ9\.sig&what=/);
    const [, ordered] = h.asked.find(([route]) => route === "flights/order");
    assert.deepEqual(ordered, { offer_id: OFFER_ID, passengers: [{ ...TRAVELLER, phone_number: "+12065550100" }], amount: "361.20", currency: "USD", three_d_secure_session_id: "3ds_0000Test" });
    assert.ok(h.wallet.calls.some(([kind, args]) => kind === "report" && args.outcome === "success"));
    assert.ok(!h.wallet.calls.some(([kind]) => kind === "cancel"));
    assert.equal(existsSync(file), false, "the details go once it's booked");
    await until(() => h.wakes.some((wake) => wake.source === "flight-booked"), "the agent told");
    assert.match(h.wakes.find((wake) => wake.source === "flight-booked").prompt, /RZPNX8/);
    assert.ok(!h.wakes.some((wake) => wake.source === "purchase-approved"), "the agent never pays a flight itself");
    assert.ok(h.emitted.some((event) => event.type === "updated" && event.entry.purchaseStep === "verify"), "the bank's check shows on the card");

    const marked = await h.tm.purchaseCards.markPurchaseDone({ agentId: "a1", entryId: sent.entryId, outcome: "ordered" }, h.wallet);
    assert.equal(marked.ok, false);
    assert.match(marked.message, /Simeon books flights itself/);
  } finally {
    await h.dispose();
  }
});

async function toCheckout(h) {
  const started = await h.tm.flightBookings.startFlightBooking({ agentId: "a1", entryId: "t1s1", offerIndex: 0 });
  const sent = await h.tm.flightBookings.submitFlightPassengers({ agentId: "a1", entryId: started.entryId, passengers: [TRAVELLER] });
  return { form: started.entryId, checkout: sent.entryId, file: path.join(h.dataDir, "flight-travellers", `a1--${started.entryId}.json`) };
}

test("a price that moved after Allow pays nothing; Link's one-time card is canceled and the details go", async () => {
  const h = await harness();
  try {
    const { checkout, file } = await toCheckout(h);
    h.setOffer({ ...OFFER, amount: "380.00", amountMinor: 38000, total: "$380.00" });
    await h.tm.purchaseCards.answerPurchase({ agentId: "a1", entryId: checkout, allow: true }, h.wallet);
    await until(() => h.entries.find((entry) => entry.id === checkout).purchaseState === "failed", "the refusal");
    assert.match(h.entries.find((entry) => entry.id === checkout).purchaseNote, /price changed to \$380\.00.*nothing was paid/);
    assert.equal(h.paid.length, 0);
    assert.ok(h.wallet.calls.some(([kind]) => kind === "cancel"));
    assert.equal(existsSync(file), false);
    await until(() => h.wakes.some((wake) => wake.source === "flight-failed"), "the agent told");
  } finally {
    await h.dispose();
  }
});

test("a lost answer to the order is uncertain, never 'not booked', and the card is not canceled", async () => {
  const h = await harness({ order: Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }) });
  try {
    const { checkout } = await toCheckout(h);
    await h.tm.purchaseCards.answerPurchase({ agentId: "a1", entryId: checkout, allow: true }, h.wallet);
    await until(() => h.entries.find((entry) => entry.id === checkout).purchaseState === "failed", "the end");
    const card = h.entries.find((entry) => entry.id === checkout);
    assert.equal(card.purchaseStep, "uncertain");
    assert.ok(!h.wallet.calls.some(([kind]) => kind === "cancel"), "the airline may have charged it");
    await until(() => h.wakes.some((wake) => wake.source === "flight-uncertain"), "the agent told");
  } finally {
    await h.dispose();
  }
});

test("the server's clear no is 'not booked' with its sentence; a card form that didn't take the card too", async () => {
  const refused = Object.assign(new Error("The flight was not booked: The card was declined by the issuer."), { status: 409 });
  const h = await harness({ order: refused });
  try {
    const { checkout } = await toCheckout(h);
    await h.tm.purchaseCards.answerPurchase({ agentId: "a1", entryId: checkout, allow: true }, h.wallet);
    await until(() => h.entries.find((entry) => entry.id === checkout).purchaseState === "failed", "the refusal");
    assert.match(h.entries.find((entry) => entry.id === checkout).purchaseNote, /declined by the issuer/);
    assert.equal(h.entries.find((entry) => entry.id === checkout).purchaseStep, undefined);
  } finally {
    await h.dispose();
  }
  const h2 = await harness({ payResult: { ok: false, stage: "card", message: "Duffel's card form had no card number field that could be filled.", filled: [], missing: ["card number"], fieldsSeen: "x" } });
  try {
    const { checkout } = await toCheckout(h2);
    await h2.tm.purchaseCards.answerPurchase({ agentId: "a1", entryId: checkout, allow: true }, h2.wallet);
    await until(() => h2.entries.find((entry) => entry.id === checkout).purchaseState === "failed", "the refusal");
    assert.match(h2.entries.find((entry) => entry.id === checkout).purchaseNote, /payment didn't go through/);
    assert.ok(!h2.asked.some(([route]) => route === "flights/order"), "no order without a confirmed card");
  } finally {
    await h2.dispose();
  }
});

test("Deny forgets the details; a restart while paying closes the card honestly", async () => {
  const h = await harness();
  try {
    const { checkout, file } = await toCheckout(h);
    assert.equal(existsSync(file), true);
    await h.tm.purchaseCards.answerPurchase({ agentId: "a1", entryId: checkout, allow: false }, h.wallet);
    assert.equal(h.entries.find((entry) => entry.id === checkout).purchaseState, "denied");
    assert.equal(existsSync(file), false);

    // A card left "approved" while paying (the computer restarted): before the order, nothing was booked.
    const index = h.entries.findIndex((entry) => entry.id === checkout);
    h.entries[index] = { ...h.entries[index], purchaseState: "approved", purchaseStep: "paying", purchaseSpendRequestId: "lsrq_9" };
    await h.tm.purchaseCards.answerPurchase({ agentId: "a1", entryId: checkout, resume: true }, h.wallet);
    assert.equal(h.entries[index].purchaseState, "failed");
    assert.match(h.entries[index].purchaseNote, /restarted before paying; nothing was booked/);
    assert.ok(h.wallet.calls.some(([kind, id]) => kind === "cancel" && id === "lsrq_9"));
    h.entries[index] = { ...h.entries[index], purchaseState: "approved", purchaseStep: "booking" };
    await h.tm.purchaseCards.answerPurchase({ agentId: "a1", entryId: checkout, resume: true }, h.wallet);
    assert.equal(h.entries[index].purchaseStep, "uncertain", "once the order was asked for, nobody can say");
  } finally {
    await h.dispose();
  }
});

test("the gateway, the composition and the agent's instructions carry booking", async () => {
  const read = (file) => readFile(path.join(repoRoot, "source", file), "utf8");
  const gateway = await read("host/host-gateway-api.ts");
  assert.match(gateway, /startFlightBooking: \(args: any\) =>/);
  assert.match(gateway, /submitFlightPassengers: \(args: any\) =>/);
  const protocol = await read("host/gateway-protocol.ts");
  assert.match(protocol, /startFlightBooking: \(api: GatewayApi, body: string\) => api\.startFlightBooking/);
  assert.match(protocol, /submitFlightPassengers: \(api: GatewayApi, body: string\) => api\.submitFlightPassengers/);
  const composition = await read("host/host-runner-composition.ts");
  assert.match(composition, /"setFlightBookingServices"\)\?\.\(\{/);
  assert.match(composition, /booking: \{\s*prepareForm:/);
  const prompt = await read("host/runner/system-prompt.ts");
  assert.match(prompt, /BookFlight and the flight's offer_id/);
  const search = await read("host/runner/tools/flight-search-tool.ts");
  assert.doesNotMatch(search, /Booking is not available yet/);
  const { module, dispose } = await load("source/shared/node/flight-booking/duffel-pay.ts", "duffel-pay");
  try {
    const url = new URL(module.duffelPayPageUrl("https://api.simeonlabs.com", "a.b.c", "Seattle to Los Angeles · $361.20"));
    assert.equal(url.pathname, "/desktop/flights/pay");
    assert.equal(url.search, "", "the key never goes to a server");
    assert.equal(new URLSearchParams(url.hash.slice(1)).get("key"), "a.b.c");
  } finally {
    await dispose();
  }
});
