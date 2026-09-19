/**
 * Moving a file between the person's machine and the box.
 *
 * The decision this file enforces: **the person's files live on their machine,
 * and a copy to the box is deliberate, never ambient.** The engine's own remote
 * sandbox backend does the opposite — it tars the whole workspace over on first
 * use (`ssh-backend.ts`) — and the box backend deliberately does not, so this
 * is the only road a file takes.
 *
 * Everything here is a guard. The copy itself is two lines; the rest is
 * refusing copies that would surprise someone.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

/** Above this, a copy is almost certainly a mistake or a directory. */
export const MAX_COPY_BYTES = 100 * 1024 * 1024;

/**
 * Where a copy lands when the person names no path, from the spec
 * (`sources/grok-bot-agent-computer.md` §4.2: "Default landing
 * `/workspace/uploads` or chosen box path").
 *
 * It matters that this is its own folder: files the person handed over, mixed
 * in with the agent's own working files, is how custody stops being legible to
 * either of them.
 */
export const BOX_UPLOADS_SUBDIR = 'uploads';

export type CustodyRefusal = { ok: false; reason: string };
export type CopyPlan = { ok: true; localPath: string; boxPath: string; bytes: number };

/**
 * Where inside the box a copy is allowed to land.
 *
 * Without this, `../../etc/passwd` as a destination writes outside the agent's
 * workspace, and a path the person never looked at gets overwritten.
 */
export function resolveBoxPath(
  workspaceRoot: string,
  requested: string,
): { ok: true; path: string } | CustodyRefusal {
  const trimmed = (requested ?? '').trim();
  if (!trimmed) {
    return { ok: false, reason: 'No destination in the box was given.' };
  }
  const root = path.posix.normalize(workspaceRoot).replace(/\/+$/, '');
  const joined = path.posix.normalize(
    trimmed.startsWith('/') ? trimmed : path.posix.join(root, trimmed),
  );
  if (joined !== root && !joined.startsWith(`${root}/`)) {
    return {
      ok: false,
      reason: `A file can only be copied into the box's workspace (${root}).`,
    };
  }
  return { ok: true, path: joined };
}

/**
 * Check a copy TO the box before making it.
 *
 * A directory is refused rather than silently flattened: "copy my project" is
 * a different decision from "copy this file", and it is not one to guess at.
 */
export async function planCopyToBox(params: {
  localPath: string;
  boxPath: string;
  workspaceRoot: string;
  stat?: (p: string) => Promise<{ isFile(): boolean; isDirectory(): boolean; size: number }>;
}): Promise<CopyPlan | CustodyRefusal> {
  const localPath = (params.localPath ?? '').trim();
  if (!localPath) {
    return { ok: false, reason: 'No file was chosen.' };
  }
  if (!path.isAbsolute(localPath)) {
    return { ok: false, reason: 'Choose a file by its full path.' };
  }

  const destination = resolveBoxPath(
    params.workspaceRoot,
    params.boxPath || path.posix.join(BOX_UPLOADS_SUBDIR, path.basename(localPath)),
  );
  if (!destination.ok) {
    return destination;
  }

  let stats;
  try {
    stats = await (params.stat ?? ((p: string) => fs.stat(p)))(localPath);
  } catch {
    return { ok: false, reason: `There is no file at ${localPath}.` };
  }
  if (stats.isDirectory()) {
    return { ok: false, reason: 'That is a folder. Copy files one at a time.' };
  }
  if (!stats.isFile()) {
    return { ok: false, reason: 'That is not a file.' };
  }
  if (stats.size > MAX_COPY_BYTES) {
    return {
      ok: false,
      reason: `That file is ${formatBytes(stats.size)}. The limit for a copy is ${
        formatBytes(MAX_COPY_BYTES)
      }.`,
    };
  }

  return { ok: true, localPath, boxPath: destination.path, bytes: stats.size };
}

/**
 * Check a copy FROM the box before making it.
 *
 * An existing file is never overwritten without being asked: a copy back is
 * usually a new version of something, and losing the old one silently is the
 * kind of thing nobody forgives.
 */
export async function planCopyFromBox(params: {
  boxPath: string;
  localPath: string;
  workspaceRoot: string;
  overwrite?: boolean;
  exists?: (p: string) => Promise<boolean>;
}): Promise<{ ok: true; boxPath: string; localPath: string } | CustodyRefusal> {
  const source = resolveBoxPath(params.workspaceRoot, params.boxPath);
  if (!source.ok) {
    return source;
  }
  const localPath = (params.localPath ?? '').trim();
  if (!localPath || !path.isAbsolute(localPath)) {
    return { ok: false, reason: 'Choose where to put it by its full path.' };
  }

  if (!params.overwrite) {
    const exists = params.exists ?? (async (p: string) => {
      try {
        await fs.access(p);
        return true;
      } catch {
        return false;
      }
    });
    if (await exists(localPath)) {
      return { ok: false, reason: `There is already a file at ${localPath}.` };
    }
  }

  return { ok: true, boxPath: source.path, localPath };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}
