import React, { useCallback, useState } from 'react';
import { useSelector } from 'react-redux';

import { authService } from '../../services/auth';
import { getPortalProfileUrl } from '../../services/endpoints';
import { i18nService } from '../../services/i18n';
import type { RootState } from '../../store';
import type { Model } from '../../store/slices/modelSlice';

/**
 * The Swen account screen.
 *
 * Swen holds the model keys on the Claidor API. The person signs in with
 * their Claidor account, and every request the app makes goes through
 * Claidor's metered proxy. There is nothing to configure: no provider, no
 * API key, no base URL. This screen shows who is signed in, how much of the
 * monthly allowance is used, and which models the account can use.
 */

const formatCredits = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString('en-US');
};

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-2.5">
    <h4 className="px-1 text-xs font-semibold uppercase tracking-wider text-secondary">{title}</h4>
    <div className="divide-y divide-border rounded-xl border border-border bg-surface">{children}</div>
  </section>
);

const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-4 py-3.5">{children}</div>
);

const PrimaryButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ onClick, disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="rounded-lg bg-claude-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-claude-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
  >
    {children}
  </button>
);

const SecondaryButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ onClick, disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="rounded-lg border border-border bg-transparent px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
  >
    {children}
  </button>
);

const SwenAccountSection: React.FC = () => {
  const isLoggedIn = useSelector((state: RootState) => state.auth.isLoggedIn);
  const isLoading = useSelector((state: RootState) => state.auth.isLoading);
  const user = useSelector((state: RootState) => state.auth.user);
  const quota = useSelector((state: RootState) => state.auth.quota);
  const availableModels = useSelector((state: RootState) => state.model.availableModels);
  const [busy, setBusy] = useState<'login' | 'logout' | 'refresh' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const serverModels = availableModels.filter((model: Model) => model.isServerModel);

  const handleLogin = useCallback(async () => {
    setBusy('login');
    setNotice(null);
    try {
      const result = await authService.login();
      if (!result.success) {
        setNotice(result.error || i18nService.t('swenAccountLoginFailed'));
      } else {
        setNotice(i18nService.t('swenAccountLoginOpened'));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : i18nService.t('swenAccountLoginFailed'));
    } finally {
      setBusy(null);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    setBusy('logout');
    setNotice(null);
    try {
      await authService.logout();
    } finally {
      setBusy(null);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setBusy('refresh');
    setNotice(null);
    try {
      await authService.refreshQuota();
      await authService.refreshServerModels();
    } finally {
      setBusy(null);
    }
  }, []);

  const handleOpenAccount = useCallback(async () => {
    try {
      await window.electron.shell.openExternal(getPortalProfileUrl());
    } catch (error) {
      console.warn('[SwenAccount] failed to open the account page:', error);
    }
  }, []);

  const creditsLimit = quota?.creditsLimit ?? 0;
  const creditsUsed = quota?.creditsUsed ?? 0;
  const creditsRemaining = quota?.creditsRemaining ?? Math.max(creditsLimit - creditsUsed, 0);
  const usedFraction = creditsLimit > 0 ? Math.min(creditsUsed / creditsLimit, 1) : 0;

  return (
    <div className="space-y-8">
      <SectionCard title={i18nService.t('swenAccountTitle')}>
        <Row>
          {isLoading ? (
            <p className="text-sm text-secondary">{i18nService.t('loading')}</p>
          ) : isLoggedIn ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-claude-accent/15 text-sm font-semibold text-claude-accent">
                    {(user?.nickname || '?').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{user?.nickname || i18nService.t('user')}</p>
                  <p className="truncate text-xs text-secondary">{i18nService.t('swenAccountSignedInDesc')}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <SecondaryButton onClick={handleOpenAccount}>{i18nService.t('swenAccountManage')}</SecondaryButton>
                <SecondaryButton onClick={handleLogout} disabled={busy !== null}>
                  {i18nService.t('authLogout')}
                </SecondaryButton>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{i18nService.t('swenAccountSignedOutTitle')}</p>
                <p className="mt-0.5 text-xs text-secondary">{i18nService.t('swenAccountSignedOutDesc')}</p>
              </div>
              <PrimaryButton onClick={handleLogin} disabled={busy !== null}>
                {busy === 'login' ? i18nService.t('loading') : i18nService.t('swenAccountSignIn')}
              </PrimaryButton>
            </div>
          )}
          {notice && <p className="mt-2 text-xs text-secondary">{notice}</p>}
        </Row>
      </SectionCard>

      {isLoggedIn && (
        <SectionCard title={i18nService.t('swenAccountUsageTitle')}>
          <Row>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">{i18nService.t('swenAccountUsageThisMonth')}</p>
                <p className="mt-0.5 text-xs text-secondary">
                  {quota
                    ? i18nService.t('swenAccountUsageLine')
                      .replace('{used}', formatCredits(creditsUsed))
                      .replace('{limit}', formatCredits(creditsLimit))
                      .replace('{remaining}', formatCredits(creditsRemaining))
                    : i18nService.t('swenAccountUsageUnavailable')}
                </p>
              </div>
              <SecondaryButton onClick={handleRefresh} disabled={busy !== null}>
                {busy === 'refresh' ? i18nService.t('loading') : i18nService.t('refresh')}
              </SecondaryButton>
            </div>
            {quota && (
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-claude-accent/15">
                <div
                  className="h-full rounded-full bg-claude-accent transition-all"
                  style={{ width: `${Math.round(usedFraction * 100)}%` }}
                />
              </div>
            )}
          </Row>
          <Row>
            <p className="text-xs text-secondary">{i18nService.t('swenAccountUsageExplain')}</p>
          </Row>
        </SectionCard>
      )}

      <SectionCard title={i18nService.t('swenAccountModelsTitle')}>
        {serverModels.length === 0 ? (
          <Row>
            <p className="text-sm text-secondary">
              {isLoggedIn ? i18nService.t('swenAccountModelsEmpty') : i18nService.t('swenAccountModelsSignedOut')}
            </p>
          </Row>
        ) : (
          serverModels.map((model: Model) => (
            <Row key={`${model.providerKey ?? 'server'}:${model.id}`}>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{model.name}</p>
                  {model.description && (
                    <p className="mt-0.5 truncate text-xs text-secondary">{model.description}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-secondary">
                  {i18nService.t('swenAccountModelCost').replace('{multiplier}', String(model.costMultiplier ?? 1))}
                </span>
              </div>
            </Row>
          ))
        )}
        <Row>
          <p className="text-xs text-secondary">{i18nService.t('swenAccountModelsExplain')}</p>
        </Row>
      </SectionCard>
    </div>
  );
};

export default SwenAccountSection;
