import { createDebouncePolicy, realClock } from "../../../internal/scheduling.js";
import { defineHostExtension } from "../../../internal/host-extensions.js";
import { HostExtensions } from "../extension-ids.generated.js";
import { STATE_BACKSTOP_DEBOUNCE_MS, SandStateBackstop, isStateBackstopEnabled, type StateBackstopDeps } from "./state-backstop-service.js";

/** What the host is handed while the backstop is switched off: the same four ways, none of which does anything. */
function switchedOff() {
  return {
    isEnabled: false,
    scheduleSnapshot: () => {},
    snapshotNow: async () => ({ status: "skipped", reason: "backstop disabled" }),
    readSnapshot: async () => null,
  };
}

/**
 * The extension that offers the host the backstop of the agents' state. It
 * is made with what only the host's builder knows (the agents' folder and
 * how a state file is read) and takes the rest from its two peers: the
 * store provider from the store sync, and the map of stores. The setting is
 * read at each start. Switched on, snapshots wait five seconds on the
 * machine's own clock, and the host stopping drops those still waiting.
 */
export function createStateBackstopExtension(runtime: Pick<StateBackstopDeps, "agentsRootDir" | "readDbBytes">, env: NodeJS.ProcessEnv = process.env) {
  return defineHostExtension<unknown, { log(message: string): void }>({
    id: HostExtensions.StateBackstop,
    dependencies: [HostExtensions.BoxStoreSync, HostExtensions.SourceMap],
    start: (context) => {
      if (!isStateBackstopEnabled(env)) return switchedOff();

      const backstop = new SandStateBackstop({
        objectStoreProvider: (context.deps[HostExtensions.BoxStoreSync] as { objectStoreProvider: StateBackstopDeps["objectStoreProvider"] }).objectStoreProvider,
        sourceMap: context.deps[HostExtensions.SourceMap] as StateBackstopDeps["sourceMap"],
        debounce: createDebouncePolicy(realClock, { name: "sand-state-backstop-snapshot", delayMs: STATE_BACKSTOP_DEBOUNCE_MS }),
        // Last, so that whatever the builder brings takes the place of the three above.
        ...runtime,
      });
      context.onStop(() => backstop.dispose());
      context.host.log("SandState S3 backstop enabled");

      return {
        isEnabled: true,
        scheduleSnapshot: (agentId: string) => backstop.scheduleSnapshot(agentId),
        snapshotNow: (agentId: string) => backstop.snapshotNow(agentId),
        readSnapshot: (agentId: string) => backstop.readSnapshot(agentId),
      };
    },
  });
}
