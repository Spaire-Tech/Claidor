import React, { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { EnterpriseAccountMenu } from '../features/enterpriseAccount/components/EnterpriseAccountMenu';
import { selectEnterpriseAccountContext } from '../features/enterpriseAccount/selectors';
import { authService } from '../services/auth';
import { getPortalProfileUrl } from '../services/endpoints';
import { i18nService } from '../services/i18n';
import { LogReporterAction, reportYdAnalyzer } from '../services/logReporter';
import { RootState } from '../store';
import { getAccountMenuDisplayName } from './accountMenuState';
import { getPersonFirstName, getPersonInitials } from './agentSidebar/personInitials';
import Sphere from './design/Sphere';

const ACCOUNT_MENU_ANALYTICS_SOURCE = 'home_account_menu';

const reportAccountMenuAction = (
  actionType: string,
  options: {
    isLoggedIn?: boolean;
    result?: 'success' | 'failed';
  } = {},
): void => {
  console.debug('[LoginButton] reporting account menu analytics');
  void reportYdAnalyzer({
    action: LogReporterAction.AccountMenuAction,
    source: ACCOUNT_MENU_ANALYTICS_SOURCE,
    actionType,
    result: options.result,
    isLoggedIn: options.isLoggedIn ?? true,
  });
};

export const LoginButtonVariant = {
  Default: 'default',
  /** The sidebar's bottom row: the person's initials or picture and first name; signed out, the sphere and « Sign in ». */
  SidebarRow: 'sidebarRow',
} as const;
export type LoginButtonVariant = typeof LoginButtonVariant[keyof typeof LoginButtonVariant];

const AVATAR_SIZE_PX = 26;

/** The person's picture, or their initials in the 26px circle (#e8effa, blue letters). */
const PersonMark: React.FC<{ name: string; avatarUrl: string | null | undefined }> = ({ name, avatarUrl }) => {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        width={AVATAR_SIZE_PX}
        height={AVATAR_SIZE_PX}
        className="shrink-0 rounded-full object-cover"
        style={{ width: AVATAR_SIZE_PX, height: AVATAR_SIZE_PX }}
        draggable={false}
      />
    );
  }
  return (
    <span className="maties-initials" style={{ width: AVATAR_SIZE_PX, height: AVATAR_SIZE_PX }} aria-hidden="true">
      {getPersonInitials(name) || '?'}
    </span>
  );
};

interface UserMenuProps {
  accountName: string;
  avatarUrl: string | null | undefined;
  onClose: () => void;
}

/**
 * The account menu (docs/maties/design.md, section 6): the menu style with
 * the person, « Manage account », « Sign out ».
 */
const UserMenu: React.FC<UserMenuProps> = ({ accountName, avatarUrl, onClose }) => {
  const handleManageAccount = async () => {
    try {
      const result = await window.electron.shell.openExternal(getPortalProfileUrl());
      reportAccountMenuAction('open_usage_overview', { result: result.success ? 'success' : 'failed' });
      onClose();
    } catch (error) {
      console.warn('[LoginButton] failed to open the account page:', error);
      reportAccountMenuAction('open_usage_overview', { result: 'failed' });
    }
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
      reportAccountMenuAction('logout', { result: 'success' });
      onClose();
    } catch (error) {
      reportAccountMenuAction('logout', { result: 'failed' });
      throw error;
    }
  };

  return (
    <div
      role="menu"
      className="maties-menu absolute bottom-full left-0 z-50 mb-2 w-[232px]"
    >
      <div className="flex items-center gap-2.5 px-3 pb-2 pt-2">
        <PersonMark name={accountName} avatarUrl={avatarUrl} />
        <span className="min-w-0 truncate text-[14.5px] font-medium text-[#1c1f23] dark:text-[#f2f3f5]">
          {accountName}
        </span>
      </div>
      <div className="maties-menu-divider" />
      <button type="button" role="menuitem" className="maties-menu-item" onClick={() => void handleManageAccount()}>
        {i18nService.t('matiesAccountManage')}
      </button>
      <button type="button" role="menuitem" className="maties-menu-item" onClick={() => void handleLogout()}>
        {i18nService.t('matiesSignOut')}
      </button>
    </div>
  );
};

