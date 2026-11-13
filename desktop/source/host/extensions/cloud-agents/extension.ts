import { isCloudAgentsServed } from "../../../shared/cloud-agents-availability.js";
import { createRealPollingPolicy, realClock } from "../../../internal/scheduling.js";
import { defineHostExtension } from "../../../internal/host-extensions.js";
import { getConfiguredBackendUrl } from "../../../shared/node/simeon-token.js";
import { HostExtensions } from "../extension-ids.generated.js";
import { readSimeonModelRolesNow, reportClaudeCodeSignedOut, reportClaudeCodeUsage } from "../inference/simeon-model-roles.js";
import { codingChoice, codingChoiceOf } from "../../cloud-agents/coding-choice.js";
import { CursorOnComputer } from "../../cursor/cursor-account.js";
import { ModelConnectWait } from "../../cloud-agents/model-connect-wait.js";
import { GitHubOnComputer } from "../../cloud-agents/coding-github.js";
import { runCodingJob } from "../../cloud-agents/coding-run.js";
import { CodingRunner, createComputerServer } from "../../cloud-agents/coding-runner.js";
import { CLOUD_AGENT_POLL_INTERVAL_MS } from "./cloud-agent-poll-loop.js";
import { SandCloudAgentManager } from "./cloud-agents-service.js";

interface CloudAgentExtensionHost {
  convertCloudAgentConversationToTrace(conversation: unknown): readonly unknown[];
  readonly whenBackgroundWorkReady?: Promise<unknown>;
}

/** The transcript's wake for an agent that waited on the chat's Connect GitHub card (`box-handoff-resume.ts`). */
interface GitHubWake { resumeAfterGitHubConnect?(agentId: string, login?: string): Promise<void>; resumeAfterModelConnect?(agentId: string, coder: string): Promise<void> }
/** The transcript's line for a cloud agent's first words, in the chat of the agent that asked it (`agent-to-agent-messaging.ts`). */
interface CloudAgentLines { noteCloudAgentSaid?(cloudAgent: { id: string; name: string; coder?: string }, text: string): Promise<boolean> }

export const cloudAgentsExtension = defineHostExtension({
  id: HostExtensions.CloudAgents,
  dependencies: [HostExtensions.Auth, HostExtensions.Transcript],
  start: (context) => {
    const auth = context.deps.auth as { getAccessToken(options?: { readonly backendUrl: string }): Promise<string>; getMachineId(): Promise<string> };
    const host = context.host as CloudAgentExtensionHost;
    const service = new SandCloudAgentManager({ getAccountAccessToken: auth.getAccessToken, getMachineId: auth.getMachineId, convertConversationMessagesToTrace: (conversation) => host.convertCloudAgentConversationToTrace(conversation), completionPolling: createRealPollingPolicy({ name: "cloud-agent-completion", intervalMs: CLOUD_AGENT_POLL_INTERVAL_MS }), clock: realClock });
    context.onStop(() => service.dispose());
    if (isCloudAgentsServed()) service.prefetchTeamAdminPolicy();
    if (isCloudAgentsServed()) {
      // A cloud agent's coding, done on this computer in Claude Code on the
      // person's own plan (11 November 2026, `host/cloud-agents/`), or in
      // Codex on their ChatGPT plan (13 November 2026, `host/codex/`), or
      // in Cursor on their Cursor plan (the same day, `host/cursor/`).
      const github = new GitHubOnComputer();
      const cursor = new CursorOnComputer();
      const transcript = context.deps[HostExtensions.Transcript] as (GitHubWake & CloudAgentLines) | undefined;
      const runner = new CodingRunner({
        server: createComputerServer({ getBackendUrl: getConfiguredBackendUrl, getAccessToken: (options) => auth.getAccessToken(options) }),
        run: (job, signal, onWork) => runCodingJob(job, {
          choice: codingChoice,
          // Codex's calls go through Simeon Labs' server, on the ChatGPT account the person connected there.
          codexRelay: { getBackendUrl: getConfiguredBackendUrl, getAccessToken: (options) => auth.getAccessToken(options) },
          account: () => github.account({ fresh: true }),
          signal,
          onWork,
          // Its "on it", as its message back in the chat of the agent that asked (13 November 2026).
          onFirstWords: (words, coder) => void transcript?.noteCloudAgentSaid?.({ id: job.bcId, name: job.name, coder }, words)?.catch(() => undefined),
          onUsage: (windows) => void reportClaudeCodeUsage(windows),
          onSignedOut: () => void reportClaudeCodeSignedOut(),
        }),
      });
      service.attachCoding(runner);
      service.attachGitHub(github);
      service.attachCursor(cursor);
      // The agent that showed the card goes on once GitHub is connected, as after a routine's Slack or GitHub card.
      github.onConnected((agentId, login) => void transcript?.resumeAfterGitHubConnect?.(agentId, login));
      // The same once Claude or ChatGPT is connected from the card that offers both (13 November 2026).
      const modelWait = new ModelConnectWait({
        // Cursor's sign-in is on this computer: `codingChoice` sees it once it is there.
        connected: (program) => (program === undefined ? codingChoice() : codingChoiceOf(program)),
        read: readSimeonModelRolesNow,
        onConnected: (agentId, choice) => void transcript?.resumeAfterModelConnect?.(agentId, choice.coder)?.catch(() => undefined),
      });
      service.attachModelWait(modelWait);
      void (host.whenBackgroundWorkReady ?? Promise.resolve()).then(() => runner.start(), () => runner.start());
      context.onStop(() => { runner.stop(); github.dispose(); cursor.dispose(); modelWait.dispose(); });
    }
    return service;
  }
});
