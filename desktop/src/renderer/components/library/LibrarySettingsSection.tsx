import React, { useCallback, useEffect, useState } from 'react';

import {
  type LibraryContentConfig,
  LibraryContentLimits,
  LibraryContentPhase,
  type LibraryContentStatus,
} from '../../../shared/library/contentConstants';
import { i18nService } from '../../services/i18n';
import {
  describeLibraryDocuments,
  describeLibraryFailures,
  describeLibraryPhase,
} from './librarySettingsText';

/**
 * Settings → Library: the personal library (docs/swen/library.md).
 *
 * A switch, the folders being indexed, the kinds of files read, a status
 * line, and Pause / Rebuild. Everything is built on this computer; this
 * screen only talks to the main process over `window.electron.libraryContent`.
 */

const RELATIVE_TIME_TICK_MS = 30_000;

const LibrarySettingsBusy = {
  Toggle: 'toggle',
  Folders: 'folders',
  Pause: 'pause',
  Rebuild: 'rebuild',
} as const;
type LibrarySettingsBusy = typeof LibrarySettingsBusy[keyof typeof LibrarySettingsBusy];

// The small building blocks below mirror SwenAccountSection so the two
// screens look the same; they are kept local on purpose.

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

// Same look as the SettingsSwitch inside Settings.tsx, which is not exported.
const Switch: React.FC<{
  checked: boolean;
  label: string;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}> = ({ checked, label, disabled, onClick }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => {
      void onClick();
    }}
    disabled={disabled}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
      disabled ? 'opacity-50 cursor-not-allowed' : ''
    } ${
      checked
        ? 'bg-primary'
        : 'bg-gray-300 dark:bg-gray-600'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

const FolderList: React.FC<{
  folders: string[];
  emptyText: string;
  disabled: boolean;
  onRemove: (folder: string) => void;
}> = ({ folders, emptyText, disabled, onRemove }) => {
  if (folders.length === 0) {
    return <p className="text-sm text-secondary">{emptyText}</p>;
  }
  return (
    <ul className="space-y-2">
      {folders.map((folder) => (
        <li key={folder} className="flex items-center justify-between gap-4">
          <span className="min-w-0 truncate text-sm text-foreground" title={folder}>{folder}</span>
          <SecondaryButton onClick={() => onRemove(folder)} disabled={disabled}>
            {i18nService.t('librarySettingsRemove')}
          </SecondaryButton>
        </li>
      ))}
    </ul>
  );
};

const t = (key: string): string => i18nService.t(key);

const LibrarySettingsSection: React.FC = () => {
  const [config, setConfig] = useState<LibraryContentConfig | null>(null);
  const [status, setStatus] = useState<LibraryContentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<LibrarySettingsBusy | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const api = window.electron?.libraryContent;
    if (!api) {
      setNotice(t('librarySettingsUnavailable'));
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    Promise.all([api.getConfig(), api.getStatus()])
      .then(([loadedConfig, loadedStatus]) => {
        if (cancelled) return;
        setConfig(loadedConfig);
        setStatus(loadedStatus);
      })
      .catch((error) => {
        console.warn('[LibrarySettings] failed to load the library settings:', error);
        if (!cancelled) setNotice(t('librarySettingsLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const unsubscribe = api.onStatusChanged((nextStatus) => {
      if (!cancelled) setStatus(nextStatus);
    });
    const ticker = window.setInterval(() => setNow(Date.now()), RELATIVE_TIME_TICK_MS);
    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(ticker);
    };
  }, []);

  const applyConfig = useCallback(async (
    update: Partial<LibraryContentConfig>,
    reason: LibrarySettingsBusy,
  ) => {
    const api = window.electron?.libraryContent;
    if (!api) return;
    setBusy(reason);
    setNotice(null);
    try {
      const next = await api.setConfig(update);
      setConfig(next);
    } catch (error) {
      console.warn('[LibrarySettings] failed to save the library settings:', error);
      setNotice(t('librarySettingsSaveFailed'));
    } finally {
      setBusy(null);
    }
  }, []);

  const handleToggle = useCallback(() => {
    if (!config) return;
    void applyConfig({ enabled: !config.enabled }, LibrarySettingsBusy.Toggle);
  }, [applyConfig, config]);

  const addFolder = useCallback(async (field: 'folders' | 'excludedFolders') => {
    const api = window.electron?.libraryContent;
    if (!api || !config) return;
    const current = config[field];
    if (current.length >= LibraryContentLimits.MaxFolders) {
      setNotice(t('librarySettingsTooManyFolders').replace('{max}', String(LibraryContentLimits.MaxFolders)));
      return;
    }
    let picked: string | null = null;
    try {
      picked = await api.pickFolder();
    } catch (error) {
      console.warn('[LibrarySettings] the folder dialog failed:', error);
      setNotice(t('librarySettingsActionFailed'));
      return;
    }
    if (!picked || current.includes(picked)) return;
    await applyConfig({ [field]: [...current, picked] }, LibrarySettingsBusy.Folders);
  }, [applyConfig, config]);

  const removeFolder = useCallback((field: 'folders' | 'excludedFolders', folder: string) => {
    if (!config) return;
    void applyConfig(
      { [field]: config[field].filter((entry) => entry !== folder) },
      LibrarySettingsBusy.Folders,
    );
  }, [applyConfig, config]);

  const handlePauseResume = useCallback(async () => {
    const api = window.electron?.libraryContent;
    if (!api || !status) return;
    setBusy(LibrarySettingsBusy.Pause);
    setNotice(null);
    try {
      setStatus(await api.setPaused(status.phase !== LibraryContentPhase.Paused));
    } catch (error) {
      console.warn('[LibrarySettings] pause/resume failed:', error);
      setNotice(t('librarySettingsActionFailed'));
    } finally {
      setBusy(null);
    }
  }, [status]);

  const handleRebuild = useCallback(async () => {
    const api = window.electron?.libraryContent;
    if (!api) return;
    if (!window.confirm(t('librarySettingsRebuildConfirm'))) return;
    setBusy(LibrarySettingsBusy.Rebuild);
    setNotice(null);
    try {
      setStatus(await api.rebuild());
    } catch (error) {
      console.warn('[LibrarySettings] rebuild failed:', error);
      setNotice(t('librarySettingsActionFailed'));
    } finally {
      setBusy(null);
    }
  }, []);

  if (loading) {
    return <p className="text-sm text-secondary">{t('librarySettingsLoading')}</p>;
  }

  const enabled = config?.enabled ?? false;
  const folders = config?.folders ?? [];
  const excludedFolders = config?.excludedFolders ?? [];
  const isPaused = status?.phase === LibraryContentPhase.Paused;
  const isOff = !enabled || !status || status.phase === LibraryContentPhase.Off;
  const failures = status ? describeLibraryFailures(status, t) : '';

  return (
    <div className="space-y-8">
      <SectionCard title={t('librarySettingsTitle')}>
        <Row>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{t('librarySettingsSwitchLabel')}</p>
              <p className="mt-0.5 text-xs text-secondary">{t('librarySettingsSwitchDesc')}</p>
            </div>
            <Switch
              checked={enabled}
              label={t('librarySettingsSwitchLabel')}
              disabled={!config || busy !== null}
              onClick={handleToggle}
            />
          </div>
          {notice && <p className="mt-2 text-xs text-secondary">{notice}</p>}
        </Row>
      </SectionCard>

      <div className={`space-y-8 transition-opacity ${enabled ? '' : 'opacity-50'}`}>
        <SectionCard title={t('librarySettingsFoldersTitle')}>
          <Row>
            <p className="mb-3 text-xs text-secondary">{t('librarySettingsFoldersDesc')}</p>
            <FolderList
              folders={folders}
              emptyText={t('librarySettingsFoldersEmpty')}
              disabled={!config || busy !== null}
              onRemove={(folder) => removeFolder('folders', folder)}
            />
            <div className="mt-3">
              <PrimaryButton
                onClick={() => { void addFolder('folders'); }}
                disabled={!config || busy !== null}
              >
                {t('librarySettingsAddFolder')}
              </PrimaryButton>
            </div>
          </Row>
          <Row>
            <p className="text-sm font-medium text-foreground">{t('librarySettingsSkippedTitle')}</p>
            <p className="mb-3 mt-0.5 text-xs text-secondary">{t('librarySettingsSkippedDesc')}</p>
            <FolderList
              folders={excludedFolders}
              emptyText={t('librarySettingsSkippedEmpty')}
              disabled={!config || busy !== null}
              onRemove={(folder) => removeFolder('excludedFolders', folder)}
            />
            <div className="mt-3">
              <SecondaryButton
                onClick={() => { void addFolder('excludedFolders'); }}
                disabled={!config || busy !== null}
              >
                {t('librarySettingsAddFolder')}
              </SecondaryButton>
            </div>
          </Row>
        </SectionCard>

        <SectionCard title={t('librarySettingsWhatIsReadTitle')}>
          <Row>
            <p className="text-sm text-secondary">{t('librarySettingsWhatIsRead')}</p>
          </Row>
        </SectionCard>

        <SectionCard title={t('librarySettingsStatusTitle')}>
          <Row>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {status ? describeLibraryPhase(status, t) : t('librarySettingsPhaseOff')}
                </p>
                {status && (
                  <p className="mt-0.5 text-xs text-secondary">
                    {describeLibraryDocuments(status, now, t)}
                  </p>
                )}
                {failures && <p className="mt-0.5 text-xs text-secondary">{failures}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <SecondaryButton
                  onClick={() => { void handlePauseResume(); }}
                  disabled={isOff || busy !== null}
                >
                  {isPaused ? t('librarySettingsResume') : t('librarySettingsPause')}
                </SecondaryButton>
                <SecondaryButton
                  onClick={() => { void handleRebuild(); }}
                  disabled={isOff || busy !== null}
                >
                  {t('librarySettingsRebuild')}
                </SecondaryButton>
              </div>
            </div>
          </Row>
        </SectionCard>
      </div>
    </div>
  );
};

export default LibrarySettingsSection;
