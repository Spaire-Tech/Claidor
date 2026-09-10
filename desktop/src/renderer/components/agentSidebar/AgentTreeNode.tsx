import React, { useCallback, useEffect, useRef, useState } from 'react';

import { i18nService } from '../../services/i18n';
import { getAgentDisplayName, isDefaultAgentId, shouldUseDefaultAgentIcon } from '../../utils/agentDisplay';
import AgentAvatarIcon from '../agent/AgentAvatarIcon';
import AgentConfirmDialog from '../agent/AgentConfirmDialog';
import { AgentConfirmDialogVariant } from '../agent/constants';
import { BriefcaseLineIcon, EllipsisLineIcon, PencilLineIcon } from '../design/LineIcons';
import EditIcon from '../icons/EditIcon';
import PushPinIcon from '../icons/PushPinIcon';
import TrashIcon from '../icons/TrashIcon';
import AgentTaskRow from './AgentTaskRow';
import { createSessionBatchKey } from './batchSelection';
import ExpandAgentTasksRow from './ExpandAgentTasksRow';
import type { AgentSidebarAgentNode, AgentSidebarTaskNode } from './types';

interface AgentTreeNodeProps {
  agent: AgentSidebarAgentNode;
  isBatchMode: boolean;
  batchAgentId: string | null;
  selectedKeys: Set<string>;
  showBatchOption?: boolean;
  onToggleExpanded: (agentId: string) => void;
  onEditAgent: (agent: AgentSidebarAgentNode) => void;
  onCreateTask: (agent: AgentSidebarAgentNode) => void;
  onDeleteAgent: (agent: AgentSidebarAgentNode) => Promise<void>;
  onToggleAgentPin: (agent: AgentSidebarAgentNode, pinned: boolean) => Promise<void>;
  onRetryLoadTasks: (agentId: string) => void;
  onLoadMoreTasks: (agentId: string) => void;
  onCollapseTasks: (agentId: string) => void;
  onSelectTask: (task: AgentSidebarTaskNode) => void;
  onDeleteTask: (task: AgentSidebarTaskNode) => Promise<void>;
  onShareTask: (task: AgentSidebarTaskNode) => Promise<void>;
  onToggleTaskPin: (task: AgentSidebarTaskNode, pinned: boolean) => Promise<void>;
  onRenameTask: (task: AgentSidebarTaskNode, title: string) => Promise<void>;
  onToggleSelection: (selectionKey: string, agentId: string) => void;
  onEnterBatchMode: (task: AgentSidebarTaskNode) => void;
  onSidebarAction?: (actionType: string, params?: {
    agentType?: 'main' | 'custom';
    hasActiveSubagent?: boolean;
    isCurrentSession?: boolean;
    isCurrentSubagent?: boolean;
    isExpanded?: boolean;
    isPinned?: boolean;
    subagentStatus?: string;
    targetPinned?: boolean;
    taskStatus?: string;
    visibleTaskCount?: number;
  }) => void;
  getTaskActionParams?: (task: AgentSidebarTaskNode, hasActiveSubagent?: boolean) => {
    agentType: 'main' | 'custom';
    hasActiveSubagent?: boolean;
    isCurrentSession: boolean;
    isPinned: boolean;
    taskStatus: string;
  };
}

const ACTION_MENU_VIEWPORT_PADDING = 8;
const ACTION_MENU_VERTICAL_GAP = 4;
// Three rows of 38px inside 6px of padding.
const ACTION_MENU_HEIGHT = 126;
const AGENT_TASKS_TRANSITION_MS = 200;
const MENU_ICON_CLASS_NAME = 'h-[15px] w-[15px] shrink-0 text-[#4a4f57]';
const CARD_SHADOW = '0 1px 2px rgba(16,22,35,.04), 0 6px 18px rgba(16,22,35,.06), inset 0 1px 0 rgba(255,255,255,.7)';
const QUIET_ROW_CLASS_NAME = 'flex w-full items-center px-[11px] py-2 text-left text-[13.5px] tracking-[-.006em] text-[#9aa1ab]';

/** The agent's icon at 17px: the founder's briefcase for the default agent, the agent's own otherwise. */
const AgentAvatar: React.FC<{ agent: AgentSidebarAgentNode }> = ({ agent }) => {
  if (shouldUseDefaultAgentIcon(agent)) {
    return <BriefcaseLineIcon size={17} className="text-[#6b7280]" />;
  }

  return (
    <AgentAvatarIcon
      value={agent.icon}
      className="h-[17px] w-[17px]"
      iconClassName="h-[17px] w-[17px]"
      legacyClassName="text-[15px]"
      fallbackText={getAgentDisplayName(agent).trim().slice(0, 1).toUpperCase() || 'A'}
    />
  );
};

