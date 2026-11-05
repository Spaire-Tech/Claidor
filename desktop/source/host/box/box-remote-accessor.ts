import { findSystemErrno } from "../../shared/system-errno.js";
import type { Context } from "../../packages/context/core.js";
import type { RemoteExecManager } from "../../packages/agent-exec/remote.js";
import type {
  ExecClientMessage,
  ExecServerMessage
} from "../../packages/proto/generated/agent/v1/exec_pb.js";

export interface BoxEndpoint {
  readonly host: string;
  readonly port: number;
  readonly authToken: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface BoxTransportHeader {
  set(name: string, value: string): void;
}

export interface BoxTransportRequest {
  readonly header: BoxTransportHeader;
}

export type BoxTransportNext<Response = unknown> = (
  request: BoxTransportRequest
) => Promise<Response>;

export type BoxTransportInterceptor = <Response>(
  next: BoxTransportNext<Response>
) => BoxTransportNext<Response>;

export interface BoxTransportOptions {
  readonly httpVersion: "1.1";
  readonly baseUrl: string;
  readonly useBinaryFormat: true;
  readonly interceptors: readonly BoxTransportInterceptor[];
}

export type BoxTransportFactory<Transport> = (
  options: BoxTransportOptions
) => Transport;

export interface BoxPingControlClient {
  ping(
    ctx: Context,
    request: Readonly<Record<string, never>>,
    options: { readonly timeoutMs: number }
  ): Promise<unknown>;
}

export type BoxControlClientFactory<Transport> = (
  transport: Transport
) => BoxPingControlClient;

export type BoxRemoteExecControlMessage =
  | {
      readonly case: "streamClose";
      readonly value: { readonly id: number };
    }
  | {
      readonly case: "throw";
      readonly value: {
        readonly id?: number;
        readonly error: string;
        readonly stackTrace?: string;
        readonly errorCode?: string;
      };
    }
  | {
      readonly case: "heartbeat";
      readonly value: { readonly id: number };
    }
  | { readonly case: undefined; readonly value?: undefined };

export interface BoxRemoteExecEnvelope {
  readonly element:
    | { readonly case: "execClientMessage"; readonly value: ExecClientMessage }
    | {
        readonly case: "execClientControlMessage";
        readonly value: {
          readonly message: BoxRemoteExecControlMessage;
        };
      }
    | { readonly case: undefined; readonly value?: undefined };
}

export interface BoxRemoteExecClient {
  exec(ctx: Context, args: ExecServerMessage): AsyncIterable<BoxRemoteExecEnvelope>;
}

export interface BoxRemoteResourceConstructionPorts<Transport, Accessor> {
  readonly createTransport: BoxTransportFactory<Transport>;
  createExecClient(transport: Transport): BoxRemoteExecClient;
  createResourceAccessor(manager: BoxRemoteExecManager): Accessor;
}

export type BoxPingOutcome = {
  readonly outcome: "ok" | "timeout" | "refused" | "crash";
  readonly latencyMs: number;
  readonly causeSummary?: string;
};

const CONNECT_CODE_NAMES: Readonly<Record<number, string>> = Object.freeze({
  1: "Canceled",
  2: "Unknown",
  3: "InvalidArgument",
  4: "DeadlineExceeded",
  5: "NotFound",
  6: "AlreadyExists",
  7: "PermissionDenied",
  8: "ResourceExhausted",
  9: "FailedPrecondition",
  10: "Aborted",
  11: "OutOfRange",
  12: "Unimplemented",
  13: "Internal",
  14: "Unavailable",
  15: "DataLoss",
  16: "Unauthenticated"
});

function connectCode(error: unknown): number | string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = error.code;
  return typeof code === "number" || typeof code === "string"
    ? code
    : undefined;
}

function connectCodeName(error: unknown): string {
  const code = connectCode(error);
  if (typeof code === "number") return CONNECT_CODE_NAMES[code] ?? "unknown";
  if (typeof code === "string" && code.length > 0) return code;
  return "unknown";
}

