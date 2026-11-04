import { Buffer } from "node:buffer";

import { LOCAL_BROWSER_UPLOAD_MAX_BYTES } from "../../../shared/local-browser-gateway.js";
import type { BrowserDriverDependencies } from "./sand-browser-tools.js";

/**
 * The second route for the agent's browser steps: the browser in the Mac or
 * Windows app (docs/app-browser/README.md, step 1, 4 November 2026). The
 * tools, their arguments and their answers are the same on both routes;
 * which one a step takes is decided by `AppBrowserRoute.choose`
 * (`extensions/local-browser/local-browser-bridge.ts`). Without a route, or
 * when it says "box", the step runs on the computer's Chrome exactly as
 * before.
 */

export interface AppBrowserLive { readonly route: "app"; readonly browserSession: string; readonly place: string; }
export type AppBrowserChoice =
  | { readonly route: "box" }
  | AppBrowserLive
  | { readonly route: "gone"; readonly message: string };

/** One step sent to the app (docs/app-browser/protocol.md). */
export interface AppBrowserStep {
  readonly op: string;
  readonly viewId: string;
  readonly args: Record<string, unknown>;
  readonly screenshot: boolean;
}

export interface AppBrowserRoute {
  choose(viewId: string, options: { readonly opensAddress: boolean; readonly signal?: AbortSignal }): Promise<AppBrowserChoice>;
  request(choice: AppBrowserLive, step: AppBrowserStep, options: { readonly signal?: AbortSignal; readonly timeoutMs: number }): Promise<Record<string, unknown>>;
  /**
   * Where the view's task is now, choosing nothing (step 3: the cards): its
   * app when the task is in an app's browser that is connected now; else
   * undefined, and a card acts on the computer as before.
   */
  where?(viewId: string): AppBrowserLive | undefined;
}

export const BOX_ROUTE: AppBrowserChoice = Object.freeze({ route: "box" });

/** The turn's cancel signal, when the context carries one. */
export function contextSignal(context: unknown): AbortSignal | undefined {
  const signal = typeof context === "object" && context !== null ? (context as { signal?: unknown }).signal : undefined;
  return signal instanceof AbortSignal ? signal : undefined;
}

const UPLOAD_ROOT = "/workspace";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export interface AppBrowserUploadFile { readonly name: string; readonly path: string; readonly dataB64: string; }

/**
 * The files a browser_upload_file attaches, read from the computer for the
 * app: the same paths the computer's helper takes, with its checks (an
 * existing file, inside /workspace once links are followed) and its
 * sentences (`sand-browser-driver-source.ts`, `filesToUpload`).
 */
export async function readUploadFiles<Context>(
  dependencies: BrowserDriverDependencies<Context>,
  context: Context,
  value: unknown,
  toolCallId: string,
): Promise<AppBrowserUploadFile[]> {
  const asked = (Array.isArray(value) ? value : typeof value === "string" ? [value] : [])
    .filter((one): one is string => typeof one === "string" && one.trim().length > 0)
    .map((one) => one.trim());
  if (asked.length === 0) {
    throw new Error("browser_upload_file needs paths: the file or files to attach, as paths on your computer (for example /workspace/uploads/resume.pdf).");
  }
  const wanted = asked.map((one) => (one.startsWith("/") ? one : `${UPLOAD_ROOT}/${one}`));
  for (const one of wanted) {
    if (/[\n\r\0]/.test(one)) throw new Error(`No file at ${JSON.stringify(one)} on your computer.`);
  }
  const command = [
    `root=$(realpath -e ${UPLOAD_ROOT} 2>/dev/null || echo ${UPLOAD_ROOT})`,
    `printf '__ROOT__%s\\n' "$root"`,
    `for p in ${wanted.map(shellQuote).join(" ")}; do r=$(realpath -e -- "$p" 2>/dev/null) || { printf '__MISSING__\\n'; continue; }; if [ -f "$r" ]; then printf '__FILE__%s\\n' "$r"; else printf '__FOLDER__\\n'; fi; done`,
  ].join("; ");
  const shell = await dependencies.executeShell(context, { command, name: "realpath", workingDirectory: UPLOAD_ROOT, toolCallId: `${toolCallId}:app-browser-upload` });
  if (shell.case !== "success") throw new Error(`The files could not be read on your computer (${shell.case || "unknown"}).`);
  const lines = (shell.stdout ?? "").split("\n").filter((line) => line.startsWith("__"));
  const root = lines[0]?.startsWith("__ROOT__") === true ? lines[0].slice("__ROOT__".length) : UPLOAD_ROOT;
  const answers = lines.slice(1);
  if (answers.length !== wanted.length) throw new Error("The files could not be read on your computer.");
  const files: AppBrowserUploadFile[] = [];
  let total = 0;
  for (const [index, one] of wanted.entries()) {
    const answer = answers[index]!;
    if (answer === "__MISSING__") throw new Error(`No file at ${one} on your computer. The person's attachments are in /workspace/uploads; list them with Shell (ls /workspace/uploads) and pass the full path.`);
    if (answer === "__FOLDER__") throw new Error(`${one} is a folder, not a file.`);
    const real = answer.slice("__FILE__".length);
    if (!answer.startsWith("__FILE__") || !real.startsWith(`${root}/`)) {
      throw new Error(`Only files in /workspace can be attached to a page; ${one} is outside it. Copy it into /workspace first if it is the person's file.`);
    }
    const bytes = await dependencies.downloadFile(context, dependencies.getBoxId(), real);
    total += bytes.length;
    if (total > LOCAL_BROWSER_UPLOAD_MAX_BYTES) throw new Error(`These files are too large to attach in the browser here (${LOCAL_BROWSER_UPLOAD_MAX_BYTES / (1024 * 1024)} MB at most together).`);
    files.push({ name: real.slice(real.lastIndexOf("/") + 1), path: real, dataB64: Buffer.from(bytes).toString("base64") });
  }
  return files;
}
