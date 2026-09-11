import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * The person's memory, laid out as the engine's workspace and read back
 * again. The names are fixed by `docs/maties/cloud.md`, section 3:
 * `MEMORY.md`, `USER.md`, and `memory/YYYY-MM-DD.md`. Nothing else is a
 * memory file, so no name out of Claidor can point outside the workspace.
 */

const DAILY_NOTE = /^memory\/\d{4}-\d{2}-\d{2}\.md$/;

export interface MemoryFile {
  name: string;
  content: string;
  version: number;
}

export interface OutgoingMemoryFile {
  name: string;
  content: string;
  base_version: number;
}

export const isMemoryName = (name: string): boolean =>
  name === 'MEMORY.md' || name === 'USER.md' || DAILY_NOTE.test(name);

/**
 * The files the cloud may write back.
 *
 * The durable facts and the daily notes are lists, and lists merge by
 * union, so both sides can write them without losing anything. `USER.md` is
 * a single document whose owner is the app — the person writes their
 * profile at setup — so a run at three in the morning never replaces it.
 */
export const isCloudWritable = (name: string): boolean =>
  name === 'MEMORY.md' || DAILY_NOTE.test(name);

export class BadMemoryName extends Error {
  constructor(name: string) {
    super(`Claidor sent a memory file named "${name}", which is not a memory file name.`);
    this.name = 'BadMemoryName';
  }
}

/** Today's daily note, in the person's own zone when Claidor gave us one. */
export const dailyNoteName = (now: Date, timeZone?: string): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  });
  return `memory/${formatter.format(now)}.md`;
};

/** Write the bundle into a fresh workspace, refusing any name that is not one. */
export const layOutMemory = async (workspace: string, files: readonly MemoryFile[]): Promise<void> => {
  for (const file of files) {
    if (!isMemoryName(file.name)) throw new BadMemoryName(file.name);
  }
  await fs.mkdir(path.join(workspace, 'memory'), { recursive: true });
  for (const file of files) {
    await fs.writeFile(path.join(workspace, file.name), file.content, 'utf8');
  }
};

/**
 * What changed in the workspace while the engine worked: the files whose
 * text differs from what we laid out, plus any daily note the run created.
 * Each carries the version it started from, so Claidor can merge rather
 * than overwrite.
 */
export const collectMemoryChanges = async (
  workspace: string,
  laidOut: readonly MemoryFile[],
): Promise<OutgoingMemoryFile[]> => {
  const before = new Map(laidOut.map((file) => [file.name, file]));
  const names = new Set<string>(laidOut.filter((file) => isCloudWritable(file.name)).map((f) => f.name));

  for (const entry of await readDirectory(path.join(workspace, 'memory'))) {
    const name = `memory/${entry}`;
    if (isCloudWritable(name)) names.add(name);
  }
  if (await exists(path.join(workspace, 'MEMORY.md'))) names.add('MEMORY.md');

  const changes: OutgoingMemoryFile[] = [];
  for (const name of [...names].sort()) {
    const content = await readIfPresent(path.join(workspace, name));
    // A file the run deleted is not a deletion we forward: memory is never
    // taken away quietly. Claidor keeps what it holds.
    if (content === null) continue;
    const was = before.get(name);
    if (was && was.content === content) continue;
    changes.push({ name, content, base_version: was?.version ?? 0 });
  }
  return changes;
};

const readDirectory = async (dir: string): Promise<string[]> => {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
};

const readIfPresent = async (file: string): Promise<string | null> => {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
};

const exists = async (file: string): Promise<boolean> => (await readIfPresent(file)) !== null;
