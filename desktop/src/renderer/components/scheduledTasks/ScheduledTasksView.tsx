import { XCircleIcon as XCircleIconSolid } from '@heroicons/react/20/solid';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';

import { ScheduledTaskDataStatus } from '../../../scheduledTask/constants';
import { i18nService } from '../../services/i18n';
import { scheduledTaskService } from '../../services/scheduledTask';
import { RootState } from '../../store';
import { selectTask, setViewMode } from '../../store/slices/scheduledTaskSlice';
import PageTitle from '../design/PageTitle';
import Pill, { PillTone } from '../design/Pill';
import ComposeIcon from '../icons/ComposeIcon';
import PlusCircleIcon from '../icons/PlusCircleIcon';
import SearchIcon from '../icons/SearchIcon';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import AllRunsHistory from './AllRunsHistory';
import { getTaskAnalyticsParams, reportScheduledTaskAction } from './analytics';
import DeleteConfirmModal from './DeleteConfirmModal';
import TaskDetail from './TaskDetail';
import TaskForm from './TaskForm';
import TaskList from './TaskList';
import type { ScheduledTaskTemplate } from './taskTemplates';

interface ScheduledTasksViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
}

type TabType = 'tasks' | 'history';

type DeleteTaskInfo = {
  id: string;
  name: string;
  source: string;
  analyticsParams: Record<string, string | number | boolean | null | undefined>;
};

/**
 * Scheduled Tasks (docs/maties/design.md, section 6): the title in
 * Newsreader with one line under it, « New Task » as the one blue pill at
 * the top right, the Tasks / History filter as pills, cards under them.
 */
