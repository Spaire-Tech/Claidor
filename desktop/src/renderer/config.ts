import { type ProviderConfig, ProviderRegistry } from '@shared/providers';

import {
  type BrowserWebAccessConfig,
  defaultBrowserWebAccessConfig,
} from '../shared/browserWebAccess/constants';
import {
  defaultNotificationSettings,
  type NotificationSettings,
} from '../shared/notifications/constants';

export const ShortcutAction = {
  NewChat: 'newChat',
  Search: 'search',
  Settings: 'settings',
  SendMessage: 'sendMessage',
  ShowShortcuts: 'showShortcuts',
  FocusPrompt: 'focusPrompt',
  StopCurrentTask: 'stopCurrentTask',
  ToggleSidebar: 'toggleSidebar',
  ToggleArtifacts: 'toggleArtifacts',
  PreviousAgent: 'previousAgent',
  NextAgent: 'nextAgent',
  ShowCurrentAgentTasks: 'showCurrentAgentTasks',
  CollapseCurrentAgentTasks: 'collapseCurrentAgentTasks',
  OpenAgentTask1: 'openAgentTask1',
  OpenAgentTask2: 'openAgentTask2',
  OpenAgentTask3: 'openAgentTask3',
  OpenAgentTask4: 'openAgentTask4',
  OpenAgentTask5: 'openAgentTask5',
  OpenAgentTask6: 'openAgentTask6',
  OpenAgentTask7: 'openAgentTask7',
  OpenAgentTask8: 'openAgentTask8',
  OpenAgentTask9: 'openAgentTask9',
  OpenCowork: 'openCowork',
  OpenScheduledTasks: 'openScheduledTasks',
  OpenKits: 'openKits',
  OpenSkills: 'openSkills',
  OpenMcp: 'openMcp',
  OpenSettingsGeneral: 'openSettingsGeneral',
  OpenSettingsAppearance: 'openSettingsAppearance',
  OpenSettingsAgentEngine: 'openSettingsAgentEngine',
  OpenSettingsModel: 'openSettingsModel',
  OpenSettingsIm: 'openSettingsIm',
  OpenSettingsBrowser: 'openSettingsBrowser',
  OpenSettingsEmail: 'openSettingsEmail',
  OpenSettingsMemory: 'openSettingsMemory',
  OpenSettingsDreaming: 'openSettingsDreaming',
  OpenSettingsPlugins: 'openSettingsPlugins',
  OpenSettingsShortcuts: 'openSettingsShortcuts',
  OpenSettingsAbout: 'openSettingsAbout',
} as const;

export type ShortcutAction = typeof ShortcutAction[keyof typeof ShortcutAction];

export type ShortcutConfig = Record<ShortcutAction, string> & {
  [key: string]: string | undefined;
};

export const FontPreferences = {
  UiFontSizeDefault: 15,
  UiFontSizeMin: 11,
  UiFontSizeMax: 16,
  CodeFontSizeDefault: 14,
  CodeFontSizeMin: 8,
  CodeFontSizeMax: 24,
} as const;

// Bump to force-reset every stored uiFontSize / codeFontSize to the current
// default one more time. hydrateStoredConfig persists the applied versions, so
// each version resets at most once and later user choices survive upgrades.
export const UI_FONT_SIZE_MIGRATION_VERSION = 1;
export const CODE_FONT_SIZE_MIGRATION_VERSION = 1;

export const normalizeFontPreference = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  const numericValue = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseFloat(value)
      : Number.NaN;
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(numericValue)));
};

export const resolveArtifactAutoPreviewEnabled = (value: unknown): boolean => value !== false;

