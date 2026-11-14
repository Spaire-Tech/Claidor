/**
 * The most characters one hook may add to the model's context, counted once
 * the space around its text is cut. A longer text is never shortened to fit:
 * it is left out whole.
 */
export const HOOK_ADDITIONAL_CONTEXT_MAX_CHARS = 10_000;
