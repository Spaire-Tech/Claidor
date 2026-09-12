import { ArrowPathIcon, ArrowPathRoundedSquareIcon, BookOpenIcon, CubeIcon, ExclamationTriangleIcon, InformationCircleIcon, SunIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import React, { useCallback,useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { AppSettingsAutoLaunchErrorCode } from '../../shared/appSettings/constants';
import { type AppUpdateInfo,type AppUpdateRuntimeState,AppUpdateSource,AppUpdateStatus } from '../../shared/appUpdate/constants';
import {
  type BrowserWebAccessConfig,
  defaultBrowserWebAccessConfig,
  normalizeBrowserWebAccessConfig,
} from '../../shared/browserWebAccess/constants';
import { DataMigrationRestoreStatus } from '../../shared/dataMigration/constants';
import {
  normalizeNotificationSettings,
  TaskCompletionNotificationMode,
} from '../../shared/notifications/constants';
import type { Platform } from '../../shared/platform/constants';
import {
  ProviderAuthType,
  ProviderName,
  ProviderRegistry,
} from '../../shared/providers';
import { defaultConfig, FontPreferences, getProviderDisplayName, getVisibleProviders, normalizeFontPreference, resolveArtifactAutoPreviewEnabled, ShortcutAction, type ShortcutConfig } from '../config';
import { useSkin } from '../providers/SkinProvider';
import { apiService } from '../services/api';
import { configService } from '../services/config';
import { coworkService } from '../services/cowork';
import { i18nService, LanguageType } from '../services/i18n';
import { imService } from '../services/im';
import { LogReporterAction, reportYdAnalyzer } from '../services/logReporter';
import { clearPendingPublishingConversionAttribution } from '../services/publishingConversionAttribution';
import { clearPublishingSubscriptionRecoveryAnalytics } from '../services/publishingSubscriptionRecovery';
import { isTextEditingSafeShortcut, matchesShortcut } from '../services/shortcuts';
import {
  type ThemeDefaultChangedDetail,
  themeService,
  ThemeServiceEvent,
} from '../services/theme';
import { applyTypographyPreferences } from '../services/typography';
import type { RootState } from '../store';
import { selectCoworkConfig } from '../store/selectors/coworkSelectors';
import { setAvailableModels } from '../store/slices/modelSlice';
import type {
  CoworkAgentEngine,
  CoworkMemoryStats,
  CoworkTempDirPreview,
  CoworkUserMemoryEntry,
  OpenClawSessionKeepAlive,
} from '../types/cowork';
import { OpenClawSessionKeepAlive as OpenClawSessionKeepAliveValues } from '../types/cowork';
import Modal from './common/Modal';
import { ConnectionsCatalog, ReachList, useAssistantName } from './connections';
import EmbeddingSettingsSection from './cowork/EmbeddingSettingsSection';
import Eyebrow from './design/Eyebrow';
import Pill, { PillTone } from './design/Pill';
import Sphere from './design/Sphere';
import Switch from './design/Switch';
import ErrorMessage from './ErrorMessage';
import BrainIcon from './icons/BrainIcon';
import EditIcon from './icons/EditIcon';
import PlusCircleIcon from './icons/PlusCircleIcon';
import SidebarMcpIcon from './icons/SidebarMcpIcon';
import SkillIcon from './icons/SkillIcon';
import IMSettings from './im/IMSettings';
import LibrarySettingsSection from './library/LibrarySettingsSection';
import { McpManager } from './mcp';
import BrowserWebAccessSettings from './settings/BrowserWebAccessSettings';
import MatiesAccountSection from './settings/MatiesAccountSection';
import MemoryTidyingSection from './settings/MemoryTidyingSection';
import {
  CUSTOM_PROVIDER_KEYS,
  getDefaultActiveProvider,
  getDefaultProviders,
  getEffectiveApiFormat,
  getOpenClawProviderIdForConfig,
  hasProviderAuthConfigured,
  type ProviderConfig,
  providerKeys,
  type ProvidersConfig,
  type ProviderType,
  resolveBaseUrl,
  resolveModelSupportsImageForProvider,
} from './settings/modelProviderUtils';
import { resolveSettingsEscapeAction, SettingsEscapeAction } from './settings/settingsEscape';
import { announceSettingsSaved, SETTINGS_SAVED_EVENT } from './settings/settingsSavedSignal';
import { SkillsManager } from './skills';
import SkinPresentationScope from './skin/SkinPresentationScope';
import SkinSettingsSection from './skin/SkinSettingsSection';
import ThemedSelect from './ui/ThemedSelect';

/**
 * The eight tabs of Settings (docs/maties/design.md, section 5).
 *
 * The founder's rule for the whole app: the sidebar is where you work;
 * settings is what it can do and who you are. So Skills and Apps moved in
 * here from the sidebar, and Plugins, IM Bot, Email, Shortcuts, Agent Engine
 * and Dreaming were folded away or retired. `model` and `coworkMemory` keep
 * their historical keys; « You » and « Memory » are what a person reads.
 */
type TabType = 'model' | 'apps' | 'skills' | 'coworkMemory' | 'library' | 'appearance' | 'general' | 'about';

const SETTINGS_TAB_ICON_CLASS = 'h-[17px] w-[17px]';

// Tabs whose changes wait for « Save » (the sheet's form). Every other tab
// saves on change and says so with a quiet « Saved » (design, section 5).
const SETTINGS_TABS_WITH_FORM: ReadonlySet<TabType> = new Set<TabType>([
  'general',
  'appearance',
  'coworkMemory',
]);

const waitForNextPaint = (): Promise<void> => new Promise(resolve => {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => resolve());
  });
});

const getAutoLaunchErrorMessage = (errorCode?: string): string => {
  if (errorCode === AppSettingsAutoLaunchErrorCode.RequiresApproval) {
    return i18nService.t('autoLaunchRequiresApproval');
  }
  if (errorCode === AppSettingsAutoLaunchErrorCode.UpdateFailed) {
    return i18nService.t('autoLaunchUpdateFailed');
  }
  return i18nService.t('autoLaunchUpdateFailed');
};

const formatBackupSize = (sizeBytes?: number): string => {
  if (!Number.isFinite(sizeBytes) || !sizeBytes || sizeBytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = sizeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const normalizeProvidersForSettingsSave = (providers: ProvidersConfig): ProvidersConfig => (
  Object.fromEntries(
    Object.entries(providers).map(([providerKey, providerConfig]) => {
      const apiFormat = getEffectiveApiFormat(providerKey, providerConfig.apiFormat);
      const hasValidAuth = hasProviderAuthConfigured(providerKey as ProviderType, providerConfig);
      return [
        providerKey,
        {
          ...providerConfig,
          enabled: providerConfig.enabled && hasValidAuth,
          apiFormat,
          ...(providerKey === ProviderName.Copilot ? { apiKey: '' } : {}),
          baseUrl: resolveBaseUrl(providerKey as ProviderType, providerConfig.baseUrl, apiFormat),
        },
      ];
    })
  ) as ProvidersConfig
);

const resolvePrimaryProviderForSettingsSave = (
  providers: ProvidersConfig,
  activeProvider: ProviderType,
): ProviderConfig => {
  const firstEnabledProvider = Object.entries(providers).find(
    ([_, config]) => config.enabled
  );
  return firstEnabledProvider
    ? firstEnabledProvider[1]
    : providers[activeProvider];
};

const SETTINGS_TAB_SHORTCUT_ACTIONS: Partial<Record<ShortcutAction, TabType>> = {
  [ShortcutAction.OpenSettingsGeneral]: 'general',
  [ShortcutAction.OpenSettingsAppearance]: 'appearance',
  [ShortcutAction.OpenSettingsModel]: 'model',
  [ShortcutAction.OpenSettingsMemory]: 'coworkMemory',
  [ShortcutAction.OpenSettingsAbout]: 'about',
};

const SettingsAnalyticsSource = {
  AgentEngine: 'settings_agent_engine',
  Appearance: 'settings_appearance',
  Browser: 'settings_browser',
  Dreaming: 'settings_dreaming',
  General: 'settings_general',
  Memory: 'settings_memory',
  Model: 'settings_model',
  Plugins: 'settings_plugins',
  Shortcuts: 'settings_shortcuts',
  About: 'settings_about',
} as const;

type SettingsAnalyticsValue = string | boolean | number;

type MemorySettingAnalyticsSummary = {
  changedKeys: string;
  embeddingEnabled: boolean;
  embeddingProvider: string;
  embeddingVectorWeight: number;
  hasEmbeddingApiKey: boolean;
  hasEmbeddingBaseUrl: boolean;
  hasEmbeddingModel: boolean;
  memoryEnabled: boolean;
  memoryLlmJudgeEnabled: boolean;
};

type DreamingSettingAnalyticsSummary = {
  changedKeys: string;
  dreamingEnabled: boolean;
  frequencyType: 'preset' | 'custom';
};

type ShortcutSettingAnalyticsSummary = {
  changedCount: number;
  configuredCount: number;
  disabledCount: number;
  resetToDefault: boolean;
};

const DREAMING_FREQUENCY_PRESETS_FOR_ANALYTICS = new Set([
  '0 3 * * *',
  '0 0 * * *',
  '0 0,12 * * *',
  '0 */6 * * *',
  '0 3 * * 0',
]);

type CustomModelSettingsAnalyticsSummary = {
  changedKeys: string;
  changedProviderCount: number;
  customProviderCount: number;
  customProviderModelCount: number;
  enabledCustomProviderCount: number;
  enabledProviderCount: number;
  hasCodingPlanEnabled: boolean;
  hasLocalProviderEnabled: boolean;
  modelCount: number;
};

const isCustomProviderKey = (providerKey: string): boolean => (
  (CUSTOM_PROVIDER_KEYS as readonly string[]).includes(providerKey)
);

const isLocalProviderKey = (providerKey: string): boolean => (
  providerKey === ProviderName.Ollama || providerKey === ProviderName.LmStudio
);

const countProviderModels = (providerConfig?: ProviderConfig): number => (
  Array.isArray(providerConfig?.models) ? providerConfig.models.length : 0
);

const sortAnalyticsObject = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortAnalyticsObject);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = sortAnalyticsObject((value as Record<string, unknown>)[key]);
        return sorted;
      }, {});
  }
  return value;
};

const serializeProviderModelsForAnalyticsDiff = (providerConfig?: ProviderConfig): string => (
  JSON.stringify((providerConfig?.models ?? []).map(model => ({
    contextWindow: model.contextWindow,
    customParams: sortAnalyticsObject(model.customParams),
    id: model.id,
    maxTokens: model.maxTokens,
    name: model.name,
    supportsImage: model.supportsImage === true,
    supportsThinking: model.supportsThinking === true,
    supportsVideo: model.supportsVideo === true,
  })))
);

const getProviderAuthTypeForAnalytics = (providerConfig?: ProviderConfig): string => (
  providerConfig?.authType || ProviderAuthType.ApiKey
);

const getProviderApiFormatForAnalytics = (providerKey: string, providerConfig?: ProviderConfig): string => (
  getEffectiveApiFormat(providerKey, providerConfig?.apiFormat)
);

const buildCustomModelSettingsAnalyticsSummary = (
  previousProviders: ProvidersConfig,
  nextProviders: ProvidersConfig,
): CustomModelSettingsAnalyticsSummary | null => {
  const changedKeys = new Set<string>();
  const changedProviders = new Set<string>();
  const providerKeysForDiff = new Set([
    ...Object.keys(previousProviders),
    ...Object.keys(nextProviders),
  ]);

  providerKeysForDiff.forEach(providerKey => {
    const previousProvider = previousProviders[providerKey];
    const nextProvider = nextProviders[providerKey];

    if (!previousProvider || !nextProvider) {
      changedKeys.add('provider_count');
      changedProviders.add(providerKey);
      return;
    }

    let providerChanged = false;
    if ((previousProvider.enabled === true) !== (nextProvider.enabled === true)) {
      changedKeys.add('provider_enabled');
      providerChanged = true;
    }
    if (getProviderApiFormatForAnalytics(providerKey, previousProvider) !== getProviderApiFormatForAnalytics(providerKey, nextProvider)) {
      changedKeys.add('api_format');
      providerChanged = true;
    }
    if (((previousProvider as ProviderConfig).codingPlanEnabled === true) !== ((nextProvider as ProviderConfig).codingPlanEnabled === true)) {
      changedKeys.add('coding_plan');
      providerChanged = true;
    }
    if (getProviderAuthTypeForAnalytics(previousProvider) !== getProviderAuthTypeForAnalytics(nextProvider)) {
      changedKeys.add('auth_type');
      providerChanged = true;
    }
    if (countProviderModels(previousProvider) !== countProviderModels(nextProvider)) {
      changedKeys.add('model_count');
      providerChanged = true;
    }
    if (serializeProviderModelsForAnalyticsDiff(previousProvider) !== serializeProviderModelsForAnalyticsDiff(nextProvider)) {
      changedKeys.add('model_config');
      providerChanged = true;
    }

    if (providerChanged) {
      changedProviders.add(providerKey);
    }
  });

  if (changedKeys.size === 0) {
    return null;
  }

  const nextProviderEntries = Object.entries(nextProviders);
  return {
    changedKeys: Array.from(changedKeys).sort().join(','),
    changedProviderCount: changedProviders.size,
    customProviderCount: nextProviderEntries.filter(([providerKey]) => isCustomProviderKey(providerKey)).length,
    customProviderModelCount: nextProviderEntries
      .filter(([providerKey]) => isCustomProviderKey(providerKey))
      .reduce((count, [, providerConfig]) => count + countProviderModels(providerConfig), 0),
    enabledCustomProviderCount: nextProviderEntries
      .filter(([providerKey, providerConfig]) => isCustomProviderKey(providerKey) && providerConfig.enabled === true)
      .length,
    enabledProviderCount: nextProviderEntries.filter(([, providerConfig]) => providerConfig.enabled === true).length,
    hasCodingPlanEnabled: nextProviderEntries.some(([, providerConfig]) => (providerConfig as ProviderConfig).codingPlanEnabled === true),
    hasLocalProviderEnabled: nextProviderEntries.some(([providerKey, providerConfig]) => (
      isLocalProviderKey(providerKey) && providerConfig.enabled === true
    )),
    modelCount: nextProviderEntries.reduce((count, [, providerConfig]) => count + countProviderModels(providerConfig), 0),
  };
};

const buildBrowserSettingAnalyticsParams = (
  previousConfig: BrowserWebAccessConfig,
  nextConfig: BrowserWebAccessConfig,
): {
  blockedHostnameCount: number;
  changedKeys: string;
  networkMode: string;
  previousBlockedHostnameCount?: number;
} | null => {
  const changedKeys = new Set<string>();
  if (previousConfig.networkMode !== nextConfig.networkMode) {
    changedKeys.add('network_mode');
  }
  if (previousConfig.blockedHostnames.length !== nextConfig.blockedHostnames.length) {
    changedKeys.add('blocked_hostnames');
  }

  if (changedKeys.size === 0) {
    return null;
  }

  return {
    blockedHostnameCount: nextConfig.blockedHostnames.length,
    changedKeys: Array.from(changedKeys).sort().join(','),
    networkMode: nextConfig.networkMode,
    previousBlockedHostnameCount: previousConfig.blockedHostnames.length,
  };
};

const buildMemorySettingAnalyticsSummary = (
  previousConfig: {
    embeddingEnabled: boolean;
    embeddingModel: string;
    embeddingProvider: string;
    embeddingRemoteApiKey: string;
    embeddingRemoteBaseUrl: string;
    embeddingVectorWeight: number;
    memoryEnabled: boolean;
    memoryLlmJudgeEnabled: boolean;
  },
  nextConfig: {
    embeddingEnabled: boolean;
    embeddingModel: string;
    embeddingProvider: string;
    embeddingRemoteApiKey: string;
    embeddingRemoteBaseUrl: string;
    embeddingVectorWeight: number;
    memoryEnabled: boolean;
    memoryLlmJudgeEnabled: boolean;
  },
): MemorySettingAnalyticsSummary | null => {
  const changedKeys = new Set<string>();
  if (previousConfig.memoryEnabled !== nextConfig.memoryEnabled) {
    changedKeys.add('memory_enabled');
  }
  if (previousConfig.memoryLlmJudgeEnabled !== nextConfig.memoryLlmJudgeEnabled) {
    changedKeys.add('llm_judge_enabled');
  }
  if (previousConfig.embeddingEnabled !== nextConfig.embeddingEnabled) {
    changedKeys.add('embedding_enabled');
  }
  if (previousConfig.embeddingProvider !== nextConfig.embeddingProvider) {
    changedKeys.add('embedding_provider');
  }
  if (previousConfig.embeddingModel !== nextConfig.embeddingModel) {
    changedKeys.add('embedding_model');
  }
  if (previousConfig.embeddingRemoteBaseUrl !== nextConfig.embeddingRemoteBaseUrl) {
    changedKeys.add('embedding_base_url');
  }
  if (previousConfig.embeddingRemoteApiKey !== nextConfig.embeddingRemoteApiKey) {
    changedKeys.add('embedding_api_key');
  }
  if (previousConfig.embeddingVectorWeight !== nextConfig.embeddingVectorWeight) {
    changedKeys.add('embedding_vector_weight');
  }

  if (changedKeys.size === 0) {
    return null;
  }

  return {
    changedKeys: Array.from(changedKeys).sort().join(','),
    embeddingEnabled: nextConfig.embeddingEnabled,
    embeddingProvider: nextConfig.embeddingProvider,
    embeddingVectorWeight: nextConfig.embeddingVectorWeight,
    hasEmbeddingApiKey: nextConfig.embeddingRemoteApiKey.trim().length > 0,
    hasEmbeddingBaseUrl: nextConfig.embeddingRemoteBaseUrl.trim().length > 0,
    hasEmbeddingModel: nextConfig.embeddingModel.trim().length > 0,
    memoryEnabled: nextConfig.memoryEnabled,
    memoryLlmJudgeEnabled: nextConfig.memoryLlmJudgeEnabled,
  };
};

