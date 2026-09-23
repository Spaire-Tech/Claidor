/** The macOS window is glass (23 September 2026): vibrancy under the window, a clear background, active when unfocused. */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-window-glass-"));
  const output = path.join(temporary, "m.mjs");
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("the macOS window asks for under-window vibrancy that stays active; other platforms are unchanged", async () => {
  const { module, dispose } = await load("source/electron-main/window-chrome.ts");
  try {
    const mac = module.windowChromeOptions({ isMac: true, isWindows: false, backgroundColor: "#1c1c1e" });
    assert.equal(mac.vibrancy, "under-window");
    assert.equal(mac.visualEffectState, "active");
    assert.equal(mac.titleBarStyle, "hiddenInset");
    const win = module.windowChromeOptions({ isMac: false, isWindows: true, backgroundColor: "#1c1c1e" });
    assert.equal(win.vibrancy, undefined);
    const linux = module.windowChromeOptions({ isMac: false, isWindows: false, backgroundColor: "#1c1c1e" });
    assert.equal(linux.vibrancy, undefined);
  } finally {
    await dispose();
  }
});
