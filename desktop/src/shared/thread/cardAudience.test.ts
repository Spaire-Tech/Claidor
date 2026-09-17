import { describe, expect, test } from 'vitest';

import { AgentId } from '../agent/constants';
import { cardAgentId, cardBelongsToAgent, cardsForAgent, soleActiveAgent } from './cardAudience';

describe('which thread a card belongs in', () => {
  test('the agent whose turn raised it', () => {
    expect(cardAgentId({ agentId: 'juno' })).toBe('juno');
    expect(cardBelongsToAgent({ agentId: 'juno' }, 'juno')).toBe(true);
  });

  test('and nowhere else — the founder\'s "should be per agents"', () => {
    expect(cardBelongsToAgent({ agentId: 'juno' }, 'mira')).toBe(false);
    expect(cardBelongsToAgent({ agentId: 'juno' }, AgentId.Main)).toBe(false);
  });

  test('a card with no agent goes to main\'s thread, not to all of them', () => {
    expect(cardAgentId({})).toBe(AgentId.Main);
    expect(cardBelongsToAgent({}, AgentId.Main)).toBe(true);
    expect(cardBelongsToAgent({}, 'juno')).toBe(false);
    // An empty or blank id is the same as none: main's thread.
    expect(cardAgentId({ agentId: '   ' })).toBe(AgentId.Main);
  });

  test('only the open agent\'s cards are handed out, in the order they arrived', () => {
    const cards = [
      { id: 'a', agentId: 'juno' },
      { id: 'b', agentId: 'mira' },
      { id: 'c' },
      { id: 'd', agentId: 'juno' },
    ];
    expect(cardsForAgent(cards, 'juno').map(one => one.id)).toEqual(['a', 'd']);
    expect(cardsForAgent(cards, 'mira').map(one => one.id)).toEqual(['b']);
    expect(cardsForAgent(cards, AgentId.Main).map(one => one.id)).toEqual(['c']);
  });

  test('a thread nobody raised a card in gets none', () => {
    expect(cardsForAgent([{ agentId: 'juno' }], 'kaya')).toEqual([]);
    expect(cardsForAgent([], 'juno')).toEqual([]);
  });
});

describe('the agent a tool call came from', () => {
  test('one turn running is one possible caller', () => {
    expect(soleActiveAgent(['juno'])).toBe('juno');
  });

  test('the same agent twice — two conversations of its own — is still that agent', () => {
    expect(soleActiveAgent(['juno', 'juno'])).toBe('juno');
  });

  test('two agents at once is a guess, so it says nothing', () => {
    expect(soleActiveAgent(['juno', 'mira'])).toBeUndefined();
  });

  test('nothing running is nothing to say', () => {
    expect(soleActiveAgent([])).toBeUndefined();
    expect(soleActiveAgent(['  '])).toBeUndefined();
  });
});
