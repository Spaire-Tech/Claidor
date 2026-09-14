/**
 * Waking an agent because something happened, rather than because the
 * clock said so.
 *
 * **What the engine already has.** All of it, and we surface none of it.
 * `openclaw/src/gateway/server/hooks-request-handler.ts` is an inbound
 * HTTP endpoint with token auth, rate limiting on failed auth, per-agent
 * targeting, session-key policy, idempotency so a retried delivery does
 * not run twice, payload mapping, and — the part that matters most — it
 * marks the body as **external content**, so a webhook payload is data
 * the agent reads rather than instructions it follows.
 *
 * Writing that ourselves would have been weeks. It needed a config key.
 *
 * **What it cannot do, and why.** The gateway binds to loopback
 * (`--bind loopback`, `openclawEngineManager.ts:769`). Nothing on the
 * internet can reach it, and `docs/product/direction.md` §10 struck the
 * egress tunnel that would have changed that. So this is the *local*
 * half: anything already running on this computer can wake an agent —
 * a Shortcuts automation, a Folder Action, a `launchd` job, a git hook,
 * a script somebody wrote.
 *
 * Reaching it from GitHub or Linear needs a relay through our own
 * server and a way to deliver to a machine behind NAT. That is a real
 * piece of work with a design decision in it, it is written up in
 * `docs/product/sources/README.md`, and it is not pretended to here.
 */

/** The path the gateway serves the hooks endpoint on. */
export const EVENT_TRIGGER_PATH = '/hooks';

/** The file in the engine state directory holding the shared token. */
export const EVENT_TRIGGER_TOKEN_FILE = 'hook-token';

/**
 * Session keys an inbound event may run under.
 *
 * Everything the endpoint starts is prefixed `hook:`, so an event can
 * never be steered into a conversation the person is having. A payload
 * that asks to run as `main` is refused by the engine rather than by us.
 */
export const EVENT_TRIGGER_SESSION_PREFIX = 'hook:';

export interface EventTriggerConfig {
  enabled: boolean;
  token: string;
  path: string;
  allowRequestSessionKey: boolean;
  allowedSessionKeyPrefixes: readonly string[];
  maxBodyBytes: number;
}

/**
 * A quarter of a megabyte.
 *
 * Large enough for any webhook payload worth reading, small enough that
 * a misdirected upload cannot fill memory. The engine's own default is
 * larger; this is deliberately tighter because nothing legitimate on
 * this path is big.
 */
export const EVENT_TRIGGER_MAX_BODY_BYTES = 256 * 1024;

export function eventTriggerConfig(token: string): EventTriggerConfig {
  return {
    enabled: true,
    token,
    path: EVENT_TRIGGER_PATH,
    // A caller does not get to choose which conversation it lands in.
    allowRequestSessionKey: false,
    allowedSessionKeyPrefixes: [EVENT_TRIGGER_SESSION_PREFIX],
    maxBodyBytes: EVENT_TRIGGER_MAX_BODY_BYTES,
  };
}

/** Where a local automation posts to, once the gateway port is known. */
export function eventTriggerUrl(port: number): string {
  return `http://127.0.0.1:${port}${EVENT_TRIGGER_PATH}`;
}

/**
 * The line somebody pastes into a script.
 *
 * Shown rather than described: a person wiring up a Folder Action does
 * not want a paragraph about bearer tokens, they want the command. The
 * token is included because this is a loopback endpoint on their own
 * machine and the command is useless without it.
 */
export function eventTriggerExample(port: number, token: string): string {
  return [
    `curl -X POST ${eventTriggerUrl(port)} \\`,
    `  -H 'authorization: Bearer ${token}' \\`,
    "  -H 'content-type: application/json' \\",
    `  -d '{"text":"The overnight export finished."}'`,
  ].join('\n');
}
