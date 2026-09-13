import React from 'react';

import { i18nService } from '../../services/i18n';
import {
  ACTIVE_CONTEXT_BADGE_BUTTON_CLASS,
  ACTIVE_CONTEXT_BADGE_ICON_CLASS,
  ACTIVE_CONTEXT_BADGE_ICON_WRAP_CLASS,
  ACTIVE_CONTEXT_BADGE_REMOVE_ICON_CLASS,
} from '../common/activeContextBadgeStyles';
import { SquaresLineIcon } from '../design/LineIcons';
import XMarkIcon from '../icons/XMarkIcon';
import type { ConnectedApp } from './connectedApps';

interface ActiveAppBadgeProps {
  app?: ConnectedApp;
  onClear: () => void;
}

/** The chosen app's chip in the composer's button row, cleared by its ×. */
const ActiveAppBadge: React.FC<ActiveAppBadgeProps> = ({ app, onClear }) => {
  if (!app) return null;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClear();
      }}
      className={ACTIVE_CONTEXT_BADGE_BUTTON_CLASS}
      title={i18nService.t('coworkAppPickerClear')}
    >
      <span className={ACTIVE_CONTEXT_BADGE_ICON_WRAP_CLASS}>
        <SquaresLineIcon className={ACTIVE_CONTEXT_BADGE_ICON_CLASS} />
        <XMarkIcon className={ACTIVE_CONTEXT_BADGE_REMOVE_ICON_CLASS} />
      </span>
      <span className="min-w-0 truncate">{app.name}</span>
    </button>
  );
};

export default ActiveAppBadge;
