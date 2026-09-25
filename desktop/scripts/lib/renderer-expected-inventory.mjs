/**
 * What each packaged renderer file should hash to, once the package-time
 * patches of `router-renderer-patch.mjs` are applied over the pinned 0.18.0
 * inventory (25 September 2026).
 *
 * `npm run verify` used to compare every renderer file with the pinned
 * Grok Bot inventory and fail on the first patched one
 * (`assets/app-icon-C7NKj2u7.png`, alphabetically first). The packager
 * records every patch in `dist/renderer-router-extension.json`; this reads
 * that record and answers the final expected bytes and hash per path,
 * layering the stages in the order they ran: the settings chunks, the marks
 * chunk, the stylesheet and the app icon, then the brand pass over every
 * chunk and the page. A file no stage touched keeps its pinned hash.
 */
const RENDERER_PREFIX = "dist/renderer/";

function relative(recordPath) {
  return typeof recordPath === "string" && recordPath.startsWith(RENDERER_PREFIX) ? recordPath.slice(RENDERER_PREFIX.length) : null;
}

function isHashRecord(value) {
  return value != null && Number.isInteger(value.bytes) && /^[0-9a-f]{64}$/.test(value.sha256 ?? "");
}

/** `provenanceFiles`: `[{path, bytes, sha256}]` from the pinned inventory; `extension`: the parsed patch record or null. */
export function expectedRendererInventory(provenanceFiles, extension) {
  const expected = new Map(provenanceFiles.map((file) => [file.path, { bytes: file.bytes, sha256: file.sha256, source: "pinned" }]));
  const patched = [];
  if (extension != null) {
    for (const row of extension.chunks ?? []) patched.push(["settings", row.path, row.original, row.patched]);
    const marks = extension.marks;
    if (marks != null) {
      if (typeof marks.chunk === "string") patched.push(["marks", marks.chunk, marks.original, marks.patched]);
      if (marks.stylesheet != null) patched.push(["marks", marks.stylesheet.path, marks.stylesheet.original, marks.stylesheet.patched]);
      if (marks.appIcon != null) patched.push(["app-icon", marks.appIcon.path, marks.appIcon.original, marks.appIcon.patched]);
    }
    for (const row of extension.brand?.files ?? []) patched.push(["brand", row.path, row.original, row.patched]);
  }
  for (const [stage, recordPath, original, next] of patched) {
    const key = relative(recordPath);
    if (key == null) throw new Error(`Renderer patch record names a path outside the renderer: ${recordPath}`);
    const current = expected.get(key);
    if (current == null) throw new Error(`Renderer patch record names a file the pinned inventory lacks: ${key}`);
    if (!isHashRecord(next)) throw new Error(`Renderer patch record for ${key} (${stage}) has no patched hash`);
    // Each stage must have started from what the previous stage left.
    if (original != null && isHashRecord(original) && (original.bytes !== current.bytes || original.sha256 !== current.sha256)) {
      throw new Error(`Renderer patch record for ${key} (${stage}) started from ${original.sha256.slice(0, 12)}, not the ${current.source} bytes ${current.sha256.slice(0, 12)}`);
    }
    expected.set(key, { bytes: next.bytes, sha256: next.sha256, source: stage });
  }
  return expected;
}
