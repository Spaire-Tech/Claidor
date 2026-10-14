// Link, Stripe's agent wallet (13 October 2026, the founder: "can we add
// stripe/link-cli so that the agents can make purchase for the user … and
// access their banks, read and advise based on it"). Stripe's own CLI,
// `@stripe/link-cli`, runs on the person's cloud computer: it signs in to
// their Link account with a device code (they approve on link.com or in the
// Link app), asks Link for a one-time card for each purchase (Link asks the
// person to approve every one in its app) and reads the bank and card
// accounts they chose to share. This file finds the CLI, installs it when
// the image has none, and runs it; `link-tools.ts` turns its commands into
// the agents' tools and `checkout-fill.ts` types a card into a checkout.
//
// The CLI keeps its sign-in in one file on the data volume
// (`<sandRoot>/link/auth.json`, with `--auth`), so it survives a box update;
// commands run with `--format json`, answer a JSON value, and on failure an
// object with `code` and `message` and exit code 1 (measured on 0.27.1).

import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** The pinned CLI: published by Stripe on 12 October 2026, run here on Node 22 (the box's) the next day. */
export const LINK_CLI_VERSION = "0.27.1";
export const LINK_CLI_PACKAGE = "@stripe/link-cli";
/** The name the person sees in the Link app when they approve the connection. */
export const LINK_CLIENT_NAME = "Simeon";
/** What the sign-in asks for besides payments: the person's transactions, balances and account details (Link's financial insights, US accounts). */
export const LINK_SOURCE_ACTIONS = ["read_link_transactions", "read_external_transactions", "read_balances", "read_source_details"] as const;

export interface LinkCliRunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type LinkCliExec = (file: string, args: readonly string[], options: { readonly env: NodeJS.ProcessEnv; readonly cwd: string; readonly timeoutMs: number }) => Promise<LinkCliRunResult>;

export interface LinkCliOptions {
  /** The data volume's root (`SAND_DATA_ROOT`, /home/box/sand-data in the box). */
  readonly rootDir: () => string;
  readonly env?: NodeJS.ProcessEnv;
  readonly exec?: LinkCliExec;
  readonly exists?: (path: string) => boolean;
  readonly log?: (message: string) => void;
}

/** A command's answer: its JSON when it worked, else Link's own code and sentence. */
export type LinkCliAnswer =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly code: string; readonly message: string };

export class LinkCliUnavailableError extends Error {}

export const linkDir = (rootDir: string): string => join(rootDir, "link");
export const linkAuthFile = (rootDir: string): string => join(linkDir(rootDir), "auth.json");
/** Where a CLI installed at run time lives: on the data volume, so a box update keeps it. */
export const linkCliPrefix = (rootDir: string): string => join(linkDir(rootDir), "cli");

