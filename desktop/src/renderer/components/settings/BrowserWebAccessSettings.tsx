import { PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useRef, useState } from 'react';

import {
  BrowserCredentialSaveMode,
  type BrowserCredentialSaveMode as BrowserCredentialSaveModeValue,
  BrowserCredentialUseMode,
  type BrowserCredentialUseMode as BrowserCredentialUseModeValue,
} from '../../../shared/browserCredentials/constants';
import {
  BrowserDisplayMode,
  BrowserNetworkMode,
  BrowserProfileMode,
  type BrowserWebAccessConfig,
  normalizeBrowserHostnameList,
} from '../../../shared/browserWebAccess/constants';
import { i18nService } from '../../services/i18n';
import Modal from '../common/Modal';
import ThemedSelect from '../ui/ThemedSelect';
import BrowserCredentialSettings from './BrowserCredentialSettings';

interface BrowserWebAccessSettingsProps {
  value: BrowserWebAccessConfig;
  onChange: (value: BrowserWebAccessConfig) => void;
}

const HostnameListTarget = {
  BlockedHostnames: 'blockedHostnames',
} as const;

type HostnameListTarget = typeof HostnameListTarget[keyof typeof HostnameListTarget];

const SettingRow: React.FC<{
  title: string;
  description?: React.ReactNode;
  control?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ title, description, control, children }) => (
  <div>
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h4 className="maties-row-title">{title}</h4>
        {description ? <div className="mt-1 text-sm text-secondary">{description}</div> : null}
        {children ? <div className="mt-3">{children}</div> : null}
      </div>
      {control ? <div className="shrink-0">{control}</div> : null}
    </div>
  </div>
);

const HostnameList: React.FC<{
  title: string;
  description: string;
  hostnames: string[];
  onAdd: () => void;
  onRemove: (hostname: string) => void;
}> = ({ title, description, hostnames, onAdd, onRemove }) => (
  <section className="space-y-2">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h4 className="maties-row-title">{title}</h4>
        <p className="maties-row-desc">{description}</p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="maties-pill-sm shrink-0"
      >
        <PlusIcon className="h-4 w-4" />
        {i18nService.t('add')}
      </button>
    </div>

    <div className="maties-card-row overflow-hidden">
      {hostnames.length > 0 ? (
        hostnames.map((hostname, index) => (
          <div
            key={hostname}
            className={`flex min-h-12 items-center justify-between gap-3 px-4 py-2 ${
              index > 0 ? 'maties-hairline-top' : ''
            }`}
          >
            <span className="maties-mono truncate text-[13px] text-[#1c1f23] dark:text-[#f2f3f5]">{hostname}</span>
            <button
              type="button"
              onClick={() => onRemove(hostname)}
              className="maties-icon-button h-7 w-7 hover:text-[#e0322d]"
              title={i18nService.t('delete')}
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        ))
      ) : (
        <div className="maties-caption px-4 py-3">
          {i18nService.t('browserHostnameListEmpty')}
        </div>
      )}
    </div>
  </section>
);

