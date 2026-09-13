import { PlatformRegistry } from '@shared/platform';

/** The IM platforms Maties offers. Maties is English-only, so there is one list. */
export const getVisibleIMPlatforms = (_language?: string): readonly string[] => {
  return PlatformRegistry.platforms;
};
