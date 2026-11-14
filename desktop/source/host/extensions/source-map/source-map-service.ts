/**
 * Which store each agent's files are kept in. One small file in the data
 * folder, `source-map.json`, holds an entry per agent: the id of its store
 * and whether that store lives on this computer only or in the agents' store
 * as well. The computer's own store has an entry too, under a key of its own.
 */
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

import { getSandRootDir } from "../../host-paths.js";

export type SandSourceMode = "local" | "agent-store";

export interface SandSourceEntry {
  readonly sourceId: string;
  readonly mode: SandSourceMode;
}

/** The key of the computer's own store, beside the agents' ids. */
export const BOX_STORE_SOURCE_KEY = "box-store";

export function getSourceMapPath(): string {
  return join(getSandRootDir(), "source-map.json");
}

/** The entries of a file, by agent id. */
type Entries = Record<string, SandSourceEntry>;

function isMode(value: unknown): value is SandSourceMode {
  return value === "local" || value === "agent-store";
}

/** One entry as the file gives it, cut down to its two fields, or nothing when it lacks an id or names no mode we know. */
function entryFrom(value: unknown): SandSourceEntry | undefined {
  if (typeof value !== "object" || value == null) return undefined;
  const { sourceId, mode } = value as Record<string, unknown>;
  if (typeof sourceId !== "string" || sourceId.length === 0) return undefined;
  return isMode(mode) ? { sourceId, mode } : undefined;
}

/** What is kept of a file's content: the entries that hold up, in the file's order. Anything but an object gives none. */
function entriesFrom(content: unknown): Entries {
  const entries: Entries = {};
  if (typeof content !== "object" || content == null || Array.isArray(content)) return entries;
  for (const [agentId, value] of Object.entries(content)) {
    const entry = entryFrom(value);
    // Set by plain assignment, as it has always been: the key `__proto__` is then not an entry of its own.
    if (entry !== undefined) entries[agentId] = entry;
  }
  return entries;
}

export class SandSourceMap {
  /** The file's entries, once read. Every later call works on this object, and a save makes the saved entries the ones kept. */
  private entries: Entries | undefined;

  constructor(
    private readonly file = getSourceMapPath(),
    private readonly makeId: () => string = () => crypto.randomUUID(),
  ) {}

  /** The agent's entry. An agent not in the map yet gets a new id, kept on this computer, and the file is written. */
  async getOrCreate(agentId: string): Promise<SandSourceEntry> {
    const entries = await this.read();
    const known = entries[agentId];
    if (known != null) return known;
    const made: SandSourceEntry = { sourceId: this.makeId(), mode: "local" };
    await this.put(entries, agentId, made);
    return made;
  }

  getOrCreateBoxStore(): Promise<SandSourceEntry> {
    return this.getOrCreate(BOX_STORE_SOURCE_KEY);
  }

  /** The computer's own entry if it has one. Asking makes none. */
  async getBoxStore(): Promise<SandSourceEntry | null> {
    const entries = await this.read();
    return entries[BOX_STORE_SOURCE_KEY] ?? null;
  }

  /** Gives the agent that mode under the id it has, or under a new id, and writes the file. The entry kept before is not changed: a new one takes its place. */
  async setMode(agentId: string, mode: SandSourceMode): Promise<SandSourceEntry> {
    const entries = await this.read();
    const known = entries[agentId];
    const next = { sourceId: known == null ? this.makeId() : known.sourceId, mode };
    await this.put(entries, agentId, next);
    return next;
  }

  /** The entries, read from the file the first time. A file that is missing or cannot be understood counts as empty. */
  private async read(): Promise<Entries> {
    if (this.entries != null) return this.entries;
    let entries: Entries;
    try {
      entries = entriesFrom(JSON.parse(await fs.readFile(this.file, "utf8")));
    } catch {
      entries = {};
    }
    this.entries = entries;
    return entries;
  }

  /** Sets one entry and saves. What it hands back is the save itself. */
  private put(entries: Entries, agentId: string, entry: SandSourceEntry): Promise<void> {
    entries[agentId] = entry;
    return this.save(entries);
  }

  /**
   * Writes the entries to the file: whole, under a temporary name first,
   * then moved into place. They are the entries kept from the moment the
   * save begins, whether or not it succeeds.
   */
  private async save(entries: Entries): Promise<void> {
    this.entries = entries;
    await fs.mkdir(dirname(this.file), { recursive: true });
    const draft = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(draft, JSON.stringify(entries, null, 2), "utf8");
    await fs.rename(draft, this.file);
  }
}
