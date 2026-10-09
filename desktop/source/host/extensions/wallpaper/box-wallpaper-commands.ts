import { execFile } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { SIMEON_WALLPAPER_HEX } from "./simeon-wallpaper.generated.js";

export const SAND_WALLPAPER_COMMAND = "/usr/local/bin/sand-wallpaper";
export const SAND_WALLPAPER_TONE_SCRIPT = "/usr/local/bin/sand-wallpaper-tone.mjs";
export const X_SOCKET_DIR = "/tmp/.X11-unix";
export const COMMAND_TIMEOUT_MS = 10_000;
const X_SOCKET_NAME = /^X(\d+)$/;

/**
 * Simeon's wallpaper (9 October 2026, the founder: the photograph of a river
 * under a storm at sunset), written where the computer's own
 * `sand-wallpaper` reads it. That script takes its folder from
 * SAND_WALLPAPER_TONE_DIR and its last resort from SAND_WALLPAPER_FALLBACK
 * in both images: the earlier maker's (in service; it reads
 * `sand-wallpaper-02-<tone>.png`) and Simeon's (`box/`, `simeon-<tone>.png`).
 * Every tone is the same picture. A picture that can't be written or drawn
 * leaves the image's own wallpaper: the script falls back by itself.
 */
export const SIMEON_WALLPAPER_DIR = "/tmp/simeon-wallpaper";
export const WALLPAPER_FILE_NAMES: readonly string[] = ["a", "b", "c"].flatMap((tone) => [`sand-wallpaper-02-${tone}.png`, `simeon-${tone}.png`]);

/** The folder with the picture under every name, readable by the display's owner; false when it can't be (a link or a file in its place, no room). */
export function writeWallpaperFolder(dir: string, bytes: Uint8Array): boolean {
  try {
    const existing = lstatSync(dir, { throwIfNoEntry: false });
    if (existing != null && (existing.isSymbolicLink() || !existing.isDirectory())) return false;
    mkdirSync(dir, { recursive: true, mode: 0o755 });
    chmodSync(dir, 0o755);
    for (const name of WALLPAPER_FILE_NAMES) {
      const file = join(dir, name);
      const there = lstatSync(file, { throwIfNoEntry: false });
      if (there != null && !there.isFile()) return false;
      writeFileSync(file, bytes);
      chmodSync(file, 0o644);
    }
    return true;
  } catch {
    return false;
  }
}

/** What points `sand-wallpaper` at the folder, with the same picture as its last resort. */
export function wallpaperEnvironment(dir: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...base, SAND_WALLPAPER_TONE_DIR: dir, SAND_WALLPAPER_FALLBACK: join(dir, "simeon-b.png") };
}

export function parseTonePlan(stdout: string): { tone: string; msUntilNextBoundary: number } | undefined {
  const [tone, seconds, ...rest] = stdout.trim().split(/\s+/);
  if (tone === undefined || seconds === undefined || rest.length > 0 || !/^[a-z]+$/.test(tone) || !/^\d+$/.test(seconds)) return undefined;
  return { tone, msUntilNextBoundary: Number(seconds) * 1_000 };
}

export async function readLiveDisplays(socketDir: string): Promise<Array<{ display: string; uid: number; gid: number }>> {
  const entries = await readdir(socketDir).catch(() => []);
  const numbers = entries
    .map((entry) => X_SOCKET_NAME.exec(entry)?.[1])
    .filter((num): num is string => num !== undefined)
    .sort((a, b) => Number(a) - Number(b));
  const displays = [];
  for (const num of numbers) {
    const stats = lstatSync(join(socketDir, `X${num}`), { throwIfNoEntry: false });
    if (stats?.isSocket() !== true) continue;
    displays.push({ display: `:${num}`, uid: stats.uid, gid: stats.gid });
  }
  return displays;
}

type RunCommand = (file: string, args: readonly string[], options: { timeout: number; uid?: number; gid?: number; env?: NodeJS.ProcessEnv }) => Promise<{ stdout: string }>;

