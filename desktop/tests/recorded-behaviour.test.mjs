/**
 * Every part of the engine written down in `tests/recorded/` still behaves
 * as recorded (`tests/recorded/harness.mjs` says how a part is written down
 * and how its answers are kept).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { answerOf, buildModules, inSurroundings, measuring, readAnswers, recordedDir, recording, scenarioFiles, surfaceOf, tracked, writeAnswers } from "./recorded/harness.mjs";

test("recorded: a part is built here as the engine's own build makes it", async () => {
  const { ENGINE_BUILD, desktopRoot } = await import("./recorded/harness.mjs");
  const script = await readFile(path.join(desktopRoot, "scripts", "build-simeon.mjs"), "utf8");
  const process = script.slice(script.indexOf("async function bundleProcess"), script.indexOf("/**", script.indexOf("async function bundleProcess")));
  for (const line of [
    `platform: "${ENGINE_BUILD.platform}",`,
    `target: "${ENGINE_BUILD.target}",`,
    `format: "${ENGINE_BUILD.format}",`,
    "external: EXTERNAL,",
    `alias: { "jsonc-parser": "${ENGINE_BUILD.alias["jsonc-parser"]}" },`,
    `banner: { js: '${ENGINE_BUILD.banner.js}' },`,
    `"process.env.SIMEON_BUILD": JSON.stringify("clean-source"),`,
    `"import.meta.url": "__import_meta_url",`,
  ]) assert.ok(process.includes(line), `scripts/build-simeon.mjs no longer says \`${line}\`: tests/recorded/harness.mjs (ENGINE_BUILD) must follow it`);
  const listed = script.slice(script.indexOf("const EXTERNAL = ["), script.indexOf("];", script.indexOf("const EXTERNAL = [")));
  assert.deepEqual([...listed.matchAll(/"([^"]+)"/g)].map((found) => found[1]), ENGINE_BUILD.external, "the packages left outside the build are the engine build's");
});

/** The answers as they are written to the file: what is compared, order of keys included. */
const written = (value) => JSON.stringify(value, null, 1);

for (const file of await scenarioFiles()) {
  const part = await import(pathToFileURL(path.join(recordedDir, file)).href);
  test(`recorded: ${part.part} behaves as recorded`, async (t) => {
    const { load, coverage, dispose } = await buildModules(part.modules, { measure: measuring(part.part) });
    try {
      /** The part loaded afresh and every scenario asked once, in one set of surroundings. */
      const ask = (surroundings) =>
        inSurroundings(surroundings, async () => {
          const loaded = await load();
          const { modules, used } = tracked(loaded);
          const scenarios = {};
          for (const scenario of part.scenarios) {
            assert.ok(!(scenario.name in scenarios), `two scenarios are named "${scenario.name}"`);
            scenarios[scenario.name] = await answerOf(scenario, modules);
          }
          return { surface: surfaceOf(loaded), scenarios, used };
        });
      const { surface, scenarios, used } = await ask({});

      // Nothing of the part is left out without a reason.
      const skipped = part.skipped ?? {};
      const exported = Object.entries(surface).flatMap(([key, names]) => Object.keys(names).map((name) => `${key}.${name}`));
      assert.deepEqual(exported.filter((name) => !used.has(name) && !(name in skipped)), [], "every export is used by a scenario, or named in `skipped` with the reason");
      assert.deepEqual(Object.keys(skipped).filter((name) => !exported.includes(name)), [], "`skipped` names only what the part exports");

      if (measuring(part.part)) {
        // How much of the part's own code the scenarios ran, file by file.
        const own = part.covers ?? [`source/${part.part}/`];
        const files = Object.entries(await coverage()).filter(([file]) => own.some((prefix) => file === prefix || file.startsWith(prefix)));
        let pieces = 0;
        let never = 0;
        for (const [file, seen] of files) {
          pieces += seen.pieces;
          never += seen.never.count;
          t.diagnostic(`${file}: ${seen.pieces - seen.never.count} of ${seen.pieces} pieces ran${seen.never.count === 0 ? "" : `; never ran: ${seen.never.where.join(", ")}`}`);
        }
        t.diagnostic(`${part.part}: ${pieces - never} of ${pieces} pieces ran (${pieces === 0 ? 0 : Math.floor(((pieces - never) * 100) / pieces)}%) in ${files.length} files`);
      }

      // Asked again elsewhere: loaded afresh from another place, under the other platform's name, with another home and working folder.
      const elsewhere = await ask({ other: true });
      assert.equal(written(elsewhere.surface), written(surface), "the part exports the same wherever it is loaded");
      for (const [name, answer] of Object.entries(scenarios)) {
        assert.equal(
          written(elsewhere.scenarios[name]),
          written(answer),
          `"${name}" answers differently in other surroundings (a fresh load, the other platform's name, another home, working and temporary folder): set what the part looks at inside the scenario, or scrub it from what is returned`,
        );
      }

      const answers = { part: part.part, surface, scenarios };
      if (recording(part.part)) {
        await writeAnswers(part.part, answers);
        return;
      }

      const kept = await readAnswers(part.part);
      assert.ok(kept, `no answers are kept for ${part.part}: record them from the code as it is, before changing it (SIMEON_RECORD=${part.part})`);
      assert.equal(written(answers.surface), written(kept.surface), "the part exports what it exported when it was recorded");
      assert.deepEqual(Object.keys(answers.scenarios), Object.keys(kept.scenarios), "the scenarios are the ones recorded");
      for (const [name, answer] of Object.entries(answers.scenarios)) assert.equal(written(answer), written(kept.scenarios[name]), `"${name}" answers as recorded`);
    } finally {
      await dispose();
    }
  });
}
