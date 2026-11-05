/**
 * The engine's `hands` role (`engine-role.ts`;
 * `docs/agents-on-the-server/README.md`, step 1a part 2): what runs on a
 * computer whose agents run on the brain.
 *
 * It takes the place of the whole engine in `main.ts`, so the rest of the
 * start runs unchanged: the backup is copied in at boot (`restoreBoxStore`),
 * the data folder is locked, and the gateway on 1340 answers the server. It
 * keeps only two things:
 * - the backup of the computer's own files (`/workspace`, Chrome's
 *   sign-ins, the command-line tools' settings). The agents' folder is left
 *   out (`boxStoreCategoriesForRole`), so the backup never clears agents it
 *   does not find here;
 * - the server's calls: `/health` (never busy, since no agent runs here),
 *   `snapshotBoxStoreNow` (the backup brought up to date before the server
 *   rebuilds the computer) and `getBoxStoreStatus`.
 *
 * At start it also writes the agents' reference pages into
 * `/home/box/reference` (the computer guide, the app guide, the routines
 * guide), which the agents read on the computer: the whole engine writes them
 * at start in the computer too (`provisionSandBoxPromptArtifacts`).
 *
 * No agents, no inbox, no routines, no chat copy: the brain does all of
 * that, so nothing is answered twice. The hands program and the router are
 * the supervisor's, as before.
 */
import {
  createDebouncePolicy,
  createPollingPolicy,
  createRealRetryPolicy,
  createRetryPolicy,
  realClock,
} from "../internal/scheduling.js";
import { createHostAuthService } from "./extensions/auth/auth-service.js";
import { CREDENTIAL_RETRY_BASE_DELAY_MS, CREDENTIAL_RETRY_MAX_DELAY_MS } from "./extensions/auth/credential-renewer.js";
import {
  BOX_STORE_DB_DEBOUNCE_MS,
  BOX_STORE_MANIFEST_RETRY_ATTEMPTS,
  BOX_STORE_MANIFEST_RETRY_DELAY_MS,
  BOX_STORE_SYNC_INTERVAL_MS,
  CHROME_SESSION_CHANGE_DEBOUNCE_MS,
  createBoxStoreSyncService,
  type BoxStoreSyncApi,
  type BoxStoreTelemetry,
} from "./extensions/box-store-sync/box-store-sync-service.js";
import {
  CHROME_SESSION_STAGE_MAX_ATTEMPTS,
  CHROME_SESSION_STAGE_RETRY_DELAY_MS,
  isChromeSessionStageRetryable,
} from "./extensions/box-store-sync/chrome-session-stage.js";
import { BoxStoreCanonicalWriteConflictError } from "./extensions/box-store-sync/object-store-port.js";
import { SandSourceMap } from "./extensions/source-map/source-map-service.js";
import type { HostMainHost } from "./main.js";
import { writeSandBoxReferenceDocs } from "./runner/box-reference-docs.js";

/** What the keeper needs to run the backup; the tests give stand-ins. */
export interface HandsKeeperBackup {
  readonly api: Pick<BoxStoreSyncApi, "isEnabled" | "snapshotBoxStoreNow" | "getBoxStoreStatus">;
  start(): void;
  dispose(): void;
}

export interface HandsKeeperOptions {
  readonly log?: (line: string) => void;
  readonly now?: () => number;
  readonly createBackup?: (log: (line: string) => void) => HandsKeeperBackup;
  readonly writeReferencePages?: () => Promise<readonly string[]>;
}

/** The backup's reports written as log lines: the computer's log is what is
 * read when it misbehaves, and the keeper sends no telemetry of its own. */
function backupTelemetry(log: (line: string) => void): BoxStoreTelemetry {
  const line = (kind: string) => (level: string, metadata: Record<string, string | undefined>) => {
    const fields = Object.entries(metadata)
      .filter(([, value]) => value !== undefined)
      .map(([name, value]) => `${name}=${value}`)
      .join(" ");
    log(`[hands-keeper] ${kind} ${level}${fields.length > 0 ? ` ${fields}` : ""}`);
  };
  return {
    reportBoxStoreSyncCycle: line("box-store-sync-cycle"),
    reportChromeSessionStage: line("chrome-session-stage"),
    reportBoxStoreManifestConflict: line("box-store-manifest-conflict"),
    reportBoxStoreDbCapture: line("box-store-db-capture"),
  };
}

/** The real backup: the same service the whole engine runs
 * (`extensions/box-store-sync/extension.ts`), with the same timings, on the
 * person's credential renewed as the whole engine renews it. */
