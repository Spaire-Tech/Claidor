/**
 * Feature flag for the virtual transcript plane (windowed rendering).
 * Default: OFF — existing full-map rendering is unchanged.
 *
 * To enable for testing:
 *   DevTools console: localStorage.setItem('sand_virtual_transcript', '1'); location.reload()
 * To disable:
 *   localStorage.removeItem('sand_virtual_transcript'); location.reload()
 */
export function isVirtualTranscriptEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("sand_virtual_transcript") === "1";
  } catch {
    return false;
  }
}
