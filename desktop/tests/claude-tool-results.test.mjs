/**
 * What Claude is sent after its tool calls (15 October 2026). The founder
 * asked an agent to fill in a form; Claude refused three requests in a row
 * (server log, 15:19-15:20 PT): "messages.2: `tool_use` ids were found
 * without `tool_result` blocks immediately after". Claude's rule
 * (platform.claude.com, "Handle tool calls"): the results of an assistant
 * step's calls are the next message, and in it every `tool_result` comes
 * FIRST, before any text or picture.
 *
 * The loop keeps each result as a message of its own, and a result with a
 * screenshot is followed by the picture as a user message (the OpenAI wire
 * takes no picture inside a result). The AI SDK merges those into one
 * message for Claude, in that order: with two calls in one step and a
 * screenshot from the first, the second's result came after the picture,
 * and Claude refused the whole conversation, on every later step too.
 *
 * These run the engine's wire conversion and the AI SDK's own Claude
 * provider, with a fake network, and check the body it would send against
 * Claude's rules.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-claude-tool-results-"));
  const outfile = path.join(dir, "provider-session.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/host/extensions/inference/provider-session.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  try {
    return await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** The body the AI SDK's Claude provider would send for these messages. */
async function claudeBody(messages) {
  let body;
  const fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  await generateText({ model: createAnthropic({ apiKey: "test", fetch })("claude-sonnet-5-5"), messages });
  return body;
}

/** Claude's rules for tool results, as the API applies them; the first broken one, or undefined. */
function claudeRefusal(body) {
  const messages = body.messages;
  for (let index = 0; index < messages.length; index += 1) {
    const content = Array.isArray(messages[index].content) ? messages[index].content : [];
    if (messages[index].role === "user") {
      const before = index > 0 && Array.isArray(messages[index - 1].content) ? messages[index - 1].content : [];
      const called = new Set(before.filter((block) => block.type === "tool_use").map((block) => block.id));
      for (const block of content) if (block.type === "tool_result" && !called.has(block.tool_use_id)) return `messages.${index}: unexpected tool_use_id ${block.tool_use_id}`;
    }
    if (messages[index].role !== "assistant") continue;
    const ids = content.filter((block) => block.type === "tool_use").map((block) => block.id);
    if (ids.length === 0) continue;
    const next = messages[index + 1];
    const leading = [];
    for (const block of next?.role === "user" && Array.isArray(next.content) ? next.content : []) {
      if (block.type !== "tool_result") break;
      leading.push(block.tool_use_id);
    }
    const missing = ids.filter((id) => !leading.includes(id));
    if (missing.length > 0) return `messages.${index}: \`tool_use\` ids were found without \`tool_result\` blocks immediately after: ${missing.join(", ")}`;
  }
  return undefined;
}

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const system = { role: "system", content: "You fill in forms." };
const ask = { role: "user", content: [{ type: "text", text: "Fill in the sign-up form." }] };
const call = (id, toolName, args = {}) => ({ type: "tool-call", toolCallId: id, toolName, args });
const step = (...calls) => ({ role: "assistant", content: [{ type: "text", text: "On it." }, ...calls] });
const result = (id, toolName, text, image = false) => ({ role: "tool", id, content: [{ type: "tool-result", toolCallId: id, toolName, result: text, ...(image ? { experimental_content: [{ type: "text", text }, { type: "image", data: PNG, mimeType: "image/png" }] } : {}) }] });

test("two calls in one step, the first with a screenshot: every result comes first, then the picture", async () => {
  const provider = await load();
  const loop = [system, ask, step(call("toolu_a", "computer", { action: "screenshot" }), call("toolu_b", "type_text", { text: "Ada" })), result("toolu_a", "computer", "Screenshot taken.", true), result("toolu_b", "type_text", "Typed.")];
  const body = await claudeBody(provider.toCoreMessages(loop, "anthropic"));
  assert.equal(claudeRefusal(body), undefined);
  const after = body.messages.at(-1).content;
  assert.deepEqual(after.map((block) => block.type), ["tool_result", "tool_result", "text", "image"], "both results, then the picture with its line");
  assert.deepEqual(after.slice(0, 2).map((block) => block.tool_use_id), ["toolu_a", "toolu_b"]);
});

test("one call with a screenshot is sent as before", async () => {
  const provider = await load();
  const loop = [system, ask, step(call("toolu_a", "computer", { action: "screenshot" })), result("toolu_a", "computer", "Screenshot taken.", true), { role: "user", content: [{ type: "text", text: "Use my work email." }] }];
  const body = await claudeBody(provider.toCoreMessages(loop, "anthropic"));
  assert.equal(claudeRefusal(body), undefined);
  assert.deepEqual(body.messages.at(-1).content.map((block) => block.type), ["tool_result", "text", "image", "text"]);
});