const BrowserWebAccessSettings: React.FC<BrowserWebAccessSettingsProps> = ({
  value,
  onChange,
}) => {
  const [hostnameDialogTarget, setHostnameDialogTarget] = useState<HostnameListTarget | null>(null);
  const [hostnameDraft, setHostnameDraft] = useState('');
  const hostnameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (hostnameDialogTarget) {
      hostnameInputRef.current?.focus();
    }
  }, [hostnameDialogTarget]);

  const update = (patch: Partial<BrowserWebAccessConfig>) => {
    onChange({
      ...value,
      browserEnabled: true,
      profileMode: BrowserProfileMode.Managed,
      ...patch,
    });
  };

  const updateHostnames = (hostnames: string[]) => {
    update({ blockedHostnames: normalizeBrowserHostnameList(hostnames) });
  };

  const openHostnameDialog = (target: HostnameListTarget) => {
    setHostnameDraft('');
    setHostnameDialogTarget(target);
  };

  const closeHostnameDialog = () => {
    setHostnameDialogTarget(null);
    setHostnameDraft('');
  };

  const normalizedHostnameDraft = normalizeBrowserHostnameList([hostnameDraft])[0] ?? '';
  const currentDialogHostnames = hostnameDialogTarget ? value.blockedHostnames : [];
  const canAddHostname = Boolean(
    hostnameDialogTarget
    && normalizedHostnameDraft
    && !currentDialogHostnames.includes(normalizedHostnameDraft),
  );

  const submitHostnameDialog = () => {
    if (!hostnameDialogTarget || !canAddHostname) {
      return;
    }

    updateHostnames([...currentDialogHostnames, normalizedHostnameDraft]);
    closeHostnameDialog();
  };

  const removeHostname = (hostname: string) => {
    updateHostnames(value.blockedHostnames.filter(item => item !== hostname));
  };

  const hostnameDialogTitle = i18nService.t('browserAddBlockedHostnameTitle');
  const hostnameDialogDescription = i18nService.t('browserAddBlockedHostnameDescription');

  const networkModeDescription = value.networkMode === BrowserNetworkMode.Strict
    ? i18nService.t('browserNetworkStrictDescription')
    : i18nService.t('browserNetworkOpenDescription');

  return (
    <>
      <div className="space-y-8">
        <SettingRow
          title={i18nService.t('browserDisplayModeTitle')}
          description={value.displayMode === BrowserDisplayMode.InApp
            ? i18nService.t('browserDisplayModeInAppDescription')
            : i18nService.t('browserDisplayModeExternalDescription')}
          control={(
            <div className="w-[300px]">
              <ThemedSelect
                id="browser-display-mode"
                value={value.displayMode}
                onChange={(mode) => update({ displayMode: mode as BrowserDisplayMode })}
                options={[
                  {
                    value: BrowserDisplayMode.InApp,
                    label: i18nService.t('browserDisplayModeInApp'),
                  },
                  {
                    value: BrowserDisplayMode.External,
                    label: i18nService.t('browserDisplayModeExternal'),
                  },
                ]}
              />
            </div>
          )}
        />

        <SettingRow
          title={i18nService.t('browserCredentialUseModeTitle')}
          description={value.credentialUseMode === BrowserCredentialUseMode.Disabled
            ? i18nService.t('browserCredentialUseModeDisabledDescription')
            : value.credentialUseMode === BrowserCredentialUseMode.OncePerTask
              ? i18nService.t('browserCredentialUseModeOncePerTaskDescription')
              : i18nService.t('browserCredentialUseModeAlwaysAskDescription')}
          control={(
            <div className="w-[300px]">
              <ThemedSelect
                id="browser-credential-use-mode"
                value={value.credentialUseMode}
                onChange={(mode) => update({
                  credentialUseMode: mode as BrowserCredentialUseModeValue,
                })}
                options={[
                  {
                    value: BrowserCredentialUseMode.AlwaysAsk,
                    label: i18nService.t('browserCredentialUseModeAlwaysAsk'),
                  },
                  {
                    value: BrowserCredentialUseMode.OncePerTask,
                    label: i18nService.t('browserCredentialUseModeOncePerTask'),
                  },
                  {
                    value: BrowserCredentialUseMode.Disabled,
                    label: i18nService.t('browserCredentialUseModeDisabled'),
                  },
                ]}
              />
            </div>
          )}
        />

        <SettingRow
          title={i18nService.t('browserCredentialSaveModeTitle')}
          description={value.credentialSaveMode === BrowserCredentialSaveMode.Never
            ? i18nService.t('browserCredentialSaveModeNeverDescription')
            : i18nService.t('browserCredentialSaveModeAskDescription')}
          control={(
            <div className="w-[300px]">
              <ThemedSelect
                id="browser-credential-save-mode"
                value={value.credentialSaveMode}
                onChange={(mode) => update({
                  credentialSaveMode: mode as BrowserCredentialSaveModeValue,
                })}
                options={[
                  {
                    value: BrowserCredentialSaveMode.Ask,
                    label: i18nService.t('browserCredentialSaveModeAsk'),
                  },
                  {
                    value: BrowserCredentialSaveMode.Never,
                    label: i18nService.t('browserCredentialSaveModeNever'),
                  },
                ]}
              />
            </div>
          )}
        />

        <SettingRow
          title={i18nService.t('browserNetworkSectionTitle')}
          description={networkModeDescription}
          control={(
            <div className="w-[300px]">
              <ThemedSelect
                id="browser-network-mode"
                value={value.networkMode}
                onChange={(mode) => update({ networkMode: mode as BrowserNetworkMode })}
                options={[
                  { value: BrowserNetworkMode.ProxyCompatible, label: i18nService.t('browserNetworkOpen') },
                  { value: BrowserNetworkMode.Strict, label: i18nService.t('browserNetworkStrict') },
                ]}
              />
            </div>
          )}
        />

        <HostnameList
          title={i18nService.t('browserBlockedHostnames')}
          description={i18nService.t('browserBlockedHostnamesDescription')}
          hostnames={value.blockedHostnames}
          onAdd={() => openHostnameDialog(HostnameListTarget.BlockedHostnames)}
          onRemove={removeHostname}
        />

        <BrowserCredentialSettings />

      </div>

      {hostnameDialogTarget ? (
        <Modal
          onClose={closeHostnameDialog}
          onEscape={closeHostnameDialog}
          overlayClassName="maties-backdrop fixed inset-0 z-[60] flex items-center justify-center"
          className="maties-card-prose maties-in w-full max-w-[420px] p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="maties-row-title text-[15.5px]">{hostnameDialogTitle}</h3>
              <p className="maties-row-desc">{hostnameDialogDescription}</p>
            </div>
            <button
              type="button"
              onClick={closeHostnameDialog}
              className="maties-icon-button -mr-2 -mt-1"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>

          <input
            ref={hostnameInputRef}
            type="text"
            value={hostnameDraft}
            onChange={(event) => setHostnameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitHostnameDialog();
              }
            }}
            placeholder={i18nService.t('browserHostnameInputPlaceholder')}
            className="maties-input mt-4"
          />

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeHostnameDialog}
              className="maties-pill-sm is-ghost"
            >
              {i18nService.t('cancel')}
            </button>
            <button
              type="button"
              onClick={submitHostnameDialog}
              disabled={!canAddHostname}
              className="maties-pill-sm is-primary"
            >
              {i18nService.t('add')}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
};

export default BrowserWebAccessSettings;
