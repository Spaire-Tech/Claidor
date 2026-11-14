/**
 * A git diff as it is shown to the model: how long it may be, and the
 * words put before it and after one that was cut.
 */

/** The length is kept in characters, counted from about this many tokens at this many characters each. */
export const GIT_DIFF_APPROXIMATE_MAX_TOKENS = 10_000;
export const GIT_DIFF_CHARS_PER_TOKEN = 4;
export const MAX_GIT_DIFF_CHAR_LENGTH = GIT_DIFF_APPROXIMATE_MAX_TOKENS * GIT_DIFF_CHARS_PER_TOKEN;

export const GIT_DIFF_INTRO = "Relevant Diff: The following is the git diff from the current branch to the main/default branch:\n\n";
export const GIT_DIFF_UNCOMMITTED_INTRO = "Relevant Diff: The following is the git diff of uncommitted changes in the working tree:\n\n";
export const GIT_DIFF_TRUNCATION_NOTICE = "\n\n[diff truncated due to size; run `git diff` locally for the full output]";
