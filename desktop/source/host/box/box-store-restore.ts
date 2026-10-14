/**
 * The box's backup copied in before its host starts (14 October 2026).
 *
 * The upstream app restores a cloud computer from its backup with the
 * host program's own helper, `host-main.cjs --box-copy-in`, run before the
 * host starts and logged to /tmp/sand-copy-in.log (`box-copy-in.ts`; the
 * outcome line is what the upstream's recreate reads). Simeon Labs' server
 * says when a new container should do it (`server/simeon/sand/box_store.py`,
 * `box_env`):
 *
 *   SIMEON_BOX_STORE_RESTORE     "always": the old container's backup was
 *                                brought up to date just before it went, so
 *                                the backup is the newest copy (its Chrome
 *                                and app sign-ins lived outside the volumes);
 *                                "fresh": only onto an empty agents folder (a
 *                                container lost with its volumes kept must not
 *                                trade newer files for a backup up to two
 *                                minutes older).
 *   SIMEON_BOX_STORE_RESTORE_ID  new for every container, so the copy runs
 *                                once per container, not on every host restart.
 *
 * (Read here as `SAND_…`, after the entry's alias copy.) The helper itself is
 * switched on only for its own run (`SAND_BOX_STORE_COPY_IN=1` in the child's
 * environment), never in the container's, so an image whose start script
 * would run it on its own does not.
 *
 * A failed copy fails closed, as upstream: the host exits, the supervisor
 * starts it again, the copy is tried again. After three failures for one
 * container the host starts without the backup and with backups paused in
 * that container, so its empty folders never replace the backup it could
 * not read; the next container tries again ("Recover computer" makes one).
 */
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const BOX_STORE_RESTORE_ENV = "SAND_BOX_STORE_RESTORE";
export const BOX_STORE_RESTORE_ID_ENV = "SAND_BOX_STORE_RESTORE_ID";
export const BOX_STORE_RESTORE_MARKER = ".simeon-box-store-restore.json";
export const BOX_COPY_IN_LOG_PATH = "/tmp/sand-copy-in.log";
export const BOX_STORE_RESTORE_MAX_ATTEMPTS = 3;
const COPY_IN_EXIT_NOOP = 0;
const COPY_IN_EXIT_HYDRATED = 10;

export type BoxStoreRestoreOutcome =
  | { readonly kind: "off" }
  | { readonly kind: "done-before" }
  | { readonly kind: "kept-local" }
  | { readonly kind: "restored"; readonly exitCode: number }
  | { readonly kind: "failed"; readonly attempts: number }
  | { readonly kind: "gave-up"; readonly attempts: number };

export interface BoxStoreRestoreDependencies {
  readonly env: NodeJS.ProcessEnv;
  readonly sandRoot: string;
  /** Runs `--box-copy-in` with this environment; its exit code. */
  runCopyIn(env: NodeJS.ProcessEnv): Promise<number>;
  log(message: string): void;
}

interface RestoreMarker {
  readonly restoreId: string;
  readonly state: "done" | "failed";
  readonly attempts: number;
}

function readMarker(file: string): RestoreMarker | null {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<RestoreMarker>;
    if (typeof parsed.restoreId !== "string" || (parsed.state !== "done" && parsed.state !== "failed")) return null;
    return { restoreId: parsed.restoreId, state: parsed.state, attempts: typeof parsed.attempts === "number" ? parsed.attempts : 0 };
  } catch {
    return null;
  }
}

function writeMarker(file: string, marker: RestoreMarker): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(marker)}\n`);
  renameSync(temporary, file);
}

function agentsFolderInUse(sandRoot: string): boolean {
  try {
    return readdirSync(path.join(sandRoot, "agents")).length > 0;
  } catch {
    return false;
  }
}

/** Copies the backup in when the server asked for it; see the file's head. */
export async function restoreBoxStoreFromEnv(deps: BoxStoreRestoreDependencies): Promise<BoxStoreRestoreOutcome> {
  const mode = deps.env[BOX_STORE_RESTORE_ENV]?.trim().toLowerCase();
  const restoreId = deps.env[BOX_STORE_RESTORE_ID_ENV]?.trim() ?? "";
  if ((mode !== "always" && mode !== "fresh") || restoreId.length === 0) return { kind: "off" };
  const markerPath = path.join(deps.sandRoot, BOX_STORE_RESTORE_MARKER);
  const marker = readMarker(markerPath);
  if (marker?.restoreId === restoreId && marker.state === "done") return { kind: "done-before" };
  const attemptsBefore = marker?.restoreId === restoreId ? marker.attempts : 0;
  if (attemptsBefore >= BOX_STORE_RESTORE_MAX_ATTEMPTS) {
    deps.env.SAND_BOX_STORE_SYNC = "0";
    deps.log(`[box-store-restore] gave up after ${attemptsBefore} attempts; starting without the backup, backups paused in this container so the backup is kept`);
    return { kind: "gave-up", attempts: attemptsBefore };
  }
  if (mode === "fresh" && agentsFolderInUse(deps.sandRoot)) {
    writeMarker(markerPath, { restoreId, state: "done", attempts: attemptsBefore });
    deps.log("[box-store-restore] kept the agents' folder already here (restore=fresh)");
    return { kind: "kept-local" };
  }
  deps.log(`[box-store-restore] copying the backup in (restore=${mode}, attempt ${attemptsBefore + 1}); log: ${BOX_COPY_IN_LOG_PATH}`);
  let exitCode: number;
  try {
    exitCode = await deps.runCopyIn({ ...deps.env, SAND_BOX_STORE_COPY_IN: "1" });
  } catch (error) {
    deps.log(`[box-store-restore] the copy did not start: ${error instanceof Error ? error.message : String(error)}`);
    exitCode = 1;
  }
  if (exitCode === COPY_IN_EXIT_NOOP || exitCode === COPY_IN_EXIT_HYDRATED) {
    writeMarker(markerPath, { restoreId, state: "done", attempts: attemptsBefore + 1 });
    deps.log(`[box-store-restore] done (${exitCode === COPY_IN_EXIT_HYDRATED ? "restored" : "nothing to restore"})`);
    return { kind: "restored", exitCode };
  }
  const attempts = attemptsBefore + 1;
  writeMarker(markerPath, { restoreId, state: "failed", attempts });
  deps.log(`[box-store-restore] failed (exit ${exitCode}, attempt ${attempts} of ${BOX_STORE_RESTORE_MAX_ATTEMPTS}); the host stops and is started again`);
  return { kind: "failed", attempts };
}

/** `node host-main.cjs --box-copy-in`, appending to /tmp/sand-copy-in.log. */
export function spawnBoxCopyIn(env: NodeJS.ProcessEnv, entry: string | undefined = process.argv[1], logPath = BOX_COPY_IN_LOG_PATH): Promise<number> {
  if (entry === undefined || !existsSync(entry)) return Promise.reject(new Error(`no host entry to run --box-copy-in from (${entry ?? "none"})`));
  const fd = openSync(logPath, "a");
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (finish: () => void) => { if (settled) return; settled = true; closeSync(fd); finish(); };
    const child = spawn(process.execPath, [entry, "--box-copy-in"], { env, stdio: ["ignore", fd, fd] });
    child.once("error", (error) => settle(() => reject(error)));
    child.once("exit", (code) => settle(() => resolve(code ?? 1)));
  });
}
