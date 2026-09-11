import { REACH_ENTRIES, reachAddressFor, type ReachEntry, ReachKind } from '@shared/connections/catalog';
import React, { useState } from 'react';
import { useSelector } from 'react-redux';

import { i18nService } from '../../services/i18n';
import type { RootState } from '../../store';
import { ConnectionActionButton, ConnectionCardShell, ConnectionLine } from './ConnectionCard';
import ConnectionSoonSheet, { type SoonTarget } from './ConnectionSoonSheet';
import { isChannelConfigured } from './connectionState';
import { requestChannelSettings } from './constants';
import { useConnectionsState } from './useConnectionsState';

export interface ReachListProps {
  assistantName: string;
}

/**
 * « How to reach {name} » (docs/maties/onboarding.md, screen 4): the six
 * cards. The address card shows the assistant's own address; a channel
 * the app offers opens its settings; the rest open the honest sheet.
 */
const ReachList: React.FC<ReachListProps> = ({ assistantName }) => {
  useConnectionsState();
  const imConfig = useSelector((state: RootState) => state.im.config);
  const [soonTarget, setSoonTarget] = useState<SoonTarget | null>(null);

  const renderAction = (entry: ReachEntry): React.ReactNode => {
    switch (entry.kind) {
      case ReachKind.Address:
        return <ConnectionActionButton connected />;
      case ReachKind.Channel:
        return (
          <ConnectionActionButton
            connected={isChannelConfigured(imConfig, entry.platformId)}
            onClick={() => requestChannelSettings(entry.platformId)}
          />
        );
      default:
        return (
          <ConnectionActionButton
            connected={false}
            label={entry.buttonKey ? i18nService.t(entry.buttonKey) : undefined}
            onClick={() => setSoonTarget({ id: entry.id, name: entry.name })}
          />
        );
    }
  };

  return (
    <div className="flex flex-col gap-[14px]">
      {REACH_ENTRIES.map((entry) => (
        <ConnectionCardShell key={entry.id} name={entry.name} logo={entry.logo} action={renderAction(entry)} loose>
          {entry.kind === ReachKind.Address ? (
            <>
              <ConnectionLine>
                {i18nService.t('matiesConnectionsReachAddressLine').replace('{name}', assistantName)}
              </ConnectionLine>
              <span className="maties-mono text-[13.5px] text-[#1c1f23]">
                {reachAddressFor(assistantName)}
              </span>
            </>
          ) : (
            entry.lineKey && <ConnectionLine>{i18nService.t(entry.lineKey)}</ConnectionLine>
          )}
        </ConnectionCardShell>
      ))}
      <ConnectionSoonSheet target={soonTarget} onClose={() => setSoonTarget(null)} />
    </div>
  );
};

export default ReachList;
