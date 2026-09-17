import '../tokens.css';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import { AgentId } from '../../../shared/agent/constants';
import { describeBuild, DEV_BUILD } from '../../../shared/buildStamp/constants';
import { STEP_TWO_TITLE, stepTwoKickoff } from '../../../shared/onboarding/stepTwo';
import { type SettingsTab, tabForRow } from '../../../shared/settings/rows';
import { authService } from '../../services/auth';
import { configService, ConfigServiceEvent } from '../../services/config';
import { coworkService } from '../../services/cowork';
import type { RootState } from '../../store';
import { AgentPanel } from '../agent/AgentPanel';
import { useConnections } from '../connections/useConnections';
import { Onboarding } from '../onboarding/Onboarding';
import { electronOnboardingBridge } from '../onboarding/useOnboarding';
import { ComputerPanel } from '../panel/ComputerPanel';
import { Settings } from '../settings/Settings';
import { useSettings } from '../settings/useSettings';
import { composeAuthHandlers } from '../thread/staffingCards';
import { useAskInput } from '../thread/useAskInput';
import { useCreateAgent } from '../thread/useCreateAgent';
import { useProposeConnector } from '../thread/useProposeConnector';
import { useRoster } from '../thread/useRoster';
import { supportMailto } from './account';
import { AccountMenu } from './AccountMenu';
import { Apps } from './Apps';
import { MessagesShell } from './MessagesShell';
import { SignIn } from './SignIn';
import { useDictation } from './useDictation';
import { useMessagesShell } from './useMessagesShell';

/**
 * The app.
 *
 * Two states and no third: signed out, which is one screen, and signed
 * in, which is the conversation. There is no loading screen between them
 * because there is nothing to wait for — the sidebar arrives with the
 * agents it has and fills in as sessions load, which is how a list should
 * behave.
 *
 * Mounted behind a switch (`App.tsx`) while the old shell is still in the
 * tree. Nothing here reaches into the old screens and nothing there
 * reaches into this, so either can be removed without touching the other.
 */
