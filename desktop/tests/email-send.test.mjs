/**
 * Sending an email (28 October 2026, the founder: "im very mad at the
 * experience of sending emails. this should be the main thing simeon knows
 * how to do very well"). A reply with a company document attached went
 * to the wrong people, read "The draft didn't send" and
 * lost its paragraphs. What is pinned here:
 * - the exact Gmail or Outlook call the host writes from a card that names
 *   its mailbox: the card's recipients, a reply in its own conversation, the
 *   body as HTML with its lines kept, the files to attach;
 * - a file field of an app tool takes a path on the computer, which is read
 *   from the agent's box, uploaded through Simeon's server, and swapped for
 *   the provider's reference before the call.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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

const REPLY = { to: ["sam@example.com"], cc: ["startups@example.com"], subject: "Re: Your application", body: "Hello Sam,\n\nThank you for your follow-up.\nCompany name: Example, Inc.\n\nCheers," };

test("the body goes as HTML with every line and blank line kept, and nothing in it read as markup", async () => {
  const { module, dispose } = await load("source/host/extensions/transcript/draft-cards.ts", "email-html");
  try {
    assert.equal(module.emailBodyHtml(REPLY.body), "<div>Hello Sam,</div><div><br></div><div>Thank you for your follow-up.</div><div>Company name: Example, Inc.</div><div><br></div><div>Cheers,</div>");
    assert.equal(module.emailBodyHtml("a < b & \"c\"\r\nd"), "<div>a &lt; b &amp; &quot;c&quot;</div><div>d</div>");
  } finally {
    await dispose();
  }
});

test("a Gmail card is sent with Gmail's own tool: a reply in its thread, To then Cc as on the card, HTML on", async () => {
  const { module, dispose } = await load("source/host/extensions/transcript/draft-cards.ts", "email-gmail");
  try {
    const reply = module.emailSendCalls({ ...REPLY, to: ["sam@example.com", "maria@example.com"], via: "gmail", replyTo: { threadId: "18c2f" }, attachments: ["/home/user/attachments/Certificate.pdf"] });
    assert.equal(reply.instead, undefined);
    assert.deepEqual(reply.call, {
      server: "gmail",
      tool: "GMAIL_REPLY_TO_THREAD",
      args: {
        thread_id: "18c2f",
        recipient_email: "sam@example.com",
        extra_recipients: ["maria@example.com"],
        cc: ["startups@example.com"],
        message_body: module.emailBodyHtml(REPLY.body),
        is_html: true,
        attachment: "/home/user/attachments/Certificate.pdf",
      },
    });
    const fresh = module.emailSendCalls({ to: ["sam@example.com"], subject: "Friday", body: "See you at 3.", via: "gmail", attachments: ["/a.pdf", "/b.png"] });
    assert.deepEqual(fresh.call, { server: "gmail", tool: "GMAIL_SEND_EMAIL", args: { recipient_email: "sam@example.com", subject: "Friday", body: "<div>See you at 3.</div>", is_html: true, attachment: ["/a.pdf", "/b.png"] } });
    assert.equal(module.emailSendCalls({ to: ["sam@example.com"], subject: "x", body: "y" }), null, "no mailbox named: the agent finds the route");
    assert.equal(module.emailSendCalls({ to: ["sam@example.com"], subject: "x", body: "y", via: "yahoo" }), null);
  } finally {
    await dispose();
  }
});

test("an Outlook reply answers its message with HTML, the rest of To and the Cc copied once; a new email names everyone", async () => {
  const { module, dispose } = await load("source/host/extensions/transcript/draft-cards.ts", "email-outlook");
  try {
    const reply = module.emailSendCalls({ ...REPLY, to: ["sam@example.com", "maria@example.com"], cc: ["Maria@example.com", "startups@example.com", "sam@example.com"], via: "outlook", replyTo: { messageId: "AAMkAD" } });
    assert.deepEqual(reply.call, {
      server: "outlook",
      tool: "OUTLOOK_REPLY_EMAIL",
      args: { message_id: "AAMkAD", comment: module.emailBodyHtml(REPLY.body), is_html: true, cc_emails: ["maria@example.com", "startups@example.com"] },
    });
    assert.deepEqual(reply.instead, {
      server: "outlook",
      tool: "OUTLOOK_SEND_EMAIL",
      args: { to: "sam@example.com,maria@example.com", cc_emails: ["Maria@example.com", "startups@example.com", "sam@example.com"], subject: "Re: Your application", body: module.emailBodyHtml(REPLY.body), is_html: true },
    });
    const fresh = module.emailSendCalls({ to: ["a@x.com", "b@y.com"], subject: "Hi", body: "Hi.", via: "outlook", attachments: ["/c.pdf"] });
    assert.deepEqual(fresh, { call: { server: "outlook", tool: "OUTLOOK_SEND_EMAIL", args: { to: "a@x.com,b@y.com", subject: "Hi", body: "<div>Hi.</div>", is_html: true, attachment: "/c.pdf" } } });
  } finally {
    await dispose();
  }
});

test("Send on a card that names its mailbox wakes the agent with that one call, never a route of its own", async () => {
  const { module, dispose } = await load("source/host/extensions/transcript/draft-cards.ts", "email-prompt");
  try {
    const draft = { ...REPLY, via: "outlook", replyTo: { messageId: "AAMkAD" }, attachments: ["/home/user/attachments/Certificate.pdf"] };
    const prompt = module.buildDraftSendWakePrompt("t9s4", { type: "email-draft", draft });
    const calls = module.emailSendCalls(draft);
    assert.match(prompt, /^\[The user pressed Send on your email draft \(entry t9s4\)\. This is their explicit instruction to send it exactly as on the card: do not reword it, and do not change who gets it\.\]/);
    assert.ok(prompt.includes(`Send it with one CallMcpTool call: server "outlook", toolName "OUTLOOK_REPLY_EMAIL" and exactly these arguments:\n${JSON.stringify(calls.call.args)}`));
    assert.ok(prompt.includes(`If that sender is not sam@example.com (the user changed who it goes to), send it instead with server "outlook", toolName "OUTLOOK_SEND_EMAIL" and exactly these arguments:\n${JSON.stringify(calls.instead.args)}`));
    assert.match(prompt, /never change the recipients, the words or the files/);
    assert.match(prompt, /MarkDraftDelivered with entry_id "t9s4"/);
    assert.match(prompt, /Cc: startups@example\.com\nSubject: Re: Your application\nIn reply to: message AAMkAD\nAttachments: \/home\/user\/attachments\/Certificate\.pdf/);
    assert.doesNotMatch(prompt, /box browser/, "no other route is offered");
    // A card without a mailbox keeps the open route, with its recipients and HTML spelled out.
    const open = module.buildDraftSendWakePrompt("t9s5", { type: "email-draft", draft: { ...REPLY, replyTo: { threadId: "x" } } });
    assert.match(open, /the box browser signed in to the service/);
    assert.match(open, /Send it to exactly the To and Cc on the card, nobody else and nobody fewer\./);
    assert.match(open, /send it as a reply in that conversation, not as a new email/);
    assert.ok(open.includes(module.emailBodyHtml(REPLY.body)));
  } finally {
    await dispose();
  }
});

test("app files: a path where the schema marks a file is uploaded; any other value is left as it came", async () => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/app-files.ts", "app-files");
  try {
    const file = { type: "string", file_uploadable: true };
    const schema = { type: "object", properties: { to: { type: "string" }, note: { type: "string" }, attachment: { anyOf: [file, { type: "array", items: file }, { type: "null" }] } } };
    const uploaded = [];
    const upload = async (p) => { uploaded.push(p); return { name: module.appFileName(p), mimetype: module.appFileMimeType(p), s3key: `k/${uploaded.length}` }; };
    assert.deepEqual(await module.withAppFiles(schema, { to: "a@b.c", note: "/not/a/file", attachment: "/home/user/Certificate.pdf" }, upload), { to: "a@b.c", note: "/not/a/file", attachment: { name: "Certificate.pdf", mimetype: "application/pdf", s3key: "k/1" } });
    assert.deepEqual(await module.withAppFiles(schema, { attachment: ["/a.png", "/b.DOCX"] }, upload), { attachment: [{ name: "a.png", mimetype: "image/png", s3key: "k/2" }, { name: "b.DOCX", mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", s3key: "k/3" }] });
    assert.deepEqual(uploaded, ["/home/user/Certificate.pdf", "/a.png", "/b.DOCX"], "the note's path was never read");
    assert.equal(module.carriesPath({ to: "a@b.c", list: [1, { x: "/tmp/x" }] }), true);
    assert.equal(module.carriesPath({ to: "a@b.c", body: "<div>/</div>" }), false);
    assert.equal(module.appFileMimeType("archive"), "application/octet-stream");
  } finally {
    await dispose();
  }
});

test("an app tool given a file path reads it on the agent's computer, uploads it through Simeon's server, and calls with the reference", async () => {
  const backend = await load("source/shared/node/vendor-mcp/backend-exec.ts", "email-backend");
  const installs = await load("source/shared/node/vendor-mcp/installs.ts", "email-installs");
  const root = await mkdtemp(path.join(os.tmpdir(), "simeon-email-"));
  try {
    const url = "https://api.simeonlabs.com/desktop/api/apps/mcp/gmail";
    installs.module.upsertVendorMcpInstall(root, { id: "gmail", url, connected: true });
    const file = { type: "string", file_uploadable: true, description: "The absolute path of a file on the computer." };
    const tools = [
      { name: "GMAIL_REPLY_TO_THREAD", inputSchema: { type: "object", properties: { thread_id: { type: "string" }, message_body: { type: "string" }, attachment: { anyOf: [file, { type: "array", items: file }] } } } },
      { name: "GMAIL_SEARCH", inputSchema: { type: "object", properties: { query: { type: "string" } } } },
    ];
    const uploads = [];
    const called = [];
    const fetch = async (target, init = {}) => {
      const address = String(target);
      if (address.startsWith("https://api.simeonlabs.com/desktop/api/apps/gmail/files?")) {
        uploads.push({ query: Object.fromEntries(new URL(address).searchParams), auth: init.headers?.authorization, type: init.headers?.["content-type"], bytes: Buffer.from(init.body).toString() });
        return Response.json({ name: "Certificate.pdf", mimetype: "application/pdf", s3key: "s3/cert" });
      }
      const body = JSON.parse(init.body ?? "{}");
      if (body.method === "initialize") return Response.json({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "Simeon", version: "1" } } });
      if (body.method === "tools/list") return Response.json({ jsonrpc: "2.0", id: body.id, result: { tools } });
      if (body.method === "tools/call") { called.push(body.params); return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "sent" }], isError: false } }); }
      return new Response(null, { status: 202 });
    };
    const read = [];
    const box = backend.module.createVendorMcpBackendExec({
      rootDir: () => root,
      fetch,
      canStartAuth: false,
      getServerAccessToken: async () => "box-token",
      readAgentFile: async (agentId, filePath) => { read.push([agentId, filePath]); return new Uint8Array(Buffer.from("%PDF certificate")); },
    });
    const sent = await box.executeTool({ serverIdentifier: "gmail", toolName: "GMAIL_REPLY_TO_THREAD", args: { thread_id: "18c2f", message_body: "<div>Hi</div>", attachment: "/home/user/attachments/Certificate.pdf" }, toolCallId: "c1", agentId: "iris" });
    assert.equal(sent.result.case, "success");
    assert.equal(sent.result.value.isError, false);
    assert.deepEqual(read, [["iris", "/home/user/attachments/Certificate.pdf"]]);
    assert.deepEqual(uploads, [{ query: { tool: "GMAIL_REPLY_TO_THREAD", name: "Certificate.pdf", mimetype: "application/pdf" }, auth: "Bearer box-token", type: "application/octet-stream", bytes: "%PDF certificate" }]);
    assert.deepEqual(called.at(-1), { name: "GMAIL_REPLY_TO_THREAD", arguments: { thread_id: "18c2f", message_body: "<div>Hi</div>", attachment: { name: "Certificate.pdf", mimetype: "application/pdf", s3key: "s3/cert" } } });

    // A path in a field that is not a file goes as it came, and nothing is read.
    await box.executeTool({ serverIdentifier: "gmail", toolName: "GMAIL_SEARCH", args: { query: "/invoices" }, toolCallId: "c2", agentId: "iris" });
    assert.deepEqual(called.at(-1), { name: "GMAIL_SEARCH", arguments: { query: "/invoices" } });
    assert.equal(read.length, 1);

    // A file that can't be read stops the call: nothing goes out without its attachment.
    const unread = backend.module.createVendorMcpBackendExec({ rootDir: () => root, fetch, canStartAuth: false, getServerAccessToken: async () => "box-token", readAgentFile: async () => { throw new Error("No such file"); } });
    const before = called.length;
    const refused = await unread.executeTool({ serverIdentifier: "gmail", toolName: "GMAIL_REPLY_TO_THREAD", args: { thread_id: "t", attachment: "/missing.pdf" }, toolCallId: "c3", agentId: "iris" });
    assert.equal(refused.result.case, "error");
    assert.match(refused.result.value.error, /"GMAIL_REPLY_TO_THREAD" was not called: \/missing\.pdf could not be read on the computer \(No such file\)\./);
    assert.equal(called.length, before);
  } finally {
    await rm(root, { recursive: true, force: true });
    await backend.dispose();
    await installs.dispose();
  }
});

async function draftState() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-email-card-"));
  const outfile = path.join(dir, "draft-state.mjs");
  const entry = path.join(dir, "entry.ts");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(entry, `export * from ${JSON.stringify(path.join(repoRoot, "source/host/extensions/transcript/transcript-store.ts"))};\nexport { DraftCards, emailSendCalls } from ${JSON.stringify(path.join(repoRoot, "source/host/extensions/transcript/draft-cards.ts"))};\n`);
  await build({ entryPoints: [entry], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"] });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 5));

function setup(module, draft, apps) {
  const wakes = [];
  const lines = [];
  const tm = {
    roster: { emit: () => {} },
    sessions: { activeSession: { db: { updateTranscriptEntry: () => null } } },
    log: (line) => lines.push(line),
    backgroundWakes: { runHiddenPromptWake: async (agentId, source, prompt, title, options) => { wakes.push({ agentId, source, prompt, options }); } },
  };
  module.setTranscript([{ kind: "send-message", id: "e1", timestampMs: 1, message: { type: "email-draft", draft } }]);
  return { cards: new module.DraftCards(tm), wakes, lines, state: () => module.getTranscript()[0].draftSendState };
}

const OUTLOOK_REPLY = { ...REPLY, via: "outlook", replyTo: { messageId: "AAMkAD" }, attachments: ["/home/user/attachments/Certificate.pdf"] };
const replySchema = { type: "object", properties: { message_id: {}, comment: {}, is_html: {}, cc_emails: {}, attachment: {}, user_id: {} } };
const sendSchema = { type: "object", properties: { to: {}, cc_emails: {}, subject: {}, body: {}, is_html: {}, attachment: {}, bcc_emails: {} } };

test("Send on the card sends: one call to the mailbox it names, the card shows Sent, and the agent hears it after", async () => {
  const { module, dispose } = await draftState();
  try {
    const called = [];
    const apps = { inputSchema: async (server, tool) => (tool === "OUTLOOK_REPLY_EMAIL" ? replySchema : sendSchema), call: async (server, tool, args, agentId) => { called.push({ server, tool, args, agentId }); return { ok: true, text: "{}" }; } };
    const { cards, wakes, state } = setup(module, OUTLOOK_REPLY, apps);
    const answer = await cards.sendDraft({ agentId: "iris", entryId: "e1", draft: { body: REPLY.body } }, apps);
    assert.equal(answer.draftSendState, "sending", "the app has its answer before anything is sent");
    await settled();
    assert.deepEqual(called, [{ server: "outlook", tool: "OUTLOOK_REPLY_EMAIL", args: module.emailSendCalls(OUTLOOK_REPLY).call.args, agentId: "iris" }]);
    assert.equal(state(), "sent");
    assert.equal(wakes.length, 1);
    assert.equal(wakes[0].source, "draft-sent");
    assert.deepEqual(wakes[0].options, { isSilenceAllowed: true });
    assert.match(wakes[0].prompt, /it was sent from Outlook to sam@example\.com, Cc startups@example\.com, with 1 file attached, subject "Re: Your application"\. It has gone: never send it again/);
    assert.match(wakes[0].prompt, /if nothing was, end your turn without a message/);
    assert.equal((await cards.sendDraft({ agentId: "iris", entryId: "e1" }, apps)).draftSendState, "sent", "never twice");
    await settled();
    assert.equal(called.length, 1);
  } finally {
    await dispose();
  }
});

test("a person who changes who it goes to gets a new email to those people, not a reply to the first sender", async () => {
  const { module, dispose } = await draftState();
  try {
    const called = [];
    const apps = { inputSchema: async (server, tool) => (tool === "OUTLOOK_REPLY_EMAIL" ? replySchema : sendSchema), call: async (server, tool, args) => { called.push({ tool, args }); return { ok: true, text: "" }; } };
    const { cards } = setup(module, OUTLOOK_REPLY, apps);
    await cards.sendDraft({ agentId: "iris", entryId: "e1", draft: { to: ["maria@example.com"] } }, apps);
    await settled();
    assert.equal(called[0].tool, "OUTLOOK_SEND_EMAIL");
    assert.equal(called[0].args.to, "maria@example.com");
    assert.deepEqual(called[0].args.cc_emails, ["startups@example.com"]);
  } finally {
    await dispose();
  }
});

test("a mailbox not connected, or a refusal, hands the card back and the agent says why once", async () => {
  const { module, dispose } = await draftState();
  try {
    const offline = { inputSchema: async () => undefined, call: async () => { throw new Error("never called"); } };
    const first = setup(module, OUTLOOK_REPLY, offline);
    await first.cards.sendDraft({ agentId: "iris", entryId: "e1" }, offline);
    await settled();
    assert.equal(first.state(), "editable");
    assert.equal(first.wakes[0].source, "draft-sent");
    assert.match(first.wakes[0].prompt, /Outlook did not send it: Outlook isn't connected\. The card is editable again\. Tell the user in one plain sentence/);
    assert.equal(first.wakes[0].options, undefined, "a failure is said");

    const refusing = { inputSchema: async () => replySchema, call: async () => ({ ok: false, text: "ErrorInvalidRecipients:\n  the message has no valid recipient" }) };
    const second = setup(module, OUTLOOK_REPLY, refusing);
    await second.cards.sendDraft({ agentId: "iris", entryId: "e1" }, refusing);
    await settled();
    assert.equal(second.state(), "editable");
    assert.match(second.wakes[0].prompt, /did not send it: ErrorInvalidRecipients: the message has no valid recipient\. The card is editable again/);
  } finally {
    await dispose();
  }
});

test("a name the tool no longer takes is left to the agent with the exact call; nothing is sent from the card", async () => {
  const { module, dispose } = await draftState();
  try {
    const called = [];
    const renamed = { inputSchema: async () => ({ type: "object", properties: { message_id: {}, body: {}, is_html: {}, cc_emails: {}, attachment: {} } }), call: async (...args) => { called.push(args); return { ok: true, text: "" }; } };
    const { cards, wakes, lines, state } = setup(module, OUTLOOK_REPLY, renamed);
    await cards.sendDraft({ agentId: "iris", entryId: "e1" }, renamed);
    await settled();
    assert.equal(called.length, 0);
    assert.equal(state(), "editable", "the agent's turn (here at once) ended without a report: the card is handed back");
    assert.equal(wakes[0].source, "draft-send");
    assert.match(wakes[0].prompt, /Send it with one CallMcpTool call: server "outlook", toolName "OUTLOOK_REPLY_EMAIL"/);
    assert.ok(lines.some((line) => /OUTLOOK_REPLY_EMAIL takes no comment; the agent sends iris\/e1/.test(line)));
  } finally {
    await dispose();
  }
});

test("a draft waits on Send or Discard, as a question does: the turn ends on it", async () => {
  const runner = await readFile(path.join(repoRoot, "source/host/runner/sand-agent-runner.ts"), "utf8");
  assert.match(runner, /\|\| update\.message\.type === "email-draft"\n\s*\|\| update\.message\.type === "slack-draft"\n\s*\) \{\n\s*active\.awaitingUserSelection = true;/);
  const brief = await readFile(path.join(repoRoot, "source/host/runner/system-prompt.ts"), "utf8");
  assert.match(brief, /Drafting sends nothing and ends your turn: the card waits on Send or Discard/);
  assert.match(brief, /Send on the card sends it through the mailbox it names and you are woken with what happened/);
});
