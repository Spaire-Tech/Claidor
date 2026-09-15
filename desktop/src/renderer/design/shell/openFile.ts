import { normalizeFilePathForDedup } from '../../services/artifactParser';
import type { Artifact } from '../../types/artifact';

/**
 * What a click on a file in the thread should do.
 *
 * The founder: *"when the ai write an artifact, at the end, when it sends
 * it, and the user clicks on it, the ai must always open it in the
 * artifact right panel. Always."* Until now the click handed the path to
 * the operating system, which opened Word, or Preview, or nothing, and
 * the panel behind the computer icon — the richest thing upstream gives
 * us — stayed shut.
 *
 * Three answers, in order:
 *
 *  - **show** — the file is already an artifact in the store (the loader
 *    ran when the turn ended). Select it; the panel opens on its preview.
 *  - **load** — the detector saw it but the loader has not run yet (a
 *    click that beats the end of the turn), or the load was skipped.
 *    Read it now, add it, then show it.
 *  - **system** — not something the agent made: a file the person
 *    attached, or a path nothing detected. The operating system opens
 *    it, as before. There is nothing for the panel to draw.
 *
 * Pure, so the three cases are tested without a store or a click.
 */
export type OpenFileTarget =
  | { kind: 'show'; artifactId: string }
  | { kind: 'load'; artifact: Artifact }
  | { kind: 'system' };

/**
 * Same file, allowing for one side being relative.
 *
 * A detected artifact carries the path as the agent wrote it, which is
 * often relative to the working folder; the loaded copy carries the
 * absolute one. Both name the same file, so either may end with the other.
 */
export function sameFile(left: string, right: string): boolean {
  const a = normalizeFilePathForDedup(left);
  const b = normalizeFilePathForDedup(right);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

export function openFileTarget(
  path: string,
  loaded: readonly Artifact[],
  detected: readonly Artifact[],
): OpenFileTarget {
  const shown = loaded.find(artifact => artifact.filePath && sameFile(artifact.filePath, path));
  if (shown) return { kind: 'show', artifactId: shown.id };
  const seen = detected.find(artifact => artifact.filePath && sameFile(artifact.filePath, path));
  if (seen) return { kind: 'load', artifact: seen };
  return { kind: 'system' };
}
