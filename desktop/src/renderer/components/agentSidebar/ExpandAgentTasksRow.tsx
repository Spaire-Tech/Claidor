import React from 'react';

import { i18nService } from '../../services/i18n';

interface ExpandAgentTasksRowProps {
  isLoading: boolean;
  label: string;
  onClick: () => void;
  secondaryLabel?: string;
  onSecondaryClick?: () => void;
}

/** « Show more » / « Show less » under an agent's conversations: a quiet 13px line. */
const ExpandAgentTasksRow: React.FC<ExpandAgentTasksRowProps> = ({
  isLoading,
  label,
  onClick,
  secondaryLabel,
  onSecondaryClick,
}) => {
  return (
    <div className="flex items-center gap-5 px-[11px] py-[6px] text-[13px] tracking-[-.006em]">
      <button
        type="button"
        onClick={onClick}
        disabled={isLoading}
        className="min-w-0 text-left text-[#9aa1ab] transition-colors hover:text-[#1c1f23] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? i18nService.t('loading') : label}
      </button>
      {secondaryLabel && onSecondaryClick && (
        <button
          type="button"
          onClick={onSecondaryClick}
          className="min-w-0 text-left text-[#9aa1ab] transition-colors hover:text-[#1c1f23]"
        >
          {secondaryLabel}
        </button>
      )}
    </div>
  );
};

export default ExpandAgentTasksRow;
