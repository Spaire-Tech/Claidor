import { ArrowPathIcon } from '@heroicons/react/20/solid';
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';

import { i18nService } from '../../services/i18n';
import { kitService } from '../../services/kit';
import { compareVersions, resolveLocalizedText } from '../../services/skill';
import { setInstalledKits as setInstalledKitsAction, setMarketplaceKits } from '../../store/slices/kitSlice';
import type { InstalledKit, KitSkillRef, MarketplaceKit } from '../../types/kit';
import { CARD_ACTION_PILL_CLASS, DETAIL_ACTION_PILL_CLASS } from '../common/actionPillStyles';
import { MANAGEMENT_BODY_TEXT, MANAGEMENT_META_TEXT, MANAGEMENT_TITLE_TEXT } from '../common/managementTypography';
import Modal from '../common/Modal';
import EmptyState from '../design/EmptyState';
import Pill, { PillTone } from '../design/Pill';
import ErrorMessage from '../ErrorMessage';
import SearchIcon from '../icons/SearchIcon';
import { getKitAnalyticsParams, reportKitAction } from './analytics';
import KitIcon from './KitIcon';

const KitOperationType = {
  Install: 'install',
  Uninstall: 'uninstall',
} as const;

type KitOperationType = typeof KitOperationType[keyof typeof KitOperationType];

const KitTab = {
  Marketplace: 'marketplace',
  Installed: 'installed',
} as const;

type KitTab = typeof KitTab[keyof typeof KitTab];

interface KitsManagerProps {
  onTryAsking?: (text: string, kitId: string) => void;
  onUseKit?: (kitId: string) => void;
}

interface TooltipPosition {
  left: number;
  top: number;
  width: number;
}

interface KitUpdateInfo {
  installedVersion: string;
  currentVersion: string;
}

const SKILL_TOOLTIP_WIDTH = 288;
const SKILL_TOOLTIP_MIN_WIDTH = 180;
const SKILL_TOOLTIP_VIEWPORT_MARGIN = 12;
const SKILL_TOOLTIP_GAP = 8;

const clamp = (value: number, min: number, max: number) => (
  Math.min(Math.max(value, min), Math.max(min, max))
);

const formatKitReinstallRequiredDetail = (info: KitUpdateInfo): string => (
  i18nService.t('kitReinstallRequiredDetail')
    .replace('{installedVersion}', info.installedVersion)
    .replace('{currentVersion}', info.currentVersion)
);

const KitSkillPill: React.FC<{ skill: KitSkillRef }> = ({ skill }) => {
  const name = resolveLocalizedText(skill.name).replace(/^\//, '');
  const description = skill.description ? resolveLocalizedText(skill.description) : '';
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);

  const updateTooltipPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || !description) return;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipHeight = tooltipRef.current?.getBoundingClientRect().height ?? 0;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxWidth = Math.max(SKILL_TOOLTIP_MIN_WIDTH, viewportWidth - SKILL_TOOLTIP_VIEWPORT_MARGIN * 2);
    const width = Math.min(SKILL_TOOLTIP_WIDTH, maxWidth);
    const left = clamp(
      triggerRect.left,
      SKILL_TOOLTIP_VIEWPORT_MARGIN,
      viewportWidth - width - SKILL_TOOLTIP_VIEWPORT_MARGIN,
    );
    const hasRoomAbove = triggerRect.top >= tooltipHeight + SKILL_TOOLTIP_GAP + SKILL_TOOLTIP_VIEWPORT_MARGIN;
    const rawTop = hasRoomAbove
      ? triggerRect.top - tooltipHeight - SKILL_TOOLTIP_GAP
      : triggerRect.bottom + SKILL_TOOLTIP_GAP;
    const top = clamp(
      rawTop,
      SKILL_TOOLTIP_VIEWPORT_MARGIN,
      viewportHeight - tooltipHeight - SKILL_TOOLTIP_VIEWPORT_MARGIN,
    );

    setTooltipPosition({
      left,
      top,
      width,
    });
  }, [description]);

  useLayoutEffect(() => {
    if (!tooltipVisible || !description) return undefined;

    updateTooltipPosition();
    window.addEventListener('resize', updateTooltipPosition);
    window.addEventListener('scroll', updateTooltipPosition, true);
    return () => {
      window.removeEventListener('resize', updateTooltipPosition);
      window.removeEventListener('scroll', updateTooltipPosition, true);
    };
  }, [description, tooltipVisible, updateTooltipPosition]);

  const showTooltip = () => {
    if (!description) return;
    setTooltipVisible(true);
  };

  const hideTooltip = () => {
    setTooltipVisible(false);
    setTooltipPosition(null);
  };

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex"
      onBlur={hideTooltip}
      onFocus={showTooltip}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      <span
        className="inline-flex items-center rounded-lg border border-border bg-surface-raised px-2.5 py-1 text-xs font-medium text-secondary"
      >
        {name}
      </span>
      {description && tooltipVisible && (
        <span
          ref={tooltipRef}
          className="pointer-events-none fixed z-50 rounded-lg border border-border bg-surface px-3 py-2 text-left text-xs font-normal leading-5 text-foreground shadow-card"
          style={{
            left: tooltipPosition?.left ?? 0,
            top: tooltipPosition?.top ?? 0,
            visibility: tooltipPosition ? 'visible' : 'hidden',
            width: tooltipPosition?.width ?? SKILL_TOOLTIP_WIDTH,
          }}
        >
          {description}
        </span>
      )}
    </span>
  );
};

