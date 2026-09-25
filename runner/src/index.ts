import fs from 'node:fs/promises';

import { log, reasonOf } from './log.js';
import { start } from './loop.js';
import { readSettings } from './settings.js';

const main = async (): Promise<void> => {
  const settings = readSettings();

  await fs.mkdir(settings.workRoot, { recursive: true });

  log.info(`${settings.runnerName} starting; Claidor at ${settings.apiBaseUrl}`);
  await start(settings);
};

main().catch((error) => {
  log.error(`the runner cannot start: ${reasonOf(error)}`);
  process.exitCode = 1;
});
