import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// 23 September 2026, read off the box's host log after "hi" to a fresh
// agent: the model greeted with a type:text SendMessage that also carried a
// widget object of empty strings, the schema refused the whole call
// ("Invalid arguments: widget: widget is only valid with type:widget …
// Nothing was sent. Re-send …", or the widget's own minLength errors), and
// the model re-sent the same call thirty times in a row. Blank fields are
// now dropped before validation. A filled foreign field is still refused,
// because that one the model does fix when told.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadSchema() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-send-message-schema-"));
  const output = path.join(temporary, "schema.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/host/runner/tools/send-message-schema.ts")], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

const BLANK_WIDGET = { prompt: "", helpText: "", options: [{ label: "", value: "", description: "" }], allowCustom: false };

test("a text message with a blank widget, secret or images riding on it is a text message", async () => {
  const loaded = await loadSchema();
  try {
    const { sendMessageParameters, isBlankField } = loaded.module;
    assert.equal(isBlankField(BLANK_WIDGET), true);
    assert.equal(isBlankField({ prompt: "Which one?", options: [{ label: "A" }] }), false);
    const parsed = sendMessageParameters.parse({
      type: "text",
      content: "Hey, I’m Chief of Staff.",
      url: "",
      alt: "",
      reply_to: "",
      channel: "",
      images: [{ url: "", alt: "" }],
      widget: BLANK_WIDGET,
      bcId: "",
      secret: { label: "", description: "", connector: "", field: "" },
    });
    assert.equal(parsed.type, "text");
    assert.equal(parsed.content, "Hey, I’m Chief of Staff.");
    assert.equal(parsed.widget, undefined);
    assert.equal(parsed.secret, undefined);
    assert.equal(parsed.images, undefined);
  } finally {
    await loaded.dispose();
  }
});

test("a filled widget riding on a text message is still refused, with the re-send instruction", async () => {
  const loaded = await loadSchema();
  try {
    const result = loaded.module.sendMessageParameters.safeParse({
      type: "text",
      content: "Which account?",
      widget: { prompt: "Which account?", options: [{ label: "Work" }, { label: "Personal" }] },
    });
    assert.equal(result.success, false);
    assert.match(result.error.errors.map((issue) => issue.message).join("\n"), /widget is only valid with type:widget/);
    const widget = loaded.module.sendMessageParameters.safeParse({ type: "widget", widget: { prompt: "Which account?", options: [{ label: "Work" }] } });
    assert.equal(widget.success, true);
    const half = loaded.module.sendMessageParameters.safeParse({ type: "widget", widget: { prompt: "Which account?", options: [{ label: "" }] } });
    assert.equal(half.success, false, "a half-filled widget is a bad widget, not a blank one");
  } finally {
    await loaded.dispose();
  }
});
