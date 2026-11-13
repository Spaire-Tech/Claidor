/**
 * Every part of the engine written down in `tests/recorded/` still behaves
 * as recorded (`tests/recorded/harness.mjs` says how a part is written down
 * and how its answers are kept).
 */
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { answerOf, loadModules, measuring, readAnswers, recordedDir, recording, scenarioFiles, surfaceOf, tracked, writeAnswers } from "./recorded/harness.mjs";

/** The answers as they are written to the file: what is compared, order of keys included. */
const written = (value) => JSON.stringify(value, null, 1);

for (const file of await scenarioFiles()) {
  const part = await import(pathToFileURL(path.join(recordedDir, file)).href);
  test(`recorded: ${part.part} behaves as recorded`, async (t) => {
    const { loaded, coverage, dispose } = await loadModules(part.modules, { measure: measuring(part.part) });
    try {
      const { modules, used } = tracked(loaded);
      const surface = surfaceOf(loaded);
      const scenarios = {};
      for (const scenario of part.scenarios) {
        assert.ok(!(scenario.name in scenarios), `two scenarios are named "${scenario.name}"`);
        scenarios[scenario.name] = await answerOf(scenario, modules);
      }

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

      const answers = { part: part.part, surface, scenarios };
      if (recording(part.part)) {
        // An answer that changes from one run to the next is no record: asked twice before it is kept.
        const again = tracked(loaded).modules;
        for (const scenario of part.scenarios) {
          assert.equal(written(await answerOf(scenario, again)), written(scenarios[scenario.name]), `"${scenario.name}" answers differently when asked twice: fix what changes (a time, a path, an id) before recording`);
        }
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
