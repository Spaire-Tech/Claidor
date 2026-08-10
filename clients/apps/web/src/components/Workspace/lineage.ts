/**
 * Which upload of a document is the one in force.
 *
 * The API returns every artifact ever uploaded, which is right — the model
 * page needs the history, and a check that ran against v11 has to keep
 * pointing at v11. What is wrong is a *screen* that shows them all:
 * re-uploading the deck six times is one deck, not six files, and one
 * figure, not six figures.
 *
 * A lineage is « the deck », across every upload of it. Two different decks
 * in one deal are two lineages and stay two rows.
 */

import type { Artifact } from './api'

/** The newest version of each document, newest document first. */
export function current(artifacts: Artifact[]): Artifact[] {
  const newest = new Map<string, Artifact>()
  for (const artifact of artifacts) {
    const seen = newest.get(artifact.lineage_id)
    if (!seen || artifact.version > seen.version)
      newest.set(artifact.lineage_id, artifact)
  }
  return [...newest.values()].sort(
    (a, b) => Date.parse(b.uploaded_at) - Date.parse(a.uploaded_at),
  )
}

/**
 * The ids of those, for filtering anything that carries an `artifact_id`.
 *
 * A figure on a superseded deck is not a published figure. It is history,
 * and history belongs on the document's own page rather than in a list
 * whose first line claims to be everything currently in force.
 */
export function currentIds(artifacts: Artifact[]): Set<string> {
  return new Set(current(artifacts).map((one) => one.id))
}
