// Bundles the preload's face overlay as one browser script, so a harness
// page can run exactly what the packaged preload runs — the clay face per
// agent and Grok's motion loop — without Electron.
//
//   const script = await buildFaceOverlayScript();   // .build/face-overlay.js
//   await page.addInitScript({ path: script });
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function buildFaceOverlayScript() {
  const outfile = path.join(desktopRoot, ".build", "face-overlay.js");
  await mkdir(path.dirname(outfile), { recursive: true });
  await build({
    stdin: {
      contents: 'import { installFaceOverlaySafely } from "./source/electron-preload/clay-face-overlay";\ninstallFaceOverlaySafely();\n',
      resolveDir: desktopRoot,
      loader: "ts",
      sourcefile: "face-overlay-entry.ts",
    },
    outfile,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome120",
    logLevel: "error",
  });
  return outfile;
}
