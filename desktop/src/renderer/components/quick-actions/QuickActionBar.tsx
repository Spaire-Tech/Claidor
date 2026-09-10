import React from 'react';

import type { LocalizedQuickAction } from '../../types/quickAction';
import { BarsLineIcon, DocumentLineIcon, GlobeLineIcon, SlidesLineIcon } from '../design/LineIcons';
import Pill, { PillTone } from '../design/Pill';
import AcademicCapIcon from '../icons/AcademicCapIcon';
import DevicePhoneMobileIcon from '../icons/DevicePhoneMobileIcon';

interface QuickActionBarProps {
  actions: LocalizedQuickAction[];
  selectedActionId?: string | null;
  onActionSelect: (actionId: string) => void;
}

/**
 * The four suggestion pills under the composer (docs/maties/design.md,
 * section 4): each with the founder's line icon in its own colour. The
 * quick action config names an icon; the founder drew four of them.
 */
const founderIcons: Record<string, React.ReactNode> = {
  PresentationChartBarIcon: <SlidesLineIcon className="text-[#e8a300]" />,
  ChartBarIcon: <BarsLineIcon className="text-[#2b6cf5]" />,
  DocumentTextIcon: <DocumentLineIcon className="text-[#1a8547]" />,
  GlobeAltIcon: <GlobeLineIcon className="text-[#6a45c9]" />,
  DevicePhoneMobileIcon: <DevicePhoneMobileIcon className="h-[15px] w-[15px] text-[#6a45c9]" />,
  AcademicCapIcon: <AcademicCapIcon className="h-[15px] w-[15px] text-[#c8790a]" />,
};

const QuickActionBar: React.FC<QuickActionBarProps> = ({ actions, selectedActionId, onActionSelect }) => {
  if (actions.length === 0) {
    return null;
  }

  return (
    <div data-skin-quick-actions="true" className="flex flex-nowrap items-center gap-[6px]">
      {actions.map((action) => {
        const isSelected = action.id === selectedActionId;
        return (
          <Pill
            key={action.id}
            tone={isSelected ? PillTone.Selected : PillTone.Quiet}
            aria-pressed={isSelected}
            onClick={() => onActionSelect(action.id)}
            icon={founderIcons[action.icon]}
          >
            {action.label}
          </Pill>
        );
      })}
    </div>
  );
};

export default QuickActionBar;
