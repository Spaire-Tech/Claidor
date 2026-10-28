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
import { mkdtemp, rm } from "node:fs/promises";
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
