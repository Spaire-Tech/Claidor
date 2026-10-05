/**
 * The window's end of the coordinator port: the MessagePort the main
 * process hands over (window.coordinatorPort.claim), framed as
 * source/shared/rpc/coordinator-port.ts says: a "hello" lifecycle frame,
 * "ready" back, then request/reply pairs by requestId and "event" frames by
 * family. When the port closes or the coordinator asks for a shutdown, the
 * client asks for a new port and every waiting call fails plainly.
 */
import type { CoordinatorDoor, TransferredPort, Unsubscribe } from "./types.js";

export const COORDINATOR_PROTOCOL_VERSION = 1;
export const TRANSPORT_STATE_FAMILY = "coordinator-transport-state";

export type TransportState = "connected" | "down";

export class CoordinatorCallError extends Error {
  constructor(readonly code: string, message: string, readonly transportKind?: string) {
    super(`${code}: ${message}`);
    this.name = "CoordinatorCallError";
  }
}

export interface CoordinatorClient {
  readonly ready: Promise<void>;
  call<T = unknown>(method: string, args?: unknown): Promise<T>;
  subscribe(family: string, listener: (payload: unknown) => void): Unsubscribe;
  subscribeTransport(listener: (state: TransportState) => void): Unsubscribe;
  dispose(): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function createCoordinatorClient(door: CoordinatorDoor): CoordinatorClient | null {
  const eventListeners = new Map<string, Set<(payload: unknown) => void>>();
  const transportListeners = new Set<(state: TransportState) => void>();
  const pending = new Map<string, { method: string; resolve(value: unknown): void; reject(error: unknown): void }>();
  let port: TransferredPort | null = null;
  let serving = false;
  let disposed = false;
  let nextRequestId = 0;
  let resolveReady = () => {};
  let rejectReady = (_reason: unknown) => {};
  const makeReady = () => {
    const promise = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    promise.catch(() => {});
    return promise;
  };
  const ready = makeReady();
  let currentReady = ready;

  const failPending = (reason: string) => {
    rejectReady(new Error(reason));
    for (const waiting of pending.values()) waiting.reject(new Error(`${waiting.method} failed: ${reason}`));
    pending.clear();
  };
  const tell = (state: TransportState) => { for (const listener of transportListeners) listener(state); };

  let claim: ReturnType<CoordinatorDoor["claim"]> = null;
  const disconnect = (expected: TransferredPort, reason: string) => {
    if (disposed || port !== expected) return;
    port = null;
    serving = false;
    failPending(reason);
    tell("down");
    currentReady = makeReady();
    claim?.request();
  };

  const handle = (expected: TransferredPort, value: unknown) => {
    if (port !== expected || disposed) return;
    if (!isRecord(value) || typeof value.kind !== "string") {
      expected.postMessage({ kind: "lifecycle", phase: "shutdown", reason: "protocol-error", detail: "malformed frame" });
      return disconnect(expected, "the coordinator posted a malformed frame");
    }
    if (value.kind === "lifecycle" && value.phase === "ready") {
      if (value.protocolVersion !== COORDINATOR_PROTOCOL_VERSION) return disconnect(expected, "coordinator protocol version mismatch");
      serving = true;
      resolveReady();
      tell("connected");
      return;
    }
    if (value.kind === "lifecycle" && value.phase === "shutdown") return disconnect(expected, "the coordinator asked to shut down");
    if (value.kind === "reply" && typeof value.requestId === "string" && isRecord(value.outcome)) {
      const waiting = pending.get(value.requestId);
      if (waiting == null) return;
      pending.delete(value.requestId);
      if (value.outcome.status === "ok") waiting.resolve(value.outcome.value);
      else {
        const failure = isRecord(value.outcome.failure) ? value.outcome.failure : {};
        waiting.reject(new CoordinatorCallError(
          typeof failure.code === "string" ? failure.code : "failed",
          typeof failure.message === "string" ? failure.message : "Coordinator request failed",
          typeof failure.transportKind === "string" ? failure.transportKind : undefined,
        ));
      }
      return;
    }
    if (value.kind === "event" && typeof value.family === "string") {
      if (value.family === TRANSPORT_STATE_FAMILY && isRecord(value.payload) && (value.payload.state === "connected" || value.payload.state === "down")) tell(value.payload.state);
      for (const listener of eventListeners.get(value.family) ?? []) listener(value.payload);
    }
  };

  claim = door.claim({
    onPort(next) {
      if (disposed) return next.close();
      const previous = port;
      if (previous != null) failPending("coordinator session replaced");
      port = next;
      previous?.close();
      serving = false;
      if (previous != null) currentReady = makeReady();
      next.addEventListener("message", event => handle(next, event.data));
      next.addEventListener("close", () => disconnect(next, "the coordinator port closed"));
      next.start();
      next.postMessage({ kind: "lifecycle", phase: "hello", protocolVersion: COORDINATOR_PROTOCOL_VERSION });
    },
  });
  if (claim == null) return null;
  claim.request();

  return {
    ready,
    async call<T>(method: string, args: unknown = {}): Promise<T> {
      await currentReady;
      if (disposed || port == null || !serving) throw new Error(`the coordinator is unavailable for ${method}`);
      const requestId = `w-${++nextRequestId}`;
      const reply = new Promise<unknown>((resolve, reject) => pending.set(requestId, { method, resolve, reject }));
      port.postMessage({ kind: "request", requestId, method, args });
      return await reply as T;
    },
    subscribe(family, listener) {
      const listeners = eventListeners.get(family) ?? new Set();
      listeners.add(listener);
      eventListeners.set(family, listeners);
      return () => { listeners.delete(listener); };
    },
    subscribeTransport(listener) {
      transportListeners.add(listener);
      return () => { transportListeners.delete(listener); };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      port?.postMessage({ kind: "lifecycle", phase: "shutdown", reason: "requested", detail: null });
      claim?.release();
      failPending("the window closed its coordinator client");
      port?.close();
      port = null;
      serving = false;
    },
  };
}
