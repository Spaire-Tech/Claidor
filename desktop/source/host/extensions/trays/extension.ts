import { defineHostExtension } from "../../../internal/host-extensions.js";
import { HostExtensions } from "../extension-ids.generated.js";
import { TrayManager, type TrayEvent } from "./trays-service.js";

/**
 * Hands the host one list of error trays and six ways into it: the three
 * the window uses (list, dismiss, clear all), the one the host listens
 * through, and the two the other extensions push and clear with. It needs
 * no peer and leaves nothing to undo.
 */
export const traysExtension = defineHostExtension({
  id: HostExtensions.Trays,
  dependencies: [],
  start: () => {
    const trays = new TrayManager();
    return {
      list: () => trays.getTrays(),
      dismiss: ({ id }: { id: string }) => trays.dismiss(id),
      clearAll: () => trays.clearAll(),
      subscribe: (listener: (event: TrayEvent) => void) => trays.subscribe(listener),
      pushError: (options: Parameters<TrayManager["pushError"]>[0]) => trays.pushError(options),
      clearForAgent: (agentId: string) => trays.clearForAgent(agentId),
    };
  },
});
