import React, { useEffect, useState } from 'react';

import { i18nService } from '../../services/i18n';
import { addWantedConnection, readWantedConnections } from '../../services/wantedConnections';
import Modal from '../common/Modal';
import Pill, { PillTone } from '../design/Pill';
import { SoonSheetState } from './constants';

export interface SoonTarget {
  /** Catalogue id, stored under `connections.wanted` on « Tell me when ». */
  id: string;
  name: string;
}

export interface ConnectionSoonSheetProps {
  target: SoonTarget | null;
  onClose: () => void;
}

/**
 * The honest sheet for anything not wired yet (docs/maties/onboarding.md):
 * it says so in one line, and « Tell me when » remembers the wish.
 */
const ConnectionSoonSheet: React.FC<ConnectionSoonSheetProps> = ({ target, onClose }) => {
  const [state, setState] = useState<SoonSheetState>(SoonSheetState.Asking);

  useEffect(() => {
    if (!target) return undefined;
    let active = true;
    setState(SoonSheetState.Asking);
    void readWantedConnections().then((wanted) => {
      if (active && wanted.includes(target.id)) setState(SoonSheetState.Told);
    });
    return () => { active = false; };
  }, [target]);

  if (!target) return null;

  const handleTellMeWhen = async () => {
    setState(SoonSheetState.Saving);
    try {
      await addWantedConnection(target.id);
      setState(SoonSheetState.Told);
    } catch (error) {
      console.error('[Connections] Could not remember the wish', error);
      setState(SoonSheetState.Asking);
    }
  };

  const told = state === SoonSheetState.Told;

  return (
    <Modal
      onClose={onClose}
      onEscape={onClose}
      overlayClassName="maties-backdrop fixed inset-0 z-50 flex items-center justify-center px-4"
      className="maties-card-prose maties-in w-full max-w-[420px] p-7"
    >
      <div role="dialog" aria-modal="true" aria-labelledby="maties-connection-soon-title">
        <h2 id="maties-connection-soon-title" className="maties-row-title text-[16.5px]">
          {i18nService.t('matiesConnectionsSoonTitle').replace('{name}', target.name)}
        </h2>
        <p className="mt-2 text-[14px] leading-[1.5] text-[#6b7280]">
          {i18nService.t('matiesConnectionsSoonBody')}
        </p>
        <div className="mt-6 flex items-center justify-end gap-2">
          <Pill tone={PillTone.Ghost} compact onClick={onClose}>
            {i18nService.t('matiesConnectionsClose')}
          </Pill>
          {told ? (
            <span className="flex h-8 items-center px-[13px] text-[13.5px] font-medium text-[#1f8a4c]">
              {i18nService.t('matiesConnectionsTold')}
            </span>
          ) : (
            <Pill
              tone={PillTone.Primary}
              compact
              disabled={state === SoonSheetState.Saving}
              onClick={() => { void handleTellMeWhen(); }}
            >
              {i18nService.t('matiesConnectionsTellMeWhen')}
            </Pill>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ConnectionSoonSheet;