const ScheduledTasksView: React.FC<ScheduledTasksViewProps> = ({
  isSidebarCollapsed,
  onToggleSidebar,
  onNewChat,
  updateBadge,
}) => {
  const dispatch = useDispatch();
  const isMac = window.electron.platform === 'darwin';
  const isWindows = window.electron.platform === 'win32';
  const viewMode = useSelector((state: RootState) => state.scheduledTask.viewMode);
  const selectedTaskId = useSelector((state: RootState) => state.scheduledTask.selectedTaskId);
  const tasks = useSelector((state: RootState) => state.scheduledTask.tasks);
  const taskListStatus = useSelector((state: RootState) => state.scheduledTask.taskListStatus);
  const availableModels = useSelector((state: RootState) => state.model.availableModels);
  const selectedTask = selectedTaskId ? (tasks.find(t => t.id === selectedTaskId) ?? null) : null;
  const [activeTab, setActiveTab] = useState<TabType>('tasks');
  const [searchText, setSearchText] = useState('');
  const [createTemplate, setCreateTemplate] = useState<ScheduledTaskTemplate | null>(null);
  const [deleteTaskInfo, setDeleteTaskInfo] = useState<DeleteTaskInfo | null>(null);
  const isFormDirtyRef = useRef(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const pendingBackActionRef = useRef<(() => void) | null>(null);

  const handleFormDirtyChange = useCallback((dirty: boolean) => {
    isFormDirtyRef.current = dirty;
  }, []);

  const handleRequestDelete = useCallback((taskId: string, taskName: string, source = 'scheduled_tasks_view') => {
    const task = tasks.find(item => item.id === taskId);
    const analyticsParams = task ? getTaskAnalyticsParams(task, availableModels) : {};
    reportScheduledTaskAction('delete_confirm_open', {
      source,
      activeTab,
      viewMode,
      ...analyticsParams,
    });
    setDeleteTaskInfo({ id: taskId, name: taskName, source, analyticsParams });
  }, [activeTab, availableModels, tasks, viewMode]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTaskInfo) return;
    const taskId = deleteTaskInfo.id;
    const { analyticsParams, source } = deleteTaskInfo;
    setDeleteTaskInfo(null);
    try {
      await scheduledTaskService.deleteTask(taskId);
      reportScheduledTaskAction('delete_success', {
        source,
        activeTab,
        viewMode,
        result: 'success',
        ...analyticsParams,
      });
      // If we were viewing this task's detail, go back to list
      if (selectedTaskId === taskId) {
        dispatch(selectTask(null));
        dispatch(setViewMode('list'));
      }
    } catch (error) {
      reportScheduledTaskAction('delete_failed', {
        source,
        activeTab,
        viewMode,
        result: 'failed',
        errorCode: 'delete_failed',
        ...analyticsParams,
      });
      throw error;
    }
  }, [activeTab, deleteTaskInfo, selectedTaskId, dispatch, viewMode]);

  const handleCancelDelete = useCallback(() => {
    if (deleteTaskInfo) {
      reportScheduledTaskAction('delete_confirm_cancel', {
        source: deleteTaskInfo.source,
        activeTab,
        viewMode,
        ...deleteTaskInfo.analyticsParams,
      });
    }
    setDeleteTaskInfo(null);
  }, [activeTab, deleteTaskInfo, viewMode]);

  useEffect(() => {
    scheduledTaskService.loadTasks();
  }, []);

  const requestLeave = useCallback((action: () => void) => {
    if (isFormDirtyRef.current) {
      reportScheduledTaskAction('form_unsaved_confirm_open', {
        source: 'scheduled_tasks_view',
        activeTab,
        viewMode,
      });
      pendingBackActionRef.current = () => {
        isFormDirtyRef.current = false;
        action();
      };
      setShowLeaveConfirm(true);
    } else {
      action();
    }
  }, [activeTab, viewMode]);

  const handleBackToList = () => {
    const action = () => {
      setCreateTemplate(null);
      dispatch(selectTask(null));
      dispatch(setViewMode('list'));
    };
    if (viewMode === 'create' || viewMode === 'edit') {
      requestLeave(action);
    } else {
      action();
    }
  };

  const handleCreateNew = useCallback(() => {
    reportScheduledTaskAction('new_task', {
      source: 'scheduled_tasks_view',
      activeTab,
      viewMode,
    });
    setCreateTemplate(null);
    dispatch(setViewMode('create'));
  }, [activeTab, dispatch, viewMode]);

  const handleCreateFromTemplate = useCallback(
    (template: ScheduledTaskTemplate) => {
      reportScheduledTaskAction('new_task_from_template', {
        source: 'scheduled_tasks_list',
        templateId: template.id,
        activeTab,
        viewMode,
      });
      setCreateTemplate(template);
      dispatch(setViewMode('create'));
    },
    [activeTab, dispatch, viewMode],
  );

  const handleEditCancel = useCallback(() => {
    requestLeave(() => dispatch(setViewMode('detail')));
  }, [requestLeave, dispatch]);

  const handleTabChange = (tab: TabType) => {
    reportScheduledTaskAction('tab_change', {
      source: 'scheduled_tasks_view',
      activeTab,
      targetTab: tab,
      viewMode,
    });
    setActiveTab(tab);
    if (tab === 'tasks') {
      dispatch(selectTask(null));
      dispatch(setViewMode('list'));
    }
  };

  // Show tabs only in list view (not in create/edit/detail sub-views)
  const showTabs = viewMode === 'list' && !selectedTaskId;

  return (
    <div
      data-skin-management-page="true"
      className="relative z-10 flex h-full flex-col bg-background"
    >
      {/* The top bar: 54px, no background, only the window's buttons. */}
      <div className="draggable flex h-[54px] shrink-0 items-center px-4">
        <div className="flex items-center gap-1">
          {isSidebarCollapsed && !isWindows && (
            <div className={`non-draggable flex items-center gap-1 ${isMac ? 'pl-[68px]' : ''}`}>
              <button
                type="button"
                onClick={onToggleSidebar}
                aria-label={i18nService.t('expand')}
                className="maties-icon-button"
              >
                <SidebarToggleIcon className="h-4 w-4" isCollapsed={true} />
              </button>
              <button
                type="button"
                onClick={onNewChat}
                aria-label={i18nService.t('newChat')}
                className="maties-icon-button"
              >
                <ComposeIcon className="h-4 w-4" />
              </button>
              {updateBadge}
            </div>
          )}
          {viewMode !== 'list' && (
            <button
              type="button"
              onClick={handleBackToList}
              className="non-draggable maties-icon-button"
              aria-label={i18nService.t('back')}
              title={i18nService.t('back')}
            >
              <ArrowLeftIcon className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      </div>

      {showTabs ? (
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div className="mx-auto w-full max-w-[1120px]">
            <PageTitle
              title={i18nService.t('scheduledTasksTitle')}
              description={i18nService.t('scheduledTasksPageSubtitle')}
              action={(
                <Pill
                  tone={PillTone.Primary}
                  compact
                  onClick={handleCreateNew}
                  disabled={taskListStatus !== ScheduledTaskDataStatus.Ready}
                  icon={<PlusCircleIcon className="h-4 w-4" />}
                >
                  {i18nService.t('scheduledTasksNewTask')}
                </Pill>
              )}
            />

            <div className="space-y-5 px-9 pb-8 pt-6">
              {/* Sticky toolbar: the search box and the Tasks / History pills */}
              <div
                data-skin-management-toolbar="true"
                className="sticky top-0 z-10 flex flex-wrap items-center gap-3 bg-background pb-2"
              >
                <div className="flex items-center gap-1.5" role="tablist">
                  {(['tasks', 'history'] as const).map(tab => (
                    <Pill
                      key={tab}
                      role="tab"
                      compact
                      aria-selected={activeTab === tab}
                      tone={activeTab === tab ? PillTone.Selected : PillTone.Quiet}
                      onClick={() => handleTabChange(tab)}
                    >
                      {i18nService.t(
                        tab === 'tasks' ? 'scheduledTasksTabTasks' : 'scheduledTasksTabHistory',
                      )}
                      {tab === 'tasks' && tasks.length > 0 && (
                        <span className="maties-mono ml-1 text-[11.5px] text-[#8f96a0]">{tasks.length}</span>
                      )}
                    </Pill>
                  ))}
                </div>
                <div className="relative ml-auto w-full max-w-[320px] flex-1">
                  <SearchIcon className="maties-input-icon-glyph h-4 w-4" />
                  <input
                    type="text"
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    placeholder={i18nService.t('scheduledTasksSearchPlaceholder')}
                    className="maties-input maties-input-icon pr-9"
                  />
                  {searchText && (
                    <button
                      type="button"
                      onClick={() => setSearchText('')}
                      aria-label={i18nService.t('scheduledTasksClearSearch')}
                      title={i18nService.t('scheduledTasksClearSearch')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[#9aa1ab] transition-colors hover:text-[#1c1f23]"
                    >
                      <XCircleIconSolid className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {activeTab === 'history' ? (
                <AllRunsHistory searchText={searchText} />
              ) : (
                <TaskList
                  searchText={searchText}
                  onClearSearch={() => setSearchText('')}
                  onRequestDelete={handleRequestDelete}
                  onCreateNew={handleCreateNew}
                  onCreateFromTemplate={handleCreateFromTemplate}
                />
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`flex-1 min-h-0 ${viewMode === 'create' || viewMode === 'edit' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}
        >
          {viewMode === 'create' && (
            <TaskForm
              mode="create"
              initialTemplate={createTemplate}
              onCancel={handleBackToList}
              onSaved={newTaskId => {
                setCreateTemplate(null);
                if (newTaskId) {
                  dispatch(selectTask(newTaskId));
                  dispatch(setViewMode('detail'));
                } else {
                  handleBackToList();
                }
              }}
              onDirtyChange={handleFormDirtyChange}
            />
          )}
          {viewMode === 'edit' && selectedTask && (
            <TaskForm
              mode="edit"
              task={selectedTask}
              onCancel={handleEditCancel}
              onSaved={() => dispatch(setViewMode('detail'))}
              onDirtyChange={handleFormDirtyChange}
            />
          )}
          {viewMode === 'detail' && selectedTask && (
            <TaskDetail task={selectedTask} onRequestDelete={handleRequestDelete} />
          )}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTaskInfo && (
        <DeleteConfirmModal
          taskName={deleteTaskInfo.name}
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      )}

      {/* Unsaved changes confirmation overlay (back arrow) */}
      {showLeaveConfirm &&
        createPortal(
          <div className="maties-backdrop fixed inset-0 z-50 flex items-center justify-center px-4">
            <div
              role="dialog"
              aria-modal="true"
              onClick={e => e.stopPropagation()}
              className="maties-card-prose maties-in w-full max-w-sm p-6"
            >
              <h4 className="maties-row-title text-[15.5px]">
                {i18nService.t('taskFormUnsavedChanges')}
              </h4>
              <p className="maties-row-desc">{i18nService.t('taskFormLeaveConfirm')}</p>
              <div className="mt-5 flex justify-end gap-2">
                <Pill
                  tone={PillTone.Ghost}
                  compact
                  onClick={() => {
                    reportScheduledTaskAction('form_unsaved_confirm_cancel', {
                      source: 'scheduled_tasks_view',
                      activeTab,
                      viewMode,
                    });
                    setShowLeaveConfirm(false);
                  }}
                >
                  {i18nService.t('taskFormStay')}
                </Pill>
                <Pill
                  tone={PillTone.Primary}
                  compact
                  onClick={() => {
                    setShowLeaveConfirm(false);
                    reportScheduledTaskAction('form_unsaved_confirm_submit', {
                      source: 'scheduled_tasks_view',
                      activeTab,
                      viewMode,
                    });
                    pendingBackActionRef.current?.();
                    pendingBackActionRef.current = null;
                  }}
                >
                  {i18nService.t('taskFormLeave')}
                </Pill>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default ScheduledTasksView;
