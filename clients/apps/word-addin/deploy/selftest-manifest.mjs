#!/usr/bin/env node
/**
 * Fill in the self-test manifest with the origin the pane is served from.
 *
 * Sideloading is the one step nobody can do for the person with the real
 * Word, so the file they get handed has to be complete: one XML file, no
 * placeholders, no instructions inside it that they have to act on. Getting
 * that wrong costs a round trip and, since the whole exercise is ten
 * minutes of somebody's afternoon, a round trip is most of the budget.
 *
 *   node deploy/selftest-manifest.mjs https://claidor-addin.vercel.app
 *
 * Writes dist/manifest.selftest.xml, beside the build it points at, so the
 * manifest and the bundle it names cannot drift apart.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const PLACEHOLDER = "https://YOUR-DOMAIN.example.com";
/** Any surviving mention of the example host means a substitution was missed. */
const ANY_PLACEHOLDER = /YOUR-[A-Z-]*DOMAIN/;

const origin = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!origin) {
  console.error("usage: node deploy/selftest-manifest.mjs <https://origin>");
  process.exit(1);
}
if (!origin.startsWith("https://")) {
  // Office refuses a task pane served over plain HTTP everywhere except
  // localhost, and Word on the web refuses it there too. Failing here is
  // much cheaper than failing in somebody else's Word.
  console.error(`Origin must be https://, got: ${origin}`);
  process.exit(1);
}

const source = resolve(root, "manifest.selftest.xml");
const target = resolve(root, "dist", "manifest.selftest.xml");

if (!existsSync(resolve(root, "dist", "selftest.html"))) {
  console.error("dist/selftest.html is missing. Run `pnpm build` first.");
  process.exit(1);
}

const filled = readFileSync(source, "utf8").replaceAll(PLACEHOLDER, origin);
if (ANY_PLACEHOLDER.test(filled)) {
  console.error("A placeholder survived the substitution; refusing to write.");
  process.exit(1);
}

writeFileSync(target, filled);
console.log(`Wrote ${target}`);
console.log(`Task pane: ${origin}/selftest.html`);
