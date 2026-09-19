/**
 * Reconciling the packaged renderer against the pinned one.
 *
 * The fidelity build keeps the shipped 0.18.0 renderer byte-for-byte with one
 * exception: `applyOriginalRendererRouterPatch` rewrites the Settings chunk to
 * add the Router panel, by exact anchored replacement.
 *
 * Those two facts were not reconciled. `createRendererArtifactProvenance`
 * snapshots `src/app/dist/renderer` **before** the patch; the patch then edits
 * the staged copy; and `verify.mjs` demanded byte-equality between the two. It
 * could only ever fail, and it did, on `assets/index-BlqerJhg.js`.
 *
 * Loosening the check is not the answer — that inventory is the only thing
 * proving the packaged UI is the pinned artifact. Instead the patch record
 * (`dist/renderer-router-extension.json`), which already carries `original`
 * and `patched` {bytes, sha256} for every chunk it touches, becomes part of
 * the proof:
 *
 *   a file the patch did not touch  → must equal the pinned inventory exactly
 *   a file the patch did touch      → its `original` must equal the pinned
 *                                     inventory exactly, *and* the packaged
 *                                     bytes must equal its `patched`
 *
 * So every packaged byte is still pinned, either to the shipped artifact or to
 * a recorded transformation of it, and a patch that did not start from the
 * pinned artifact is refused.
 */

/** The prefix every inventory path carries inside the archive. */
export const RENDERER_ROOT = "dist/renderer/";

export const ROUTER_EXTENSION_PATH = "dist/renderer-router-extension.json";

const HEX64 = /^[0-9a-f]{64}$/;

function chunkKey(declaredPath) {
  if (typeof declaredPath !== "string" || !declaredPath.startsWith(RENDERER_ROOT)) {
    throw new Error(`Router extension names a chunk outside the renderer: ${declaredPath}`);
  }
  return declaredPath.slice(RENDERER_ROOT.length);
}

function assertDigest(value, label) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} has no byte count.`);
  }
}

/**
 * The patch record, validated into a map keyed by inventory-relative path.
 * Throws rather than returning a partial map: an unreadable or unexpected
 * record must stop the build, not quietly verify nothing.
 */
export function readRouterExtension(record) {
  if (record == null || typeof record !== "object") throw new Error("Router extension record is missing.");
  if (record.schemaVersion !== 1 || record.mode !== "original-renderer-settings-extension") {
    throw new Error("Router extension record has an unexpected identity.");
  }
  if (!Array.isArray(record.chunks) || record.chunks.length === 0) {
    throw new Error("Router extension record declares no chunks.");
  }
  const byPath = new Map();
  for (const chunk of record.chunks) {
    const key = chunkKey(chunk?.path);
    if (byPath.has(key)) throw new Error(`Router extension declares ${key} twice.`);
    for (const side of ["original", "patched"]) {
      const value = chunk?.[side];
      if (value == null || !HEX64.test(String(value.sha256))) {
        throw new Error(`Router extension chunk ${key} has no ${side} digest.`);
      }
      assertDigest(value.bytes, `Router extension chunk ${key} ${side}`);
    }
    if (chunk.original.sha256 === chunk.patched.sha256) {
      throw new Error(`Router extension chunk ${key} records no change.`);
    }
    byPath.set(key, chunk);
  }
  return byPath;
}

/**
 * @param files      the pinned inventory from renderer-artifact-provenance.json
 * @param patches    the map from readRouterExtension
 * @param packaged   (relativePath) => { bytes: number, sha256: string } as packaged
 * @returns the paths that were accepted as patched, for reporting
 */
export function reconcileRendererInventory({ files, patches, packaged }) {
  if (!Array.isArray(files) || files.length === 0) throw new Error("Pinned renderer inventory is empty.");
  const seen = new Set();
  const patchedPaths = [];

  for (const file of files) {
    if (typeof file?.path !== "string" || seen.has(file.path)) {
      throw new Error("Packaged artifact renderer provenance contains a missing or duplicate path.");
    }
    seen.add(file.path);
    const actual = packaged(file.path);
    const patch = patches.get(file.path);

    if (patch === undefined) {
      if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256) {
        throw new Error(`Packaged artifact renderer differs from its checksum inventory: ${file.path}`);
      }
      continue;
    }

    // The patch has to have started from the pinned bytes, or the chain back
    // to the shipped artifact is broken however well-formed the record looks.
    if (patch.original.bytes !== file.bytes || patch.original.sha256 !== file.sha256) {
      throw new Error(`Router extension for ${file.path} did not start from the pinned renderer.`);
    }
    if (actual.bytes !== patch.patched.bytes || actual.sha256 !== patch.patched.sha256) {
      throw new Error(`Packaged artifact renderer differs from its recorded router patch: ${file.path}`);
    }
    patchedPaths.push(file.path);
  }

  const unapplied = [...patches.keys()].filter(key => !seen.has(key));
  if (unapplied.length > 0) {
    throw new Error(`Router extension names chunks absent from the pinned inventory: ${unapplied.join(", ")}`);
  }
  return { declaredPaths: seen, patchedPaths };
}
