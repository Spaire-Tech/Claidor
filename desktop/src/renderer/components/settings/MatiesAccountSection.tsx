import { ProviderName } from '@shared/providers';
import React, { useCallback, useState } from 'react';
import { useSelector } from 'react-redux';

import { getProviderIcon } from '../../providers/uiRegistry';
import { authService } from '../../services/auth';
import { getPortalProfileUrl } from '../../services/endpoints';
import { i18nService } from '../../services/i18n';
import type { RootState } from '../../store';
import type { Model } from '../../store/slices/modelSlice';
import { getPersonInitials } from '../agentSidebar/personInitials';
import Eyebrow from '../design/Eyebrow';
import Pill, { PillTone } from '../design/Pill';
import Sphere from '../design/Sphere';

/**
 * Settings → Account (docs/maties/design.md, section 5): the sphere, the
 * person, usage this month, and the models with their provider marks.
 *
 * Maties holds the model keys on the Claidor API. The person signs in with
 * their Claidor account, and every request the app makes goes through
 * Claidor's metered proxy. There is nothing to configure: no provider, no
 * API key, no base URL.
 */

const formatCredits = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString('en-US');
};

// The server names its models without a provider; the mark is read off the
// name, the same way the composer's model chip does it.
const MODEL_MARK_HINTS: Array<{ pattern: RegExp; providerName: string }> = [
  { pattern: /claude|anthropic/i, providerName: ProviderName.Anthropic },
  { pattern: /gpt|openai|o[1-9]\b/i, providerName: ProviderName.OpenAI },
  { pattern: /gemini/i, providerName: ProviderName.Gemini },
  { pattern: /deepseek/i, providerName: ProviderName.DeepSeek },
  { pattern: /qwen|qwq|qvq/i, providerName: ProviderName.Qwen },
  { pattern: /kimi|moonshot/i, providerName: ProviderName.Moonshot },
  { pattern: /glm|zhipu/i, providerName: ProviderName.Zhipu },
  { pattern: /minimax/i, providerName: ProviderName.Minimax },
  { pattern: /grok|xai/i, providerName: ProviderName.Xai },
];

const resolveModelMarkKey = (model: Model): string => {
  const providerKey = model.providerKey?.trim();
  if (providerKey && providerKey !== ProviderName.MatiesServer) return providerKey;
  const searchable = `${model.name} ${model.id}`;
  return MODEL_MARK_HINTS.find(({ pattern }) => pattern.test(searchable))?.providerName ?? providerKey ?? '';
};

const ModelMark: React.FC<{ model: Model }> = ({ model }) => {
  const icon = getProviderIcon(resolveModelMarkKey(model));
  const sized = React.isValidElement<{ className?: string }>(icon)
    ? React.cloneElement(icon, { className: `${icon.props.className ? `${icon.props.className} ` : ''}h-full w-full` })
    : icon;
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center overflow-hidden rounded-[7px] bg-[#f4f5f7] p-[3px] text-[#1c1f23] dark:bg-[#22252b] dark:text-[#f2f3f5]"
    >
      {sized}
    </span>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-2.5">
    <Eyebrow className="px-1">{title}</Eyebrow>
    <div className="maties-card-row maties-divide">{children}</div>
  </section>
);

const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-5 py-4">{children}</div>
);

