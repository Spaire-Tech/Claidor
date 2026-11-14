/**
 * A privacy context: a person's privacy mode, and whether what the mode
 * hides is really hidden when it is shown or handed out.
 */
import type { DataClassification } from "./classification.js";
import type { PrivacyMode } from "./privacy-mode.js";

export interface PrivacyContext {
  readonly privacyMode: PrivacyMode;
  /** True to hide and refuse for real. Left out, nothing is enforced. */
  readonly enforceRedaction?: boolean | undefined;
}

/**
 * Whether redaction is enforced under this context. Only a context that says
 * true itself enforces: the engine has no setting that turns enforcement on
 * for everyone, so a context with no choice of its own enforces nothing,
 * whatever its mode and the kind of data.
 */
export function resolveEnforceRedaction(
  context: PrivacyContext,
  // Not looked at: the answer does not depend on the kind of data.
  classification: DataClassification,
): boolean {
  return context.enforceRedaction === true;
}

/** A context for a mode. The enforcement choice is a field of it only when one is given. */
export function privacyContextFromMode(
  privacyMode: PrivacyMode,
  enforceRedaction?: boolean,
): PrivacyContext {
  if (enforceRedaction === undefined) return { privacyMode };
  return { privacyMode, enforceRedaction };
}

/**
 * A context from either form callers pass. A context comes back as the very
 * object it is, so what was made under it keeps following it; a mode gets a
 * new context of its own.
 */
export function toPrivacyContext(
  modeOrContext: PrivacyMode | PrivacyContext,
): PrivacyContext {
  if (typeof modeOrContext !== "object" || modeOrContext === null) {
    return privacyContextFromMode(modeOrContext);
  }
  return "privacyMode" in modeOrContext ? modeOrContext : privacyContextFromMode(modeOrContext);
}
