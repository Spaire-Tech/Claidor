/**
 * « Runs where »: the one new word the plan asks for
 * (docs/maties/cloud.md, section 1). A chip in the composer that says, at all
 * times, whether the next piece of work runs on this computer or in the cloud,
 * and lets the person change it.
 *
 * It is drawn only when Claidor says the cloud engine will take work. There is
 * no greyed-out version of it: a control that cannot be honoured is not
 * offered at all.
 */

import { CheckIcon } from '@heroicons/react/24/outline';
import { MatyWorkPlace } from '@shared/maty/constants';
import React, { useEffect, useRef, useState } from 'react';

import { i18nService } from '../../services/i18n';
import { ChevronDownLineIcon, CloudLineIcon, LaptopLineIcon } from '../design/LineIcons';
import { setMatyWorkPlace } from './matyPreferences';

export interface RunsWhereChipProps {
  place: MatyWorkPlace;
  /** The composer's own chip styling, so this sits in the row as a native. */
  className?: string;
  /** The narrow toolbar drops the word and keeps the mark. */
  compact?: boolean;
  disabled?: boolean;
}

const RunsWhereChip: React.FC<RunsWhereChipProps> = ({
  place,
  className,
  compact = false,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const inCloud = place === MatyWorkPlace.Cloud;
  const Mark = inCloud ? CloudLineIcon : LaptopLineIcon;
  const label = i18nService.t(inCloud ? 'matyRunsInCloud' : 'matyRunsHere');

  const choose = (next: MatyWorkPlace) => {
    setMatyWorkPlace(next);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className={`${className ?? ''} ${open ? 'bg-[#f3f3f1]' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${i18nService.t('matyRunsWhere')}: ${label}`}
      >
        <Mark size={16} className={inCloud ? 'text-[#0060d0]' : 'text-[#4a4f57]'} />
        {!compact && <span className="min-w-0 truncate">{label}</span>}
        <ChevronDownLineIcon size={14} className="text-[#8f96a0]" />
      </button>
      {open && (
        <div
          className="maties-menu maties-in-fast absolute bottom-full right-0 z-50 mb-2 w-[288px]"
          role="menu"
        >
          <button
            type="button"
            className="maties-menu-item"
            role="menuitem"
            onClick={() => choose(MatyWorkPlace.Here)}
          >
            <LaptopLineIcon size={17} className="text-[#4a4f57]" />
            <span className="min-w-0 flex-1 truncate">{i18nService.t('matyRunsHere')}</span>
            {!inCloud && <CheckIcon className="h-4 w-4 shrink-0 text-[#0060d0]" />}
          </button>
          <button
            type="button"
            className="maties-menu-item"
            role="menuitem"
            onClick={() => choose(MatyWorkPlace.Cloud)}
          >
            <CloudLineIcon size={17} className="text-[#4a4f57]" />
            <span className="min-w-0 flex-1 truncate">{i18nService.t('matyRunsInCloud')}</span>
            {inCloud && <CheckIcon className="h-4 w-4 shrink-0 text-[#0060d0]" />}
          </button>
          <div className="maties-menu-divider" />
          <p className="px-[11px] pb-[7px] pt-[3px] text-[12.5px] leading-[1.45] text-[#8f96a0]">
            {i18nService.t('matyRunsWhereExplain')}
          </p>
        </div>
      )}
    </div>
  );
};

export default RunsWhereChip;