function createRealBackup(log: (line: string) => void): HandsKeeperBackup {
  const auth = createHostAuthService({
    retry: createRealRetryPolicy({
      name: "sand-inference-credential-renewal",
      maxAttempts: Number.MAX_SAFE_INTEGER,
      initialDelayMs: CREDENTIAL_RETRY_BASE_DELAY_MS,
      maxDelayMs: CREDENTIAL_RETRY_MAX_DELAY_MS,
    }),
    clock: realClock,
    log,
  });
  const sourceMap = new SandSourceMap();
  const service = createBoxStoreSyncService({
    auth: {
      getAccessToken: (options?: unknown) => auth.getAccessToken(options as { readonly backendUrl?: string } | undefined),
      getMachineId: () => auth.getMachineId(),
    },
    sourceMap: { getOrCreateBoxStore: () => sourceMap.getOrCreateBoxStore() },
    telemetry: backupTelemetry(log),
    isIdle: () => true,
    polling: createPollingPolicy(realClock, { name: "box-store-sync-cycle", intervalMs: BOX_STORE_SYNC_INTERVAL_MS }),
    storeDbDebounce: createDebouncePolicy(realClock, { name: "box-store-sync-store-db", delayMs: BOX_STORE_DB_DEBOUNCE_MS }),
    chromeSessionDebounce: createDebouncePolicy(realClock, { name: "box-store-sync-chrome-session", delayMs: CHROME_SESSION_CHANGE_DEBOUNCE_MS }),
    manifestRetry: createRetryPolicy(realClock, {
      name: "box-store-sync-manifest-cas",
      maxAttempts: BOX_STORE_MANIFEST_RETRY_ATTEMPTS,
      initialDelayMs: BOX_STORE_MANIFEST_RETRY_DELAY_MS,
      maxDelayMs: BOX_STORE_MANIFEST_RETRY_DELAY_MS,
      shouldRetry: (error) => error instanceof BoxStoreCanonicalWriteConflictError,
    }),
    chromeStageRetry: createRetryPolicy(realClock, {
      name: "box-store-sync-chrome-stage",
      maxAttempts: CHROME_SESSION_STAGE_MAX_ATTEMPTS,
      initialDelayMs: CHROME_SESSION_STAGE_RETRY_DELAY_MS,
      maxDelayMs: CHROME_SESSION_STAGE_RETRY_DELAY_MS,
      shouldRetry: isChromeSessionStageRetryable,
    }),
    clock: realClock,
    log,
  });
  return {
    api: service.api,
    start: () => service.start(),
    dispose: () => {
      service.dispose();
      auth.dispose();
    },
  };
}

export function createHandsKeeperHost(options: HandsKeeperOptions = {}): HostMainHost {
  const log = options.log ?? ((line: string) => console.log(line));
  const now = options.now ?? Date.now;
  const startedAt = now();
  let backup: HandsKeeperBackup | undefined;
  const requireBackup = (): HandsKeeperBackup => {
    if (backup == null) throw new Error("the hands keeper has not started");
    return backup;
  };
  return {
    startedAt,
    async start() {
      backup = (options.createBackup ?? createRealBackup)(log);
      backup.start();
      void (options.writeReferencePages ?? (() => writeSandBoxReferenceDocs()))().then(
        (written) => log(`[hands-keeper] reference pages written: ${written.length}`),
        (error: unknown) => log(`[hands-keeper] reference pages were not written: ${error instanceof Error ? error.message : String(error)}`),
      );
      log(`[hands-keeper] on: the agents run on the brain; this computer keeps its files backed up (backup ${backup.api.isEnabled ? "on" : "off"})`);
    },
    async dispose() {
      backup?.dispose();
      backup = undefined;
    },
    getApi() {
      return {
        snapshotBoxStoreNow: (args: { includeIdleOnly?: boolean } | undefined) => requireBackup().api.snapshotBoxStoreNow(args ?? {}),
        getBoxStoreStatus: () => requireBackup().api.getBoxStoreStatus(),
        getHostStatus: async () => ({ hostVersion: null, latestHostVersion: null, hostUpdateAvailable: null, isBusy: false, role: "hands", capabilities: [] }),
      };
    },
    subscribe: () => () => {},
    getHealth: () => ({ isBusy: false, busyOnlyAwaitingApproval: false, activeAgentId: null, lastBusyAtMs: startedAt }),
    noteEventStreamClosed: () => {},
    noteDesktopContact: () => {},
    prepareForUpgrade: async () => ({ quiescing: false, runningTurns: 0 }),
    getLocalExecBridge: () => undefined,
    getWebAuthnBridge: () => undefined,
    reportProcessCrash: (error, kind) => log(`[hands-keeper] crash kind=${kind}: ${error instanceof Error ? error.message : String(error)}`),
    reportInvariantViolation: () => {},
    reportHostDiagnostic: () => {},
    reportGatewayCommandError: () => {},
    reportGatewayCommandSuccess: () => {},
    flushTelemetryForFatalExit: async () => {},
    reportBoxReady: async () => {},
  };
}
