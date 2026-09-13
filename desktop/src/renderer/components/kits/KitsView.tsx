import React from 'react';

import { i18nService } from '../../services/i18n';
import PageTitle from '../design/PageTitle';
import ComposeIcon from '../icons/ComposeIcon';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import KitsManager from './KitsManager';

interface KitsViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
  onTryAsking?: (text: string, kitId: string) => void;
  onUseKit?: (kitId: string) => void;
}

/**
 * The Kits page (docs/maties/design.md, section 6): the top bar carries only
 * the window's buttons; the title sits in the page in Newsreader, with one
 * line of explanation under it.
 */
const KitsView: React.FC<KitsViewProps> = ({ isSidebarCollapsed, onToggleSidebar, onNewChat, updateBadge, onTryAsking, onUseKit }) => {
  const isMac = window.electron.platform === 'darwin';
  const isWindows = window.electron.platform === 'win32';
  return (
    <div
      data-skin-management-page="true"
      className="relative z-10 flex h-full flex-1 flex-col bg-background"
    >
      <div className="draggable flex h-[54px] shrink-0 items-center px-4">
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
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="mx-auto w-full max-w-[1120px]">
          <PageTitle title={i18nService.t('kits')} description={i18nService.t('kitDescription')} />
          <div className="px-9 pb-8 pt-6">
            <KitsManager onTryAsking={onTryAsking} onUseKit={onUseKit} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default KitsView;
