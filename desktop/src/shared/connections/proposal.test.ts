import { describe, expect, test } from 'vitest';

import { CONNECTION_ITEMS } from './catalog';
import {
  connectorIds,
  parseProposeConnectorInput,
  PROPOSE_CONNECTOR_LIMITS,
  proposedConnection,
} from './proposal';

describe('what the tool accepts', () => {
  test('a catalogue id comes through, with the reason cleaned', () => {
    expect(parseProposeConnectorInput({ connectionId: 'gmail', reason: '  To read   the thread. ' }))
      .toEqual({ connectionId: 'gmail', reason: 'To read the thread.' });
  });

  test('the id is case-insensitive and the reason optional', () => {
    expect(parseProposeConnectorInput({ connectionId: ' Notion ' })).toEqual({ connectionId: 'notion' });
    expect(parseProposeConnectorInput({ connectionId: 'notion', reason: '   ' })).toEqual({ connectionId: 'notion' });
  });

  test('no id, or one the catalogue does not have, is refused with the list', () => {
    const missing = parseProposeConnectorInput({});
    expect(missing).toMatch(/connectionId is required/);
    expect(missing).toContain('gmail');
    const unknown = parseProposeConnectorInput({ connectionId: 'myspace' });
    expect(unknown).toMatch(/"myspace" is not a connector this app can connect/);
    expect(unknown).toContain('linkedin');
    expect(parseProposeConnectorInput(null)).toMatch(/connectionId is required/);
    expect(parseProposeConnectorInput(['gmail'])).toMatch(/connectionId is required/);
  });

  test('a runaway reason is cut rather than refused', () => {
    const parsed = parseProposeConnectorInput({ connectionId: 'gmail', reason: 'x'.repeat(500) });
    if (typeof parsed === 'string') throw new Error(parsed);
    expect(parsed.reason).toHaveLength(PROPOSE_CONNECTOR_LIMITS.reason);
  });
});

describe('the catalogue behind it', () => {
  test('every id the tool may name is a card in the catalogue, once', () => {
    expect(connectorIds()).toEqual(CONNECTION_ITEMS.map(one => one.id));
    expect(new Set(connectorIds()).size).toBe(connectorIds().length);
  });

  test('anything that parsed has a catalogue entry', () => {
    for (const id of connectorIds()) {
      const parsed = parseProposeConnectorInput({ connectionId: id });
      if (typeof parsed === 'string') throw new Error(parsed);
      expect(proposedConnection(parsed)?.id).toBe(id);
    }
  });
});
