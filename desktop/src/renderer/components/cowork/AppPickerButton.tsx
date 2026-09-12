import { CheckIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useRef, useState } from 'react';

import { i18nService } from '../../services/i18n';
import { ConnectionLogo } from '../connections/ConnectionCard';
import { SquaresLineIcon } from '../design/LineIcons';
import type { ConnectedApp } from './connectedApps';

interface AppPickerButtonProps {
  /** The apps this person has connected; the button is not drawn when empty. */
  apps: readonly ConnectedApp[];
  selectedSlug?: string;
  onSelect: (slug: string | undefined) => void;
  buttonClassName: string;
  iconClassName?: string;
  onOpenChange?: (open: boolean) => void;
}

/**
 * The composer's app picker, in the slot the retired kit button held
 * (docs/maties/design.md, section 4). It names one app the person has
 * connected as the place to look first; it is a hint, not a gate, so the
 * chosen app is a chip rather than a mode.
 */
const AppPickerButton: React.FC<AppPickerButtonProps> = ({
  apps,
  selectedSlug,
  onSelect,
  buttonClassName,
  iconClassName = 'h-[18px] w-[18px]',
  onOpenChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        onOpenChange?.(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      onOpenChange?.(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onOpenChange]);

  // Nothing connected, nothing to point at: the slot stays empty rather than
  // offering a menu that can only say « none ».
  if (apps.length === 0) return null;

  const toggleOpen = () => {
    setIsOpen((previous) => {
      const next = !previous;
      onOpenChange?.(next);
      return next;
    });
  };

  const handleSelect = (slug: string) => {
    onSelect(slug === selectedSlug ? undefined : slug);
    setIsOpen(false);
    onOpenChange?.(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        className={buttonClassName}
        title={i18nService.t('coworkAppPicker')}
        aria-label={i18nService.t('coworkAppPicker')}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <SquaresLineIcon className={iconClassName} />
      </button>

      {isOpen && (
        <div
          className="maties-menu absolute bottom-full left-0 z-50 mb-2 w-[288px]"
          role="menu"
          aria-label={i18nService.t('coworkAppPicker')}
        >
          <p className="px-[11px] pb-1 pt-[9px] text-[12.5px] leading-[1.45] text-[#8f96a0]">
            {i18nService.t('coworkAppPickerHint')}
          </p>
          <div className="max-h-[280px] overflow-y-auto">
            {apps.map((app) => {
              const isSelected = app.slug === selectedSlug;
              return (
                <button
                  key={app.slug}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  onClick={() => handleSelect(app.slug)}
                  className="maties-menu-item"
                >
                  <ConnectionLogo name={app.name} logo={app.logo} size={22} />
                  <span className="min-w-0 flex-1 truncate">{app.name}</span>
                  {isSelected && <CheckIcon className="h-4 w-4 shrink-0 text-[#0060d0]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AppPickerButton;