const resolveDreamingFrequencyType = (frequency: string): 'preset' | 'custom' => (
  DREAMING_FREQUENCY_PRESETS_FOR_ANALYTICS.has(frequency) ? 'preset' : 'custom'
);

const buildDreamingSettingAnalyticsSummary = (
  previousConfig: {
    dreamingEnabled: boolean;
    dreamingFrequency: string;
  },
  nextConfig: {
    dreamingEnabled: boolean;
    dreamingFrequency: string;
  },
): DreamingSettingAnalyticsSummary | null => {
  const changedKeys = new Set<string>();
  if (previousConfig.dreamingEnabled !== nextConfig.dreamingEnabled) {
    changedKeys.add('dreaming_enabled');
  }
  if (previousConfig.dreamingFrequency !== nextConfig.dreamingFrequency) {
    changedKeys.add('dreaming_frequency');
  }

  if (changedKeys.size === 0) {
    return null;
  }

  return {
    changedKeys: Array.from(changedKeys).sort().join(','),
    dreamingEnabled: nextConfig.dreamingEnabled,
    frequencyType: resolveDreamingFrequencyType(nextConfig.dreamingFrequency),
  };
};

const countConfiguredShortcuts = (shortcutConfig: ShortcutConfig): number => (
  Object.values(shortcutConfig).filter(value => String(value || '').trim().length > 0).length
);

const buildShortcutSettingAnalyticsSummary = (
  previousShortcuts: ShortcutConfig,
  nextShortcuts: ShortcutConfig,
): ShortcutSettingAnalyticsSummary | null => {
  const keys = new Set([
    ...Object.keys(previousShortcuts),
    ...Object.keys(nextShortcuts),
    ...Object.keys(defaultConfig.shortcuts || {}),
  ]);
  let changedCount = 0;
  keys.forEach(key => {
    if ((previousShortcuts[key as ShortcutAction] || '') !== (nextShortcuts[key as ShortcutAction] || '')) {
      changedCount += 1;
    }
  });

  if (changedCount === 0) {
    return null;
  }

  const defaultShortcuts: ShortcutConfig = { ...defaultConfig.shortcuts! };
  const resetToDefault = Array.from(keys).every(key => (
    (nextShortcuts[key as ShortcutAction] || '') === (defaultShortcuts[key as ShortcutAction] || '')
  ));

  return {
    changedCount,
    configuredCount: countConfiguredShortcuts(nextShortcuts),
    disabledCount: Array.from(keys).filter(key => !String(nextShortcuts[key as ShortcutAction] || '').trim()).length,
    resetToDefault,
  };
};

const reportGeneralSettingChanged = (
  settingKey: string,
  settingValue: SettingsAnalyticsValue,
  previousValue?: SettingsAnalyticsValue,
): void => {
  void reportYdAnalyzer({
    action: LogReporterAction.GeneralSettingChanged,
    settingKey,
    settingValue,
    previousValue,
    source: SettingsAnalyticsSource.General,
  });
};

const reportAppearanceSettingChanged = (
  settingKey: string,
  settingValue: SettingsAnalyticsValue,
  previousValue?: SettingsAnalyticsValue,
): void => {
  void reportYdAnalyzer({
    action: LogReporterAction.AppearanceSettingChanged,
    settingKey,
    settingValue,
    previousValue,
    source: SettingsAnalyticsSource.Appearance,
  });
};

const reportBrowserSettingChanged = (
  params: {
    blockedHostnameCount: number;
    changedKeys: string;
    networkMode: string;
    previousBlockedHostnameCount?: number;
  },
): void => {
  void reportYdAnalyzer({
    action: LogReporterAction.BrowserSettingChanged,
    source: SettingsAnalyticsSource.Browser,
    ...params,
  });
};

const reportMemorySettingChanged = (
  summary: MemorySettingAnalyticsSummary,
): void => {
  console.debug('[Settings] reporting memory setting analytics');
  void reportYdAnalyzer({
    action: LogReporterAction.MemorySettingChanged,
    source: SettingsAnalyticsSource.Memory,
    ...summary,
  });
};

const reportMemoryEntryChanged = (
  operation: 'created' | 'updated' | 'deleted',
  entryCount?: number,
): void => {
  console.debug('[Settings] reporting memory entry analytics');
  void reportYdAnalyzer({
    action: LogReporterAction.MemoryEntryChanged,
    source: SettingsAnalyticsSource.Memory,
    operation,
    entryCount,
  });
};

const reportDreamingSettingChanged = (
  summary: DreamingSettingAnalyticsSummary,
): void => {
  console.debug('[Settings] reporting dreaming setting analytics');
  void reportYdAnalyzer({
    action: LogReporterAction.DreamingSettingChanged,
    source: SettingsAnalyticsSource.Dreaming,
    ...summary,
  });
};

const reportShortcutSettingChanged = (
  summary: ShortcutSettingAnalyticsSummary,
): void => {
  console.debug('[Settings] reporting shortcut setting analytics');
  void reportYdAnalyzer({
    action: LogReporterAction.ShortcutSettingChanged,
    source: SettingsAnalyticsSource.Shortcuts,
    ...summary,
  });
};

const reportAboutAction = (
  actionType: string,
  result: string,
  options: { missingEntryCount?: number } = {},
): void => {
  console.debug('[Settings] reporting about action analytics');
  void reportYdAnalyzer({
    action: LogReporterAction.AboutAction,
    source: SettingsAnalyticsSource.About,
    actionType,
    result,
    missingEntryCount: options.missingEntryCount,
  });
};

const reportAgentEngineSettingChanged = (
  settingKey: string,
  settingValue: SettingsAnalyticsValue,
  previousValue?: SettingsAnalyticsValue,
): void => {
  void reportYdAnalyzer({
    action: LogReporterAction.AgentEngineSettingChanged,
    settingKey,
    settingValue,
    previousValue,
    source: SettingsAnalyticsSource.AgentEngine,
  });
};

const reportAgentEngineMaintenanceAction = (
  actionType: string,
  result: string,
  options: { errorCode?: string; sizeBytes?: number } = {},
): void => {
  void reportYdAnalyzer({
    action: LogReporterAction.AgentEngineMaintenanceAction,
    actionType,
    result,
    errorCode: options.errorCode,
    sizeBytes: options.sizeBytes,
    source: SettingsAnalyticsSource.AgentEngine,
  });
};

const reportCustomModelSettingsSaved = (
  summary: CustomModelSettingsAnalyticsSummary,
): void => {
  void reportYdAnalyzer({
    action: LogReporterAction.CustomModelSettingsSaved,
    source: SettingsAnalyticsSource.Model,
    ...summary,
  });
};

/**
 * The Settings tabs a shortcut can open. There is no Shortcuts tab any more,
 * so nothing here is editable — these are the app's fixed bindings.
 */
const SETTINGS_TAB_SHORTCUT_KEYS: readonly ShortcutAction[] = [
  ShortcutAction.OpenSettingsGeneral,
  ShortcutAction.OpenSettingsAppearance,
  ShortcutAction.OpenSettingsModel,
  ShortcutAction.OpenSettingsMemory,
  ShortcutAction.OpenSettingsAbout,
];

const SettingsSlidersIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M14 17H5" />
    <path d="M19 7h-9" />
    <circle cx="17" cy="17" r="3" />
    <circle cx="7" cy="7" r="3" />
  </svg>
);

export type SettingsOpenOptions = {
  initialTab?: TabType;
  /** With `initialTab: 'apps'`: the channel to open, for a card that asked for one. */
  initialImPlatform?: Platform;
  notice?: string;
  noticeI18nKey?: string;
  noticeExtra?: string;
};

interface SettingsProps extends SettingsOpenOptions {
  onClose: () => void;
  onStartAiSkin?: (text: string, skillId: string) => void;
  /** Opens the chat with one skill chosen; Skills lives in this sheet now. */
  onUseSkill?: (skillId: string) => void;
  /** Starts a conversation that writes a new skill. */
  onCreateSkillByChat?: () => void;
  initialTabRequestId?: number;
  onUpdateFound?: (info: AppUpdateInfo) => void;
  enterpriseConfig?: {
    ui?: Record<string, 'hide' | 'disable' | 'readonly'>;
    disableUpdate?: boolean;
  } | null;
}

const ABOUT_USER_MANUAL_URL = 'https://app.claidor.com/desktop';
const ABOUT_USER_COMMUNITY_URL = 'https://app.claidor.com';
const ABOUT_SERVICE_TERMS_URL = 'https://app.claidor.com/terms';

const getUpdateCheckStatusFromRuntimeStatus = (
  state: AppUpdateRuntimeState,
): 'idle' | 'checking' | 'upToDate' | 'error' | 'downloading' | 'ready' => {
  if (state.source !== AppUpdateSource.Manual) {
    return 'idle';
  }
  switch (state.status) {
    case AppUpdateStatus.Checking:
      return 'checking';
    case AppUpdateStatus.Downloading:
      return 'downloading';
    case AppUpdateStatus.Ready:
      return 'ready';
    case AppUpdateStatus.Error:
      return 'error';
    default:
      return 'idle';
  }
};

const isShortcutInputActive = () => {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) return false;
  return activeElement.dataset.shortcutInput === 'true';
};

const isTextEditingActive = () => {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) return false;
  if (activeElement.isContentEditable) return true;
  if (activeElement instanceof HTMLTextAreaElement) return true;
  if (activeElement instanceof HTMLSelectElement) return true;
  return activeElement instanceof HTMLInputElement;
};

// The app's switch in the one blue (docs/maties/design.md, section 5).
const SettingsSwitch: React.FC<{
  checked: boolean;
  label: string;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}> = ({ checked, label, disabled, onClick }) => (
  <Switch checked={checked} label={label} disabled={disabled} onChange={onClick} />
);

const SettingsToggleRow: React.FC<{
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void | Promise<void>;
}> = ({ title, description, checked, disabled, onToggle }) => (
  <div className="flex items-center justify-between gap-6">
    <div className="min-w-0 flex-1">
      <h4 className="maties-row-title">{title}</h4>
      <p className="maties-row-desc">{description}</p>
    </div>
    <SettingsSwitch
      checked={checked}
      label={title}
      disabled={disabled}
      onClick={onToggle}
    />
  </div>
);

// A section of the sheet: an eyebrow, then a white card whose rows are
// divided by hairlines (radius 16).
const SettingsGroup: React.FC<{
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ title, children, footer }) => (
  <section className="space-y-2.5">
    <Eyebrow className="px-1">{title}</Eyebrow>
    <div className="maties-card-row maties-divide">
      {children}
    </div>
    {footer}
  </section>
);

// A single padded row inside a SettingsGroup card.
const SettingsRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-5 py-4">{children}</div>
);

// The quiet pill of a settings row: « Clean now », « Back up », « Show in Folder ».
const SETTINGS_ROW_PILL_CLASS = 'maties-pill-sm';

// The quiet « Saved » that fades on tabs that save on change.
const SettingsSavedNotice: React.FC<{ hint: string; label: string }> = ({ hint, label }) => {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  useEffect(() => {
    const handleSaved = () => setSavedAt(Date.now());
    window.addEventListener(SETTINGS_SAVED_EVENT, handleSaved);
    return () => window.removeEventListener(SETTINGS_SAVED_EVENT, handleSaved);
  }, []);
  return (
    <div className="flex h-8 items-center gap-3">
      <span className="maties-caption">{hint}</span>
      {savedAt !== null && (
        <span key={savedAt} className="maties-saved maties-status-done text-[12.5px] font-medium">
          {label}
        </span>
      )}
    </div>
  );
};

const SettingsNumberInputRow: React.FC<{
  id: string;
  title: string;
  description: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}> = ({ id, title, description, value, min, max, onChange }) => (
  <div className="flex items-center justify-between gap-6">
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="maties-row-title block">
        {title}
      </label>
      <p className="maties-row-desc">
        {description}
      </p>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => {
          onChange(normalizeFontPreference(event.currentTarget.value, value, min, max));
        }}
        onBlur={(event) => {
          onChange(normalizeFontPreference(event.currentTarget.value, value, min, max));
        }}
        className="maties-input maties-mono h-8 w-16 px-2 text-center text-[13px]"
      />
      <span className="maties-caption">px</span>
    </div>
  </div>
);

