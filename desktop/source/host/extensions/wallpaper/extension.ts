import { realClock } from "../../../internal/scheduling.js";
import { defineHostExtension } from "../../../internal/host-extensions.js";
import { HostExtensions } from "../extension-ids.generated.js";
import { DOCK_ICONS_DIR, createDisplayWatch, dockLauncherDirs, refreshDocks, removeRefreshItems, writeFolderIcon } from "./box-folder-icon.js";
import { X_SOCKET_DIR, createBoxWallpaperCommands, readLiveDisplays } from "./box-wallpaper-commands.js";
import { WallpaperToneScheduler } from "./wallpaper-service.js";

interface WallpaperSettings { getSettingsPath(): string; subscribeToUserTimeZone(listener: () => void): () => void; }

/** How often the host looks for a screen that came up since (an agent's own window). */
export const DISPLAY_WATCH_MS = 10_000;
/** A new screen is painted when seen and again this long after: its own start paints the image's wallpaper as it comes up. */
export const NEW_DISPLAY_REPAINT_MS = 20_000;
/** A new icon is shown to the docks already running this long after it is written: past the five seconds in which their icon theme would not look at its folders again. */
export const DOCK_REFRESH_DELAY_MS = 6_000;

export const wallpaperExtension = defineHostExtension<unknown, { log(message: string): void }>({
  id: HostExtensions.Wallpaper,
  dependencies: [HostExtensions.Settings],
  start: (context) => {
    const settings = context.deps[HostExtensions.Settings] as WallpaperSettings;
    const log = (message: string) => context.host.log(message);
    const commands = createBoxWallpaperCommands({ settingsPath: settings.getSettingsPath(), log });
    if (!commands.isAvailable) return { isEnabled: false };
    const scheduler = new WallpaperToneScheduler({ clock: realClock, resolvePlan: () => commands.resolvePlan(), paint: () => commands.paint(), subscribeToTimeZoneChange: (listener) => settings.subscribeToUserTimeZone(listener), log });
    const wakes = new Set<{ dispose(): void }>();
    const later = (delayMs: number, callback: () => void) => {
      const wake = realClock.schedule(delayMs, () => {
        wakes.delete(wake);
        callback();
      });
      wakes.add(wake);
    };
    // The dock's folder icon: the docks are root's, so only a host running as root can give them one. New, it is shown to
    // the docks already running; a moment's item a stopped host left behind goes first.
    if (process.getuid?.() === 0) {
      removeRefreshItems(dockLauncherDirs());
      const written = writeFolderIcon(DOCK_ICONS_DIR);
      if (written === false) log(`folder icon: could not be written to ${DOCK_ICONS_DIR}; the dock keeps its own`);
      else if (written > 0) {
        log(`folder icon: wrote ${written} files to ${DOCK_ICONS_DIR}`);
        later(DOCK_REFRESH_DELAY_MS, () => void refreshDocks(dockLauncherDirs()).then((docks) => log(`folder icon: shown to the running docks (${docks} item folders)`)).catch(() => undefined));
      }
    }
    // The desktop can come up after the host: paint again half a minute and three minutes in, or Simeon's wallpaper waits for the next tone.
    for (const delayMs of [30_000, 180_000]) later(delayMs, () => void commands.paint());
    // A screen that comes up later (an agent's own window) gets Simeon's wallpaper within seconds, not at the next tone, hours away.
    const watch = createDisplayWatch(() => readLiveDisplays(X_SOCKET_DIR));
    let stopped = false;
    const look = (): void => {
      void watch.newDisplays().then((fresh) => {
        if (stopped) return;
        if (fresh.length > 0) {
          log(`wallpaper: new screen ${fresh.join(", ")}; painting it`);
          void commands.paint();
          later(NEW_DISPLAY_REPAINT_MS, () => void commands.paint());
        }
        later(DISPLAY_WATCH_MS, look);
      });
    };
    look();
    context.onStop(() => {
      stopped = true;
      scheduler.dispose();
      for (const wake of wakes) wake.dispose();
      wakes.clear();
    });
    scheduler.start();
    return { isEnabled: true };
  },
});
