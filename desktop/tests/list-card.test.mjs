/**
 * The list card (24 October 2026): ShowList posts three to eight things of
 * one kind as a row each (source/host/runner/tools/list-card-tool.ts,
 * source/shared/list-card.ts); the apps draw it (SimeonCore's ListCard.swift).
 * Money and any other figure are told apart, addresses are https only, a
 * picture from the web is kept on the computer, and the card carries itself
 * in words for an app from before it.
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

test("ShowList posts the list card: money apart from other figures, https only, pictures kept on the computer", async () => {
  const tool = await load("source/host/runner/tools/list-card-tool.ts", "list-card-tool");
  try {
    let message;
    const kept = [];
    const show = tool.module.createShowListTool({
      emitCard: (posted) => { message = posted; return "t4s2"; },
      persistPicture: async (url) => { kept.push(url); return url.includes("broken") ? undefined : { url: "file:///Users/a/.simeon/attachments/lamb.jpg" }; },
    });
    assert.equal(show.name, "ShowList");
    const shown = await run(show, {
      title: "Coût matières par portion",
      subtitle: "Prix d'oct. 2025 à août 2026",
      items: [
        { title: "Thiéboudiène", amount: "717–805 FCFA", value: "ignored", tag: "à valider", tone: "pending" },
        { title: "Mafé", amount: "966 FCFA", tag: "ok", tone: "neutral" },
        { title: "Rosemary lamb", detail: "Lemon, garlic, rosemary.", value: "2 h", image_url: "https://example.com/lamb.jpg", url: "https://example.com/lamb" },
        { title: "Potatoes", image_url: "https://example.com/broken.jpg", url: "http://example.com/potatoes" },
        { title: "Carrots", image_url: "http://example.com/carrots.jpg" },
      ],
    });
    assert.match(shown, /list card is in the chat \(entry t4s2\)/);
    assert.match(shown, /Don't repeat its rows in text/);
    assert.equal(message.type, "list");
    assert.equal(message.title, "Coût matières par portion");
    assert.equal(message.subtitle, "Prix d'oct. 2025 à août 2026");
    assert.deepEqual(message.items[0], { title: "Thiéboudiène", amount: "717–805 FCFA", tag: "à valider", tone: "pending" }, "money wins over another figure");
    assert.deepEqual(message.items[1], { title: "Mafé", amount: "966 FCFA", tag: "ok" }, "grey is the default tone, left out");
    assert.deepEqual(message.items[2], { title: "Rosemary lamb", detail: "Lemon, garlic, rosemary.", value: "2 h", imageUrl: "file:///Users/a/.simeon/attachments/lamb.jpg", url: "https://example.com/lamb" }, "a picture kept on the computer");
    assert.deepEqual(message.items[3], { title: "Potatoes", imageUrl: "https://example.com/broken.jpg" }, "a picture that can't be kept stays at its address; no plain http page");
    assert.deepEqual(message.items[4], { title: "Carrots" }, "no plain http picture");
    assert.deepEqual(kept, ["https://example.com/lamb.jpg", "https://example.com/broken.jpg"]);
    assert.equal(message.content, [
      "Coût matières par portion",
      "Prix d'oct. 2025 à août 2026",
      "- Thiéboudiène: 717–805 FCFA (à valider)",
      "- Mafé: 966 FCFA (ok)",
      "- Rosemary lamb: 2 h. Lemon, garlic, rosemary.",
      "- Potatoes",
      "- Carrots",
    ].join("\n"), "the card in words, for an app from before it");

    await assert.rejects(run(show, { title: "Too few", items: [{ title: "One" }, { title: "Two" }] }), /at least 3/, "one or two things are written, not carded");
  } finally {
    await tool.dispose();
  }
});
