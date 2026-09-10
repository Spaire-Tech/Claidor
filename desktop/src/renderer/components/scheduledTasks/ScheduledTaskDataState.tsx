import React from 'react';

import {
  ScheduledTaskDataStatus,
  type ScheduledTaskDataStatus as ScheduledTaskDataStatusValue,
} from '../../../scheduledTask/constants';
import { i18nService } from '../../services/i18n';
import EmptyState from '../design/EmptyState';
import Pill, { PillTone } from '../design/Pill';
import Shimmer from '../design/Shimmer';

interface ScheduledTaskDataStateProps {
  status: ScheduledTaskDataStatusValue;
  error?: string | null;
  onRetry: () => void;
}

const ScheduledTaskDataState: React.FC<ScheduledTaskDataStateProps> = ({
  status,
  error,
  onRetry,
}) => {
  if (status === ScheduledTaskDataStatus.Ready) return null;

  if (status === ScheduledTaskDataStatus.Error) {
    return (
      <EmptyState
        sentence={i18nService.t('scheduledTasksLoadFailed')}
        action={(
          <Pill tone={PillTone.Primary} compact onClick={onRetry}>
            {i18nService.t('matiesTryAgain')}
          </Pill>
        )}
      >
        {error && <p className="maties-caption mt-4 max-w-md">{error}</p>}
      </EmptyState>
    );
  }

  // Waiting is a shimmer across the words, never a spinner beside them.
  const label =
    status === ScheduledTaskDataStatus.Starting
      ? i18nService.t('scheduledTasksServiceStarting')
      : i18nService.t('scheduledTasksLoading');

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center" role="status">
      <Shimmer text={label} />
    </div>
  );
};

export default ScheduledTaskDataState;
