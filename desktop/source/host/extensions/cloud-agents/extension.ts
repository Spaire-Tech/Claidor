import { isCloudAgentsServed } from "../../../shared/cloud-agents-availability.js";
import { createRealPollingPolicy, realClock } from "../../../internal/scheduling.js";
import { defineHostExtension } from "../../../internal/host-extensions.js";
import { getConfiguredBackendUrl } from "../../../shared/node/simeon-token.js";
import { HostExtensions } from "../extension-ids.generated.js";
import { reportClaudeCodeSignedOut, reportClaudeCodeUsage } from "../inference/simeon-model-roles.js";
import { claudeCodingChoice } from "../../cloud-agents/coding-choice.js";
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
interface GitHubWake { resumeAfterGitHubConnect?(agentId: string, login?: string): Promise<void> }

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
      // person's own plan (11 November 2026, `host/cloud-agents/`).
      const github = new GitHubOnComputer();
      const runner = new CodingRunner({
        server: createComputerServer({ getBackendUrl: getConfiguredBackendUrl, getAccessToken: (options) => auth.getAccessToken(options) }),
        run: (job, signal, onWork) => runCodingJob(job, {
          choice: claudeCodingChoice,
          account: () => github.account({ fresh: true }),
          signal,
          onWork,
          onUsage: (windows) => void reportClaudeCodeUsage(windows),
          onSignedOut: () => void reportClaudeCodeSignedOut(),
        }),
      });
      service.attachCoding(runner);
      service.attachGitHub(github);
      // The agent that showed the card goes on once GitHub is connected, as after a routine's Slack or GitHub card.
      const transcript = context.deps[HostExtensions.Transcript] as GitHubWake | undefined;
      github.onConnected((agentId, login) => void transcript?.resumeAfterGitHubConnect?.(agentId, login));
      void (host.whenBackgroundWorkReady ?? Promise.resolve()).then(() => runner.start(), () => runner.start());
      context.onStop(() => { runner.stop(); github.dispose(); });
    }
    return service;
  }
});
