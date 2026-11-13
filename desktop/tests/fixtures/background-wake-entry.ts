// One bundle for the background wake's test: the computer's resource accessor (where a backgrounded Shell result is
// watched), the real Shell tool, the Claude Code bridge, the watches and the wake's prompt.
export { createRemoteBoxResourceAccessor, finishedTerminalRead } from "../../source/host/runner/remote-box-resources.js";
export { shellStreamExecutorResource } from "../../source/packages/agent-exec/shell-stream.js";
export { readExecutorResource } from "../../source/packages/agent-exec/read.js";
export { createShellTool, SHELL_BACKGROUND_WAKE_NOTE } from "../../source/packages/agent/tools/core/shell/create-shell-tool.js";
export { bridgeEngineTools, claudeCodeInteractionHandler } from "../../source/host/claude-code/claude-code-tools.js";
export { claudeCodeBriefNote } from "../../source/host/claude-code/claude-code-agent-turn.js";
export { createBackgroundWatches } from "../../source/host/runner/background-work.js";
export { pollShellTerminalFile } from "../../source/host/runner/shell-terminal-watch.js";
export { buildShellRevivalPrompt, CompletionRevivals } from "../../source/host/extensions/transcript/completion-revivals.js";
export { AgentToAgentMessaging } from "../../source/host/extensions/transcript/agent-to-agent-messaging.js";
export { cloudAgentCardDue } from "../../source/host/extensions/transcript/send-message-shaping.js";
export { AgentLifecycle } from "../../source/host/extensions/transcript/agent-lifecycle.js";
export { buildSandBaseSystemPrompt } from "../../source/host/runner/system-prompt.js";
export { terminalFileShellId, parseShellTerminalFooter } from "../../source/shared/background-commands.js";
export { createContext } from "../../source/packages/context/core.js";
export { ShellStream, ShellStreamStart, ShellStreamStdout, ShellStreamBackgrounded, ShellStreamExit, ShellBackgroundReason } from "../../source/packages/proto/generated/agent/v1/shell_exec_pb.js";
export { ReadResult, ReadSuccess, ReadFileNotFound } from "../../source/packages/proto/generated/agent/v1/read_exec_pb.js";