export function createBoxAuthorizationInterceptor(
  endpoint: BoxEndpoint,
  routeHeaders: Readonly<Record<string, string>> = {}
): BoxTransportInterceptor {
  return next => async request => {
    for (const [name, value] of Object.entries(routeHeaders)) {
      request.header.set(name, value);
    }
    request.header.set("Authorization", `Bearer ${endpoint.authToken}`);
    for (const [name, value] of Object.entries(endpoint.headers ?? {})) {
      request.header.set(name, value);
    }
    return await next(request);
  };
}

/**
 * Where the engine reaches the computer's hands when it runs off the
 * computer (the brain, `docs/agents-on-the-server/README.md`, step 1).
 * Every call goes to `SIMEON_HANDS_URL`, the API's door to the computer's
 * window router (1339), with the headers in `SIMEON_HANDS_HEADERS` (a JSON
 * object of strings) added. A call meant for the main hands program (1337)
 * carries no window header, and the router sends such a call there, so one
 * door serves both. Neither set (the engine on the computer): the hands are
 * dialled at `http://host:port` as before.
 */
export interface BoxHandsRoute {
  readonly baseUrl: string;
  readonly headers: Readonly<Record<string, string>>;
}

export const SIMEON_HANDS_URL_ENV = "SIMEON_HANDS_URL";
export const SIMEON_HANDS_HEADERS_ENV = "SIMEON_HANDS_HEADERS";

/** Headers the route may not set: the hands program's own bearer, and the
 * window headers each call carries for itself. */
const ROUTE_HEADERS_REFUSED = new Set(["authorization", "x-sand-display", "x-sand-window-owner"]);

export class BoxHandsRouteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoxHandsRouteError";
  }
}

/**
 * The route read from the environment, or null when neither setting is
 * there. A half-set or malformed route throws: an engine on the brain that
 * quietly dialled 127.0.0.1 would wait for a computer that is not there.
 * The message names the setting, never its value (the headers hold tokens).
 */
export function boxHandsRouteFromEnv(env: Record<string, string | undefined> = process.env): BoxHandsRoute | null {
  const rawUrl = env[SIMEON_HANDS_URL_ENV]?.trim() ?? "";
  const rawHeaders = env[SIMEON_HANDS_HEADERS_ENV]?.trim() ?? "";
  if (rawUrl.length === 0 && rawHeaders.length === 0) return null;
  if (rawUrl.length === 0) throw new BoxHandsRouteError(`${SIMEON_HANDS_HEADERS_ENV} is set without ${SIMEON_HANDS_URL_ENV}`);
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BoxHandsRouteError(`${SIMEON_HANDS_URL_ENV} is not a URL`);
  }
  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new BoxHandsRouteError(`${SIMEON_HANDS_URL_ENV} must be https (http only for 127.0.0.1 or localhost)`);
  }
  if (url.search.length > 0 || url.hash.length > 0) throw new BoxHandsRouteError(`${SIMEON_HANDS_URL_ENV} must have no query or fragment`);
  const headers: Record<string, string> = {};
  if (rawHeaders.length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawHeaders);
    } catch {
      throw new BoxHandsRouteError(`${SIMEON_HANDS_HEADERS_ENV} is not JSON`);
    }
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new BoxHandsRouteError(`${SIMEON_HANDS_HEADERS_ENV} must be a JSON object`);
    }
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value !== "string" || !/^[A-Za-z0-9-]+$/.test(name)) {
        throw new BoxHandsRouteError(`${SIMEON_HANDS_HEADERS_ENV} must map header names to strings`);
      }
      if (ROUTE_HEADERS_REFUSED.has(name.toLowerCase())) {
        throw new BoxHandsRouteError(`${SIMEON_HANDS_HEADERS_ENV} may not set ${name.toLowerCase()}`);
      }
      headers[name] = value;
    }
  }
  return { baseUrl: url.toString().replace(/\/+$/, ""), headers };
}

export function createBoxTransport<Transport>(
  endpoint: BoxEndpoint,
  factory: BoxTransportFactory<Transport>,
  route: BoxHandsRoute | null = boxHandsRouteFromEnv()
): Transport {
  return factory({
    httpVersion: "1.1",
    baseUrl: route?.baseUrl ?? `http://${endpoint.host}:${endpoint.port}`,
    useBinaryFormat: true,
    interceptors: [createBoxAuthorizationInterceptor(endpoint, route?.headers)]
  });
}

