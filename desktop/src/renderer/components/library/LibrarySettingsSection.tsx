import React, { useCallback, useEffect, useState } from 'react';

import {
  type LibraryContentConfig,
  LibraryContentLimits,
  LibraryContentPhase,
  type LibraryContentStatus,
} from '../../../shared/library/contentConstants';
import { i18nService } from '../../services/i18n';
import Eyebrow from '../design/Eyebrow';
import Switch from '../design/Switch';
import { announceSettingsSaved } from '../settings/settingsSavedSignal';
import {
  describeLibraryCloudOnly,
  describeLibraryDocuments,
  describeLibraryFailures,
  describeLibraryPhase,
} from './librarySettingsText';

/**
 * Settings → Library: the personal library (docs/maties/library.md).
 *
 * A switch, the folders being indexed, the kinds of files read, a status
 * line, and Pause / Rebuild. Everything is built on this computer; this
 * screen only talks to the main process over `window.electron.libraryContent`.
 * The tab saves on change and says so through the sheet's « Saved ».
 */

const RELATIVE_TIME_TICK_MS = 30_000;

const LibrarySettingsBusy = {
  Toggle: 'toggle',
  Folders: 'folders',
  Pause: 'pause',
  Rebuild: 'rebuild',
} as const;
type LibrarySettingsBusy = typeof LibrarySettingsBusy[keyof typeof LibrarySettingsBusy];

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-2.5">
    <Eyebrow className="px-1">{title}</Eyebrow>
    <div className="maties-card-row maties-divide">{children}</div>
  </section>
);

const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-5 py-4">{children}</div>
);

const PrimaryButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ onClick, disabled, children }) => (
  <button type="button" onClick={onClick} disabled={disabled} className="maties-pill-sm is-primary">
    {children}
  </button>
);

const SecondaryButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ onClick, disabled, children }) => (
  <button type="button" onClick={onClick} disabled={disabled} className="maties-pill-sm">
    {children}
  </button>
);

const FolderList: React.FC<{
  folders: string[];
  emptyText: string;
  disabled: boolean;
  onRemove: (folder: string) => void;
}> = ({ folders, emptyText, disabled, onRemove }) => {
  if (folders.length === 0) {
    return <p className="maties-caption">{emptyText}</p>;
  }
  return (
    <ul className="space-y-2">
      {folders.map((folder) => (
        <li key={folder} className="flex items-center justify-between gap-4">
          <span className="maties-mono min-w-0 truncate text-[12.5px] text-[#1c1f23] dark:text-[#f2f3f5]" title={folder}>{folder}</span>
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
      announceSettingsSaved();
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
    return <p className="maties-subtitle">{t('librarySettingsLoading')}</p>;
  }

  const enabled = config?.enabled ?? false;
  const folders = config?.folders ?? [];
  const excludedFolders = config?.excludedFolders ?? [];
  const isPaused = status?.phase === LibraryContentPhase.Paused;
  const isOff = !enabled || !status || status.phase === LibraryContentPhase.Off;
  const failures = status ? describeLibraryFailures(status, t) : '';
  const cloudOnly = status ? describeLibraryCloudOnly(status, t) : '';

  return (
    <div className="space-y-8">
      <SectionCard title={t('librarySettingsTitle')}>
        <Row>
          <div className="flex items-center justify-between gap-6">
            <div className="min-w-0">
              <p className="maties-row-title">{t('librarySettingsSwitchLabel')}</p>
              <p className="maties-row-desc">{t('librarySettingsSwitchDesc')}</p>
            </div>
            <Switch
              checked={enabled}
              label={t('librarySettingsSwitchLabel')}
              disabled={!config || busy !== null}
              onChange={handleToggle}
            />
          </div>
          {notice && <p className="maties-caption mt-2">{notice}</p>}
        </Row>
      </SectionCard>

      <div className={`space-y-8 transition-opacity ${enabled ? '' : 'opacity-50'}`}>
        <SectionCard title={t('librarySettingsFoldersTitle')}>
          <Row>
            <p className="maties-row-desc mb-3 mt-0">{t('librarySettingsFoldersDesc')}</p>
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
            <p className="maties-row-title">{t('librarySettingsSkippedTitle')}</p>
            <p className="maties-row-desc mb-3">{t('librarySettingsSkippedDesc')}</p>
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
            <p className="maties-row-desc mt-0">{t('librarySettingsWhatIsRead')}</p>
          </Row>
        </SectionCard>

        <SectionCard title={t('librarySettingsStatusTitle')}>
          <Row>
            <div className="flex items-center justify-between gap-6">
              <div className="min-w-0">
                <p className="maties-row-title">
                  {status ? describeLibraryPhase(status, t) : t('librarySettingsPhaseOff')}
                </p>
                {status && (
                  <p className="maties-row-desc">
                    {describeLibraryDocuments(status, now, t)}
                  </p>
                )}
                {cloudOnly && <p className="maties-row-desc">{cloudOnly}</p>}
                {failures && <p className="maties-row-desc maties-status-attention">{failures}</p>}
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
