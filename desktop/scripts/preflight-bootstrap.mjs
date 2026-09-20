/**
 * Fail early, and say the actual thing.
 *
 * Packaging and verification both read the checksum-pinned 0.18.0 payload out
 * of `src/app/dist`, and several modules read it while they are being
 * imported. Skipping `npm run bootstrap` therefore does not produce a message
 * about bootstrap — it produces a raw ENOENT for a file nobody has heard of,
 * from a stack frame inside an audit script, after `npm run check` has already
 * spent a minute passing. That happened, on 19 September.
 */

import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The three the bootstrap script itself promises to leave behind. */
const REQUIRED = [
  "src/app/dist/electron-main/main.cjs",
  "src/app/dist/host/host-main.cjs",
  "src/app/dist/renderer/index.html",
];

const missing = [];
for (const relative of REQUIRED) {
  try {
    await access(path.join(repoRoot, relative));
  } catch {
    missing.push(relative);
  }
}

const [major] = process.versions.node.split(".").map(Number);
const problems = [];

if (missing.length > 0) {
  problems.push(
    `The checksum-pinned 0.18.0 payload is not here. Missing:\n` +
      missing.map((file) => `    ${file}`).join("\n") +
      `\n\n  Run:  npm run bootstrap\n` +
      `  It needs Grok Bot 0.18.0. Do not point GROK_BOT_018_APP at\n` +
      `  /Applications/Grok Bot.app unless plutil prints 0.18.0 — that copy\n` +
      `  is often a newer Grok Bot. Otherwise bootstrap downloads the pinned\n` +
      `  DMG. See docs/product/building-the-app.md.`,
  );
}

if (major !== 26) {
  problems.push(
    `Node ${process.versions.node} is not the pinned runtime (>=26.5.0 <27).\n` +
      `  The native parser packages are rebuilt against this ABI at package\n` +
      `  time, so a different major produces modules the app cannot load.\n` +
      `  In desktop/:  nvm use   (or fnm use)\n` +
      `  If that reports version 24, you are on a shell that walked up to the\n` +
      `  monorepo root .nvmrc, which pins 24 for clients/. desktop/.nvmrc pins\n` +
      `  26.5.0 — pull it, or run: nvm install 26.5.0 && nvm use 26.5.0`,
  );
}

if (problems.length > 0) {
  console.error(`\nCannot package yet.\n\n${problems.map((p) => `  ${p}`).join("\n\n")}\n`);
  process.exit(1);
}
