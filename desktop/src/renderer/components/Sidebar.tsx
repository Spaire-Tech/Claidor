import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { AgentId } from '@shared/agent';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { ShortcutAction } from '../config';
import { agentService } from '../services/agent';
import { configService, ConfigServiceEvent } from '../services/config';
import { coworkService } from '../services/cowork';
import { i18nService } from '../services/i18n';
import { LogReporterAction, reportYdAnalyzer } from '../services/logReporter';
import { RootState } from '../store';
import {
  selectCoworkSessions,
  selectCurrentSessionId,
} from '../store/selectors/coworkSelectors';
import type { CoworkSessionSummary } from '../types/cowork';
import { getAgentDisplayNameById } from '../utils/agentDisplay';
import {
  type AgentSidebarBatchItem,
  AgentSidebarBatchItemKind,
  createSessionBatchKey,
} from './agentSidebar/batchSelection';
import MyAgentSidebarTree from './agentSidebar/MyAgentSidebarTree';
import Modal from './common/Modal';
import {
  type CoworkTaskSearchRequestEventDetail,
  CoworkTaskSearchRequestSource,
  CoworkUiEvent,
} from './cowork/constants';
import CoworkSearchModal from './cowork/CoworkSearchModal';
import {
  BooksLineIcon,
  ClockLineIcon,
  GearLineIcon,
  PencilLineIcon,
  PuzzleLineIcon,
  SearchLineIcon,
  SquaresLineIcon,
} from './design/LineIcons';
import Pill, { PillTone } from './design/Pill';
import { formatShortcutGlyphs } from './design/shortcutGlyphs';
import LoginButton, { LoginButtonVariant } from './LoginButton';

interface SidebarProps {
  onShowSettings: () => void;
  onShowLogin?: () => void;
  activeView: 'cowork' | 'skills' | 'scheduledTasks' | 'kits' | 'mcp' | 'library';
  onShowSkills: () => void;
  onShowCowork: () => void;
  onShowScheduledTasks: () => void;
  onShowKits: () => void;
  onShowLibrary: () => void;
  onNewChat: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isTaskFilterActive: boolean;
  hasUnreadCompletedTasks: boolean;
  onToggleTaskFilter: () => void;
  onTaskFilterSummaryChange: (hasUnreadCompletedTasks: boolean) => void;
  onWidthChange?: (width: number) => void;
  updateNotice?: React.ReactNode;
  /** Kept for the caller; the sidebar no longer carries a promo banner. */
  hideAdBanner?: boolean;
  hideLogin?: boolean;
  isEngineStartupOverlayVisible?: boolean;
}

/** The sidebar is 298px in the design; dragging it under the minimum closes it. */
export const DEFAULT_SIDEBAR_WIDTH = 298;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 420;
const SIDEBAR_COLLAPSE_TRANSITION_MS = 200;
/** On macOS the traffic lights sit at (12, 20); the search box starts under them. */
const MAC_TRAFFIC_LIGHTS_HEIGHT = 40;

const SidebarStoreKey = {
  Width: 'sidebar.width',
} as const;

const normalizeAgentId = (agentId?: string | null) => agentId?.trim() || AgentId.Main;

type SidebarAnalyticsSource = 'home_sidebar' | 'home_agent_sidebar';

interface SidebarAnalyticsOptions {
  activeView?: SidebarProps['activeView'];
  agentType?: 'main' | 'custom';
  hasActiveSubagent?: boolean;
  isCollapsed?: boolean;
  isCurrentSession?: boolean;
  isCurrentSubagent?: boolean;
  isExpanded?: boolean;
  isPinned?: boolean;
  isSelectAllChecked?: boolean;
  result?: 'success' | 'failed';
  selectedCount?: number;
  selectedSessionCount?: number;
  selectedSubagentCount?: number;
  selectableCount?: number;
  source?: SidebarAnalyticsSource;
  subagentStatus?: string;
  targetPinned?: boolean;
  targetSelected?: boolean;
  taskStatus?: string;
  visibleTaskCount?: number;
}

