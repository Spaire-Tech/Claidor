/**
 * Tabs of the settings sheet that save on change say so with a quiet
 * « Saved » that fades (docs/maties/design.md, section 5). A section that
 * has just persisted something announces it here; the sheet's footer
 * listens. A DOM event, so a section deep in another file needs no prop.
 */
export const SETTINGS_SAVED_EVENT = 'maties:settings-saved';

export const announceSettingsSaved = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SETTINGS_SAVED_EVENT));
};