/**
 * One white card per agent with the resting shadow, and under the open
 * agent its conversations (docs/maties/design.md, section 3, row 4).
 */
const AgentTreeNode: React.FC<AgentTreeNodeProps> = ({
  agent,
  isBatchMode,
  batchAgentId,
  selectedKeys,
  showBatchOption = false,
  onToggleExpanded,
  onEditAgent,
  onCreateTask,
  onDeleteAgent,
  onToggleAgentPin,
  onRetryLoadTasks,
  onLoadMoreTasks,
  onCollapseTasks,
  onSelectTask,
  onDeleteTask,
  onShareTask,
  onToggleTaskPin,
  onRenameTask,
  onToggleSelection,
  onEnterBatchMode,
  onSidebarAction,
  getTaskActionParams,
}) => {
  const [menuPosition, setMenuPosition] = useState<{ right: number; top: number } | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [shouldRenderTasks, setShouldRenderTasks] = useState(agent.isExpanded);
  const [isTaskGroupVisible, setIsTaskGroupVisible] = useState(agent.isExpanded);
  const [isTaskGroupTransitioning, setIsTaskGroupTransitioning] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const previousExpandedRef = useRef(agent.isExpanded);
  const isMenuOpen = menuPosition !== null;
  const isMainAgent = isDefaultAgentId(agent.id);
  const isBatchAgent = isBatchMode && batchAgentId === agent.id;
  const isOutsideBatchAgent = isBatchMode && batchAgentId !== null && batchAgentId !== agent.id;
  const agentName = getAgentDisplayName(agent);
  const hasVisibleTasks = agent.tasks.length > 0;
  const visibleItems = [
    ...agent.tasks.map((task) => ({
      kind: 'session' as const,
      id: `session:${task.id}`,
      timestamp: task.updatedAt || task.createdAt,
      pinned: task.pinned,
      task,
    })),
  ].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.timestamp - a.timestamp;
  });
  const rowActionButtonClassName =
    'inline-flex h-6 w-6 items-center justify-center rounded-[7px] text-[#6b7280] transition-colors hover:bg-[rgba(16,20,28,.06)] hover:text-[#1c1f23]';

  const calculateMenuPosition = useCallback(() => {
    const rect = menuButtonRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const right = Math.max(ACTION_MENU_VIEWPORT_PADDING, window.innerWidth - rect.right);
    const top = Math.max(
      ACTION_MENU_VIEWPORT_PADDING,
      Math.min(
        rect.bottom + ACTION_MENU_VERTICAL_GAP,
        window.innerHeight - ACTION_MENU_HEIGHT - ACTION_MENU_VIEWPORT_PADDING,
      ),
    );

    return { right, top };
  }, []);

  const closeMenu = useCallback(() => {
    setMenuPosition(null);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !menuButtonRef.current?.contains(target)) {
        closeMenu();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closeMenu, isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const updateMenuPosition = () => {
      const position = calculateMenuPosition();
      if (position) {
        setMenuPosition(position);
      } else {
        closeMenu();
      }
    };
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [calculateMenuPosition, closeMenu, isMenuOpen]);

  useEffect(() => {
    let animationFrame: number | undefined;
    let transitionTimeout: number | undefined;
    const wasExpanded = previousExpandedRef.current;

    previousExpandedRef.current = agent.isExpanded;

    if (wasExpanded === agent.isExpanded) {
      return undefined;
    }

    if (agent.isExpanded) {
      setShouldRenderTasks(true);
      setIsTaskGroupVisible(false);
      setIsTaskGroupTransitioning(true);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = window.requestAnimationFrame(() => {
          setIsTaskGroupVisible(true);
          transitionTimeout = window.setTimeout(() => {
            setIsTaskGroupTransitioning(false);
          }, AGENT_TASKS_TRANSITION_MS);
        });
      });
    } else {
      setIsTaskGroupTransitioning(true);
      setIsTaskGroupVisible(false);
      transitionTimeout = window.setTimeout(() => {
        setShouldRenderTasks(false);
        setIsTaskGroupTransitioning(false);
      }, AGENT_TASKS_TRANSITION_MS);
    }

    return () => {
      if (animationFrame !== undefined) {
        window.cancelAnimationFrame(animationFrame);
      }
      if (transitionTimeout !== undefined) {
        window.clearTimeout(transitionTimeout);
      }
    };
  }, [agent.isExpanded]);

  const handleEditAgent = (event: React.MouseEvent) => {
    event.stopPropagation();
    closeMenu();
    onEditAgent(agent);
  };

  const handleCreateTask = (event: React.MouseEvent) => {
    event.stopPropagation();
    closeMenu();
    onCreateTask(agent);
  };

  const handleAgentClick = (event: React.MouseEvent) => {
    onSidebarAction?.('agent_header_click', {
      agentType: isMainAgent ? 'main' : 'custom',
      isExpanded: agent.isExpanded,
      isPinned: agent.pinned,
    });
    onToggleExpanded(agent.id);
    handleCreateTask(event);
  };

  const handleDeleteMenuClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (isMainAgent) return;
    closeMenu();
    onSidebarAction?.('agent_delete_confirm_open', {
      agentType: 'custom',
      isExpanded: agent.isExpanded,
      isPinned: agent.pinned,
    });
    setShowConfirmDelete(true);
  };

  const handleToggleAgentPin = (event: React.MouseEvent) => {
    event.stopPropagation();
    closeMenu();
    void onToggleAgentPin(agent, !agent.pinned);
  };

  return (
    <div className="mb-[2px]">
      <div className={`group relative ${isMenuOpen ? 'z-50' : 'z-10'}`}>
        <button
          type="button"
          onClick={handleAgentClick}
          className="flex w-full items-center gap-[11px] rounded-[11px] border border-[rgba(255,255,255,.6)] bg-white py-[10px] pl-[11px] pr-[60px] text-left text-[14.5px] tracking-[-.008em] text-[#1c1f23] transition-shadow hover:shadow-[0_1px_2px_rgba(16,22,35,.05),0_8px_22px_rgba(16,22,35,.08),inset_0_1px_0_rgba(255,255,255,.7)]"
          style={{ boxShadow: CARD_SHADOW }}
          role="treeitem"
          aria-level={1}
          aria-expanded={agent.isExpanded}
        >
          <span className="flex h-[17px] w-[17px] shrink-0 items-center justify-center leading-none">
            <AgentAvatar agent={agent} />
          </span>
          <span className="min-w-0 flex-1 truncate">
            {agentName}
          </span>
        </button>

        <div
          className={`absolute right-[9px] top-1/2 flex -translate-y-1/2 items-center gap-0.5 transition-opacity ${
            isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          }`}
        >
          <button
            ref={menuButtonRef}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (isMenuOpen) {
                closeMenu();
                return;
              }
              const position = calculateMenuPosition();
              if (position) {
                onSidebarAction?.('agent_menu_open', {
                  agentType: isMainAgent ? 'main' : 'custom',
                  isExpanded: agent.isExpanded,
                  isPinned: agent.pinned,
                });
                setMenuPosition(position);
              }
            }}
            className={rowActionButtonClassName}
            aria-label={i18nService.t('coworkSessionActions')}
          >
            <EllipsisLineIcon size={16} />
          </button>
          <button
            type="button"
            onClick={handleCreateTask}
            className={rowActionButtonClassName}
            aria-label={i18nService.t('myAgentSidebarNewTask')}
            title={i18nService.t('myAgentSidebarNewTask')}
          >
            <PencilLineIcon size={15} />
          </button>
        </div>

        {menuPosition && (
          <div
            ref={menuRef}
            className="maties-menu fixed z-[60] w-[180px] max-w-[calc(100vw-16px)]"
            style={{ top: menuPosition.top, right: menuPosition.right }}
            role="menu"
          >
            <button
              type="button"
              onClick={handleEditAgent}
              className="maties-menu-item"
              role="menuitem"
            >
              <EditIcon className={MENU_ICON_CLASS_NAME} />
              {i18nService.t('edit')}
            </button>
            <button
              type="button"
              onClick={handleToggleAgentPin}
              className="maties-menu-item"
              role="menuitem"
            >
              <PushPinIcon slashed={agent.pinned} className={MENU_ICON_CLASS_NAME} />
              {agent.pinned ? i18nService.t('agentUnpin') : i18nService.t('agentPin')}
            </button>
            {isMainAgent ? (
              <button
                type="button"
                disabled
                className="maties-menu-item"
                role="menuitem"
                title={i18nService.t('agentDefaultCannotDelete')}
              >
                <TrashIcon className={MENU_ICON_CLASS_NAME} />
                {i18nService.t('delete')}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDeleteMenuClick}
                className="maties-menu-item"
                data-danger="true"
                role="menuitem"
              >
                <TrashIcon className="h-[15px] w-[15px] shrink-0" />
                {i18nService.t('delete')}
              </button>
            )}
          </div>
        )}

        {showConfirmDelete && (
          <AgentConfirmDialog
            variant={AgentConfirmDialogVariant.Delete}
            title={i18nService.t('agentDeleteConfirmTitle')}
            message={i18nService.t('agentDeleteConfirmMessage').replace('{name}', agentName)}
            cancelLabel={i18nService.t('cancel')}
            confirmLabel={i18nService.t('delete')}
            onCancel={() => {
              onSidebarAction?.('agent_delete_cancel', {
                agentType: 'custom',
                isExpanded: agent.isExpanded,
                isPinned: agent.pinned,
              });
              setShowConfirmDelete(false);
            }}
            onConfirm={() => {
              onSidebarAction?.('agent_delete_submit', {
                agentType: 'custom',
                isExpanded: agent.isExpanded,
                isPinned: agent.pinned,
              });
              setShowConfirmDelete(false);
              void onDeleteAgent(agent);
            }}
          />
        )}
      </div>

      {shouldRenderTasks && (
        <div
          className={`grid w-full min-w-0 max-w-full transition-all duration-200 ease-out motion-reduce:transition-none ${
            isTaskGroupVisible ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div
            className={`min-h-0 min-w-0 max-w-full ${
              isTaskGroupVisible && !isTaskGroupTransitioning ? 'overflow-visible' : 'overflow-hidden'
            } ${isTaskGroupVisible ? '' : 'pointer-events-none'}`}
            role="group"
            aria-hidden={!agent.isExpanded}
          >
            <div className="min-w-0 max-w-full space-y-[2px] pt-[6px]">
              {agent.hasLoadError && !hasVisibleTasks && (
                <button
                  type="button"
                  onClick={() => onRetryLoadTasks(agent.id)}
                  className={`${QUIET_ROW_CLASS_NAME} rounded-[9px] !text-[#e0322d] transition-colors hover:bg-[rgba(224,50,45,.06)]`}
                >
                  {i18nService.t('myAgentSidebarLoadFailed')}
                </button>
              )}

              {agent.isLoadingTasks && !hasVisibleTasks && (
                <div className={QUIET_ROW_CLASS_NAME}>
                  {i18nService.t('loading')}
                </div>
              )}

              {!agent.isLoadingTasks && !agent.hasLoadError && !hasVisibleTasks && (
                <div className={QUIET_ROW_CLASS_NAME}>
                  {i18nService.t('myAgentSidebarNoTasks')}
                </div>
              )}

              {visibleItems.map((item) => (
                <AgentTaskRow
                  key={item.id}
                  task={item.task}
                  isBatchMode={isBatchAgent}
                  isSelected={selectedKeys.has(createSessionBatchKey(item.task.id))}
                  isSelectionDisabled={isOutsideBatchAgent}
                  showBatchOption={showBatchOption && !isBatchMode}
                  onSelect={() => onSelectTask(item.task)}
                  onDelete={() => onDeleteTask(item.task)}
                  onShare={() => onShareTask(item.task)}
                  onTogglePin={(pinned) => onToggleTaskPin(item.task, pinned)}
                  onRename={(title) => onRenameTask(item.task, title)}
                  onToggleSelection={() => onToggleSelection(createSessionBatchKey(item.task.id), item.task.agentId)}
                  onEnterBatchMode={() => onEnterBatchMode(item.task)}
                  onSidebarAction={onSidebarAction}
                  analyticsParams={getTaskActionParams?.(item.task)}
                />
              ))}

              {agent.hasLoadError && hasVisibleTasks && (
                <button
                  type="button"
                  onClick={() => onRetryLoadTasks(agent.id)}
                  className={`${QUIET_ROW_CLASS_NAME} rounded-[9px] !text-[#e0322d] transition-colors hover:bg-[rgba(224,50,45,.06)]`}
                >
                  {i18nService.t('myAgentSidebarLoadFailed')}
                </button>
              )}

              {(agent.canExpandTasks || agent.canCollapseTasks) && (
                <ExpandAgentTasksRow
                  isLoading={agent.isLoadingTasks}
                  label={agent.canExpandTasks
                    ? i18nService.t('myAgentSidebarExpandMore')
                    : i18nService.t('myAgentSidebarCollapse')}
                  onClick={() => {
                    if (agent.canExpandTasks) {
                      onLoadMoreTasks(agent.id);
                    } else {
                      onCollapseTasks(agent.id);
                    }
                  }}
                  secondaryLabel={agent.canExpandTasks && agent.canCollapseTasks
                    ? i18nService.t('myAgentSidebarCollapse')
                    : undefined}
                  onSecondaryClick={agent.canExpandTasks && agent.canCollapseTasks
                    ? () => onCollapseTasks(agent.id)
                    : undefined}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentTreeNode;