const reportSidebarAction = (
  actionType: string,
  options: SidebarAnalyticsOptions = {},
): void => {
  console.debug('[Sidebar] reporting sidebar action analytics');
  void reportYdAnalyzer({
    action: LogReporterAction.SidebarAction,
    source: options.source ?? 'home_sidebar',
    actionType,
    activeView: options.activeView,
    agentType: options.agentType,
    hasActiveSubagent: options.hasActiveSubagent,
    isCollapsed: options.isCollapsed,
    isCurrentSession: options.isCurrentSession,
    isCurrentSubagent: options.isCurrentSubagent,
    isExpanded: options.isExpanded,
    isPinned: options.isPinned,
    isSelectAllChecked: options.isSelectAllChecked,
    result: options.result,
    selectedCount: options.selectedCount,
    selectedSessionCount: options.selectedSessionCount,
    selectedSubagentCount: options.selectedSubagentCount,
    selectableCount: options.selectableCount,
    subagentStatus: options.subagentStatus,
    targetPinned: options.targetPinned,
    targetSelected: options.targetSelected,
    taskStatus: options.taskStatus,
    visibleTaskCount: options.visibleTaskCount,
  });
};

const writeSidebarRendererLog = (
  level: 'debug' | 'warn',
  message: string,
  error?: unknown,
): void => {
  try {
    window.electron?.log?.fromRenderer?.(level, 'Sidebar', message);
  } catch (logError) {
    const logErrorMessage = logError instanceof Error ? logError.message : String(logError);
    console.debug(`[Sidebar] renderer log unavailable: ${logErrorMessage}`, error);
  }
};

const logTaskSearchRequest = (
  source: CoworkTaskSearchRequestSource,
  activeView: SidebarProps['activeView'],
): void => {
  try {
    const message = `task search requested source=${source} activeView=${activeView} platform=${window.electron?.platform ?? 'unknown'}`;
    console.debug(`[Sidebar] ${message}`);
    writeSidebarRendererLog('debug', message);
  } catch (error) {
    // Task search must remain available when renderer diagnostic logging fails.
    console.debug('[Sidebar] task search diagnostic logging unavailable:', error);
  }
};

const clampSidebarWidth = (width: number): number => (
  Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)))
);

const readSearchShortcut = (): string => (
  configService.getConfig().shortcuts?.[ShortcutAction.Search] ?? ''
);

/**
 * The sidebar (docs/maties/design.md, section 3): the search box with its
 * shortcut pill, the five rows, « MY AGENTS », one card per agent with its
 * conversations, and the person at the bottom.
 */
