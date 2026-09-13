import { describe, expect, test } from 'vitest';

import { ASSISTANT_VOICE_ORDER, AssistantVoice } from '../../shared/onboarding/constants';
import type { SpeechVoice } from '../../shared/speech/constants';
import { assignVoicesToStyles, PINNED_VOICES, voiceForStyle } from './speechVoiceAssignment';

const SIREN = 'eXpIbVcVbLo8ZJQDlDnl';
const LUKE = 'RNnkVeW25AwKYxZgnHBH';

const voices = (...ids: string[]): SpeechVoice[] =>
  ids.map(voiceId => ({ voiceId, name: `voice-${voiceId}` }));

describe('the chosen voices', () => {
  test('Sassy is Siren and Warm is Luke, whatever the account lists', () => {
    // The founder listened and chose these two. A chosen voice must not
    // move when the account gains a voice or answers in another order.
    for (const account of [voices('a', 'b', 'c'), voices(), voices(SIREN, LUKE, 'a')]) {
      const assignment = assignVoicesToStyles(account);
      expect(voiceForStyle(assignment, AssistantVoice.Sassy)).toBe(SIREN);
      expect(voiceForStyle(assignment, AssistantVoice.Warm)).toBe(LUKE);
    }
  });

  test('only those two are pinned; the rest are still open', () => {
    expect(Object.keys(PINNED_VOICES).sort())
      .toEqual([AssistantVoice.Sassy, AssistantVoice.Warm].sort());
  });
});

describe('the styles nobody has chosen yet', () => {
  test('never take a voice that is already spoken for', () => {
    // Siren belongs to Sassy. If it were left in the pool, Concise could
    // sound identical to Sassy while a third voice went unused.
    const assignment = assignVoicesToStyles(voices(SIREN, LUKE, 'spare-one', 'spare-two'));
    for (const style of [AssistantVoice.Concise, AssistantVoice.Balanced, AssistantVoice.Direct]) {
      expect([SIREN, LUKE]).not.toContain(voiceForStyle(assignment, style));
    }
  });

  test('get a voice each when the account has enough', () => {
    const assignment = assignVoicesToStyles(voices('a', 'b', 'c'));
    const spoken = [AssistantVoice.Concise, AssistantVoice.Balanced, AssistantVoice.Direct]
      .map(style => voiceForStyle(assignment, style));
    expect(new Set(spoken).size).toBe(3);
  });

  test('share rather than fall silent when the account has few', () => {
    const assignment = assignVoicesToStyles(voices('only'));
    for (const style of [AssistantVoice.Concise, AssistantVoice.Balanced, AssistantVoice.Direct]) {
      expect(voiceForStyle(assignment, style)).toBe('only');
    }
  });

  test('fall back to the pinned voices rather than silence when nothing else exists', () => {
    // An account holding only the two chosen voices is a real state: the
    // founder added exactly those two. Three silent play buttons would
    // read as a broken screen.
    const assignment = assignVoicesToStyles(voices(SIREN, LUKE));
    for (const style of [AssistantVoice.Concise, AssistantVoice.Balanced, AssistantVoice.Direct]) {
      expect(voiceForStyle(assignment, style)).toBeTruthy();
    }
  });

  test('say nothing at all when the account has no voices', () => {
    const assignment = assignVoicesToStyles([]);
    expect(voiceForStyle(assignment, AssistantVoice.Concise)).toBeNull();
  });
});

describe('every style', () => {
  test('has a voice when the account has any', () => {
    const assignment = assignVoicesToStyles(voices('a', 'b', 'c', 'd', 'e'));
    for (const style of ASSISTANT_VOICE_ORDER) {
      expect(voiceForStyle(assignment, style)).toBeTruthy();
    }
  });

  test('hears the same voice on the same account every time', () => {
    const account = voices('a', 'b', 'c');
    expect(assignVoicesToStyles(account)).toEqual(assignVoicesToStyles(account));
  });
});