test("a call that never answered (the run stopped mid-step) is answered as interrupted, and the conversation goes on", async () => {
  const provider = await load();
  const loop = [system, ask, step(call("toolu_a", "click", { x: 1, y: 2 }), call("toolu_b", "type_text", { text: "Ada" })), result("toolu_a", "click", "Clicked."), { role: "user", content: [{ type: "text", text: "Are you done?" }] }];
  const body = await claudeBody(provider.toCoreMessages(loop, "anthropic"));
  assert.equal(claudeRefusal(body), undefined);
  const after = body.messages.at(-1).content;
  assert.deepEqual(after.map((block) => block.type), ["tool_result", "tool_result", "text"]);
  assert.equal(after[1].tool_use_id, "toolu_b");
  assert.equal(after[1].is_error, true);
  assert.match(JSON.stringify(after[1].content), /interrupted/);
  // Two steps in a row with nothing between them: the first's call is answered in between.
  const twice = [system, ask, step(call("toolu_c", "click")), { role: "assistant", content: [{ type: "text", text: "Let me look again." }] }];
  assert.equal(claudeRefusal(await claudeBody(provider.toCoreMessages(twice, "anthropic"))), undefined);
});

test("a line the loop adds between a call and its result, and a result with no call, do not break the conversation", async () => {
  const provider = await load();
  const between = [system, ask, step(call("toolu_a", "click")), { role: "system", content: "Reminder: the person is watching." }, result("toolu_a", "click", "Clicked.")];
  const body = await claudeBody(provider.toCoreMessages(between, "anthropic"));
  assert.equal(claudeRefusal(body), undefined);
  assert.deepEqual(body.messages.at(-1).content.map((block) => block.type), ["tool_result", "text"]);
  const stray = [system, ask, result("toolu_gone", "click", "Clicked."), step(call("toolu_a", "click")), result("toolu_a", "click", "Clicked.")];
  assert.equal(claudeRefusal(await claudeBody(provider.toCoreMessages(stray, "anthropic"))), undefined);
});

test("the OpenAI wire is left exactly as it was", async () => {
  const provider = await load();
  const loop = [system, ask, step(call("toolu_a", "computer"), call("toolu_b", "type_text")), result("toolu_a", "computer", "Screenshot taken.", true), result("toolu_b", "type_text", "Typed.")];
  const out = provider.toCoreMessages(loop, "openai");
  assert.deepEqual(out.map((message) => message.role), ["system", "user", "assistant", "tool", "user", "tool"]);
});

test("a well-formed conversation is sent byte for byte as before, with no repair logged; a repair is logged", async () => {
  const provider = await load();
  const lines = [];
  provider.setModelCallLog((line) => lines.push(line));
  try {
    const loop = [system, ask, step(call("toolu_a", "click"), call("toolu_b", "type_text")), result("toolu_a", "click", "Clicked."), result("toolu_b", "type_text", "Typed."), step(call("toolu_c", "computer")), result("toolu_c", "computer", "Screenshot taken.", true), { role: "assistant", content: [{ type: "text", text: "Done." }] }];
    // The shape the conversion gave before: one message per result, the picture after its own result.
    const before = [
      { role: "system", content: "You fill in forms." },
      { role: "user", content: [{ type: "text", text: "Fill in the sign-up form." }] },
      { role: "assistant", content: [{ type: "text", text: "On it." }, call("toolu_a", "click"), call("toolu_b", "type_text")] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "toolu_a", toolName: "click", result: "Clicked." }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "toolu_b", toolName: "type_text", result: "Typed." }] },
      { role: "assistant", content: [{ type: "text", text: "On it." }, call("toolu_c", "computer")] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "toolu_c", toolName: "computer", result: "Screenshot taken." }] },
      { role: "user", content: [{ type: "text", text: "Image output of the tool call(s) above." }, { type: "image", image: PNG, mimeType: "image/png" }] },
      { role: "assistant", content: [{ type: "text", text: "Done." }] },
    ];
    assert.deepEqual(await claudeBody(provider.toCoreMessages(loop, "anthropic")), await claudeBody(before));
    assert.deepEqual(lines.filter((line) => line.includes("claude-tool-results")), []);
    provider.toCoreMessages([system, ask, step(call("toolu_a", "computer"), call("toolu_b", "type_text")), result("toolu_a", "computer", "Screenshot taken.", true)], "anthropic");
    assert.deepEqual(lines.filter((line) => line.includes("claude-tool-results")), ["[simeon] claude-tool-results repaired reordered=true interrupted=1 dropped=0"]);
  } finally {
    provider.setModelCallLog(null);
  }
});
