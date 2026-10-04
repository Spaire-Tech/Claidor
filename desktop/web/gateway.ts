/**
 * The page's own coordinator: the Mac's gateway client, run in the browser.
 *
 * On a Mac the node-agent-coordinator sits between the window and the host
 * in the person's cloud computer: it asks the broker where the box is, then
 * POSTs each command to the box's gateway and reads its events over SSE,
 * through Simeon Labs' proxy (`/sand-box/{id}/p/1340`). Every piece of that
 * is `fetch`, so the same client runs here; what a browser cannot be is
 * the person's Mac, and those parts (local-exec, WebAuthn, the OAuth
 * loopback) are simply not wired.
 */
import {
  CoordinatorGatewayClient,
  createCoordinatorGatewayClientTiming,
  type GatewayConnection,
} from "../source/node-agent-coordinator/gateway/gateway-client.js";
import { SandHostSupervisor, createCoordinatorHostSupervisorTiming } from "../source/node-agent-coordinator/gateway/host-supervisor.js";
import { coordinatorEventFamilyForSseChannel } from "../source/node-agent-coordinator/gateway/gateway-event-families.js";
import { createGatewayRequestDispatch } from "../source/node-agent-coordinator/gateway/gateway-request-dispatcher.js";
import { ClientSideToolV2Relay } from "../source/node-agent-coordinator/client-side-tool-v2-relay.js";
import { carriesPermissionCard, stampTranscriptEvent, stampTranscriptReply, type TranscriptPermissionScope } from "../source/node-agent-coordinator/permission-scope-stamp.js";
import { COORDINATOR_TRANSPORT_STATE_FAMILY, type CoordinatorReplyOutcome } from "../source/shared/rpc/coordinator-port.js";
import { isCoordinatorMainMethod } from "../source/shared/rpc/coordinator-main.js";
import { GATEWAY_NETWORK_TOKEN_HEADER } from "../source/shared/gateway-wire.js";
import type { SimeonApi } from "./api.js";

/** `EnsureSandBox`'s answer (`server/simeon/sand/box_broker.py`). */
export interface BrokerBox {
  readonly gatewayUrl?: string;
  readonly gatewayToken?: string;
  readonly networkToken?: string;
  readonly vncUrl?: string;
  readonly forkVncBaseUrl?: string;
}

/** `buildConnection` in `box-host-connector.ts`, for a box the proxy fronts. */
export function connectionFromBox(box: BrokerBox): GatewayConnection {
  const baseUrl = box.gatewayUrl ?? "";
  if (baseUrl.length === 0) throw new Error("Simeon's cloud computer has no gateway address yet. Try again in a moment.");
  const networkToken = box.networkToken ?? "";
  const token = box.gatewayToken ?? "";
  const proxied = networkToken.length > 0 && (box.vncUrl ?? "").length > 0 && (box.forkVncBaseUrl ?? "").length > 0;
  return {
    baseUrl,
    ...(token.length > 0 ? { token } : {}),
    ...(networkToken.length > 0 ? { headers: { [GATEWAY_NETWORK_TOKEN_HEADER]: networkToken } } : {}),
    ...(proxied ? { vncProxy: { primaryUrl: box.vncUrl!, forkBaseUrl: box.forkVncBaseUrl!, networkToken } } : {}),
  };
}

/** The host's channel for a finished connected-app sign-in (`sand-host.ts`), which the Mac's coordinator has no family for: the page reads it itself. */
export const MCP_AUTH_CHANNEL = "mcp-auth";

export interface WebGatewayHooks {
  readonly api: SimeonApi;
  /** Events for the window, by coordinator family. */
  readonly postEvent: (family: string, payload: unknown) => void;
  /** The Allow card's account scope: the signed-in account's slot. */
  readonly accountSlot: () => string | null;
  readonly onTransport?: (state: "connected" | "down") => void;
  /** A connected-app sign-in finished in the box, in the shape the Mac's manager reports (`sand:mcp-auth-event`). */
  readonly onMcpAuthCompleted?: (completion: unknown) => void;
}

export function createWebGateway(hooks: WebGatewayHooks) {
  const revision = Date.now();
  const scope = (): TranscriptPermissionScope | null => {
    const slot = hooks.accountSlot();
    return slot == null ? null : { slot, revision };
  };
  let live = false;
  const toolRelay = new ClientSideToolV2Relay((family, payload) => hooks.postEvent(family, payload));

  const supervisor = new SandHostSupervisor({
    resolveGatewayConnection: async () => connectionFromBox(await hooks.api.connect<BrokerBox>("EnsureSandBox", {})),
    timing: createCoordinatorHostSupervisorTiming(),
    isTransportLive: () => live,
  });

  let transcriptChain: Promise<void> = Promise.resolve();
  const client = new CoordinatorGatewayClient({
    resolveConnection: (signal) => supervisor.ensureConnection(signal) as Promise<GatewayConnection>,
    timing: createCoordinatorGatewayClientTiming(),
    onEvent: (event) => {
      if (event.channel === "client-side-tool-v2") { toolRelay.accept(event.payload); return; }
      if (event.channel === MCP_AUTH_CHANNEL) { hooks.onMcpAuthCompleted?.(event.payload); return; }
      const family = coordinatorEventFamilyForSseChannel(event.channel);
      if (family == null) return;
      if (family === "transcript") {
        transcriptChain = transcriptChain.then(() => {
          hooks.postEvent(family, carriesPermissionCard(event.payload) ? stampTranscriptEvent(event.payload, scope()) : event.payload);
        }).catch(() => undefined);
        return;
      }
      hooks.postEvent(family, event.payload);
    },
    onTransportEvent: (raw) => {
      const event = raw as { family?: string } | null;
      if (event?.family === "transport-down") {
        live = false;
        supervisor.invalidateHealthCache();
        hooks.postEvent(COORDINATOR_TRANSPORT_STATE_FAMILY, { state: "down" });
        hooks.onTransport?.("down");
        return;
      }
      live = true;
      hooks.postEvent(COORDINATOR_TRANSPORT_STATE_FAMILY, { state: "connected" });
      hooks.onTransport?.("connected");
    },
    onTransportRetry: () => supervisor.invalidateHealthCache(),
  });

  const dispatchRenderer = createGatewayRequestDispatch(client);
  const dispatchMain = createGatewayRequestDispatch(client, isCoordinatorMainMethod);

  return {
    start(): void { client.start(); },
    close(): void { client.close(); toolRelay.clear(); },
    isLive(): boolean { return live; },
    forceReconnect(): Promise<void> { return client.forceReconnect(); },
    /** What the window posts on its coordinator port. */
    async dispatch(method: string, args: unknown, signal: AbortSignal): Promise<CoordinatorReplyOutcome> {
      const outcome = await dispatchRenderer(method, args, signal);
      if (outcome.status !== "ok" || !carriesPermissionCard(outcome.value)) return outcome;
      return { status: "ok", value: stampTranscriptReply(method, outcome.value, scope()) };
    },
    /** What the Mac's main process asks the host (`coordinator-main.ts`): host settings, secrets, the roster, connected apps. */
    async main(method: string, args: unknown): Promise<unknown> {
      const outcome = await dispatchMain(method, args);
      if (outcome.status === "ok") return outcome.value;
      throw new Error(outcome.failure.message);
    },
    onServing(): void {
      toolRelay.replay();
      if (!live) hooks.postEvent(COORDINATOR_TRANSPORT_STATE_FAMILY, { state: "down" });
    },
  };
}

export type WebGateway = ReturnType<typeof createWebGateway>;
