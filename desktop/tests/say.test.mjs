/**
 * The engine's sentences the person reads as they come (20 October 2026,
 * docs/localization.md): in the person's language (`userLanguage`), English
 * when none is set or Simeon is not translated into it, every value in its
 * place, and each translation with every sentence of the English.
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
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const VALUE = /\{(\w+)\}/g;
const values = (text) => [...text.matchAll(VALUE)].map((m) => m[1]).sort();

test("each translation has every sentence, with the same values, in French typography", async () => {
  const en = await load("source/shared/words/en.ts", "words-en");
  const fr = await load("source/shared/words/fr.ts", "words-fr");
  try {
    const english = en.module.ENGLISH;
    const french = fr.module.FRENCH;
    assert.deepEqual(Object.keys(french).sort(), Object.keys(english).sort());
    for (const [key, text] of Object.entries(english)) {
      assert.ok(french[key].trim().length > 0, key);
      assert.deepEqual(values(french[key]), values(text), key);
      assert.doesNotMatch(french[key], /[  ][:;!?](\s|$)/, `${key}: a narrow no-break space before : ; ! ?`);
      assert.doesNotMatch(french[key], /'/, `${key}: the apostrophe is ’`);
    }
  } finally {
    await en.dispose();
    await fr.dispose();
  }
});

test("a sentence is the person's language, else English, with its values", async () => {
  const loaded = await load("source/shared/say.ts", "say");
  const en = await load("source/shared/words/en.ts", "say-en");
  const fr = await load("source/shared/words/fr.ts", "say-fr");
  try {
    const { say, SAY_LANGUAGES } = loaded.module;
    assert.deepEqual(SAY_LANGUAGES, ["en", "fr"]);
    const fill = (text, vals) => text.replace(VALUE, (whole, name) => (name in vals ? String(vals[name]) : whole));
    for (const [key, text] of Object.entries(en.module.ENGLISH)) {
      const vals = Object.fromEntries(values(text).map((name) => [name, `<${name}>`]));
      assert.equal(say(undefined, key, vals), fill(text, vals), key);
      assert.equal(say("en-GB", key, vals), fill(text, vals), key);
      assert.equal(say("ja", key, vals), fill(text, vals), `${key}: not translated yet, English`);
      assert.equal(say("fr-CA", key, vals), fill(fr.module.FRENCH[key], vals), key);
      for (const name of values(text)) assert.ok(say("fr", key, vals).includes(`<${name}>`), `${key}: {${name}}`);
    }
  } finally {
    await loaded.dispose();
    await en.dispose();
    await fr.dispose();
  }
});
