/**
 * How much the agent may do on this computer without asking.
 *
 * This is the most important setting in the product and until now it did
 * not exist, which would be a small thing except that upstream pinned it
 * to the most permissive value and wrote a comment saying so:
 *
 *     // Ensure exec-approvals.json has security=full + ask=off so the
 *     // gateway never triggers approval-pending for any command.
 *
 * That ran on every config sync. `bash-tools.exec.ts` in the engine
 * treats `security: "full"` with `ask: "off"` as a full bypass, so the
 * approval card the design is built around — "Allow Perrin to run
 * commands on your local computer?" — could not fire. Not because the
 * listener was missing, which was a separate bug and is fixed; because
 * the engine had been told never to ask.
 *
 * `direction.md`, from the founder: *every action on the computer asks
 * first*. So the default here is `Ask`, and the value is a person's to
 * change.
 *
 * The three values map onto the engine's own exec modes
 * (`infra/exec-approvals.ts`, `resolveExecPolicyForMode`) — this is not a
 * parallel vocabulary, it is the engine's, named the way the settings
 * screen says it:
 *
 * | here | engine mode | security | ask | autoReview |
 * |---|---|---|---|---|
 * | `Ask`   | `ask`  | allowlist | on-miss | false |
 * | `Auto`  | `auto` | allowlist | on-miss | true  |
 * | `Allow` | `full` | full      | off     | false |
 */
export const ExecPolicy = {
  /** Ask before anything that is not already allowed. The default. */
  Ask: 'ask',
  /** The same, but the agent reviews its own action first. */
  Auto: 'auto',
  /** Never ask. What upstream forced, now a choice. */
  Allow: 'allow',
} as const;
export type ExecPolicy = typeof ExecPolicy[keyof typeof ExecPolicy];

export const DEFAULT_EXEC_POLICY: ExecPolicy = ExecPolicy.Ask;

/** Where the choice is kept, in the app-wide `kv` table. */
export const EXEC_POLICY_KEY = 'exec_policy';

/** The engine's own shape for one of these. */
export interface EnginePolicy {
  security: 'allowlist' | 'full';
  ask: 'off' | 'on-miss';
  autoReview: boolean;
}

/**
 * What to write into `exec-approvals.json` for a policy.
 *
 * Kept here rather than in the sync so both processes and the tests read
 * one table. The engine derives the same three from its `ExecMode`; if it
 * ever changes them, this is the single place that has to follow.
 */
export function enginePolicyFor(policy: ExecPolicy): EnginePolicy {
  switch (policy) {
    case ExecPolicy.Allow:
      return { security: 'full', ask: 'off', autoReview: false };
    case ExecPolicy.Auto:
      return { security: 'allowlist', ask: 'on-miss', autoReview: true };
    case ExecPolicy.Ask:
    default:
      return { security: 'allowlist', ask: 'on-miss', autoReview: false };
  }
}

/** Anything else that reaches this — an older build, a hand-edit — is `Ask`. */
export function asExecPolicy(value: unknown): ExecPolicy {
  return value === ExecPolicy.Allow || value === ExecPolicy.Auto || value === ExecPolicy.Ask
    ? value
    : DEFAULT_EXEC_POLICY;
}

/** The IPC channels behind the settings screen. */
export const SettingsChannel = {
  GetExecPolicy: 'settings:getExecPolicy',
  SetExecPolicy: 'settings:setExecPolicy',
} as const;
export type SettingsChannel = typeof SettingsChannel[keyof typeof SettingsChannel];
