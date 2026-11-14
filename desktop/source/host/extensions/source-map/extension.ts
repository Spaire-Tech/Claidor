import { defineHostExtension } from "../../../internal/host-extensions.js";
import { HostExtensions } from "../extension-ids.generated.js";
import { SandSourceMap } from "./source-map-service.js";

/** Hands the host its map of the agents' stores, on the data folder's own file. It needs no peer and leaves nothing to undo. */
export const sourceMapExtension = defineHostExtension({
  id: HostExtensions.SourceMap,
  dependencies: [],
  start: () => new SandSourceMap(),
});
