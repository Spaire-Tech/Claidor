import '../tokens.css';

import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import { authService } from '../../services/auth';
import type { RootState } from '../../store';
import { AgentDetail } from '../agent/AgentDetail';
import { useAgentDetail } from '../agent/useAgentDetail';
import { useConnections } from '../connections/useConnections';
import { ComputerPanel } from '../panel/ComputerPanel';
import { supportMailto } from './account';
import { AccountMenu } from './AccountMenu';
import { Apps } from './Apps';
import { MessagesShell } from './MessagesShell';
import { SignIn } from './SignIn';
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
export interface FaiserAppProps {
  /**
   * Opens the app's existing Settings. It lives in `App.tsx` with all of
   * its state, so this shell asks for it rather than mounting a second
   * copy — and that is what stops `VITE_FAISER_SHELL=0` being the only
   * way to reach providers and onboarding.
   */
  onOpenSettings?: () => void;
}

export function FaiserApp({ onOpenSettings }: FaiserAppProps = {}): JSX.Element {
  const signedIn = useSelector((state: RootState) => state.auth.isLoggedIn);
  const quota = useSelector((state: RootState) => state.auth.quota);
  const [signInError, setSignInError] = useState<string | undefined>();
  const [accountOpen, setAccountOpen] = useState(false);
  // Asked once, for the Support mail draft. It cannot change underneath
  // somebody while the app is open.
  const [appVersion, setAppVersion] = useState<string>();
  useEffect(() => {
    let current = true;
    void window.electron?.appInfo?.getVersion?.()
      .then(version => { if (current && version) setAppVersion(version); })
      .catch(() => { /* the draft says "unknown", which is true */ });
    return () => { current = false; };
  }, []);
  const [agentOpen, setAgentOpen] = useState(false);
  const shell = useMessagesShell();
  const detail = useAgentDetail(shell.activeId, agentOpen);
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

  return (
    <MessagesShell
      agents={shell.agents}
      activeId={shell.activeId}
      activeName={shell.activeName}
      items={shell.items}
      dayStamp={shell.dayStamp}
      typing={shell.typing}
      mode={shell.mode}
      accountName={accountName}
      choice={shell.choice}
      auth={shell.auth}
      parts={shell.parts}
      onSelect={shell.onSelect}
      onSend={shell.onSend}
      onMode={shell.onMode}
      onTeach={shell.onTeach}
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
          onClose={shell.onCloseApps}
        />
      )}
      onAccount={() => setAccountOpen(open => !open)}
      accountMenu={accountOpen && (
        <AccountMenu
          quota={quota}
          onSettings={() => { setAccountOpen(false); onOpenSettings?.(); }}
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
      onOpenAgent={() => setAgentOpen(true)}
      agentDetail={agentOpen && (
        <AgentDetail
          detail={detail}
          agentId={shell.activeId}
          agentName={shell.activeName}
          onClose={() => setAgentOpen(false)}
        />
      )}
      onOpenPanel={shell.onOpenPanel}
      panel={shell.panelOpen && shell.sessionId ? (
        <ComputerPanel
          sessionId={shell.sessionId}
          workingDirectory={shell.workingDirectory}
          onClose={shell.onClosePanel}
        />
      ) : undefined}
    />
  );
}
