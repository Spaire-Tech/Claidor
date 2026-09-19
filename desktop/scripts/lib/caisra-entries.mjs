/**
 * The ignition.
 *
 * `source/electron-main/main.ts` and `source/host/main.ts` both EXPORT a start
 * function and neither calls it. Anysphere's build generated the entry that
 * does, and the reconstruction reproduces that generation in
 * scripts/electron-main-production-activation.mjs and
 * scripts/host-production-activation.mjs.
 *
 * Those two scripts cannot run for us. Not because the wiring is missing — every
 * binding they name resolves to a file in source/ — but because before emitting
 * anything they verify themselves against the extracted 0.18.0 app under
 * src/app/dist/: byte offsets in main.cjs, a runtime-deps manifest, anchor
 * needles. That app came from a DMG which Anysphere has since locked behind a
 * 403 and which Gitee will not serve from a free repository's LFS. So the
 * self-check is unsatisfiable and takes the generation down with it.
 *
 * This module does the generation and not the self-check. It reads the same
 * binding lists the activation scripts read, and emits the same entry source
 * they would have emitted. Nothing here invents a binding, changes one, or
 * substitutes a stub: every import below comes from the checked-in manifests.
 *
 * What is deliberately not reproduced: the artifact anchor validation, the
 * runtime-deps cross-check, and the packaged-artifact fallbacks. Those are
 * fidelity guarantees against a binary we do not have and are not shipping.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "..", "..");

const ELECTRON_MAIN_MANIFEST = "manifests/reconstruction/electron-main-production-bindings-manifest.json";

/** Import specifier for a binding, relative to repoRoot, as esbuild will resolve it. */
function resolveModule(moduleRef, manifestDir) {
  const absolute = path.resolve(repoRoot, manifestDir, moduleRef);
  const relative = path.relative(repoRoot, absolute).split(path.sep).join("/");
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function importLine(binding, index) {
  const spec = JSON.stringify(binding.resolvedModule);
  return binding.export === "default"
    ? `import binding${index} from ${spec};`
    : `import { ${binding.export} as binding${index} } from ${spec};`;
}

/** `binding3()` for an access of "call", `binding3` for "value". */
function expression(bindings, key) {
  const index = bindings.findIndex((binding) => binding.path === key);
  if (index < 0) throw new Error(`Binding lookup failed: ${key}`);
  return bindings[index].access === "call" ? `binding${index}()` : `binding${index}`;
}

export async function electronMainEntrySource() {
  const manifestDir = path.dirname(ELECTRON_MAIN_MANIFEST);
  const manifest = JSON.parse(await readFile(path.join(repoRoot, ELECTRON_MAIN_MANIFEST), "utf8"));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.bindings)) {
    throw new Error("electron-main binding manifest must be schemaVersion 1 with a bindings array");
  }
  const bindings = manifest.bindings.map((binding) => ({
    ...binding,
    resolvedModule: resolveModule(binding.module, manifestDir),
  }));

  const adapterKeys = bindings
    .map((binding) => binding.path)
    .filter((key) => key.startsWith("adapters."))
    .map((key) => key.slice("adapters.".length));

  return `${bindings.map(importLine).join("\n")}
import { app, safeStorage, ipcMain, BrowserWindow, Menu, shell, screen } from "electron";
import { startElectronMainProduction } from "./source/electron-main/main.ts";
import { createElectronProductionNativeBindings } from "./source/electron-main/main-production-services.ts";
import { createElectronProductionAvatarImagesBinding } from "./source/electron-main/adapters/avatar-images.ts";
import { createElectronProductionImageContextMenuBinding } from "./source/electron-main/adapters/avatar-images.ts";
import { createElectronProductionCursorAccountBinding } from "./source/electron-main/adapters/account-edge.ts";
import { composeElectronProductionCoordinatorBindings, createElectronProductionServiceFactories } from "./source/electron-main/production-adapters.ts";

const coordinatorBindings = composeElectronProductionCoordinatorBindings(
  ${expression(bindings, "adapters.coordinator")},
  ${expression(bindings, "adapters.ipc")},
);
const adapters = {
  // Constructed by the post-context root rather than by the manifest slots;
  // they receive the live root context when the service factories run.
  avatarImages: createElectronProductionAvatarImagesBinding(),
  imageContextMenu: createElectronProductionImageContextMenuBinding(),
  cursorAccount: createElectronProductionCursorAccountBinding(),
${adapterKeys
  .filter((key) => key !== "coordinator" && key !== "ipc")
  .map((key) => `  ${key}: ${expression(bindings, `adapters.${key}`)},`)
  .join("\n")}
  ...coordinatorBindings,
};

// main.ts routes every startup rejection to startup.noteFailed(), which
// reports to telemetry — and packaging sets SAND_DISABLE_TELEMETRY=1, so the
// error lands in a disabled sink and the app simply never opens a window with
// nothing on stderr to say why. A startup failure that produces no window must
// not be silent, so the tracker is wrapped to also write the error out. Nothing
// else about it changes.
const baseStartup = ${expression(bindings, "startup")};

// main.ts walks a fixed sequence: markPhase("move_check") -> runMoveCheck ->
// armStuckWatchdog -> markPhase("services") -> initializeServices ->
// markPhase("window") -> createWindow -> noteReady, with the whole chain
// caught into noteFailed. Every one of those reports to telemetry, which
// packaging disables, so a hang or a failure both look identical from outside:
// a live process and no window. Tracing each call to stderr makes the last
// line printed the place it stopped.
const CAISRA_TRACE = process.env.CAISRA_STARTUP_TRACE !== "0";
function traceStartup(target) {
  if (!CAISRA_TRACE) return target;
  const traced = {};
  for (const key of Object.keys(target)) {
    const value = target[key];
    if (typeof value !== "function") { traced[key] = value; continue; }
    traced[key] = (...args) => {
      // The binding handed to startElectronMainProduction is the telemetry
      // ports object, not the tracker: noteFailed's body is report() followed
      // by captureFailure(error, phase), so the only place the real startup
      // error appears is as an argument. Print any Error we are handed.
      for (const arg of args) {
        if (arg instanceof Error) {
          process.stderr.write("[caisra-startup] !! error passed to " + key + ":\\n" + (arg.stack ?? \`\${arg.name}: \${arg.message}\`) + "\\n");
          if (arg.cause instanceof Error) {
            process.stderr.write("[caisra-startup] !! caused by:\\n" + (arg.cause.stack ?? String(arg.cause)) + "\\n");
          }
        }
      }
      process.stderr.write("[caisra-startup] -> " + key + (key === "markPhase" ? "(" + String(args[0]) + ")" : "") + "\\n");
      try {
        const result = value.apply(target, args);
        if (result != null && typeof result.then === "function") {
          return result.then(
            (settled) => { process.stderr.write("[caisra-startup] <- " + key + " ok" + (settled === undefined ? "" : " = " + String(settled)) + "\\n"); return settled; },
            (error) => {
              process.stderr.write("[caisra-startup] <- " + key + " THREW: " + (error?.stack ?? String(error)) + "\\n");
              throw error;
            },
          );
        }
        process.stderr.write("[caisra-startup] <- " + key + " ok\\n");
        return result;
      } catch (error) {
        process.stderr.write("[caisra-startup] <- " + key + " THREW: " + (error?.stack ?? String(error)) + "\\n");
        throw error;
      }
    };
  }
  return traced;
}

const startup = {
  ...traceStartup(baseStartup),
  noteFailed(error) {
    const detail = error instanceof Error ? (error.stack ?? \`\${error.name}: \${error.message}\`) : String(error);
    process.stderr.write("[caisra-startup] startup failed: " + detail + "\\n");
    return baseStartup.noteFailed(error);
  },
};

const baseReportFailure = ${expression(bindings, "reportFailure")};
const reportFailure = (...args) => {
  const error = args[0];
  const detail = error instanceof Error ? (error.stack ?? \`\${error.name}: \${error.message}\`) : String(error);
  process.stderr.write("[caisra-edge] " + detail + "\\n");
  return baseReportFailure(...args);
};

try {
  startElectronMainProduction({
    native: createElectronProductionNativeBindings({ app, safeStorage, ipcMain, BrowserWindow, Menu, shell, screen }),
    moduleDir: __dirname,
    startup,
    services: createElectronProductionServiceFactories(adapters),
    parseAllowedExternalUrl: ${expression(bindings, "parseAllowedExternalUrl")},
    reportFailure,
  });
} catch (error) {
  const detail = error instanceof Error ? (error.stack ?? String(error)) : String(error);
  process.stderr.write("[caisra-electron-main] fatal composition failure: " + detail + "\\n");
  process.exitCode = 1;
}

process.on("unhandledRejection", (reason) => {
  const detail = reason instanceof Error ? (reason.stack ?? String(reason)) : String(reason);
  process.stderr.write("[caisra-electron-main] unhandled rejection: " + detail + "\\n");
});
process.on("uncaughtException", (error) => {
  process.stderr.write("[caisra-electron-main] uncaught: " + (error?.stack ?? String(error)) + "\\n");
});
`;
}

