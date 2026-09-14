import '../tokens.css';

import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import { authService } from '../../services/auth';
import type { RootState } from '../../store';
import { ComputerPanel } from '../panel/ComputerPanel';
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
  const shell = useMessagesShell();

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
      onSelect={shell.onSelect}
      onSend={shell.onSend}
      onMode={shell.onMode}
      // The `+` menu — attach a file, teach a task — is Stage 10 and not
      // built yet.
      //
      // `onPlus` has to be passed even as a stub: `Composer` hides the
      // button entirely when it is absent, so leaving it out did not
      // leave a dead control, it left no control at all, and the composer
      // ran without the `+` the canvas puts there.
      composing={shell.composing}
      onCompose={shell.onCompose}
      onCloseCompose={shell.onCloseCompose}
      onPickAgent={shell.onPickAgent}
      onCreateAgent={shell.onCreateAgent}
      onApps={shell.onApps}
      apps={shell.appsOpen && (
        <Apps
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
          onLogOut={() => { setAccountOpen(false); void authService.logout(); }}
          onClose={() => setAccountOpen(false)}
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
      onPlus={() => {}}
    />
  );
}
