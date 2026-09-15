import { app } from 'electron';
import fs from 'fs';
import path from 'path';

import { type BuildInfo, buildInfoFrom, DEV_BUILD } from '../shared/buildStamp/constants';

/**
 * The build stamp of the running app, read once from the packaged
 * `package.json`. From a checkout (`electron:dev`) the file has no stamp
 * and this says `dev`.
 */
let cached: BuildInfo | undefined;

export function readBuildInfo(): BuildInfo {
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8');
    cached = buildInfoFrom(JSON.parse(raw));
  } catch (error) {
    console.warn('[App] could not read the build stamp:', error);
    cached = DEV_BUILD;
  }
  return cached;
}
