/**
 * The Credentials Store (28 October 2026): the logins and contact info
 * the person keeps in Settings for their agents, held sealed by the server
 * (`server/simeon/desktop/credentials.py`) and used by the agent's tools. At a
 * sign-in the saved login is typed into the page, only on its own site; at a
 * sign-up a strong password is made, typed into the password and its
 * confirmation, and saved. Nothing is used for a message that came through a
 * channel. The page fills run against a real Chromium when this machine has
 * one (Playwright installed), and are skipped otherwise.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
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

const ACME = "0b0e7c1a-5d1e-4b6a-9f43-1a2b3c4d5e6f";
const HOME = "1c1f8d2b-6e2f-4c7b-8a54-2b3c4d5e6f70";
const MADE = "2d209e3c-7f30-4d8c-9b65-3c4d5e6f7081";
const CARD = "3e31af4d-8041-4e9d-8c76-4d5e6f708192";
const PASSWORD = "correct horse battery";

/** The server, as this computer reads it: the list without passwords, one login with its own. */
function fakeServer() {
  const calls = [];
  const logins = {
    [ACME]: { id: ACME, kind: "login", name: "Acme", website: "https://acme.example/login", site: "acme.example", username: "ada@example.com", hasPassword: true, hints: "Use for work", password: PASSWORD },
  };
  const contact = { id: HOME, kind: "contact", name: "Home", hints: "", fullName: "Ada Lovelace", email: "ada@example.com", phone: "+44 20 7946 0000", addressLine1: "12 St James's Square", addressLine2: "", city: "London", region: "", postalCode: "SW1Y 4LB", country: "GB" };
  // A card as the server lists it: never its number or code.
  const card = { id: CARD, kind: "card", name: "Travel", cardholder: "Ada Lovelace", brand: "visa", last4: "4242", expiry: "08/28", hasSecurityCode: true, billingId: HOME, hints: "For trips" };
  const api = async (pathName, request = {}) => {
    calls.push({ path: pathName, method: request.method ?? "GET", json: request.json });
    if (pathName === "credentials" && (request.method ?? "GET") === "GET") return { entries: [...Object.values(logins).map(({ password: _password, ...rest }) => rest), contact, card] };
    if (pathName === "credentials" && request.method === "POST") {
      const { password, ...rest } = request.json;
      logins[MADE] = { ...rest, id: MADE, name: rest.name ?? "", site: rest.website, hasPassword: true, hints: rest.hints ?? "", password };
      const { password: _password, ...shown } = logins[MADE];
      return { entry: shown };
    }
    const id = pathName.split("/")[1];
    if (id === HOME) return { entry: contact };
    if (logins[id] == null) throw new Error("That entry isn't in your Credentials Store anymore.");
    if (request.method === "PATCH") {
      Object.assign(logins[id], request.json);
      const { password: _password, ...shown } = logins[id];
      return { entry: shown };
    }
    return { entry: logins[id] };
  };
  return { api, calls, logins };
}

async function run(createContext, tool, args) {
  const handler = { emitPartialToolCall() {}, executeToolCall: async (ctx, _initial, _id, work) => work(ctx) };
  const argsStream = (async function* () { yield JSON.stringify(args); })();
  return JSON.parse(JSON.stringify(await tool.execute(createContext(), handler, argsStream, { toolCallId: "call-1" })));
}

/** What the tool said to the agent. */
function said(result) {
  return JSON.stringify(result);
}

