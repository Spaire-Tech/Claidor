/**
 * Where the pinned 0.18.0 DMG is fetched from, and the rule that keeps a
 * mirror safe: every source is held to `dmgSha256`, so the digest is the
 * authority and the host is not.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { dmgSha256, dmgUrl, dmgUrls } from "../scripts/lib/config.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the documented source is tried first and mirrors only after it", () => {
  assert.equal(dmgUrls[0], dmgUrl, "the project's own URL must lead");
  assert.ok(dmgUrls.length > 1, "a single source is how bootstrap became unusable");
  for (const url of dmgUrls.slice(1)) assert.match(url, /^https:\/\//);
});

test("GROK_BOT_DMG_URL is honoured ahead of everything", async () => {
  // Read through a fresh module instance: the list is frozen at import.
  const { dmgUrls: overridden } = await import(
    `${path.join(repoRoot, "scripts/lib/config.mjs")}?probe=${Date.now()}`
  );
  assert.deepEqual(overridden[0], process.env.GROK_BOT_DMG_URL?.trim() || dmgUrl);
});

test("every source ends at the same pinned artifact path", () => {
  for (const url of dmgUrls) {
    assert.match(url, /Grok_Bot_0\.18\.0\.dmg$/, `${url} does not name the pinned artifact`);
  }
});

test("the pin is a full lowercase sha256 and is the documented one", () => {
  assert.match(dmgSha256, /^[0-9a-f]{64}$/);
  assert.equal(dmgSha256, "a253ccd8aab01e083f9812a0264354c5034d8ba7f0610bbb557e82ae77d203eb");
});

test("bootstrap checks every candidate against the pin before accepting it", async () => {
  const bootstrap = await readFile(path.join(repoRoot, "scripts/bootstrap-runtime.mjs"), "utf8");
  // A mirror is only safe because of this comparison. If the loop ever
  // accepts a download without it, the mirrors become a way to substitute the
  // product's entire UI.
  assert.match(bootstrap, /for \(const url of dmgUrls\)/);
  assert.match(bootstrap, /if \(digest !== dmgSha256\)/);
  assert.ok(
    bootstrap.indexOf("if (digest !== dmgSha256)") < bootstrap.indexOf("await rename(partial, cachedDmg)"),
    "the digest must be checked before the file is promoted to the cache",
  );
  // And the local archive still wins over any network source.
  assert.ok(
    bootstrap.indexOf("await copyFile(archivedDmg, cachedDmg)") < bootstrap.indexOf("for (const url of dmgUrls)"),
    "the hash-pinned local archive must still be preferred over the network",
  );
});
