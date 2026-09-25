import { defineHostExtension } from "../../../internal/host-extensions.js";
import { HostExtensions } from "../extension-ids.generated.js";
import { createChannelRuntime, type ChannelRuntime, type ChannelRuntimeTranscript } from "./channel-runtime.js";

/**
 * The messaging-channel connectors, in the box (25 September 2026). It
 * depends on the transcript extension only: the manager owns the channel
 * store, the secret store and the wake queue, and this extension supplies
 * the one thing the reconstruction never had, the module that registers
 * against `setChannelDelivery`, `setChannelActivity` and
 * `setChannelConfigChanged` and calls `wakeForInbound`.
 */
export const channelsExtension = defineHostExtension<ChannelRuntime, { log(message: string): void }>({
  id: HostExtensions.Channels,
  dependencies: [HostExtensions.Transcript],
  start: (context) => {
    const transcript = context.deps[HostExtensions.Transcript] as unknown as ChannelRuntimeTranscript;
    const runtime = createChannelRuntime({ transcript });
    runtime.start();
    context.onStop(() => runtime.stop());
    return runtime;
  },
});
