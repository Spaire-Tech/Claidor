import { useState } from "react";
import { Blob } from "./Blob.js";
import "./signin.css";

/**
 * The one screen before the first thread.
 *
 * Deliberately one screen and not a flow. In the founder's own words on the
 * file this is ported from: they had not designed onboarding yet and asked for
 * a simple sign-in until they had, so this is a door and nothing else — no
 * tour, no feature grid, no invented welcome copy standing in for copy they
 * will write. When their design lands it should find the space empty rather
 * than full of my guesses.
 *
 * Two things it does do, because they are rules rather than decoration:
 *
 * - **It is never empty.** A face is already breathing before anybody clicks,
 *   so the first thing a person meets is the thing the app is about, not a
 *   form.
 * - **A failure is a sentence**, in the same grey as everything else. No red
 *   banner; the app does not shout anywhere else either.
 */
export function SignIn({
  onSignIn,
  error,
}: {
  onSignIn?: () => Promise<void> | void;
  /** Set when a previous attempt failed, said in a sentence. */
  error?: string;
}) {
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSignIn?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="signin">
      <div className="signin__card">
        <Blob seed="first-run" size={104} label="Caisra" />

        <div className="signin__words">
          <div className="signin__title">Sign in to begin.</div>
          <div className="signin__sub">It opens in your browser and comes straight back.</div>
        </div>

        <button
          type="button"
          className="pill pill--primary"
          disabled={busy}
          onClick={() => {
            void go();
          }}
        >
          {busy ? "Waiting for your browser…" : "Sign in"}
        </button>

        {error ? <div className="signin__error">{error}</div> : null}
      </div>
    </div>
  );
}
