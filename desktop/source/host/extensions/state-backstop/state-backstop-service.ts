/**
 * A backstop for the agents' state. Each agent keeps its state in a file,
 * `store.db`, in its own folder. A little after an agent stops running, a
 * copy of that file is put in the agent's store, where it can be read back
 * if the folder is lost. The whole thing is off unless a setting turns it on.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { DebouncePolicy } from "../../../internal/scheduling.js";
import { errorMessage } from "../../../shared/errors.js";

/** Where the copy sits inside an agent's store. */
export const SAND_STATE_BACKSTOP_REL_PATH = "state/store.db";
/** A state file larger than this is not copied, unless the backstop is made with another limit. */
export const DEFAULT_MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;
/** How long after the last call for an agent its snapshot is made. */
export const STATE_BACKSTOP_DEBOUNCE_MS = 5_000;

/**
 * The state file's bytes, read after `checkpoint` has folded into the file
 * whatever was still waiting beside it. A file that is not there is not
 * checkpointed and gives nothing.
 */
export function readStoreDbBytes(dbPath: string, checkpoint: (path: string) => void): Buffer | null {
  if (!existsSync(dbPath)) return null;
  checkpoint(dbPath);
  return readFileSync(dbPath);
}

interface ObjectStore {
  put(path: string, bytes: Uint8Array): Promise<void>;
  get(path: string): Promise<Uint8Array | null>;
}

export interface StateBackstopDeps {
  readonly objectStoreProvider: { forStore(sourceId: string): ObjectStore };
  readonly sourceMap: { getOrCreate(agentId: string): Promise<{ sourceId: string }> };
  readonly debounce: DebouncePolicy;
  readonly agentsRootDir: string;
  readonly maxSnapshotBytes?: number;
  readonly readDbBytes: (path: string) => Uint8Array | null;
  readonly log?: (message: string) => void;
}

/** How a snapshot ended. It never fails its caller: a failure is one of the three answers. */
type SnapshotOutcome = { status: "uploaded"; bytes: number } | { status: "skipped"; reason: string } | { status: "error"; error: string };

/** A debounced call, as the debounce policy hands it back. */
type Trigger = (() => void) & { dispose(): void };

export class SandStateBackstop {
  private readonly limit: number;
  private readonly log: (message: string) => void;
  /** One debounced trigger for each agent a snapshot was ever scheduled for. */
  private readonly triggers = new Map<string, Trigger>();
  private disposed = false;

  /** The limit and the log are settled here; everything else is asked of `deps` each time it is needed. */
  constructor(private readonly deps: StateBackstopDeps) {
    this.limit = deps.maxSnapshotBytes ?? DEFAULT_MAX_SNAPSHOT_BYTES;
    this.log = deps.log ?? ((message) => console.log(`[sand-state-backstop] ${message}`));
  }

  dbPathFor(agentId: string): string {
    return join(this.deps.agentsRootDir, agentId, "store.db");
  }

  /** Asks for a snapshot of the agent once the calls for it have stopped for a while. Does nothing once disposed of. */
  scheduleSnapshot(agentId: string): void {
    if (this.disposed) return;
    let trigger = this.triggers.get(agentId);
    if (trigger === undefined) {
      trigger = this.deps.debounce.wrap(() => this.snapshotUnwatched(agentId));
      this.triggers.set(agentId, trigger);
    }
    trigger();
  }

  /**
   * Copies the agent's state file to its store now. No file, or a file over
   * the limit, is skipped; anything that goes wrong is told to the log and
   * handed back as an error.
   */
  async snapshotNow(agentId: string): Promise<SnapshotOutcome> {
    try {
      const bytes = this.deps.readDbBytes(this.dbPathFor(agentId));
      if (bytes == null) return { status: "skipped", reason: "no store.db" };
      if (bytes.byteLength > this.limit) {
        const reason = `store.db ${bytes.byteLength}B over ${this.limit}B cap`;
        this.log(`skip ${agentId}: ${reason}`);
        return { status: "skipped", reason };
      }
      const { sourceId } = await this.deps.sourceMap.getOrCreate(agentId);
      await this.deps.objectStoreProvider.forStore(sourceId).put(SAND_STATE_BACKSTOP_REL_PATH, bytes);
      // The size is read again here, after the store has had the bytes.
      const uploaded = bytes.byteLength;
      this.log(`uploaded ${agentId} (${uploaded}B)`);
      return { status: "uploaded", bytes: uploaded };
    } catch (error) {
      const message = errorMessage(error);
      this.log(`snapshot ${agentId} failed: ${message}`);
      return { status: "error", error: message };
    }
  }

  /** The copy kept in the agent's store, or nothing when the store has none. Unlike a snapshot, a failure here fails the caller. */
  async readSnapshot(agentId: string): Promise<Uint8Array | null> {
    const { sourceId } = await this.deps.sourceMap.getOrCreate(agentId);
    return this.deps.objectStoreProvider.forStore(sourceId).get(SAND_STATE_BACKSTOP_REL_PATH);
  }

  /** Drops every snapshot still waiting and ends scheduling. A snapshot asked for outright still runs. */
  async dispose(): Promise<void> {
    this.disposed = true;
    for (const trigger of this.triggers.values()) trigger.dispose();
    this.triggers.clear();
  }

  /** A snapshot nobody waits for. Should even its own telling fail, that is told once more. */
  private snapshotUnwatched(agentId: string): void {
    void this.snapshotNow(agentId).catch((error) => this.log(`snapshot rejected for ${agentId}: ${errorMessage(error)}`));
  }
}

/** What the setting may say to turn the backstop on, in any case and with blanks around. */
const SWITCHED_ON: ReadonlySet<string | undefined> = new Set(["1", "true", "yes"]);

export function isStateBackstopEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return SWITCHED_ON.has(env.SAND_STATE_S3_BACKSTOP?.trim().toLowerCase());
}
