import { ShareIcon } from '@heroicons/react/20/solid';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { i18nService } from '../../services/i18n';
import Modal from '../common/Modal';
import {
  getIMSessionDisplayTitle,
  getIMSessionPlatformIconClassName,
  getIMSessionPlatformLabel,
  getIMSessionPlatformLogo,
} from '../cowork/imSessionDisplay';
import { EllipsisLineIcon } from '../design/LineIcons';
import ClockIcon from '../icons/ClockIcon';
import EditIcon from '../icons/EditIcon';
import ListChecksIcon from '../icons/ListChecksIcon';
import LoadingIcon from '../icons/LoadingIcon';
import PushPinIcon from '../icons/PushPinIcon';
import TrashIcon from '../icons/TrashIcon';
import { AgentSidebarIndicator } from './constants';
import {
  getScheduledTaskDisplayTitle,
  hasLegacyScheduledTaskTitle,
} from './scheduledTaskSession';
import { formatAgentTaskRelativeTime } from './time';
import type { AgentSidebarTaskNode } from './types';

interface AgentTaskRowProps {
  task: AgentSidebarTaskNode;
  isBatchMode: boolean;
  isSelected: boolean;
  contextLabel?: string;
  contextIcon?: React.ReactNode;
  isSelectionDisabled?: boolean;
  showBatchOption?: boolean;
  hasActiveSubagent?: boolean;
  onSelect: () => void;
  onDelete: () => Promise<void>;
  onShare: () => Promise<void>;
  onTogglePin: (pinned: boolean) => Promise<void>;
  onRename: (title: string) => Promise<void>;
  onToggleSelection: () => void;
  onEnterBatchMode: () => void;
  onSidebarAction?: (actionType: string, params?: {
    agentType?: 'main' | 'custom';
    hasActiveSubagent?: boolean;
    isCurrentSession?: boolean;
    isPinned?: boolean;
    result?: 'success' | 'failed';
    targetPinned?: boolean;
    taskStatus?: string;
  }) => void;
  analyticsParams?: {
    agentType: 'main' | 'custom';
    hasActiveSubagent?: boolean;
    isCurrentSession: boolean;
    isPinned: boolean;
    taskStatus: string;
  };
}

const ACTION_MENU_VIEWPORT_PADDING = 8;
const ACTION_MENU_VERTICAL_GAP = 4;
// Four rows of 38px inside 6px of padding; the batch row adds one more.
const ACTION_MENU_HEIGHT = 164;
const ACTION_MENU_WITH_BATCH_HEIGHT = 202;
const MENU_ICON_CLASS_NAME = 'h-[15px] w-[15px] shrink-0 text-[#4a4f57]';

/**
 * One conversation under an agent (docs/maties/design.md, section 3, row 4):
 * the title on the left, the age on the right, the current one on grey, and
 * the row's menu at the right on hover.
 */
