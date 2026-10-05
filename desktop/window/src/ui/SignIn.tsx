import type { AuthStatus } from "../bridge/types.js";
import type { WindowStore } from "../state/store.js";
import { Wordmark } from "./Wordmark.js";

export function SignIn({ store, auth }: { readonly store: WindowStore; readonly auth: AuthStatus }) {
  const busy = auth.kind === "logging-in";
  return (
    <main className="signin" data-screen="sign-in">
      <div className="signin__drag" />
      <div className="signin__body">
        <Wordmark size={56} />
        <p className="signin__tagline">Your personal team of agents for whatever needs doing.</p>
        {busy ? (
          <>
            <p className="signin__note">Continue in your browser, then come back here.</p>
            <div className="signin__actions">
              <button type="button" className="button button--secondary" onClick={() => void store.signIn()}>Reopen link</button>
              <button type="button" className="button button--ghost" onClick={() => void store.cancelSignIn()}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <button type="button" className="button button--primary signin__cta" onClick={() => void store.signIn()}>
              Sign in <span aria-hidden="true">→</span>
            </button>
            {auth.kind === "logged-out" && auth.errorMessage != null && auth.errorMessage.length > 0 ? <p className="signin__error">{auth.errorMessage}</p> : null}
          </>
        )}
      </div>
    </main>
  );
}
