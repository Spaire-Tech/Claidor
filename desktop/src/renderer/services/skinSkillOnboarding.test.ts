import { describe, expect, test, vi } from 'vitest';

import { prepareSkinSkillOnboarding } from './skinSkillOnboarding';

const STARTER_PROMPT = 'Create a custom appearance for Maties.';

describe('prepareSkinSkillOnboarding', () => {
  test('switches the bundled appearance skill on and returns its starter prompt', async () => {
    const setSkillEnabled = vi.fn().mockResolvedValue([]);
    const prepared = await prepareSkinSkillOnboarding(
      { setSkillEnabled },
      () => STARTER_PROMPT,
    );

    expect(setSkillEnabled).toHaveBeenCalledWith('skin-creator', true);
    expect(prepared).toEqual({ skillId: 'skin-creator', prompt: STARTER_PROMPT });
  });

  test('refuses to start without a starter prompt', async () => {
    const setSkillEnabled = vi.fn().mockResolvedValue([]);
    await expect(prepareSkinSkillOnboarding({ setSkillEnabled }, () => '   '))
      .rejects.toThrow('starter prompt');
    expect(setSkillEnabled).not.toHaveBeenCalled();
  });

  test('fails loudly when the skill cannot be switched on', async () => {
    const setSkillEnabled = vi.fn().mockRejectedValue(new Error('disk is full'));
    await expect(prepareSkinSkillOnboarding({ setSkillEnabled }, () => STARTER_PROMPT))
      .rejects.toThrow('disk is full');
  });
});
