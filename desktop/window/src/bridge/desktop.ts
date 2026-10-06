/**
 * The two doors as the page finds them: `window.desktop` and
 * `window.coordinatorPort`, put there by the app's preload (or by the
 * demo's fake bridge). Missing doors are a plain error at start, never a
 * blank screen.
 */
import type { CoordinatorDoor, DesktopDoor } from "./types.js";

export function readDoors(): { desktop: DesktopDoor; coordinator: CoordinatorDoor } {
  const page = globalThis as unknown as { desktop?: unknown; coordinatorPort?: unknown };
  const desktop = page.desktop;
  const coordinator = page.coordinatorPort;
  if (typeof desktop !== "object" || desktop === null || typeof (desktop as DesktopDoor).account?.getStatus !== "function") {
    throw new Error("window.desktop is missing: the page was opened without the app's preload (or the demo's bridge).");
  }
  if (typeof coordinator !== "object" || coordinator === null || typeof (coordinator as CoordinatorDoor).claim !== "function") {
    throw new Error("window.coordinatorPort is missing: the page was opened without the app's preload (or the demo's bridge).");
  }
  return { desktop: desktop as DesktopDoor, coordinator: coordinator as CoordinatorDoor };
}
