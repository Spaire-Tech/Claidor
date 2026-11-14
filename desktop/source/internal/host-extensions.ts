/**
 * The host is made of extensions. Each has an id, names the peers it needs,
 * and starts by handing back whatever it offers the others. This file
 * declares an extension, finds an order in which every extension starts
 * after its peers, starts them in that order and stops them in reverse, and
 * carries the host's events from one to another by topic.
 */

/** What an extension is started with. */
export interface HostExtensionContext<Host = unknown> {
  /** What each peer it named handed back when it started, under the peer's id. */
  readonly deps: Record<string, unknown>;
  readonly host: Host;
  /** Leaves something to undo when the host stops. */
  readonly onStop: (teardown: () => void | Promise<void>) => void;
}

export interface HostExtensionDeclaration<Api = unknown, Host = unknown> {
  readonly kind: "host-extension";
  readonly id: string;
  /** The ids of the peers that must have started before this one. */
  readonly dependencies: readonly string[];
  readonly start: (context: HostExtensionContext<Host>) => Api | Promise<Api>;
}

/** Every declaration made here. Nothing reads it today. */
const declarations = new WeakSet<object>();

/**
 * An extension's declaration: the options as given, marked with the kind
 * and frozen, the list of peers copied so that the caller's own list can
 * change afterwards without changing it.
 */
export function defineHostExtension<Api, Host = unknown>(
  options: Omit<HostExtensionDeclaration<Api, Host>, "kind">,
): HostExtensionDeclaration<Api, Host> {
  const declaration = Object.freeze({
    kind: "host-extension" as const,
    ...options,
    dependencies: Object.freeze([...options.dependencies]),
  });
  declarations.add(declaration);
  return declaration;
}

/**
 * The host's events, by topic. `emit` calls every handler of the topic and
 * waits for all of them; one that fails is told to `onHandlerFailure` and
 * does not stop the others.
 */
export function createHostEvents(options: { readonly onHandlerFailure: (topic: string, error: unknown) => void }) {
  const handlersByTopic = new Map<string, Set<(payload: unknown) => unknown>>();

  /** The handlers of a topic, an empty set the first time it is subscribed to. */
  const subscribersOf = (topic: string): Set<(payload: unknown) => unknown> => {
    const known = handlersByTopic.get(topic);
    if (known !== undefined) return known;
    const fresh = new Set<(payload: unknown) => unknown>();
    handlersByTopic.set(topic, fresh);
    return fresh;
  };

  return {
    /**
     * Succeeds even when handlers fail, unless asked to reject: then it
     * fails with the first handler's failure, once every failure has been
     * told.
     */
    async emit(topic: string, payload: unknown, emitOptions?: { readonly failureMode?: "reject" }): Promise<void> {
      const handlers = handlersByTopic.get(topic);
      if (handlers === undefined || handlers.size === 0) return;
      // The handlers as they are now: one that joins or leaves during the event counts from the next one.
      const present = [...handlers];
      // Each is called at once. One that throws is a failure like one whose promise is broken.
      const outcomes = await Promise.allSettled(present.map(async (handler) => handler(payload)));

      let mustReject = false;
      let firstFailure: unknown;
      for (const outcome of outcomes) {
        if (outcome.status !== "rejected") continue;
        options.onHandlerFailure(topic, outcome.reason);
        if (emitOptions?.failureMode === "reject" && !mustReject) {
          mustReject = true;
          firstFailure = outcome.reason;
        }
      }
      if (mustReject) throw firstFailure;
    },

    /** Subscribes a handler to a topic, once however often it is given, and hands back the way to unsubscribe it. */
    on(topic: string, handler: (payload: unknown) => unknown): () => void {
      const handlers = subscribersOf(topic);
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}

/** The extensions cannot be put in an order: an id declared twice, a peer that is missing, or peers that wait on each other. */
export class HostExtensionGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostExtensionGraphError";
  }
}

/** An extension failed to start. What it threw is the cause. */
export class HostExtensionStartError extends Error {
  constructor(readonly extensionId: string, cause: unknown) {
    super(`host extension "${extensionId}" failed to start`, { cause });
    this.name = "HostExtensionStartError";
  }
}

/** Each extension's peers under its id. An id may be declared only once. */
function peersByIdOf(extensions: Iterable<{ readonly id: string; readonly dependencies: Iterable<string> }>): Map<string, Set<string>> {
  const peersById = new Map<string, Set<string>>();
  for (const extension of extensions) {
    if (peersById.has(extension.id)) throw new HostExtensionGraphError(`two host extensions declare the id "${extension.id}"`);
    peersById.set(extension.id, new Set(extension.dependencies));
  }
  return peersById;
}

