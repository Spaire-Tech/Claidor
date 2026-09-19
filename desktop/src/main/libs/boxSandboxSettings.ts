/**
 * Whether the engine runs the agent on this Mac or on the box, and on what.
 *
 * This replaces a one-line gate that returned `off` for every install that was
 * not enterprise, which meant the sandbox was dead code for ordinary people
 * however they set their execution mode.
 *
 * The rule now: the person's execution mode decides *whether* to sandbox, and
 * what is actually configured decides *where*. Nothing here can turn the box on
 * by accident — a box the app cannot reach resolves to `off` with a reason,
 * because the alternative is the engine accepting `backend: "box"` and then
 * failing at the first tool call with an error nobody can act on.
 */
import type { CoworkExecutionMode } from '../coworkStore';

export type SandboxMode = 'off' | 'non-main' | 'all';
export type SandboxScope = 'session' | 'agent' | 'shared';
export type SandboxBackendId = 'box' | 'docker';

export type ResolvedSandboxSettings = {
  mode: SandboxMode;
  backend?: SandboxBackendId;
  scope?: SandboxScope;
  /** One sentence for the gateway log, so "why is it off" is answerable. */
  reason: string;
};

export type SandboxInputs = {
  executionMode: CoworkExecutionMode;
  /** Where the box plugin would reach its broker, or null when it cannot. */
  boxBrokerBaseUrl: string | null;
  isEnterprise: boolean;
};

/**
 * The box is one machine shared by every agent.
 *
 * `shared` collapses the engine's scope key to the literal "shared", so every
 * agent lands in the same workspace on the same box — which is what the spec
 * asks for. `agent` would give each agent a box of its own, and a bill each.
 */
export const BOX_SANDBOX_SCOPE: SandboxScope = 'shared';

export function resolveSandboxSettings(inputs: SandboxInputs): ResolvedSandboxSettings {
  const mode = modeForExecutionMode(inputs.executionMode);
  if (mode === 'off') {
    return { mode: 'off', reason: 'execution mode is local: the agent works on this Mac' };
  }

  if (inputs.boxBrokerBaseUrl) {
    return {
      mode,
      backend: 'box',
      scope: BOX_SANDBOX_SCOPE,
      reason: `the box, brokered at ${inputs.boxBrokerBaseUrl}`,
    };
  }

  // The previous behaviour, kept: an enterprise install without a box still
  // gets the engine's own Docker backend rather than losing its sandbox.
  if (inputs.isEnterprise) {
    return { mode, backend: 'docker', scope: 'session', reason: 'no box configured; Docker' };
  }

  return {
    mode: 'off',
    reason: 'the box is not reachable yet (no broker), so there is nowhere to sandbox to',
  };
}

function modeForExecutionMode(executionMode: CoworkExecutionMode): SandboxMode {
  switch (executionMode) {
    case 'sandbox':
      // Everything on the box.
      return 'all';
    case 'auto':
      // The agent the person talks to stays here; its helpers go to the box.
      return 'non-main';
    case 'local':
    default:
      return 'off';
  }
}

/**
 * The box plugin's own path on the local token proxy; the server side is
 * `/api/proxy/box`. Going through the proxy is what keeps the account's token
 * out of `openclaw.json`, where it would go stale.
 */
export const BOX_PROXY_PATH = '';

export const boxBrokerBaseUrlFor = (tokenProxyPort: number): string => (
  `http://127.0.0.1:${tokenProxyPort}${BOX_PROXY_PATH}`
);
