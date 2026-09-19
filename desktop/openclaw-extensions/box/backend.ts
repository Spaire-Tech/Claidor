/**
 * The box as an engine sandbox backend.
 *
 * Modelled on the engine's ssh backend, which is the closer of the two shipped
 * templates because it already drives a machine that is not this one. Three
 * things are deliberately NOT copied from it, each recorded with evidence in
 * `docs/product/agent-computer-plan.md`:
 *
 *  1. It opens a fresh SSH connection per call. We hold one client.
 *  2. Its `ensureRuntime` tars the whole local workspace over to the far side
 *     and wipes the far side first. The box starts empty; the person's files
 *     arrive only by explicit import.
 *  3. It leaves the runtime behind. A box costs money by the second, so
 *     `removeRuntime` really destroys it.
 *
 * `capabilities.browser` is false, and that is not an oversight — see §3c of
 * the plan. The engine's sandbox browser is `execDocker` end to end and hands
 * back a `127.0.0.1` URL, so a box cannot serve one through this interface.
 * Declaring true would make the engine run Docker on the person's Mac while the
 * agent's shell runs in a datacentre.
 */
import { fileURLToPath } from 'node:url';

import type {
  CreateSandboxBackendParams,
  SandboxBackendCommandParams,
  SandboxBackendCommandResult,
  SandboxBackendHandle,
  SandboxBackendManager,
} from 'openclaw/plugin-sdk/sandbox';
import { createRemoteShellSandboxFsBridge, sanitizeEnvVars } from 'openclaw/plugin-sdk/sandbox';

import {
  assertNoBinds,
  buildBoxExecSpec,
  resolveBoxRuntimePaths,
  type BoxBrokerSettings,
} from './backendSpec';
import { BoxBrokerClient, type BoxState } from './brokerClient';

export { BOX_AGENT_WORKSPACE_ROOT, BOX_WORKSPACE_ROOT } from './backendSpec';

/** Absolute path to the bridge the engine spawns for each Shell tool call. */
export function resolveExecBridgePath(): string {
  return fileURLToPath(new URL('./execBridge.mjs', import.meta.url));
}

export function createBoxSandboxBackendFactory(params: {
  config: BoxBrokerSettings;
  fetchImpl?: typeof fetch;
  execBridgePath?: string;
}) {
  return async (createParams: CreateSandboxBackendParams): Promise<SandboxBackendHandle> => {
    assertNoBinds(createParams.cfg.docker.binds);
    const client = new BoxBrokerClient(params.config, params.fetchImpl);
    const impl = new BoxSandboxBackend({
      client,
      scopeKey: createParams.scopeKey,
      env: createParams.cfg.docker.env,
      execBridgePath: params.execBridgePath ?? resolveExecBridgePath(),
      brokerBaseUrl: params.config.brokerBaseUrl,
      accessToken: params.config.accessToken,
    });
    const state = await impl.ensureBox();
    return impl.asHandle(state);
  };
}

class BoxSandboxBackend {
  private statePromise: Promise<BoxState> | null = null;

  constructor(
    private readonly deps: {
      client: BoxBrokerClient;
      scopeKey: string;
      env?: Record<string, string>;
      execBridgePath: string;
      brokerBaseUrl: string;
      accessToken: string;
    },
  ) {}

  /**
   * Ask the broker for this scope's box, once. A failure is not cached, so a
   * transient broker error does not poison the whole session.
   */
  async ensureBox(): Promise<BoxState> {
    if (this.statePromise) {
      return await this.statePromise;
    }
    this.statePromise = this.deps.client.ensureBox(this.deps.scopeKey);
    try {
      return await this.statePromise;
    } catch (error) {
      this.statePromise = null;
      throw error;
    }
  }

  /**
   * `runtimeId` is the broker's own box id, not a name we invent. The engine
   * writes it into its sandbox registry as `containerName`, and that is the
   * only handle `removeRuntime` gets when it comes to destroy the box later —
   * so it has to be the id the broker will recognise.
   */
  asHandle(state: BoxState): SandboxBackendHandle {
    const paths = resolveBoxRuntimePaths(this.deps.scopeKey, state);
    const runShellCommand = async (
      command: SandboxBackendCommandParams,
    ): Promise<SandboxBackendCommandResult> => {
      const current = await this.ensureBox();
      return await this.deps.client.runShell(current.boxId, command);
    };

    return {
      id: 'box',
      runtimeId: state.boxId,
      runtimeLabel: paths.runtimeLabel,
      workdir: paths.remoteWorkspaceDir,
      env: this.deps.env,
      configLabel: this.deps.client.template ?? 'default',
      configLabelKind: 'Template',
      capabilities: {
        // See the file header. Not an oversight.
        browser: false,
      },
      buildExecSpec: async ({ command, workdir, env, usePty }) => buildBoxExecSpec({
        command,
        workdir,
        env,
        usePty,
        boxId: state.boxId,
        brokerBaseUrl: this.deps.brokerBaseUrl,
        accessToken: this.deps.accessToken,
        execBridgePath: this.deps.execBridgePath,
        baseEnv: sanitizeEnvVars(process.env).allowed,
        defaultWorkdir: paths.remoteWorkspaceDir,
      }),
      runShellCommand,
      // Mandatory. Without it the engine falls back to a bridge that reads
      // files off the HOST disk with fs.readFileSync — measured at zero round
      // trips, which on a box means reading the wrong machine entirely.
      createFsBridge: ({ sandbox }) => createRemoteShellSandboxFsBridge({
        sandbox,
        runtime: {
          remoteWorkspaceDir: paths.remoteWorkspaceDir,
          remoteAgentWorkspaceDir: paths.remoteAgentWorkspaceDir,
          runRemoteShellScript: runShellCommand,
        },
      }),
    };
  }
}

export function createBoxSandboxBackendManager(params: {
  config: BoxBrokerSettings;
  fetchImpl?: typeof fetch;
}): SandboxBackendManager {
  const client = () => new BoxBrokerClient(params.config, params.fetchImpl);
  return {
    async describeRuntime({ entry }) {
      try {
        const state = await client().describeBox(entry.containerName);
        return {
          running: state.running,
          actualConfigLabel: state.template,
          configLabelMatch: (state.template ?? 'default') === (params.config.template ?? 'default'),
        };
      } catch {
        // A box the broker no longer knows about is not running. Saying so is
        // better than throwing out of a status call.
        return { running: false, configLabelMatch: false };
      }
    },
    async removeRuntime({ entry }) {
      await client().removeBox(entry.containerName);
    },
  };
}
