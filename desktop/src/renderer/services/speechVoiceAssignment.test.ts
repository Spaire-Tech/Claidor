import { describe, expect, test } from 'vitest';

import { ASSISTANT_VOICE_ORDER, AssistantVoice } from '../../shared/onboarding/constants';
import type { SpeechVoice } from '../../shared/speech/constants';
import { assignVoicesToStyles, voiceForStyle } from './speechVoiceAssignment';

const voices = (...names: string[]): SpeechVoice[] =>
  names.map(name => ({ voiceId: `id-${name}`, name }));

describe('assignVoicesToStyles', () => {
  test('gives every style a voice', () => {
    const assignment = assignVoicesToStyles(voices('a', 'b', 'c', 'd', 'e'));
    for (const style of ASSISTANT_VOICE_ORDER) {
      expect(voiceForStyle(assignment, style)).toBeTruthy();
    }
  });

  test('gives the same account the same voice for the same style', () => {
    // The assignment is not stored anywhere, so it has to be a function of
    // the list alone or a style would change voice between two openings of
    // the same screen.
    const list = voices('a', 'b', 'c', 'd', 'e');
    expect(assignVoicesToStyles(list)).toEqual(assignVoicesToStyles(list));
  });

  test('gives five different voices when there are five', () => {
    const assigned = Object.values(assignVoicesToStyles(voices('a', 'b', 'c', 'd', 'e')));
    expect(new Set(assigned).size).toBe(ASSISTANT_VOICE_ORDER.length);
  });

  test('shares voices rather than leaving a style silent', () => {
    // A style with no voice is a play button that does nothing, which
    // reads as broken. Two characters who sound alike do not.
    const assignment = assignVoicesToStyles(voices('only'));
    for (const style of ASSISTANT_VOICE_ORDER) {
      expect(voiceForStyle(assignment, style)).toBe('id-only');
    }
  });

  test('assigns nothing when the account has no voices', () => {
    const assignment = assignVoicesToStyles([]);
    expect(assignment).toEqual({});
    expect(voiceForStyle(assignment, AssistantVoice.Concise)).toBeNull();
  });
});
