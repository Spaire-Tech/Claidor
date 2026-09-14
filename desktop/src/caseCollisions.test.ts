import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

/**
 * No two files may differ only in case.
 *
 * Linux tells `Apps.tsx` and `apps.ts` apart. macOS does not, and macOS
 * is what we ship. On a Mac, `import './Apps'` looks for `Apps.ts`, finds
 * `apps.ts`, and resolves the component import to the logic module — so
 * the build dies with "has no exported member", pointing at a line that
 * is perfectly correct.
 *
 * This is worth a test rather than a note because the failure is
 * invisible on the machine most of this is written on and fatal on the
 * machine it runs on: it cost a twenty-minute build on the founder's Mac
 * to find three of them at once.
 *
 * Two shapes are caught. Names that collide outright, and TypeScript
 * modules whose stems collide — `Foo.tsx` beside `foo.ts` are different
 * files, but `./Foo` and `./foo` are the same import.
 */

const SRC = path.resolve(__dirname);
const SKIP = new Set(['node_modules', '.git', 'dist', 'dist-electron']);
const MODULE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

interface Collision {
  directory: string;
  names: string[];
}

function findCollisions(directory: string): Collision[] {
  const found: Collision[] = [];
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => !SKIP.has(entry.name));

  const byLowerName = new Map<string, Set<string>>();
  const byLowerStem = new Map<string, Set<string>>();

  for (const entry of entries) {
    const lower = entry.name.toLowerCase();
    if (!byLowerName.has(lower)) byLowerName.set(lower, new Set());
    byLowerName.get(lower)!.add(entry.name);

    if (entry.isFile()) {
      const extension = path.extname(entry.name);
      if (MODULE_EXTENSIONS.has(extension)) {
        const stem = path.basename(entry.name, extension).toLowerCase();
        if (!byLowerStem.has(stem)) byLowerStem.set(stem, new Set());
        byLowerStem.get(stem)!.add(entry.name);
      }
    }
  }

  const relative = path.relative(SRC, directory) || '.';
  for (const names of byLowerName.values()) {
    if (names.size > 1) found.push({ directory: relative, names: [...names].sort() });
  }
  for (const names of byLowerStem.values()) {
    // `foo.ts` and `foo.tsx` would be a different mistake and TypeScript
    // catches it already; only differing case is this one.
    const stems = new Set([...names].map(name => path.basename(name, path.extname(name))));
    if (stems.size > 1) found.push({ directory: relative, names: [...names].sort() });
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      found.push(...findCollisions(path.join(directory, entry.name)));
    }
  }
  return found;
}

describe('file names', () => {
  test('no two differ only in case, because macOS cannot tell them apart', () => {
    const collisions = findCollisions(SRC).map(one => `${one.directory}: ${one.names.join(' / ')}`);
    expect(collisions.sort()).toEqual([]);
  });
});
