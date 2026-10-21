/**
 * The connectors list the apps show, in the person's language (20 October
 * 2026, docs/localization.md): every connector's description and every group
 * in French, the English catalog unchanged, and the window on the web, which
 * names no language, English.
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
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

/** French typography: a narrow no-break space before : ; ! ?, the apostrophe ’, « » for quotes. */
function assertFrench(where, text) {
  assert.ok(typeof text === "string" && text.trim().length > 0, `${where}: no French`);
  assert.doesNotMatch(text, /[  ][:;!?](\s|$)/, `${where}: a narrow no-break space before : ; ! ?`);
  assert.doesNotMatch(text, /['"]/, `${where}: the apostrophe is ’, quotes are « »`);
}

test("every connector and every group has its French, and no French is for a connector the catalog lacks", async () => {
  const catalog = await load("source/shared/node/vendor-mcp/catalog.ts", "catalog-en");
  const words = await load("source/shared/words/areas/catalog.ts", "catalog-fr");
  try {
    const { VENDOR_MCP_CONNECTORS, VENDOR_MCP_GROUP } = catalog.module;
    const { CATALOG_FR, CATALOG_GROUPS_FR } = words.module;
    const ids = VENDOR_MCP_CONNECTORS.map((item) => item.id);
    assert.deepEqual(Object.keys(CATALOG_FR).sort(), [...ids].sort());
    assert.deepEqual(Object.keys(CATALOG_GROUPS_FR).sort(), Object.keys(VENDOR_MCP_GROUP).sort());
    for (const [id, text] of Object.entries(CATALOG_FR)) assertFrench(id, text);
    for (const [key, text] of Object.entries(CATALOG_GROUPS_FR)) assertFrench(key, text);
  } finally {
    await catalog.dispose();
    await words.dispose();
  }
});

test("the catalog answered in French: descriptions, groups and Coming soon; English and the web window as before", async () => {
  const loaded = await load("source/shared/node/vendor-mcp/marketplace.ts", "catalog-language");
  const words = await load("source/shared/words/areas/catalog.ts", "catalog-language-fr");
  try {
    const { vendorCatalogInLanguage, appComingSoon, vendorConnectorToPlugin } = loaded.module;
    const { CATALOG_FR, CATALOG_GROUPS_FR } = words.module;
    const gmail = { id: "gmail", name: "Gmail", category: "Mail & Calendar", description: "Search, read, draft, and manage email." };
    const view = (item) => {
      const plugin = vendorConnectorToPlugin(item);
      return { id: plugin.pluginId, name: plugin.name, displayName: plugin.displayName, description: plugin.description, category: plugin.category, connectors: plugin.connectors, ...(plugin.comingSoon ? { comingSoon: true } : {}) };
    };
    const soon = appComingSoon({ ...gmail, appsToolkit: "gmail" });
    assert.equal(soon.description, "Coming soon. Search, read, draft, and manage email.", "the English as before");
    const own = { id: "acme-internal", name: "acme", description: "Our own server.", category: "Developer" };
    const views = [view(gmail), view(soon), own];
    const before = JSON.stringify(views);

    for (const language of [undefined, null, "", "en", "en-GB", "ja"]) {
      assert.deepEqual(vendorCatalogInLanguage(views, language), views, String(language));
    }
    const french = vendorCatalogInLanguage(views, "fr-FR");
    assert.equal(JSON.stringify(views), before, "the cached views are not changed");
    assert.equal(french[0].description, CATALOG_FR.gmail);
    assert.equal(french[0].category, CATALOG_GROUPS_FR.MailCalendar);
    assert.deepEqual(french[0].connectors, [{ name: "Gmail", description: CATALOG_FR.gmail }]);
    assert.equal(french[0].name, "gmail", "ids and names stay");
    assert.equal(french[0].displayName, "Gmail");
    assert.equal(french[1].description, `Bientôt disponible. ${CATALOG_FR.gmail}`);
    assert.equal(french[1].comingSoon, true);
    assert.deepEqual(french[2], own, "the person's own server is not the catalog's");
  } finally {
    await loaded.dispose();
    await words.dispose();
  }
});

/** Spanish writing: no French spaces or quotes, no apostrophe, “ ” for quotes, ¿ and ¡ opening. */
function assertSpanish(where, text) {
  assert.ok(typeof text === "string" && text.trim().length > 0, `${where}: no Spanish`);
  assert.doesNotMatch(text, /[ «»'"]/, `${where}: no French spaces or quotes, no apostrophe, quotes are “ ”`);
  assert.doesNotMatch(text, /\s[:;!?]/, `${where}: no space before : ; ! ?`);
  if (/\?/.test(text)) assert.match(text, /¿/, `${where}: ¿ opens the question`);
}

test("every connector and every group has its Spanish, and no Spanish is for a connector the catalog lacks", async () => {
  const catalog = await load("source/shared/node/vendor-mcp/catalog.ts", "catalog-en-es");
  const words = await load("source/shared/words/areas/catalog.ts", "catalog-es");
  try {
    const { VENDOR_MCP_CONNECTORS, VENDOR_MCP_GROUP } = catalog.module;
    const { CATALOG_ES, CATALOG_GROUPS_ES } = words.module;
    const ids = VENDOR_MCP_CONNECTORS.map((item) => item.id);
    assert.deepEqual(Object.keys(CATALOG_ES).sort(), [...ids].sort());
    assert.deepEqual(Object.keys(CATALOG_GROUPS_ES).sort(), Object.keys(VENDOR_MCP_GROUP).sort());
    for (const [id, text] of Object.entries(CATALOG_ES)) assertSpanish(id, text);
    for (const [key, text] of Object.entries(CATALOG_GROUPS_ES)) assertSpanish(key, text);
  } finally {
    await catalog.dispose();
    await words.dispose();
  }
});

test("the catalog answered in Spanish: descriptions, groups and Coming soon", async () => {
  const loaded = await load("source/shared/node/vendor-mcp/marketplace.ts", "catalog-language-es-run");
  const words = await load("source/shared/words/areas/catalog.ts", "catalog-language-es");
  try {
    const { vendorCatalogInLanguage, appComingSoon, vendorConnectorToPlugin } = loaded.module;
    const { CATALOG_ES, CATALOG_GROUPS_ES } = words.module;
    const gmail = { id: "gmail", name: "Gmail", category: "Mail & Calendar", description: "Search, read, draft, and manage email." };
    const view = (item) => {
      const plugin = vendorConnectorToPlugin(item);
      return { id: plugin.pluginId, name: plugin.name, displayName: plugin.displayName, description: plugin.description, category: plugin.category, connectors: plugin.connectors, ...(plugin.comingSoon ? { comingSoon: true } : {}) };
    };
    const soon = appComingSoon({ ...gmail, appsToolkit: "gmail" });
    const views = [view(gmail), view(soon)];
    const spanish = vendorCatalogInLanguage(views, "es-419");
    assert.equal(spanish[0].description, CATALOG_ES.gmail);
    assert.equal(spanish[0].category, CATALOG_GROUPS_ES.MailCalendar);
    assert.deepEqual(spanish[0].connectors, [{ name: "Gmail", description: CATALOG_ES.gmail }]);
    assert.equal(spanish[0].displayName, "Gmail", "names stay");
    assert.equal(spanish[1].description, `Próximamente. ${CATALOG_ES.gmail}`);
  } finally {
    await loaded.dispose();
    await words.dispose();
  }
});

/** The languages after Spanish (21 October 2026), by their table's suffix. */
const LATER = [["de", "DE"], ["nl", "NL"], ["it", "IT"], ["pt-BR", "PT_BR"], ["sv", "SV"], ["pl", "PL"], ["tr", "TR"]];

test("every connector and every group has its words in each later language, read through the catalog", async () => {
  const catalog = await load("source/shared/node/vendor-mcp/catalog.ts", "catalog-en-later");
  const words = await load("source/shared/words/areas/catalog.ts", "catalog-later");
  const loaded = await load("source/shared/node/vendor-mcp/marketplace.ts", "catalog-language-later-run");
  try {
    const { VENDOR_MCP_CONNECTORS, VENDOR_MCP_GROUP } = catalog.module;
    const { vendorCatalogInLanguage } = loaded.module;
    const ids = VENDOR_MCP_CONNECTORS.map((item) => item.id);
    const gmail = { id: "gmail", description: "Search, read, draft, and manage email.", category: "Mail & Calendar" };
    for (const [language, suffix] of LATER) {
      const descriptions = words.module[`CATALOG_${suffix}`];
      const groups = words.module[`CATALOG_GROUPS_${suffix}`];
      assert.deepEqual(Object.keys(descriptions).sort(), [...ids].sort(), language);
      assert.deepEqual(Object.keys(groups).sort(), Object.keys(VENDOR_MCP_GROUP).sort(), language);
      for (const text of [...Object.values(descriptions), ...Object.values(groups)]) {
        assert.ok(text.trim().length > 0, language);
        assert.doesNotMatch(text, /[ «»']/, `${language}: no French spaces or quotes, no straight apostrophe`);
        assert.doesNotMatch(text, /\s[:;!?]/, `${language}: no space before : ; ! ?`);
      }
      const [view] = vendorCatalogInLanguage([gmail], language);
      assert.equal(view.description, descriptions.gmail, language);
      assert.equal(view.category, groups.MailCalendar, language);
    }
    const [portugal] = vendorCatalogInLanguage([gmail], "pt-PT");
    assert.equal(portugal.description, words.module.CATALOG_PT_BR.gmail, "Portugal's Portuguese reads Brazil's");
  } finally {
    await catalog.dispose();
    await words.dispose();
    await loaded.dispose();
  }
});
