import { useState } from 'react';

import { Orb, OrbMood } from '../orb/Orb';
import { color, font, line, motion, radius, shadow, text, tracking } from '../tokens';

export interface SignInProps {
  /** Opens the browser and waits for the callback. */
  onSignIn: () => Promise<void> | void;
  /** Set when a previous attempt failed, said in a sentence. */
  error?: string;
}

/**
 * The one screen before the first thread.
 *
 * Deliberately one screen and not a flow. The founder has not designed
 * onboarding yet and asked for a simple sign-in until they have, so this
 * is a door and nothing else: no tour, no feature grid, no invented
 * welcome copy standing in for copy they will write. When their design
 * lands it should find the space empty rather than full of my guesses.
 *
 * Two things it does do, because they are rules rather than decoration:
 *
 * - **It is never empty.** An orb is already breathing before anybody
 *   clicks, so the first thing a person meets is the thing the app is
 *   about, not a form.
 * - **A failure is a sentence**, in the same grey as everything else.
 *   No red banner; the app does not shout anywhere else either.
 */
export function SignIn({ onSignIn, error }: SignInProps): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);

  const go = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await onSignIn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        background: color.ground,
        // The two lights on the ground, from the 17 September canvas, line 77.
        backgroundImage:
          'radial-gradient(75% 60% at 26% 8%, #ffffff 0%, rgba(255,255,255,0) 68%), radial-gradient(70% 60% at 82% 88%, #e6ebf4 0%, rgba(230,235,244,0) 66%)',
        color: color.ink,
        fontFamily: font.ui, fontWeight: 400,
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 420,
          padding: '40px 32px 32px',
          borderRadius: radius.modal,
          background: color.paper,
          border: `1px solid ${line.hairline}`,
          boxShadow: shadow.window,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26,
          animation: `fsr-message-in ${motion.messageIn.longer} ${motion.messageIn.easing} both`,
        }}
      >
        {/*
          The orb is the product. It breathes before anything is clicked,
          so the screen is never a dead form.
        */}
        <span style={{ animation: `fsr-orb-in ${motion.orbIn.duration} ${motion.orbIn.easing} both` }}>
          <Orb agentId="first-run" size={104} mood={OrbMood.Idle} elevated label="Caisra" />
        </span>

        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ fontSize: text.dialogTitle, fontWeight: 500, letterSpacing: tracking.screenTitle }}>
            Sign in to begin.
          </div>
          <div style={{ fontSize: text.emphasis, color: color.muted, textWrap: 'pretty' }}>
            It opens in your browser and comes straight back.
          </div>
        </div>

        <button
          type="button"
          onClick={() => { void go(); }}
          disabled={busy}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            height: 34, padding: '0 18px', borderRadius: radius.pill,
            border: 'none', background: hover && !busy ? color.accentHover : color.accent, color: color.paper,
            font: 'inherit', fontSize: text.body, fontWeight: 500,
            transition: `background ${motion.hover.duration} ${motion.hover.easing}`,
            cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Waiting for your browser…' : 'Sign in'}
        </button>

        {error && (
          <div
            style={{
              fontSize: text.small, color: color.muted,
              textAlign: 'center', textWrap: 'pretty', maxWidth: '90%',
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