const AgentTaskRow: React.FC<AgentTaskRowProps> = ({
  task,
  isBatchMode,
  isSelected,
  contextLabel,
  contextIcon,
  isSelectionDisabled = false,
  showBatchOption = false,
  hasActiveSubagent = false,
  onSelect,
  onDelete,
  onShare,
  onTogglePin,
  onRename,
  onToggleSelection,
  onEnterBatchMode,
  onSidebarAction,
  analyticsParams,
}) => {
  const baseDisplayTitle = task.isScheduledTask
    ? getScheduledTaskDisplayTitle(task.title)
    : task.title;
  const imDisplayTitle = getIMSessionDisplayTitle(baseDisplayTitle, task.imPlatform).title;
  const displayTitle = task.isScheduledTask ? baseDisplayTitle : imDisplayTitle;
  const imPlatformLogo = task.isScheduledTask ? null : getIMSessionPlatformLogo(task.imPlatform);
  const imPlatformLabel = task.isScheduledTask ? null : getIMSessionPlatformLabel(task.imPlatform);
  const imPlatformIconClassName = task.isScheduledTask ? null : getIMSessionPlatformIconClassName(task.imPlatform);
  // Keep a legacy prefix visible while editing so users can deliberately retain
  // or remove the heuristic marker. Persisted markers do not depend on the title.
  const editableTitle = task.isScheduledTask && hasLegacyScheduledTaskTitle(task.title)
    ? task.title
    : displayTitle;
  const [menuPosition, setMenuPosition] = useState<{ right: number; top: number } | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(editableTitle);
  const menuRef = useRef<HTMLDivElement>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const isMenuOpen = menuPosition !== null;

  const calculateMenuPosition = useCallback(() => {
    const rect = actionButtonRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const menuHeight = showBatchOption ? ACTION_MENU_WITH_BATCH_HEIGHT : ACTION_MENU_HEIGHT;
    const right = Math.max(ACTION_MENU_VIEWPORT_PADDING, window.innerWidth - rect.right);
    const top = Math.max(
      ACTION_MENU_VIEWPORT_PADDING,
      Math.min(
        rect.bottom + ACTION_MENU_VERTICAL_GAP,
        window.innerHeight - menuHeight - ACTION_MENU_VIEWPORT_PADDING,
      ),
    );

    return { right, top };
  }, [showBatchOption]);

  const closeMenu = useCallback(() => {
    setMenuPosition(null);
  }, []);

  const toggleMenu = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (isMenuOpen) {
      closeMenu();
      return;
    }

    const position = calculateMenuPosition();
    if (position) {
      onSidebarAction?.('task_menu_open', analyticsParams);
      setMenuPosition(position);
    }
  };

  useEffect(() => {
    if (!isRenaming) {
      setRenameValue(editableTitle);
    }
  }, [editableTitle, isRenaming]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const focusTimer = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !actionButtonRef.current?.contains(target)) {
        closeMenu();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
        actionButtonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      window.cancelAnimationFrame(focusTimer);
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
    if (!isRenaming) return;
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, [isRenaming]);

  const handleRowClick = () => {
    if (isRenaming || isSelectionDisabled) return;
    if (isBatchMode) {
      onToggleSelection();
      return;
    }
    onSelect();
  };

  const handleRowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleRowClick();
    }
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') {
      return;
    }
    const menuItems = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    if (menuItems.length === 0) return;
    event.preventDefault();
    const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? menuItems.length - 1
        : event.key === 'ArrowDown'
          ? (currentIndex + 1 + menuItems.length) % menuItems.length
          : (currentIndex - 1 + menuItems.length) % menuItems.length;
    menuItems[nextIndex]?.focus();
  };

  const handleRenameSave = async () => {
    const nextTitle = renameValue.trim();
    setIsRenaming(false);
    if (nextTitle && nextTitle !== editableTitle) {
      await onRename(nextTitle);
    }
  };

  const handleRenameCancel = () => {
    onSidebarAction?.('task_rename_cancel', analyticsParams);
    setRenameValue(editableTitle);
    setIsRenaming(false);
  };

  const indicatorLabel = task.indicator === AgentSidebarIndicator.PendingPermission
    ? i18nService.t('myAgentSidebarPendingPermission')
    : task.indicator === AgentSidebarIndicator.Running
      ? i18nService.t('myAgentSidebarRunning')
      : i18nService.t('myAgentSidebarUnreadResult');
  const relativeTime = formatAgentTaskRelativeTime(task.updatedAt || task.createdAt);
  const showRelativeTime = !contextLabel && task.indicator === AgentSidebarIndicator.None;
  const isActivityRow = !!contextLabel;
  const isCurrent = task.isSelected && !hasActiveSubagent;
  const scheduledTaskLabel = i18nService.t('myAgentSidebarScheduledTask');
  const pinLabel = task.pinned ? i18nService.t('coworkUnpinSession') : i18nService.t('coworkPinSession');

  return (
    <div
      className={`group relative flex w-full items-center gap-[10px] rounded-[9px] pl-[11px] pr-[11px] text-left transition-colors ${
        isActivityRow ? 'min-h-[48px] py-[6px]' : 'py-2'
      } ${
        isSelectionDisabled
          ? 'cursor-default text-[#4a4f57]/40'
          : isCurrent
            ? 'cursor-pointer bg-[rgba(16,20,28,.06)] text-[#15171b]'
            : 'cursor-pointer text-[#4a4f57] hover:bg-[rgba(16,20,28,.05)] hover:text-[#1c1f23]'
      } ${isSelectionDisabled ? '' : 'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0060d0]/40'}`}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      role="treeitem"
      tabIndex={isSelectionDisabled ? -1 : 0}
      aria-level={isActivityRow ? 1 : 2}
      aria-selected={task.isSelected}
      aria-disabled={isSelectionDisabled || undefined}
    >
      {isBatchMode && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(event) => {
            event.stopPropagation();
            onToggleSelection();
          }}
          onClick={(event) => event.stopPropagation()}
          className="h-3.5 w-3.5 shrink-0 rounded border-[#c9ccd2] accent-[#0060d0]"
        />
      )}

      {isRenaming ? (
        <input
          ref={renameInputRef}
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onBlur={() => void handleRenameSave()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void handleRenameSave();
            }
            if (event.key === 'Escape') {
              handleRenameCancel();
            }
          }}
          className="min-w-0 flex-1 rounded-[7px] border border-[rgba(16,22,35,.07)] bg-white px-1.5 py-0.5 text-[14px] text-[#1c1f23] focus:outline-none focus:ring-1 focus:ring-[#0060d0]/40"
        />
      ) : (
        <>
          {task.isScheduledTask && (
            <span
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[#9aa1ab]"
              role="img"
              title={scheduledTaskLabel}
              aria-label={scheduledTaskLabel}
            >
              <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
          {imPlatformLogo && imPlatformLabel && (
            <span
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center"
              role="img"
              title={imPlatformLabel}
              aria-label={imPlatformLabel}
            >
              <img
                src={imPlatformLogo}
                alt=""
                className={imPlatformIconClassName ?? undefined}
                draggable={false}
              />
            </span>
          )}
          <span className={`min-w-0 flex-1 text-[14px] tracking-[-.008em] ${isActivityRow ? 'flex flex-col gap-0.5' : 'truncate'}`}>
            <span className="truncate">{displayTitle}</span>
            {contextLabel && (
              <span className="flex min-w-0 items-center gap-1 text-[11.5px] leading-4 text-[#a2a29c]">
                {contextIcon && (
                  <span className="flex h-3 w-3 shrink-0 items-center justify-center" aria-hidden="true">
                    {contextIcon}
                  </span>
                )}
                <span className="truncate">{contextLabel}</span>
              </span>
            )}
          </span>
          {task.pinned && !isBatchMode && (
            <span
              className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[#a2a29c] transition-opacity group-hover:opacity-0"
              title={pinLabel}
              aria-label={pinLabel}
              role="img"
            >
              <PushPinIcon className="h-3 w-3" />
            </span>
          )}
          {task.indicator === AgentSidebarIndicator.PendingPermission && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[rgba(0,96,208,.08)] px-1.5 py-0.5 text-[10.5px] font-medium leading-3 text-[#0060d0] transition-opacity group-hover:opacity-0"
              title={indicatorLabel}
              aria-label={indicatorLabel}
            >
              <span className="h-1 w-1 shrink-0 rounded-full bg-[#0060d0]" aria-hidden="true" />
              {indicatorLabel}
            </span>
          )}
          {task.indicator === AgentSidebarIndicator.Running && (
            <span
              className="inline-flex h-3 w-3 shrink-0 items-center justify-center transition-opacity group-hover:opacity-0"
              title={indicatorLabel}
              aria-label={indicatorLabel}
            >
              <LoadingIcon className="h-3 w-3 animate-spin text-[#9aa1ab]" aria-hidden="true" />
            </span>
          )}
          {task.indicator === AgentSidebarIndicator.CompletedUnread && (
            <span
              className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#0060d0] transition-opacity group-hover:opacity-0"
              title={indicatorLabel}
              aria-label={indicatorLabel}
            />
          )}
          {showRelativeTime && (
            <span
              className="shrink-0 whitespace-nowrap text-[12px] text-[#9aa1ab] transition-opacity group-hover:opacity-0"
              title={relativeTime.full}
            >
              {relativeTime.compact}
            </span>
          )}
        </>
      )}

      {!isBatchMode && !isRenaming && !isSelectionDisabled && (
        <button
          ref={actionButtonRef}
          type="button"
          onClick={toggleMenu}
          className={`absolute right-[7px] top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-[7px] text-[#6b7280] transition-opacity hover:bg-[rgba(16,20,28,.06)] hover:text-[#1c1f23] ${
            isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          }`}
          aria-label={i18nService.t('coworkSessionActions')}
        >
          <EllipsisLineIcon size={16} />
        </button>
      )}

      {menuPosition && (
        <div
          ref={menuRef}
          className="maties-menu fixed z-[60] w-[200px] max-w-[calc(100vw-16px)]"
          style={{ top: menuPosition.top, right: menuPosition.right }}
          role="menu"
          onKeyDown={handleMenuKeyDown}
        >
          {showBatchOption && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                closeMenu();
                onEnterBatchMode();
              }}
              className="maties-menu-item"
              role="menuitem"
            >
              <ListChecksIcon className={MENU_ICON_CLASS_NAME} />
              {i18nService.t('batchOperations')}
            </button>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              closeMenu();
              onSidebarAction?.('task_rename_start', analyticsParams);
              setIsRenaming(true);
            }}
            className="maties-menu-item"
            role="menuitem"
          >
            <EditIcon className={MENU_ICON_CLASS_NAME} />
            {i18nService.t('renameConversation')}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              closeMenu();
              void onTogglePin(!task.pinned);
            }}
            className="maties-menu-item"
            role="menuitem"
          >
            <PushPinIcon slashed={task.pinned} className={MENU_ICON_CLASS_NAME} />
            {pinLabel}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              closeMenu();
              void onShare();
            }}
            className="maties-menu-item"
            role="menuitem"
          >
            <ShareIcon className={MENU_ICON_CLASS_NAME} />
            {i18nService.t('coworkShareSession')}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              closeMenu();
              onSidebarAction?.('task_delete_confirm_open', analyticsParams);
              setShowConfirmDelete(true);
            }}
            className="maties-menu-item"
            data-danger="true"
            role="menuitem"
          >
            <TrashIcon className="h-[15px] w-[15px] shrink-0" />
            {i18nService.t('deleteSession')}
          </button>
        </div>
      )}

      {showConfirmDelete && (
        <Modal
          onClose={() => setShowConfirmDelete(false)}
          className="mx-4 w-full max-w-sm overflow-hidden rounded-[20px] bg-white shadow-[0_1px_2px_rgba(16,22,35,.05),0_12px_32px_rgba(16,22,35,.09)]"
        >
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="rounded-full bg-[#fdecec] p-2">
              <ExclamationTriangleIcon className="h-5 w-5 text-[#e0322d]" />
            </div>
            <h2 className="text-[15px] font-medium text-[#1c1f23]">
              {i18nService.t('deleteTaskConfirmTitle')}
            </h2>
          </div>
          <div className="px-5 pb-4">
            <p className="text-[13.5px] text-[#4a4f57]">
              {i18nService.t('deleteTaskConfirmMessage')}
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[rgba(16,22,35,.07)] px-5 py-4">
            <button
              type="button"
              onClick={() => {
                onSidebarAction?.('task_delete_cancel', analyticsParams);
                setShowConfirmDelete(false);
              }}
              className="rounded-full px-4 py-2 text-[13.5px] font-medium text-[#4a4f57] transition-colors hover:bg-[rgba(16,20,28,.05)]"
            >
              {i18nService.t('cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                onSidebarAction?.('task_delete_submit', analyticsParams);
                setShowConfirmDelete(false);
                void onDelete();
              }}
              className="rounded-full bg-[#e0322d] px-4 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-[#c92b27]"
            >
              {i18nService.t('deleteSession')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AgentTaskRow;
