import {
  type ConnectionGroupId,
  type ConnectionItem,
  countConnections,
  getConnectionGroups,
  searchConnections,
} from '@shared/connections/catalog';
import { ConnectorOutcome } from '@shared/connectors/constants';
import React, { useCallback, useMemo, useState } from 'react';

import { i18nService } from '../../services/i18n';
import SearchIcon from '../icons/SearchIcon';
import ConnectionCard from './ConnectionCard';
import ConnectionPriceSheet from './ConnectionPriceSheet';
import ConnectionSoonSheet, { type SoonTarget } from './ConnectionSoonSheet';
import { useConnectionsState } from './useConnectionsState';

const GROUP_TITLE_KEYS: Record<ConnectionGroupId, string> = Object.fromEntries(
  getConnectionGroups().map((group) => [group.id, group.titleKey]),
) as Record<ConnectionGroupId, string>;

/**
 * « Some more connections » (docs/maties/onboarding.md, screen 5): the
 * count, the search, the intro line, then the eleven groups as the founder
 * drew them. Shown in the onboarding and in Settings → Apps alike.
 */
const ConnectionsCatalog: React.FC = () => {
  const { connectors, busySlug, connect, disconnect } = useConnectionsState();
  const [query, setQuery] = useState('');
  const [soonTarget, setSoonTarget] = useState<SoonTarget | null>(null);
  const [priceTarget, setPriceTarget] = useState<string | null>(null);

  const groupTitle = useCallback((groupId: ConnectionGroupId) => i18nService.t(GROUP_TITLE_KEYS[groupId]), []);
  const groups = useMemo(() => getConnectionGroups(searchConnections(query, groupTitle)), [groupTitle, query]);
  const handleSoon = useCallback((item: ConnectionItem) => setSoonTarget({ id: item.id, name: item.name }), []);
  const handleShowPrice = useCallback((item: ConnectionItem) => setPriceTarget(item.name), []);

  // A 402 can arrive on the way to the window: the price card answers it,
  // so a person never meets a button that silently does nothing.
  const handleConnect = useCallback((appSlug: string, name: string) => {
    void connect(appSlug).then((result) => {
      if (result.outcome === ConnectorOutcome.NotEntitled) setPriceTarget(name);
    });
  }, [connect]);

  return (
    <div className="flex w-full flex-col">
      <div className="mx-[2px] mb-[6px] flex flex-wrap items-center gap-[14px]">
        <span className="flex min-w-[200px] flex-1 items-baseline gap-[10px]">
          <span className="text-[24px] font-medium tracking-[-.014em] text-[#1c1f23]">
            {i18nService.t('matiesConnectionsMoreTitle')}
          </span>
          <span className="text-[16px] text-[#6b7280]">{countConnections()}</span>
        </span>
        <label className="flex h-[42px] w-full max-w-[300px] shrink-0 items-center gap-[10px] rounded-full bg-[#f2f3f5] px-[17px]">
          <SearchIcon className="h-[15px] w-[15px] shrink-0 text-[#6b7280]" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={i18nService.t('matiesConnectionsSearchPlaceholder')}
            aria-label={i18nService.t('matiesConnectionsSearchPlaceholder')}
            className="min-w-0 flex-1 border-0 bg-transparent text-[15.5px] text-[#1c1f23] outline-none placeholder:text-[#8f96a0]"
          />
        </label>
      </div>
      <p className="mx-[2px] mt-[6px] max-w-[74ch] text-[15px] leading-[1.55] text-[#6b7280] [text-wrap:pretty]">
        {i18nService.t('matiesConnectionsIntro')}
      </p>

      {groups.map((group) => (
        <section key={group.id} className="flex flex-col gap-[14px] pt-[34px]">
          <div className="flex flex-col gap-1 px-[2px]">
            <div className="flex items-baseline gap-[9px]">
              <h3 className="text-[18px] font-medium tracking-[-.008em] text-[#1c1f23]">{groupTitle(group.id)}</h3>
              <span className="maties-mono text-[13px] text-[#6b7280]">{group.items.length}</span>
            </div>
            {group.noteKey && (
              <p className="text-[14.5px] leading-[1.5] text-[#6b7280] [text-wrap:pretty]">{i18nService.t(group.noteKey)}</p>
            )}
          </div>
          <div className="grid gap-[14px] [grid-template-columns:repeat(auto-fill,minmax(380px,1fr))]">
            {group.items.map((item) => (
              <ConnectionCard
                key={item.id}
                item={item}
                connectors={connectors}
                busySlug={busySlug}
                onConnect={(appSlug) => handleConnect(appSlug, item.name)}
                onDisconnect={(appSlug, accountId) => { void disconnect(appSlug, accountId); }}
                onShowPrice={handleShowPrice}
                onSoon={handleSoon}
              />
            ))}
          </div>
        </section>
      ))}

      {groups.length === 0 && (
        <p className="py-10 text-center text-[15px] text-[#6b7280]">{i18nService.t('matiesConnectionsNoMatch')}</p>
      )}

      <ConnectionSoonSheet target={soonTarget} onClose={() => setSoonTarget(null)} />
      <ConnectionPriceSheet name={priceTarget} onClose={() => setPriceTarget(null)} />
    </div>
  );
};

export default ConnectionsCatalog;