const defaultExec: LinkCliExec = (file, args, options) => new Promise((resolve) => {
  execFile(file, [...args], { env: options.env, cwd: options.cwd, timeout: options.timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: "utf8" }, (error, stdout, stderr) => {
    const code = error == null ? 0 : typeof (error as { code?: unknown }).code === "number" ? (error as { code: number }).code : 1;
    resolve({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") || (error != null && code !== 1 ? error.message : "") });
  });
});

/**
 * The commands whose answer is a list, printed as a JSON array of records
 * (`payment-methods list` is the cards themselves, not an object holding
 * them). Every other array a command prints is the states of a step that
 * streams (`auth login`, `spend-request create` and `retrieve`: the CLI
 * prints all of their states as one array). Until 14 October 2026 every
 * array was read as states, so a list came back as its last record: the
 * person's last card only, and "no card in Link" before every checkout.
 */
export const LINK_LIST_COMMANDS: ReadonlySet<string> = new Set(["payment-methods list", "shipping-address list", "spend-request list"]);

/** The JSON value a command printed: a list whole (`list`), else of a streamed step's states the last, where it ended. */
export function parseLinkCliOutput(stdout: string, options: { readonly list?: boolean } = {}): unknown {
  const text = stdout.trim();
  if (text.length === 0) return undefined;
  try {
    const value = JSON.parse(text) as unknown;
    if (options.list === true) return value;
    return Array.isArray(value) && value.length > 0 && value.every((item) => item != null && typeof item === "object" && !Array.isArray(item)) ? value[value.length - 1] : value;
  } catch {
    // A notice printed before the JSON (an update line): the JSON is from the first brace or bracket on.
    const start = text.search(/^[[{]/m);
    if (start <= 0) return undefined;
    try { return parseLinkCliOutput(text.slice(start), options); } catch { return undefined; }
  }
}

export function readLinkCliAnswer(result: LinkCliRunResult, options: { readonly list?: boolean } = {}): LinkCliAnswer {
  const value = parseLinkCliOutput(result.stdout, options);
  const record = value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  const failed = result.code !== 0 || (record != null && typeof record.code === "string" && typeof record.message === "string" && Object.keys(record).every((key) => ["code", "message", "cta", "fieldErrors", "retryable"].includes(key)));
  if (!failed) return { ok: true, value };
  const code = typeof record?.code === "string" ? record.code : "LINK_CLI_FAILED";
  const message = typeof record?.message === "string" ? record.message : (result.stderr.trim().split("\n").pop() ?? "").slice(0, 400) || `Link answered with exit code ${result.code}.`;
  return { ok: false, code, message };
}

export function createLinkCli(options: LinkCliOptions) {
  const env = options.env ?? process.env;
  const exec = options.exec ?? defaultExec;
  const exists = options.exists ?? existsSync;
  const log = options.log ?? (() => undefined);
  let installing: Promise<string> | undefined;

  // Node to run the CLI with: the host's own when it is Node (the box), else the one on the PATH.
  const nodeBinary = (): string => process.versions.electron == null && /^node(\.exe)?$/i.test(basename(process.execPath)) ? process.execPath : "node";
  const installedScript = (): string => join(linkCliPrefix(options.rootDir()), "node_modules", "@stripe", "link-cli", "dist", "cli.js");

  /** The CLI as `[file, ...leading args]`: the override, the image's copy, then one installed on the data volume. */
  const locate = (): readonly string[] | undefined => {
    const override = env.SIMEON_LINK_CLI?.trim();
    if (override != null && override.length > 0) return override.endsWith(".js") ? [nodeBinary(), override] : [override];
    for (const candidate of ["/usr/local/bin/link-cli", "/usr/bin/link-cli"]) if (exists(candidate)) return [candidate];
    const script = installedScript();
    return exists(script) ? [nodeBinary(), script] : undefined;
  };

  /**
   * Installs the pinned CLI on the data volume, once at a time, when the
   * image has none (an image from before 13 October 2026): about 150 MB,
   * 15 to 35 seconds measured. Its install script is skipped: it fetches
   * Stripe's skills with `npx`, which Simeon's own tools replace.
   */
  const install = async (): Promise<string> => {
    installing ??= (async () => {
      const prefix = linkCliPrefix(options.rootDir());
      mkdirSync(prefix, { recursive: true, mode: 0o700 });
      const npm = exists(join(dirname(process.execPath), "npm")) ? join(dirname(process.execPath), "npm") : "npm";
      log(`[link] installing ${LINK_CLI_PACKAGE}@${LINK_CLI_VERSION} into ${prefix}`);
      const result = await exec(npm, ["install", "--prefix", prefix, "--ignore-scripts", "--no-audit", "--no-fund", "--omit=dev", `${LINK_CLI_PACKAGE}@${LINK_CLI_VERSION}`], { env: { ...env, npm_config_update_notifier: "false" }, cwd: prefix, timeoutMs: 180_000 });
      if (result.code !== 0 || !exists(installedScript())) throw new LinkCliUnavailableError(`Link could not be set up on this computer: ${(result.stderr.trim().split("\n").pop() ?? "").slice(0, 300) || `npm exited ${result.code}`}`);
      log(`[link] installed ${LINK_CLI_PACKAGE}@${LINK_CLI_VERSION}`);
      return installedScript();
    })().finally(() => { installing = undefined; });
    return await installing;
  };

  const ensure = async (): Promise<readonly string[]> => {
    const found = locate();
    if (found != null) return found;
    await install();
    const installed = locate();
    if (installed == null) throw new LinkCliUnavailableError("Link could not be set up on this computer.");
    return installed;
  };

  /** Runs one command with the person's sign-in file and JSON output. */
  const run = async (args: readonly string[], runOptions: { readonly timeoutMs?: number } = {}): Promise<LinkCliAnswer> => {
    let command: readonly string[];
    try { command = await ensure(); } catch (error) { return { ok: false, code: "LINK_UNAVAILABLE", message: error instanceof Error ? error.message : String(error) }; }
    const dir = linkDir(options.rootDir());
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    try { chmodSync(dir, 0o700); } catch { /* best effort */ }
    const [file, ...lead] = command as [string, ...string[]];
    const result = await exec(file, [...lead, ...args, "--auth", linkAuthFile(options.rootDir()), "--format", "json"], {
      // No update notices, no skill install, and a home of its own on the data volume (HOME may be gone from a box command's environment).
      env: { ...env, HOME: dir, NO_UPDATE_NOTIFIER: "1", LINK_CLI_SKIP_SKILL_INSTALL: "1", npm_config_update_notifier: "false" },
      cwd: dir,
      timeoutMs: runOptions.timeoutMs ?? 60_000,
    });
    return readLinkCliAnswer(result, { list: LINK_LIST_COMMANDS.has(args.slice(0, 2).join(" ")) });
  };

  return {
    run,
    ensure,
    /** Whether the CLI is on this computer already (no install started). */
    present: (): boolean => locate() != null,
    authFile: (): string => linkAuthFile(options.rootDir()),
  };
}

export type LinkCli = ReturnType<typeof createLinkCli>;
