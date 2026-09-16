import '../tokens.css';

import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import { describeBuild, DEV_BUILD } from '../../../shared/buildStamp/constants';
import { authService } from '../../services/auth';
import { configService, ConfigServiceEvent } from '../../services/config';
import type { RootState } from '../../store';
import { AgentPanel } from '../agent/AgentPanel';
import { useConnections } from '../connections/useConnections';
import { Onboarding } from '../onboarding/Onboarding';
import { electronOnboardingBridge } from '../onboarding/useOnboarding';
import { ComputerPanel } from '../panel/ComputerPanel';
import { Settings } from '../settings/Settings';
import { useSettings } from '../settings/useSettings';
import { useAskInput } from '../thread/useAskInput';
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
  const dictation = useDictation();
  const shell = useMessagesShell();
  // The cards asking for something typed. Kept beside the messages rather
  // than inside them: a password prompt is not a message, and it must not
  // scroll back into view a week later with an empty box.
  const askInput = useAskInput();
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
        onDone={() => {
          setOnboarded(true);
          void configService.updateConfig({ onboardingDoneAt: Date.now() }).catch(() => {
            // It plays again next launch, which is the cheaper mistake.
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
      items={[...shell.items, ...askInput.items]}
      dayStamp={shell.dayStamp}
      typing={shell.typing}
      mode={shell.mode}
      accountName={accountName}
      choice={shell.choice}
      auth={shell.auth}
      parts={shell.parts}
      secret={askInput.handlers}
      onSelect={shell.onSelect}
      onAskDelete={shell.onAskDelete}
      onSend={shell.onSend}
      onMode={shell.onMode}
      onTeach={shell.onTeach}
      dictation={dictation}
      onShareTemplate={shell.onShareTemplate}
      composing={shell.composing}
      onCompose={shell.onCompose}
      onCloseCompose={shell.onCloseCompose}
      onPickAgent={shell.onPickAgent}
      onCreateAgent={shell.onCreateAgent}
      onApps={shell.onApps}
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
      onAccount={() => setAccountOpen(open => !open)}
      accountMenu={accountOpen && (
        <AccountMenu
          quota={quota}
          onSettings={() => { setAccountOpen(false); setSettingsOpen(true); }}
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
        <Settings {...settings} onClose={() => setSettingsOpen(false)} />
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
