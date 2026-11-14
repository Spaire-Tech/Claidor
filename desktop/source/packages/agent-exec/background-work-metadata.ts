/**
 * What is known of a piece of background work (its title, the folder it runs
 * in, when it started), written as text values so that it can be kept with
 * the work and read back later.
 */
export interface BackgroundWorkMetadata {
  title?: string;
  cwd?: string;
  startTimeMs?: number;
}

/** Text that is there and is not only blanks. It is kept as it is, blanks around it included. */
function isWords(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** A start time as it is kept: whole ms. Nothing for a time that is not above zero or is no real number. */
function wholeMs(time: number): number | undefined {
  return Number.isFinite(time) && time > 0 ? Math.floor(time) : undefined;
}

/** The text values for what is known, or nothing when nothing is. */
export function encodeBackgroundWorkMetadata(metadata: BackgroundWorkMetadata): Record<string, string> | undefined {
  const written: Record<string, string> = {};
  const title = metadata.title;
  const cwd = metadata.cwd;
  const startTimeMs = metadata.startTimeMs;
  if (isWords(title)) written.title = title;
  if (isWords(cwd)) written.cwd = cwd;
  const started = typeof startTimeMs === "number" ? wholeMs(startTimeMs) : undefined;
  if (started !== undefined) written.startTimeMs = String(started);
  return Object.keys(written).length === 0 ? undefined : written;
}

/** What is known, read back from text values. Whatever is missing, blank or of another kind is left out. */
export function decodeBackgroundWorkMetadata(metadata: Record<string, unknown> | null | undefined): BackgroundWorkMetadata {
  const known: BackgroundWorkMetadata = {};
  const title = metadata?.title;
  const cwd = metadata?.cwd;
  const startTimeMs = metadata?.startTimeMs;
  if (isWords(title)) known.title = title;
  if (isWords(cwd)) known.cwd = cwd;
  if (typeof startTimeMs === "string" && startTimeMs !== "") {
    const started = wholeMs(Number(startTimeMs));
    if (started !== undefined) known.startTimeMs = started;
  }
  return known;
}
