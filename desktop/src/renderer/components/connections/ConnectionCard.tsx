import { APP_LOGO_DIRECTORY, type ConnectionItem, ConnectionKind, connectionMonogram, ConnectionTag } from '@shared/connections/catalog';
import type { ConnectorConnection, ConnectorsState } from '@shared/connectors/constants';
import React, { useCallback, useState } from 'react';
import { useSelector } from 'react-redux';

import { i18nService } from '../../services/i18n';
import type { RootState } from '../../store';
import {
  appWebAddress,
  BrowserSignInOutcome,
  offersBrowserSignIn,
  openBrowserSignIn,
} from './browserSignIn';
import {
  ConnectionCardState,
  isChannelConfigured,
  readConnectionCard,
} from './connectionState';
import { requestAssistantBrowser, requestChannelSettings } from './constants';

/**
 * The founder's card (docs/maties/design/onboarding, screens 4 and 5): a
 * 48px logo tile with a monogram behind it, the name, one line under it,
 * and the pill at the right. Sizes and colours are the founder's exact
 * values.
 */

/** Public assets are served beside index.html, so the path is relative. */
const logoSource = (logo: string): string => `./${APP_LOGO_DIRECTORY}/${logo}`;

const TAG_LABEL_KEYS: Record<ConnectionTag, string> = {
  [ConnectionTag.ThroughYourBrowser]: 'matiesConnectionsTagBrowser',
};

/** The founder's 48px tile; `size` shrinks the whole thing for a menu row. */
export const ConnectionLogo: React.FC<{ name: string; logo?: string; size?: number }> = ({
  name,
  logo,
  size = 48,
}) => {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(logo) && !failed;
  return (
    <span
      aria-hidden="true"
      className="relative flex shrink-0 items-center justify-center bg-[#f6f7f9] font-medium text-[#4a4f57]"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.29),
        fontSize: Math.round(size * 0.375),
      }}
    >
      {!showImage && <span>{connectionMonogram(name)}</span>}
      {showImage && (
        <img
          src={logoSource(logo as string)}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
          className="object-contain"
          style={{ width: Math.round(size * 0.583), height: Math.round(size * 0.583) }}
        />
      )}
    </span>
  );
};

const TickIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="4,12.5 9.5,18 20,6.5" />
  </svg>
);

const ACTION_BUTTON_CLASS =
  'flex h-9 shrink-0 cursor-pointer items-center gap-[7px] whitespace-nowrap rounded-full border-0 px-[18px] text-[14.5px] font-medium transition-[background] duration-[120ms]';

/** « Connect » in blue on grey; « Connected » in green with a tick. */
export const ConnectionActionButton: React.FC<{
  connected: boolean;
  label?: string;
  onClick?: () => void;
}> = ({ connected, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={connected}
    className={`${ACTION_BUTTON_CLASS} ${
      connected
        ? 'cursor-default bg-[#e7f6ec] text-[#1a8547]'
        : 'bg-[#f2f3f5] text-[#0060d0] hover:bg-[#e9ebef]'
    }`}
  >
    {connected && <TickIcon />}
    <span>{connected ? i18nService.t('matiesConnectionsConnected') : label ?? i18nService.t('matiesConnectionsConnect')}</span>
  </button>
);

/** The card's frame: tile, body, action. Shared by the catalogue and the reach list. */
export const ConnectionCardShell: React.FC<{
  name: string;
  logo?: string;
  action: React.ReactNode;
  children: React.ReactNode;
  /** Gap between the name and the lines under it: 1px in the catalogue, 3px in the reach list. */
  loose?: boolean;
}> = ({ name, logo, action, children, loose = false }) => (
  <div className="flex items-center gap-4 rounded-[20px] border border-[rgba(16,22,35,.08)] bg-white px-[22px] py-5 shadow-[0_1px_2px_rgba(16,22,35,.04)]">
    <ConnectionLogo name={name} logo={logo} />
    <span className={`flex min-w-0 flex-1 flex-col ${loose ? 'gap-[3px]' : 'gap-px'}`}>
      <span className="truncate text-[16.5px] font-medium tracking-[-.006em] text-[#1c1f23]">{name}</span>
      {children}
    </span>
    {action}
  </div>
);

export const ConnectionLine: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[14px] leading-[1.5] text-[#6b7280]">{children}</span>
);

const QuietLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="shrink-0 whitespace-nowrap text-[14px] text-[#6b7280]">{children}</span>
);

/** « Disconnect » beside the tick: quiet until the pointer is on it. */
const DisconnectButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`${ACTION_BUTTON_CLASS} bg-transparent px-[13px] text-[#6b7280] hover:bg-[rgba(16,20,28,.05)] hover:text-[#1c1f23]`}
  >
    {i18nService.t('matiesConnectionsDisconnect')}
  </button>
);

/**
 * The other door, offered quietly: one sentence under the account, the act in
 * blue and the fact in muted ink. Never a second pill — a person who has just
 * connected an app and is shown another button of Connect's weight will read
 * it as the first one having failed.
 */
