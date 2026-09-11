import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

/**
 * The runner and the desktop app must run the same engine. If they ever
 * drift, a person's assistant behaves one way on their computer and another
 * way overnight, which is the one thing the two-engine account may not do.
 * This test is the only thing stopping that, so it fails loudly.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const runnerPackage = path.join(here, '..', 'package.json');
const desktopPackage = path.join(here, '..', '..', 'desktop', 'package.json');

const read = (file: string): Record<string, any> =>
  JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, any>;

describe('the pinned engine', () => {
  test('is the same version the desktop app ships', () => {
    expect(fs.existsSync(desktopPackage), `${desktopPackage} is missing, so the pin cannot be checked`).toBe(true);
    const runner = read(runnerPackage).openclaw;
    const desktop = read(desktopPackage).openclaw;
    expect(runner?.version, 'runner/package.json has no openclaw.version').toBeTruthy();
    expect(desktop?.version, 'desktop/package.json has no openclaw.version').toBeTruthy();
    expect(runner.version).toBe(desktop.version);
  });

  test('comes from the same repository', () => {
    expect(read(runnerPackage).openclaw.repo).toBe(read(desktopPackage).openclaw.repo);
  });

  test('is the version the Dockerfile builds', () => {
    const dockerfile = fs.readFileSync(path.join(here, '..', 'Dockerfile'), 'utf8');
    const pinned = read(runnerPackage).openclaw as { version: string; repo: string };
    expect(dockerfile).toContain(`ARG OPENCLAW_VERSION=${pinned.version}`);
    expect(dockerfile).toContain(`ARG OPENCLAW_REPO=${pinned.repo}`);
  });
});
