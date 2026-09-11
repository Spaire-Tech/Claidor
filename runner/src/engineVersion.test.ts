import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

/**
 * The runner and the desktop app must run the same engine. If they ever
 * drift, a person's assistant behaves one way on their computer and another
 * way overnight, which is the one thing the two-engine account may not do.
 * This test is the only thing stopping that, so it fails loudly.
 *
 * The same tag is only half of it. The engine the desktop ships is the
 * upstream source plus the patches in `desktop/scripts/patches/<tag>/`, so
 * the second half of this file follows those patches all the way to the
 * container Render runs: into the image, out of CI when one is added, and
 * into the blueprint that deploys it.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..', '..');
const runnerPackage = path.join(here, '..', 'package.json');
const desktopPackage = path.join(repoRoot, 'desktop', 'package.json');
const dockerfilePath = path.join(here, '..', 'Dockerfile');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'runner_image.yml');
const blueprintPath = path.join(repoRoot, 'render.yaml');

const read = (file: string): Record<string, any> =>
  JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, any>;

const text = (file: string): string => fs.readFileSync(file, 'utf8');

const pinnedVersion = (): string => read(runnerPackage).openclaw.version as string;

/**
 * The patches for the pinned version, listed exactly as
 * `desktop/scripts/apply-openclaw-patches.cjs` lists them: every `.patch` in
 * the version's directory, sorted by name. If this list and the script's ever
 * differ, the tests below are checking something other than what is applied.
 */
const patchFiles = (): string[] => {
  const dir = path.join(repoRoot, 'desktop', 'scripts', 'patches', pinnedVersion());
  return fs.readdirSync(dir).filter((name) => name.endsWith('.patch')).sort();
};

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
    const dockerfile = text(dockerfilePath);
    const pinned = read(runnerPackage).openclaw as { version: string; repo: string };
    expect(dockerfile).toContain(`ARG OPENCLAW_VERSION=${pinned.version}`);
    expect(dockerfile).toContain(`ARG OPENCLAW_REPO=${pinned.repo}`);
  });
});

describe('the pinned engine is patched like the desktop one', () => {
  test('the pinned version has patches, and they are the desktop\'s', () => {
    const dir = path.join(repoRoot, 'desktop', 'scripts', 'patches', pinnedVersion());
    expect(fs.existsSync(dir), `${dir} is missing: the pinned version has no patch directory`).toBe(true);
    expect(patchFiles().length, `${dir} holds no .patch file`).toBeGreaterThan(0);
  });

  test('every one of them reaches the image', () => {
    const dockerfile = text(dockerfilePath);

    // The Dockerfile takes the patch directory whole rather than naming
    // files, so a patch added on the desktop side is carried in without
    // anybody editing this repository's build. Find what it copies, then
    // check that every patch really is underneath it.
    const copied = /^COPY\s+(desktop\/scripts\/patches\S*)\s+\S+\s*$/m.exec(dockerfile);
    expect(copied, 'runner/Dockerfile copies nothing from desktop/scripts/patches').not.toBeNull();

    const source = copied![1]!;
    const unreached = patchFiles().filter(
      (name) => !`desktop/scripts/patches/${pinnedVersion()}/${name}`.startsWith(`${source}/`),
    );
    expect(unreached, `these patches are outside what the Dockerfile copies (${source})`).toEqual([]);
  });

  test('the image applies them with the desktop\'s own script', () => {
    const dockerfile = text(dockerfilePath);
    // Borrowed, not reimplemented: the script decides the order, refuses a
    // patch that no longer applies, and checks the source afterwards. A
    // second implementation in this repository would be a second set of bugs.
    expect(dockerfile).toContain('COPY desktop/scripts/apply-openclaw-patches.cjs');
    expect(dockerfile).toMatch(/node\s+\S*apply-openclaw-patches\.cjs/);
    // It reads the pinned version from the desktop's package.json, so that
    // file has to be in the image too or the patch step picks no directory.
    expect(dockerfile).toContain('COPY desktop/package.json');
  });

  test('adding a patch rebuilds the image', () => {
    expect(fs.existsSync(workflowPath), `${workflowPath} is missing: nothing builds the image`).toBe(true);
    // A patch is a change to the cloud engine even though nothing under
    // runner/ moved. Without this path in the workflow's filter the next
    // patch would sit in the repository and never reach Render.
    expect(text(workflowPath)).toContain('desktop/scripts/patches/**');
  });

  test('Render deploys the image that workflow publishes', () => {
    const image = /ghcr\.io\/[a-z0-9._-]+\/claidor-maty-runner/.exec(text(workflowPath));
    expect(image, 'the workflow names no claidor-maty-runner image on ghcr.io').not.toBeNull();

    const blueprint = text(blueprintPath);
    expect(blueprint, 'render.yaml does not deploy the published image').toContain(`url: ${image![0]}:`);
    // Building on Render is what this replaced: its build machine never
    // finishes the engine, and a build there would apply no patches at all.
    expect(blueprint).not.toContain('./runner/Dockerfile');
  });
});