/** Whether every one of `wanted` is among `present`. */
function allAmong(wanted: ReadonlySet<string>, present: ReadonlySet<string>): boolean {
  for (const one of wanted) {
    if (!present.has(one)) return false;
  }
  return true;
}

const LEADS_TO = " → ";

/**
 * A circle of peers found from `id`: the ids from the first one met twice,
 * round to that same id. `path` is the way walked so far. Peers that have
 * started are no part of a circle; the others are tried in the order of
 * their ids.
 */
function circleThrough(
  id: string,
  path: readonly string[],
  peersById: ReadonlyMap<string, ReadonlySet<string>>,
  started: ReadonlySet<string>,
): string[] | undefined {
  const metAt = path.indexOf(id);
  if (metAt !== -1) return [...path.slice(metAt), id];
  const walked = [...path, id];
  const peers = [...(peersById.get(id) ?? [])].sort();
  for (const peer of peers) {
    if (started.has(peer)) continue;
    const circle = circleThrough(peer, walked, peersById, started);
    if (circle !== undefined) return circle;
  }
  return undefined;
}

/** The extensions that cannot start, told as the first circle of peers found among them, or all of them when none is found. */
function circleAmong(peersById: ReadonlyMap<string, ReadonlySet<string>>, started: ReadonlySet<string>): string {
  const stuck = [...peersById.keys()].filter((id) => !started.has(id)).sort();
  for (const id of stuck) {
    const circle = circleThrough(id, [], peersById, started);
    if (circle !== undefined) return circle.join(LEADS_TO);
  }
  return stuck.join(LEADS_TO);
}

/**
 * The order to start the extensions in: each after all its peers, and, of
 * those that could start at the same moment, the first by id (ids compared
 * as texts, so capitals come before small letters).
 */
export function resolveHostExtensionBootOrder<Host = unknown>(extensions: readonly HostExtensionDeclaration<unknown, Host>[]): string[] {
  const peersById = peersByIdOf(extensions);
  for (const extension of extensions) {
    for (const peer of extension.dependencies) {
      if (peer === extension.id) throw new HostExtensionGraphError(`host extension "${extension.id}" declares itself as a peer`);
      if (!peersById.has(peer)) {
        throw new HostExtensionGraphError(`host extension "${extension.id}" requires the peer "${peer}", which is not in this build`);
      }
    }
  }

  const waiting = new Map(peersById);
  const started = new Set<string>();
  const order: string[] = [];
  while (waiting.size > 0) {
    const ready: string[] = [];
    for (const [id, peers] of waiting) {
      if (allAmong(peers, started)) ready.push(id);
    }
    if (ready.length === 0) throw new HostExtensionGraphError(`host extension peer cycle: ${circleAmong(peersById, started)}`);
    // An extension declared with no id at all sorts after every other, and is refused when nothing else is ready.
    const [next] = ready.sort();
    if (next === undefined) throw new HostExtensionGraphError("host extension boot order became empty unexpectedly");
    waiting.delete(next);
    started.add(next);
    order.push(next);
  }
  return order;
}

/**
 * Starts the extensions one after another, each given what its peers
 * handed back. If one fails, everything left to undo so far is undone and
 * the failure names that extension. `stop` undoes what the extensions left,
 * the last thing left first.
 */
export async function startHostExtensions<Host>(options: {
  readonly extensions: readonly HostExtensionDeclaration<unknown, Host>[];
  readonly host: Host;
  readonly onStopFailure: (extensionId: string, error: unknown) => void;
}) {
  const order = resolveHostExtensionBootOrder(options.extensions);
  const extensionById = new Map(options.extensions.map((extension) => [extension.id, extension]));
  const apis: Record<string, unknown> = {};
  /** What has been left to undo, in the order it was left. */
  const teardowns: Array<{ extensionId: string; run: () => void | Promise<void> }> = [];

  /** Undoes all that is left, newest first, one at a time. A teardown that fails is reported and the rest go on. */
  const stop = async (): Promise<void> => {
    const leaving = teardowns.splice(0).reverse();
    for (const teardown of leaving) {
      try {
        await teardown.run();
      } catch (error) {
        options.onStopFailure(teardown.extensionId, error);
      }
    }
  };

  for (const id of order) {
    const extension = extensionById.get(id);
    if (extension === undefined) throw new HostExtensionGraphError(`the resolved boot order names an unknown host extension "${id}"`);
    const deps: Record<string, unknown> = {};
    for (const peer of extension.dependencies) deps[peer] = apis[peer];
    try {
      apis[id] = await extension.start({
        deps,
        host: options.host,
        // Hands back what `push` does, the number of teardowns left so far, as it always has.
        onStop: (run) => teardowns.push({ extensionId: id, run }),
      });
    } catch (error) {
      await stop();
      throw new HostExtensionStartError(id, error);
    }
  }
  return { order, apis, stop };
}
