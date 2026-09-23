import { cpSync, existsSync, lstatSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  resolveSandDataRootOverride,
  resolveSandUserDataDir,
  SAND_DATA_ROOT_ENV,
  SAND_USER_DATA_DIR_ENV,
} from "../../host/host-paths.js";
import { applyStartupDataRootMigration, resolveExistingSandProductionRootDir, type DataRootSettlement } from "./startup-data-root-migration.js";
import { applyWindowsUserDataMigration, isWindowsUpdatedLaunch } from "./windows-user-data-migration.js";

export const STRANDED_USER_DATA_REASONS = new Set([
  "canonical-marked",
  "canonical-unsafe",
  "conflict-preserved",
  "legacy-unsafe",
  "migration-failed",
]);

export const STRANDED_DATA_ROOT_REASONS = new Set([
  "canonical-conflict",
  "canonical-marked",
  "legacy-unsafe",
  "live-legacy-host",
  "migration-failed",
  "unknown-legacy-writer",
]);

export interface DesktopBootstrapApp {
  readonly isPackaged: boolean;
  setPath(name: "userData" | "sessionData", path: string): void;
  getPath(name: "appData" | "userData"): string;
}

export interface DesktopUserDataBootstrapOptions {
  readonly isLabBuild: boolean;
  readonly app: DesktopBootstrapApp;
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly cwd?: string;
  reportFailureClass?(surface: "startup", operation: "user-data-settlement", reason: string): void;
}

/** The productName the app carried until 22 September 2026, and so the folder it kept its data in. */
export const PREVIOUS_USER_DATA_NAME = "Grok Bot";
/** Chromium's caches: rebuilt on demand, never worth copying. */
const USER_DATA_CACHE_ENTRIES = new Set(["Cache", "Code Cache", "GPUCache", "DawnCache", "DawnGraphiteCache", "DawnWebGPUCache", "blob_storage", "Crashpad", "logs"]);
/**
 * Chromium's single-instance lock: three symlinks that name the running
 * process and its socket. They belong to whichever process made them and
 * mean nothing in another folder; a copied one would point a fresh Simeon
 * at Grok Bot's process. Measured 23 September 2026 on the founder's Mac:
 * the three in Simeon's folder were Simeon's own (its pid, made at its
 * launch), so the copy had not left any behind there; this keeps it so.
 */
export const USER_DATA_SINGLETON_ENTRIES = new Set(["SingletonLock", "SingletonSocket", "SingletonCookie"]);

export interface UserDataRenameMigration {
  readonly from: string;
  readonly to: string;
  readonly outcome: "copied" | "already-there" | "nothing-to-copy" | "same-folder" | "failed";
  readonly error?: string;
}

/**
 * The app was named Grok Bot in Electron's eyes until 22 September 2026, so
 * its sign-in, secrets and persistence lived in Grok Bot's own folder,
 * shared with the real Grok Bot when both were installed. Now that it is
 * Simeon, the first launch copies that folder once, so nobody signs in
 * again. Copied, not moved: the other app may still be using it.
 */
export function migrateUserDataFromPreviousName(options: {
  readonly userDataDir: string;
  readonly previousName?: string;
  readonly exists?: (path: string) => boolean;
  readonly copy?: (from: string, to: string) => void;
}): UserDataRenameMigration {
  const to = options.userDataDir;
  const from = join(dirname(to), options.previousName ?? PREVIOUS_USER_DATA_NAME);
  const exists = options.exists ?? ((path: string) => { try { return lstatSync(path).isDirectory(); } catch { return false; } });
  if (basename(to) === basename(from)) return { from, to, outcome: "same-folder" };
  if (exists(to)) return { from, to, outcome: "already-there" };
  if (!exists(from)) return { from, to, outcome: "nothing-to-copy" };
  const copy = options.copy ?? ((source: string, target: string) => cpSync(source, target, {
    recursive: true,
    errorOnExist: false,
    filter: (path) => path === source || !(USER_DATA_CACHE_ENTRIES.has(basename(path)) || USER_DATA_SINGLETON_ENTRIES.has(basename(path))),
  }));
  try {
    copy(from, to);
    return { from, to, outcome: "copied" };
  } catch (error) {
    return { from, to, outcome: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

export function bootstrapDesktopUserData(options: DesktopUserDataBootstrapOptions): string | null {
  const argv = options.argv ?? process.argv;
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const isolatedUserDataDir = resolveSandUserDataDir(argv, env, options.cwd ?? process.cwd());
  if (isolatedUserDataDir != null) {
    env[SAND_USER_DATA_DIR_ENV] = isolatedUserDataDir;
    options.app.setPath("userData", isolatedUserDataDir);
    options.app.setPath("sessionData", isolatedUserDataDir);
    console.log(`[sand] using isolated user-data dir: ${isolatedUserDataDir}`);
    return isolatedUserDataDir;
  }
  if (options.app.isPackaged && !options.isLabBuild && platform !== "win32") {
    const migration = migrateUserDataFromPreviousName({ userDataDir: options.app.getPath("userData") });
    if (migration.outcome === "copied") console.log(`[sand] copied user data from ${migration.from} to ${migration.to}`);
    if (migration.outcome === "failed") {
      console.warn(`[sand] could not copy user data from ${migration.from}: ${migration.error}`);
      options.reportFailureClass?.("startup", "user-data-settlement", "previous-name-copy-failed");
    }
  }
  const settlement = applyWindowsUserDataMigration({
    platform,
    isPackaged: options.app.isPackaged,
    isLabBuild: options.isLabBuild,
    hasIsolatedUserData: false,
    isUpdatedLaunch: isWindowsUpdatedLaunch(argv),
    appDataDir: options.app.getPath("appData"),
    canonicalUserDataDir: options.app.getPath("userData"),
    setPath: (name, path) => options.app.setPath(name, path),
  });
  if (STRANDED_USER_DATA_REASONS.has(settlement.reason)) {
    options.reportFailureClass?.("startup", "user-data-settlement", settlement.reason);
  }
  return null;
}

export interface DesktopDataRootBootstrapOptions {
  readonly isPrimaryInstance: boolean;
  readonly isLabBuild: boolean;
  readonly hasIsolatedUserData: boolean;
  readonly app: Pick<DesktopBootstrapApp, "isPackaged">;
  readonly env?: NodeJS.ProcessEnv;
  readonly homeDir?: string;
  reportFailureClass?(surface: "startup", operation: "data-root-settlement", reason: string): void;
}

export function bootstrapDesktopDataRoot(options: DesktopDataRootBootstrapOptions): DataRootSettlement | null {
  if (!options.isPrimaryInstance) return null;
  const env = options.env ?? process.env;
  if (!options.app.isPackaged && env.SAND_ATTACH_PROD_BOX === "1"
    && !options.hasIsolatedUserData && resolveSandDataRootOverride(env) == null) {
    env[SAND_DATA_ROOT_ENV] = resolveExistingSandProductionRootDir(options.homeDir);
    return null;
  }
  const settlement = applyStartupDataRootMigration({
    isPackaged: options.app.isPackaged,
    isLabBuild: options.isLabBuild,
    hasIsolatedUserData: options.hasIsolatedUserData,
    env,
    ...(options.homeDir === undefined ? {} : { homeDir: options.homeDir }),
  });
  if (STRANDED_DATA_ROOT_REASONS.has(settlement.reason)) {
    options.reportFailureClass?.("startup", "data-root-settlement", settlement.reason);
  }
  return settlement;
}
