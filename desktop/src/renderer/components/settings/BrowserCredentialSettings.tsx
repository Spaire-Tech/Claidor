import {
  KeyIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  BrowserCredentialAvailabilityReason,
  type BrowserCredentialSummary,
} from '@shared/browserCredentials/constants';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { i18nService } from '@/services/i18n';

import Modal from '../common/Modal';

const BrowserCredentialSettings: React.FC = () => {
  const [credentials, setCredentials] = useState<BrowserCredentialSummary[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [availabilityReason, setAvailabilityReason] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BrowserCredentialSummary | null>(null);
  const [origin, setOrigin] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const originInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const api = window.electron?.openclaw?.browser?.credentials;
    if (!api) {
      setAvailable(false);
      setError(i18nService.t('browserCredentialUnavailable'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [availabilityResponse, listResponse] = await Promise.all([
        api.getAvailability(),
        api.list(),
      ]);
      if (!availabilityResponse.success || !availabilityResponse.availability) {
        setAvailable(false);
        setError(i18nService.t('browserCredentialLoadFailed'));
      } else {
        setAvailable(availabilityResponse.availability.available);
        setAvailabilityReason(availabilityResponse.availability.reason);
      }
      if (listResponse.success) {
        setCredentials(listResponse.credentials ?? []);
      } else {
        setError(i18nService.t('browserCredentialLoadFailed'));
      }
    } catch {
      setAvailable(false);
      setError(i18nService.t('browserCredentialLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (showAddDialog) originInputRef.current?.focus();
  }, [showAddDialog]);

  const closeAddDialog = (force = false) => {
    if (saving && !force) return;
    setShowAddDialog(false);
    setOrigin('');
    setUsername('');
    setPassword('');
    setError('');
  };

  const saveCredential = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!origin.trim() || !username.trim() || !password) return;
    setSaving(true);
    setError('');
    try {
      const response = await window.electron.openclaw.browser.credentials.save({
        origin,
        username,
        password,
      });
      if (!response.success) {
        setError(i18nService.t('browserCredentialSaveFailed'));
        return;
      }
      closeAddDialog(true);
      await load();
    } catch {
      setError(i18nService.t('browserCredentialSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const deleteCredential = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    try {
      const response = await window.electron.openclaw.browser.credentials.delete({
        id: deleteTarget.id,
      });
      if (!response.success) {
        setError(i18nService.t('browserCredentialDeleteFailed'));
        return;
      }
      setDeleteTarget(null);
      await load();
    } catch {
      setError(i18nService.t('browserCredentialDeleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  const unavailableMessage = availabilityReason === BrowserCredentialAvailabilityReason.InsecureStorageBackend
    ? i18nService.t('browserCredentialInsecureBackend')
    : i18nService.t('browserCredentialEncryptionUnavailable');

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h4 className="maties-row-title">
            {i18nService.t('browserCredentialManagerTitle')}
          </h4>
          <p className="maties-row-desc">
            {i18nService.t('browserCredentialManagerDescription')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddDialog(true)}
          disabled={available !== true}
          className="maties-pill-sm shrink-0"
        >
          <PlusIcon className="h-4 w-4" />
          {i18nService.t('browserCredentialAdd')}
        </button>
      </div>

      {available === false && !loading ? (
        <div className="maties-caption maties-status-attention maties-raised-2 rounded-[10px] px-3 py-2">
          {unavailableMessage}
        </div>
      ) : null}
      {error && !showAddDialog && !deleteTarget ? (
        <div className="maties-caption maties-status-wrong maties-raised-2 rounded-[10px] px-3 py-2">
          {error}
        </div>
      ) : null}

      <div className="maties-card-row overflow-hidden">
        {loading ? (
          <div className="maties-caption px-4 py-3">
            {i18nService.t('loading')}
          </div>
        ) : credentials.length > 0 ? (
          credentials.map((credential, index) => (
            <div
              key={credential.id}
              className={`flex min-h-14 items-center gap-3 px-4 py-2 ${index > 0 ? 'maties-hairline-top' : ''}`}
            >
              <KeyIcon className="h-4 w-4 shrink-0 text-secondary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] text-[#1c1f23] dark:text-[#f2f3f5]">{credential.username}</div>
                <div className="maties-mono maties-caption truncate">{credential.origin}</div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(credential)}
                className="maties-icon-button h-7 w-7 hover:text-[#e0322d]"
                title={i18nService.t('delete')}
                aria-label={i18nService.t('delete')}
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          ))
        ) : (
          <div className="maties-caption px-4 py-3">
            {i18nService.t('browserCredentialEmpty')}
          </div>
        )}
      </div>

      {showAddDialog ? (
        <Modal
          onClose={closeAddDialog}
          onEscape={closeAddDialog}
          overlayClassName="maties-backdrop fixed inset-0 z-[70] flex items-center justify-center"
          className="maties-card-prose maties-in w-full max-w-[460px] p-6"
        >
          <form onSubmit={saveCredential}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="maties-row-title text-[15.5px]">
                  {i18nService.t('browserCredentialAddTitle')}
                </h3>
                <p className="maties-row-desc">
                  {i18nService.t('browserCredentialAddDescription')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => closeAddDialog()}
                className="maties-icon-button -mr-2 -mt-1"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <input
                ref={originInputRef}
                type="text"
                value={origin}
                onChange={event => setOrigin(event.target.value)}
                placeholder={i18nService.t('browserCredentialOriginPlaceholder')}
                autoComplete="off"
                className="maties-input"
              />
              <input
                type="text"
                value={username}
                onChange={event => setUsername(event.target.value)}
                placeholder={i18nService.t('browserCredentialUsernamePlaceholder')}
                autoComplete="off"
                className="maties-input"
              />
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder={i18nService.t('browserCredentialPasswordPlaceholder')}
                autoComplete="new-password"
                className="maties-input"
              />
            </div>

            {error ? <p className="maties-caption maties-status-wrong mt-3">{error}</p> : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => closeAddDialog()}
                disabled={saving}
                className="maties-pill-sm is-ghost"
              >
                {i18nService.t('cancel')}
              </button>
              <button
                type="submit"
                disabled={saving || !origin.trim() || !username.trim() || !password}
                className="maties-pill-sm is-primary"
              >
                {saving ? i18nService.t('saving') : i18nService.t('save')}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {deleteTarget ? (
        <Modal
          onClose={() => !deleting && setDeleteTarget(null)}
          onEscape={() => !deleting && setDeleteTarget(null)}
          overlayClassName="maties-backdrop fixed inset-0 z-[70] flex items-center justify-center"
          className="maties-card-prose maties-in w-full max-w-[420px] p-6"
        >
          <h3 className="maties-row-title text-[15.5px]">
            {i18nService.t('browserCredentialDeleteTitle')}
          </h3>
          <p className="maties-row-desc">
            {i18nService.t('browserCredentialDeleteDescription')
              .replace('{username}', deleteTarget.username)
              .replace('{origin}', deleteTarget.origin)}
          </p>
          {error ? <p className="maties-caption maties-status-wrong mt-3">{error}</p> : null}
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="maties-pill-sm is-ghost"
            >
              {i18nService.t('cancel')}
            </button>
            <button
              type="button"
              onClick={() => void deleteCredential()}
              disabled={deleting}
              className="maties-pill-sm is-primary"
            >
              {i18nService.t('delete')}
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
};

export default BrowserCredentialSettings;
