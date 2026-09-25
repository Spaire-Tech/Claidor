import { readFile, stat } from "node:fs/promises";
import { basename, posix } from "node:path";
import { videoMimeFromPath } from "../../../shared/media/image-mime.js";
import type { TransferBox } from "../../box/box-transfer.js";

export const SAND_BOX_STAGE_MAX_BYTES = 50 * 1024 * 1024;
export const SAND_BOX_UPLOADS_DIR = "/workspace/uploads";
export interface BoxStagingDependencies<Context> {
  readonly ctx: Context;
  readonly box: TransferBox & { runState(ctx: Context, agentId: string): Promise<string> };
  readonly resolveOwnerDir: (path: string) => string | null;
  readonly report?: (line: string) => void;
  readonly upload: (ctx: Context, box: BoxStagingDependencies<Context>["box"], agentId: string, files: readonly { boxPath: string; data: Uint8Array }[]) => Promise<void>;
}
export async function stageAttachmentsIntoBox<Context>(deps: BoxStagingDependencies<Context>, agentId: string, hostPaths: readonly string[], names: ReadonlyMap<string, string> = new Map()): Promise<Map<string, string>> {
  const staged = new Map<string, string>();
  if (hostPaths.length === 0) return staged;
  try { if (await deps.box.runState(deps.ctx, agentId) !== "running") return staged; } catch { return staged; }
  const uploads: { boxPath: string; data: Uint8Array }[] = [];
  for (const hostPath of hostPaths) {
    if (videoMimeFromPath(hostPath) !== undefined || deps.resolveOwnerDir(hostPath) == null) continue;
    try {
      const info = await stat(hostPath); if (!info.isFile() || info.size > SAND_BOX_STAGE_MAX_BYTES) continue;
      // Under its original name (the ingested file is named by its hash, F-270); a collision keeps both.
      const preferred = (names.get(hostPath) ?? basename(hostPath)).replace(/[\\/]/g, "_").trim() || basename(hostPath);
      const taken = new Set(uploads.map((upload) => upload.boxPath));
      let boxPath = posix.join(SAND_BOX_UPLOADS_DIR, preferred);
      for (let n = 2; taken.has(boxPath); n += 1) { const dot = preferred.lastIndexOf("."); boxPath = posix.join(SAND_BOX_UPLOADS_DIR, dot > 0 ? `${preferred.slice(0, dot)}-${n}${preferred.slice(dot)}` : `${preferred}-${n}`); }
      uploads.push({ boxPath, data: new Uint8Array(await readFile(hostPath)) }); staged.set(hostPath, boxPath);
    } catch {}
  }
  if (uploads.length === 0) return staged;
  try { await deps.upload(deps.ctx, deps.box, agentId, uploads); } catch (error) { deps.report?.(`staging into ${SAND_BOX_UPLOADS_DIR} failed (${uploads.length} file(s)): ${error instanceof Error ? error.message : String(error)}`); return new Map(); }
  return staged;
}
