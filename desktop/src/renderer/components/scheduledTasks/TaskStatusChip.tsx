import React from 'react';

import { i18nService } from '../../services/i18n';
import { TaskDisplayStatus, taskDisplayStatusLabelKey } from './utils';

// Colour is information (docs/maties/design.md, section 1): green for
// done, amber for attention, red for wrong, the one blue for a run in
// progress, and nothing for a task that is paused or has never run.
const toneClasses: Record<TaskDisplayStatus, string> = {
  [TaskDisplayStatus.Running]: 'maties-status-going',
  [TaskDisplayStatus.Paused]: 'maties-status-quiet',
  [TaskDisplayStatus.Success]: 'maties-status-done',
  [TaskDisplayStatus.Error]: 'maties-status-wrong',
  [TaskDisplayStatus.Skipped]: 'maties-status-attention',
  [TaskDisplayStatus.Never]: 'maties-status-quiet',
};

interface TaskStatusChipProps {
  status: TaskDisplayStatus;
  className?: string;
  /** Optional hover tooltip, e.g. "Last run · 2026/7/17 15:07". */
  title?: string;
}

/** Compact status pill: the ring turning while running, a coloured dot otherwise. */
const TaskStatusChip: React.FC<TaskStatusChipProps> = ({ status, className, title }) => (
  <span
    title={title}
    className={`maties-status-pill ${toneClasses[status]} ${className ?? ''}`.trim()}
  >
    {status === TaskDisplayStatus.Running ? (
      <span className="maties-ring h-3 w-3" aria-hidden="true" />
    ) : (
      <span className="maties-status-dot" aria-hidden="true" />
    )}
    <span className="text-[#31353b] dark:text-[#f2f3f5]">{i18nService.t(taskDisplayStatusLabelKey[status])}</span>
  </span>
);

export default TaskStatusChip;
