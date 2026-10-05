import { createRequire } from "node:module";

// The Electron bundle is emitted as CJS while the source owner is also loaded
// directly as ESM by focused tests.  Prefer the CJS filename when present so
// the bundled process-metrics owner does not evaluate an undefined import.meta
// URL; the ESM path remains artifact-equivalent.
const nodeRequire = createRequire(typeof __filename === "string" ? __filename : import.meta.url);
export interface ProclistNative { proclist_scan_async(roots: readonly number[]): Promise<unknown> }

export function loadProclist(requireFn: (name: string) => unknown = nodeRequire): ProclistNative | null {
  try {
    const module = requireFn("simeon-proclist") as Partial<ProclistNative> | null;
    return typeof module?.proclist_scan_async === "function" ? module as ProclistNative : null;
  } catch { return null; }
}

export function createNativeProcessScan(native: ProclistNative | null = loadProclist()): (roots: readonly number[]) => Promise<unknown[]> {
  return async (roots) => {
    if (native == null) return [];
    try { const result = await native.proclist_scan_async(roots); return Array.isArray(result) ? result : []; }
    catch { return []; }
  };
}
