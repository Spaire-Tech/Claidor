// the upstream's host already budgets a turn at 200k (`agentTokenLimit`). Terra's
// physical window is 1.05M, so reporting that as maxTokens would start
// compaction at ~945k — after the 500k TPM cap has already killed the turn.
// This is the working window the loop's background summarization reads.
export const SIMEON_WORKING_CONTEXT_TOKENS = 200_000;

// The window the loop's summarization reads (8 October 2026). Summarizing
// starts at 90% of it and the summary is swapped in at 95%, so a long
// conversation is summarized from about 108k tokens (it was 180k on the
// 200k window). In the founder's staffing log the Chief of Staff sent 161k
// tokens on every call, and every teammate's reply woke him on all of it.
// The upstream app read this per model from its own server; ours is fixed.
// The skills list keeps its budget on the working window above.
export const SIMEON_SUMMARIZATION_WINDOW_TOKENS = 120_000;