const MatiesAccountSection: React.FC = () => {
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
        setNotice(result.error || i18nService.t('matiesAccountLoginFailed'));
      } else {
        setNotice(i18nService.t('matiesAccountLoginOpened'));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : i18nService.t('matiesAccountLoginFailed'));
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
      console.warn('[MatiesAccount] failed to open the account page:', error);
    }
  }, []);

  const creditsLimit = quota?.creditsLimit ?? 0;
  const creditsUsed = quota?.creditsUsed ?? 0;
  const creditsRemaining = quota?.creditsRemaining ?? Math.max(creditsLimit - creditsUsed, 0);
  const usedFraction = creditsLimit > 0 ? Math.min(creditsUsed / creditsLimit, 1) : 0;
  const personName = user?.nickname || i18nService.t('user');
  const initials = getPersonInitials(user?.nickname) || '?';

  return (
    <div className="space-y-8">
      {/* The sphere and the person */}
      <div className="flex items-center gap-5 px-1 pb-1 pt-2">
        <Sphere size={64} title="Maties" />
        <div className="min-w-0">
          {isLoading ? (
            <p className="maties-subtitle">{i18nService.t('loading')}</p>
          ) : isLoggedIn ? (
            <>
              <Eyebrow>{i18nService.t('matiesAccountPersonTitle')}</Eyebrow>
              <div className="mt-1.5 flex items-center gap-2.5">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-[26px] w-[26px] shrink-0 rounded-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <span className="maties-initials h-[26px] w-[26px]">{initials}</span>
                )}
                <p className="maties-headline truncate text-[22px]">{personName}</p>
              </div>
              <p className="maties-caption mt-1.5">{i18nService.t('matiesAccountSignedInDesc')}</p>
            </>
          ) : (
            <>
              <p className="maties-headline text-[22px]">{i18nService.t('matiesAccountSignedOutTitle')}</p>
              <p className="maties-caption mt-1.5 max-w-[56ch]">{i18nService.t('matiesAccountSignedOutDesc')}</p>
            </>
          )}
        </div>
      </div>

      <Section title={i18nService.t('matiesAccountTitle')}>
        <Row>
          {isLoading ? (
            <p className="maties-subtitle">{i18nService.t('loading')}</p>
          ) : isLoggedIn ? (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="maties-row-title truncate">{personName}</p>
                <p className="maties-row-desc">{i18nService.t('matiesAccountSignedInDesc')}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" className="maties-pill-sm" onClick={() => { void handleOpenAccount(); }}>
                  {i18nService.t('matiesAccountManage')}
                </button>
                <button
                  type="button"
                  className="maties-pill-sm is-ghost"
                  onClick={() => { void handleLogout(); }}
                  disabled={busy !== null}
                >
                  {i18nService.t('matiesSignOut')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="maties-row-title">{i18nService.t('matiesAccountSignedOutTitle')}</p>
                <p className="maties-row-desc">{i18nService.t('matiesAccountSignedOutDesc')}</p>
              </div>
              <Pill tone={PillTone.Primary} compact onClick={() => { void handleLogin(); }} disabled={busy !== null}>
                {busy === 'login' ? i18nService.t('loading') : i18nService.t('matiesSignInWithClaidor')}
              </Pill>
            </div>
          )}
          {notice && <p className="maties-caption mt-2">{notice}</p>}
        </Row>
      </Section>

      {isLoggedIn && (
        <Section title={i18nService.t('matiesAccountUsageTitle')}>
          <Row>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="maties-row-title">{i18nService.t('matiesAccountUsageThisMonth')}</p>
                <p className="maties-row-desc maties-mono tabular-nums">
                  {quota
                    ? i18nService.t('matiesAccountUsageLine')
                      .replace('{used}', formatCredits(creditsUsed))
                      .replace('{limit}', formatCredits(creditsLimit))
                      .replace('{remaining}', formatCredits(creditsRemaining))
                    : i18nService.t('matiesAccountUsageUnavailable')}
                </p>
              </div>
              <button
                type="button"
                className="maties-pill-sm"
                onClick={() => { void handleRefresh(); }}
                disabled={busy !== null}
              >
                {busy === 'refresh' ? i18nService.t('loading') : i18nService.t('refresh')}
              </button>
            </div>
            {quota && (
              <div className="mt-3.5 h-[6px] w-full overflow-hidden rounded-full bg-[#f0f0f2] dark:bg-[#22252b]">
                <div
                  className="h-full rounded-full bg-[#0060d0] transition-[width]"
                  style={{ width: `${Math.round(usedFraction * 100)}%` }}
                />
              </div>
            )}
          </Row>
          <Row>
            <p className="maties-caption">{i18nService.t('matiesAccountUsageExplain')}</p>
          </Row>
        </Section>
      )}

      <Section title={i18nService.t('matiesAccountModelsTitle')}>
        {serverModels.length === 0 ? (
          <Row>
            <p className="maties-subtitle">
              {isLoggedIn ? i18nService.t('matiesAccountModelsEmpty') : i18nService.t('matiesAccountModelsSignedOut')}
            </p>
          </Row>
        ) : (
          serverModels.map((model: Model) => (
            <Row key={`${model.providerKey ?? 'server'}:${model.id}`}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <ModelMark model={model} />
                  <div className="min-w-0">
                    <p className="maties-row-title truncate">{model.name}</p>
                    {model.description && (
                      <p className="maties-row-desc truncate">{model.description}</p>
                    )}
                  </div>
                </div>
                <span className="maties-caption maties-mono shrink-0 tabular-nums">
                  {(model.costMultiplier ?? 1) === 1
                    ? i18nService.t('matiesAccountModelCostStandard')
                    : i18nService.t('matiesAccountModelCost').replace('{multiplier}', String(model.costMultiplier ?? 1))}
                </span>
              </div>
            </Row>
          ))
        )}
        <Row>
          <p className="maties-caption">{i18nService.t('matiesAccountModelsExplain')}</p>
        </Row>
      </Section>
    </div>
  );
};

export default MatiesAccountSection;
