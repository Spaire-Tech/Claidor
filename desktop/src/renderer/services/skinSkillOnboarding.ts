/**
 * Starting the AI appearance designer.
 *
 * This used to be a Kit: the app installed `ai-skin-designer` from the kit
 * store, which existed only to switch on the bundled `skin-creator` skill and
 * hand over a starter prompt. Kits are gone, so the flow does the two real
 * things directly — switch the bundled skill on, and open the chat with the
 * starter prompt and that skill selected.
 */
import { SkinPackSkillId } from '../../shared/skin/kit';
import { i18nService } from './i18n';
import { skillService } from './skill';

interface SkinSkillOnboardingService {
  setSkillEnabled(id: string, enabled: boolean): Promise<unknown>;
}

export interface PreparedSkinSkillOnboarding {
  skillId: string;
  prompt: string;
}

export async function prepareSkinSkillOnboarding(
  service: SkinSkillOnboardingService = skillService,
  translate: (key: string) => string = (key) => i18nService.t(key),
): Promise<PreparedSkinSkillOnboarding> {
  const prompt = translate('aiSkinStarterPrompt').trim();
  if (!prompt) {
    throw new Error('The appearance designer has no starter prompt');
  }

  await service.setSkillEnabled(SkinPackSkillId.BuiltIn, true);

  return { skillId: SkinPackSkillId.BuiltIn, prompt };
}
