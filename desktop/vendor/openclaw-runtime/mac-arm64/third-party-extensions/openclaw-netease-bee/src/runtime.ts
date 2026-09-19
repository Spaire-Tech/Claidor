import type { RuntimeEnv } from "openclaw/plugin-sdk";

/**
 * Global runtime reference — stores the full PluginRuntime from api.runtime,
 * typed as RuntimeEnv for compatibility. Channel/system helpers are accessed
 * via type assertion at call sites.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let beeRuntime: any = null;

export function setBeeRuntime(runtime: RuntimeEnv): void {
  beeRuntime = runtime;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getBeeRuntime(): any {
  if (!beeRuntime) {
    throw new Error("NetEase Bee runtime not initialized. Call setBeeRuntime first.");
  }
  return beeRuntime;
}

export function isBeeRuntimeInitialized(): boolean {
  return beeRuntime !== null;
}

export function clearBeeRuntime(): void {
  beeRuntime = null;
}
