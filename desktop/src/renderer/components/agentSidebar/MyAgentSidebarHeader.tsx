import { PlusIcon } from '@heroicons/react/24/outline';
import React from 'react';

import { i18nService } from '../../services/i18n';
import Eyebrow from '../design/Eyebrow';
import Tooltip, { TooltipAlign, TooltipPosition } from '../ui/Tooltip';

interface MyAgentSidebarHeaderProps {
  onCreateAgent: () => void;
}

/** The « MY AGENTS » eyebrow (padding 26 11 8); « + » to add an agent shows on hover. */
const MyAgentSidebarHeader: React.FC<MyAgentSidebarHeaderProps> = ({
  onCreateAgent,
}) => {
  return (
    <div className="group flex items-center justify-between pb-2 pl-[11px] pr-1 pt-[26px]">
      <Eyebrow>{i18nService.t('myAgents')}</Eyebrow>
      <Tooltip
        content={i18nService.t('createNewAgent')}
        position={TooltipPosition.Bottom}
        align={TooltipAlign.End}
        delay={300}
        className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <button
          type="button"
          onClick={onCreateAgent}
          className="inline-flex h-6 w-6 items-center justify-center rounded-[7px] text-[#9aa1ab] transition-colors hover:bg-[rgba(16,20,28,.05)] hover:text-[#1c1f23]"
          aria-label={i18nService.t('createNewAgent')}
        >
          <PlusIcon className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
    </div>
  );
};

export default MyAgentSidebarHeader;
