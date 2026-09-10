import { describe, expect, test } from 'vitest';

import { ASSISTANT_VOICE_ORDER, AssistantVoice } from '../../shared/onboarding/constants';
import { ASSISTANT_VOICE_INSTRUCTIONS, buildManagedVoicePrompt, VOICE_SECTION_HEADING } from './openclawVoicePrompt';

const countWords = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

describe('buildManagedVoicePrompt', () => {
  test('has one instruction per voice, each under sixty words', () => {
    for (const voice of ASSISTANT_VOICE_ORDER) {
      const instruction = ASSISTANT_VOICE_INSTRUCTIONS[voice];
      expect(instruction.length).toBeGreaterThan(0);
      expect(countWords(instruction)).toBeLessThan(60);
    }
  });

  test('renders a Voice section with the chosen instruction', () => {
    const prompt = buildManagedVoicePrompt(AssistantVoice.Sassy);

    expect(prompt.startsWith(VOICE_SECTION_HEADING)).toBe(true);
    expect(prompt).toContain(ASSISTANT_VOICE_INSTRUCTIONS[AssistantVoice.Sassy]);
    expect(prompt).not.toContain(ASSISTANT_VOICE_INSTRUCTIONS[AssistantVoice.Concise]);
  });

  test('says what each voice is for', () => {
    expect(ASSISTANT_VOICE_INSTRUCTIONS[AssistantVoice.Concise]).toMatch(/no preamble/i);
    expect(ASSISTANT_VOICE_INSTRUCTIONS[AssistantVoice.Balanced]).toMatch(/unhurried/i);
    expect(ASSISTANT_VOICE_INSTRUCTIONS[AssistantVoice.Warm]).toMatch(/encouraging/i);
    expect(ASSISTANT_VOICE_INSTRUCTIONS[AssistantVoice.Direct]).toMatch(/without hedging/i);
    expect(ASSISTANT_VOICE_INSTRUCTIONS[AssistantVoice.Sassy]).toMatch(/never unkind/i);
  });
});
