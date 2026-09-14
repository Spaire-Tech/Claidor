import { describe, expect, test } from 'vitest';

import {
  EVENT_TRIGGER_MAX_BODY_BYTES,
  EVENT_TRIGGER_SESSION_PREFIX,
  eventTriggerConfig,
  eventTriggerExample,
  eventTriggerUrl,
} from './constants';

describe('what the endpoint is allowed to do', () => {
  test('a caller cannot choose which conversation it lands in', () => {
    // Otherwise a payload asking to run as `main` drops an inbound event
    // into the thread the person is actually using.
    const config = eventTriggerConfig('t');
    expect(config.allowRequestSessionKey).toBe(false);
    expect(config.allowedSessionKeyPrefixes).toEqual([EVENT_TRIGGER_SESSION_PREFIX]);
  });

  test('the body limit is tighter than the engine’s default', () => {
    // Nothing legitimate on this path is large. A misdirected upload
    // should not reach memory.
    expect(eventTriggerConfig('t').maxBodyBytes).toBe(EVENT_TRIGGER_MAX_BODY_BYTES);
    expect(EVENT_TRIGGER_MAX_BODY_BYTES).toBe(262_144);
  });

  test('it is on only when there is a token to guard it', () => {
    expect(eventTriggerConfig('t').enabled).toBe(true);
    expect(eventTriggerConfig('t').token).toBe('t');
  });
});

describe('what a person is handed', () => {
  test('the address is on this computer and nowhere else', () => {
    // The gateway binds to loopback. Anything that says otherwise is a
    // promise we cannot keep.
    expect(eventTriggerUrl(51515)).toBe('http://127.0.0.1:51515/hooks');
  });

  test('the example is a command, not a paragraph about bearer tokens', () => {
    const example = eventTriggerExample(51515, 'abc123');
    expect(example).toContain('curl -X POST http://127.0.0.1:51515/hooks');
    expect(example).toContain('authorization: Bearer abc123');
    expect(example).toContain('"text"');
  });
});
