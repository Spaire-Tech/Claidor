/**
 * A git failure told with what git itself reported: its error code, its exit
 * code and, when asked, its own words, cut short and with any sign-in taken
 * out of the addresses in them.
 */
import { redactHttpUrlUserinfo } from "./redaction.js";

/** The most of git's own words that are added to a message. */
const STDERR_LIMIT = 2_048;
/** A message that already carries git's codes is left as it is. */
const ALREADY_TOLD = / \[git: ([^\]]*)\]/;

function shortened(words: string): string {
  if (words.length <= STDERR_LIMIT) return words;
  return `${words.slice(0, STDERR_LIMIT)}… [truncated to ${STDERR_LIMIT} chars]`;
}

export function appendGitDiagnostics(message: string, error: unknown, options?: { includeStderr?: boolean }): string {
  if (error === null || typeof error !== "object" || ALREADY_TOLD.test(message)) return message;
  const failure = error as { gitErrorCode?: unknown; exitCode?: unknown; stderr?: unknown };
  const codes: string[] = [];
  if (typeof failure.gitErrorCode === "string" && failure.gitErrorCode !== "") codes.push(`gitErrorCode=${failure.gitErrorCode}`);
  if (typeof failure.exitCode === "number" && Number.isFinite(failure.exitCode)) codes.push(`exitCode=${failure.exitCode}`);
  // Without a code there is nothing of git's to tell, its words included.
  if (codes.length === 0) return message;
  const told = `${message} [git: ${codes.join(" ")}]`;
  const words = options?.includeStderr === true && typeof failure.stderr === "string" ? failure.stderr : "";
  return words === "" ? told : `${told}\n--- git stderr ---\n${shortened(redactHttpUrlUserinfo(words))}`;
}
