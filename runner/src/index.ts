import fs from 'node:fs/promises';

import { ChannelHolder, createChannelsApi } from './channels/holder.js';
import { log, reasonOf } from './log.js';
import { start } from './loop.js';
import { readSettings } from './settings.js';

const main = async (): Promise<void> => {
  const settings = readSettings();

  await fs.mkdir(settings.workRoot, { recursive: true });

  log.info(`${settings.runnerName} starting; API at ${settings.apiBaseUrl}`);
  // The agents' own bots, beside the jobs: they listen on their own sockets and never wait on a job.
  if (settings.channels) {
    new ChannelHolder({ api: createChannelsApi(settings.apiBaseUrl, settings.runnerToken), log: (line) => log.info(line) }).start();
  } else {
    log.info('channels: off (SIMEON_RUNNER_CHANNELS)');
  }
  await start(settings);
};

main().catch((error) => {
  log.error(`the runner cannot start: ${reasonOf(error)}`);
  process.exitCode = 1;
});