function defaultRunCommand(file: string, args: readonly string[], options: { timeout: number; uid?: number; gid?: number; env?: NodeJS.ProcessEnv }): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => execFile(file, args, options, (error, stdout) => (error == null ? resolve({ stdout }) : reject(error))));
}

export function asDisplayOwner(owner: { uid: number; gid: number }, getuid = process.getuid?.bind(process), getgid = process.getgid?.bind(process)): {} | { uid: number; gid: number } {
  const self = getuid?.();
  return self !== 0 || (owner.uid === self && owner.gid === getgid?.()) ? {} : owner;
}

export function createBoxWallpaperCommands(options: {
  readonly settingsPath: string;
  readonly log: (message: string) => void;
  readonly nodePath?: string;
  readonly toneScriptPath?: string;
  readonly wallpaperCommandPath?: string;
  readonly xSocketDir?: string;
  readonly runCommand?: RunCommand;
  readonly readDisplays?: (directory: string) => Promise<Array<{ display: string; uid: number; gid: number }>>;
  readonly exists?: (path: string) => boolean;
  /** Where Simeon's picture is written; null paints the image's own. */
  readonly wallpaperDir?: string | null;
  readonly wallpaperBytes?: Uint8Array;
  readonly writeWallpaper?: (dir: string, bytes: Uint8Array) => boolean;
}) {
  const nodePath = options.nodePath ?? process.execPath;
  const toneScriptPath = options.toneScriptPath ?? SAND_WALLPAPER_TONE_SCRIPT;
  const wallpaperCommandPath = options.wallpaperCommandPath ?? SAND_WALLPAPER_COMMAND;
  const socketDir = options.xSocketDir ?? X_SOCKET_DIR;
  const run = options.runCommand ?? defaultRunCommand;
  const exists = options.exists ?? existsSync;
  const wallpaperDir = options.wallpaperDir === undefined ? SIMEON_WALLPAPER_DIR : options.wallpaperDir;
  const writeWallpaper = options.writeWallpaper ?? writeWallpaperFolder;
  let wallpaperFailed = false;

  /** The folder, written the first time and again whenever it has gone (a restarted box empties /tmp). */
  function wallpaperFolder(): string | null {
    if (wallpaperDir == null || wallpaperFailed) return null;
    if (exists(join(wallpaperDir, "simeon-b.png")) && exists(join(wallpaperDir, "sand-wallpaper-02-b.png"))) return wallpaperDir;
    if (writeWallpaper(wallpaperDir, options.wallpaperBytes ?? Buffer.from(SIMEON_WALLPAPER_HEX, "hex"))) return wallpaperDir;
    wallpaperFailed = true;
    options.log(`wallpaper: Simeon's picture could not be written to ${wallpaperDir}; the image's own is painted`);
    return null;
  }

  return {
    isAvailable: exists(toneScriptPath) && exists(wallpaperCommandPath),
    async resolvePlan() {
      const result = await run(nodePath, [toneScriptPath, options.settingsPath], { timeout: COMMAND_TIMEOUT_MS }).catch((error) => {
        options.log(`wallpaper: tone helper failed (${error instanceof Error ? error.message : String(error)})`);
        return undefined;
      });
      if (result === undefined) return undefined;
      const plan = parseTonePlan(result.stdout);
      if (plan === undefined) options.log("wallpaper: tone helper printed an unusable plan");
      return plan;
    },
    async paint() {
      try {
        const folder = wallpaperFolder();
        const env = folder == null ? {} : { env: wallpaperEnvironment(folder) };
        for (const owner of await (options.readDisplays ?? readLiveDisplays)(socketDir)) {
          await run(wallpaperCommandPath, ["paint", owner.display], { timeout: COMMAND_TIMEOUT_MS, ...asDisplayOwner(owner), ...env }).catch((error) =>
            options.log(`wallpaper: paint of ${owner.display} failed (${error instanceof Error ? error.message : String(error)})`),
          );
        }
      } catch (error) {
        options.log(`wallpaper: reading live displays failed (${error instanceof Error ? error.message : String(error)})`);
      }
    },
  };
}