const Sidebar: React.FC<SidebarProps> = ({
  onShowSettings,
  activeView,
  onShowSkills,
  onShowCowork,
  onShowScheduledTasks,
  onShowKits,
  onShowLibrary,
  onNewChat,
  isCollapsed,
  onToggleCollapse,
  isTaskFilterActive,
  onTaskFilterSummaryChange,
  onWidthChange,
  updateNotice,
  hideLogin,
}) => {
  const currentAgentId = useSelector((state: RootState) => state.agent.currentAgentId);
  const agents = useSelector((state: RootState) => state.agent.agents);
  const sessions = useSelector(selectCoworkSessions);
  const currentSessionId = useSelector(selectCurrentSessionId);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchAgentId, setBatchAgentId] = useState<string | null>(null);
  const [batchSelectableItems, setBatchSelectableItems] = useState<AgentSidebarBatchItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [deletedSessionIds, setDeletedSessionIds] = useState<string[]>([]);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [searchShortcut, setSearchShortcut] = useState(readSearchShortcut);
  const isResizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);
  const onWidthChangeRef = useRef(onWidthChange);
  onWidthChangeRef.current = onWidthChange;
  const isMac = window.electron.platform === 'darwin';
  const searchShortcutLabel = formatShortcutGlyphs(searchShortcut, isMac);
  const batchSelectableKeySet = useMemo(
    () => new Set(batchSelectableItems.map((item) => item.key)),
    [batchSelectableItems],
  );
  const batchSelectableItemByKey = useMemo(() => {
    const itemByKey = new Map<string, AgentSidebarBatchItem>();
    batchSelectableItems.forEach((item) => itemByKey.set(item.key, item));
    return itemByKey;
  }, [batchSelectableItems]);
  const selectedBatchSelectableCount = useMemo(() => {
    return batchSelectableItems.filter((item) => selectedKeys.has(item.key)).length;
  }, [batchSelectableItems, selectedKeys]);
  const isBatchSelectAllChecked =
    batchSelectableItems.length > 0 && selectedBatchSelectableCount === batchSelectableItems.length;
  const batchAgentName = batchAgentId ? getAgentDisplayNameById(batchAgentId, agents) : null;
  const getBatchSelectionSummary = useCallback(() => {
    const selectedItems = Array.from(selectedKeys)
      .filter((key) => batchSelectableKeySet.size === 0 || batchSelectableKeySet.has(key))
      .map((key) => batchSelectableItemByKey.get(key))
      .filter((item): item is AgentSidebarBatchItem => Boolean(item));
    const selectedSessionCount = selectedItems.filter(
      (item) => item.kind === AgentSidebarBatchItemKind.Session,
    ).length;
    return {
      selectedCount: selectedItems.length,
      selectedSessionCount,
      selectedSubagentCount: 0,
      selectableCount: batchSelectableItems.length,
    };
  }, [batchSelectableItemByKey, batchSelectableItems.length, batchSelectableKeySet, selectedKeys]);

  // The chosen width is remembered across launches.
  useEffect(() => {
    let isCurrent = true;
    const loadStoredWidth = async () => {
      try {
        const storedWidth = await window.electron.store.get(SidebarStoreKey.Width);
        if (!isCurrent || typeof storedWidth !== 'number' || !Number.isFinite(storedWidth)) return;
        const width = clampSidebarWidth(storedWidth);
        setSidebarWidth(width);
        onWidthChangeRef.current?.(width);
      } catch (error) {
        console.warn('[Sidebar] failed to load the remembered sidebar width:', error);
      }
    };
    void loadStoredWidth();
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    const syncShortcut = () => setSearchShortcut(readSearchShortcut());
    window.addEventListener(ConfigServiceEvent.Updated, syncShortcut);
    return () => window.removeEventListener(ConfigServiceEvent.Updated, syncShortcut);
  }, []);

  const openTaskSearch = useCallback((source: CoworkTaskSearchRequestSource) => {
    logTaskSearchRequest(source, activeView);
    onShowCowork();
    setIsSearchOpen(true);
  }, [activeView, onShowCowork]);

  useEffect(() => {
    const handleSearch = (event: Event) => {
      const detail = (event as CustomEvent<CoworkTaskSearchRequestEventDetail>).detail;
      openTaskSearch(detail?.source ?? CoworkTaskSearchRequestSource.UiEvent);
    };
    window.addEventListener(CoworkUiEvent.ShortcutSearch, handleSearch);
    return () => {
      window.removeEventListener(CoworkUiEvent.ShortcutSearch, handleSearch);
    };
  }, [openTaskSearch]);

  useEffect(() => {
    if (!isCollapsed) return;
    setIsSearchOpen(false);
    setIsBatchMode(false);
    setBatchAgentId(null);
    setBatchSelectableItems([]);
    setSelectedKeys(new Set());
    setShowBatchDeleteConfirm(false);
  }, [isCollapsed]);

  const handleSelectSession = async (session: CoworkSessionSummary) => {
    const agentId = session.agentId?.trim() || AgentId.Main;
    try {
      if (agentId !== currentAgentId) {
        agentService.switchAgent(agentId, { targetSessionId: session.id });
        await coworkService.loadSessions(agentId);
      }
      onShowCowork();
      await coworkService.loadSession(session.id);
    } finally {
      coworkService.finishSessionNavigation(session.id);
    }
  };

  const handleEnterBatchMode = useCallback((sessionId: string, agentId: string) => {
    reportSidebarAction('batch_mode_enter', {
      source: 'home_agent_sidebar',
      agentType: normalizeAgentId(agentId) === AgentId.Main ? 'main' : 'custom',
      selectedCount: 1,
    });
    setIsBatchMode(true);
    setBatchAgentId(agentId);
    setBatchSelectableItems([]);
    setSelectedKeys(new Set([createSessionBatchKey(sessionId)]));
  }, []);

  const handleExitBatchMode = useCallback(() => {
    reportSidebarAction('batch_mode_exit', {
      source: 'home_agent_sidebar',
      agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
      ...getBatchSelectionSummary(),
    });
    setIsBatchMode(false);
    setBatchAgentId(null);
    setBatchSelectableItems([]);
    setSelectedKeys(new Set());
    setShowBatchDeleteConfirm(false);
  }, [batchAgentId, getBatchSelectionSummary]);

  const handleBatchSelectableItemsChange = useCallback((items: AgentSidebarBatchItem[]) => {
    setBatchSelectableItems(items);
    setSelectedKeys((previous) => {
      if (!batchAgentId || items.length === 0) return previous;
      const itemKeySet = new Set(items.map((item) => item.key));
      const next = new Set(Array.from(previous).filter((key) => itemKeySet.has(key)));
      return next.size === previous.size ? previous : next;
    });
  }, [batchAgentId]);

  const handleToggleSelection = useCallback((selectionKey: string, agentId: string) => {
    if (batchAgentId && normalizeAgentId(agentId) !== batchAgentId) return;
    setSelectedKeys(prev => {
      const next = new Set(prev);
      const targetSelected = !next.has(selectionKey);
      if (next.has(selectionKey)) {
        next.delete(selectionKey);
      } else {
        next.add(selectionKey);
      }
      reportSidebarAction('batch_item_toggle', {
        source: 'home_agent_sidebar',
        agentType: normalizeAgentId(agentId) === AgentId.Main ? 'main' : 'custom',
        selectedCount: next.size,
        selectableCount: batchSelectableItems.length,
        targetSelected,
      });
      return next;
    });
  }, [batchAgentId, batchSelectableItems.length]);

  const handleSelectAll = useCallback(() => {
    if (batchSelectableItems.length === 0) return;
    setSelectedKeys(prev => {
      const selectedVisibleCount = batchSelectableItems.filter((item) => prev.has(item.key)).length;
      if (selectedVisibleCount === batchSelectableItems.length) {
        reportSidebarAction('batch_select_all_toggle', {
          source: 'home_agent_sidebar',
          agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
          selectedCount: 0,
          selectableCount: batchSelectableItems.length,
          isSelectAllChecked: false,
        });
        return new Set();
      }
      reportSidebarAction('batch_select_all_toggle', {
        source: 'home_agent_sidebar',
        agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
        selectedCount: batchSelectableItems.length,
        selectableCount: batchSelectableItems.length,
        isSelectAllChecked: true,
      });
      return new Set(batchSelectableItems.map((item) => item.key));
    });
  }, [batchAgentId, batchSelectableItems]);

  const handleBatchDeleteClick = useCallback(() => {
    if (selectedKeys.size === 0) return;
    reportSidebarAction('batch_delete_confirm_open', {
      source: 'home_agent_sidebar',
      agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
      ...getBatchSelectionSummary(),
    });
    setShowBatchDeleteConfirm(true);
  }, [batchAgentId, getBatchSelectionSummary, selectedKeys.size]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedKeys.size === 0) return;
    const items = Array.from(selectedKeys)
      .filter((key) => batchSelectableKeySet.size === 0 || batchSelectableKeySet.has(key))
      .map((key) => batchSelectableItemByKey.get(key))
      .filter((item): item is AgentSidebarBatchItem => Boolean(item));
    if (items.length === 0) return;

    const sessionIds = items
      .filter((item) => item.kind === AgentSidebarBatchItemKind.Session)
      .map((item) => item.sessionId);
    const selectedSessionCount = sessionIds.length;

    reportSidebarAction('batch_delete_submit', {
      source: 'home_agent_sidebar',
      agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
      selectedCount: items.length,
      selectedSessionCount,
      selectedSubagentCount: 0,
      selectableCount: batchSelectableItems.length,
    });

    let deletedSessions = false;
    if (sessionIds.length > 0) {
      deletedSessions = await coworkService.deleteSessions(sessionIds);
    }

    if (!deletedSessions) {
      reportSidebarAction('batch_delete_failed', {
        source: 'home_agent_sidebar',
        agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
        result: 'failed',
        selectedCount: items.length,
        selectedSessionCount,
        selectedSubagentCount: 0,
        selectableCount: batchSelectableItems.length,
      });
      return;
    }
    reportSidebarAction('batch_delete_success', {
      source: 'home_agent_sidebar',
      agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
      result: 'success',
      selectedCount: items.length,
      selectedSessionCount,
      selectedSubagentCount: 0,
      selectableCount: batchSelectableItems.length,
    });
    setDeletedSessionIds(sessionIds);
    handleExitBatchMode();
  }, [
    batchAgentId,
    batchSelectableItemByKey,
    batchSelectableItems.length,
    batchSelectableKeySet,
    selectedKeys,
    handleExitBatchMode,
  ]);

  const persistSidebarWidth = useCallback((width: number) => {
    void window.electron.store.set(SidebarStoreKey.Width, width).catch((error: unknown) => {
      console.warn('[Sidebar] failed to remember the sidebar width:', error);
    });
  }, []);

  const handleResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (isCollapsed) return;
    event.preventDefault();
    isResizingRef.current = true;
    setIsResizing(true);
    resizeStartXRef.current = event.clientX;
    resizeStartWidthRef.current = sidebarWidth;
    document.body.classList.add('select-none');
    let latestWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const nextWidth = resizeStartWidthRef.current + moveEvent.clientX - resizeStartXRef.current;
      if (nextWidth < MIN_SIDEBAR_WIDTH) {
        isResizingRef.current = false;
        setIsResizing(false);
        document.body.classList.remove('select-none');
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        onToggleCollapse();
        return;
      }
      latestWidth = clampSidebarWidth(nextWidth);
      setSidebarWidth(latestWidth);
      onWidthChange?.(latestWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      setIsResizing(false);
      document.body.classList.remove('select-none');
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      persistSidebarWidth(latestWidth);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [isCollapsed, onToggleCollapse, onWidthChange, persistSidebarWidth, sidebarWidth]);

  useEffect(() => {
    return () => {
      document.body.classList.remove('select-none');
    };
  }, []);

  const navigationRows: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    isActive: boolean;
    onboardingTarget?: string;
    onClick: () => void;
  }> = [
    {
      key: 'new-task',
      label: i18nService.t('newChat'),
      icon: <PencilLineIcon />,
      isActive: false,
      onboardingTarget: 'new-task',
      onClick: () => {
        reportSidebarAction('new_task', { activeView, isCollapsed });
        onNewChat();
      },
    },
    {
      key: 'scheduled-tasks',
      label: i18nService.t('scheduledTasks'),
      icon: <ClockLineIcon />,
      isActive: activeView === 'scheduledTasks',
      onClick: () => {
        reportSidebarAction('open_scheduled_tasks', { activeView, isCollapsed });
        setIsSearchOpen(false);
        onShowScheduledTasks();
      },
    },
    {
      key: 'kits',
      label: i18nService.t('kits'),
      icon: <SquaresLineIcon />,
      isActive: activeView === 'kits',
      onClick: () => {
        reportSidebarAction('open_kits', { activeView, isCollapsed });
        setIsSearchOpen(false);
        onShowKits();
      },
    },
    {
      key: 'skills',
      label: i18nService.t('skillsAndConnectors'),
      icon: <PuzzleLineIcon />,
      isActive: activeView === 'skills' || activeView === 'mcp',
      onClick: () => {
        reportSidebarAction('open_skills', { activeView, isCollapsed });
        setIsSearchOpen(false);
        onShowSkills();
      },
    },
    {
      key: 'library',
      label: i18nService.t('librarySidebarTitle'),
      icon: <BooksLineIcon />,
      isActive: activeView === 'library',
      onClick: () => {
        reportSidebarAction('open_library', { activeView, isCollapsed });
        setIsSearchOpen(false);
        onShowLibrary();
      },
    },
  ];

  return (
    <aside
      data-skin-sidebar="true"
      className={`relative shrink-0 overflow-hidden bg-[#fdfdfd] ${
        isResizing ? '' : 'sidebar-transition'
      }`}
      style={{
        width: isCollapsed ? 0 : sidebarWidth,
        borderRight: isCollapsed ? undefined : '.5px solid #f0eff1',
      }}
    >
      <div
        className={`flex h-full flex-col transition-opacity ease-out ${
          isCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
        style={{
          width: sidebarWidth,
          transitionDuration: `${SIDEBAR_COLLAPSE_TRANSITION_MS}ms`,
        }}
      >
        {isMac && (
          <div
            className="draggable sidebar-header-drag shrink-0"
            style={{ height: MAC_TRAFFIC_LIGHTS_HEIGHT }}
            aria-hidden="true"
          />
        )}
        <div className={`flex min-h-0 flex-1 flex-col px-[14px] pb-[18px] ${isMac ? 'pt-0' : 'pt-4'}`}>
          <button
            type="button"
            onClick={() => {
              reportSidebarAction('open_search', { activeView, isCollapsed });
              openTaskSearch(CoworkTaskSearchRequestSource.SidebarHeader);
            }}
            className="non-draggable mb-[14px] flex w-full shrink-0 cursor-pointer items-center gap-[10px] rounded-[11px] border border-[rgba(16,22,35,.06)] bg-[#f6f7f9] px-[11px] py-[9px] text-left text-[14.5px] tracking-[-.008em] text-[#8f96a0] transition-colors hover:bg-[#f1f2f5]"
            aria-label={i18nService.t('search')}
            aria-keyshortcuts={searchShortcutLabel || undefined}
          >
            <span className="flex text-[#9aa1ab]"><SearchLineIcon /></span>
            <span className="min-w-0 flex-1 truncate">{i18nService.t('sidebarSearchChats')}</span>
            {searchShortcutLabel && (
              <span className="maties-kbd shrink-0" aria-hidden="true">{searchShortcutLabel}</span>
            )}
          </button>

          <div className="scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-y-auto pt-[6px]">
            <div className="shrink-0" role="navigation">
              {navigationRows.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  data-onboarding-target={row.onboardingTarget}
                  onClick={row.onClick}
                  className="maties-sidebar-row shrink-0"
                  aria-current={row.isActive ? 'page' : undefined}
                >
                  <span className="flex text-[#6b7280]">{row.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                </button>
              ))}
            </div>

            <MyAgentSidebarTree
              isBatchMode={isBatchMode}
              batchAgentId={batchAgentId}
              deletedSessionIds={deletedSessionIds}
              selectedKeys={selectedKeys}
              isTaskFilterActive={isTaskFilterActive}
              onShowCowork={onShowCowork}
              onTaskFilterSummaryChange={onTaskFilterSummaryChange}
              onTaskSelected={(params) => {
                console.debug('[Sidebar] reporting agent sidebar task selection analytics');
                void reportYdAnalyzer({
                  action: LogReporterAction.SidebarAction,
                  source: 'home_agent_sidebar',
                  actionType: 'select_task',
                  activeView,
                  ...params,
                });
              }}
              onSidebarAction={(actionType, params) => {
                reportSidebarAction(actionType, {
                  source: 'home_agent_sidebar',
                  ...params,
                });
              }}
              onToggleSelection={handleToggleSelection}
              onEnterBatchMode={handleEnterBatchMode}
              onBatchSelectableItemsChange={handleBatchSelectableItemsChange}
            />
          </div>

          {!isBatchMode && updateNotice && (
            <div className="non-draggable shrink-0 pt-2">{updateNotice}</div>
          )}

          {isBatchMode ? (
            <div className="mt-2 shrink-0 border-t-[.5px] border-[#f0eff1] pt-3">
              <div className="mb-2 flex min-w-0 items-center justify-between gap-2 px-1">
                <span className="min-w-0 truncate text-[12.5px] text-[#8f96a0]">
                  {i18nService
                    .t('batchSelectionScope')
                    .replace('{agent}', batchAgentName ?? '')
                    .replace('{count}', String(selectedKeys.size))}
                </span>
                <button
                  type="button"
                  onClick={handleExitBatchMode}
                  className="shrink-0 rounded-[7px] px-1.5 py-1 text-[12.5px] font-medium text-[#4a4f57] transition-colors hover:bg-[rgba(16,20,28,.05)]"
                >
                  {i18nService.t('batchCancel')}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-[9px] px-2 text-[13.5px] text-[#31353b] transition-colors hover:bg-[rgba(16,20,28,.05)]">
                  <input
                    type="checkbox"
                    checked={isBatchSelectAllChecked}
                    onChange={handleSelectAll}
                    disabled={batchSelectableItems.length === 0}
                    className="h-3.5 w-3.5 shrink-0 rounded border-[#c9ccd2] accent-[#0060d0] disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <span className="truncate">{i18nService.t('batchSelectAll')}</span>
                </label>
                <Pill
                  compact
                  tone={PillTone.Primary}
                  onClick={handleBatchDeleteClick}
                  disabled={selectedKeys.size === 0}
                  className="!bg-[#e0322d] hover:!bg-[#c92b27]"
                >
                  {i18nService.t('batchDelete')} ({selectedKeys.size})
                </Pill>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex shrink-0 items-center gap-[11px] border-t-[.5px] border-[#f0eff1] pl-1 pr-1 pt-3">
              {!hideLogin ? (
                <LoginButton
                  variant={LoginButtonVariant.SidebarRow}
                  contentLeftOffset={isCollapsed ? 0 : sidebarWidth}
                />
              ) : (
                <span className="min-h-[34px] min-w-0 flex-1" />
              )}
              <button
                type="button"
                onClick={() => onShowSettings()}
                className="non-draggable flex shrink-0 cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent p-[6px] text-[#9aa1ab] transition-colors hover:bg-[rgba(16,20,28,.05)] hover:text-[#4a4f57]"
                aria-label={i18nService.t('settings')}
                title={i18nService.t('settings')}
              >
                <GearLineIcon />
              </button>
            </div>
          )}
        </div>
      </div>
      {!isCollapsed && (
        <div
          className="non-draggable absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-[rgba(0,96,208,.25)] active:bg-[rgba(0,96,208,.4)]"
          onMouseDown={handleResizeStart}
        />
      )}
      <CoworkSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
      />
      {showBatchDeleteConfirm && (
        <Modal
          onClose={() => {
            reportSidebarAction('batch_delete_cancel', {
              source: 'home_agent_sidebar',
              agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
              ...getBatchSelectionSummary(),
            });
            setShowBatchDeleteConfirm(false);
          }}
          className="mx-4 w-full max-w-sm overflow-hidden rounded-[20px] bg-white shadow-[0_1px_2px_rgba(16,22,35,.05),0_12px_32px_rgba(16,22,35,.09)]"
        >
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="rounded-full bg-[#fdecec] p-2">
              <ExclamationTriangleIcon className="h-5 w-5 text-[#e0322d]" />
            </div>
            <h2 className="text-[15px] font-medium text-[#1c1f23]">
              {i18nService.t('batchDeleteConfirmTitle')}
            </h2>
          </div>
          <div className="px-5 pb-4">
            <p className="text-[13.5px] text-[#4a4f57]">
              {i18nService
                .t('batchDeleteConfirmMessage')
                .replace('{count}', String(selectedKeys.size))}
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[rgba(16,22,35,.07)] px-5 py-4">
            <button
              onClick={() => {
                reportSidebarAction('batch_delete_cancel', {
                  source: 'home_agent_sidebar',
                  agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
                  ...getBatchSelectionSummary(),
                });
                setShowBatchDeleteConfirm(false);
              }}
              className="rounded-full px-4 py-2 text-[13.5px] font-medium text-[#4a4f57] transition-colors hover:bg-[rgba(16,20,28,.05)]"
            >
              {i18nService.t('cancel')}
            </button>
            <button
              onClick={handleBatchDelete}
              className="rounded-full bg-[#e0322d] px-4 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-[#c92b27]"
            >
              {i18nService.t('batchDelete')} ({selectedKeys.size})
            </button>
          </div>
        </Modal>
      )}
    </aside>
  );
};

export default Sidebar;