/**
 * The preloads have the same shape as electron-main and the host: each module
 * exports an entrypoint and a loader, and calls neither. Bundling the module
 * directly produces a file that defines a bridge and never installs it, so
 * window.desktop is undefined and the renderer dies on
 * `invariant(hasDesktopBridge(candidate.desktop))` before React mounts — a dark,
 * empty window with the error only visible in the devtools console.
 */
const PRELOAD_ENTRYPOINTS = {
  "preload": ["installPrimaryPreloadEntrypoint", "loadPrimaryPreloadElectron"],
  "preload-dev-controls": ["installDevControlsPreloadEntrypoint", "loadDevControlsPreloadElectron"],
  "preload-webview": ["installWebviewPreloadEntrypoint", "loadBrowserPreloadElectron"],
  "preload-vnc": ["installVncPreloadEntrypoint", "loadVncPreloadElectron"],
};

export function preloadEntrySource(name) {
  const entry = PRELOAD_ENTRYPOINTS[name];
  if (entry == null) throw new Error(`Unknown preload: ${name}`);
  const [install, load] = entry;
  return `import { ${install}, ${load} } from "./source/electron-preload/${name}.ts";
import * as electronNamespace from "electron";

const electron = (electronNamespace as unknown as { default?: unknown }).default ?? electronNamespace;

try {
  ${install}(${load}(electron) as never);
} catch (error) {
  const detail = error instanceof Error ? (error.stack ?? String(error)) : String(error);
  process.stderr.write("[caisra-${name}] preload failed: " + detail + "\\n");
}
`;
}