const Settings: React.FC<SettingsProps> = ({
  onClose,
  onStartAiSkin,
  onUseSkill,
  onCreateSkillByChat,
  initialTab,
  initialImPlatform,
  initialTabRequestId,
  notice,
  noticeI18nKey,
  noticeExtra,
  onUpdateFound,
  enterpriseConfig,
}) => {
  const dispatch = useDispatch();
  const assistantName = useAssistantName();
  const {
    activeSkin,
    isAppearanceChanging,
    selectThemeById,
    selectThemeMode,
  } = useSkin();
  // State
  const [activeTab, setActiveTab] = useState<TabType>(initialTab ?? 'general');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [themeId, setThemeId] = useState<string>(themeService.getDefaultThemeId());
  const [uiFontSize, setUiFontSize] = useState<number>(FontPreferences.UiFontSizeDefault);
  const [codeFontSize, setCodeFontSize] = useState<number>(FontPreferences.CodeFontSizeDefault);
  const [language, setLanguage] = useState<LanguageType>('zh');
  const [artifactAutoPreviewEnabled, setArtifactAutoPreviewEnabled] = useState(true);
  const [autoLaunch, setAutoLaunchState] = useState(false);
  const [useSystemProxy, setUseSystemProxy] = useState(false);
  const [sqliteAutoBackupEnabled, setSqliteAutoBackupEnabled] = useState(false);
  const [usageAnalyticsEnabled, setUsageAnalyticsEnabled] = useState(true);
  const [taskCompletionNotificationMode, setTaskCompletionNotificationMode] =
    useState<TaskCompletionNotificationMode>(TaskCompletionNotificationMode.Unfocused);
  const [permissionNotificationsEnabled, setPermissionNotificationsEnabled] = useState(true);
  const [questionNotificationsEnabled, setQuestionNotificationsEnabled] = useState(true);
  const [browserWebAccess, setBrowserWebAccess] = useState<BrowserWebAccessConfig>(() => ({
    ...defaultBrowserWebAccessConfig,
    webFetch: { ...defaultBrowserWebAccessConfig.webFetch },
  }));
  const [isUpdatingAutoLaunch, setIsUpdatingAutoLaunch] = useState(false);
  const [preventSleep, setPreventSleepState] = useState(false);
  const [isUpdatingPreventSleep, setIsUpdatingPreventSleep] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buildNoticeMessage = useCallback((): string | null => {
    if (noticeI18nKey) {
      const base = i18nService.t(noticeI18nKey);
      return noticeExtra ? `${base} (${noticeExtra})` : base;
    }
    return notice ?? null;
  }, [notice, noticeExtra, noticeI18nKey]);

  const [noticeMessage, setNoticeMessage] = useState<string | null>(() => buildNoticeMessage());
  const initialThemeIdRef = useRef<string>(themeService.getDefaultThemeId());
  const initialUiFontSizeRef = useRef<number>(FontPreferences.UiFontSizeDefault);
  const initialCodeFontSizeRef = useRef<number>(FontPreferences.CodeFontSizeDefault);
  const initialLanguageRef = useRef<LanguageType>(i18nService.getLanguage());
  const didSaveRef = useRef(false);

  useEffect(() => {
    const handleDefaultThemeChanged = (event: Event) => {
      const detail = (event as CustomEvent<ThemeDefaultChangedDetail>).detail;
      if (!detail) {
        return;
      }

      setTheme(detail.mode);
      setThemeId(detail.themeId);
    };

    window.addEventListener(ThemeServiceEvent.DefaultChanged, handleDefaultThemeChanged);
    return () => {
      window.removeEventListener(ThemeServiceEvent.DefaultChanged, handleDefaultThemeChanged);
    };
  }, []);

  // Plugin settings handle (deferred save)

  // Provider that supplies the legacy `config.api` fallback when nothing is enabled.
  const [activeProvider, setActiveProvider] = useState<ProviderType>(getDefaultActiveProvider());

  // Providers configuration (persisted as `config.providers` on save).
  const [providers, setProviders] = useState<ProvidersConfig>(() => getDefaultProviders());

  // Ref to the content area so we can control its scrolling.
  const contentRef = useRef<HTMLDivElement>(null);
  // Shows a fade-out mask above the footer buttons while unscrolled content remains below.
  const [footerFadeVisible, setFooterFadeVisible] = useState(false);
  const updateCheckTimerRef = useRef<number | null>(null);

  // Shortcut settings
  const [shortcuts, setShortcuts] = useState<ShortcutConfig>(() => ({ ...defaultConfig.shortcuts! }));

  // About tab
  const [appVersion, setAppVersion] = useState('');
  const [isExportingLogs, setIsExportingLogs] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [logoClickCount, setLogoClickCount] = useState(0);
  const [testModeUnlocked, setTestModeUnlocked] = useState(false);
  const [updateCheckStatus, setUpdateCheckStatus] = useState<'idle' | 'checking' | 'upToDate' | 'error' | 'downloading' | 'ready'>('idle');
  const [appUpdateState, setAppUpdateState] = useState<AppUpdateRuntimeState | null>(null);

  useEffect(() => {
    window.electron.appInfo.getVersion().then(setAppVersion);
  }, []);

  useEffect(() => {
    let mounted = true;

    const syncUpdateStatus = async () => {
      try {
        const state = await window.electron.appUpdate.getState();
        if (!mounted) {
          return;
        }
        setAppUpdateState(state);
        setUpdateCheckStatus(getUpdateCheckStatusFromRuntimeStatus(state));
      } catch (error) {
        console.error('Failed to load app update state in settings:', error);
      }
    };

    void syncUpdateStatus();

    const unsubscribe = window.electron.appUpdate.onStateChanged((state) => {
      if (
        updateCheckTimerRef.current != null &&
        state.source === AppUpdateSource.Manual &&
        state.status !== AppUpdateStatus.Idle
      ) {
        window.clearTimeout(updateCheckTimerRef.current);
        updateCheckTimerRef.current = null;
      }
      setAppUpdateState(state);
      setUpdateCheckStatus(getUpdateCheckStatusFromRuntimeStatus(state));
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const authUser = useSelector((state: RootState) => state.auth.user);

  const handleCheckUpdate = useCallback(async () => {
    if (updateCheckStatus === 'checking' || !appVersion) return;
    setUpdateCheckStatus('checking');
    try {
      const result = await window.electron.appUpdate.checkNow({ manual: true, userId: authUser?.yid });
      if (!result.success) {
        throw new Error(result.error || 'Update check failed');
      }

      if (!result.updateFound) {
        setUpdateCheckStatus('upToDate');
        reportAboutAction('check_update', 'up_to_date');
        if (updateCheckTimerRef.current != null) {
          window.clearTimeout(updateCheckTimerRef.current);
        }
        updateCheckTimerRef.current = window.setTimeout(() => {
          setUpdateCheckStatus('idle');
          updateCheckTimerRef.current = null;
        }, 3000);
        return;
      }

      if (result.state.status === AppUpdateStatus.Ready) {
        setUpdateCheckStatus('ready');
        reportAboutAction('check_update', 'ready');
      } else if (result.state.status === AppUpdateStatus.Downloading) {
        setUpdateCheckStatus('downloading');
        reportAboutAction('check_update', 'downloading');
      } else {
        setUpdateCheckStatus('idle');
        reportAboutAction('check_update', 'update_found');
      }

      // A download already running in the background reports its progress on
      // this button; opening the update dialog on top of it only adds noise.
      if (result.state.info && result.state.status !== AppUpdateStatus.Downloading) {
        onUpdateFound?.(result.state.info);
      }
    } catch {
      reportAboutAction('check_update', 'failed');
      setUpdateCheckStatus('error');
      if (updateCheckTimerRef.current != null) {
        window.clearTimeout(updateCheckTimerRef.current);
      }
      updateCheckTimerRef.current = window.setTimeout(() => {
        setUpdateCheckStatus('idle');
        updateCheckTimerRef.current = null;
      }, 3000);
    }
  }, [appVersion, authUser, updateCheckStatus, onUpdateFound]);

  const updateButtonLabel = useMemo(() => {
    if (
      updateCheckStatus === 'downloading' &&
      appUpdateState?.progress?.percent != null &&
      Number.isFinite(appUpdateState.progress.percent)
    ) {
      return `${i18nService.t('updateDownloadingBackground')} ${Math.round(appUpdateState.progress.percent * 100)}%`;
    }
    if (updateCheckStatus === 'checking') return i18nService.t('updateChecking');
    if (updateCheckStatus === 'downloading') return i18nService.t('updateDownloadingBackground');
    if (updateCheckStatus === 'ready') return i18nService.t('updateReadyTitle');
    if (updateCheckStatus === 'upToDate') return i18nService.t('updateUpToDate');
    if (updateCheckStatus === 'error') return i18nService.t('updateCheckFailed');
    return i18nService.t('checkForUpdate');
  }, [appUpdateState?.progress?.percent, updateCheckStatus]);

  const handleOpenUserManual = useCallback(() => {
    reportAboutAction('open_user_manual', 'success');
    void window.electron.shell.openExternal(ABOUT_USER_MANUAL_URL);
  }, []);

  const handleOpenUserCommunity = useCallback(() => {
    reportAboutAction('open_user_community', 'success');
    void window.electron.shell.openExternal(ABOUT_USER_COMMUNITY_URL);
  }, []);

  const handleOpenServiceTerms = useCallback(() => {
    reportAboutAction('open_service_terms', 'success');
    void window.electron.shell.openExternal(ABOUT_SERVICE_TERMS_URL);
  }, []);

  const handleExportLogs = useCallback(async () => {
    if (isExportingLogs) {
      return;
    }

    setError(null);
    setNoticeMessage(null);
    setIsExportingLogs(true);
    try {
      const result = await window.electron.log.exportZip();
      if (!result.success) {
        setError(result.error || i18nService.t('aboutExportLogsFailed'));
        reportAboutAction('export_logs', 'failed');
        return;
      }
      if (result.canceled) {
        reportAboutAction('export_logs', 'canceled');
        return;
      }

      if (result.path) {
        await window.electron.shell.showItemInFolder(result.path);
      }

      if ((result.missingEntries?.length ?? 0) > 0) {
        const missingList = result.missingEntries?.join(', ') || '';
        setNoticeMessage(`${i18nService.t('aboutExportLogsPartial')}: ${missingList}`);
      } else {
        setNoticeMessage(i18nService.t('aboutExportLogsSuccess'));
      }
      reportAboutAction('export_logs', 'success', {
        missingEntryCount: result.missingEntries?.length ?? 0,
      });
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : i18nService.t('aboutExportLogsFailed'));
      reportAboutAction('export_logs', 'failed');
    } finally {
      setIsExportingLogs(false);
    }
  }, [isExportingLogs]);

  const coworkConfig = useSelector(selectCoworkConfig);

  const [coworkAgentEngine, setCoworkAgentEngine] = useState<CoworkAgentEngine>(coworkConfig.agentEngine || 'openclaw');
  const [coworkMemoryEnabled, setCoworkMemoryEnabled] = useState<boolean>(coworkConfig.memoryEnabled ?? true);
  const [coworkMemoryLlmJudgeEnabled, setCoworkMemoryLlmJudgeEnabled] = useState<boolean>(coworkConfig.memoryLlmJudgeEnabled ?? false);
  const [skipMissedJobs, setSkipMissedJobs] = useState<boolean>(coworkConfig.skipMissedJobs ?? true);
  const [tempStorageUsageBytes, setTempStorageUsageBytes] = useState<number | null>(null);
  const [tempStorageCleanableBytes, setTempStorageCleanableBytes] = useState<number | null>(null);
  const [isCleaningTempStorage, setIsCleaningTempStorage] = useState<boolean>(false);
  const [tempStorageCleanResult, setTempStorageCleanResult] = useState<string | null>(null);
  const [isLoadingTempCleanPreview, setIsLoadingTempCleanPreview] = useState<boolean>(false);
  const [tempCleanPreviewDirs, setTempCleanPreviewDirs] = useState<CoworkTempDirPreview[]>([]);
  const [tempCleanSelection, setTempCleanSelection] = useState<Record<string, boolean>>({});
  const [showTempCleanConfirm, setShowTempCleanConfirm] = useState<boolean>(false);
  const [openClawHeartbeatEnabled, setOpenClawHeartbeatEnabled] = useState<boolean>(coworkConfig.openClawHeartbeatEnabled ?? false);
  const [embeddingEnabled, setEmbeddingEnabled] = useState<boolean>(coworkConfig.embeddingEnabled ?? false);
  const [embeddingProvider, setEmbeddingProvider] = useState<string>(coworkConfig.embeddingProvider ?? 'openai');
  const [embeddingModel, setEmbeddingModel] = useState<string>(coworkConfig.embeddingModel ?? '');
  const [embeddingLocalModelPath, setEmbeddingLocalModelPath] = useState<string>(coworkConfig.embeddingLocalModelPath ?? '');
  const [embeddingVectorWeight, setEmbeddingVectorWeight] = useState<number>(coworkConfig.embeddingVectorWeight ?? 0.7);
  const [embeddingRemoteBaseUrl, setEmbeddingRemoteBaseUrl] = useState<string>(coworkConfig.embeddingRemoteBaseUrl ?? '');
  const [embeddingRemoteApiKey, setEmbeddingRemoteApiKey] = useState<string>(coworkConfig.embeddingRemoteApiKey ?? '');
  const [dreamingEnabled, setDreamingEnabled] = useState<boolean>(coworkConfig.dreamingEnabled ?? false);
  const [dreamingFrequency, setDreamingFrequency] = useState<string>(coworkConfig.dreamingFrequency ?? '0 3 * * *');
  const [dreamingModel, setDreamingModel] = useState<string>(coworkConfig.dreamingModel ?? '');
  const [dreamingTimezone, setDreamingTimezone] = useState<string>(coworkConfig.dreamingTimezone ?? '');
  const [showMemorySearchSettings, setShowMemorySearchSettings] = useState(false);
  const [openClawSessionKeepAlive, setOpenClawSessionKeepAlive] = useState<OpenClawSessionKeepAlive>(
    coworkConfig.openClawSessionPolicy?.keepAlive || OpenClawSessionKeepAliveValues.ThirtyDays,
  );
  const [coworkMemoryEntries, setCoworkMemoryEntries] = useState<CoworkUserMemoryEntry[]>([]);
  const [coworkMemoryStats, setCoworkMemoryStats] = useState<CoworkMemoryStats | null>(null);
  const [coworkMemoryListLoading, setCoworkMemoryListLoading] = useState<boolean>(false);
  const [coworkMemoryQuery, setCoworkMemoryQuery] = useState<string>('');
  const [coworkMemoryEditingId, setCoworkMemoryEditingId] = useState<string | null>(null);
  const [coworkMemoryDraftText, setCoworkMemoryDraftText] = useState<string>('');
  const [showMemoryModal, setShowMemoryModal] = useState<boolean>(false);
  const [coworkMemoryRawMode, setCoworkMemoryRawMode] = useState<boolean>(false);
  const [coworkMemoryRawText, setCoworkMemoryRawText] = useState<string>('');
  const [coworkMemoryRawSaving, setCoworkMemoryRawSaving] = useState<boolean>(false);
  const [coworkMemoryExpandedIds, setCoworkMemoryExpandedIds] = useState<Set<string>>(new Set());
  const [isBackingUpOpenClawData, setIsBackingUpOpenClawData] = useState<boolean>(false);
  const [isRestoringOpenClawData, setIsRestoringOpenClawData] = useState<boolean>(false);
  const [openClawDataBackupResult, setOpenClawDataBackupResult] = useState<{ path: string; sizeBytes?: number } | null>(null);
  const [showOpenClawDataRestoreConfirm, setShowOpenClawDataRestoreConfirm] = useState<boolean>(false);

  useEffect(() => {
    setCoworkAgentEngine(coworkConfig.agentEngine || 'openclaw');
    setCoworkMemoryEnabled(coworkConfig.memoryEnabled ?? true);
    setCoworkMemoryLlmJudgeEnabled(coworkConfig.memoryLlmJudgeEnabled ?? false);
    setSkipMissedJobs(coworkConfig.skipMissedJobs ?? true);
    setOpenClawHeartbeatEnabled(coworkConfig.openClawHeartbeatEnabled ?? false);
    setEmbeddingEnabled(coworkConfig.embeddingEnabled ?? false);
    setEmbeddingProvider(coworkConfig.embeddingProvider ?? 'openai');
    setEmbeddingModel(coworkConfig.embeddingModel ?? '');
    setEmbeddingLocalModelPath(coworkConfig.embeddingLocalModelPath ?? '');
    setEmbeddingVectorWeight(coworkConfig.embeddingVectorWeight ?? 0.7);
    setEmbeddingRemoteBaseUrl(coworkConfig.embeddingRemoteBaseUrl ?? '');
    setEmbeddingRemoteApiKey(coworkConfig.embeddingRemoteApiKey ?? '');
    setDreamingEnabled(coworkConfig.dreamingEnabled ?? false);
    setDreamingFrequency(coworkConfig.dreamingFrequency ?? '0 3 * * *');
    setDreamingModel(coworkConfig.dreamingModel ?? '');
    setDreamingTimezone(coworkConfig.dreamingTimezone ?? '');
    setOpenClawSessionKeepAlive(coworkConfig.openClawSessionPolicy?.keepAlive || OpenClawSessionKeepAliveValues.ThirtyDays);
  }, [
    coworkConfig.agentEngine,
    coworkConfig.memoryEnabled,
    coworkConfig.memoryLlmJudgeEnabled,
    coworkConfig.openClawSessionPolicy?.keepAlive,
    coworkConfig.skipMissedJobs,
    coworkConfig.openClawHeartbeatEnabled,
    coworkConfig.embeddingEnabled,
    coworkConfig.embeddingProvider,
    coworkConfig.embeddingModel,
    coworkConfig.embeddingLocalModelPath,
    coworkConfig.embeddingVectorWeight,
    coworkConfig.embeddingRemoteBaseUrl,
    coworkConfig.embeddingRemoteApiKey,
    coworkConfig.dreamingEnabled,
    coworkConfig.dreamingFrequency,
    coworkConfig.dreamingModel,
    coworkConfig.dreamingTimezone,
  ]);

  const refreshTempStorageUsage = useCallback(async () => {
    try {
      const result = await window.electron?.cowork?.getTempStorageUsage();
      if (result?.success) {
        setTempStorageUsageBytes(result.bytes ?? 0);
        setTempStorageCleanableBytes(result.cleanableBytes ?? 0);
      }
    } catch (err) {
      console.debug('Failed to measure cowork temp storage:', err);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'general') return;
    void refreshTempStorageUsage();
  }, [activeTab, refreshTempStorageUsage]);

  // Opens the guardian-style confirmation dialog: scan first, show exactly
  // what would be removed per directory, and only delete what the user
  // confirms.
  const handleOpenTempCleanConfirm = useCallback(async () => {
    if (isLoadingTempCleanPreview || isCleaningTempStorage) return;
    setIsLoadingTempCleanPreview(true);
    setTempStorageCleanResult(null);
    try {
      const result = await window.electron?.cowork?.getTempStorageUsage();
      if (!result?.success) {
        setTempStorageCleanResult(i18nService.t('coworkTempCleanFailed'));
        return;
      }
      const dirs = result.dirs ?? [];
      setTempStorageUsageBytes(result.bytes ?? 0);
      setTempStorageCleanableBytes(result.cleanableBytes ?? 0);
      setTempCleanPreviewDirs(dirs);
      const selection: Record<string, boolean> = {};
      for (const dir of dirs) {
        selection[dir.cwd] = !dir.isActive && dir.cleanableFiles > 0;
      }
      setTempCleanSelection(selection);
      setShowTempCleanConfirm(true);
    } catch (err) {
      console.error('Failed to preview cowork temp storage:', err);
      setTempStorageCleanResult(i18nService.t('coworkTempCleanFailed'));
    } finally {
      setIsLoadingTempCleanPreview(false);
    }
  }, [isCleaningTempStorage, isLoadingTempCleanPreview]);

  const tempCleanSelectedDirs = useMemo(
    () => tempCleanPreviewDirs.filter(dir => tempCleanSelection[dir.cwd] && !dir.isActive && dir.cleanableFiles > 0),
    [tempCleanPreviewDirs, tempCleanSelection],
  );
  const tempCleanSelectedBytes = useMemo(
    () => tempCleanSelectedDirs.reduce((sum, dir) => sum + dir.cleanableBytes, 0),
    [tempCleanSelectedDirs],
  );

  const handleConfirmTempClean = useCallback(async () => {
    if (isCleaningTempStorage || tempCleanSelectedDirs.length === 0) return;
    setIsCleaningTempStorage(true);
    setTempStorageCleanResult(null);
    try {
      const result = await window.electron?.cowork?.cleanTempStorage({
        cwds: tempCleanSelectedDirs.map(dir => dir.cwd),
      });
      if (result?.success) {
        setTempStorageCleanResult(
          i18nService.t('coworkTempCleanedResult')
            .replace('{count}', String(result.deletedFiles ?? 0))
            .replace('{size}', formatBackupSize(result.freedBytes ?? 0) || '0 B'),
        );
        setShowTempCleanConfirm(false);
        void refreshTempStorageUsage();
      } else {
        setTempStorageCleanResult(i18nService.t('coworkTempCleanFailed'));
      }
    } catch (err) {
      console.error('Failed to clean cowork temp storage:', err);
      setTempStorageCleanResult(i18nService.t('coworkTempCleanFailed'));
    } finally {
      setIsCleaningTempStorage(false);
    }
  }, [isCleaningTempStorage, refreshTempStorageUsage, tempCleanSelectedDirs]);

  useEffect(() => () => {
    if (updateCheckTimerRef.current != null) {
      window.clearTimeout(updateCheckTimerRef.current);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void window.electron.openclaw.dataMigration.getLastRestoreResult().then((response) => {
      if (!active || !response.success || !response.result) return;
      if (response.result.status === DataMigrationRestoreStatus.Success) {
        setNoticeMessage(i18nService.t('openClawDataMigrationSuccess'));
        return;
      }
      const message = response.result.error
        ? `${i18nService.t('openClawDataMigrationFailed')}: ${response.result.error}`
        : i18nService.t('openClawDataMigrationFailed');
      setError(message);
    }).catch((loadError) => {
      if (!active) return;
      setError(loadError instanceof Error ? loadError.message : i18nService.t('openClawDataMigrationFailed'));
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      const config = configService.getConfig();

      // Set general settings
      const resolvedUiFontSize = normalizeFontPreference(
        config.uiFontSize,
        FontPreferences.UiFontSizeDefault,
        FontPreferences.UiFontSizeMin,
        FontPreferences.UiFontSizeMax,
      );
      const resolvedCodeFontSize = normalizeFontPreference(
        config.codeFontSize,
        FontPreferences.CodeFontSizeDefault,
        FontPreferences.CodeFontSizeMin,
        FontPreferences.CodeFontSizeMax,
      );
      const defaultThemeId = themeService.getDefaultThemeId();
      initialThemeIdRef.current = defaultThemeId;
      initialUiFontSizeRef.current = resolvedUiFontSize;
      initialCodeFontSizeRef.current = resolvedCodeFontSize;
      initialLanguageRef.current = config.language;
      setTheme(config.theme);
      setThemeId(defaultThemeId);
      setUiFontSize(resolvedUiFontSize);
      setCodeFontSize(resolvedCodeFontSize);
      setLanguage(config.language);
      setArtifactAutoPreviewEnabled(
        resolveArtifactAutoPreviewEnabled(config.artifactAutoPreviewEnabled),
      );
      setUseSystemProxy(config.useSystemProxy ?? false);
      setSqliteAutoBackupEnabled(config.sqliteAutoBackupEnabled === true);
      setUsageAnalyticsEnabled(config.usageAnalyticsEnabled !== false);
      {
        const notificationSettings = normalizeNotificationSettings(config.notificationSettings);
        setTaskCompletionNotificationMode(notificationSettings.taskCompletionNotificationMode);
        setPermissionNotificationsEnabled(notificationSettings.permissionNotificationsEnabled);
        setQuestionNotificationsEnabled(notificationSettings.questionNotificationsEnabled);
      }
      setBrowserWebAccess(normalizeBrowserWebAccessConfig(config.browserWebAccess));
      const savedTestMode = config.app?.testMode ?? false;
      setTestMode(savedTestMode);
      if (savedTestMode) setTestModeUnlocked(true);

      // Load auto-launch setting
      window.electron.autoLaunch.get().then(({ enabled }) => {
        console.log(`[Renderer][Settings] loaded auto-launch setting: enabled=${enabled}`);
        setAutoLaunchState(enabled);
      }).catch(err => {
        console.error('Failed to load auto-launch setting:', err);
      });

      // Load prevent-sleep setting
      window.electron.preventSleep.get().then(({ enabled }) => {
        setPreventSleepState(enabled);
      }).catch(err => {
        console.error('Failed to load prevent-sleep setting:', err);
      });

      // Set up providers based on saved config
      if (config.api) {
        // For backward compatibility with older config
        // Initialize active provider based on baseUrl
        const normalizedApiBaseUrl = config.api.baseUrl.toLowerCase();
        if (normalizedApiBaseUrl.includes('openai')) {
          setActiveProvider('openai');
          setProviders(prev => ({
            ...prev,
            openai: {
              ...prev.openai,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('deepseek')) {
          setActiveProvider('deepseek');
          setProviders(prev => ({
            ...prev,
            deepseek: {
              ...prev.deepseek,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('moonshot.ai') || normalizedApiBaseUrl.includes('moonshot.cn')) {
          setActiveProvider('moonshot');
          setProviders(prev => ({
            ...prev,
            moonshot: {
              ...prev.moonshot,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('bigmodel.cn')) {
          setActiveProvider('zhipu');
          setProviders(prev => ({
            ...prev,
            zhipu: {
              ...prev.zhipu,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('minimax')) {
          setActiveProvider('minimax');
          setProviders(prev => ({
            ...prev,
            minimax: {
              ...prev.minimax,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('openapi.youdao.com')) {
          setActiveProvider('youdaozhiyun');
          setProviders(prev => ({
            ...prev,
            youdaozhiyun: {
              ...prev.youdaozhiyun,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('dashscope')) {
          setActiveProvider('qwen');
          setProviders(prev => ({
            ...prev,
            qwen: {
              ...prev.qwen,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('stepfun')) {
          setActiveProvider('stepfun');
          setProviders(prev => ({
            ...prev,
            stepfun: {
              ...prev.stepfun,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('openrouter.ai')) {
          setActiveProvider('openrouter');
          setProviders(prev => ({
            ...prev,
            openrouter: {
              ...prev.openrouter,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('googleapis')) {
          setActiveProvider('gemini');
          setProviders(prev => ({
            ...prev,
            gemini: {
              ...prev.gemini,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('anthropic')) {
          setActiveProvider('anthropic');
          setProviders(prev => ({
            ...prev,
            anthropic: {
              ...prev.anthropic,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('ollama') || normalizedApiBaseUrl.includes('11434')) {
          setActiveProvider('ollama');
          setProviders(prev => ({
            ...prev,
            ollama: {
              ...prev.ollama,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('lm-studio') || normalizedApiBaseUrl.includes(':1234')) {
          setActiveProvider('lm-studio');
          setProviders(prev => ({
            ...prev,
            'lm-studio': {
              ...prev['lm-studio'],
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        }
      }

      // Load provider-specific configurations if available.
      // Merge the saved config over the defaults so newly added providers are present.
      if (config.providers) {
        setProviders(prev => {
          const merged = {
            ...prev,  // keep the default providers (including newly added ones such as anthropic)
            ...config.providers,  // override with the saved config
          };

          // After merging, find the first enabled provider to set as activeProvider
          // This ensures we don't use stale activeProvider from old config.api.baseUrl
          const firstEnabledProvider = providerKeys.find(providerKey => merged[providerKey]?.enabled);
          if (firstEnabledProvider) {
            setActiveProvider(firstEnabledProvider);
          }

          return Object.fromEntries(
            Object.entries(merged).map(([providerKey, providerConfig]) => {
              const models = providerConfig.models?.map((model, idx) => {
                let id = model.id;
                // Fix corrupted model IDs from previous OAuth mutation bug
                if (providerKey === 'qwen' && (id === 'vision-model' || id === 'coder-model')) {
                  const defaultModel = defaultConfig.providers?.qwen?.models?.[idx];
                  id = defaultModel?.id || 'qwen3.5-plus';
                }
                return {
                  ...model,
                  id,
                  supportsImage: ProviderRegistry.resolveModelSupportsImage(
                    providerKey,
                    id,
                    model.supportsImage,
                  ),
                };
              });
              return [
                providerKey,
                {
                  ...providerConfig,
                  apiFormat: getEffectiveApiFormat(providerKey, (providerConfig as ProviderConfig).apiFormat),
                  ...(providerKey === ProviderName.Copilot && providerConfig.apiKey?.trim()
                    ? { authType: ProviderAuthType.OAuth, apiKey: '' }
                    : {}),
                  models,
                },
              ];
            })
          ) as ProvidersConfig;
        });
      }

      // Load shortcut settings
      if (config.shortcuts) {
        setShortcuts(prev => ({
          ...prev,
          ...config.shortcuts,
        }));
      }
    } catch {
      setError('Failed to load settings');
    }
  }, []);

  useEffect(() => {
    const initialUiFontSize = initialUiFontSizeRef.current;
    const initialCodeFontSize = initialCodeFontSizeRef.current;
    const initialLanguage = initialLanguageRef.current;
    return () => {
      if (didSaveRef.current) {
        return;
      }
      applyTypographyPreferences({
        uiFontSize: initialUiFontSize,
        codeFontSize: initialCodeFontSize,
      });
      i18nService.setLanguage(initialLanguage, { persist: false });
    };
  }, []);

  // Scroll the content area back to the top whenever the active tab changes.
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  // Track content scroll/size/content changes to decide whether the footer fade mask is shown.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      setFooterFadeVisible(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
    };
    const scheduleUpdate = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };
    scheduleUpdate();
    el.addEventListener('scroll', scheduleUpdate, { passive: true });
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(el);
    const mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', scheduleUpdate);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    setNoticeMessage(buildNoticeMessage());
  }, [buildNoticeMessage]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, initialTabRequestId]);

  // Subscribe to language changes
  useEffect(() => {
    const unsubscribe = i18nService.subscribe(() => {
      setLanguage(i18nService.getLanguage());
      // Re-translate notice message on language change
      if (noticeI18nKey) {
        const base = i18nService.t(noticeI18nKey);
        setNoticeMessage(noticeExtra ? `${base} (${noticeExtra})` : base);
      }
    });
    return unsubscribe;
  }, [noticeI18nKey, noticeExtra]);

  // Compute visible providers based on language, including active custom_N entries
  const visibleProviders = useMemo(() => {
    const visibleKeys = getVisibleProviders(language);
    const filtered: Partial<ProvidersConfig> = {};
    for (const key of visibleKeys) {
      if (providers[key as keyof ProvidersConfig]) {
        filtered[key as keyof ProvidersConfig] = providers[key as keyof ProvidersConfig];
      }
    }
    // Append custom_N providers that exist in state, sorted by numeric suffix
    for (const key of CUSTOM_PROVIDER_KEYS) {
      if (providers[key]) {
        filtered[key] = providers[key];
      }
    }
    return filtered as ProvidersConfig;
  }, [language, providers]);

  // Ensure activeProvider is always in visibleProviders when language changes
  useEffect(() => {
    const visibleKeys = Object.keys(visibleProviders) as ProviderType[];
    if (visibleKeys.length > 0 && !visibleKeys.includes(activeProvider)) {
      // If current activeProvider is not visible, switch to first visible provider
      const firstEnabledVisible = visibleKeys.find(key => visibleProviders[key]?.enabled);
      setActiveProvider(firstEnabledVisible ?? visibleKeys[0]);
    }
  }, [visibleProviders, activeProvider]);

  const hasCoworkConfigChanges = coworkAgentEngine !== coworkConfig.agentEngine
    || coworkMemoryEnabled !== coworkConfig.memoryEnabled
    || coworkMemoryLlmJudgeEnabled !== coworkConfig.memoryLlmJudgeEnabled
    || skipMissedJobs !== (coworkConfig.skipMissedJobs ?? true)
    || openClawHeartbeatEnabled !== (coworkConfig.openClawHeartbeatEnabled ?? false)
    || openClawSessionKeepAlive !== (coworkConfig.openClawSessionPolicy?.keepAlive || OpenClawSessionKeepAliveValues.ThirtyDays)
    || embeddingEnabled !== (coworkConfig.embeddingEnabled ?? false)
    || embeddingProvider !== (coworkConfig.embeddingProvider ?? 'openai')
    || embeddingModel !== (coworkConfig.embeddingModel ?? '')
    || embeddingLocalModelPath !== (coworkConfig.embeddingLocalModelPath ?? '')
    || embeddingVectorWeight !== (coworkConfig.embeddingVectorWeight ?? 0.7)
    || embeddingRemoteBaseUrl !== (coworkConfig.embeddingRemoteBaseUrl ?? '')
    || embeddingRemoteApiKey !== (coworkConfig.embeddingRemoteApiKey ?? '')
    || dreamingEnabled !== (coworkConfig.dreamingEnabled ?? false)
    || dreamingFrequency !== (coworkConfig.dreamingFrequency ?? '0 3 * * *');
  const handleRevealOpenClawDataBackup = useCallback(async () => {
    const backupPath = openClawDataBackupResult?.path;
    if (!backupPath) return;
    try {
      const result = await window.electron.shell.showItemInFolder(backupPath);
      if (!result?.success) {
        setError(result?.error || i18nService.t('showInFolderFailed'));
      }
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : i18nService.t('showInFolderFailed'));
    }
  }, [openClawDataBackupResult?.path]);

  const persistModelSettingsBeforeDataBackup = useCallback(async () => {
    const normalizedProviders = normalizeProvidersForSettingsSave(providers);
    const primaryProvider = resolvePrimaryProviderForSettingsSave(normalizedProviders, activeProvider);
    await configService.updateConfig({
      api: {
        key: primaryProvider.apiKey,
        baseUrl: primaryProvider.baseUrl,
      },
      providers: normalizedProviders,
    });
  }, [activeProvider, providers]);

  const handleOpenClawDataBackup = useCallback(async () => {
    if (isBackingUpOpenClawData) return;
    setError(null);
    setNoticeMessage(null);
    setOpenClawDataBackupResult(null);
    setIsBackingUpOpenClawData(true);
    try {
      await waitForNextPaint();
      await persistModelSettingsBeforeDataBackup();
      const result = await window.electron.openclaw.dataMigration.backup();
      if (!result.success) {
        setError(result.error || i18nService.t('openClawDataBackupFailed'));
        reportAgentEngineMaintenanceAction('backup_data', 'failed', { errorCode: 'unknown' });
        return;
      }
      if (result.canceled) {
        return;
      }
      if (result.path) {
        setOpenClawDataBackupResult({ path: result.path, sizeBytes: result.sizeBytes });
      }
      setNoticeMessage(i18nService.t('openClawDataBackupSuccess'));
      reportAgentEngineMaintenanceAction('backup_data', 'success', {
        sizeBytes: result.sizeBytes,
      });
    } catch (backupError) {
      setError(backupError instanceof Error ? backupError.message : i18nService.t('openClawDataBackupFailed'));
      reportAgentEngineMaintenanceAction('backup_data', 'failed', { errorCode: 'unknown' });
    } finally {
      setIsBackingUpOpenClawData(false);
    }
  }, [isBackingUpOpenClawData, persistModelSettingsBeforeDataBackup]);

  const handleConfirmOpenClawDataRestore = useCallback(async () => {
    if (isRestoringOpenClawData) return;
    setShowOpenClawDataRestoreConfirm(false);
    setError(null);
    setNoticeMessage(null);
    setIsRestoringOpenClawData(true);
    let keepLoadingUntilRestart = false;
    try {
      await waitForNextPaint();
      const result = await window.electron.openclaw.dataMigration.restore();
      if (!result.success) {
        setError(result.error || i18nService.t('openClawDataMigrationFailed'));
        reportAgentEngineMaintenanceAction('restore_data', 'failed', { errorCode: 'unknown' });
        return;
      }
      if (result.canceled) {
        return;
      }
      if (result.scheduledRestart) {
        keepLoadingUntilRestart = true;
        setNoticeMessage(i18nService.t('openClawDataMigrationRestarting'));
      }
      reportAgentEngineMaintenanceAction('restore_data', 'success');
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : i18nService.t('openClawDataMigrationFailed'));
      reportAgentEngineMaintenanceAction('restore_data', 'failed', { errorCode: 'unknown' });
    } finally {
      if (!keepLoadingUntilRestart) {
        setIsRestoringOpenClawData(false);
      }
    }
  }, [isRestoringOpenClawData]);

  const loadCoworkMemoryData = useCallback(async () => {
    setCoworkMemoryListLoading(true);
    try {
      const [entries, stats] = await Promise.all([
        coworkService.listMemoryEntries({
          query: coworkMemoryQuery.trim() || undefined,
        }),
        coworkService.getMemoryStats(),
      ]);
      setCoworkMemoryEntries(entries);
      setCoworkMemoryStats(stats);
    } catch (loadError) {
      console.error('Failed to load cowork memory data:', loadError);
      setCoworkMemoryEntries([]);
      setCoworkMemoryStats(null);
    } finally {
      setCoworkMemoryListLoading(false);
    }
  }, [
    coworkMemoryQuery,
  ]);

  useEffect(() => {
    if (activeTab !== 'coworkMemory') return;
    void loadCoworkMemoryData();
  }, [activeTab, loadCoworkMemoryData]);

  const resetCoworkMemoryEditor = () => {
    setCoworkMemoryEditingId(null);
    setCoworkMemoryDraftText('');
    setShowMemoryModal(false);
  };

  const handleSaveCoworkMemoryEntry = async () => {
    const text = coworkMemoryDraftText.trim();
    if (!text) return;

    setCoworkMemoryListLoading(true);
    try {
      const operation = coworkMemoryEditingId ? 'updated' : 'created';
      if (coworkMemoryEditingId) {
        await coworkService.updateMemoryEntry({
          id: coworkMemoryEditingId,
          text,
        });
      } else {
        await coworkService.createMemoryEntry({
          text,
        });
      }
      resetCoworkMemoryEditor();
      await loadCoworkMemoryData();
      reportMemoryEntryChanged(
        operation,
        operation === 'created'
          ? (coworkMemoryStats?.total ?? coworkMemoryEntries.length) + 1
          : coworkMemoryStats?.total,
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : i18nService.t('coworkMemoryCrudSaveFailed'));
    } finally {
      setCoworkMemoryListLoading(false);
    }
  };

  const handleEditCoworkMemoryEntry = (entry: CoworkUserMemoryEntry) => {
    setCoworkMemoryEditingId(entry.id);
    setCoworkMemoryDraftText(entry.text);
    setShowMemoryModal(true);
  };

  const handleDeleteCoworkMemoryEntry = async (entry: CoworkUserMemoryEntry) => {
    setCoworkMemoryListLoading(true);
    try {
      await coworkService.deleteMemoryEntry({ id: entry.id });
      if (coworkMemoryEditingId === entry.id) {
        resetCoworkMemoryEditor();
      }
      await loadCoworkMemoryData();
      reportMemoryEntryChanged(
        'deleted',
        Math.max(0, (coworkMemoryStats?.total ?? coworkMemoryEntries.length) - 1),
      );
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : i18nService.t('coworkMemoryCrudDeleteFailed'));
    } finally {
      setCoworkMemoryListLoading(false);
    }
  };

  const handleOpenCoworkMemoryModal = () => {
    resetCoworkMemoryEditor();
    setShowMemoryModal(true);
  };

  const handleEnterCoworkMemoryRawMode = async () => {
    setError(null);
    const content = await coworkService.readMemoryFileRaw();
    if (content === null) {
      setError(i18nService.t('coworkMemoryRawLoadFailed'));
      return;
    }
    setCoworkMemoryRawText(content);
    setCoworkMemoryRawMode(true);
  };

  const handleSaveCoworkMemoryRaw = async () => {
    if (coworkMemoryRawSaving) return;
    setError(null);
    setCoworkMemoryRawSaving(true);
    try {
      const result = await coworkService.writeMemoryFileRaw(coworkMemoryRawText);
      if (!result.success) {
        setError(result.error || i18nService.t('coworkMemoryRawSaveFailed'));
        return;
      }
      setCoworkMemoryRawMode(false);
      await loadCoworkMemoryData();
    } finally {
      setCoworkMemoryRawSaving(false);
    }
  };

  const toggleCoworkMemoryExpandedId = (id: string) => {
    setCoworkMemoryExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSaving || isAppearanceChanging) return;
    setIsSaving(true);
    setError(null);

    try {
      const normalizedProviders = normalizeProvidersForSettingsSave(providers);
      const primaryProvider = resolvePrimaryProviderForSettingsSave(normalizedProviders, activeProvider);
      const normalizedBrowserWebAccess = normalizeBrowserWebAccessConfig({
        ...browserWebAccess,
        browserEnabled: true,
        profileMode: defaultBrowserWebAccessConfig.profileMode,
        followGlobalProxy: defaultBrowserWebAccessConfig.followGlobalProxy,
        snapshotMode: defaultBrowserWebAccessConfig.snapshotMode,
        executablePath: undefined,
        cdpUrl: undefined,
        attachOnly: undefined,
        remoteCdpTimeoutMs: undefined,
        remoteCdpHandshakeTimeoutMs: undefined,
        extraArgs: [],
        webFetch: defaultBrowserWebAccessConfig.webFetch,
      });
      const previousConfig = configService.getConfig();
      const previousBrowserWebAccess = normalizeBrowserWebAccessConfig(previousConfig.browserWebAccess);
      const previousShortcuts: ShortcutConfig = {
        ...defaultConfig.shortcuts!,
        ...(previousConfig.shortcuts || {}),
      };
      const previousProviders = previousConfig.providers
        ? normalizeProvidersForSettingsSave(previousConfig.providers as ProvidersConfig)
        : normalizedProviders;
      const previousSkipMissedJobs = coworkConfig.skipMissedJobs ?? true;
      const previousOpenClawHeartbeatEnabled = coworkConfig.openClawHeartbeatEnabled ?? false;
      const previousAgentEngine = coworkConfig.agentEngine || 'openclaw';
      const previousOpenClawSessionKeepAlive = coworkConfig.openClawSessionPolicy?.keepAlive
        || OpenClawSessionKeepAliveValues.ThirtyDays;
      const previousMemorySettings = {
        embeddingEnabled: coworkConfig.embeddingEnabled ?? false,
        embeddingModel: coworkConfig.embeddingModel ?? '',
        embeddingProvider: coworkConfig.embeddingProvider ?? 'openai',
        embeddingRemoteApiKey: coworkConfig.embeddingRemoteApiKey ?? '',
        embeddingRemoteBaseUrl: coworkConfig.embeddingRemoteBaseUrl ?? '',
        embeddingVectorWeight: coworkConfig.embeddingVectorWeight ?? 0.7,
        memoryEnabled: coworkConfig.memoryEnabled ?? true,
        memoryLlmJudgeEnabled: coworkConfig.memoryLlmJudgeEnabled ?? false,
      };
      const nextMemorySettings = {
        embeddingEnabled,
        embeddingModel,
        embeddingProvider,
        embeddingRemoteApiKey,
        embeddingRemoteBaseUrl,
        embeddingVectorWeight,
        memoryEnabled: coworkMemoryEnabled,
        memoryLlmJudgeEnabled: coworkMemoryLlmJudgeEnabled,
      };
      const previousDreamingSettings = {
        dreamingEnabled: coworkConfig.dreamingEnabled ?? false,
        dreamingFrequency: coworkConfig.dreamingFrequency ?? '0 3 * * *',
      };
      const nextDreamingSettings = {
        dreamingEnabled,
        dreamingFrequency,
      };
      const previousNotificationSettings = normalizeNotificationSettings(
        previousConfig.notificationSettings,
      );
      const previousArtifactAutoPreviewEnabled = resolveArtifactAutoPreviewEnabled(
        previousConfig.artifactAutoPreviewEnabled,
      );
      const previousThemeId = initialThemeIdRef.current;
      const previousUiFontSize = normalizeFontPreference(
        previousConfig.uiFontSize,
        FontPreferences.UiFontSizeDefault,
        FontPreferences.UiFontSizeMin,
        FontPreferences.UiFontSizeMax,
      );
      const previousCodeFontSize = normalizeFontPreference(
        previousConfig.codeFontSize,
        FontPreferences.CodeFontSizeDefault,
        FontPreferences.CodeFontSizeMin,
        FontPreferences.CodeFontSizeMax,
      );

      await configService.updateConfig({
        api: {
          key: primaryProvider.apiKey,
          baseUrl: primaryProvider.baseUrl,
        },
        providers: normalizedProviders, // Save all providers configuration
        theme,
        uiFontSize,
        codeFontSize,
        language,
        artifactAutoPreviewEnabled,
        useSystemProxy,
        sqliteAutoBackupEnabled,
        usageAnalyticsEnabled,
        notificationSettings: normalizeNotificationSettings({
          taskCompletionNotificationMode,
          permissionNotificationsEnabled,
          questionNotificationsEnabled,
        }),
        browserWebAccess: normalizedBrowserWebAccess,
        shortcuts,
        app: {
          ...previousConfig.app,
          testMode,
        },
      });

      if (!usageAnalyticsEnabled) {
        clearPendingPublishingConversionAttribution();
        clearPublishingSubscriptionRecoveryAnalytics();
      }

      if (previousArtifactAutoPreviewEnabled !== artifactAutoPreviewEnabled) {
        console.log(
          `[Settings] artifact auto-preview preference updated: enabled=${artifactAutoPreviewEnabled}`,
        );
      }

      applyTypographyPreferences({ uiFontSize, codeFontSize });

      // Apply the language
      i18nService.setLanguage(language, { persist: false });

      // Set API with the primary provider
      apiService.setConfig({
        apiKey: primaryProvider.apiKey,
        baseUrl: primaryProvider.baseUrl,
      });

      // Update the list of available models in the Redux store
      const allModels: { id: string; name: string; provider?: string; providerKey?: string; openClawProviderId?: string; supportsImage?: boolean }[] = [];
      Object.entries(normalizedProviders).forEach(([providerName, config]) => {
        if (config.enabled && config.models) {
          const openClawProviderId = getOpenClawProviderIdForConfig(providerName, config);
          config.models.forEach(model => {
            allModels.push({
              id: model.id,
              name: model.name,
              provider: getProviderDisplayName(providerName, config),
              providerKey: providerName,
              openClawProviderId,
              supportsImage: resolveModelSupportsImageForProvider(providerName, model),
            });
          });
        }
      });
      dispatch(setAvailableModels(allModels));

      if (hasCoworkConfigChanges) {
        if (previousOpenClawHeartbeatEnabled !== openClawHeartbeatEnabled) {
          console.log(
            `[Settings] updating OpenClaw heartbeat: enabled=${openClawHeartbeatEnabled}, previous=${previousOpenClawHeartbeatEnabled}`,
          );
        }
        const updated = await coworkService.updateConfig({
          agentEngine: coworkAgentEngine,
          memoryEnabled: coworkMemoryEnabled,
          memoryLlmJudgeEnabled: coworkMemoryLlmJudgeEnabled,
          skipMissedJobs,
          openClawHeartbeatEnabled,
          embeddingEnabled,
          embeddingProvider,
          embeddingModel,
          embeddingLocalModelPath,
          embeddingVectorWeight,
          embeddingRemoteBaseUrl,
          embeddingRemoteApiKey,
          dreamingEnabled,
          dreamingFrequency,
          dreamingModel,
          dreamingTimezone,
        });
        if (!updated) {
          throw new Error(i18nService.t('coworkConfigSaveFailed'));
        }
        const savedSessionPolicy = await coworkService.updateSessionPolicy({
          keepAlive: openClawSessionKeepAlive,
        });
        if (!savedSessionPolicy) {
          throw new Error(i18nService.t('coworkConfigSaveFailed'));
        }
      }

      // Ask main to sync IM/OpenClaw config. The main process skips this when
      // the IM fingerprint has not changed, so unrelated settings saves do not
      // restart the gateway.
      const syncSucceeded = await imService.saveAndSyncConfig();
      if (!syncSucceeded) {
        throw new Error(i18nService.t('settingsSavedButOpenClawSyncFailed'));
      }

      if (usageAnalyticsEnabled) {
        if (previousConfig.language !== language) {
          reportGeneralSettingChanged('language', language, previousConfig.language);
        }
        if (previousArtifactAutoPreviewEnabled !== artifactAutoPreviewEnabled) {
          reportGeneralSettingChanged(
            'artifactAutoPreviewEnabled',
            artifactAutoPreviewEnabled,
            previousArtifactAutoPreviewEnabled,
          );
        }
        if ((previousConfig.useSystemProxy ?? false) !== useSystemProxy) {
          reportGeneralSettingChanged('useSystemProxy', useSystemProxy, previousConfig.useSystemProxy ?? false);
        }
        if ((previousConfig.sqliteAutoBackupEnabled === true) !== sqliteAutoBackupEnabled) {
          reportGeneralSettingChanged(
            'sqliteAutoBackupEnabled',
            sqliteAutoBackupEnabled,
            previousConfig.sqliteAutoBackupEnabled === true,
          );
        }
        if (previousNotificationSettings.taskCompletionNotificationMode !== taskCompletionNotificationMode) {
          reportGeneralSettingChanged(
            'taskCompletionNotificationMode',
            taskCompletionNotificationMode,
            previousNotificationSettings.taskCompletionNotificationMode,
          );
        }
        if (previousNotificationSettings.permissionNotificationsEnabled !== permissionNotificationsEnabled) {
          reportGeneralSettingChanged(
            'permissionNotificationsEnabled',
            permissionNotificationsEnabled,
            previousNotificationSettings.permissionNotificationsEnabled,
          );
        }
        if (previousNotificationSettings.questionNotificationsEnabled !== questionNotificationsEnabled) {
          reportGeneralSettingChanged(
            'questionNotificationsEnabled',
            questionNotificationsEnabled,
            previousNotificationSettings.questionNotificationsEnabled,
          );
        }
        if (previousSkipMissedJobs !== skipMissedJobs) {
          reportGeneralSettingChanged('skipMissedJobs', skipMissedJobs, previousSkipMissedJobs);
        }
        if (previousConfig.theme !== theme) {
          reportAppearanceSettingChanged('theme', theme, previousConfig.theme);
        }
        if (previousThemeId !== themeId) {
          reportAppearanceSettingChanged('themeId', themeId, previousThemeId);
        }
        if (previousUiFontSize !== uiFontSize) {
          reportAppearanceSettingChanged('uiFontSize', uiFontSize, previousUiFontSize);
        }
        if (previousCodeFontSize !== codeFontSize) {
          reportAppearanceSettingChanged('codeFontSize', codeFontSize, previousCodeFontSize);
        }
        const browserSettingParams = buildBrowserSettingAnalyticsParams(
          previousBrowserWebAccess,
          normalizedBrowserWebAccess,
        );
        if (browserSettingParams) {
          reportBrowserSettingChanged(browserSettingParams);
        }
        if (previousAgentEngine !== coworkAgentEngine) {
          reportAgentEngineSettingChanged('agentEngine', coworkAgentEngine, previousAgentEngine);
        }
        if (previousOpenClawHeartbeatEnabled !== openClawHeartbeatEnabled) {
          reportAgentEngineSettingChanged(
            'openClawHeartbeatEnabled',
            openClawHeartbeatEnabled,
            previousOpenClawHeartbeatEnabled,
          );
        }
        if (previousOpenClawSessionKeepAlive !== openClawSessionKeepAlive) {
          reportAgentEngineSettingChanged(
            'openClawSessionKeepAlive',
            openClawSessionKeepAlive,
            previousOpenClawSessionKeepAlive,
          );
        }
        const memorySettingsSummary = buildMemorySettingAnalyticsSummary(
          previousMemorySettings,
          nextMemorySettings,
        );
        if (memorySettingsSummary) {
          reportMemorySettingChanged(memorySettingsSummary);
        }
        const dreamingSettingsSummary = buildDreamingSettingAnalyticsSummary(
          previousDreamingSettings,
          nextDreamingSettings,
        );
        if (dreamingSettingsSummary) {
          reportDreamingSettingChanged(dreamingSettingsSummary);
        }
        const shortcutSettingsSummary = buildShortcutSettingAnalyticsSummary(
          previousShortcuts,
          shortcuts,
        );
        if (shortcutSettingsSummary) {
          reportShortcutSettingChanged(shortcutSettingsSummary);
        }
        const customModelSettingsSummary = buildCustomModelSettingsAnalyticsSummary(
          previousProviders,
          normalizedProviders,
        );
        if (customModelSettingsSummary) {
          reportCustomModelSettingsSaved(customModelSettingsSummary);
        }
        if (previousConfig.usageAnalyticsEnabled === false) {
          void reportYdAnalyzer({
            action: LogReporterAction.UsageAnalyticsEnabled,
            source: SettingsAnalyticsSource.General,
          });
        }
      }

      didSaveRef.current = true;
      onClose();
    } catch (error) {
      console.error('[Settings] failed to save settings:', error);
      setError(error instanceof Error ? error.message : i18nService.t('failedToSaveSettings'));
    } finally {
      setIsSaving(false);
    }
  };

  // Tab change handling
  const doTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
  }, []);

  const handleTabChange = useCallback((tab: TabType) => {
    if (isBackingUpOpenClawData || isRestoringOpenClawData) return;
    doTabChange(tab);
  }, [doTabChange, isBackingUpOpenClawData, isRestoringOpenClawData]);

  const guardedClose = useCallback(() => {
    if (isBackingUpOpenClawData || isRestoringOpenClawData) return;
    onClose();
  }, [isBackingUpOpenClawData, isRestoringOpenClawData, onClose]);

  // Stop clicks inside the settings window from propagating to the backdrop
  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Escape dismisses the innermost stacked layer and closes the panel last.
  // Dialogs rendered through Modal handle Escape themselves.
  const handleEscape = () => {
    const resolution = resolveSettingsEscapeAction({
      isBlocked: isBackingUpOpenClawData
        || isRestoringOpenClawData
        || isCleaningTempStorage
        || isShortcutInputActive(),
      layers: [
        { isOpen: showTempCleanConfirm, dismiss: () => setShowTempCleanConfirm(false) },
        {
          isOpen: showOpenClawDataRestoreConfirm,
          dismiss: () => setShowOpenClawDataRestoreConfirm(false),
        },
        { isOpen: showMemoryModal, dismiss: resetCoworkMemoryEditor },
      ],
    });

    switch (resolution.action) {
      case SettingsEscapeAction.DismissLayer:
        resolution.dismiss();
        return;
      case SettingsEscapeAction.ClosePanel:
        guardedClose();
        return;
      default:
    }
  };

  // Render tabs
  const sidebarTabs: { key: TabType; label: string; icon: React.ReactNode }[] = (() => {
    // Tab order from docs/maties/design.md, section 5. Icons at 17px.
    const allTabs = [
      { key: 'model' as TabType,          label: i18nService.t('settingsTabYou'),  icon: <CubeIcon className={SETTINGS_TAB_ICON_CLASS} /> },
      { key: 'apps' as TabType,           label: i18nService.t('apps'),            icon: <SidebarMcpIcon className={SETTINGS_TAB_ICON_CLASS} /> },
      { key: 'skills' as TabType,         label: i18nService.t('skills'),          icon: <SkillIcon className={SETTINGS_TAB_ICON_CLASS} /> },
      { key: 'coworkMemory' as TabType,   label: i18nService.t('coworkMemoryTitle'), icon: <BrainIcon className={SETTINGS_TAB_ICON_CLASS} /> },
      { key: 'library' as TabType,        label: i18nService.t('librarySettingsTab'), icon: <BookOpenIcon className={SETTINGS_TAB_ICON_CLASS} /> },
      { key: 'appearance' as TabType,     label: i18nService.t('appearance'),      icon: <SunIcon className={SETTINGS_TAB_ICON_CLASS} /> },
      { key: 'general' as TabType,        label: i18nService.t('general'),         icon: <SettingsSlidersIcon className={SETTINGS_TAB_ICON_CLASS} /> },
      { key: 'about' as TabType,          label: i18nService.t('about'),           icon: <InformationCircleIcon className={SETTINGS_TAB_ICON_CLASS} /> },
    ];
    // Filter out tabs hidden by enterprise config
    // Filter out tabs with 'hide' action in enterprise config
    // e.g., ui: { "settings.im": "hide" } → hide the 'im' tab
    const ui = enterpriseConfig?.ui;
    if (ui) {
      return allTabs.filter(tab => ui[`settings.${tab.key}`] !== 'hide');
    }
    return allTabs;
  })();

  const activeTabLabel = useMemo(() => {
    return sidebarTabs.find(t => t.key === activeTab)?.label ?? '';
  }, [activeTab, sidebarTabs]);

  useEffect(() => {
    const handleSettingsTabShortcut = (event: KeyboardEvent) => {
      if (event.repeat || isShortcutInputActive()) return;

      const isTextEditing = isTextEditingActive();
      const command = SETTINGS_TAB_SHORTCUT_KEYS.find((candidate) => {
        const binding = shortcuts[candidate];
        // While typing, only run shortcuts carrying a Cmd/Ctrl modifier so plain keys keep inserting text.
        if (isTextEditing && !isTextEditingSafeShortcut(binding)) return false;
        return matchesShortcut(event, binding);
      });
      if (!command) return;

      const targetTab = SETTINGS_TAB_SHORTCUT_ACTIONS[command];
      if (!targetTab || !sidebarTabs.some(tab => tab.key === targetTab)) return;

      event.preventDefault();
      handleTabChange(targetTab);
    };

    document.addEventListener('keydown', handleSettingsTabShortcut);
    return () => document.removeEventListener('keydown', handleSettingsTabShortcut);
  }, [shortcuts, sidebarTabs, handleTabChange]);

  const handleUiFontSizeChange = useCallback((nextValue: number) => {
    setUiFontSize(nextValue);
    applyTypographyPreferences({
      uiFontSize: nextValue,
      codeFontSize,
    });
  }, [codeFontSize]);

  const handleCodeFontSizeChange = useCallback((nextValue: number) => {
    setCodeFontSize(nextValue);
    applyTypographyPreferences({
      uiFontSize,
      codeFontSize: nextValue,
    });
  }, [uiFontSize]);

  const handleThemeModeSelection = useCallback(async (
    mode: 'light' | 'dark' | 'system',
  ) => {
    setError(null);
    try {
      const selection = await selectThemeMode(mode);
      setTheme(selection.mode);
      setThemeId(selection.themeId);
      announceSettingsSaved();
    } catch (selectionError) {
      console.error('[Settings] Failed to select the default theme mode', selectionError);
      setError(i18nService.t('themeApplyFailed'));
    }
  }, [selectThemeMode]);

  const handleThemeIdSelection = useCallback(async (nextThemeId: string) => {
    setError(null);
    try {
      const selection = await selectThemeById(nextThemeId);
      setTheme(selection.mode);
      setThemeId(selection.themeId);
      announceSettingsSaved();
    } catch (selectionError) {
      console.error('[Settings] Failed to select the default color theme', selectionError);
      setError(i18nService.t('themeApplyFailed'));
    }
  }, [selectThemeById]);

  const renderAppearanceSettings = () => (
    <div className="space-y-8">
      <div>
        <Eyebrow className="mb-3 px-1">{i18nService.t('appearance')}</Eyebrow>

        <div className="grid max-w-xl grid-cols-3 gap-3 mb-4">
          {(['light', 'dark', 'system'] as const).map((mode) => {
            const isSelected = !activeSkin && theme === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => void handleThemeModeSelection(mode)}
                disabled={isAppearanceChanging}
                aria-pressed={isSelected}
                className="flex cursor-pointer flex-col items-center rounded-[14px] bg-white p-3 transition-shadow disabled:cursor-wait disabled:opacity-60 dark:bg-[#1c1e23]"
                style={{
                  boxShadow: isSelected ? '0 0 0 2px #0060d0' : '0 0 0 .5px rgba(16,22,35,.10)',
                }}
              >
                <svg viewBox="0 0 120 80" className="w-full h-auto rounded-md mb-2 overflow-hidden" xmlns="http://www.w3.org/2000/svg">
                  {mode === 'light' && (
                    <>
                      <rect width="120" height="80" fill="#F8F9FB" />
                      <rect x="0" y="0" width="30" height="80" fill="#EBEDF0" />
                      <rect x="4" y="8" width="22" height="4" rx="2" fill="#C8CBD0" />
                      <rect x="4" y="16" width="18" height="3" rx="1.5" fill="#D5D7DB" />
                      <rect x="4" y="22" width="20" height="3" rx="1.5" fill="#D5D7DB" />
                      <rect x="4" y="28" width="16" height="3" rx="1.5" fill="#D5D7DB" />
                      <rect x="36" y="8" width="78" height="64" rx="4" fill="#FFFFFF" />
                      <rect x="42" y="16" width="50" height="4" rx="2" fill="#D5D7DB" />
                      <rect x="42" y="24" width="66" height="3" rx="1.5" fill="#E2E4E7" />
                      <rect x="42" y="30" width="60" height="3" rx="1.5" fill="#E2E4E7" />
                      <rect x="42" y="36" width="55" height="3" rx="1.5" fill="#E2E4E7" />
                      <rect x="42" y="46" width="40" height="4" rx="2" fill="#D5D7DB" />
                      <rect x="42" y="54" width="66" height="3" rx="1.5" fill="#E2E4E7" />
                      <rect x="42" y="60" width="58" height="3" rx="1.5" fill="#E2E4E7" />
                    </>
                  )}
                  {mode === 'dark' && (
                    <>
                      <rect width="120" height="80" fill="#0F1117" />
                      <rect x="0" y="0" width="30" height="80" fill="#151820" />
                      <rect x="4" y="8" width="22" height="4" rx="2" fill="#3A3F4B" />
                      <rect x="4" y="16" width="18" height="3" rx="1.5" fill="#2A2F3A" />
                      <rect x="4" y="22" width="20" height="3" rx="1.5" fill="#2A2F3A" />
                      <rect x="4" y="28" width="16" height="3" rx="1.5" fill="#2A2F3A" />
                      <rect x="36" y="8" width="78" height="64" rx="4" fill="#1A1D27" />
                      <rect x="42" y="16" width="50" height="4" rx="2" fill="#3A3F4B" />
                      <rect x="42" y="24" width="66" height="3" rx="1.5" fill="#252930" />
                      <rect x="42" y="30" width="60" height="3" rx="1.5" fill="#252930" />
                      <rect x="42" y="36" width="55" height="3" rx="1.5" fill="#252930" />
                      <rect x="42" y="46" width="40" height="4" rx="2" fill="#3A3F4B" />
                      <rect x="42" y="54" width="66" height="3" rx="1.5" fill="#252930" />
                      <rect x="42" y="60" width="58" height="3" rx="1.5" fill="#252930" />
                    </>
                  )}
                  {mode === 'system' && (
                    <>
                      <defs>
                        <clipPath id="left-half">
                          <rect x="0" y="0" width="60" height="80" />
                        </clipPath>
                        <clipPath id="right-half">
                          <rect x="60" y="0" width="60" height="80" />
                        </clipPath>
                      </defs>
                      <g clipPath="url(#left-half)">
                        <rect width="120" height="80" fill="#F8F9FB" />
                        <rect x="0" y="0" width="30" height="80" fill="#EBEDF0" />
                        <rect x="4" y="8" width="22" height="4" rx="2" fill="#C8CBD0" />
                        <rect x="4" y="16" width="18" height="3" rx="1.5" fill="#D5D7DB" />
                        <rect x="4" y="22" width="20" height="3" rx="1.5" fill="#D5D7DB" />
                        <rect x="4" y="28" width="16" height="3" rx="1.5" fill="#D5D7DB" />
                        <rect x="36" y="8" width="78" height="64" rx="4" fill="#FFFFFF" />
                        <rect x="42" y="16" width="50" height="4" rx="2" fill="#D5D7DB" />
                        <rect x="42" y="24" width="66" height="3" rx="1.5" fill="#E2E4E7" />
                        <rect x="42" y="30" width="60" height="3" rx="1.5" fill="#E2E4E7" />
                        <rect x="42" y="36" width="55" height="3" rx="1.5" fill="#E2E4E7" />
                        <rect x="42" y="46" width="40" height="4" rx="2" fill="#D5D7DB" />
                        <rect x="42" y="54" width="66" height="3" rx="1.5" fill="#E2E4E7" />
                      </g>
                      <g clipPath="url(#right-half)">
                        <rect width="120" height="80" fill="#0F1117" />
                        <rect x="0" y="0" width="30" height="80" fill="#151820" />
                        <rect x="4" y="8" width="22" height="4" rx="2" fill="#3A3F4B" />
                        <rect x="4" y="16" width="18" height="3" rx="1.5" fill="#2A2F3A" />
                        <rect x="4" y="22" width="20" height="3" rx="1.5" fill="#2A2F3A" />
                        <rect x="4" y="28" width="16" height="3" rx="1.5" fill="#2A2F3A" />
                        <rect x="36" y="8" width="78" height="64" rx="4" fill="#1A1D27" />
                        <rect x="42" y="16" width="50" height="4" rx="2" fill="#3A3F4B" />
                        <rect x="42" y="24" width="66" height="3" rx="1.5" fill="#252930" />
                        <rect x="42" y="30" width="60" height="3" rx="1.5" fill="#252930" />
                        <rect x="42" y="36" width="55" height="3" rx="1.5" fill="#252930" />
                        <rect x="42" y="46" width="40" height="4" rx="2" fill="#3A3F4B" />
                        <rect x="42" y="54" width="66" height="3" rx="1.5" fill="#252930" />
                      </g>
                      <line x1="60" y1="0" x2="60" y2="80" stroke="#888" strokeWidth="0.5" />
                    </>
                  )}
                </svg>
                <span className="text-[12.5px] font-medium" style={{ color: isSelected ? '#0060d0' : '#4a4f57' }}>
                  {i18nService.t(mode)}
                </span>
              </button>
            );
          })}
        </div>

        <Eyebrow className="mb-3 mt-7 px-1">{i18nService.t('themeColor')}</Eyebrow>
        {(() => {
          const allThemes = themeService.getAllThemes();
          const renderTile = (t: import('../theme').ThemeDefinition) => {
            const isSelected = !activeSkin && themeId === t.meta.id;
            const [bg, c1, c2, c3] = t.meta.preview;
            return (
              <button
                key={t.meta.id}
                type="button"
                onClick={() => void handleThemeIdSelection(t.meta.id)}
                disabled={isAppearanceChanging}
                aria-pressed={isSelected}
                className="flex cursor-pointer flex-col items-center rounded-[12px] bg-white p-2 transition-shadow disabled:cursor-wait disabled:opacity-60 dark:bg-[#1c1e23]"
                style={{
                  boxShadow: isSelected ? '0 0 0 2px #0060d0' : '0 0 0 .5px rgba(16,22,35,.10)',
                }}
              >
                <svg viewBox="0 0 80 48" className="w-full h-auto rounded-md mb-1.5 overflow-hidden" xmlns="http://www.w3.org/2000/svg">
                  <rect width="80" height="48" fill={bg} />
                  <rect x="4" y="6" width="20" height="36" rx="3" fill={c1} opacity="0.7" />
                  <rect x="28" y="6" width="48" height="36" rx="3" fill={c2} opacity="0.5" />
                  <circle cx="52" cy="24" r="8" fill={c3} opacity="0.8" />
                  <rect x="32" y="34" width="40" height="4" rx="2" fill={c1} opacity="0.6" />
                </svg>
                <span className="w-full truncate text-center text-[11.5px] font-medium" style={{ color: isSelected ? '#0060d0' : '#4a4f57' }}>
                  {i18nService.t('theme-name-' + t.meta.id) || t.meta.name}
                </span>
              </button>
            );
          };
          return (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
              {allThemes.map(renderTile)}
            </div>
          );
        })()}

        <SkinSettingsSection onStartAiSkin={onStartAiSkin} />

        <div className="maties-card-row maties-divide mt-7">
          <div className="px-5 py-4">
            <SettingsNumberInputRow
              id="ui-font-size"
              title={i18nService.t('uiFontSize')}
              description={i18nService.t('uiFontSizeDescription')}
              value={uiFontSize}
              min={FontPreferences.UiFontSizeMin}
              max={FontPreferences.UiFontSizeMax}
              onChange={handleUiFontSizeChange}
            />
          </div>
          <div className="px-5 py-4">
            <SettingsNumberInputRow
              id="code-font-size"
              title={i18nService.t('codeFontSize')}
              description={i18nService.t('codeFontSizeDescription')}
              value={codeFontSize}
              min={FontPreferences.CodeFontSizeMin}
              max={FontPreferences.CodeFontSizeMax}
              onChange={handleCodeFontSizeChange}
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderTabContent = () => {
    switch(activeTab) {
      case 'general':
        return (
          <div className="space-y-8">
            {/* Group: General basics */}
            <SettingsGroup title={i18nService.t('settingsGroupBasics')}>
              <SettingsRow>
                <SettingsToggleRow
                  title={i18nService.t('artifactAutoPreviewEnabled')}
                  description={i18nService.t('artifactAutoPreviewEnabledDescription')}
                  checked={artifactAutoPreviewEnabled}
                  onToggle={() => {
                    setArtifactAutoPreviewEnabled((previous) => !previous);
                  }}
                />
              </SettingsRow>

              <SettingsRow>
                <SettingsToggleRow
                  title={i18nService.t('autoLaunch')}
                  description={i18nService.t('autoLaunchDescription')}
                  checked={autoLaunch}
                  disabled={isUpdatingAutoLaunch}
                  onToggle={async () => {
                    if (isUpdatingAutoLaunch) return;
                    const next = !autoLaunch;
                    setIsUpdatingAutoLaunch(true);
                    try {
                      console.log(`[Renderer][Settings] updating auto-launch setting: requested=${next}`);
                      const result = await window.electron.autoLaunch.set(next);
                      console.log(
                        `[Renderer][Settings] auto-launch update result: success=${result.success}, enabled=${result.enabled ?? 'unknown'}, error=${result.error ?? 'none'}`,
                      );
                      if (result.success) {
                        const previous = autoLaunch;
                        const actualEnabled = result.enabled ?? next;
                        setAutoLaunchState(actualEnabled);
                        reportGeneralSettingChanged('autoLaunch', actualEnabled, previous);
                      } else {
                        if (typeof result.enabled === 'boolean') {
                          setAutoLaunchState(result.enabled);
                        }
                        setError(getAutoLaunchErrorMessage(result.errorCode));
                      }
                    } catch (err) {
                      console.error('Failed to set auto-launch:', err);
                      setError(i18nService.t('autoLaunchUpdateFailed'));
                    } finally {
                      setIsUpdatingAutoLaunch(false);
                    }
                  }}
                />
              </SettingsRow>

              <SettingsRow>
                <SettingsToggleRow
                  title={i18nService.t('preventSleep')}
                  description={i18nService.t('preventSleepDescription')}
                  checked={preventSleep}
                  disabled={isUpdatingPreventSleep}
                  onToggle={async () => {
                    if (isUpdatingPreventSleep) return;
                    const next = !preventSleep;
                    setIsUpdatingPreventSleep(true);
                    try {
                      const result = await window.electron.preventSleep.set(next);
                      if (result.success) {
                        const previous = preventSleep;
                        setPreventSleepState(next);
                        reportGeneralSettingChanged('preventSleep', next, previous);
                      } else {
                        setError(result.error || 'Failed to update prevent-sleep setting');
                      }
                    } catch (err) {
                      console.error('Failed to set prevent-sleep:', err);
                      setError('Failed to update prevent-sleep setting');
                    } finally {
                      setIsUpdatingPreventSleep(false);
                    }
                  }}
                />
              </SettingsRow>

              <SettingsRow>
                <SettingsToggleRow
                  title={i18nService.t('useSystemProxy')}
                  description={i18nService.t('useSystemProxyDescription')}
                  checked={useSystemProxy}
                  onToggle={() => {
                    setUseSystemProxy((prev) => !prev);
                  }}
                />
              </SettingsRow>
            </SettingsGroup>

            {/* Group: Notifications */}
            <SettingsGroup
              title={i18nService.t('settingsGroupNotifications')}
              footer={
                (window.electron.platform === 'win32' ||
                  (window.electron.platform === 'darwin' && !import.meta.env.DEV)) && (
                  <p className="maties-caption px-1">
                    {i18nService.t('notificationSystemPermissionHint')}{' '}
                    <button
                      type="button"
                      className="text-[#0060d0] hover:underline"
                      onClick={() => {
                        void window.electron.appInfo.openSystemNotificationSettings?.();
                      }}
                    >
                      {i18nService.t('openSystemNotificationSettings')}
                    </button>
                  </p>
                )
              }
            >
              <SettingsRow>
                <div>
                  <div className="flex items-center justify-between gap-6">
                    <h4 className="maties-row-title min-w-0 flex-1">
                      {i18nService.t('taskCompletionNotificationMode')}
                    </h4>
                    <div className="w-[180px] shrink-0">
                      <ThemedSelect
                        id="task-completion-notification-mode"
                        value={taskCompletionNotificationMode}
                        onChange={(value) => {
                          setTaskCompletionNotificationMode(value as TaskCompletionNotificationMode);
                        }}
                        options={[
                          {
                            value: TaskCompletionNotificationMode.Always,
                            label: i18nService.t('taskCompletionNotificationModeAlways'),
                          },
                          {
                            value: TaskCompletionNotificationMode.Unfocused,
                            label: i18nService.t('taskCompletionNotificationModeUnfocused'),
                          },
                          {
                            value: TaskCompletionNotificationMode.Off,
                            label: i18nService.t('taskCompletionNotificationModeOff'),
                          },
                        ]}
                      />
                    </div>
                  </div>
                  <p className="maties-row-desc">
                    {i18nService.t('taskCompletionNotificationModeDescription')}
                  </p>
                </div>
              </SettingsRow>

              <SettingsRow>
                <SettingsToggleRow
                  title={i18nService.t('permissionNotifications')}
                  description={i18nService.t('permissionNotificationsDescription')}
                  checked={permissionNotificationsEnabled || questionNotificationsEnabled}
                  onToggle={() => {
                    const nextEnabled = !(permissionNotificationsEnabled || questionNotificationsEnabled);
                    setPermissionNotificationsEnabled(nextEnabled);
                    setQuestionNotificationsEnabled(nextEnabled);
                  }}
                />
              </SettingsRow>
            </SettingsGroup>

            {/* Group: Scheduled tasks */}
            <SettingsGroup title={i18nService.t('scheduledTasks')}>
              <SettingsRow>
                <SettingsToggleRow
                  title={i18nService.t('skipMissedJobs')}
                  description={i18nService.t('skipMissedJobsDescription')}
                  checked={skipMissedJobs}
                  onToggle={() => {
                    setSkipMissedJobs((prev) => !prev);
                  }}
                />
              </SettingsRow>

              {/* The one control worth keeping from the retired Agent Engine
                  tab: whether it keeps working while you are away. */}
              <SettingsRow>
                <SettingsToggleRow
                  title={i18nService.t('backgroundWorkEnabled')}
                  description={i18nService.t('backgroundWorkEnabledDescription')}
                  checked={openClawHeartbeatEnabled}
                  onToggle={() => {
                    setOpenClawHeartbeatEnabled((prev) => !prev);
                  }}
                />
              </SettingsRow>
            </SettingsGroup>

            {/* Group: Browser (its own tab until the clear-out) */}
            <SettingsGroup title={i18nService.t('browserWebAccessTab')}>
              <BrowserWebAccessSettings
                value={browserWebAccess}
                onChange={setBrowserWebAccess}
              />
            </SettingsGroup>

            {/* Group: Data & privacy */}
            <SettingsGroup title={i18nService.t('settingsGroupDataPrivacy')}>
              <SettingsRow>
                <div className="flex items-center justify-between gap-6">
                  <div className="min-w-0 flex-1">
                    <h4 className="maties-row-title">
                      {i18nService.t('coworkTempUsageTitle')}
                    </h4>
                    <p className="maties-row-desc">
                      {tempStorageUsageBytes === null
                        ? i18nService.t('coworkTempUsageLoading')
                        : i18nService.t('coworkTempUsageLabel')
                            .replace('{size}', formatBackupSize(tempStorageUsageBytes) || '0 B')
                            .replace(
                              '{cleanable}',
                              formatBackupSize(tempStorageCleanableBytes ?? 0) || '0 B',
                            )}
                    </p>
                    <p className="maties-row-desc">
                      {i18nService.t('coworkTempUsageManualNote')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void handleOpenTempCleanConfirm();
                    }}
                    disabled={isLoadingTempCleanPreview || isCleaningTempStorage || tempStorageCleanableBytes === 0}
                    className={`${SETTINGS_ROW_PILL_CLASS} shrink-0`}
                  >
                    {isLoadingTempCleanPreview
                      ? i18nService.t('coworkTempPreviewLoading')
                      : i18nService.t('coworkTempCleanNow')}
                  </button>
                </div>
                {tempStorageCleanResult && (
                  <p className="mt-2 text-sm text-secondary">{tempStorageCleanResult}</p>
                )}
              </SettingsRow>

              <SettingsRow>
                <SettingsToggleRow
                  title={i18nService.t('sqliteAutoBackupEnabled')}
                  description={i18nService.t('sqliteAutoBackupEnabledDescription')}
                  checked={sqliteAutoBackupEnabled}
                  onToggle={() => {
                    setSqliteAutoBackupEnabled((prev) => !prev);
                  }}
                />
              </SettingsRow>

              <SettingsRow>
                <SettingsToggleRow
                  title={i18nService.t('usageAnalyticsEnabled')}
                  description={i18nService.t('usageAnalyticsEnabledDescription')}
                  checked={usageAnalyticsEnabled}
                  onToggle={() => {
                    setUsageAnalyticsEnabled((prev) => !prev);
                  }}
                />
              </SettingsRow>

              {/* Moving to another computer. This was the Agent Engine tab's
                  « Data Backup » / « Data Migration »; the work is the same
                  and the words are now about the person's own data. */}
              <SettingsRow>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h4 className="maties-row-title">{i18nService.t('dataBackupTitle')}</h4>
                    <p className="maties-row-desc">{i18nService.t('dataBackupDescription')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { void handleOpenClawDataBackup(); }}
                    disabled={isBackingUpOpenClawData || isRestoringOpenClawData}
                    className={`${SETTINGS_ROW_PILL_CLASS} shrink-0`}
                  >
                    {isBackingUpOpenClawData && (
                      <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                    )}
                    {isBackingUpOpenClawData
                      ? i18nService.t('openClawDataBackupRunning')
                      : i18nService.t('dataBackupAction')}
                  </button>
                </div>
                {openClawDataBackupResult && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="maties-caption break-all">{openClawDataBackupResult.path}</div>
                      {formatBackupSize(openClawDataBackupResult.sizeBytes) && (
                        <div className="maties-caption">
                          {formatBackupSize(openClawDataBackupResult.sizeBytes)}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { void handleRevealOpenClawDataBackup(); }}
                      className={`${SETTINGS_ROW_PILL_CLASS} shrink-0`}
                    >
                      {i18nService.t('showInFolder')}
                    </button>
                  </div>
                )}
              </SettingsRow>

              <SettingsRow>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h4 className="maties-row-title">{i18nService.t('dataRestoreTitle')}</h4>
                    <p className="maties-row-desc">{i18nService.t('dataRestoreDescription')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowOpenClawDataRestoreConfirm(true)}
                    disabled={isBackingUpOpenClawData || isRestoringOpenClawData}
                    className={`${SETTINGS_ROW_PILL_CLASS} shrink-0`}
                  >
                    {isRestoringOpenClawData && (
                      <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                    )}
                    {isRestoringOpenClawData
                      ? i18nService.t('openClawDataMigrationRunning')
                      : i18nService.t('dataRestoreAction')}
                  </button>
                </div>
              </SettingsRow>
            </SettingsGroup>
          </div>
        );

      case 'appearance':
        return renderAppearanceSettings();

      // « Memory »: what it remembers about you, and when it tidies up. The
      // second half was the Dreaming tab; the behaviour stayed, the name went.
      case 'coworkMemory': {
        const coworkMemoryGroups: Array<{ section?: string; entries: CoworkUserMemoryEntry[] }> = [];
        for (const entry of coworkMemoryEntries) {
          const lastGroup = coworkMemoryGroups[coworkMemoryGroups.length - 1];
          if (lastGroup && (lastGroup.section ?? '') === (entry.section ?? '')) {
            lastGroup.entries.push(entry);
          } else {
            coworkMemoryGroups.push({ section: entry.section, entries: [entry] });
          }
        }
        return (
          <div className="space-y-8">
            <SettingsGroup title={i18nService.t('memoryRemembersTitle')}>
              {(
                <div className="maties-card-row space-y-4 px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="maties-row-title">
                        {i18nService.t('coworkMemoryCrudTitle')}
                      </div>
                      <div className="maties-row-desc">
                        {i18nService.t('coworkMemoryManageHint')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => { void handleEnterCoworkMemoryRawMode(); }}
                          disabled={coworkMemoryListLoading}
                          className={SETTINGS_ROW_PILL_CLASS}
                        >
                          {i18nService.t('coworkMemoryRawButton')}
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenCoworkMemoryModal}
                          className={`${SETTINGS_ROW_PILL_CLASS} is-primary`}
                        >
                          <PlusCircleIcon className="h-3.5 w-3.5" />
                          {i18nService.t('coworkMemoryCrudCreate')}
                        </button>
                    </div>
                  </div>

                    <>
                      {coworkMemoryStats && (
                        <div className="maties-caption">
                          {`${i18nService.t('coworkMemoryTotalLabel')}: ${coworkMemoryStats.total}`}
                        </div>
                      )}

                      <input
                        type="text"
                        value={coworkMemoryQuery}
                        onChange={(event) => setCoworkMemoryQuery(event.target.value)}
                        placeholder={i18nService.t('coworkMemorySearchPlaceholder')}
                        className="maties-input"
                      />

                      <div className="maties-hairline-top">
                        {coworkMemoryListLoading ? (
                          <div className="maties-caption px-1 py-3">
                            {i18nService.t('loading')}
                          </div>
                        ) : coworkMemoryEntries.length === 0 ? (
                          <div className="maties-caption px-1 py-3">
                            {i18nService.t('coworkMemoryEmpty')}
                          </div>
                        ) : (
                          <div className="maties-divide">
                            {coworkMemoryGroups.map((group, groupIndex) => (
                              <React.Fragment key={group.section ?? `ungrouped-${groupIndex}`}>
                                {group.section && (
                                  <div className="flex items-baseline gap-1.5 px-3 pb-1.5 pt-3 text-[11px] font-medium text-secondary">
                                    <span className="truncate">{group.section}</span>
                                    <span className="font-normal opacity-70">{group.entries.length}</span>
                                  </div>
                                )}
                                {group.entries.map((entry) => {
                                  const isLongMemoryText =
                                    entry.text.split('\n').length > 3 || entry.text.length > 240;
                                  const isMemoryTextExpanded = coworkMemoryExpandedIds.has(entry.id);
                                  return (
                                    <div key={entry.id} className="group px-3 py-3 text-xs transition-colors hover:bg-surface-raised/60">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                          <div
                                            className={`text-foreground break-words whitespace-pre-wrap leading-relaxed ${
                                              isLongMemoryText && !isMemoryTextExpanded ? 'line-clamp-3' : ''
                                            }`}
                                          >
                                            {entry.text}
                                          </div>
                                          {isLongMemoryText && (
                                            <button
                                              type="button"
                                              onClick={() => toggleCoworkMemoryExpandedId(entry.id)}
                                              className="mt-1.5 text-[11px] text-primary hover:underline"
                                            >
                                              {i18nService.t(isMemoryTextExpanded ? 'coworkMemoryCollapse' : 'coworkMemoryExpand')}
                                            </button>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                          <button
                                            type="button"
                                            onClick={() => handleEditCoworkMemoryEntry(entry)}
                                            title={i18nService.t('edit')}
                                            aria-label={i18nService.t('edit')}
                                            className="rounded-md p-1.5 text-secondary hover:text-foreground hover:bg-surface-raised transition-colors"
                                          >
                                            <EditIcon className="h-4 w-4" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => { void handleDeleteCoworkMemoryEntry(entry); }}
                                            title={i18nService.t('delete')}
                                            aria-label={i18nService.t('delete')}
                                            className="rounded-md p-1.5 text-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-60 transition-colors"
                                            disabled={coworkMemoryListLoading}
                                          >
                                            <TrashIcon className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </div>
                    </>

                  {coworkMemoryRawMode && (
                    <Modal
                      isOpen
                      onClose={() => setCoworkMemoryRawMode(false)}
                      onEscape={() => setCoworkMemoryRawMode(false)}
                      overlayClassName="fixed inset-0 z-[60] flex items-center justify-center maties-backdrop p-6"
                      className="maties-card-prose maties-in flex h-[min(720px,calc(100vh-48px))] w-[min(960px,calc(100vw-48px))] flex-col overflow-hidden"
                    >
                      <div className="flex shrink-0 items-start justify-between gap-3 px-6 pb-3 pt-6">
                        <div className="min-w-0">
                          <h2 className="maties-page-title">
                            {i18nService.t('coworkMemoryRawButton')}
                          </h2>
                          <p className="maties-subtitle mt-1">
                            {i18nService.t('coworkMemoryRawHint')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCoworkMemoryRawMode(false)}
                          title={i18nService.t('close')}
                          aria-label={i18nService.t('close')}
                          className="maties-icon-button"
                        >
                          <XMarkIcon className="h-[18px] w-[18px]" />
                        </button>
                      </div>
                      <textarea
                        value={coworkMemoryRawText}
                        onChange={(event) => setCoworkMemoryRawText(event.target.value)}
                        spellCheck={false}
                        autoFocus
                        className="maties-mono min-h-0 w-full flex-1 resize-none bg-transparent px-6 pb-4 pt-1 text-[12.5px] leading-relaxed text-[#1c1f23] focus:outline-none dark:text-[#f2f3f5]"
                      />
                      <div className="maties-hairline-top flex shrink-0 items-center justify-end gap-2 px-6 py-4">
                        <button
                          type="button"
                          onClick={() => setCoworkMemoryRawMode(false)}
                          className={`${SETTINGS_ROW_PILL_CLASS} is-ghost`}
                        >
                          {i18nService.t('cancel')}
                        </button>
                        <button
                          type="button"
                          onClick={() => { void handleSaveCoworkMemoryRaw(); }}
                          disabled={coworkMemoryRawSaving}
                          className={`${SETTINGS_ROW_PILL_CLASS} is-primary`}
                        >
                          {i18nService.t('save')}
                        </button>
                      </div>
                    </Modal>
                  )}
                </div>
              )}
            </SettingsGroup>

            <SettingsGroup title={i18nService.t('memoryTidyingGroup')}>
              <MemoryTidyingSection
                enabled={dreamingEnabled}
                frequency={dreamingFrequency}
                onEnabledChange={setDreamingEnabled}
                onFrequencyChange={setDreamingFrequency}
              />
            </SettingsGroup>

            {/* How memory is searched. Kept behind one quiet row: it names
                outside services and asks for a key, which nothing else in
                Maties does. */}
            <SettingsGroup title={i18nService.t('memorySearchGroup')}>
              <button
                type="button"
                onClick={() => setShowMemorySearchSettings((previous) => !previous)}
                className={SETTINGS_ROW_PILL_CLASS}
                aria-expanded={showMemorySearchSettings}
              >
                {showMemorySearchSettings
                  ? i18nService.t('coworkMemoryAdvancedHide')
                  : i18nService.t('coworkMemoryAdvancedShow')}
              </button>
              {showMemorySearchSettings && (
                <EmbeddingSettingsSection
                  embeddingEnabled={embeddingEnabled}
                  embeddingProvider={embeddingProvider}
                  embeddingModel={embeddingModel}
                  embeddingVectorWeight={embeddingVectorWeight}
                  embeddingRemoteBaseUrl={embeddingRemoteBaseUrl}
                  embeddingRemoteApiKey={embeddingRemoteApiKey}
                  onEmbeddingEnabledChange={setEmbeddingEnabled}
                  onEmbeddingProviderChange={setEmbeddingProvider}
                  onEmbeddingModelChange={setEmbeddingModel}
                  onEmbeddingVectorWeightChange={setEmbeddingVectorWeight}
                  onEmbeddingRemoteBaseUrlChange={setEmbeddingRemoteBaseUrl}
                  onEmbeddingRemoteApiKeyChange={setEmbeddingRemoteApiKey}
                />
              )}
            </SettingsGroup>
          </div>
        );
      }

      case 'model':
        return <MatiesAccountSection />;

      case 'library':
        return <LibrarySettingsSection />;

      // « Apps » (the sidebar's old Connectors entry, renamed): how to reach
      // the assistant, the channels it answers on, the accounts it can use,
      // and the servers the person adds by hand.
      case 'apps':
        return (
          <div className="flex flex-col gap-12">
            <section className="flex flex-col gap-[14px]">
              <h2 className="maties-page-title">
                {i18nService.t('matiesConnectionsReachTitle').replace('{name}', assistantName)}
              </h2>
              <ReachList assistantName={assistantName} />
            </section>
            <section className="flex flex-col gap-[14px]">
              <h2 className="maties-page-title">{i18nService.t('appsChannelsTitle')}</h2>
              <IMSettings
                initialPlatform={initialImPlatform}
                initialPlatformRequestId={initialTabRequestId}
              />
            </section>
            <ConnectionsCatalog />
            <section className="flex flex-col gap-[14px]">
              <h2 className="maties-page-title">{i18nService.t('matiesConnectionsOwnServers')}</h2>
              <McpManager />
            </section>
          </div>
        );

      case 'skills':
        return (
          <SkillsManager
            readOnly={enterpriseConfig?.ui?.skills === 'readonly'}
            onCreateByChat={onCreateSkillByChat}
            onUseSkill={onUseSkill}
          />
        );


      case 'about':
        return (
          <div className="flex min-h-full flex-col items-center pb-3 pt-8">
            {/* The sphere, the name, the version, the MIT notice (design, section 5). */}
            <button
              type="button"
              aria-label="Maties"
              className="cursor-default rounded-full focus:outline-none"
              onClick={(e) => {
                if (!e.altKey || !e.shiftKey) return;

                const next = logoClickCount + 1;
                setLogoClickCount(next);
                if (next >= 10 && !testModeUnlocked) {
                  setTestModeUnlocked(true);
                }
              }}
            >
              <Sphere size={64} title="Maties" />
            </button>
            <h3 className="maties-headline mt-5 text-[28px]">Maties</h3>
            <span className="maties-mono mt-1.5 text-[12.5px] text-[#8f96a0]">v{appVersion}</span>
            <p className="maties-caption mt-3 max-w-[52ch] text-center">
              {i18nService.t('aboutUpstreamNotice')}
            </p>

            <div className="mt-9 w-full max-w-[640px] space-y-2.5">
              <Eyebrow className="px-1">{i18nService.t('matiesAboutLinks')}</Eyebrow>
              <div className="maties-card-row maties-divide">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5">
                  <span className="maties-row-title font-normal">{i18nService.t('aboutVersion')}</span>
                  <div className="flex min-w-0 flex-wrap items-center justify-end gap-2.5">
                    <span className="maties-mono text-[12.5px] text-[#8f96a0]">{appVersion}</span>
                    {!enterpriseConfig?.disableUpdate && (
                    <button
                      type="button"
                      disabled={updateCheckStatus === 'checking' || updateCheckStatus === 'downloading'}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleCheckUpdate();
                      }}
                      className={SETTINGS_ROW_PILL_CLASS}
                    >
                      {updateButtonLabel}
                    </button>
                    )}
                    {enterpriseConfig?.disableUpdate && (
                    <span className="maties-caption">
                      {i18nService.t('settings.enterprise.managed')}
                    </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5">
                  <span className="maties-row-title font-normal">{i18nService.t('aboutUserCommunity')}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenUserCommunity();
                    }}
                    className="maties-mono min-w-0 cursor-pointer break-all rounded-md text-right text-[12.5px] text-[#4a4f57] transition-colors hover:text-[#0060d0] focus:outline-none"
                  >
                    {ABOUT_USER_COMMUNITY_URL}
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5">
                  <span className="maties-row-title font-normal">{i18nService.t('aboutUserManual')}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenUserManual();
                    }}
                    className="maties-mono min-w-0 cursor-pointer break-all rounded-md text-right text-[12.5px] text-[#4a4f57] transition-colors hover:text-[#0060d0] focus:outline-none"
                  >
                    {ABOUT_USER_MANUAL_URL}
                  </button>
                </div>
                {testModeUnlocked && (
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5">
                    <span className="maties-row-title font-normal">{i18nService.t('testMode')}</span>
                    <Switch
                      checked={testMode}
                      label={i18nService.t('testMode')}
                      onChange={() => setTestMode((prev) => !prev)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-auto flex w-full flex-col items-center pb-2 pt-12">
              <div className="flex flex-wrap items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenServiceTerms();
                  }}
                  className="maties-pill-sm is-ghost"
                >
                  {i18nService.t('aboutServiceTerms')}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleExportLogs();
                  }}
                  disabled={isExportingLogs}
                  className="maties-pill-sm is-ghost"
                >
                  {isExportingLogs ? i18nService.t('aboutExportingLogs') : i18nService.t('aboutExportLogs')}
                </button>
              </div>

              <p className="maties-caption mt-4 text-center">
                Copyright &copy; {new Date().getFullYear()} {i18nService.t('copyrightHolder')}. All rights reserved.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      onClose={guardedClose}
      onEscape={handleEscape}
      overlayClassName="fixed inset-0 z-50 maties-backdrop flex items-center justify-center p-4 sm:p-8"
      className="w-[calc(100vw-2rem)] min-w-0 max-w-[1180px]"
    >
      {/* The sheet: radius 24, the lifted shadow, at most 1180 × 780 (design, section 5). */}
      <SkinPresentationScope
        enabled
        data-skin-settings="true"
        className="maties-sheet maties-in relative flex h-[min(780px,calc(100vh-4rem))] w-full min-w-0 overflow-hidden"
        onClick={handleSettingsClick}
      >
        {/* The tab list */}
        <div className="maties-hairline-right flex w-[232px] shrink-0 flex-col overflow-y-auto rounded-l-[24px] bg-[#fdfdfd] dark:bg-[#1c1e23]">
          <div className="px-6 pb-2 pt-7">
            <Eyebrow>{i18nService.t('settings')}</Eyebrow>
          </div>
          <nav className="flex flex-col gap-px px-3.5 pb-5">
            {sidebarTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                data-active={activeTab === tab.key ? 'true' : undefined}
                aria-current={activeTab === tab.key ? 'page' : undefined}
                className="maties-tab-row"
              >
                <span>{tab.icon}</span>
                <span className="min-w-0 truncate">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* The content */}
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-r-[24px] bg-white dark:bg-[#1c1e23]">
          <div className="flex shrink-0 items-start justify-between gap-3 px-9 pb-4 pt-7">
            <h3 className="maties-page-title min-w-0 truncate">{activeTabLabel}</h3>
            <button
              type="button"
              onClick={guardedClose}
              aria-label={i18nService.t('close')}
              title={i18nService.t('close')}
              className="maties-icon-button -mr-2 -mt-1"
            >
              <XMarkIcon className="h-[18px] w-[18px]" />
            </button>
          </div>

          {noticeMessage && (
            <div className="px-9">
              <ErrorMessage
                message={noticeMessage}
                onClose={() => setNoticeMessage(null)}
              />
            </div>
          )}

          {error && (
            <div className="px-9">
              <ErrorMessage
                message={error}
                onClose={() => setError(null)}
              />
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            {/* Tab content */}
            <div
              ref={contentRef}
              className="flex-1 overflow-y-auto px-9 pb-6 pt-2"
              style={{ scrollbarGutter: 'stable' }}
            >
              {renderTabContent()}
            </div>

            {/* The footer: « Save » and « Cancel » only where a tab has a form. */}
            <div className="relative shrink-0">
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-0 bottom-full h-10 bg-gradient-to-t from-white to-transparent transition-opacity duration-200 dark:from-[#1c1e23] ${
                  footerFadeVisible ? 'opacity-100' : 'opacity-0'
                }`}
              />
              <div className="flex items-center justify-end gap-2 bg-white px-9 pb-6 pt-3 dark:bg-[#1c1e23]">
                {SETTINGS_TABS_WITH_FORM.has(activeTab) ? (
                  <>
                    <Pill tone={PillTone.Ghost} compact onClick={guardedClose}>
                      {i18nService.t('cancel')}
                    </Pill>
                    <Pill
                      type="submit"
                      tone={PillTone.Primary}
                      compact
                      disabled={isSaving || isAppearanceChanging}
                    >
                      {isSaving ? i18nService.t('saving') : i18nService.t('save')}
                    </Pill>
                  </>
                ) : (
                  <SettingsSavedNotice
                    hint={i18nService.t('matiesSavesOnChange')}
                    label={i18nService.t('matiesSaved')}
                  />
                )}
              </div>
            </div>
          </form>

        </div>


          {showTempCleanConfirm && (
            <div
              className="maties-backdrop absolute inset-0 z-30 flex items-center justify-center rounded-[24px] px-4"
              onClick={() => {
                if (!isCleaningTempStorage) setShowTempCleanConfirm(false);
              }}
            >
              <div
                className="maties-card-prose maties-in w-full max-w-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-6 pb-3 pt-6">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#f4f5f7] text-[#4a4f57] dark:bg-[#22252b] dark:text-[#c9ccd2]">
                      <TrashIcon className="h-5 w-5" />
                    </span>
                    <h3 className="maties-row-title text-[15.5px]">
                      {i18nService.t('coworkTempCleanDialogTitle')}
                    </h3>
                  </div>
                </div>

                <div className="space-y-3 px-5 py-4">
                  <p className="text-sm text-secondary">
                    {i18nService.t('coworkTempCleanDialogIntro')}
                  </p>
                  {tempCleanPreviewDirs.length === 0 ? (
                    <p className="rounded-xl border border-border px-3 py-3 text-sm text-secondary">
                      {i18nService.t('coworkTempCleanDialogEmpty')}
                    </p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                      {tempCleanPreviewDirs.map((dir) => {
                        const selectable = !dir.isActive && dir.cleanableFiles > 0;
                        return (
                          <label
                            key={dir.cwd}
                            className={`flex items-start gap-3 px-3 py-2.5 ${selectable ? 'cursor-pointer hover:bg-surface-raised' : 'opacity-60'}`}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600"
                              checked={Boolean(tempCleanSelection[dir.cwd]) && selectable}
                              disabled={!selectable || isCleaningTempStorage}
                              onChange={(e) => {
                                setTempCleanSelection(prev => ({ ...prev, [dir.cwd]: e.target.checked }));
                              }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-foreground" title={dir.tempDir}>
                                {dir.tempDir}
                              </span>
                              <span className="mt-0.5 block text-xs text-secondary">
                                {dir.isActive
                                  ? i18nService.t('coworkTempCleanDialogActiveTag')
                                  : dir.cleanableFiles > 0
                                    ? i18nService.t('coworkTempCleanDialogPerDir')
                                        .replace('{size}', formatBackupSize(dir.cleanableBytes) || '0 B')
                                        .replace('{count}', String(dir.cleanableFiles))
                                    : i18nService.t('coworkTempCleanDialogProtectedOnly')}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-xs text-secondary">
                    {i18nService.t('coworkTempCleanDialogProtectedNote')}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 px-5 pb-5">
                  <span className="text-sm text-secondary">
                    {i18nService.t('coworkTempCleanDialogTotal').replace(
                      '{size}',
                      formatBackupSize(tempCleanSelectedBytes) || '0 B',
                    )}
                  </span>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setShowTempCleanConfirm(false)}
                      disabled={isCleaningTempStorage}
                      className={`${SETTINGS_ROW_PILL_CLASS} is-ghost`}
                    >
                      {i18nService.t('cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { void handleConfirmTempClean(); }}
                      disabled={isCleaningTempStorage || tempCleanSelectedDirs.length === 0}
                      className={`${SETTINGS_ROW_PILL_CLASS} is-primary`}
                    >
                      {isCleaningTempStorage
                        ? <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        : <TrashIcon className="h-4 w-4" />}
                      {isCleaningTempStorage
                        ? i18nService.t('coworkTempCleaning')
                        : i18nService.t('coworkTempCleanDialogConfirm')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showOpenClawDataRestoreConfirm && (
            <div
              className="maties-backdrop absolute inset-0 z-30 flex items-center justify-center rounded-[24px] px-4"
              onClick={() => {
                if (!isRestoringOpenClawData) setShowOpenClawDataRestoreConfirm(false);
              }}
            >
              <div
                className="maties-card-prose maties-in w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-6 pb-3 pt-6">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#f4f5f7] text-[#4a4f57] dark:bg-[#22252b] dark:text-[#c9ccd2]">
                      <ArrowPathRoundedSquareIcon className="h-5 w-5" />
                    </span>
                    <h3 className="maties-row-title text-[15.5px]">
                      {i18nService.t('openClawDataMigrationConfirmTitle')}
                    </h3>
                  </div>
                </div>

                <div className="space-y-3 px-5 py-4 text-sm text-secondary">
                  <p>{i18nService.t('openClawDataMigrationConfirmDesc')}</p>
                  <p>{i18nService.t('openClawDataMigrationConfirmSafeDesc')}</p>
                </div>

                <div className="flex justify-end space-x-2 px-5 pb-5">
                  <button
                    type="button"
                    onClick={() => setShowOpenClawDataRestoreConfirm(false)}
                    disabled={isRestoringOpenClawData}
                    className={`${SETTINGS_ROW_PILL_CLASS} is-ghost`}
                  >
                    {i18nService.t('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleConfirmOpenClawDataRestore(); }}
                    disabled={isRestoringOpenClawData}
                    className={`${SETTINGS_ROW_PILL_CLASS} is-primary`}
                  >
                    {isRestoringOpenClawData
                      ? <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      : <ArrowPathRoundedSquareIcon className="h-4 w-4" />}
                    {isRestoringOpenClawData
                      ? i18nService.t('openClawDataMigrationRunning')
                      : i18nService.t('openClawDataMigrationConfirmAction')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {(isBackingUpOpenClawData || isRestoringOpenClawData) && (
            <div className="maties-backdrop fixed inset-0 z-[70] flex items-center justify-center px-4">
              <div className="maties-card-prose maties-in w-full max-w-md px-6 py-6 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#f4f5f7] text-[#4a4f57] dark:bg-[#22252b]">
                  <ArrowPathIcon className="h-5 w-5 animate-spin" />
                </div>
                <h3 className="maties-row-title mt-4 text-[15.5px]">
                  {i18nService.t(isBackingUpOpenClawData
                    ? 'openClawDataBackupBlockingTitle'
                    : 'openClawDataMigrationBlockingTitle')}
                </h3>
                <p className="mt-2 text-sm leading-6 text-secondary">
                  {i18nService.t(isBackingUpOpenClawData
                    ? 'openClawDataBackupBlockingDesc'
                    : 'openClawDataMigrationBlockingDesc')}
                </p>
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {i18nService.t(isBackingUpOpenClawData
                      ? 'openClawDataBackupBlockingWarning'
                      : 'openClawDataMigrationBlockingWarning')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Memory Modal */}
          {showMemoryModal && (
            <div
              className="maties-backdrop absolute inset-0 z-20 flex items-center justify-center rounded-[24px] px-4"
              onClick={resetCoworkMemoryEditor}
            >
              <div
                className="maties-card-prose maties-in w-full max-w-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2.5 px-6 pb-3 pt-6">
                  <h3 className="maties-row-title text-[15.5px]">
                    {coworkMemoryEditingId ? i18nService.t('coworkMemoryCrudUpdate') : i18nService.t('coworkMemoryCrudCreate')}
                  </h3>
                  {coworkMemoryEditingId && (
                    <span className="maties-status-pill maties-status-quiet">
                      {i18nService.t('coworkMemoryEditingTag')}
                    </span>
                  )}
                </div>

                <div className="px-5 pb-1">
                  <label className="maties-label mb-1.5 block">
                    {i18nService.t('coworkMemoryCrudContentLabel')}<span className="ml-0.5 text-[#e0322d]">*</span>
                  </label>
                  <textarea
                    value={coworkMemoryDraftText}
                    onChange={(event) => setCoworkMemoryDraftText(event.target.value)}
                    placeholder={i18nService.t('coworkMemoryCrudTextPlaceholder')}
                    autoFocus
                    className="maties-input maties-textarea min-h-[220px]"
                  />
                  <div className="maties-caption mt-1.5">
                    {i18nService.t('coworkMemoryCrudMultilineHint')}
                  </div>
                </div>

                <div className="flex justify-end space-x-2 px-5 py-4">
                  <button
                    type="button"
                    onClick={resetCoworkMemoryEditor}
                    className={`${SETTINGS_ROW_PILL_CLASS} is-ghost`}
                  >
                    {i18nService.t('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleSaveCoworkMemoryEntry(); }}
                    disabled={!coworkMemoryDraftText.trim() || coworkMemoryListLoading}
                    className={`${SETTINGS_ROW_PILL_CLASS} is-primary`}
                  >
                    {coworkMemoryEditingId ? i18nService.t('save') : i18nService.t('coworkMemoryCrudCreate')}
                  </button>
                </div>
              </div>
            </div>
          )}

      </SkinPresentationScope>
    </Modal>
  );
};

export default Settings;
