import type { Platform } from '@shared/platform/constants';

/**
 * Window events the connection cards raise for the app to handle, the way
 * `CoworkUiEvent` does for the chat.
 */
export const ConnectionsUiEvent = {
  /** Open Settings → IM Bot on one platform (detail: `OpenChannelSettingsEventDetail`). */
  OpenChannelSettings: 'connections:open-channel-settings',
} as const;
export type ConnectionsUiEvent = typeof ConnectionsUiEvent[keyof typeof ConnectionsUiEvent];

export interface OpenChannelSettingsEventDetail {
  platform: Platform;
}

export const requestChannelSettings = (platform: Platform): void => {
  window.dispatchEvent(new CustomEvent<OpenChannelSettingsEventDetail>(ConnectionsUiEvent.OpenChannelSettings, {
    detail: { platform },
  }));
};

/** The « Tell me when » sheet: what it shows after the button. */
export const SoonSheetState = {
  Asking: 'asking',
  Saving: 'saving',
  Told: 'told',
} as const;
export type SoonSheetState = typeof SoonSheetState[keyof typeof SoonSheetState];
