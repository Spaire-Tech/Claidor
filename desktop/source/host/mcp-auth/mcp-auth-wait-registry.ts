export const DEFAULT_MCP_AUTH_WAIT_TTL_MS = 60 * 60 * 1_000;

export function normalizeConnectorName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface McpAuthCompletionIdentity {
  readonly serverId: string;
  readonly serverName: string;
}

type WaitEntry = {
  agentId: string;
  serverId: string | null;
  expiresAtMs: number;
};

export class McpAuthWaitRegistry {
  readonly #waits = new Map<string, WaitEntry>();
  readonly #ttlMs: number;
  readonly #now: () => number;

  constructor(options?: { readonly ttlMs?: number; readonly now?: () => number }) {
    this.#ttlMs = options?.ttlMs ?? DEFAULT_MCP_AUTH_WAIT_TTL_MS;
    this.#now = options?.now ?? Date.now;
  }

  register(event: {
    readonly agentId: string;
    readonly connector: string;
    readonly serverId?: string | null;
  }): void {
    this.prune();
    const serverId =
      event.serverId != null && String(event.serverId).length > 0
        ? String(event.serverId)
        : null;
    const nameKey = normalizeConnectorName(event.connector);
    const key =
      nameKey.length > 0 ? nameKey : serverId != null ? `id:${serverId}` : null;
    if (key != null) {
      this.#waits.set(key, {
        agentId: event.agentId,
        serverId,
        expiresAtMs: this.#now() + this.#ttlMs,
      });
    }
  }

  /**
   * Resume matching: prefer serverId equality, then connector/serverName.
   * Name match must work even when the wait was registered with a serverId —
   * InstallPlugin/AuthenticateMcpServer always pass both, and desktop OAuth
   * completion sometimes arrives with a mismatched id shape.
   */
  take(completion: McpAuthCompletionIdentity): string | null {
    this.prune();
    const nameKey = normalizeConnectorName(completion.serverName);
    const completionServerId = String(completion.serverId ?? "");
    let byServerId: WaitEntry | null = null;
    let byName: WaitEntry | null = null;
    for (const [key, entry] of [...this.#waits]) {
      const idMatch =
        entry.serverId != null &&
        completionServerId.length > 0 &&
        entry.serverId === completionServerId;
      // Previously required entry.serverId == null, which dropped waits that
      // were registered with both connector + serverId (the common path).
      const nameMatch = nameKey.length > 0 && key === nameKey;
      if (!idMatch && !nameMatch) continue;
      this.#waits.delete(key);
      if (idMatch) byServerId = entry;
      else byName = entry;
    }
    return (byServerId ?? byName)?.agentId ?? null;
  }

  prune(): void {
    const now = this.#now();
    for (const [key, entry] of [...this.#waits]) {
      if (entry.expiresAtMs <= now) this.#waits.delete(key);
    }
  }
}
