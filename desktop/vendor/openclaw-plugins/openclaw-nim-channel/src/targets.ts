/**
 * Normalize a NIM target to a plain ID, stripping known prefixes.
 * Handles: nim:, user:, account:, p2p:, team:, superTeam:
 */
export function normalizeNimTarget(target: string): string | null {
  if (!target || typeof target !== "string") {
    return null;
  }

  let normalized = target.trim();

  // Remove common prefixes (order matters: longer prefixes first)
  const prefixes = [
    "superTeam:",
    "nim:qchat:",
    "nim:",
    "user:",
    "account:",
    "p2p:",
    "team:",
  ];
  for (const prefix of prefixes) {
    if (normalized.toLowerCase().startsWith(prefix.toLowerCase())) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }

  normalized = normalized.trim();

  if (!normalized) {
    return null;
  }

  return normalized;
}

/**
 * Parse a NIM target string into an ID and session type.
 * Detects team: and superTeam: prefixes to determine session type.
 * Returns "p2p" for plain targets or user:/nim:/p2p: prefixes.
 */
export function parseNimTarget(
  target: string,
): { id: string; sessionType: "p2p" | "team" | "superTeam" } | null {
  if (!target || typeof target !== "string") {
    return null;
  }

  const trimmed = target.trim().toLowerCase();

  if (trimmed.startsWith("superteam:")) {
    const id = target.trim().slice("superTeam:".length).trim();
    return id ? { id, sessionType: "superTeam" } : null;
  }

  if (trimmed.startsWith("team:")) {
    const id = target.trim().slice("team:".length).trim();
    return id ? { id, sessionType: "team" } : null;
  }

  const id = normalizeNimTarget(target);
  return id ? { id, sessionType: "p2p" } : null;
}

/**
 * Check if a string looks like a NIM target (account ID, team ID, etc.).
 * Accepts plain IDs and prefixed forms: user:, nim:, team:, superTeam:
 */
export function looksLikeNimId(value: string): boolean {
  if (!value || typeof value !== "string") {
    return false;
  }

  // Accept prefixed team/superTeam targets (numeric IDs)
  const lc = value.trim().toLowerCase();
  if (lc.startsWith("team:") || lc.startsWith("superteam:")) {
    const parsed = parseNimTarget(value);
    return parsed !== null && parsed.id.length > 0;
  }

  const normalized = normalizeNimTarget(value);
  if (!normalized) {
    return false;
  }

  // NIM account/team IDs: alphanumeric, underscores, or purely numeric
  return /^[a-zA-Z0-9_]{1,32}$/.test(normalized);
}

/**
 * Format a NIM target for display.
 */
export function formatNimTarget(target: string): string {
  const normalized = normalizeNimTarget(target);
  if (!normalized) {
    return target;
  }
  return `nim:${normalized}`;
}

/**
 * Build a session ID for a P2P conversation.
 */
export function buildP2pSessionId(account1: string, account2: string): string {
  // NIM session IDs are typically "p2p-{targetAccount}"
  return `p2p-${account2}`;
}

/**
 * Parse a session ID to extract the target account.
 */
export function parseSessionId(
  sessionId: string,
): { scene: "p2p" | "team"; targetId: string } | null {
  if (!sessionId) {
    return null;
  }

  if (sessionId.startsWith("p2p-")) {
    return {
      scene: "p2p",
      targetId: sessionId.slice(4),
    };
  }

  if (sessionId.startsWith("team-")) {
    return {
      scene: "team",
      targetId: sessionId.slice(5),
    };
  }

  // Assume P2P if no prefix
  return {
    scene: "p2p",
    targetId: sessionId,
  };
}
