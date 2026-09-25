// The renderer's permission dock shows a local-tool-permission card only when
// the entry names the account it belongs to (`permissionScope`, the signed-in
// authId or email, the same slot the renderer computes for itself) and a
// revision that is not older than the account's current one
// (`permissionScopeRevision`, an integer; the dock's gate wants a strictly
// newer one after the same account signs out and back in). No host writer
// stamps either field, so the Allow card never showed. The coordinator is
// launched once per signed-in account, so it stamps them here, on every
// transcript event and every transcript read that passes through it, with
// its own start time as the revision: one number for the whole sign-in, and
// a newer one for the next.

export interface TranscriptPermissionScope {
  readonly slot: string;
  readonly revision: number;
}

export const TRANSCRIPT_REPLY_METHODS: readonly string[] = [
  "getAgentTranscriptTail",
  "openAgentTail",
  "getAgentTranscriptWindow",
  "getAgentThread",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

export function isPermissionCardEntry(entry: unknown): entry is Record<string, unknown> {
  if (!isRecord(entry) || entry.kind !== "send-message") return false;
  const message = entry.message;
  return isRecord(message) && message.type === "local-tool-permission";
}

export function stampPermissionScope(entry: unknown, scope: TranscriptPermissionScope): unknown {
  if (!isPermissionCardEntry(entry)) return entry;
  if (typeof entry.permissionScope === "string" && entry.permissionScope.length > 0) return entry;
  return { ...entry, permissionScope: scope.slot, permissionScopeRevision: scope.revision };
}

function stampEntries(entries: unknown, scope: TranscriptPermissionScope): unknown {
  if (!Array.isArray(entries)) return entries;
  let changed = false;
  const next = entries.map((entry) => {
    const stamped = stampPermissionScope(entry, scope);
    if (stamped !== entry) changed = true;
    return stamped;
  });
  return changed ? next : entries;
}

/** A transcript family event (`appended`, `updated`, `snapshot`) with its cards stamped. */
export function stampTranscriptEvent(payload: unknown, scope: TranscriptPermissionScope | null): unknown {
  if (scope == null || !isRecord(payload)) return payload;
  if ("entry" in payload) {
    const entry = stampPermissionScope(payload.entry, scope);
    return entry === payload.entry ? payload : { ...payload, entry };
  }
  if ("entries" in payload) {
    const entries = stampEntries(payload.entries, scope);
    return entries === payload.entries ? payload : { ...payload, entries };
  }
  return payload;
}

// The inference router concatenates host entries before local entries without
// interleaving by timestamp, so cards emitted by the host (widgets, connector,
// Allow, rename) end up before local text and the renderer draws them at the
// top of the chat. A stable sort by timestampMs here — downstream of the
// concat and upstream of the renderer — puts every entry in chronological
// order regardless of which transcript source produced it.
function sortEntriesByTimestamp(entries: unknown): unknown {
  if (!Array.isArray(entries)) return entries;
  const hasTimestamp = entries.some(
    (entry) => isRecord(entry) && typeof entry.timestampMs === "number",
  );
  if (!hasTimestamp) return entries;
  const sorted = [...entries].sort((a, b) => {
    const aMs = isRecord(a) && typeof a.timestampMs === "number" ? a.timestampMs : 0;
    const bMs = isRecord(b) && typeof b.timestampMs === "number" ? b.timestampMs : 0;
    return aMs - bMs;
  });
  // Return original reference when nothing moved (common case: already ordered).
  const unchanged = sorted.every((entry, i) => entry === entries[i]);
  return unchanged ? entries : sorted;
}

/** A transcript read reply (`entries: [...]`) with its cards stamped and sorted. */
export function stampTranscriptReply(method: string, value: unknown, scope: TranscriptPermissionScope | null, options: { readonly sortByTimestamp?: boolean } = {}): unknown {
  if (!TRANSCRIPT_REPLY_METHODS.includes(method) || !isRecord(value)) return value;
  // The re-sort was written for the hatch's concat of a host transcript and
  // a local one; the host's single transcript is already in order (F-421).
  const sorted = options.sortByTimestamp === true ? sortEntriesByTimestamp(value.entries) : value.entries;
  const stamped = scope == null ? sorted : stampEntries(sorted, scope);
  if (stamped === value.entries && sorted === value.entries) return value;
  return { ...value, entries: stamped };
}

/** True when a payload or reply carries at least one permission card, so the slot is only fetched when needed. */
export function carriesPermissionCard(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if ("entry" in value) return isPermissionCardEntry(value.entry);
  const entries = value.entries;
  return Array.isArray(entries) && entries.some(isPermissionCardEntry);
}