// Configuration type definitions
export interface AppConfig {
  // API configuration
  api: {
    key: string;
    baseUrl: string;
  };
  // Model configuration
  model: {
    availableModels: Array<{
      id: string;
      name: string;
      supportsImage?: boolean;
      supportsVideo?: boolean;
      supportsThinking?: boolean;
      contextWindow?: number;
      maxTokens?: number;
    }>;
    defaultModel: string;
    defaultModelProvider?: string;
  };
  providers?: Record<string, ProviderConfig>;
  providerModelMigrationVersions?: Record<string, number>;
  // Theme configuration
  theme: 'light' | 'dark' | 'system';
  // Optional for configs created before exact default theme persistence was introduced.
  themeId?: string;
  // UI font size configuration
  uiFontSize?: number;
  // Applied UI font size forced-reset version (see UI_FONT_SIZE_MIGRATION_VERSION)
  uiFontSizeMigrationVersion?: number;
  // Code font size configuration
  codeFontSize?: number;
  // Applied code font size forced-reset version (see CODE_FONT_SIZE_MIGRATION_VERSION)
  codeFontSizeMigrationVersion?: number;
  // Language configuration
  language: 'zh' | 'en';
  // Whether to use the system proxy
  useSystemProxy: boolean;
  // Whether to open the Artifact preview panel automatically after previewable content is generated
  artifactAutoPreviewEnabled?: boolean;
  // Whether SQLite automatic backup and restore is enabled
  sqliteAutoBackupEnabled?: boolean;
  // Whether basic product usage statistics may be sent
  usageAnalyticsEnabled?: boolean;
  // Notification configuration
  notificationSettings?: NotificationSettings;
  // Browser and web access configuration
  browserWebAccess: BrowserWebAccessConfig;
  // Language initialization flag (used to detect the first launch)
  language_initialized?: boolean;
  // App configuration
  app: {
    port: number;
    isDevelopment: boolean;
    testMode?: boolean;
  };
  // Shortcut configuration
  shortcuts?: ShortcutConfig;
}

const buildDefaultProviders = (): AppConfig['providers'] => {
  const providers: Record<string, ProviderConfig> = {};

  for (const id of ProviderRegistry.providerIds) {
    const def = ProviderRegistry.get(id)!;
    providers[id] = {
      enabled: false,
      apiKey: '',
      baseUrl: def.defaultBaseUrl,
      apiFormat: def.defaultApiFormat,
      ...(def.codingPlanSupported ? { codingPlanEnabled: false } : {}),
      models: def.defaultModels.map(m => ({ ...m })),
    };
  }

  return providers;
};

