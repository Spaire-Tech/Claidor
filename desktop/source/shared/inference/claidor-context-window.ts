// Cursor's host already budgets a turn at 200k (`agentTokenLimit`). Terra's
// physical window is 1.05M, so reporting that as maxTokens would start
// compaction at ~945k — after the 500k TPM cap has already killed the turn.
// This is the working window the loop's background summarization reads.
export const CLAIDOR_WORKING_CONTEXT_TOKENS = 200_000;
