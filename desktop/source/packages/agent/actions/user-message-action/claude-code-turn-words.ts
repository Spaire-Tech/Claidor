/**
 * The person's words for a turn Claude Code runs (the user-message handler's `runOnClaudeCode`). Its own
 * module so a test can read it beside the engine's real message wrapper without the handler's dependencies.
 */
import { PrivacyCapability } from "../../../redaction/classification.js";

/** A message's words as written: the engine keeps a turn's text wrapped (`RedactedString`), never as a plain string. */
function plainWords(value: unknown): string {
  if (typeof value === "string") return value;
  if (value !== null && typeof value === "object" && typeof (value as { unwrap?: unknown }).unwrap === "function") {
    const words = (value as { unwrap(purpose: unknown): unknown }).unwrap(PrivacyCapability.UNSAFE_ALWAYS_ALLOWED);
    return typeof words === "string" ? words : "";
  }
  return "";
}

/**
 * What Claude Code reads as the person's turn (9 November 2026): the earlier messages this turn took in
 * (sent while the agent was busy), then the message itself, each as written. Until then the handler read the
 * turn's text as a plain string, which it never is, and every turn Claude ran got none of the person's words:
 * Claude answered "I'm here whenever you need me" to "archive anything not important".
 */
export function claudeCodeTurnWords(text: unknown, earlier: readonly unknown[] = []): string {
  return [...earlier, text].map(plainWords).map((words) => words.trim()).filter((words) => words !== "").join("\n\n");
}

