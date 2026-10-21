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

/** Each translation's table and how its language is written. */
const TRANSLATIONS = [
  {
    language: "fr",
    entry: "source/shared/words/fr.ts",
    table: "FRENCH",
    writing(key, text) {
      assert.doesNotMatch(text, /[  ][:;!?](\s|$)/, `${key}: a narrow no-break space before : ; ! ?`);
      assert.doesNotMatch(text, /'/, `${key}: the apostrophe is ’`);
    },
  },
  {
    language: "es",
    entry: "source/shared/words/es.ts",
    table: "SPANISH",
    writing(key, text) {
      assert.doesNotMatch(text, /[ «»]/, `${key}: no French spaces or quotes in Spanish`);
      assert.doesNotMatch(text, /'/, `${key}: no apostrophe in Spanish`);
      assert.doesNotMatch(text, /\s[:;!?]/, `${key}: no space before : ; ! ?`);
      // A question or an exclamation opens with ¿ or ¡ (a "?" inside a value, like a URL, is not one).
      for (const sentence of text.split(/(?<=[.?!])\s+/)) {
        if (/\?$/.test(sentence)) assert.match(sentence, /¿/, `${key}: ¿ opens the question`);
        if (/!$/.test(sentence)) assert.match(sentence, /¡/, `${key}: ¡ opens the exclamation`);
      }
    },
  },
];

for (const { language, entry, table, writing } of TRANSLATIONS) {
  test(`${language}: every sentence of the English, with the same values, written the ${language} way`, async () => {
    const en = await load("source/shared/words/en.ts", `words-en-${language}`);
    const words = await load(entry, `words-${language}`);
    try {
      const english = en.module.ENGLISH;
      const translated = words.module[table];
      assert.deepEqual(Object.keys(translated).sort(), Object.keys(english).sort());
      for (const [key, text] of Object.entries(english)) {
        assert.ok(translated[key].trim().length > 0, key);
        assert.deepEqual(values(translated[key]), values(text), key);
        writing(key, translated[key]);
      }
    } finally {
      await en.dispose();
      await words.dispose();
    }
  });
}

test("a sentence is the person's language, else English, with its values", async () => {
  const loaded = await load("source/shared/say.ts", "say");
  const en = await load("source/shared/words/en.ts", "say-en");
  const fr = await load("source/shared/words/fr.ts", "say-fr");
  const es = await load("source/shared/words/es.ts", "say-es");
  try {
    const { say, SAY_LANGUAGES } = loaded.module;
    assert.deepEqual(SAY_LANGUAGES, ["en", "fr", "es"]);
    const fill = (text, vals) => text.replace(VALUE, (whole, name) => (name in vals ? String(vals[name]) : whole));
    for (const [key, text] of Object.entries(en.module.ENGLISH)) {
      const vals = Object.fromEntries(values(text).map((name) => [name, `<${name}>`]));
      assert.equal(say(undefined, key, vals), fill(text, vals), key);
      assert.equal(say("en-GB", key, vals), fill(text, vals), key);
      assert.equal(say("ja", key, vals), fill(text, vals), `${key}: not translated yet, English`);
      assert.equal(say("fr-CA", key, vals), fill(fr.module.FRENCH[key], vals), key);
      assert.equal(say("es-MX", key, vals), fill(es.module.SPANISH[key], vals), key);
      for (const name of values(text)) {
        assert.ok(say("fr", key, vals).includes(`<${name}>`), `${key}: {${name}}`);
        assert.ok(say("es", key, vals).includes(`<${name}>`), `${key}: {${name}}`);
      }
    }
  } finally {
    await loaded.dispose();
    await en.dispose();
    await fr.dispose();
    await es.dispose();
  }
});