test("the store's client reads the list, one login with its password, and saves or replaces a login", async () => {
  const { module, dispose } = await load("source/shared/node/credentials-store/credentials-store.ts", "credentials-store");
  try {
    const server = fakeServer();
    const store = module.createCredentialsStore(server.api);
    const listed = await store.list();
    assert.equal(listed.ok, true);
    assert.deepEqual(listed.entries.map((entry) => entry.kind), ["login", "contact", "card"]);
    assert.deepEqual(listed.entries[2], { kind: "card", id: CARD, name: "Travel", cardholder: "Ada Lovelace", brand: "visa", last4: "4242", expiry: "08/28", hasSecurityCode: true, billingId: HOME, hints: "For trips" }, "a card read without a number or code");
    assert.equal(listed.entries[0].password, undefined, "the list never holds a password");
    assert.equal(listed.entries[1].city, "London");

    const read = await store.readLogin(ACME);
    assert.equal(read.ok, true);
    assert.equal(read.password, PASSWORD);
    assert.match((await store.readLogin("../../account")).message, /isn't an entry_id/, "only an id goes into the address");
    assert.match((await store.readLogin(HOME)).message, /That entry is contact info, not a login/);

    const saved = await store.saveLogin({ website: "shop.example", username: "ada", password: "p", savedBy: "Nora" });
    assert.equal(saved.ok, true);
    assert.deepEqual(server.calls.at(-1), { path: "credentials", method: "POST", json: { kind: "login", website: "shop.example", username: "ada", password: "p", savedBy: "Nora" } });
    const replaced = await store.saveLogin({ website: "shop.example", username: "ada", password: "q", replaceId: MADE });
    assert.equal(replaced.ok, true);
    assert.deepEqual(server.calls.at(-1), { path: `credentials/${MADE}`, method: "PATCH", json: { username: "ada", password: "q" } });

    const made = module.makeStrongPassword();
    assert.match(made, /^[a-zA-Z2-9]{6}-[a-zA-Z2-9]{6}-[a-zA-Z2-9]{6}$/);
    assert.match(made, /[A-Z]/);
    assert.match(made, /[2-9]/);
    assert.notEqual(module.makeStrongPassword(), made);
    assert.equal(module.signUpSite("signup.acme.example"), "acme.example");
    assert.equal(module.signUpSite("https://accounts.acme.co.uk/register"), "acme.co.uk");
    assert.equal(module.signUpSite("acme.co.uk"), "acme.co.uk");
    assert.equal(module.signUpSite("shop.acme.example"), "shop.acme.example");
  } finally {
    await dispose();
  }
});

test("the agent's tools: a login typed only on its own site, a password read only for it, a sign-up's password made and saved", async () => {
  const tools = await load("source/host/runner/tools/credentials-store-tools.ts", "credentials-store-tools");
  const storeModule = await load("source/shared/node/credentials-store/credentials-store.ts", "credentials-store-2");
  const context = await load("source/packages/context/core.ts", "context-core-store");
  try {
    const server = fakeServer();
    const fills = [];
    const newPasswords = [];
    const logs = [];
    let fillAnswer = { ok: true, page: "acme.example", outcomes: { username: "filled", password: "filled" }, submitted: false };
    let newAnswer = { ok: true, page: "signup.shop.example", filled: 2, failed: 0 };
    let source = "turn";
    const deps = {
      store: storeModule.module.createCredentialsStore(server.api),
      fillLogin: async (request) => { fills.push(request); return fillAnswer; },
      fillNewPassword: async (request) => { newPasswords.push(request); return newAnswer; },
      requestSource: () => source,
      agentName: () => "Nora",
      log: (line) => logs.push(line),
      makePassword: () => "kobwyc-Qinbe7-mocwux",
    };
    const [list, fill, reveal, make, save] = tools.module.createCredentialsStoreTools(deps);
    assert.deepEqual([list.name, fill.name, reveal.name, make.name, save.name], ["ListStoredCredentials", "FillStoredLogin", "ReadStoredPassword", "FillNewPassword", "SaveStoredLogin"]);
    const call = async (tool, args) => said(await run(context.module.createContext, tool, args));

    const listedForSite = await call(list, { site: "https://www.acme.example/login" });
    assert.match(listedForSite, /Logins for acme\.example:/);
    assert.match(listedForSite, new RegExp(`entry_id ${ACME}: \\\\"Acme\\\\" \\(acme\\.example\\); username ada@example\\.com; hints: Use for work`));
    assert.match(listedForSite, /full name Ada Lovelace; email ada@example\.com; phone \+44 20 7946 0000; address 12 St James's Square, London, SW1Y 4LB, GB/);
    assert.doesNotMatch(listedForSite, /correct horse/, "the list never shows a password");
    // A card by its name, network and last four, its billing address named by its contact info.
    assert.match(listedForSite, new RegExp(`entry_id ${CARD}: \\\\"Travel\\\\" \\(Visa \u2022\u2022\u2022\u2022 4242\\); expires 08/28; name on card Ada Lovelace; billing address from \\\\"Home\\\\"; hints: For trips`));
    assert.match(listedForSite, /You never see a card's number or security code; you pay only through RequestPurchase/);
    assert.match(await call(list, { site: "other.example" }), /none saved for other\.example/);

    // A login is typed on its own site and its subdomains, never another.
    assert.match(await call(fill, { entry_id: ACME, site: "acme-login.example" }), /is saved for acme\.example, not acme-login\.example\. Never type it on another site/);
    assert.equal(fills.length, 0);
    const filled = await call(fill, { entry_id: ACME, site: "https://login.acme.example/" });
    assert.match(filled, /Filled \\"Acme\\" on login\.acme\.example: username filled, password filled/);
    assert.match(filled, /tell the user in a few words that you signed in with their saved login \\"Acme\\"/);
    assert.equal(fills[0].domain, "login.acme.example");
    assert.deepEqual(fills[0].values, { username: "ada@example.com", password: PASSWORD });
    assert.doesNotMatch(filled, /correct horse/, "the fill never says the password");
    assert.doesNotMatch(logs.join("\n"), /correct horse|ada@example/, "nor does the log");
    fillAnswer = { ok: true, page: "acme.example", outcomes: { username: "notFound", password: "notFound" }, submitted: false };
    assert.match(await call(fill, { entry_id: ACME, site: "acme.example" }), /No sign-in field on the page on acme\.example could be filled/);

    // The agent may see a login (the founder's word), for its own site.
    assert.match(await call(reveal, { entry_id: ACME, site: "acme.example" }), /username ada@example\.com; password correct horse battery/);
    assert.match(await call(reveal, { entry_id: ACME, site: "evil.example" }), /is saved for acme\.example, not evil\.example/);

    // A sign-up: nothing is saved until the password went into the page.
    newAnswer = { ok: true, page: "signup.shop.example", filled: 0, failed: 0 };
    assert.match(await call(make, { site: "signup.shop.example", username: "ada@example.com" }), /No password field on the page on signup\.shop\.example now.*Nothing was saved/);
    assert.equal(server.calls.filter((one) => one.method === "POST").length, 0);
    newAnswer = { ok: true, page: "signup.shop.example", filled: 2, failed: 0 };
    const madeAnswer = await call(make, { site: "https://signup.shop.example/join", username: "ada@example.com" });
    assert.match(madeAnswer, new RegExp(`typed it into 2 password fields on signup\\.shop\\.example; saved as a login for shop\\.example with username ada@example\\.com in the user's Credentials Store \\(entry_id ${MADE}\\)`));
    assert.doesNotMatch(madeAnswer, /kobwyc/, "the agent never needs to see it");
    assert.deepEqual(newPasswords.at(-1), { domain: "signup.shop.example", value: "kobwyc-Qinbe7-mocwux" });
    assert.deepEqual(server.calls.at(-1).json, { kind: "login", website: "shop.example", username: "ada@example.com", password: "kobwyc-Qinbe7-mocwux", savedBy: "Nora" });
    // The site refused it: the next one replaces it.
    await call(make, { site: "signup.shop.example", username: "ada@example.com", replace_entry_id: MADE });
    assert.deepEqual(server.calls.at(-1), { path: `credentials/${MADE}`, method: "PATCH", json: { username: "ada@example.com", password: "kobwyc-Qinbe7-mocwux" } });

    // A saving that fails twice hands the password over, so it isn't lost.
    const failing = { ...deps, store: { ...deps.store, saveLogin: async () => ({ ok: false, message: "Simeon Labs' server could not be reached." }) } };
    const [, , , makeFailing] = tools.module.createCredentialsStoreTools(failing);
    assert.match(said(await run(context.module.createContext, makeFailing, { site: "shop.example", username: "ada" })), /couldn't be saved.*here it is: kobwyc-Qinbe7-mocwux/);

    assert.match(await call(save, { website: "https://gym.example", username: "ada", password: "s3cret" }), /Saved \\"gym\.example\\" \(gym\.example\) in the user's Credentials Store/);

    // A channel's message (Discord, Slack…) can come from anyone: nothing of the store is used for it.
    source = "connector";
    const before = server.calls.length;
    for (const [tool, args] of [[list, {}], [fill, { entry_id: ACME, site: "acme.example" }], [reveal, { entry_id: ACME, site: "acme.example" }], [make, { site: "shop.example", username: "ada" }], [save, { website: "x.example", username: "a", password: "b" }]]) {
      assert.match(await call(tool, args), /isn't used for a message that came through a channel/);
    }
    assert.equal(server.calls.length, before, "the store isn't even asked");
  } finally {
    await tools.dispose();
    await storeModule.dispose();
    await context.dispose();
  }
});

function playwright() {
  try { return createRequire(import.meta.url)("playwright"); } catch { return undefined; }
}

const SIGN_UP = `<!doctype html><html><body>
<form onsubmit="event.preventDefault(); document.body.dataset.submitted = 'yes'">
  <label>Email <input id="email" type="email" autocomplete="email"></label>
  <label>Current password <input id="current" type="password" autocomplete="current-password"></label>
  <label>Password <input id="new" type="password" autocomplete="new-password"></label>
  <input id="hidden" type="password" style="display:none">
  <label>Confirm password <input id="confirm" type="password"></label>
  <button type="submit">Create account</button>
</form></body></html>`;

test("a sign-up's new password goes into the password and its confirmation, never the current one, and nothing comes back", async (t) => {
  const pw = playwright();
  if (pw == null) { t.skip("Playwright is not installed here"); return; }
  const { module, dispose } = await load("source/shared/node/user-form/form-fill.ts", "form-fill-store");
  const server = createServer((_request, response) => { response.writeHead(200, { "content-type": "text/html" }); response.end(SIGN_UP); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = 9400 + Math.floor(Math.random() * 400);
  let browser;
  try {
    try {
      browser = await pw.chromium.launch({ args: [`--remote-debugging-port=${port}`] });
    } catch (error) {
      t.skip(`Chromium did not start: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/join`);
    const base = { domain: "127.0.0.1", ports: [port], loadPlaywright: () => pw };
    const typed = await module.fillNewPassword({ ...base, value: "kobwyc-Qinbe7-mocwux" });
    assert.deepEqual(typed, { ok: true, page: "127.0.0.1", filled: 2, failed: 0 });
    assert.equal(await page.inputValue("#new"), "kobwyc-Qinbe7-mocwux");
    assert.equal(await page.inputValue("#confirm"), "kobwyc-Qinbe7-mocwux");
    assert.equal(await page.inputValue("#current"), "", "never the current password");
    assert.equal(await page.inputValue("#hidden"), "", "never a hidden field");
    assert.equal(await page.evaluate(() => document.body.dataset.submitted ?? "no"), "no", "nothing is submitted");
    const elsewhere = await module.fillNewPassword({ ...base, domain: "example.com", value: "x" });
    assert.equal(elsewhere.ok, false, "never a tab on another site");
  } finally {
    await browser?.close().catch(() => undefined);
    server.close();
    await dispose();
  }
});

test("the store's tools are in the agent's turn and brief, never in a shared room, and the server keeps the store", async () => {
  const composition = await src("host/host-runner-composition.ts");
  assert.match(composition, /createCredentialsStoreToolInputs: turn =>/);
  assert.match(composition, /fillLogin: async \(request\) => await fillUserForm\(\{ \.\.\.request, ports: ports\(\), missingAs: "notFound" \}\)/);
  assert.match(composition, /requestSource: \(\) => \{ const source = method\(extensions\.api\("transcript"\), "activeRequestSource"\)\?\.\(session\.id\)/);
  assert.match(await src("host/extensions/transcript/transcript-manager.ts"), /\["activeRequestSource", "turnRuntime"\]/);
  const toolset = await src("host/runner/tools/turn-toolset.ts");
  // In every turn of the person's own chats (9 November 2026), the browser's tools only while it's up.
  assert.match(toolset, /if \(!host\.isSubagentRunner\) \{\n    const credentialsStore = factories\.credentialsStore\?\.\(\{ browser: host\.remoteBoxHasDesktop && host\.getRemoteBoxAvailable\(\) \}\);/);
  const shared = toolset.slice(toolset.indexOf("export const SHARED_ROOM_TOOL_NAMES"), toolset.indexOf("export const SAND_FORCED_STATIC_TOOL_NAMES"));
  for (const name of ["ListStoredCredentials", "FillStoredLogin", "ReadStoredPassword", "FillNewPassword", "SaveStoredLogin", "RequestStoreEntry"]) assert.doesNotMatch(shared, new RegExp(name), `${name} is never offered in a shared room`);
  const brief = await src("host/runner/system-prompt.ts");
  assert.match(brief, /At any sign-in or sign-up, look in their Credentials Store first \(ListStoredCredentials with the page's site/);
  assert.match(await src("host/runner/prompt-collector-glue.ts"), /FillNewPassword makes the password, types it into the page and saves the login/);
  assert.match(await src("shared/node/simeon-backend/simeon-api.ts"), /readonly method\?: "GET" \| "POST" \| "PATCH";/);
  const serverModule = await readFile(path.join(repoRoot, "..", "server", "simeon", "desktop", "credentials.py"), "utf8");
  assert.match(serverModule, /@router\.get\("\/api\/credentials", name="desktop:credentials_list"\)/);
  assert.match(serverModule, /return f"credentials:\{user_id\}"/, "each person's entries sealed for them alone");
});

test("the agent knows the store without the browser, offers to keep what's missing, and says once what it used", async () => {
  const tools = await load("source/host/runner/tools/credentials-store-tools.ts", "credentials-store-tools-cards");
  const storeModule = await load("source/shared/node/credentials-store/credentials-store.ts", "credentials-store-cards");
  const context = await load("source/packages/context/core.ts", "context-core-store-cards");
  const shape = await load("source/host/runner/turn-shape.ts", "turn-shape-store");
  try {
    const server = fakeServer();
    const cards = [];
    let source = "turn";
    const deps = {
      store: storeModule.module.createCredentialsStore(server.api),
      fillLogin: async () => ({ ok: true, page: "acme.example", outcomes: { username: "filled", password: "filled" }, submitted: false }),
      fillNewPassword: async () => ({ ok: true, page: "shop.example", filled: 2, failed: 0 }),
      requestSource: () => source,
      agentName: () => "Nora",
      makePassword: () => "kobwyc-Qinbe7-mocwux",
      emitCard: (message) => { cards.push(message); return `e${cards.length}`; },
      now: () => 1,
    };
    const call = async (tool, args) => said(await run(context.module.createContext, tool, args));
    // What the turn reads: the tool's own words.
    const raw = async (tool, args) => (await run(context.module.createContext, tool, args)).success.currentStep;

    // With no browser on the computer: the list, the ask and the save, so the agent always knows the store.
    const without = tools.module.createCredentialsStoreTools(deps, { browser: false });
    assert.deepEqual(without.map((tool) => tool.name), ["ListStoredCredentials", "RequestStoreEntry", "SaveStoredLogin"]);
    const [, request] = without;
    const all = tools.module.createCredentialsStoreTools(deps);
    assert.deepEqual(all.map((tool) => tool.name), ["ListStoredCredentials", "FillStoredLogin", "ReadStoredPassword", "FillNewPassword", "SaveStoredLogin", "RequestStoreEntry"]);

    // The ask: a card whose button opens the store's form; the turn ends on it.
    const asked = await raw(request, { kind: "login", title: "Amazon", website: "https://www.amazon.com/ap/signin", reason: "So I can sign in to Amazon for you next time" });
    assert.deepEqual(cards.at(-1), { type: "store-entry", store: { mode: "request", kind: "login", title: "Amazon", website: "amazon.com", reason: "So I can sign in to Amazon for you next time" } });
    assert.match(asked, /^The Credentials Store card for "Amazon" is in the chat/);
    assert.equal(shape.module.cardCallWaits("RequestStoreEntry", asked), true, "the turn ends on the card");
    // A login already saved for the site: no card, the agent is told to use it.
    const saved = await raw(request, { kind: "login", title: "Acme", website: "login.acme.example" });
    assert.match(saved, new RegExp(`A login for login\\.acme\\.example is already saved: entry_id ${ACME}`));
    assert.equal(shape.module.cardCallWaits("RequestStoreEntry", saved), false);
    assert.equal(cards.length, 1);
    assert.match(await call(request, { kind: "login", title: "Amazon" }), /Give the login's website/);
    await call(request, { kind: "contact", title: "Home", reason: "For your deliveries" });
    assert.deepEqual(cards.at(-1).store, { mode: "request", kind: "contact", title: "Home", reason: "For your deliveries" });
    await call(request, { kind: "card", title: "Travel card" });
    assert.deepEqual(cards.at(-1).store, { mode: "request", kind: "card", title: "Travel card" });

    // A saved login used: one small card, however many steps the sign-in takes; the agent doesn't repeat it.
    const [, fill, , make, save] = all;
    cards.length = 0;
    assert.match(await call(fill, { entry_id: ACME, site: "acme.example" }), /The chat shows the user a small card saying you used their saved login \\"Acme\\": don't repeat it/);
    await call(fill, { entry_id: ACME, site: "acme.example" });
    assert.deepEqual(cards, [{ type: "store-entry", store: { mode: "used", kind: "login", title: "Acme", website: "acme.example" } }]);
    // A sign-up's login saved: one card; a refused password replaced says nothing new.
    assert.match(await call(make, { site: "signup.shop.example", username: "ada@example.com" }), /small card saying the login is saved in their Credentials Store: don't repeat it/);
    assert.deepEqual(cards.at(-1), { type: "store-entry", store: { mode: "saved", kind: "login", title: "shop.example", website: "shop.example" } });
    await call(make, { site: "signup.shop.example", username: "ada@example.com", replace_entry_id: MADE });
    assert.equal(cards.length, 2);
    assert.doesNotMatch(JSON.stringify(cards), /kobwyc|correct horse/, "no password on a card");
    await call(save, { website: "gym.example", username: "ada", password: "s3cret" });
    assert.equal(cards.at(-1).store.mode, "saved");

    // Never for a channel's message; nowhere to show it, it says where the person adds it.
    source = "connector";
    const count = cards.length;
    assert.match(await call(request, { kind: "contact", title: "Home" }), /isn't used for a message that came through a channel/);
    assert.equal(cards.length, count);
    source = "turn";
    const [, bare] = tools.module.createCredentialsStoreTools({ ...deps, emitCard: undefined }, { browser: false });
    assert.match(await call(bare, { kind: "contact", title: "Home" }), /can't be shown here\. Tell the user they can add it in Settings → Credentials Store/);
  } finally {
    await tools.dispose();
    await storeModule.dispose();
    await context.dispose();
    await shape.dispose();
  }
});

function fakeManager(entries) {
  const db = {
    getTranscriptEntries: () => entries,
    updateTranscriptEntry: (id, update) => { const index = entries.findIndex((item) => item.id === id); if (index >= 0) entries[index] = update(entries[index]); },
  };
  const emitted = [];
  const wakes = [];
  const tm = {
    userLanguage: () => "en",
    sessions: { activeSession: { id: "other" }, liveSessions: new Map([["a1", { id: "a1", db }]]), inMemoryTranscriptAgentId: "other", isAgentGone: () => false },
    sessionStore: { readAgentTranscriptEntries: () => [], withAgentDb: async () => null },
    roster: { emit: (event, agentId) => emitted.push({ ...event, agentId }), emitAgentUpdate: async () => undefined },
    backgroundWakes: { runHiddenPromptWake: async (agentId, wakeSource, prompt, _tray, options) => { wakes.push({ agentId, source: wakeSource, prompt, options }); } },
  };
  return { tm, emitted, wakes };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("the store's card says Saved and wakes its agent; its X is a no; a note takes no answer", async () => {
  const cardsModule = await load("source/host/extensions/transcript/store-cards.ts", "store-cards");
  try {
    const entries = [
      { id: "s1", kind: "send-message", message: { type: "store-entry", store: { mode: "request", kind: "login", title: "Amazon", website: "amazon.com" } } },
      { id: "s2", kind: "send-message", message: { type: "store-entry", store: { mode: "request", kind: "contact", title: "Home" } } },
      { id: "s3", kind: "send-message", message: { type: "store-entry", store: { mode: "used", kind: "login", title: "Acme", website: "acme.example" } } },
    ];
    const { tm, emitted, wakes } = fakeManager(entries);
    const cards = new cardsModule.module.StoreCards(tm, { log: () => undefined });
    assert.deepEqual(await cards.answerStoreEntry({ agentId: "a1", entryId: "s1", saved: true }), { accepted: true });
    await settle();
    assert.equal(entries[0].storeState, "saved");
    assert.equal(emitted[0].entry.storeState, "saved", "the apps hear it");
    assert.equal(wakes[0].source, "store-entry-saved");
    assert.match(wakes[0].prompt, /The user saved a login for "Amazon" in their Credentials Store \(entry s1\)\. Call ListStoredCredentials and carry on/);
    assert.equal(wakes[0].options, undefined);
    assert.deepEqual(await cards.answerStoreEntry({ agentId: "a1", entryId: "s1", saved: true }), { accepted: false }, "answered once");

    assert.deepEqual(await cards.answerStoreEntry({ agentId: "a1", entryId: "s2" }), { accepted: true });
    await settle();
    assert.equal(entries[1].storeState, "dismissed");
    assert.match(wakes[1].prompt, /dismissed saving their contact info for "Home".*Don't ask again for it/s);
    assert.deepEqual(wakes[1].options, { isSilenceAllowed: true });

    assert.deepEqual(await cards.answerStoreEntry({ agentId: "a1", entryId: "s3", saved: true }), { accepted: false }, "a note isn't asked");
    assert.deepEqual(await cards.answerStoreEntry({ agentId: "a1", entryId: "gone", saved: true }), { accepted: false });
    assert.equal(wakes.length, 2);
  } finally {
    await cardsModule.dispose();
  }
});

test("the store's card is on the gateway and in the brief, and the agent is told to recommend it", async () => {
  assert.match(await src("host/host-gateway-api.ts"), /answerStoreEntry: \(args: any\) => \{\n      markActive\("user_action"\);\n      return method\(manager, "answerStoreEntry"\)\(\{ agentId: args\?\.agentId, entryId: args\?\.entryId, saved: args\?\.saved === true \}\);/);
  assert.match(await src("host/gateway-protocol.ts"), /answerStoreEntry: \(api: GatewayApi, body: string\) => api\.answerStoreEntry\(parseCommandArgs\(body\)\)/);
  assert.match(await src("host/extensions/transcript/transcript-manager.ts"), /\["answerStoreEntry", "storeCards"\]/);
  assert.match(await src("shared/rpc/coordinator.ts"), /answerStoreEntry: \{ args: "object", reply: "record" \}/);
  assert.match(await readFile(path.join(repoRoot, "frontend", "src", "recovered", "runtime", "coordinator-source.ts"), "utf8"), /answerStoreEntry: "widgets"/);
  const composition = await src("host/host-runner-composition.ts");
  const storeInputs = composition.slice(composition.indexOf("createCredentialsStoreToolInputs: turn =>"), composition.indexOf("createOnePasswordToolInputs"));
  assert.match(storeInputs, /emitCard: \(message, timestampMs\) =>/);
  const brief = await src("host/runner/system-prompt.ts");
  assert.match(brief, /"## The user's Credentials Store"/);
  assert.match(brief, /offer to keep it with RequestStoreEntry/);
  assert.match(brief, /Never ask for a password, a card number or a security code in the chat/);
});