interface LoginButtonProps {
  /** Kept for the caller; the menu is anchored to the row now. */
  contentLeftOffset?: number;
  /** Kept for the caller; there is one signed-out look, « Sign in » with the sphere. */
  loggedOutVariant?: 'default' | 'sidebarPromo';
  variant?: LoginButtonVariant;
}

/**
 * The sidebar's bottom row (docs/maties/design.md, section 3): the person's
 * initials in a 26px circle or their picture, their first name; signed out,
 * « Sign in » with the sphere in place of the initials. Opens the account
 * menu. The default variant is the same row at a smaller footprint.
 */
const LoginButton: React.FC<LoginButtonProps> = ({ variant = LoginButtonVariant.Default }) => {
  const {
    isLoggedIn,
    isLoading,
    profileSummary,
    user,
  } = useSelector((state: RootState) => state.auth);
  const enterpriseAccountContext = useSelector(selectEnterpriseAccountContext);
  const [showMenu, setShowMenu] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSidebarRow = variant === LoginButtonVariant.SidebarRow;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      const isEnterpriseAccountFlyout = target instanceof Element
        && target.closest('[data-enterprise-account-flyout="true"]') !== null;
      if (
        containerRef.current
        && !containerRef.current.contains(target as Node)
        && !isEnterpriseAccountFlyout
      ) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  useEffect(() => {
    if (!isLoggedIn) setShowMenu(false);
  }, [isLoggedIn]);

  if (isLoading) {
    if (!isSidebarRow) return null;
    // Keep the row's height while the account resolves so the sidebar does not jump.
    return (
      <div className="flex min-w-0 flex-1 items-center gap-[11px] px-1 py-1">
        <Sphere size={AVATAR_SIZE_PX} still />
      </div>
    );
  }

  const accountName = getAccountMenuDisplayName({
    fallback: i18nService.t('myAccount'),
    profileNickname: profileSummary?.nickname,
    userNickname: user?.nickname,
    userPhone: user?.phone,
  });
  const firstName = getPersonFirstName(accountName, i18nService.t('myAccount'));

  const handleClick = async () => {
    if (isLoggedIn) {
      const next = !showMenu;
      setShowMenu(next);
      reportAccountMenuAction(next ? 'open_menu' : 'close_menu', { isLoggedIn: true });
      return;
    }
    try {
      await authService.login();
      reportAccountMenuAction('login', { isLoggedIn: false, result: 'success' });
    } catch (error) {
      reportAccountMenuAction('login', { isLoggedIn: false, result: 'failed' });
      throw error;
    }
  };

  return (
    <div ref={containerRef} className={isSidebarRow ? 'relative flex min-w-0 flex-1' : 'relative'}>
      <button
        type="button"
        onClick={() => { void handleClick(); }}
        aria-label={isLoggedIn ? i18nService.t('sidebarAccount') : i18nService.t('sidebarSignIn')}
        aria-haspopup={isLoggedIn ? 'menu' : undefined}
        aria-expanded={isLoggedIn ? showMenu : undefined}
        className={`cursor-pointer items-center rounded-[9px] text-left text-[#1c1f23] transition-colors hover:bg-[rgba(16,20,28,.05)] dark:text-[#f2f3f5] dark:hover:bg-[rgba(255,255,255,.07)] ${
          isSidebarRow
            ? 'flex min-w-0 flex-1 gap-[11px] px-1 py-1 text-[15px] tracking-[-.008em]'
            : 'inline-flex h-9 max-w-full gap-2.5 px-1.5 text-[14.5px]'
        }`}
      >
        {isLoggedIn ? (
          <>
            <PersonMark name={accountName} avatarUrl={user?.avatarUrl} />
            <span className="min-w-0 flex-1 truncate">{firstName}</span>
          </>
        ) : (
          <>
            <Sphere size={AVATAR_SIZE_PX} still />
            <span className="min-w-0 flex-1 truncate">{i18nService.t('sidebarSignIn')}</span>
          </>
        )}
      </button>
      {showMenu && isLoggedIn && (
        enterpriseAccountContext
          ? (
            <EnterpriseAccountMenu
              context={enterpriseAccountContext}
              onClose={() => setShowMenu(false)}
            />
          )
          : (
            <UserMenu
              accountName={accountName}
              avatarUrl={user?.avatarUrl}
              onClose={() => setShowMenu(false)}
            />
          )
      )}
    </div>
  );
};

export default LoginButton;