export function CaisraApp(): JSX.Element {
  const signedIn = useSelector((state: RootState) => state.auth.isLoggedIn);
  const quota = useSelector((state: RootState) => state.auth.quota);
  const [signInError, setSignInError] = useState<string | undefined>();
  const [accountOpen, setAccountOpen] = useState(false);
  // Asked once, for the Support mail draft. It cannot change underneath
  // somebody while the app is open. The version alone says nothing —
  // every build has the same one — so the commit and build time go too.
  const [appVersion, setAppVersion] = useState<string>();
  useEffect(() => {
    let current = true;
    void Promise.all([
      window.electron?.appInfo?.getVersion?.(),
      window.electron?.appInfo?.getBuildInfo?.().catch(() => DEV_BUILD),
    ])
      .then(([version, build]) => {
        if (current && version) setAppVersion(describeBuild(version, build ?? DEV_BUILD));
      })
      .catch(() => { /* the draft says "unknown", which is true */ });
    return () => { current = false; };
  }, []);
  // Settings is ours now. The account menu used to open NetEase's
  // thirteen tabs — providers, API keys, skins, IM platforms, a growth
  // tour — which is the app this one was carved out of, not this one.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settings = useSettings(settingsOpen);
  // A settings pill in the thread (`caisra://settings/<row>`) opens
  // Settings on the tab that row sits on; a row that does not exist just
  // opens Settings.
  const [settingsTab, setSettingsTab] = useState<SettingsTab>();
  const onOpenSetting = useCallback((rowId: string) => {
    setAccountOpen(false);
    setSettingsTab(tabForRow(rowId, settings));
    setSettingsOpen(true);
  }, [settings]);
  const dictation = useDictation();
  const shell = useMessagesShell();
  // The cards asking for something typed. Kept beside the messages rather
  // than inside them: a password prompt is not a message, and it must not
  // scroll back into view a week later with an empty box.
  const askInput = useAskInput();
  // Yodo asking to stand up an agent: the permission card, answered
  // through the staffing bridge rather than the engine's approval.
  const staffing = useCreateAgent(shell.activeName);
  const auth = useMemo(
    () => composeAuthHandlers(shell.auth, { onDecide: staffing.onDecide }),
    [shell.auth, staffing.onDecide],
  );
  // "Your starter team": the roster card of step two, answered through
  // the staffing bridge like the card above.
  const roster = useRoster();
  // An agent proposing a connector: the onboarding "App access requested"
  // card, with Install. Install runs the same Connect the Apps screen
  // runs, and the answer goes back through the connectors bridge.
  const connector = useProposeConnector();
  const connections = useConnections(shell.appsOpen);

  // `nickname` is the only display name the profile carries; everything
  // else on it is an identifier. A signed-in person with no nickname gets
  // the word rather than a number.
  const accountName = useSelector(
    (state: RootState) => state.auth.user?.nickname?.trim() || 'Account',
  );

  useEffect(() => {
    if (signedIn) setSignInError(undefined);
  }, [signedIn]);

  // The first step of onboarding plays once per install, after sign-in
  // and before the conversation: Yodo, the Chief of Staff, and one small
  // thing done on this Mac. `Get Started` writes the date; there is no
  // way back to it, and nothing on a screen to switch it off.
  const [onboarded, setOnboarded] = useState<boolean>(() => !!configService.getConfig().onboardingDoneAt);
  useEffect(() => {
    const reread = (): void => setOnboarded(!!configService.getConfig().onboardingDoneAt);
    window.addEventListener(ConfigServiceEvent.Updated, reread);
    return () => window.removeEventListener(ConfigServiceEvent.Updated, reread);
  }, []);
  const onboardingBridge = useMemo(() => electronOnboardingBridge(), []);

  if (!signedIn) {
    return (
      <SignIn
        error={signInError}
        onSignIn={async () => {
          try {
            await authService.login();
          } catch (error) {
            // In a sentence, in the same grey as everything else. The app
            // does not shout anywhere, and least of all at somebody who
            // has not got in yet.
            setSignInError(
              error instanceof Error && error.message
                ? `That did not go through — ${error.message}`
                : 'That did not go through. Try again?',
            );
          }
        }}
      />
    );
  }

  if (!onboarded) {
    return (
      <Onboarding
        userName={accountName === 'Account' ? '' : accountName}
        {...(onboardingBridge ? { bridge: onboardingBridge } : {})}
        onDone={work => {
          setOnboarded(true);
          const userName = accountName === 'Account' ? '' : accountName;
          void configService.updateConfig({ onboardingDoneAt: Date.now(), onboardingWorkType: work.workType }).catch(() => {
            // It plays again next launch, which is the cheaper mistake.
          });
          // Step two: Yodo speaks first. The app's own opening turn goes
          // to him hidden, so the conversation starts with his bubble and
          // not one of the person's (`shared/onboarding/stepTwo.ts`).
          void coworkService.startSession({
            prompt: stepTwoKickoff({ userName, workType: work.workType, ownWords: work.ownWords }),
            hidden: true,
            title: STEP_TWO_TITLE,
            agentId: AgentId.Main,
          }).catch(() => {
            // The thread is empty and Yodo waits to be spoken to; the
            // composer is right there.
          });
        }}
      />
    );
  }

  return (
    <MessagesShell
      agents={shell.agents}
      activeId={shell.activeId}
      activeName={shell.activeName}
      activeAvatar={shell.activeAvatar}
      wornAvatars={shell.wornAvatars}
      items={[...shell.items, ...askInput.items, ...staffing.items, ...roster.items, ...connector.items]}
      dayStamp={shell.dayStamp}
      typing={shell.typing}
      mode={shell.mode}
      accountName={accountName}
      choice={shell.choice}
      auth={auth}
      parts={{ ...shell.parts, onOpenSetting }}
      waiting={shell.waiting}
      secret={askInput.handlers}
      roster={roster.handlers}
      connector={connector.handlers}
      onSelect={shell.onSelect}
      onAskDelete={shell.onAskDelete}
      onSend={shell.onSend}
      onMode={shell.onMode}
      onTeach={shell.onTeach}
      dictation={dictation}
      onShareTemplate={shell.onShareTemplate}
      composing={shell.composing}
      onCompose={() => { setSettingsOpen(false); shell.onCompose(); }}
      onCloseCompose={shell.onCloseCompose}
      onPickAgent={shell.onPickAgent}
      onCreateAgent={shell.onCreateAgent}
      onApps={() => { setSettingsOpen(false); shell.onApps(); }}
      apps={shell.appsOpen && (
        <Apps
          connections={connections}
          available={shell.presets}
          installedIds={shell.installedIds}
          busyId={shell.busyPresetId}
          onInstall={shell.onInstallPreset}
          onUse={shell.onUsePreset}
          onClose={shell.onCloseApps}
        />
      )}
      // Back is the conversation, from any screen: Settings is this
      // file's state, the rest are the hook's, and both close together.
      onBackToChat={() => {
        setSettingsOpen(false);
        setSettingsTab(undefined);
        setAccountOpen(false);
        shell.onBackToChat();
      }}
      onAccount={() => setAccountOpen(open => !open)}
      accountMenu={accountOpen && (
        <AccountMenu
          quota={quota}
          onSettings={() => { setAccountOpen(false); shell.onBackToChat(); setSettingsOpen(true); }}
          onSupport={() => {
            setAccountOpen(false);
            void window.electron?.shell?.openExternal?.(supportMailto({
              version: appVersion,
              platform: window.electron?.platform,
            }));
          }}
          // One account at a time, so signing in as somebody else is what
          // adding an account means here. The browser flow is the same one
          // the sign-in screen uses.
          onAddAccount={() => { setAccountOpen(false); void authService.login(); }}
          onLogOut={() => { setAccountOpen(false); void authService.logout(); }}
          onClose={() => setAccountOpen(false)}
        />
      )}
      // The name in the header opens the agent panel — the 15 September
      // canvas's `toggleAgentPanel`. The five-tab detail sheet
      // (`agent/AgentDetail.tsx`) is no longer reachable from here; it was
      // mine, not the founder's, and the panel is what they drew.
      onOpenAgent={shell.onToggleAgentPanel}
      agentPanel={shell.agentPanelOpen && shell.activeAgent ? (
        <AgentPanel
          agent={shell.activeAgent}
          asking={shell.agentPanelAsking}
          {...(shell.activeAgent.deletable ? { onDelete: shell.onConfirmDelete } : {})}
          onChange={shell.onEditAgent}
          onClose={shell.onCloseAgentPanel}
        />
      ) : undefined}
      settings={settingsOpen && (
        <Settings
          {...settings}
          {...(settingsTab ? { initialTab: settingsTab } : {})}
          onClose={() => { setSettingsOpen(false); setSettingsTab(undefined); }}
        />
      )}
      onOpenPanel={shell.onOpenPanel}
      panel={shell.panelOpen && shell.sessionId ? (
        <ComputerPanel
          sessionId={shell.sessionId}
          workingDirectory={shell.workingDirectory}
          filesRequest={shell.filesRequest}
          onClose={shell.onClosePanel}
        />
      ) : undefined}
    />
  );
}
