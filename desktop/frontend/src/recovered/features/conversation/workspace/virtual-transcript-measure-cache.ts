/**
 * Measured-height cache for the virtual transcript plane (slice 4).
 * Pure module — no React, no DOM. Stores committed row heights keyed by
 * entry id, resolves heights (committed > estimate), and supports
 * invalidation for content-size changes.
 */

import type { TranscriptEntryKind } from "./virtual-transcript-geometry";
import { estimateEntryHeightPx } from "./virtual-transcript-geometry";

/** Tolerance for no-op commits — avoids thrash from sub-pixel differences. */
const COMMIT_TOLERANCE_PX = 0.5;

export interface MeasureCacheEntry {
  id: string;
  kind: TranscriptEntryKind;
  hasAttachments?: boolean;
}

export class MeasureCache {
  private readonly committed = new Map<string, number>();

  /** Commit a measured height for a row. Returns true if the value changed. */
  commit(key: string, heightPx: number): boolean {
    const existing = this.committed.get(key);
    if (existing !== undefined && Math.abs(existing - heightPx) < COMMIT_TOLERANCE_PX) {
      return false;
    }
    this.committed.set(key, heightPx);
    return true;
  }

  /** Get the committed height for a key, or undefined if not measured. */
  get(key: string): number | undefined {
    return this.committed.get(key);
  }

  /** Invalidate (clear) a single key so it falls back to estimate. */
  invalidate(key: string): boolean {
    return this.committed.delete(key);
  }

  /** Clear all committed heights. */
  clear(): void {
    this.committed.clear();
  }

  /** Number of committed entries. */
  get size(): number {
    return this.committed.size;
  }

  /** Remove keys not present in the current entry set. */
  prune(activeKeys: ReadonlySet<string>): void {
    for (const key of this.committed.keys()) {
      if (!activeKeys.has(key)) {
        this.committed.delete(key);
      }
    }
  }

  /**
   * Resolve heights for a list of entries: committed height if available,
   * else estimated height from entry kind.
   */
  resolveHeights(entries: readonly MeasureCacheEntry[]): number[] {
    const heights = new Array<number>(entries.length);
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const committed = this.committed.get(entry.id);
      heights[i] = committed !== undefined
        ? committed
        : estimateEntryHeightPx(entry.kind, entry.hasAttachments);
    }
    return heights;
  }
}
