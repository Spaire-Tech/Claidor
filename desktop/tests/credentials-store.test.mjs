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
const PASSWORD = "correct horse battery";

/** The server, as this computer reads it: the list without passwords, one login with its own. */
function fakeServer() {
  const calls = [];
  const logins = {
    [ACME]: { id: ACME, kind: "login", name: "Acme", website: "https://acme.example/login", site: "acme.example", username: "ada@example.com", hasPassword: true, hints: "Use for work", password: PASSWORD },
  };
  const contact = { id: HOME, kind: "contact", name: "Home", hints: "", fullName: "Ada Lovelace", email: "ada@example.com", phone: "+44 20 7946 0000", addressLine1: "12 St James's Square", addressLine2: "", city: "London", region: "", postalCode: "SW1Y 4LB", country: "GB" };
  const api = async (pathName, request = {}) => {
    calls.push({ path: pathName, method: request.method ?? "GET", json: request.json });
    if (pathName === "credentials" && (request.method ?? "GET") === "GET") return { entries: [...Object.values(logins).map(({ password: _password, ...rest }) => rest), contact] };
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
    assert.deepEqual(listed.entries.map((entry) => entry.kind), ["login", "contact"]);
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
  assert.match(composition, /createCredentialsStoreToolInputs: \(\) =>/);
  assert.match(composition, /fillLogin: async \(request\) => await fillUserForm\(\{ \.\.\.request, ports: ports\(\), missingAs: "notFound" \}\)/);
  assert.match(composition, /requestSource: \(\) => \{ const source = method\(extensions\.api\("transcript"\), "activeRequestSource"\)\?\.\(session\.id\)/);
  assert.match(await src("host/extensions/transcript/transcript-manager.ts"), /\["activeRequestSource", "turnRuntime"\]/);
  const toolset = await src("host/runner/tools/turn-toolset.ts");
  assert.match(toolset, /const credentialsStore = factories\.credentialsStore\?\.\(\);/);
  const shared = toolset.slice(toolset.indexOf("export const SHARED_ROOM_TOOL_NAMES"), toolset.indexOf("export const SAND_FORCED_STATIC_TOOL_NAMES"));
  for (const name of ["ListStoredCredentials", "FillStoredLogin", "ReadStoredPassword", "FillNewPassword", "SaveStoredLogin"]) assert.doesNotMatch(shared, new RegExp(name), `${name} is never offered in a shared room`);
  const brief = await src("host/runner/system-prompt.ts");
  assert.match(brief, /At any sign-in or sign-up, look in their Credentials Store first \(ListStoredCredentials with the page's site/);
  assert.match(await src("host/runner/prompt-collector-glue.ts"), /FillNewPassword makes the password, types it into the page and saves the login/);
  assert.match(await src("shared/node/simeon-backend/simeon-api.ts"), /readonly method\?: "GET" \| "POST" \| "PATCH";/);
  const serverModule = await readFile(path.join(repoRoot, "..", "server", "simeon", "desktop", "credentials.py"), "utf8");
  assert.match(serverModule, /@router\.get\("\/api\/credentials", name="desktop:credentials_list"\)/);
  assert.match(serverModule, /return f"credentials:\{user_id\}"/, "each person's entries sealed for them alone");
});
