/**
 * The parts of the box backend that do not need the engine SDK.
 *
 * Kept separate on purpose: the engine is not a dependency of this repository,
 * so anything importing `openclaw/plugin-sdk` cannot be unit-tested here. This
 * module holds the decisions worth testing — scope to box name, the exec spec
 * the engine spawns, and the config gate — and `backend.ts` wires them to the
 * SDK types.
 */
import { isLoopbackBroker, type BoxBrokerSettings } from './brokerClient';
import { BRIDGE_ENV } from './execProtocol.mjs';

export type { BoxBrokerSettings } from './brokerClient';
export { isLoopbackBroker } from './brokerClient';

/**
 * Where the box keeps files, from the spec's own layout
 * (`sources/grok-bot-agent-computer.md` §3): `/workspace` is the scratch and
 * working tree, `/home/box` holds the profile, memory, routines and agent data.
 *
 * These are defaults, not law: the broker knows which template it started and
 * may lay it out differently, so `ensureBox` can override them. Either way the
 * path is inside the box and never on the Mac.
 */
export const BOX_WORKSPACE_ROOT = '/workspace';
export const BOX_AGENT_WORKSPACE_ROOT = '/home/box';

/**
 * Where a copy from the person's machine lands when they do not choose a path.
 * The spec names it, and it matters: files arriving loose in `/workspace`
 * mixed with the agent's own working files is how custody stops being legible.
 */
export const BOX_UPLOADS_DIR = '/workspace/uploads';

export type BoxRuntimePaths = {
  /** Human-readable name for this scope's box, used as the registry label. */
  runtimeLabel: string;
  remoteWorkspaceDir: string;
  remoteAgentWorkspaceDir: string;
};

/**
 * One box per scope key. `sandbox.scope: "shared"` collapses every agent onto
 * the key "shared", which is the spec's one machine shared by all agents;
 * `"agent"` gives a box each.
 */
export function resolveBoxRuntimePaths(
  scopeKey: string,
  layout?: { workspaceDir?: string; agentWorkspaceDir?: string },
): BoxRuntimePaths {
  const trimmed = (scopeKey ?? '').trim() || 'shared';
  const safe = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const workspaceDir = layout?.workspaceDir?.trim();
  const agentWorkspaceDir = layout?.agentWorkspaceDir?.trim();
  return {
    runtimeLabel: `caisra-box-${safe || 'shared'}`,
    remoteWorkspaceDir: absoluteOrDefault(workspaceDir, BOX_WORKSPACE_ROOT),
    remoteAgentWorkspaceDir: absoluteOrDefault(agentWorkspaceDir, BOX_AGENT_WORKSPACE_ROOT),
  };
}

/**
 * A relative path from the broker would be resolved against whatever the box's
 * shell happens to be sitting in, which is not a decision the broker gets to
 * leave open. Anything that is not absolute falls back to the default.
 */
function absoluteOrDefault(value: string | undefined, fallback: string): string {
  return value && value.startsWith('/') ? value : fallback;
}

export type BoxExecSpecInput = {
  command: string;
  workdir?: string;
  env: Record<string, string>;
  usePty: boolean;
  boxId: string;
  brokerBaseUrl: string;
  /** Absent against the local token proxy — see `BoxBrokerSettings`. */
  accessToken?: string;
  execBridgePath: string;
  baseEnv: NodeJS.ProcessEnv;
  defaultWorkdir: string;
};

/**
 * What the engine actually spawns for a Shell tool call.
 *
 * The engine's sandbox exec path is argv-shaped and spawns a local child
 * process, so the box cannot be reached directly — the argv points at the
 * bridge, and everything the bridge needs travels in its environment. The token
 * goes in `env` and never in `argv`, because argv is world-readable in `ps`.
 */
export function buildBoxExecSpec(input: BoxExecSpecInput): {
  argv: string[];
  env: NodeJS.ProcessEnv;
  stdinMode: 'pipe-open' | 'pipe-closed';
} {
  return {
    argv: [process.execPath, input.execBridgePath],
    env: {
      ...input.baseEnv,
      [BRIDGE_ENV.broker]: input.brokerBaseUrl,
      // Left out entirely rather than set to "undefined", which spawn would
      // pass along as the literal string.
      ...(input.accessToken ? { [BRIDGE_ENV.token]: input.accessToken } : {}),
      [BRIDGE_ENV.boxId]: input.boxId,
      [BRIDGE_ENV.command]: input.command,
      [BRIDGE_ENV.workdir]: input.workdir ?? input.defaultWorkdir,
      [BRIDGE_ENV.env]: JSON.stringify(input.env ?? {}),
      [BRIDGE_ENV.pty]: input.usePty ? '1' : '0',
    },
    // Mirrors the docker backend. For a non-pty exec the engine closes stdin
    // immediately, which is what lets the bridge read it to EOF and send it
    // with the request instead of hanging on a pipe that never ends.
    stdinMode: input.usePty ? 'pipe-open' : 'pipe-closed',
  };
}

/**
 * A bind mount means "this directory on the Mac IS that directory in the
 * sandbox". A box is not on the Mac, so the promise cannot be kept. Failing
 * loudly beats silently reading the wrong disk.
 */
export function assertNoBinds(binds: readonly string[] | undefined): void {
  if ((binds?.length ?? 0) > 0) {
    throw new Error(
      'The box backend does not support sandbox.docker.binds — files reach the box by import.',
    );
  }
}

/**
 * The plugin refuses to register a half-configured backend.
 *
 * Registering anyway would mean the engine accepts
 * `sandbox.backend: "box"` and then fails at the first tool call, deep inside a
 * turn, with an error the person cannot act on. Refusing at load time puts the
 * reason in the gateway log where it can be read.
 */
export function readBoxConfig(raw: unknown): BoxBrokerSettings | { error: string } {
  const config = (raw ?? {}) as Partial<BoxBrokerSettings>;
  const brokerBaseUrl = typeof config.brokerBaseUrl === 'string' ? config.brokerBaseUrl.trim() : '';
  const accessToken = typeof config.accessToken === 'string' ? config.accessToken.trim() : '';
  if (!brokerBaseUrl) {
    return { error: 'no brokerBaseUrl' };
  }
  if (!accessToken && !isLoopbackBroker(brokerBaseUrl)) {
    return { error: 'a broker that is not on this machine needs an accessToken' };
  }
  return {
    brokerBaseUrl,
    accessToken: accessToken || undefined,
    template: typeof config.template === 'string' && config.template.trim()
      ? config.template.trim()
      : undefined,
    requestTimeoutMs: Number.isInteger(config.requestTimeoutMs)
      ? config.requestTimeoutMs
      : undefined,
  };
}
