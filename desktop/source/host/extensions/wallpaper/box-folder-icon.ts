import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { FOLDER_ICON_PNG_HEX, FOLDER_ICON_SVG_HEX } from "./folder-icon.generated.js";

/**
 * The dock's folder icon (26 October 2026, the founder: "something like a
 * mac folder"). The computers in service run the earlier maker's image:
 * its dock (Plank, run by root) shows the file manager (Thunar) under the
 * icon its desktop file names, `org.xfce.thunar`, from the hicolor theme.
 * Ours goes under the same name in root's own icon folder, which the theme
 * reads before the system's, at every size the system has and as SVG. A
 * dock that starts takes it; a dock already running is made to look again
 * (`refreshDocks`). Written when it is missing or differs, so a restarted
 * computer costs nothing. Simeon's own image (`box/`) has no dock.
 */
export const DOCK_ICONS_DIR = "/root/.local/share/icons/hicolor";
export const FILE_MANAGER_ICON = "org.xfce.thunar";
/** Where the docks keep their items: each screen's dock (`--name dock1`) watches `<name>/launchers`. */
export const DOCK_SETTINGS_DIR = "/root/.config/plank";
/** The item shown for a moment to make the docks look their icons up again, and what it launches (the file manager's settings, under the same icon). */
export const REFRESH_ITEM = "simeon-refresh.dockitem";
export const REFRESH_LAUNCHER = "/usr/share/applications/thunar-settings.desktop";
/** How long the item stays: long enough for every dock to draw it. */
export const REFRESH_SHOWN_MS = 4_000;

/** Each file of the icon: its place under the icon folder, and its bytes. */
export function folderIconFiles(): Array<{ path: string; bytes: Buffer }> {
  return [
    ...Object.entries(FOLDER_ICON_PNG_HEX).map(([size, hex]) => ({ path: join(`${size}x${size}`, "apps", `${FILE_MANAGER_ICON}.png`), bytes: Buffer.from(hex, "hex") })),
    { path: join("scalable", "apps", `${FILE_MANAGER_ICON}.svg`), bytes: Buffer.from(FOLDER_ICON_SVG_HEX, "hex") },
  ];
}

/** Writes the icon under `dir` where it is missing or differs: how many files were written, or false when one can't be (a link in the way, no room). */
export function writeFolderIcon(dir: string, files = folderIconFiles()): number | false {
  let written = 0;
  try {
    for (const file of files) {
      const target = join(dir, file.path);
      const there = lstatSync(target, { throwIfNoEntry: false });
      if (there != null && !there.isFile()) return false;
      if (there != null && readFileSync(target).equals(file.bytes)) continue;
      mkdirSync(join(target, ".."), { recursive: true, mode: 0o755 });
      writeFileSync(target, file.bytes);
      chmodSync(target, 0o644);
      written += 1;
    }
    return written;
  } catch {
    return false;
  }
}

/** Each dock's item folder. */
export function dockLauncherDirs(root = DOCK_SETTINGS_DIR): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name, "launchers"))
      .filter((dir) => existsSync(dir));
  } catch {
    return [];
  }
}

/**
 * A running dock looks an icon up only for an item it has not drawn yet:
 * an item shown for a moment and taken back makes it look again, and every
 * item under the file manager's icon takes the new one, in its place
 * (checked with Plank 0.11 on a real display, 26 October 2026: writing the
 * icon alone, or touching the file manager's desktop file, changed
 * nothing). How many folders it went into; none when the launcher is not on
 * this computer.
 */
export async function refreshDocks(dirs: string[], wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), launcher = REFRESH_LAUNCHER): Promise<number> {
  if (dirs.length === 0 || !existsSync(launcher)) return 0;
  const items = dirs.map((dir) => join(dir, REFRESH_ITEM));
  try {
    for (const item of items) writeFileSync(item, `[PlankDockItemPreferences]\nLauncher=file://${launcher}\n`);
    await wait(REFRESH_SHOWN_MS);
  } finally {
    removeRefreshItems(dirs);
  }
  return items.length;
}

/** The moment's item taken back, and one a stopped host left behind. */
export function removeRefreshItems(dirs: string[]): void {
  for (const dir of dirs) rmSync(join(dir, REFRESH_ITEM), { force: true });
}

/**
 * The screens that came up since the last look (26 October 2026: an
 * agent's own window, `:2`, `:3`…, showed the image's grey wallpaper until
 * the next tone, hours away): the first look only learns what is there.
 */
export function createDisplayWatch(readDisplays: () => Promise<Array<{ display: string }>>) {
  let known: Set<string> | undefined;
  return {
    async newDisplays(): Promise<string[]> {
      const now = (await readDisplays().catch(() => [])).map((owner) => owner.display);
      const fresh = known == null ? [] : now.filter((display) => !known!.has(display));
      known = new Set(now);
      return fresh;
    },
  };
}
