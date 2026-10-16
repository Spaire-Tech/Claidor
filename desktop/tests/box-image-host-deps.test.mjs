/**
 * Our cloud computer image (box/) carries every package the engine's build
 * leaves outside host-main.cjs (16 October 2026). The computer receives
 * host-main.cjs alone and finds those packages through NODE_PATH, which is
 * /home/box/deps, installed from box/deps. piscina was missing there, and the
 * first computer made on E2B from our image stopped at start-up, every few
 * seconds, with "Cannot find module 'piscina'".
 *
 * A package added to EXTERNAL in scripts/simeon-ignition-activation.mjs (the
 * build `npm run package` ships) needs a line in box/deps/package.json at the
 * version desktop/package.json pins, then `npm install --package-lock-only`
 * in box/deps, and the E2B template rebuilt (box/e2b/build-and-check.sh).
 * electron is the one exception: the engine never loads it on a computer.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relative) => readFileSync(path.join(repoRoot, relative), "utf8");

function externalsOf(relative) {
  const match = /const EXTERNAL = \[([\s\S]*?)\];/.exec(read(relative));
  assert.ok(match, `${relative} has an EXTERNAL list`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map(([, name]) => name);
}

const NOT_ON_THE_COMPUTER = new Set(["electron"]);

test("every package the shipped engine leaves outside its bundle is in the box image, at the desktop's version", () => {
  const external = externalsOf("desktop/scripts/simeon-ignition-activation.mjs");
  assert.ok(external.includes("piscina"), "the engine still requires piscina by name");
  const desktop = JSON.parse(read("desktop/package.json"));
  const pinned = { ...desktop.devDependencies, ...desktop.dependencies };
  const box = JSON.parse(read("box/deps/package.json")).dependencies;
  const lock = JSON.parse(read("box/deps/package-lock.json"));

  for (const name of external.filter((name) => !NOT_ON_THE_COMPUTER.has(name))) {
    assert.ok(pinned[name], `desktop/package.json pins ${name}`);
    assert.equal(box[name], pinned[name], `box/deps/package.json has ${name} at ${pinned[name]}`);
    assert.equal(lock.packages?.[""]?.dependencies?.[name], pinned[name], `box/deps/package-lock.json was regenerated for ${name}`);
    assert.equal(lock.packages?.[`node_modules/${name}`]?.version, pinned[name], `box/deps/package-lock.json installs ${name} ${pinned[name]}`);
  }
});

test("the clean-source build leaves the same packages outside as the shipped one", () => {
  assert.deepEqual(
    externalsOf("desktop/scripts/build-simeon.mjs").sort(),
    externalsOf("desktop/scripts/simeon-ignition-activation.mjs").sort(),
  );
});