// Default configuration
export const defaultConfig: AppConfig = {
  api: {
    key: '',
    baseUrl: 'https://api.deepseek.com',
  },
  model: {
    availableModels: [
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', supportsImage: false },
    ],
    defaultModel: 'deepseek-reasoner',
    defaultModelProvider: 'deepseek',
  },
  providers: buildDefaultProviders(),
  theme: 'system',
  uiFontSize: FontPreferences.UiFontSizeDefault,
  uiFontSizeMigrationVersion: UI_FONT_SIZE_MIGRATION_VERSION,
  codeFontSize: FontPreferences.CodeFontSizeDefault,
  codeFontSizeMigrationVersion: CODE_FONT_SIZE_MIGRATION_VERSION,
  language: 'zh',
  useSystemProxy: false,
  artifactAutoPreviewEnabled: true,
  sqliteAutoBackupEnabled: false,
  usageAnalyticsEnabled: true,
  notificationSettings: defaultNotificationSettings,
  browserWebAccess: defaultBrowserWebAccessConfig,
  app: {
    port: 3000,
    isDevelopment: process.env.NODE_ENV === 'development',
    // Default to production (official) services. Source-launched dev builds run
    // with NODE_ENV=development, but must not auto-target test mode, which
    // points at the local Claidor dev servers (http://127.0.0.1:8000 API,
    // http://127.0.0.1:3000 web app). Flip test mode via the hidden switch in
    // Settings → About when the local dev servers are actually needed.
    testMode: false,
  },
  shortcuts: {
    [ShortcutAction.NewChat]: 'CommandOrControl+N',
    [ShortcutAction.Search]: 'CommandOrControl+F',
    [ShortcutAction.Settings]: 'CommandOrControl+,',
    [ShortcutAction.SendMessage]: 'Enter',
    [ShortcutAction.ShowShortcuts]: 'CommandOrControl+/',
    [ShortcutAction.FocusPrompt]: 'CommandOrControl+K',
    [ShortcutAction.StopCurrentTask]: 'CommandOrControl+.',
    [ShortcutAction.ToggleSidebar]: 'CommandOrControl+B',
    [ShortcutAction.ToggleArtifacts]: 'CommandOrControl+Shift+B',
    [ShortcutAction.PreviousAgent]: '',
    [ShortcutAction.NextAgent]: '',
    [ShortcutAction.ShowCurrentAgentTasks]: '',
    [ShortcutAction.CollapseCurrentAgentTasks]: '',
    [ShortcutAction.OpenAgentTask1]: '',
    [ShortcutAction.OpenAgentTask2]: '',
    [ShortcutAction.OpenAgentTask3]: '',
    [ShortcutAction.OpenAgentTask4]: '',
    [ShortcutAction.OpenAgentTask5]: '',
    [ShortcutAction.OpenAgentTask6]: '',
    [ShortcutAction.OpenAgentTask7]: '',
    [ShortcutAction.OpenAgentTask8]: '',
    [ShortcutAction.OpenAgentTask9]: '',
    [ShortcutAction.OpenCowork]: 'CommandOrControl+1',
    [ShortcutAction.OpenScheduledTasks]: 'CommandOrControl+2',
    [ShortcutAction.OpenKits]: 'CommandOrControl+3',
    [ShortcutAction.OpenSkills]: 'CommandOrControl+4',
    [ShortcutAction.OpenMcp]: 'CommandOrControl+5',
    [ShortcutAction.OpenSettingsGeneral]: '',
    [ShortcutAction.OpenSettingsAppearance]: '',
    [ShortcutAction.OpenSettingsAgentEngine]: '',
    [ShortcutAction.OpenSettingsModel]: '',
    [ShortcutAction.OpenSettingsIm]: '',
    [ShortcutAction.OpenSettingsBrowser]: '',
    [ShortcutAction.OpenSettingsEmail]: '',
    [ShortcutAction.OpenSettingsMemory]: '',
    [ShortcutAction.OpenSettingsDreaming]: '',
    [ShortcutAction.OpenSettingsPlugins]: '',
    [ShortcutAction.OpenSettingsShortcuts]: '',
    [ShortcutAction.OpenSettingsAbout]: '',
  }
};

// Configuration storage keys
export const CONFIG_KEYS = {
  APP_CONFIG: 'app_config',
  AUTH: 'auth_state',
  CONVERSATIONS: 'conversations',
  PROVIDERS_EXPORT_KEY: 'providers_export_key',
  SKILLS: 'skills',
};

// Model provider categories
export const EN_PRIORITY_PROVIDERS = ['openai', 'anthropic', 'gemini'] as const;
// Provider lists derived from ProviderRegistry — single source of truth
export const CHINA_PROVIDERS = [...ProviderRegistry.idsByRegion('china')] as const;
export const GLOBAL_PROVIDERS = ProviderRegistry.idsByRegion('global');

export const getVisibleProviders = (language: 'zh' | 'en'): readonly string[] => {
  if (language === 'zh') {
    return [...CHINA_PROVIDERS];
  }
  return ProviderRegistry.idsForEnLocale();
};

/**
 * Whether a provider key denotes a custom provider (custom_0, custom_1, ...)
 */
export const isCustomProvider = (key: string): boolean => key.startsWith('custom_');

/**
 * Derive the default display name from a custom_N key (e.g. custom_0 → "Custom0")
 */
export const getCustomProviderDefaultName = (key: string): string => {
  const suffix = key.replace('custom_', '');
  return `Custom${suffix}`;
};

/**
 * Get the display name of a provider: custom providers prefer displayName,
 * built-in providers use the capitalized key.
 */
export const getProviderDisplayName = (
  providerKey: string,
  providerConfig?: { displayName?: string },
): string => {
  if (isCustomProvider(providerKey)) {
    const name = providerConfig && typeof providerConfig.displayName === 'string'
      ? providerConfig.displayName
      : '';
    return name || getCustomProviderDefaultName(providerKey);
  }
  const def = ProviderRegistry.get(providerKey);
  if (def) return def.label;
  return providerKey.charAt(0).toUpperCase() + providerKey.slice(1);
};
