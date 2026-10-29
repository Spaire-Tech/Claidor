/**
 * The 1Password cards (28 October 2026), as the upstream app's own card rules
 * describe them: the person's Mac makes a "Shared with Simeon" vault and a
 * read-only key with their 1Password app; the engine keeps the key in its own
 * folder; ListCredentials shows the agent which logins are there for a site
 * (names only); the fill card types one into the page once the person allows
 * it. No username, password or code ever reaches the chat, the log or the
 * agent.
 */
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
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

/** A zip of stored entries, as 1Password's archive is laid out (`op` and `op.sig`). */
function storedZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(0, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE((0o100755 << 16) >>> 0, 38); central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, end]);
}

test("1Password's tool is taken only from its archive and only when the checksum matches", async () => {
  const { module, dispose } = await load("source/shared/node/onepassword/op-cli.ts", "op-cli");
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-op-"));
  try {
    assert.equal(module.OP_CLI_VERSION, "2.40.0");
    assert.match(module.OP_CLI_ARCHIVES.x64.url, /^https:\/\/cache\.agilebits\.com\/dist\/1P\/op2\/pkg\/v2\.40\.0\/op_linux_amd64_v2\.40\.0\.zip$/);
    assert.match(module.OP_CLI_ARCHIVES.arm64.sha256, /^[0-9a-f]{64}$/);
    const op = Buffer.from("#!/bin/sh\necho op\n");
    assert.deepEqual(module.opFromArchive(storedZip([["op", op], ["op.sig", Buffer.from("sig")]])), op);
    assert.throws(() => module.opFromArchive(storedZip([["op", op], ["op.sig", Buffer.from("sig")], ["extra", Buffer.from("x")]])), /unexpected/);
    assert.throws(() => module.opFromArchive(storedZip([["op", op]])), /unexpected/);

    const tampered = storedZip([["op", op], ["op.sig", Buffer.from("sig")]]);
    await assert.rejects(module.ensureOpCli(dir, { arch: "x64", fetchImpl: async () => new Response(tampered) }), /didn't match its checksum/);
    assert.equal(existsSync(path.join(dir, "op-2.40.0", "op")), false, "nothing is written");
    await assert.rejects(module.ensureOpCli(dir, { arch: "ppc64", fetchImpl: async () => new Response("") }), /processor/);

    assert.equal(module.opMessage("[ERROR] 2026/10/28 10:00:00 invalid service account token\n"), "invalid service account token");
  } finally {
    await rm(dir, { recursive: true, force: true });
    await dispose();
  }
});

const ITEMS = [
  { id: "aaaaaaaaaaaaaaaaaaaaaaaaaa", title: "Acme", version: 3, category: "LOGIN", additional_information: "ada@example.com", urls: [{ primary: true, href: "https://www.acme.example/login" }] },
  { id: "bbbbbbbbbbbbbbbbbbbbbbbbbb", title: "Other", version: 1, category: "LOGIN", urls: [{ href: "https://other.example" }] },
  { id: "cccccccccccccccccccccccccc", title: "Look-alike", version: 1, category: "LOGIN", urls: [{ href: "https://acme.example.evil.test" }] },
];
const ITEM = { id: "aaaaaaaaaaaaaaaaaaaaaaaaaa", title: "Acme", urls: [{ href: "https://www.acme.example/login" }], fields: [
  { id: "username", type: "STRING", purpose: "USERNAME", value: "ada@example.com" },
  { id: "password", type: "CONCEALED", purpose: "PASSWORD", value: "correct horse" },
  { id: "one-time", type: "OTP", label: "one-time password", value: "otpauth://totp/x?secret=ABC", totp: "123456" },
] };
const TOKEN = `ops_${"x".repeat(40)}`;

function fakeOp() {
  const calls = [];
  const run = async (_path, args, options) => {
    calls.push({ args, token: options.token });
    if (options.token !== TOKEN) return { ok: false, message: "invalid service account token" };
    if (args[0] === "vault" && args[1] === "get") return { ok: true, stdout: JSON.stringify({ id: args[2], name: "Shared with Simeon" }) };
    if (args[0] === "item" && args[1] === "list") return { ok: true, stdout: JSON.stringify(ITEMS) };
    if (args[0] === "item" && args[1] === "get") return { ok: true, stdout: JSON.stringify(ITEM) };
    return { ok: false, message: "unexpected" };
  };
  return { calls, run };
}

test("the key is kept only once 1Password opens the vault with it, privately, and logins are matched to their own site", async () => {
  const { module, dispose } = await load("source/shared/node/onepassword/onepassword.ts", "onepassword");
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-1p-"));
  try {
    const op = fakeOp();
    const vault = new module.OnePassword({ dir, ensureOp: async () => "/fake/op", run: op.run });
    assert.equal(vault.connection(), undefined);
    assert.deepEqual(await vault.listLogins("acme.example"), { ok: false, notConnected: true, message: "1Password isn't connected." });
    assert.match((await vault.connect({ token: "not a key", vaultId: "vvvvvvvvvvvvvvvvvvvvvvvvvv" })).message, /isn't a 1Password service-account key/);
    assert.match((await vault.connect({ token: `ops_${"y".repeat(40)}`, vaultId: "vvvvvvvvvvvvvvvvvvvvvvvvvv" })).message, /refused the key: invalid service account token/);
    assert.equal(existsSync(path.join(dir, "connection.json")), false, "a key 1Password refuses is not kept");
    vault.decline();
    assert.equal(vault.declined(), true, "a closed connect card is remembered on the computer");
    assert.deepEqual(await vault.connect({ token: TOKEN, vaultId: "vvvvvvvvvvvvvvvvvvvvvvvvvv", accountEmail: "ada@example.com" }), { ok: true, vaultName: "Shared with Simeon" });
    assert.equal(vault.declined(), false, "connecting 1Password clears an earlier no");
    assert.equal(statSync(path.join(dir, "connection.json")).mode & 0o777, 0o600, "only the engine reads it");
    assert.equal(vault.connection().vaultName, "Shared with Simeon");

    const listed = await vault.listLogins("https://login.acme.example/start");
    assert.deepEqual(listed, { ok: true, logins: [{ credentialId: "aaaaaaaaaaaaaaaaaaaaaaaaaa", title: "Acme", site: "acme.example", revision: 3, vaultId: "vvvvvvvvvvvvvvvvvvvvvvvvvv" }] }, "a subdomain of the saved site, never a look-alike");
    assert.doesNotMatch(JSON.stringify(listed), /ada@example\.com/, "no username");
    const before = op.calls.length;
    await vault.listLogins("acme.example");
    assert.equal(op.calls.length, before, "the list is read again only after five minutes");
    await vault.listLogins("acme.example", { forceRefresh: true });
    assert.equal(op.calls.length, before + 1);
    assert.deepEqual((await vault.listLogins("evil.test")).logins, []);

    assert.deepEqual(await vault.readLogin("aaaaaaaaaaaaaaaaaaaaaaaaaa", "acme.example"), { ok: true, title: "Acme", secrets: { username: "ada@example.com", password: "correct horse", otp: "123456" } });
    assert.match((await vault.readLogin("aaaaaaaaaaaaaaaaaaaaaaaaaa", "other.example")).message, /isn't saved for other\.example/, "a login is read only for its own site");
    assert.ok(op.calls.some((call) => call.args.join(" ") === "item get aaaaaaaaaaaaaaaaaaaaaaaaaa --vault vvvvvvvvvvvvvvvvvvvvvvvvvv --reveal --format json"));
    vault.disconnect();
    assert.equal(vault.connection(), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await dispose();
  }
});

async function run(createContext, tool, args) {
  const handler = { emitPartialToolCall() {}, executeToolCall: async (ctx, _initial, _id, work) => work(ctx) };
  const argsStream = (async function* () { yield JSON.stringify(args); })();
  return JSON.stringify(await tool.execute(createContext(), handler, argsStream, { toolCallId: "call-1" }));
}

test("ListCredentials, request_credential_fill and request_1password_connect: names only, a card that waits, a second step without asking", async () => {
  const tools = await load("source/host/runner/tools/onepassword-tools.ts", "onepassword-tools");
  const shape = await load("source/host/runner/turn-shape.ts", "turn-shape-1p");
  const context = await load("source/packages/context/core.ts", "context-core-1p");
  try {
    const login = { credentialId: "aaaaaaaaaaaaaaaaaaaaaaaaaa", title: "Acme", site: "acme.example", revision: 3, vaultId: "vvvvvvvvvvvvvvvvvvvvvvvvvv" };
    const cards = [];
    let connected = true;
    let declined = false;
    let allowed;
    let found = ["username"];
    const deps = {
      connection: () => connected ? { vaultName: "Shared with Simeon" } : undefined,
      declined: () => declined,
      listLogins: async () => connected ? { ok: true, logins: [login] } : { ok: false, notConnected: true, message: "1Password isn't connected." },
      fillAllowed: async () => allowed,
      locateFields: async () => ({ ok: true, found }),
      emitCard: (message) => { cards.push(message); return "t4s1"; },
    };
    const [list, fill, connect] = tools.module.createOnePasswordTools(deps);
    const call = (tool, args) => run(context.module.createContext, tool, args);
    assert.deepEqual([list.name, fill.name, connect.name], ["ListCredentials", "request_credential_fill", "request_1password_connect"]);

    assert.match(await call(list, { site: "https://www.acme.example/login" }), /credential_id aaaaaaaaaaaaaaaaaaaaaaaaaa: \\"Acme\\" \(saved for acme\.example\)/);
    assert.match(await call(fill, { credential_id: "zzzzzzzzzzzzzzzzzzzzzzzzzz", site: "acme.example", purpose: "To sign in." }), /isn't a login saved for acme\.example/);
    found = [];
    assert.match(await call(fill, { credential_id: login.credentialId, site: "acme.example", purpose: "To sign in." }), /no sign-in field is on the page/);
    assert.equal(cards.length, 0);
    found = ["username"];
    const shown = await call(fill, { credential_id: login.credentialId, site: "acme.example", purpose: "To sign in and get the invoice." });
    assert.match(shown, /The 1Password card for \\"Acme\\" is in the chat \(entry t4s1\)/);
    assert.deepEqual(cards[0], { type: "credential-request", credential: { kind: "browser-login", credentialId: login.credentialId, vaultId: login.vaultId, revision: 3, title: "Acme", site: "acme.example", purpose: "To sign in and get the invoice." } });
    assert.equal(shape.module.cardCallWaits("request_credential_fill", 'The 1Password card for "Acme" is in the chat (entry t4s1). Your turn ends here.'), true);

    allowed = { ok: true, outcomes: { password: "filled", username: "notFound" } };
    const again = await call(fill, { credential_id: login.credentialId, site: "acme.example", purpose: "To sign in." });
    assert.match(again, /Filled again with \\"Acme\\".*username not on this page, password filled/);
    assert.equal(cards.length, 1, "the second step asks nothing");
    assert.equal(shape.module.cardCallWaits("request_credential_fill", "Filled again with \"Acme\""), false);

    assert.match(await call(connect, { user_asked: true }), /already connected/);
    connected = false;
    assert.match(await call(list, { site: "acme.example" }), /1Password isn't connected\. Don't bring it up: ask for the sign-in with request_user_form/);

    // Not everyone uses 1Password: without a connection the agent never looks there, and the card needs the user's word.
    assert.deepEqual(tools.module.createOnePasswordTools(deps).map((tool) => tool.name), ["request_1password_connect"]);
    assert.match(await call(connect, { user_asked: false, reason: "To sign in to Acme." }), /offer 1Password only to a user who said they use it or asked you to use it/);
    assert.equal(cards.length, 1, "no card for a user who never mentioned 1Password");
    assert.match(await call(connect, { user_asked: true, reason: "To sign in to Acme." }), /The 1Password connect card is in the chat \(entry t4s1\)/);
    assert.deepEqual(cards[1], { type: "onepassword-connect", reason: "To sign in to Acme." });
    assert.equal(shape.module.cardCallWaits("request_1password_connect", "The 1Password connect card is in the chat (entry t4s1)."), true);

    // A closed card is remembered: no offer again, unless the user asks.
    declined = true;
    assert.match(await call(connect, { user_asked: false }), /The user said no to connecting 1Password\. Don't mention it again unless they ask for it/);
    assert.match(await call(fill, { credential_id: login.credentialId, site: "acme.example", purpose: "To sign in." }), /said no to connecting 1Password/);
    assert.equal(cards.length, 2);
    assert.match(await call(connect, { user_asked: true }), /The 1Password connect card is in the chat/, "the user asking brings it back");
  } finally {
    await tools.dispose();
    await shape.dispose();
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
const CREDENTIAL = { kind: "browser-login", credentialId: "aaaaaaaaaaaaaaaaaaaaaaaaaa", vaultId: "vvvvvvvvvvvvvvvvvvvvvvvvvv", revision: 3, title: "Acme", site: "acme.example", purpose: "To sign in." };

test("Fill types the login into the page, the card and the agent learn only what went in, and it covers the next step for ten minutes", async () => {
  const cardsModule = await load("source/host/extensions/transcript/onepassword-cards.ts", "onepassword-cards");
  try {
    const entries = [
      { id: "t4s1", kind: "send-message", message: { type: "credential-request", credential: CREDENTIAL } },
      { id: "t4s2", kind: "send-message", message: { type: "credential-request", credential: CREDENTIAL } },
      { id: "t4s3", kind: "send-message", message: { type: "onepassword-connect", reason: "To sign in." } },
    ];
    const { tm, emitted, wakes } = fakeManager(entries);
    const lines = [];
    const fills = [];
    const connects = [];
    const cards = new cardsModule.module.OnePasswordCards(tm, { log: (line) => lines.push(line) });
    cards.setOnePasswordServices({
      onePassword: {
        readLogin: async (id, site) => ({ ok: true, title: "Acme", secrets: { username: "ada@example.com", password: "correct horse" } }),
        connect: async (input) => { connects.push(input); return { ok: true, vaultName: "Shared with Simeon" }; },
      },
      browserPort: () => 9224,
      otherPorts: [9223, 9224],
      fill: async (options) => { fills.push(options); return { ok: true, page: "acme.example", outcomes: { username: "filled", password: "filled" }, submitted: false }; },
    });

    assert.deepEqual(await cards.answerCredentialRequest({ agentId: "a1", entryId: "t4s1", allow: true }), { ok: true });
    await settle();
    assert.equal(fills.length, 1);
    assert.deepEqual(fills[0].ports, [9224, 9223]);
    assert.equal(fills[0].missingAs, "notFound");
    assert.deepEqual(fills[0].fields.map((field) => field.id), ["username", "password"]);
    const card = entries.find((entry) => entry.id === "t4s1");
    assert.equal(card.credentialState, "filled");
    assert.deepEqual(card.credentialOutcomes, { username: "filled", password: "filled" });
    assert.equal(wakes[0].source, "credential-filled");
    assert.match(wakes[0].prompt, /allowed 1Password to fill "Acme" on acme\.example \(entry t4s1\): username filled, password filled/);
    assert.doesNotMatch(JSON.stringify({ entries, emitted, wakes, lines }), /correct horse|ada@example\.com/, "no value in the chat, the apps' updates, the agent's prompt or the log");
    assert.match((await cards.answerCredentialRequest({ agentId: "a1", entryId: "t4s1", allow: true })).message, /already answered/);

    const next = await cards.fillAllowedCredential({ agentId: "a1", credentialId: CREDENTIAL.credentialId, site: "acme.example" });
    assert.deepEqual(next, { ok: true, outcomes: { username: "filled", password: "filled" } }, "the sign-in's next step fills without a card");
    assert.equal(await cards.fillAllowedCredential({ agentId: "a2", credentialId: CREDENTIAL.credentialId, site: "acme.example" }), undefined, "another agent's allowance is not this one's");
    assert.equal(await cards.fillAllowedCredential({ agentId: "a1", credentialId: CREDENTIAL.credentialId, site: "other.example" }), undefined);

    assert.deepEqual(await cards.answerCredentialRequest({ agentId: "a1", entryId: "t4s2", allow: false }), { ok: true });
    await settle();
    assert.equal(entries.find((entry) => entry.id === "t4s2").credentialState, "declined");
    assert.equal(wakes[1].source, "credential-declined");
    assert.deepEqual(wakes[1].options, { isSilenceAllowed: true });

    assert.deepEqual(await cards.connectOnePassword({ agentId: "a1", entryId: "t4s3", token: TOKEN, vaultId: "vvvvvvvvvvvvvvvvvvvvvvvvvv", vaultName: "Shared with Simeon", accountEmail: "ada@example.com" }), { ok: true, vaultName: "Shared with Simeon" });
    await settle();
    assert.equal(connects[0].token, TOKEN);
    const connect = entries.find((entry) => entry.id === "t4s3");
    assert.equal(connect.connectState, "connected");
    assert.equal(connect.connectAccount, "ada@example.com");
    assert.equal(wakes[2].source, "onepassword-connected");
    assert.doesNotMatch(JSON.stringify({ entries, emitted, wakes, lines }), new RegExp(TOKEN), "the key is never in the chat, the log or a prompt");
    assert.deepEqual(await cards.dismissOnePasswordConnect({ agentId: "a1", entryId: "t4s3" }), { accepted: false }, "a connected card can't be dismissed");
  } finally {
    await cardsModule.dispose();
  }
});

test("a fill that finds no sign-in field says so, and nothing read is kept", async () => {
  const cardsModule = await load("source/host/extensions/transcript/onepassword-cards.ts", "onepassword-cards2");
  try {
    const entries = [{ id: "t4s1", kind: "send-message", message: { type: "credential-request", credential: CREDENTIAL } }];
    const { tm, wakes } = fakeManager(entries);
    const cards = new cardsModule.module.OnePasswordCards(tm, { log: () => undefined });
    cards.setOnePasswordServices({
      onePassword: { readLogin: async () => ({ ok: true, title: "Acme", secrets: { username: "ada@example.com", password: "correct horse" } }) },
      browserPort: () => 9223,
      fill: async () => ({ ok: true, page: "acme.example", outcomes: { username: "notFound", password: "notFound" }, submitted: false }),
    });
    await cards.answerCredentialRequest({ agentId: "a1", entryId: "t4s1", allow: true });
    await settle();
    assert.equal(entries[0].credentialState, "failed");
    assert.equal(entries[0].credentialNote, "Couldn't fill it in.");
    assert.match(wakes[0].prompt, /couldn't be filled: no sign-in field on the page on acme\.example could be filled/);
    assert.equal(await cards.fillAllowedCredential({ agentId: "a1", credentialId: CREDENTIAL.credentialId, site: "acme.example" }), undefined, "a failed fill allows nothing further");
  } finally {
    await cardsModule.dispose();
  }
});

test("closing the connect card is a no the computer remembers", async () => {
  const cardsModule = await load("source/host/extensions/transcript/onepassword-cards.ts", "onepassword-cards3");
  try {
    const entries = [{ id: "t4s3", kind: "send-message", message: { type: "onepassword-connect", reason: "To sign in." } }];
    const { tm, wakes } = fakeManager(entries);
    let declined = 0;
    const cards = new cardsModule.module.OnePasswordCards(tm, { log: () => undefined });
    cards.setOnePasswordServices({ onePassword: { decline: () => { declined += 1; } }, browserPort: () => 9223 });
    assert.deepEqual(await cards.dismissOnePasswordConnect({ agentId: "a1", entryId: "t4s3" }), { accepted: true });
    await settle();
    assert.equal(entries[0].connectState, "dismissed");
    assert.equal(declined, 1);
    assert.match(wakes[0].prompt, /they don't want it\. Don't mention 1Password again unless they ask for it/);
    assert.deepEqual(await cards.dismissOnePasswordConnect({ agentId: "a1", entryId: "t4s3" }), { accepted: false });
    assert.equal(declined, 1);
  } finally {
    await cardsModule.dispose();
  }
});

test("the 1Password cards are on the gateway, in the agent's tools and brief, and their words are in every language", async () => {
  const gateway = await src("host/host-gateway-api.ts");
  for (const name of ["answerCredentialRequest", "connectOnePassword", "dismissOnePasswordConnect"]) {
    assert.match(gateway, new RegExp(`${name}: \\(args: any\\) =>`));
    assert.match(await src("host/gateway-protocol.ts"), new RegExp(`${name}: \\(api: GatewayApi, body: string\\) => api\\.${name}`));
    assert.match(await src("host/extensions/transcript/transcript-manager.ts"), new RegExp(`\\["${name}", "onePasswordCards"\\]`));
  }
  const composition = await src("host/host-runner-composition.ts");
  assert.match(composition, /new OnePassword\(\{ dir: `\$\{getSandRootDir\(\)\}\/onepassword` \}\)/);
  assert.match(composition, /createOnePasswordToolInputs: turn =>/);
  assert.match(composition, /connection: \(\) => \{ const held = onePassword\.connection\(\); return held == null \? undefined : \{ vaultName: held\.vaultName \}; \}/, "the tools never hold the key");
  assert.match(await src("host/runner/tools/turn-toolset.ts"), /const onePassword = factories\.onePassword\?\.\(\);/);
  // The person's own Credentials Store comes first; 1Password next, when they connected it.
  assert.match(await src("host/runner/system-prompt.ts"), /When the store has no login for the site and you have ListCredentials \(they connected 1Password\), look there next/);
  assert.match(await src("host/runner/system-prompt.ts"), /Without it, don't bring up 1Password: many people don't use it/);
  const words = await src("shared/words/areas/trays.ts");
  for (const key of ["tray.resumeAfterOnePasswordFailed", "onepassword.cardGone", "onepassword.answered", "onepassword.unavailable", "onepassword.notFilled"]) assert.equal(words.split(`"${key}"`).length - 1, 10, `${key} in all ten languages`);
  // The pinned archives' checksums are the ones 1Password signed (checked on 28 October 2026).
  const cli = await src("shared/node/onepassword/op-cli.ts");
  assert.match(cli, /74277219e8da60958c00f9aee9d2023225e98fdda8bfd2156a5d9e85e0edaab3/);
});
