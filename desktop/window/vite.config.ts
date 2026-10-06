/**
 * Simeon's own window (Track D, piece 2). Built by Vite into .build/window
 * with every path relative, so Electron loads it from file:// exactly as it
 * loads the pinned window today (`npm run window:build`), and the demo
 * (`npm run window:demo`) serves the same output behind the fake bridge.
 */
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  base: "./",
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5174, strictPort: false },
  build: {
    outDir: path.resolve(here, "../.build/window"),
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
  },
});
