/**
 * The places on the person's Mac that Simeon does not touch (25 September
 * 2026, design-audit-ledger.md cluster `local-security`).
 *
 * The local-exec daemon runs the agent's shell commands and file reads on
 * the Mac under the person's own account, and the approval card names a
 * command or a path, not what is behind it. A path here holds keys or
 * sign-ins (SSH and GPG keys, cloud CLI credentials, the app's own token
 * files under `~/.caisra`, the keychains, browser profiles with their
 * cookies), so the daemon refuses it whatever the permission setting says
 * and tells the agent why. The person can still do it themselves.
 */
export interface SensitiveLocalPathRequest {
  readonly action: string;
  readonly target: string;
}

/** Relative to the home folder unless absolute. */
export const SENSITIVE_LOCAL_PATHS: readonly string[] = [
  ".ssh",
  ".gnupg",
  ".aws",
  ".azure",
  ".config/gcloud",
  ".kube",
  ".docker/config.json",
  ".netrc",
  ".npmrc",
  ".pypirc",
  ".caisra",
  ".cursor",
  "Library/Keychains",
  "Library/Cookies",
  "Library/Application Support/Simeon",
  "Library/Application Support/Google/Chrome",
  "Library/Application Support/BraveSoftware",
  "Library/Application Support/Arc",
  "Library/Application Support/Firefox",
  "Library/Application Support/Microsoft Edge",
  "/etc/shadow",
  "/etc/master.passwd",
  "/private/etc/master.passwd",
];

function normalizeSeparators(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function stripTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function absoluteSensitivePath(entry: string, home: string): string {
  return entry.startsWith("/") ? entry : `${stripTrailingSlash(normalizeSeparators(home))}/${entry}`;
}

/** `~/x`, `$HOME/x` and `x` (relative to home) all become `<home>/x`. */
export function expandLocalPath(target: string, home: string): string {
  const trimmed = normalizeSeparators(target.trim().replace(/^["']|["']$/g, ""));
  const base = stripTrailingSlash(normalizeSeparators(home));
  if (trimmed === "~") return base;
  if (trimmed.startsWith("~/")) return `${base}/${trimmed.slice(2)}`;
  if (trimmed === "$HOME") return base;
  if (trimmed.startsWith("$HOME/")) return `${base}/${trimmed.slice(6)}`;
  if (trimmed.startsWith("/")) return trimmed;
  return `${base}/${trimmed}`;
}

function isUnder(path: string, root: string): boolean {
  const normalized = stripTrailingSlash(path);
  return normalized === root || normalized.startsWith(`${root}/`);
}

function segments(path: string): string[] {
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") { out.pop(); continue; }
    out.push(segment);
  }
  return out;
}

/** The sensitive entry a path lands in, or undefined. `..` is resolved first. */
export function sensitiveLocalPathEntry(target: string, home: string): string | undefined {
  const resolved = `/${segments(expandLocalPath(target, home)).join("/")}`;
  for (const entry of SENSITIVE_LOCAL_PATHS) {
    if (isUnder(resolved, absoluteSensitivePath(entry, home))) return entry;
  }
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The sensitive entry a shell command names as a path, or undefined. */
export function sensitiveLocalPathInCommand(command: string, home: string): string | undefined {
  const text = normalizeSeparators(command);
  const base = stripTrailingSlash(normalizeSeparators(home));
  for (const entry of SENSITIVE_LOCAL_PATHS) {
    const escaped = escapeRegExp(entry);
    const pattern = entry.startsWith("/")
      ? new RegExp(`(?:^|[\\s"'=(])${escaped}(?:[/\\s"')]|$)`)
      : new RegExp(`(?:^|[\\s"'=(])(?:~|\\$HOME|\\$\\{HOME\\}|${escapeRegExp(base)})?/?${escaped}(?:[/\\s"')]|$)`);
    if (pattern.test(text)) return entry;
  }
  return undefined;
}

export function sensitiveLocalPathReason(request: SensitiveLocalPathRequest, home: string): string | undefined {
  const entry = request.action === "run-command"
    ? sensitiveLocalPathInCommand(request.target, home)
    : request.action === "read-file" || request.action === "write-file" || request.action === "list-directory"
      ? sensitiveLocalPathEntry(request.target, home)
      : undefined;
  if (entry === undefined) return undefined;
  const shown = entry.startsWith("/") ? entry : `~/${entry}`;
  return `Simeon does not read, write or run anything under ${shown} on this Mac: it holds keys or sign-ins. Ask the person to do that part themselves.`;
}