const KitsManager: React.FC<KitsManagerProps> = ({ onTryAsking, onUseKit }) => {
  const dispatch = useDispatch();
  const [kits, setKits] = useState<MarketplaceKit[]>([]);
  const [installedKits, setInstalledKits] = useState<Record<string, InstalledKit>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<KitTab>(KitTab.Marketplace);
  const [selectedKit, setSelectedKit] = useState<MarketplaceKit | null>(null);
  const [operatingKitId, setOperatingKitId] = useState<string | null>(null);
  const [operationType, setOperationType] = useState<KitOperationType | null>(null);
  const [actionError, setActionError] = useState('');
  const [installPrompt, setInstallPrompt] = useState<{ kitId: string; text: string } | null>(null);
  const [kitPendingUninstall, setKitPendingUninstall] = useState<MarketplaceKit | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const [marketKits, installed] = await Promise.all([
      kitService.fetchMarketplaceKits(),
      kitService.getInstalledKits(),
    ]);
    setKits(marketKits);
    setInstalledKits(installed);
    dispatch(setMarketplaceKits(marketKits));
    dispatch(setInstalledKitsAction(installed));
    setIsLoading(false);
  }, [dispatch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const installedCount = useMemo(
    () => kits.filter(kit => !!installedKits[kit.id]).length,
    [kits, installedKits],
  );

  const filteredKits = useMemo(() => {
    let results = kits;
    // Tab filtering
    if (activeTab === KitTab.Installed) {
      results = results.filter(kit => !!installedKits[kit.id]);
    }
    // Search filtering
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      results = results.filter((kit) => {
        const name = resolveLocalizedText(kit.name).toLowerCase();
        const desc = resolveLocalizedText(kit.description).toLowerCase();
        return name.includes(q) || desc.includes(q);
      });
    }
    return results;
  }, [kits, installedKits, activeTab, searchQuery]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) return undefined;
    const timer = window.setTimeout(() => {
      reportKitAction('search', {
        source: 'kits_manager',
        activeTab,
        searchKeywordLength: query.length,
        resultCount: filteredKits.length,
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [activeTab, filteredKits.length, searchQuery]);

  const handleTabChange = (targetTab: KitTab) => {
    if (targetTab === activeTab) return;
    reportKitAction('tab_change', {
      source: 'kits_manager',
      activeTab,
      targetTab,
    });
    setActiveTab(targetTab);
  };

  const formatKitActionError = (key: 'kitInstallFailed' | 'kitUninstallFailed', kit: MarketplaceKit) => (
    i18nService.t(key).replace('{name}', resolveLocalizedText(kit.name))
  );

  const handleInstall = async (kit: MarketplaceKit) => {
    setOperatingKitId(kit.id);
    setOperationType(KitOperationType.Install);
    setActionError('');
    reportKitAction('install_submit', {
      source: 'kits_manager',
      ...getKitAnalyticsParams(kit, installedKits[kit.id]),
    });
    try {
      const result = await kitService.installKit(kit);
      if (result.success) {
        const installed = await kitService.getInstalledKits();
        setInstalledKits(installed);
        dispatch(setInstalledKitsAction(installed));
        reportKitAction('install_success', {
          source: 'kits_manager',
          result: 'success',
          ...getKitAnalyticsParams(kit, installed[kit.id]),
        });
      } else {
        console.error('[KitsManager] Install failed:', result.error);
        setActionError(formatKitActionError('kitInstallFailed', kit));
        reportKitAction('install_failed', {
          source: 'kits_manager',
          result: 'failed',
          errorCode: 'install_failed',
          ...getKitAnalyticsParams(kit, installedKits[kit.id]),
        });
      }
    } catch (error) {
      console.error('[KitsManager] Install failed:', error);
      setActionError(formatKitActionError('kitInstallFailed', kit));
      reportKitAction('install_failed', {
        source: 'kits_manager',
        result: 'failed',
        errorCode: 'install_failed',
        ...getKitAnalyticsParams(kit, installedKits[kit.id]),
      });
    } finally {
      setOperatingKitId(null);
      setOperationType(null);
    }
  };

  const handleRequestUninstall = (kit: MarketplaceKit) => {
    reportKitAction('uninstall_confirm_open', {
      source: 'kits_manager',
      ...getKitAnalyticsParams(kit, installedKits[kit.id]),
    });
    setKitPendingUninstall(kit);
  };

  const handleCancelUninstall = () => {
    if (operationType === KitOperationType.Uninstall) return;
    if (kitPendingUninstall) {
      reportKitAction('uninstall_confirm_cancel', {
        source: 'kits_manager',
        ...getKitAnalyticsParams(kitPendingUninstall, installedKits[kitPendingUninstall.id]),
      });
    }
    setKitPendingUninstall(null);
  };

  const handleUninstall = async (kitId: string) => {
    const kit = kits.find(item => item.id === kitId);
    setOperatingKitId(kitId);
    setOperationType(KitOperationType.Uninstall);
    setActionError('');
    if (kit) {
      reportKitAction('uninstall_submit', {
        source: 'kits_manager',
        ...getKitAnalyticsParams(kit, installedKits[kit.id]),
      });
    }
    try {
      const result = await kitService.uninstallKit(kitId);
      if (result.success) {
        const installed = await kitService.getInstalledKits();
        setInstalledKits(installed);
        dispatch(setInstalledKitsAction(installed));
        if (kit) {
          reportKitAction('uninstall_success', {
            source: 'kits_manager',
            result: 'success',
            ...getKitAnalyticsParams(kit, installedKits[kit.id]),
          });
        }
      } else {
        console.error('[KitsManager] Uninstall failed:', result.error);
        if (kit) {
          setActionError(formatKitActionError('kitUninstallFailed', kit));
          reportKitAction('uninstall_failed', {
            source: 'kits_manager',
            result: 'failed',
            errorCode: 'uninstall_failed',
            ...getKitAnalyticsParams(kit, installedKits[kit.id]),
          });
        }
      }
    } catch (error) {
      console.error('[KitsManager] Uninstall failed:', error);
      if (kit) {
        setActionError(formatKitActionError('kitUninstallFailed', kit));
        reportKitAction('uninstall_failed', {
          source: 'kits_manager',
          result: 'failed',
          errorCode: 'uninstall_failed',
          ...getKitAnalyticsParams(kit, installedKits[kit.id]),
        });
      }
    } finally {
      setOperatingKitId(null);
      setOperationType(null);
      setKitPendingUninstall(null);
    }
  };

  const handleConfirmUninstall = async () => {
    if (!kitPendingUninstall || operationType === KitOperationType.Uninstall) return;
    const kitId = kitPendingUninstall.id;
    setKitPendingUninstall(null);
    await handleUninstall(kitId);
  };

  const isKitInstalled = (kitId: string) => !!installedKits[kitId];
  const isOperating = (kitId: string) => operatingKitId === kitId;

  const openKitDetail = (kit: MarketplaceKit) => {
    reportKitAction('open_detail', {
      source: 'kits_manager',
      resultCount: filteredKits.length,
      ...getKitAnalyticsParams(kit, installedKits[kit.id]),
    });
    setSelectedKit(kit);
  };

  const handleUseKit = (kit: MarketplaceKit) => {
    reportKitAction('use_kit', {
      source: 'kits_manager',
      ...getKitAnalyticsParams(kit, installedKits[kit.id]),
    });
    onUseKit?.(kit.id);
  };
  const getSkillCount = (kit: MarketplaceKit) => kit.skills?.list.length ?? 0;
  const getKitUpdateInfo = (kit: MarketplaceKit): KitUpdateInfo | null => {
    const installedKit = installedKits[kit.id];
    if (!installedKit || !kit.version) return null;

    const installedVersion = installedKit.version || '0.0.0';
    if (compareVersions(kit.version, installedVersion) <= 0) return null;
    return {
      installedVersion,
      currentVersion: kit.version,
    };
  };

  const handleTryAskingClick = (text: string, kitId: string) => {
    const kit = kits.find(item => item.id === kitId);
    const tryAskingIndex = kit?.tryAsking?.findIndex(prompt => resolveLocalizedText(prompt) === text);
    if (isKitInstalled(kitId)) {
      if (kit) {
        reportKitAction('try_asking', {
          source: 'kits_manager',
          tryAskingIndex: tryAskingIndex === undefined || tryAskingIndex < 0 ? undefined : tryAskingIndex,
          ...getKitAnalyticsParams(kit, installedKits[kitId]),
        });
      }
      onTryAsking?.(text, kitId);
    } else {
      if (kit) {
        reportKitAction('install_prompt_open', {
          source: 'kits_manager',
          tryAskingIndex: tryAskingIndex === undefined || tryAskingIndex < 0 ? undefined : tryAskingIndex,
          ...getKitAnalyticsParams(kit, installedKits[kitId]),
        });
      }
      setInstallPrompt({ kitId, text });
    }
  };

  const handleInstallAndTry = async () => {
    if (!installPrompt || !selectedKit) return;
    const { kitId, text } = installPrompt;
    setInstallPrompt(null);
    reportKitAction('install_and_try_submit', {
      source: 'kits_manager',
      ...getKitAnalyticsParams(selectedKit, installedKits[selectedKit.id]),
    });
    await handleInstall(selectedKit);
    // After install, check if it succeeded and navigate
    const installed = await kitService.getInstalledKits();
    if (installed[kitId]) {
      onTryAsking?.(text, kitId);
    }
  };

  const uninstallConfirmModal = kitPendingUninstall ? (
    <Modal
      onClose={handleCancelUninstall}
      overlayClassName="maties-backdrop fixed inset-0 z-[9999] flex items-center justify-center px-4"
      className="maties-card-prose maties-in w-full max-w-sm p-6"
    >
      <div className="maties-row-title text-[15.5px]">
        {i18nService.t('kitUninstall')}
      </div>
      <p className="maties-row-desc">
        {i18nService.t('kitUninstallConfirm').replace(
          '{name}',
          resolveLocalizedText(kitPendingUninstall.name),
        )}
      </p>
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleCancelUninstall}
          disabled={operationType === KitOperationType.Uninstall}
          className="maties-pill-sm is-ghost"
        >
          {i18nService.t('cancel')}
        </button>
        <button
          type="button"
          onClick={handleConfirmUninstall}
          disabled={operationType === KitOperationType.Uninstall}
          className="maties-pill-sm is-primary"
        >
          {i18nService.t('confirmDelete')}
        </button>
      </div>
    </Modal>
  ) : null;

  // Detail view
  if (selectedKit) {
    const installed = isKitInstalled(selectedKit.id);
    const operating = isOperating(selectedKit.id);
    const updateInfo = getKitUpdateInfo(selectedKit);

    return (
      <div className="space-y-6">
        {/* Back button */}
        <button
          type="button"
          onClick={() => {
            reportKitAction('back_to_list', {
              source: 'kits_manager',
              ...getKitAnalyticsParams(selectedKit, installedKits[selectedKit.id]),
            });
            setSelectedKit(null);
          }}
          className="non-draggable maties-pill-sm is-ghost relative z-30 -ml-2"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          {i18nService.t('kitBack')}
        </button>

        {actionError && (
          <ErrorMessage message={actionError} onClose={() => setActionError('')} />
        )}

        {/* Kit header */}
        <div className="maties-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <KitIcon icon={selectedKit.icon} className="h-20 w-20" />
              <div className="min-w-0">
                <h2 className="maties-headline text-[22px]">{resolveLocalizedText(selectedKit.name)}</h2>
                <p className={`mt-1.5 max-w-2xl ${MANAGEMENT_BODY_TEXT} leading-5 text-secondary`}>
                  {resolveLocalizedText(selectedKit.description)}
                </p>
                <div className={`mt-3 flex items-center gap-1.5 ${MANAGEMENT_META_TEXT} text-secondary`}>
                  {installed && (
                    <>
                      <span className="maties-status-done inline-flex items-center gap-1 font-medium">
                        <CheckIcon className="h-2.5 w-2.5" />
                        {i18nService.t('kitInstalled')}
                      </span>
                      <span className="text-secondary/50">·</span>
                    </>
                  )}
                  {selectedKit.author && (
                    <>
                      <span className="font-medium text-[#4a4f57]">
                        {i18nService.t('kitOfficial')}
                      </span>
                      <span className="text-secondary/50">·</span>
                    </>
                  )}
                  {selectedKit.version && (
                    <>
                      <span className="maties-mono">
                        v{selectedKit.version}
                      </span>
                      <span className="text-secondary/50">·</span>
                    </>
                  )}
                  {getSkillCount(selectedKit) > 0 && (
                    <span>{i18nService.t('kitSkillCount').replace('{count}', String(getSkillCount(selectedKit)))}</span>
                  )}
                </div>
                {updateInfo && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                    <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{formatKitReinstallRequiredDetail(updateInfo)}</span>
                  </div>
                )}
              </div>
            </div>
            {/* The detail page is where a single loud action belongs; uninstall
                is rare and destructive, so it waits at the bottom. */}
            {installed ? (
              onUseKit && (
                <button
                  type="button"
                  disabled={operating}
                  onClick={() => handleUseKit(selectedKit)}
                  className={DETAIL_ACTION_PILL_CLASS}
                >
                  {i18nService.t('kitUseNow')}
                </button>
              )
            ) : (
              <button
                type="button"
                disabled={operating}
                onClick={() => handleInstall(selectedKit)}
                className={DETAIL_ACTION_PILL_CLASS}
              >
                {operating && operationType === KitOperationType.Install ? (
                  <>
                    <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                    {i18nService.t('kitInstalling')}
                  </>
                ) : i18nService.t('kitInstall')}
              </button>
            )}
          </div>
        </div>

        {/* Try asking */}
        {selectedKit.tryAsking && selectedKit.tryAsking.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-foreground mb-3">
              {i18nService.t('kitTryAsking')}
            </h3>
            <div className="space-y-2">
              {selectedKit.tryAsking.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleTryAskingClick(resolveLocalizedText(prompt), selectedKit.id)}
                  className="group flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-primary/50 hover:bg-surface-raised/50"
                >
                  <span className="text-sm text-foreground">{resolveLocalizedText(prompt)}</span>
                  <ChevronRightIcon className="h-3.5 w-3.5 flex-shrink-0 text-secondary transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Skills list */}
        {selectedKit.skills && selectedKit.skills.list.length > 0 && (
          <div>
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-foreground">
              {i18nService.t('kitSkills')}
              <span className={`rounded-full bg-surface-raised px-1.5 py-0.5 ${MANAGEMENT_META_TEXT} font-medium text-secondary`}>
                {selectedKit.skills.list.length}
              </span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {selectedKit.skills.list.map((skill) => (
                <KitSkillPill key={skill.id} skill={skill} />
              ))}
            </div>
          </div>
        )}

        {/* Management strip: quiet until you reach for it. */}
        {installed && (
          <div className="flex items-center border-t border-border pt-4">
            <button
              type="button"
              disabled={operating}
              onClick={() => handleRequestUninstall(selectedKit)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 ${MANAGEMENT_BODY_TEXT} text-secondary transition-colors hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <TrashIcon className="h-4 w-4" />
              {operating && operationType === KitOperationType.Uninstall
                ? i18nService.t('kitUninstalling')
                : i18nService.t('kitUninstall')}
            </button>
          </div>
        )}

        {/* Install confirmation dialog */}
        {installPrompt && (
          <Modal
            onClose={() => {
              reportKitAction('install_prompt_cancel', {
                source: 'kits_manager',
                ...getKitAnalyticsParams(selectedKit, installedKits[selectedKit.id]),
              });
              setInstallPrompt(null);
            }}
            overlayClassName="maties-backdrop fixed inset-0 z-[9999] flex items-center justify-center px-4"
            className="maties-card-prose maties-in w-full max-w-sm overflow-hidden"
          >
            <div className="px-6 pb-4 pt-6">
              <h2 className="maties-row-title text-[15.5px]">
                {i18nService.t('kitInstallRequired')}
              </h2>
              <p className="maties-row-desc">
                {i18nService.t('kitInstallRequiredDesc')}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 pb-6">
              <button
                type="button"
                onClick={() => {
                  reportKitAction('install_prompt_cancel', {
                    source: 'kits_manager',
                    ...getKitAnalyticsParams(selectedKit, installedKits[selectedKit.id]),
                  });
                  setInstallPrompt(null);
                }}
                className="maties-pill-sm is-ghost"
              >
                {i18nService.t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleInstallAndTry}
                className="maties-pill-sm is-primary"
              >
                {i18nService.t('kitInstall')}
              </button>
            </div>
          </Modal>
        )}

        {uninstallConfirmModal}
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-5">
      {/* Sticky toolbar: the Marketplace / Installed pills and the search box */}
      <div
        data-skin-management-toolbar="true"
        className="sticky top-0 z-10 space-y-4 bg-background pb-2"
      >
        {actionError && (
          <ErrorMessage message={actionError} onClose={() => setActionError('')} />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5" role="tablist">
            <Pill
              role="tab"
              compact
              aria-selected={activeTab === KitTab.Marketplace}
              tone={activeTab === KitTab.Marketplace ? PillTone.Selected : PillTone.Quiet}
              onClick={() => handleTabChange(KitTab.Marketplace)}
            >
              {i18nService.t('kitMarketplace')}
            </Pill>
            <Pill
              role="tab"
              compact
              aria-selected={activeTab === KitTab.Installed}
              tone={activeTab === KitTab.Installed ? PillTone.Selected : PillTone.Quiet}
              onClick={() => handleTabChange(KitTab.Installed)}
            >
              {i18nService.t('kitInstalledTab')}
              {installedCount > 0 && (
                <span className="maties-mono ml-1 text-[11.5px] text-[#8f96a0]">{installedCount}</span>
              )}
            </Pill>
          </div>
          <div className="relative ml-auto w-full max-w-[320px] flex-1">
            <SearchIcon className="maties-input-icon-glyph h-4 w-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={i18nService.t('kitSearchPlaceholder')}
              className="maties-input maties-input-icon pr-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  reportKitAction('clear_search', {
                    source: 'kits_manager',
                    searchKeywordLength: searchQuery.trim().length,
                    resultCount: filteredKits.length,
                  });
                  setSearchQuery('');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[#9aa1ab] transition-colors hover:text-[#1c1f23]"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Kit grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="maties-card maties-skeleton min-h-[116px] p-4">
              <div className="flex gap-3.5">
                <div className="h-16 w-16 rounded-xl bg-surface-raised" />
                <div className="flex-1 space-y-2.5 pt-1">
                  <div className="h-3.5 w-1/3 rounded bg-surface-raised" />
                  <div className="h-3 w-full rounded bg-surface-raised" />
                  <div className="h-3 w-2/3 rounded bg-surface-raised" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredKits.length === 0 ? (
        <EmptyState
          sentence={searchQuery.trim()
            ? i18nService.t('kitSearchNoResults')
            : activeTab === KitTab.Installed
              ? i18nService.t('kitsEmptySentence')
              : i18nService.t('kitsMarketplaceEmptySentence')}
          action={searchQuery.trim() ? (
            <Pill
              compact
              onClick={() => {
                reportKitAction('clear_search', {
                  source: 'kits_manager',
                  searchKeywordLength: searchQuery.trim().length,
                  resultCount: filteredKits.length,
                });
                setSearchQuery('');
              }}
            >
              {i18nService.t('kitClearSearch')}
            </Pill>
          ) : activeTab === KitTab.Installed ? (
            <Pill tone={PillTone.Primary} compact onClick={() => handleTabChange(KitTab.Marketplace)}>
              {i18nService.t('kitGoInstall')}
            </Pill>
          ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredKits.map((kit) => {
            const installed = isKitInstalled(kit.id);
            const operating = isOperating(kit.id);
            const skillCount = getSkillCount(kit);
            const updateInfo = getKitUpdateInfo(kit);

            return (
              <div
                key={kit.id}
                role="button"
                tabIndex={0}
                className="maties-card maties-card-interactive min-h-[116px] cursor-pointer p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0060d0]/30"
                onClick={() => openKitDetail(kit)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openKitDetail(kit);
                  }
                }}
              >
                <div className="flex gap-3.5">
                  <KitIcon icon={kit.icon} className="h-16 w-16" />

                  <div className="min-w-0 flex-1">
                    {/* One capsule, its label carrying the state. Uninstall is
                        not a browsing action, so it lives in the detail page. */}
                    <div className="flex items-center gap-2">
                      <h3 className={`min-w-0 flex-1 truncate ${MANAGEMENT_TITLE_TEXT} font-semibold text-foreground`}>
                        {resolveLocalizedText(kit.name)}
                      </h3>
                      {installed ? (
                        onUseKit && (
                          <button
                            type="button"
                            disabled={operating}
                            onClick={(e) => { e.stopPropagation(); handleUseKit(kit); }}
                            className={CARD_ACTION_PILL_CLASS}
                          >
                            {i18nService.t('kitUse')}
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          disabled={operating}
                          onClick={(e) => { e.stopPropagation(); handleInstall(kit); }}
                          className={CARD_ACTION_PILL_CLASS}
                        >
                          {operating && operationType === KitOperationType.Install ? (
                            <>
                              <ArrowPathIcon className="h-3 w-3 animate-spin" />
                              {i18nService.t('kitInstalling')}
                            </>
                          ) : i18nService.t('kitInstall')}
                        </button>
                      )}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-[18px] text-secondary">
                      {resolveLocalizedText(kit.description)}
                    </p>

                    <div className={`mt-3 flex flex-wrap items-center gap-1.5 ${MANAGEMENT_META_TEXT} text-secondary`}>
                      {installed && activeTab === KitTab.Marketplace && (
                        <>
                          <span className="maties-status-done inline-flex items-center gap-1 font-medium">
                            <CheckIcon className="h-2.5 w-2.5" />
                            {i18nService.t('kitInstalled')}
                          </span>
                          <span className="text-secondary/50">·</span>
                        </>
                      )}
                      {kit.author && (
                        <>
                          <span className="font-medium text-[#4a4f57]">
                            {i18nService.t('kitOfficial')}
                          </span>
                          <span className="text-secondary/50">·</span>
                        </>
                      )}
                      {kit.version && (
                        <>
                          <span className="maties-mono">
                            v{kit.version}
                          </span>
                          <span className="text-secondary/50">·</span>
                        </>
                      )}
                      {skillCount > 0 && (
                        <span>{i18nService.t('kitSkillCount').replace('{count}', String(skillCount))}</span>
                      )}
                      {updateInfo && (
                        <span className="maties-status-attention font-medium">
                          {i18nService.t('kitReinstallRequiredBadge')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {uninstallConfirmModal}
    </div>
  );
};

export default KitsManager;
