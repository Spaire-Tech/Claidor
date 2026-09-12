import { DEFAULT_ASSISTANT_NAME, OnboardingStoreKey } from '@shared/onboarding/constants';
import { useEffect, useState } from 'react';

/** The assistant's name as the onboarding stored it; the default until then. */
export const useAssistantName = (): string => {
  const [name, setName] = useState(DEFAULT_ASSISTANT_NAME);
  useEffect(() => {
    let active = true;
    window.electron.store.get(OnboardingStoreKey.AssistantName)
      .then((stored: unknown) => {
        if (active && typeof stored === 'string' && stored.trim()) setName(stored.trim());
      })
      .catch((error: unknown) => {
        console.warn('[Connections] Could not read the assistant name', error);
      });
    return () => { active = false; };
  }, []);
  return name;
};
