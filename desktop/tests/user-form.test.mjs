/**
 * The in-chat form, as the upstream app's own card rules describe it (28
 * October 2026, "In-chat form", `request_user_form`): the person types in the
 * chat what a page on the agent's computer asks for, the host types it into
 * that page over Chrome's DevTools port, and the agent learns only which
 * fields went in. The fill runs here against a real Chromium when this
 * machine has one (Playwright installed), and is skipped otherwise.
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

function playwright() {
  try { return createRequire(import.meta.url)("playwright"); } catch { return undefined; }
}

const PAGE = `<!doctype html><html><body>
<form onsubmit="event.preventDefault(); document.body.dataset.submitted = 'yes'">
  <label for="email">Email address</label><input id="email" type="email">
  <label>Password <input id="password" type="password"></label>
  <input id="code" placeholder="One-time code">
  <select id="country"><option value="">Pick one</option><option value="fr">France</option><option value="us">United States</option></select>
  <label><input id="terms" type="checkbox"> I agree</label>
  <input id="by-ref" aria-label="Nickname">
  <iframe id="inner" srcdoc="<label>Card name <input id='inner-name'></label>"></iframe>
  <button type="submit">Continue</button>
</form></body></html>`;

async function withChrome(t, run) {
  const pw = playwright();
  if (pw == null) { t.skip("Playwright is not installed here"); return; }
  const server = createServer((_request, response) => { response.writeHead(200, { "content-type": "text/html" }); response.end(PAGE); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = 9400 + Math.floor(Math.random() * 400);
  let browser;
  try {
    browser = await pw.chromium.launch({ args: [`--remote-debugging-port=${port}`] });
  } catch (error) {
    server.close();
    t.skip(`Chromium did not start: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/signin`);
    await page.frameLocator("#inner").locator("#inner-name").waitFor();
    // What the browser helper's snapshot leaves on the page: its refs.
    await page.evaluate(() => { globalThis.__sandRefs = new Map([["e7", document.querySelector("#by-ref")]]); globalThis.__sandRefsGeneration = "g1"; });
    await run({ pw, page, port });
  } finally {
    await browser.close().catch(() => undefined);
    server.close();
  }
}

const FIELDS = [
  { id: "email", type: "email", target: { label: "Email address" } },
  { id: "password", type: "password", target: { selector: "#password" } },
  { id: "code", type: "otp", target: { label: "One-time code" } },
  { id: "country", type: "select", target: { selector: "#country" } },
  { id: "terms", type: "checkbox", target: { label: "I agree" } },
  { id: "nickname", type: "text", target: { ref: "e7" } },
  { id: "card_name", type: "text", target: { label: "Card name" } },
];

test("the form's fields are found by label, selector, ref and in a frame, and filled with nothing coming back", async (t) => {
  const { module, dispose } = await load("source/shared/node/user-form/form-fill.ts", "form-fill");
  try {
    await withChrome(t, async ({ pw, page, port }) => {
      const base = { domain: "127.0.0.1", ports: [port], loadPlaywright: () => pw };
      assert.deepEqual(await module.checkUserForm({ ...base, fields: FIELDS }), { ok: true, page: "127.0.0.1" });
      const wrong = await module.checkUserForm({ ...base, fields: [...FIELDS, { id: "ghost", type: "text", target: { label: "No such field" } }] });
      assert.equal(wrong.ok, false);
      assert.deepEqual(wrong.missing, ["ghost"]);
      const elsewhere = await module.checkUserForm({ ...base, domain: "example.com", fields: FIELDS });
      assert.equal(elsewhere.ok, false, "never a tab on another site");
      assert.match(elsewhere.message, /No tab on example\.com/);

      const values = { email: "ada@example.com", password: "correct horse", code: "123456", country: "France", terms: "true", nickname: "Ada", card_name: "" };
      const filled = await module.fillUserForm({ ...base, fields: FIELDS, values });
      assert.equal(filled.ok, true);
      assert.deepEqual(filled.outcomes, { email: "filled", password: "filled", code: "filled", country: "filled", terms: "filled", nickname: "filled", card_name: "notFilled" });
      assert.equal(filled.submitted, false);
      assert.doesNotMatch(JSON.stringify(filled), /correct horse|123456|ada@example\.com/, "no value ever comes back");
      assert.equal(await page.inputValue("#email"), "ada@example.com");
      assert.equal(await page.inputValue("#password"), "correct horse");
      assert.equal(await page.inputValue("#country"), "fr");
      assert.equal(await page.isChecked("#terms"), true);
      assert.equal(await page.inputValue("#by-ref"), "Ada");
      assert.equal(await page.frameLocator("#inner").locator("#inner-name").inputValue(), "");
      assert.equal(await page.evaluate(() => document.querySelectorAll("[data-simeon-form]").length), 0, "the ref's mark is taken off");
      assert.equal(await page.evaluate(() => document.body.dataset.submitted ?? "no"), "no", "nothing is submitted unless asked");

      const code = await module.fillUserForm({ ...base, fields: [FIELDS[2]], values: { code: "654321" }, submitAfterFill: true });
      assert.equal(code.ok, true);
      assert.equal(code.submitted, true, "a one-time code may press Enter once it is in");
      assert.equal(await page.evaluate(() => document.body.dataset.submitted ?? "no"), "yes");
    });
  } finally {
    await dispose();
  }
});

const ARGS = {
  title: "Sign in to Acme",
  instruction: "Acme asks for your email and password to show your orders.",
  reason: "auth",
  domain: "https://www.acme.example/login",
  fields: [
    { id: "email", label: "Email", type: "email", target: { ref: "e12" } },
    { id: "password", label: "Password", type: "password", target: { label: "Password" } },
  ],
};

test("a form is checked as the upstream app's rules say: a site, a target for every field, a code alone may press Enter", async () => {
  const { module, dispose } = await load("source/shared/node/user-form/user-form.ts", "user-form");
  try {
    const message = module.userFormFromArgs(ARGS);
    assert.equal(message.type, "user-form");
    assert.equal(message.form.domain, "acme.example", "the site's host, without www.");
    assert.equal(message.form.fields[1].secret, true, "a password is always masked");
    assert.equal(message.form.fields[0].secret, false);
    assert.equal(message.form.submitAfterFill, false);
    assert.match(module.userFormFromArgs({ ...ARGS, fields: [{ id: "email", label: "Email", type: "email" }] }), /needs a `target`/);
    assert.match(module.userFormFromArgs({ ...ARGS, domain: "" }), /needs `domain`/);
    assert.match(module.userFormFromArgs({ ...ARGS, fields: [ARGS.fields[0], ARGS.fields[0]] }), /Two fields/);
    assert.match(module.userFormFromArgs({ ...ARGS, submit_after_fill: true }), /only for a one-time code/, "never for a sign-in");
    const code = module.userFormFromArgs({ ...ARGS, title: "Code", fields: [{ id: "code", label: "Code", type: "otp", target: { selector: "#code" } }], submit_after_fill: true });
    assert.equal(code.form.submitAfterFill, true);
    assert.equal(code.form.fields[0].secret, true, "a code is masked too");
    assert.match(module.userFormFromArgs({ ...ARGS, reason: "checkout", fields: [{ id: "code", label: "Code", type: "otp", target: { selector: "#code" } }], submit_after_fill: true }), /only for a one-time code/);
    assert.match(module.userFormFromArgs({ ...ARGS, fields: [{ id: "c", label: "Country", type: "select", target: { selector: "#c" } }] }), /needs `options`/);

    assert.deepEqual(module.formValues(message, { email: " ada@example.com ", password: " pw ", extra: "dropped" }), { ok: true, values: { email: "ada@example.com", password: " pw " } }, "only the form's own fields; a secret kept as typed");
    assert.deepEqual(module.formValues(message, { email: "ada@example.com" }), { ok: false, field: "password" });
  } finally {
    await dispose();
  }
});

async function run(createContext, tool, args) {
  const handler = { emitPartialToolCall() {}, executeToolCall: async (ctx, _initial, _id, work) => work(ctx) };
  const argsStream = (async function* () { yield JSON.stringify(args); })();
  return JSON.stringify(await tool.execute(createContext(), handler, argsStream, { toolCallId: "call-1" }));
}

test("request_user_form shows the card only when the page's fields can be found, and the card ends the turn", async () => {
  const { module, dispose } = await load("source/host/runner/tools/user-form-tool.ts", "user-form-tool");
  const shape = await load("source/host/runner/turn-shape.ts", "turn-shape-form");
  const shaped = await load("source/shared/node/user-form/user-form.ts", "user-form-note");
  const context = await load("source/packages/context/core.ts", "context-core-form");
  try {
    const cards = [];
    const checks = [];
    const tool = (check) => module.createRequestUserFormTool({ checkForm: async (request) => { checks.push(request); return check; }, emitFormCard: (message) => { cards.push(message); return "t3s2"; } });
    assert.equal(tool({ ok: true }).name, "request_user_form");
    const refused = await run(context.module.createContext, tool({ ok: false, message: "These fields can't be found on acme.example: password.", missing: ["password"] }), ARGS);
    assert.equal(cards.length, 0, "a form that can't be filled is never shown");
    assert.match(refused, /was not shown.*fresh snapshot.*request_box_help/s);
    assert.deepEqual(checks[0], { domain: "acme.example", fields: [{ id: "email", type: "email", target: { ref: "e12" } }, { id: "password", type: "password", target: { label: "Password" } }] });

    const shown = await run(context.module.createContext, tool({ ok: true, page: "acme.example" }), ARGS);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].form.title, "Sign in to Acme");
    assert.match(shown, /The form \\"Sign in to Acme\\" is in the chat \(entry t3s2\)\. Your turn ends here/);
    const note = shaped.module.formShownNote(cards[0], "t3s2");
    assert.equal(shape.module.cardCallWaits("request_user_form", note), true, "the shown form ends the turn");
    assert.equal(shape.module.cardCallWaits("request_user_form", "The form was not shown: no tab."), false, "a refused form waits on nothing");
    assert.match(await run(context.module.createContext, tool({ ok: true, page: "acme.example" }), { ...ARGS, fields: [{ id: "x", label: "X", type: "text", target: {} }] }), /needs a `target`/);
  } finally {
    await dispose();
    await shape.dispose();
    await shaped.dispose();
    await context.dispose();
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
    backgroundWakes: { runHiddenPromptWake: async (agentId, source, prompt, _tray, options) => { wakes.push({ agentId, source, prompt, options }); } },
  };
  return { tm, emitted, wakes };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("Fill types the values into the page and the card and the agent learn only which fields went in; X is a decline", async () => {
  const shaped = await load("source/shared/node/user-form/user-form.ts", "user-form-msg");
  const forms = await load("source/host/extensions/transcript/user-forms.ts", "user-forms");
  try {
    const message = shaped.module.userFormFromArgs(ARGS);
    const entries = [{ id: "t3s2", kind: "send-message", message }, { id: "t3s3", kind: "send-message", message }];
    const { tm, emitted, wakes } = fakeManager(entries);
    const lines = [];
    const fills = [];
    const userForms = new forms.module.UserForms(tm, { log: (line) => lines.push(line) });
    userForms.setUserFormServices({
      browserPort: () => 9224,
      otherPorts: [9223, 9224, 9225],
      fill: async (options) => { fills.push(options); return { ok: true, page: "acme.example", outcomes: { email: "filled", password: "filled" }, submitted: false }; },
    });

    const empty = await userForms.submitUserForm({ agentId: "a1", entryId: "t3s2", values: { email: "ada@example.com" } });
    assert.deepEqual(empty, { ok: false, message: "Fill in every field first.", field: "password" });
    assert.equal(fills.length, 0);

    const sent = await userForms.submitUserForm({ agentId: "a1", entryId: "t3s2", values: { email: "ada@example.com", password: "correct horse" } });
    assert.deepEqual(sent, { ok: true }, "the app hears back at once");
    await settle();
    assert.equal(fills.length, 1);
    assert.deepEqual(fills[0].ports, [9224, 9223, 9225], "the agent's own Chrome first");
    assert.equal(fills[0].domain, "acme.example");
    assert.deepEqual(fills[0].values, { email: "ada@example.com", password: "correct horse" });
    const card = entries.find((entry) => entry.id === "t3s2");
    assert.equal(card.formState, "filled");
    assert.deepEqual(card.formOutcomes, { email: "filled", password: "filled" });
    assert.ok(emitted.some((event) => event.type === "updated" && event.agentId === "a1" && event.entry.formState === "filling"), "the card shows it being typed in");
    assert.equal(wakes.length, 1);
    assert.equal(wakes[0].source, "form-filled");
    assert.match(wakes[0].prompt, /Typed in: "Email", "Password"\..*Nothing was submitted/s);
    const everything = JSON.stringify({ entries, emitted, wakes, lines });
    assert.doesNotMatch(everything, /correct horse|ada@example\.com/, "no value in the chat, the apps' updates, the agent's prompt or the log");
    assert.match(lines.join("\n"), /\[forms\] typed in a1\/t3s2 on acme\.example: email filled, password filled/);
    assert.match((await userForms.submitUserForm({ agentId: "a1", entryId: "t3s2", values: { email: "a@b.co", password: "x" } })).message, /already answered/, "a form is filled once");

    assert.deepEqual(await userForms.dismissUserForm({ agentId: "a1", entryId: "t3s3" }), { accepted: true });
    await settle();
    assert.equal(entries.find((entry) => entry.id === "t3s3").formState, "dismissed");
    assert.equal(wakes[1].source, "form-dismissed");
    assert.match(wakes[1].prompt, /dismissed your form "Sign in to Acme".*declined/s);
    assert.deepEqual(wakes[1].options, { isSilenceAllowed: true });
    assert.deepEqual(await userForms.dismissUserForm({ agentId: "a1", entryId: "t3s3" }), { accepted: false });
  } finally {
    await shaped.dispose();
    await forms.dispose();
  }
});

test("a form the page no longer takes says so on the card and to the agent, and nothing typed is kept", async () => {
  const shaped = await load("source/shared/node/user-form/user-form.ts", "user-form-msg2");
  const forms = await load("source/host/extensions/transcript/user-forms.ts", "user-forms2");
  try {
    const entries = [{ id: "t3s2", kind: "send-message", message: shaped.module.userFormFromArgs(ARGS) }];
    const { tm, wakes } = fakeManager(entries);
    const userForms = new forms.module.UserForms(tm, { log: () => undefined });
    userForms.setUserFormServices({ browserPort: () => 9223, fill: async () => ({ ok: false, message: "No tab on acme.example is open in the browser on your computer." }) });
    await userForms.submitUserForm({ agentId: "a1", entryId: "t3s2", values: { email: "ada@example.com", password: "pw" } });
    await settle();
    assert.equal(entries[0].formState, "failed");
    assert.equal(entries[0].formNote, "Couldn't type it into the page.");
    assert.equal(wakes[0].source, "form-failed");
    assert.match(wakes[0].prompt, /could not be typed into the page on acme\.example: No tab on acme\.example.*Nothing they typed was kept/s);
  } finally {
    await shaped.dispose();
    await forms.dispose();
  }
});

test("the form is on the gateway, in the agent's tools and brief, and its words are in every language", async () => {
  const gateway = await src("host/host-gateway-api.ts");
  assert.match(gateway, /submitUserForm: \(args: any\) =>[\s\S]*?values: args\?\.values/);
  assert.match(gateway, /dismissUserForm: \(args: any\) =>/);
  const protocol = await src("host/gateway-protocol.ts");
  assert.match(protocol, /submitUserForm: \(api: GatewayApi, body: string\) => api\.submitUserForm/);
  assert.match(protocol, /dismissUserForm: \(api: GatewayApi, body: string\) => api\.dismissUserForm/);
  assert.match(await src("host/extensions/transcript/transcript-manager.ts"), /\["submitUserForm", "userForms"\]/);
  const composition = await src("host/host-runner-composition.ts");
  assert.match(composition, /createUserFormToolInputs: turn =>/);
  assert.match(composition, /"setUserFormServices"\)\?\.\(\{/);
  const toolset = await src("host/runner/tools/turn-toolset.ts");
  assert.match(toolset, /const userForm = factories\.userForm\?\.\(\);/);
  assert.match(await src("host/runner/system-prompt.ts"), /request_user_form/);
  assert.match(await src("host/runner/prompt-collector-glue.ts"), /each field the user must fill: its label and its ref/);
  const words = await src("shared/words/areas/trays.ts");
  for (const key of ["tray.resumeAfterFormFailed", "form.gone", "form.closed", "form.unavailable", "form.fieldEmpty", "form.notTypedIn"]) assert.equal(words.split(`"${key}"`).length - 1, 10, `${key} in all ten languages`);
});
