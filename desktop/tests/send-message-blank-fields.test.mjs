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
// now dropped before validation, and so is a filled foreign field: since
// 25 September `type` decides, and fields of the other types are dropped
// whatever they hold (the third test below).

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadSchema() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-send-message-schema-"));
  const output = path.join(temporary, "schema.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/host/runner/tools/send-message-schema.ts")], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

const BLANK_WIDGET = { prompt: "", helpText: "", options: [{ label: "", value: "", description: "", style: "default" }], allowCustom: false, dismissOnMoveOn: false };

test("a text message with a blank widget, secret or images riding on it is a text message", async () => {
  const loaded = await loadSchema();
  try {
    const { sendMessageParameters, isBlankField } = loaded.module;
    assert.equal(isBlankField({ prompt: "", options: [{ label: "" }] }), true);
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
      // the same fill, as the model actually sends it
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

// The second run, with the log widened: the model pads every slot with "x".
const PADDED_CALL = { type: "text", content: "Hey! How’s it going?", url: "", images: [], alt: "", reply_to: "", channel: "", widget: { prompt: "x", helpText: "x", options: [{ label: "x", value: "x", description: "x", style: "default" }], allowCustom: false, dismissOnMoveOn: false }, bcId: "", secret: { label: "x", description: "x", connector: "x", field: "x" } };

test("type decides: fields of the other types are dropped whatever they hold, and the typed message is sent", async () => {
  const loaded = await loadSchema();
  try {
    const { sendMessageParameters } = loaded.module;
    const text = sendMessageParameters.parse(PADDED_CALL);
    // `channel` is dropped while every connector is coming soon (25 September, ledger F-055).
    assert.deepEqual(text, { type: "text", content: "Hey! How’s it going?", reply_to: "", images: undefined });
    const widget = sendMessageParameters.parse({ ...PADDED_CALL, content: "", widget: { prompt: "Which account?", options: [{ label: "Work" }] }, type: "widget" });
    assert.equal(widget.widget.prompt, "Which account?");
    assert.equal(widget.content, undefined);
    const half = sendMessageParameters.safeParse({ type: "widget", widget: { prompt: "Which account?", options: [{ label: "" }] } });
    assert.equal(half.success, false, "a half-filled widget of the right type is a bad widget");
    const empty = sendMessageParameters.safeParse({ type: "text", content: "", widget: { prompt: "Which account?", options: [{ label: "Work" }] } });
    assert.equal(empty.success, false, "a text with no content is still not a message");
  } finally {
    await loaded.dispose();
  }
});
