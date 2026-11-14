/**
 * Resources: what a tool needs carried out, named by a mark of its own.
 *
 * A resource knows the two ways to its implementation. On the side that
 * asks, the implementation is made from the connection to the side that does
 * the work. On that working side, a real implementation is registered with
 * the manager that hands incoming requests to it. Accessors answer the
 * question "what implements this resource here?".
 */

export interface Resource<Implementation, RemoteManager = unknown, ControlledManager = unknown> {
  /** The mark the resource is found by. No two resources share one. */
  readonly symbol: symbol;
  readonly remoteImplementation: (manager: RemoteManager) => Implementation;
  readonly registerControlledImplementation: (implementation: Implementation, manager: ControlledManager) => void;
}

export function createResource<Implementation, RemoteManager = unknown, ControlledManager = unknown>(
  remoteImplementation: (manager: RemoteManager) => Implementation,
  controlledImplementation: (implementation: Implementation, manager: ControlledManager) => void,
): Resource<Implementation, RemoteManager, ControlledManager> {
  return {
    symbol: Symbol(),
    remoteImplementation,
    registerControlledImplementation: controlledImplementation,
  };
}

/** A resource and what implements it, as the pair the accessors take. */
export function resourceEntry<Implementation, RemoteManager, ControlledManager>(
  resource: Resource<Implementation, RemoteManager, ControlledManager>,
  implementation: Implementation,
): readonly [Resource<Implementation, RemoteManager, ControlledManager>, Implementation] {
  return [resource, implementation];
}

/** The half of a resource the asking side needs. */
export interface RemoteResource<Implementation, RemoteManager> {
  readonly symbol: symbol;
  readonly remoteImplementation: (manager: RemoteManager) => Implementation;
}

export interface ResourceAccessor<RemoteManager> {
  get<Implementation>(resource: RemoteResource<Implementation, RemoteManager>): Implementation;
}

/** Answers with the far side's implementation, made from the connection anew each time it is asked. */
export class RemoteResourceAccessor<RemoteManager> {
  constructor(private readonly connection: RemoteManager) {}

  get<Implementation>(resource: RemoteResource<Implementation, RemoteManager>): Implementation {
    return resource.remoteImplementation(this.connection);
  }
}

/** The half of a resource the working side needs. */
export interface RegisteredControlledResource {
  readonly symbol: symbol;
  readonly registerControlledImplementation: (implementation: unknown, manager: ControlledExecManager) => void;
}

/** One line of a registry: a resource and the implementation registered for it. */
interface Registered {
  readonly resource: RegisteredControlledResource;
  readonly implementation: unknown;
}

/**
 * The implementations of the working side, one for each resource. A resource
 * registered again keeps its place and takes the new implementation.
 */
export class RegistryResourceAccessor {
  private readonly byMark = new Map<symbol, Registered>();

  register<Implementation, RemoteManager, ControlledManager>(
    resource: Resource<Implementation, RemoteManager, ControlledManager>,
    value: Implementation,
  ): void {
    this.byMark.set(resource.symbol, {
      resource: resource as unknown as RegisteredControlledResource,
      implementation: value,
    });
  }

  get<Implementation, RemoteManager, ControlledManager>(
    resource: Resource<Implementation, RemoteManager, ControlledManager>,
  ): Implementation | undefined {
    return this.byMark.get(resource.symbol)?.implementation as Implementation | undefined;
  }

  /** Every resource with its implementation, as new pairs, in the order the resources first came. */
  entries(): Array<readonly [RegisteredControlledResource, unknown]> {
    return Array.from(this.byMark.values(), ({ resource, implementation }) => [resource, implementation] as const);
  }
}

/**
 * An accessor laid over another: it answers with its own implementations,
 * and asks the one below for every resource it has none for. Having one that
 * is undefined still counts as having one.
 */
export class CombinedResourceAccessor<RemoteManager> implements ResourceAccessor<RemoteManager> {
  private readonly own = new Map<symbol, unknown>();

  constructor(
    private readonly below: ResourceAccessor<RemoteManager>,
    localResourceEntries: ReadonlyArray<readonly [RemoteResource<unknown, RemoteManager>, unknown]>,
  ) {
    for (const [resource, implementation] of localResourceEntries) {
      this.own.set(resource.symbol, implementation);
    }
  }

  get<Implementation>(resource: RemoteResource<Implementation, RemoteManager>): Implementation {
    const mark = resource.symbol;
    if (this.own.has(mark)) return this.own.get(mark) as Implementation;
    return this.below.get(resource);
  }
}

/** The manager of the working side, as far as a resource needs it: something to register a handler with. */
export interface ControlledExecManager {
  register(handler: unknown): void;
}
