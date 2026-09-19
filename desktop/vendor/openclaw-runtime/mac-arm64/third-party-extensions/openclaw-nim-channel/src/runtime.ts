import type { RuntimeEnv } from "openclaw/plugin-sdk";

/**
 * Global runtime environment reference.
 */
let nimRuntime: RuntimeEnv | null = null;

/**
 * Set the NIM runtime environment.
 */
export function setNimRuntime(runtime: RuntimeEnv): void {
  nimRuntime = runtime;
}

/**
 * Get the NIM runtime environment.
 * Throws if runtime is not set.
 */
export function getNimRuntime(): RuntimeEnv {
  if (!nimRuntime) {
    throw new Error("NIM runtime not initialized. Call setNimRuntime first.");
  }
  return nimRuntime;
}

/**
 * Check if NIM runtime is initialized.
 */
export function isNimRuntimeInitialized(): boolean {
  return nimRuntime !== null;
}

/**
 * Clear the NIM runtime reference.
 */
export function clearNimRuntime(): void {
  nimRuntime = null;
}
