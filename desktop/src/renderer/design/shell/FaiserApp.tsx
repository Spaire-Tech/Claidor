import '../tokens.css';

import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import { authService } from '../../services/auth';
import type { RootState } from '../../store';
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
export function FaiserApp(): JSX.Element {
  const signedIn = useSelector((state: RootState) => state.auth.isLoggedIn);
  const [signInError, setSignInError] = useState<string | undefined>();
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
      // Not yet built. Each is a modal over this, and each is its own
      // stage: compose and Apps in Stage 7, the panel in Stage 5.
      onCompose={() => {}}
      onApps={() => {}}
      onAccount={() => {}}
      onOpenPanel={() => {}}
    />
  );
}
