/** The GPU is on by default (24 September 2026); SAND_DISABLE_HWA=1 turns it off. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("main.ts disables hardware acceleration only under SAND_DISABLE_HWA=1", async () => {
  const main = await readFile(path.join(repoRoot, "source/electron-main/main.ts"), "utf8");
  assert.match(main, /if \(env\["SAND_DISABLE_HWA"\] === "1"\) \{\n\s*deps\.app\.disableHardwareAcceleration\(\);\n\s*deps\.app\.commandLine\.appendSwitch\("disable-gpu"\);/);
  assert.doesNotMatch(main, /env\["SAND_ENABLE_HWA"\] !== "1"/);
  assert.equal((main.match(/deps\.app\.disableHardwareAcceleration\(\)/g) ?? []).length, 1);
});
