import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

test("the brand pass renames every Grok Bot and New Bot in a chunk and counts them", async () => {
  const { patchOriginalBrandStrings } = await import(patchModule);
  const chunk = 'const xSe = "Grok Bot";a.jsx(h1,{children:"Meet Grok Bot"});t("Grok Bot\'s Computer");label:"New Bot";placeholder:"New Bot";cls:"sand-grok-bot-mark";x:"Create new Bot",y:"Search or create Bots",z:"Give each Bot a job",w:"Hidden Bots",v:"Bot",u:"Reset to the Bot";const Bot=new Bot(Bot.x,Bot);return Bot;const Bots=[];p:"Caisra\'s plugins"';
  const { source, counts } = patchOriginalBrandStrings(chunk);
  assert.equal(source, 'const xSe = "Simeon";a.jsx(h1,{children:"Meet Simeon"});t("Simeon\'s Computer");label:"New Agent";placeholder:"New Agent";cls:"sand-grok-bot-mark";x:"Create new Agent",y:"Search or create Agents",z:"Give each Agent a job",w:"Hidden Agents",v:"Agent",u:"Reset to the Agent";const Bot=new Bot(Bot.x,Bot);return Bot;const Bots=[];p:"Simeon\'s plugins"');
  assert.deepEqual(counts, { "Grok Bot": 3, "New Bot": 2, "Caisra": 1, "Bots": 2, "Bot": 4 });
  assert.match(source, /sand-grok-bot-mark/, "internal identifiers are untouched");
  const untouched = patchOriginalBrandStrings("nothing here");
  assert.equal(untouched.source, "nothing here");
});

test("the full patch renames the staged renderer and records what it changed, and refuses a renderer that never said Grok Bot", async () => {
  const { applyOriginalRendererRouterPatch, MARK_REPLACEMENTS, PALETTE_REPLACEMENTS } = await import(patchModule);
  const markAnchors = [...MARK_REPLACEMENTS, ...PALETTE_REPLACEMENTS].map(([, before]) => before).join(";");
  const source = await readFile(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs"), "utf8");
  const anchor = (name) => /const (\w+) = ('.*?');/.exec(source.split(`const ${name} = `)[1] == null ? "" : `const ${name} = ${source.split(`const ${name} = `)[1]}`)?.[2];
  const registry = JSON.parse(`"${anchor("REGISTRY_BEFORE").slice(1, -1).replace(/"/g, '\\"')}"`);
  const general = JSON.parse(`"${anchor("GENERAL_BEFORE").slice(1, -1).replace(/"/g, '\\"')}"`);
  const usage = JSON.parse(`"${anchor("USAGE_BEFORE").slice(1, -1).replace(/"/g, '\\"')}"`);
  const stage = await mkdtemp(path.join(os.tmpdir(), "caisra-brand-stage-"));
  try {
    const assets = path.join(stage, "dist", "renderer", "assets");
    await mkdir(assets, { recursive: true });
    await writeFile(path.join(assets, "index-abc.js"), `${registry};function Sa(s){};${general};${usage};${markAnchors};const xSe = "Grok Bot";const title="Meet Grok Bot";const n="New Bot";`);
    await writeFile(path.join(assets, "other-def.js"), 'const c="Grok Bot settings";');
    await writeFile(path.join(assets, "style.css"), '.x{content:"Grok Bot"}');
    await writeFile(path.join(stage, "dist", "renderer", "index.html"), "<title>Grok Bot</title>");
    const record = await applyOriginalRendererRouterPatch({ stageRoot: stage });
    assert.deepEqual(record.brand.totals, { "Grok Bot": 5, "New Bot": 1, "Caisra": 0, "Bots": 0, "Bot": 0 });
    assert.equal(record.brand.files.length, 4);
    assert.match(await readFile(path.join(assets, "index-abc.js"), "utf8"), /const xSe = "Simeon";const title="Meet Simeon";const n="New Agent";/);
    assert.match(await readFile(path.join(assets, "other-def.js"), "utf8"), /Simeon settings/);
    assert.match(await readFile(path.join(stage, "dist", "renderer", "index.html"), "utf8"), /<title>Simeon<\/title>/);
    assert.doesNotMatch(await readFile(path.join(assets, "index-abc.js"), "utf8"), /Grok Bot|New Bot/);
    const provenance = JSON.parse(await readFile(path.join(stage, "dist", "renderer-router-extension.json"), "utf8"));
    assert.ok(provenance.features.includes("brand-simeon"));
    // A renderer with no Grok Bot at all is not the pinned one.
    await writeFile(path.join(assets, "index-abc.js"), `${registry};function Sa(s){};${general};${usage};${markAnchors};`);
    await writeFile(path.join(assets, "other-def.js"), "");
    await writeFile(path.join(assets, "style.css"), "");
    await writeFile(path.join(stage, "dist", "renderer", "index.html"), "");
    await assert.rejects(() => applyOriginalRendererRouterPatch({ stageRoot: stage }), /name Grok Bot at least once/);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
});