const BrowserSignInLine: React.FC<{
  name: string;
  /** The browser did not open; the offer stays, so it can be taken again. */
  failed: boolean;
  onClick: () => void;
}> = ({ name, failed, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="group max-w-full cursor-pointer self-start border-0 bg-transparent p-0 text-left text-[14px] leading-[1.5] text-[#6b7280]"
  >
    <span className="text-[#0060d0] group-hover:underline">
      {i18nService.t('matiesConnectionsBrowserSignIn').replace('{name}', name)}
    </span>
    {' '}
    {i18nService.t(failed
      ? 'matiesConnectionsBrowserSignInFailed'
      : 'matiesConnectionsBrowserSignInOnce')}
  </button>
);

/**
 * The line under the name of a connected card: the account when Claidor
 * names one, otherwise the day it was connected.
 */
export const connectedAccountLine = (connection: ConnectorConnection): string => {
  if (connection.name) return connection.name;
  const connectedAt = new Date(connection.connectedAt);
  if (Number.isNaN(connectedAt.getTime())) return i18nService.t('matiesConnectionsConnected');
  return i18nService
    .t('matiesConnectionsConnectedOn')
    .replace('{date}', connectedAt.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }));
};

export interface ConnectionCardProps {
  item: ConnectionItem;
  /** What Claidor says is connected, and whether this person may connect. */
  connectors: ConnectorsState;
  /** The service whose window is open or whose request is in flight. */
  busySlug: string | null;
  /** Open the sign-in window for this service. */
  onConnect: (appSlug: string) => void;
  /** Drop the account behind this card. */
  onDisconnect: (appSlug: string, accountId: string) => void;
  /** Say that connections are part of the paid plan. */
  onShowPrice: (item: ConnectionItem) => void;
  /** Open the honest sheet for something not wired yet. */
  onSoon: (item: ConnectionItem) => void;
}

const ConnectionCard: React.FC<ConnectionCardProps> = ({
  item,
  connectors,
  busySlug,
  onConnect,
  onDisconnect,
  onShowPrice,
  onSoon,
}) => {
  const imConfig = useSelector((state: RootState) => state.im.config);
  // The assistant's browser is drawn beside the conversation, so the page has
  // to be sent to the session the person is in.
  const sessionId = useSelector((state: RootState) => state.cowork.currentSessionId);
  const [signInFailed, setSignInFailed] = useState(false);

  const handleBrowserSignIn = useCallback((url: string) => {
    setSignInFailed(false);
    void openBrowserSignIn(url, sessionId).then((outcome) => {
      if (outcome === BrowserSignInOutcome.Failed) {
        setSignInFailed(true);
        return;
      }
      if (outcome === BrowserSignInOutcome.InApp) requestAssistantBrowser();
    });
  }, [sessionId]);

  let action: React.ReactNode = null;
  let line: React.ReactNode = null;
  /** Two lines under the name want more air between them than one does. */
  let loose = false;

  switch (item.kind) {
    case ConnectionKind.Account: {
      const reading = readConnectionCard(item.appSlug, connectors, busySlug);
      switch (reading.state) {
        case ConnectionCardState.Connected: {
          const webAddress = appWebAddress(item);
          const offersSignIn = offersBrowserSignIn(item, reading.state);
          loose = offersSignIn;
          line = (
            <>
              <ConnectionLine>{connectedAccountLine(reading.connection as ConnectorConnection)}</ConnectionLine>
              {offersSignIn && webAddress && (
                <BrowserSignInLine
                  name={item.name}
                  failed={signInFailed}
                  onClick={() => handleBrowserSignIn(webAddress)}
                />
              )}
            </>
          );
          action = (
            <span className="flex shrink-0 items-center gap-1">
              <ConnectionActionButton connected />
              <DisconnectButton
                onClick={() => onDisconnect(item.appSlug, (reading.connection as ConnectorConnection).accountId)}
              />
            </span>
          );
          break;
        }
        case ConnectionCardState.Locked:
          line = <ConnectionLine>{i18nService.t('matiesConnectionsPartOfPlan')}</ConnectionLine>;
          action = <ConnectionActionButton connected={false} onClick={() => onShowPrice(item)} />;
          break;
        case ConnectionCardState.Busy:
          action = <QuietLabel>{i18nService.t('matiesConnectionsWaiting')}</QuietLabel>;
          break;
        case ConnectionCardState.Unknown:
          break;
        default:
          action = <ConnectionActionButton connected={false} onClick={() => onConnect(item.appSlug)} />;
      }
      break;
    }
    case ConnectionKind.Channel: {
      const platform = item.platformId;
      action = platform ? (
        <ConnectionActionButton
          connected={isChannelConfigured(imConfig, platform)}
          onClick={() => requestChannelSettings(platform)}
        />
      ) : (
        <ConnectionActionButton connected={false} onClick={() => onSoon(item)} />
      );
      break;
    }
    case ConnectionKind.Browser:
      action = <QuietLabel>{i18nService.t('matiesConnectionsUsesBrowser')}</QuietLabel>;
      break;
    case ConnectionKind.Local:
      action = <QuietLabel>{i18nService.t('matiesConnectionsOnThisComputer')}</QuietLabel>;
      break;
    default:
      action = <ConnectionActionButton connected={false} onClick={() => onSoon(item)} />;
  }

  return (
    <ConnectionCardShell name={item.name} logo={item.logo} action={action} loose={loose}>
      {line}
      {!line && item.tag && <ConnectionLine>{i18nService.t(TAG_LABEL_KEYS[item.tag])}</ConnectionLine>}
    </ConnectionCardShell>
  );
};

export default ConnectionCard;
