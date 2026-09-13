import React, { useCallback } from 'react';

import {
  ASSISTANT_NAME_SUGGESTIONS,
  assistantEmailFor,
  normalizeAssistantName,
} from '../../../shared/onboarding/constants';
import { i18nService } from '../../services/i18n';

/**
 * Screen 2, « Name your Maty »: the parrot, the large serif name field,
 * the assistant's address under it, and « Suggest another name » cycling
 * the founder's five names.
 */

const PARROT_SOURCE = './avatars/parrot.png';

const ShuffleIcon: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 4h4v4" />
    <path d="M20 4 4 20" />
    <path d="M4 4l5 5M16 20h4v-4" />
    <path d="M15 15l5 5" />
  </svg>
);

/** The suggestion after `current` in the founder's list; the first one when the name is the person's own. */
export const nextNameSuggestion = (current: string): string => {
  const index = ASSISTANT_NAME_SUGGESTIONS.findIndex(
    (candidate) => candidate.toLowerCase() === normalizeAssistantName(current).toLowerCase(),
  );
  return ASSISTANT_NAME_SUGGESTIONS[(index + 1) % ASSISTANT_NAME_SUGGESTIONS.length];
};

export interface NameStepProps {
  /** The field's raw value; the flow keeps the tidied name. */
  name: string;
  onNameChange: (name: string) => void;
}

const NameStep: React.FC<NameStepProps> = ({ name, onNameChange }) => {
  const address = assistantEmailFor(normalizeAssistantName(name));

  const suggest = useCallback(() => {
    onNameChange(nextNameSuggestion(name));
  }, [name, onNameChange]);

  return (
    <div className="maties-ob-step flex w-full max-w-[640px] flex-col items-center">
      <img
        src={PARROT_SOURCE}
        alt=""
        draggable={false}
        className="block h-auto self-center"
        style={{ width: 'clamp(140px,17vw,200px)' }}
      />
      <h1 className="maties-headline mt-[26px] text-center" style={{ fontSize: 'clamp(26px,3vw,36px)', letterSpacing: '-.016em' }}>
        {i18nService.t('matiesOnboardingNameTitle')}
      </h1>
      <input
        type="text"
        value={name}
        maxLength={24}
        autoComplete="off"
        spellCheck={false}
        aria-label={i18nService.t('matiesOnboardingNameTitle')}
        onChange={(event) => onNameChange(event.target.value)}
        className="maties-ob-name-input mt-6 w-full pb-[10px]"
        style={{ fontSize: 'clamp(34px,5vw,56px)' }}
      />
      <div className="maties-mono mt-[18px] text-[13.5px] text-[#6b7280]">{address}</div>
      <p className="mt-2 max-w-[52ch] text-center text-[14px] text-[#6b7280]" style={{ textWrap: 'pretty' }}>
        {i18nService.t('matiesOnboardingNameAddressLine')}
      </p>
      <button
        type="button"
        onClick={suggest}
        className="mt-[22px] flex cursor-pointer items-center gap-2 border-0 bg-transparent px-2 py-[6px] text-[14px] text-[#0060d0] hover:text-[#0050ae] dark:text-[#3b82f6]"
      >
        <ShuffleIcon />
        <span>{i18nService.t('matiesOnboardingNameSuggest')}</span>
      </button>
    </div>
  );
};

export default NameStep;
