import React from 'react';

import Switch from '../design/Switch';

interface TaskToggleProps {
  enabled: boolean;
  onToggle: () => void;
  title?: string;
}

/** Small enable/disable switch shared by the task list and detail views. */
const TaskToggle: React.FC<TaskToggleProps> = ({ enabled, onToggle, title }) => (
  <Switch
    small
    stopPropagation
    checked={enabled}
    label={title ?? ''}
    title={title}
    onChange={onToggle}
  />
);

export default TaskToggle;