export function classifyPingFailure(
  error: unknown
): { outcome: "timeout" | "refused" | "crash"; causeSummary: string } {
  const errno = findSystemErrno(error);
  const codeName = connectCodeName(error);
  const causeSummary = errno == null ? codeName : `${codeName}/${errno}`;
  const message = error instanceof Error ? error.message : "";
  if (connectCode(error) === 4 || /deadline/i.test(message)) {
    return { outcome: "timeout", causeSummary };
  }
  if (errno === "ECONNREFUSED" || /ECONNREFUSED/i.test(message)) {
    return { outcome: "refused", causeSummary };
  }
  return { outcome: "crash", causeSummary };
}

export async function pingBoxTransportClassified<Transport>(
  ctx: Context,
  transport: Transport,
  createControlClient: BoxControlClientFactory<Transport>,
  timeoutMs = 1_500,
  now: () => number = Date.now
): Promise<BoxPingOutcome> {
  const control = createControlClient(transport);
  const start = now();
  try {
    await control.ping(ctx, {}, { timeoutMs });
    return { outcome: "ok", latencyMs: now() - start };
  } catch (error) {
    return { ...classifyPingFailure(error), latencyMs: now() - start };
  }
}

export async function pingBoxClassified<Transport>(
  ctx: Context,
  endpoint: BoxEndpoint,
  ports: {
    readonly createTransport: BoxTransportFactory<Transport>;
    readonly createControlClient: BoxControlClientFactory<Transport>;
  },
  timeoutMs = 1_500
): Promise<BoxPingOutcome> {
  const transport = createBoxTransport(endpoint, ports.createTransport);
  return await pingBoxTransportClassified(
    ctx,
    transport,
    ports.createControlClient,
    timeoutMs
  );
}

export async function pingBoxTransport<Transport>(
  ctx: Context,
  transport: Transport,
  createControlClient: BoxControlClientFactory<Transport>,
  timeoutMs = 1_500
): Promise<boolean> {
  return (
    await pingBoxTransportClassified(
      ctx,
      transport,
      createControlClient,
      timeoutMs
    )
  ).outcome === "ok";
}

export async function pingBox<Transport>(
  ctx: Context,
  endpoint: BoxEndpoint,
  ports: {
    readonly createTransport: BoxTransportFactory<Transport>;
    readonly createControlClient: BoxControlClientFactory<Transport>;
  },
  timeoutMs = 1_500
): Promise<boolean> {
  return (
    await pingBoxClassified(ctx, endpoint, ports, timeoutMs)
  ).outcome === "ok";
}

export class BoxRemoteExecManager implements RemoteExecManager {
  #nextId = 0;

  constructor(readonly client: BoxRemoteExecClient) {}

  async *createExecInstance(
    ctx: Context,
    serialize: (id: number) => ExecServerMessage
  ): AsyncIterable<ExecClientMessage> {
    for await (const message of this.client.exec(ctx, serialize(this.#nextId++))) {
      if (message.element.case === "execClientMessage") {
        yield message.element.value;
        continue;
      }
      if (message.element.case !== "execClientControlMessage") continue;
      const control = message.element.value;
      if (control.message.case !== "throw") continue;
      const thrown = control.message.value;
      const error = new Error(thrown.error);
      if (thrown.stackTrace != null && thrown.stackTrace.length > 0) {
        error.stack = thrown.stackTrace;
      }
      throw error;
    }
  }
}

export function createBoxRemoteResourceAccessorFromTransport<
  Transport,
  Accessor
>(
  transport: Transport,
  ports: Pick<
    BoxRemoteResourceConstructionPorts<Transport, Accessor>,
    "createExecClient" | "createResourceAccessor"
  >
): Accessor {
  return ports.createResourceAccessor(
    new BoxRemoteExecManager(ports.createExecClient(transport))
  );
}

export function createBoxRemoteResourceAccessor<Transport, Accessor>(
  endpoint: BoxEndpoint,
  ports: BoxRemoteResourceConstructionPorts<Transport, Accessor>
): Accessor {
  return createBoxRemoteResourceAccessorFromTransport(
    createBoxTransport(endpoint, ports.createTransport),
    ports
  );
}
