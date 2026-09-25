/**
 * The memory-sync host extension (25 September 2026): the client the
 * memory routes were waiting for, wired to the hooks that already existed.
 *
 * - On start, once the host's background work is ready: `GET
 *   /desktop/api/memory` to say what the server holds, then one round that
 *   pushes every local file the state does not know and pulls everything
 *   the server has (a fresh box receives the whole memory).
 * - Then, on any change under `agents/`, `user-memory/` or `projects/`
 *   (`WatchedDirectory`, which is where `runTurnMemory`'s `addMemory`, the
 *   agent's `update_state` and the memory pane's delete all land, through
 *   `writeFileAtomic`), and on `MemoryService.subscribe`, a round after a
 *   5 s debounce, sending only what changed with its base version.
 * - Auth is the box's own access token (`auth.getAccessToken`, the same
 *   token the model proxy takes); the server takes it since the same day
 *   (`get_desktop_or_box_session` on the memory routes).
 * - `SAND_MEMORY_SYNC=0` switches it off. One `[claidor] memory-sync` line
 *   per round names what moved, or the refusal.
 */
import type { DebouncePolicy } from "../../../internal/scheduling.js";
import { createRealDebouncePolicy } from "../../../internal/scheduling.js";
import { defineHostExtension, type HostExtensionContext } from "../../../internal/host-extensions.js";
import { HOST_LOG_PREFIX, logHostLine } from "../../../shared/host-log.js";
import { getConfiguredBackendUrl } from "../../../shared/node/cursor-token.js";
import { getSandRootDir } from "../../host-paths.js";
import { WatchedDirectory } from "../../watched-directory.js";
import { HostExtensions } from "../extension-ids.generated.js";
import { MEMORY_SYNC_ROOTS, MemorySyncClient, type MemorySyncOutcome } from "./memory-sync-client.js";
import { join } from "node:path";

export const MEMORY_SYNC_DEBOUNCE_MS = 5_000;
export const MEMORY_SYNC_ENV = "SAND_MEMORY_SYNC";

export function isMemorySyncEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[MEMORY_SYNC_ENV]?.trim().toLowerCase();
  return !(value === "0" || value === "off" || value === "false" || value === "no");
}

interface AuthApi { getAccessToken(options: { readonly backendUrl: string }): Promise<string>; }
interface MemoryApi { subscribe?(listener: () => void): () => void; }
interface MemorySyncHost { log(message: string): void; readonly whenBackgroundWorkReady?: Promise<unknown>; }

/** What a test or a production binding may supply; every field has a default. */
export interface MemorySyncExtras {
  readonly sandRoot?: string;
  readonly backendUrl?: string;
  readonly debounce?: DebouncePolicy;
  readonly fetchImpl?: typeof fetch;
  readonly env?: NodeJS.ProcessEnv;
  readonly log?: (line: string) => void;
}

export interface MemorySyncApi {
  isEnabled(): boolean;
  /** A round after the debounce; what the watchers call. */
  requestSync(): void;
  /** A round now, awaited; what a test calls. */
  syncNow(options?: { readonly pullEvenIfNothingChanged?: boolean }): Promise<MemorySyncOutcome>;
  /** The start-up pull, awaited; resolves once the first round is done. */
  readonly whenStarted: Promise<void>;
}

export const memorySyncExtension = defineHostExtension<MemorySyncApi, MemorySyncHost>({
  id: HostExtensions.MemorySync,
  dependencies: [HostExtensions.Auth, HostExtensions.Memory],
  start: (context: HostExtensionContext<MemorySyncHost> & MemorySyncExtras) => {
    const env = context.env ?? process.env;
    const log = context.log ?? logHostLine;
    if (!isMemorySyncEnabled(env)) {
      log(`${HOST_LOG_PREFIX} memory-sync off (${MEMORY_SYNC_ENV}=${env[MEMORY_SYNC_ENV] ?? ""})`);
      const off: MemorySyncOutcome = { kind: "nothing-to-do", pushed: 0, pulled: 0, deleted: 0 };
      return { isEnabled: () => false, requestSync: () => {}, syncNow: async () => off, whenStarted: Promise.resolve() };
    }
    const auth = context.deps[HostExtensions.Auth] as AuthApi;
    const memory = context.deps[HostExtensions.Memory] as MemoryApi | undefined;
    const sandRoot = context.sandRoot ?? getSandRootDir();
    const backendUrl = context.backendUrl ?? getConfiguredBackendUrl();
    const client = new MemorySyncClient({
      sandRoot,
      getBackendUrl: () => backendUrl,
      getAccessToken: (options) => auth.getAccessToken(options),
      ...(context.fetchImpl === undefined ? {} : { fetchImpl: context.fetchImpl }),
      log
    });
    let stopped = false;
    const debounce = context.debounce ?? createRealDebouncePolicy({ name: "sand-memory-sync", delayMs: MEMORY_SYNC_DEBOUNCE_MS });
    const requestSync = debounce.wrap(() => { if (!stopped) void client.syncNow(); });
    context.onStop(() => { stopped = true; requestSync.dispose(); });

    const watchers = MEMORY_SYNC_ROOTS.map((root) => new WatchedDirectory(join(sandRoot, root), debounce, (error) => context.host.log(`[sand:memory-sync] cannot watch ${root}: ${error instanceof Error ? error.message : String(error)}`)));
    const startWatching = () => { for (const watcher of watchers) watcher.setOnChange(() => { if (!stopped) void client.syncNow(); }); };
    context.onStop(() => { for (const watcher of watchers) watcher.setOnChange(null); });
    if (memory?.subscribe != null) context.onStop(memory.subscribe(() => requestSync()));

    const whenStarted = (context.host.whenBackgroundWorkReady ?? Promise.resolve()).then(async () => {
      if (stopped) return;
      try {
        const held = await client.list();
        if (held != null) log(`${HOST_LOG_PREFIX} memory-sync server holds ${held.length} file(s)${held.length > 0 ? `: ${held.slice(0, 8).map((file) => `${file.name}@${file.version}`).join(" ")}${held.length > 8 ? " …" : ""}` : ""}`);
      } catch (error) {
        log(`${HOST_LOG_PREFIX} memory-sync list failed ${error instanceof Error ? error.message : String(error)}`);
      }
      if (stopped) return;
      await client.syncNow({ pullEvenIfNothingChanged: true });
      if (!stopped) startWatching();
    });

    return {
      isEnabled: () => true,
      requestSync: () => requestSync(),
      syncNow: (options) => client.syncNow(options),
      whenStarted
    };
  }
});