export async function hostEntrySource() {
  // The host's list lives in the activation script rather than a JSON manifest.
  // Importing the constant does not run any validation; that happens inside
  // functions we do not call.
  const { hostProductionBindingInventorySpecs } = await import("../host-production-activation.mjs");
  const bindings = hostProductionBindingInventorySpecs.map((spec) => ({
    path: spec.path,
    export: spec.binding.export,
    access: spec.binding.access,
    resolvedModule: resolveModule(spec.binding.module, "."),
  }));

  return `${bindings.map(importLine).join("\n")}
import { startProductionHost } from "./source/host/main.ts";
import { bindRecoveredProductionExtensions } from "./source/host/host-production-extensions.ts";

const ports = {
  executeBoxCopyInFromEnv: ${expression(bindings, "ports.executeBoxCopyInFromEnv")},
  extensionHost: {
    boxGenerated: ${expression(bindings, "ports.extensionHost.boxGenerated")},
    convertCloudAgentConversationToTrace: ${expression(bindings, "ports.extensionHost.convertCloudAgentConversationToTrace")},
  },
  runnerContext: ${expression(bindings, "ports.runnerContext")},
  createTranscriptMirror: ${expression(bindings, "ports.createTranscriptMirror")},
};
const extensionBindings = {
  stateBackstop: ${expression(bindings, "extensionBindings.stateBackstop")},
  localExecCodec: ${expression(bindings, "extensionBindings.localExecCodec")},
  secretsContext: ${expression(bindings, "extensionBindings.secretsContext")},
};

void startProductionHost(bindRecoveredProductionExtensions(ports, extensionBindings)).catch((error) => {
  process.stderr.write("[caisra-host] fatal: " + String(error) + "\\n");
  process.exitCode = 1;
});
`;
}
