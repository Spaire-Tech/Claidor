import fs from 'node:fs/promises';

import { log, reasonOf } from './log.js';
import { start } from './loop.js';
import { readSettings } from './settings.js';

const main = async (): Promise<void> => {
  const settings = readSettings();

  // Fail here rather than on the first job: an image without an engine in
  // it can do nothing at all, and saying so at boot is what a deploy check
  // can see.
  await fs.access(`${settings.engineRoot}/openclaw.mjs`).catch(() => {
    throw new Error(`No engine at ${settings.engineRoot}. Expected openclaw.mjs there.`);
  });
  await fs.mkdir(settings.workRoot, { recursive: true });

  log.info(`${settings.runnerName} starting; Claidor at ${settings.apiBaseUrl}`);
  await start(settings);
};

main().catch((error) => {
  log.error(`the runner cannot start: ${reasonOf(error)}`);
  process.exitCode = 1;
});
