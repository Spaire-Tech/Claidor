import { McpAuthWaitRegistry } from "./mcp-auth-wait-registry.js";

export interface HostMcpAuthCompletionEvent {
  readonly serverId: string;
  readonly serverName: string;
  readonly accountKey: string;
  readonly outcome?: string;
  readonly requestingAgentId?: string | null;
}

/** Sentinel the desktop IPC path used to pass as requestingAgentId before the
 *  facade split trigger into its own argument — never a real agent id. */
export const CONNECTOR_CARD_TRIGGER_SENTINEL = "connector_card";

/**
 * Pick which agent to resume after MCP OAuth. Prefers an explicit requesting
 * agent, then the host auth-watch agent (noteAuthCompletedElsewhere), then the
 * connect-card wait registry. Drops empty / sentinel values so a void-typed
 * or desktop-null path cannot poison resume with "connector_card".
 */
export function resolveMcpAuthResumeAgentId(options: {
  readonly requestingAgentId?: string | null;
  readonly watchAgentId?: string | null;
  readonly waitingAgentId?: string | null;
}): string | null {
  for (const candidate of [
    options.requestingAgentId,
    options.watchAgentId,
    options.waitingAgentId,
  ]) {
    if (
      typeof candidate === "string" &&
      candidate.length > 0 &&
      candidate !== CONNECTOR_CARD_TRIGGER_SENTINEL
    ) {
      return candidate;
    }
  }
  return null;
}

export class HostMcpAuthCompletion {
  readonly waits: McpAuthWaitRegistry;

  constructor(
    readonly deps: {
      readonly getMcp: () => {
        noteAuthCompletedElsewhere(
          serverId: string,
          accountKey: string,
        ): string | null | undefined;
        management: { restart(): Promise<unknown> };
      };
      readonly getTranscript: () => {
        resumeAfterMcpAuth(
          agentId: string,
          serverName: string,
          accountKey: string,
        ): Promise<unknown>;
      };
    },
    options?: { readonly waitRegistry?: McpAuthWaitRegistry },
  ) {
    this.waits = options?.waitRegistry ?? new McpAuthWaitRegistry();
  }

  registerConnectCard(
    event: Parameters<McpAuthWaitRegistry["register"]>[0],
  ): void {
    this.waits.register(event);
  }

  resolve(completion: HostMcpAuthCompletionEvent): void {
    const waitingAgentId = this.waits.take(completion);
    // Must preserve the returned agent id — SandMcpAuthWatchLifecycle returns
    // requestingAgentId; a void-typed host port previously dropped it at the
    // type boundary and left resume depending only on the wait registry.
    const watchAgentId = this.deps
      .getMcp()
      .noteAuthCompletedElsewhere(completion.serverId, completion.accountKey);
    if (completion.outcome === "cancelled") return;
    const agentId = resolveMcpAuthResumeAgentId({
      requestingAgentId: completion.requestingAgentId,
      watchAgentId,
      waitingAgentId,
    });
    if (agentId != null) {
      void this.deps
        .getTranscript()
        .resumeAfterMcpAuth(
          agentId,
          completion.serverName,
          completion.accountKey,
        );
    }
  }

  async resolveDesktop(
    completion: HostMcpAuthCompletionEvent,
  ): Promise<void> {
    try {
      await this.deps.getMcp().management.restart();
    } catch {}
    this.resolve(completion);
  }
}
