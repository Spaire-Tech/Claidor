import { type CSSProperties, useEffect, useMemo, useRef } from 'react';

import { MAIN_AVATAR } from '../../../shared/agent/avatars';
import { APP_LOGO_DIRECTORY } from '../../../shared/connections/catalog';
import { ONBOARDING_LOGOS } from '../../../shared/onboarding/constants';
import { OnboardingPhase, OTHER_PLACEHOLDER, type ShownWord, WordState } from '../../../shared/onboarding/script';
import { CloudBlob } from '../orb/CloudBlob';
import { color, font, line, motion, radius, shadow } from '../tokens';
import { type AmbientCloud, cloudGeometry, cloudGradient, renderCloudImage } from './ambientClouds';
import { type OnboardingBridge, type OnboardingState, type TaskCard, useOnboarding } from './useOnboarding';

/**
 * The first step of onboarding: Yodo meets the person.
 *
 * Drawn from the founder's canvas of 16 September 2026
 * (`docs/product/design/canvas-2026-09-16-onboarding.html`) to the
 * number — the 760px column, the 30px greeting, the 17px lines at 1.6,
 * the 42px chips and pills, the 152px task cards, the 18px-radius
 * permission and result cards, the 560px Get Started, the three dots.
 * The words stream at the canvas's speed and fade in one by one; the
 * ambient colour drifts behind a glass the canvas set at 88% white. The
 * clouds are blurred once into pictures rather than on every frame
 * (`ambientClouds.ts`), which is what made the stream stutter.
 *
 * What the canvas could not do, this does: "Allow access" asks the Mac
 * to write the riddle or flip the appearance (`useOnboarding.ts`), and
 * the last lines say what actually happened.
 *
 * The window's own traffic lights sit top-left (`titleBarStyle:
 * hiddenInset`); the canvas drew fake ones there and this draws nothing.
 */

export interface OnboardingProps {
  /** The person, as greeted. */
  userName: string;
  /** How to reach the Mac. Absent in the harness; the cards then say so. */
  bridge?: OnboardingBridge;
  /**
   * Get Started, with what they said they do: a work type as its button
   * read, or their own words, and which of the two it was. Step two
   * opens on it.
   */
  onDone: (work: { workType: string; ownWords: boolean }) => void;
}

/*
 * The colour is the 17 September canvas's ("Spatial Light"): ink and
 * muted on white, the accent for the person's pill and every primary
 * button, black at a low alpha for lines. The 16 September canvas's own
 * navy-tinted greys went with the rest of the navy.
 */
const INK = color.ink;
const PAPER = color.paper;
const QUIET = color.muted;
const LINE = line.field;
const HOVER = color.window;
const CARD_SHADOW = shadow.flat;
const HOVER_TRANSITION = `background ${motion.hover.duration} ${motion.hover.easing}`;

/** The canvas's keyframes, once per page. */
const KEYFRAMES = `
@keyframes onb-block-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
@keyframes onb-chip-in { from { opacity:0; transform:translateY(6px) scale(.96); } to { opacity:1; transform:none; } }
@keyframes onb-orb-idle { 0%,100% { transform:scale(1); } 50% { transform:scale(1.04); } }
@keyframes onb-word-in { from { opacity:0; filter:blur(2.5px); } to { opacity:1; filter:blur(0); } }
@keyframes onb-intro-cloud {
  0% { opacity:0; transform:scale(.72); }
  16% { opacity:1; transform:scale(1); }
  58% { opacity:1; transform:scale(1.03); }
  100% { opacity:0; transform:scale(1.12); }
}
@keyframes onb-drift-a { 0%,100% { transform:translate3d(-18%,-12%,0) scale(1); } 33% { transform:translate3d(30%,20%,0) scale(1.22); } 66% { transform:translate3d(12%,-26%,0) scale(.86); } }
@keyframes onb-drift-b { 0%,100% { transform:translate3d(24%,16%,0) scale(1.08); } 40% { transform:translate3d(-28%,-18%,0) scale(.86); } 70% { transform:translate3d(-8%,28%,0) scale(1.24); } }
@keyframes onb-drift-c { 0%,100% { transform:translate3d(8%,24%,0) scale(.9); } 45% { transform:translate3d(-26%,-10%,0) scale(1.26); } 75% { transform:translate3d(28%,6%,0) scale(1.04); } }
.onb-hover:hover { background: ${HOVER} !important; }
.onb-hover-accent:hover { background: ${color.accentHover} !important; }
.onb-hover-quiet:hover { color: ${INK} !important; }
`;

/**
 * The canvas's four clouds: its colour, gradient edge, blur, size and
 * opacity, and where it sits and how it drifts. The blur is drawn once
 * (`ambientClouds.ts`) instead of on every frame; see there for why.
 */
const AMBIENT: readonly { cloud: AmbientCloud; place: CSSProperties }[] = [
  { cloud: { hex: '#8fd3f4', edge: 0.68, blur: 90, vw: 76, opacity: 0.2 }, place: { top: '-22%', left: '-14%', animation: 'onb-drift-a 34s ease-in-out infinite' } },
  { cloud: { hex: '#cdbdf5', edge: 0.68, blur: 95, vw: 68, opacity: 0.26 }, place: { top: '6%', right: '-18%', animation: 'onb-drift-b 41s ease-in-out infinite' } },
  { cloud: { hex: '#f7c9a8', edge: 0.66, blur: 100, vw: 72, opacity: 0.22 }, place: { bottom: '-30%', left: '18%', animation: 'onb-drift-c 47s ease-in-out infinite' } },
  { cloud: { hex: '#a8e6cf', edge: 0.66, blur: 100, vw: 58, opacity: 0.18 }, place: { bottom: '-16%', right: '4%', animation: 'onb-drift-a 38s ease-in-out infinite reverse' } },
];

/** The clouds' pictures, drawn once for the window's width at first paint. */
function useAmbientClouds(): readonly { place: CSSProperties; cloud: CSSProperties }[] {
  return useMemo(() => AMBIENT.map(({ cloud, place }) => {
    const viewportWidth = typeof window === 'undefined' ? 1120 : window.innerWidth;
    const image = renderCloudImage(cloud, viewportWidth);
    const { pad } = cloudGeometry(cloud, viewportWidth);
    return {
      place: {
        position: 'absolute', width: `${cloud.vw}vw`, height: `${cloud.vw}vw`, opacity: cloud.opacity,
        willChange: 'transform', ...place,
      },
      cloud: image
        ? { position: 'absolute', inset: -pad, backgroundImage: `url(${image})`, backgroundSize: '100% 100%' }
        : { position: 'absolute', inset: 0, borderRadius: '50%', background: cloudGradient(cloud) },
    };
  }), []);
}

const lineStyle: CSSProperties = { whiteSpace: 'pre-wrap', fontSize: 17, lineHeight: 1.6, color: INK, textWrap: 'pretty' };
const linesBlock: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 };

/* The canvas's secondary button: white, no line, the flat shadow; the window's grey under the pointer. */
const pill = (extra: CSSProperties): CSSProperties => ({
  height: 42, padding: '0 20px', borderRadius: radius.pill, border: 'none', background: PAPER,
  color: INK, fontFamily: 'inherit', fontSize: 15.5, fontWeight: 400, whiteSpace: 'nowrap',
  boxShadow: CARD_SHADOW, cursor: 'pointer', transition: HOVER_TRANSITION, ...extra,
});

/* The canvas's primary button: the accent, white type at 500. */
const primary = (extra: CSSProperties = {}): CSSProperties => ({
  height: 42, padding: '0 22px', borderRadius: radius.pill, border: 'none', background: color.accent, color: PAPER,
  fontFamily: 'inherit', fontSize: 15.5, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer',
  transition: HOVER_TRANSITION, ...extra,
});

/* The person's pill is the person's bubble: the accent. */
const userPill: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', maxWidth: '70%', height: 44, padding: '0 21px',
  borderRadius: radius.pill, background: color.accent, color: PAPER, fontSize: 16, whiteSpace: 'nowrap',
  overflow: 'hidden', textOverflow: 'ellipsis',
};

const card: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 16, padding: '15px 17px', borderRadius: radius.card,
  background: PAPER, border: `1px solid ${LINE}`, boxShadow: CARD_SHADOW,
  animation: 'onb-block-in .4s ease-out both',
};

const logoTile = (task: TaskCard | { task: keyof typeof ONBOARDING_LOGOS }, size: number, radius: number): CSSProperties => ({
  width: size, height: size, flex: '0 0 auto', borderRadius: radius,
  backgroundImage: `url(${APP_LOGO_DIRECTORY}/${ONBOARDING_LOGOS[task.task]})`,
  backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
});

/**
 * A line's words. All of them are in the flow from the line's first
 * beat, so it wraps once; a word not reached yet is invisible and holds
 * its place, and a word reached fades in with the canvas's keyframes.
 */
function Words({ words }: { words: readonly ShownWord[] }): JSX.Element {
  return (
    <>
      {words.map((word, i) => (
        <span
          key={i}
          style={{
            display: 'inline',
            visibility: word.state === WordState.Hidden ? 'hidden' : undefined,
            animation: word.state === WordState.In ? 'onb-word-in .3s ease-out both' : undefined,
          }}
        >
          {word.text}
        </span>
      ))}
    </>
  );
}

function Line({ state, phase, k, style }: { state: OnboardingState; phase: OnboardingPhase; k: number; style?: CSSProperties }): JSX.Element {
  return <div style={{ ...lineStyle, ...style }}><Words words={state.words(phase, k)} /></div>;
}

export function Onboarding({ userName, bridge, onDone }: OnboardingProps): JSX.Element {
  const state = useOnboarding(userName, bridge);
  const ambient = useAmbientClouds();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Follow the words down while the person is near the bottom, as the
  // canvas does; a person who scrolled up to reread is left alone.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.clientHeight - el.scrollTop < 260) el.scrollTop = el.scrollHeight;
  });

  const otherReady = state.other.trim().length > 0;

  return (
    <div
      style={{
        height: '100vh', boxSizing: 'border-box', position: 'relative', display: 'flex', alignItems: 'stretch',
        overflow: 'hidden', background: color.ground,
        // The two lights on the ground, from the 17 September canvas, line 77.
        backgroundImage:
          'radial-gradient(75% 60% at 26% 8%, #ffffff 0%, rgba(255,255,255,0) 68%), radial-gradient(70% 60% at 82% 88%, #e6ebf4 0%, rgba(230,235,244,0) 66%)',
        fontFamily: font.ui, color: INK, WebkitFontSmoothing: 'antialiased',
      }}
    >
      <style>{KEYFRAMES}</style>

      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        {ambient.map((one, i) => (
          <span key={i} style={one.place}><span style={one.cloud} /></span>
        ))}
      </div>

      {/* The 16 September canvas's veil at 88% white, over the clouds; no
          blur behind it (the clouds are blurred already, and blurring the
          window again every frame was half the lag). It is paper at .88, so
          the clouds show through it as the tint that canvas drew. */}
      <div
        style={{
          flex: '1 1 auto', minWidth: 0, position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', background: 'rgba(255,255,255,.88)',
        }}
      >
        {state.intro && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ width: 158, height: 158, animation: 'onb-intro-cloud 2.5s cubic-bezier(.3,.7,.3,1) both' }}>
              <CloudBlob avatar={MAIN_AVATAR} size={158} label="Yodo" />
            </span>
          </div>
        )}

        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 72 }}>
          {!state.intro && (
            <span style={{ width: 42, height: 42, flex: '0 0 auto', animation: 'onb-orb-idle 7s ease-in-out infinite' }}>
              <CloudBlob avatar={MAIN_AVATAR} size={42} label="Yodo" />
            </span>
          )}
        </div>

        <div ref={scrollRef} style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '8px 0 150px' }}>
          <div style={{ width: 'min(760px, calc(100% - 64px))', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 26 }}>

            <div style={{ paddingTop: 18, minHeight: 42 }}>
              <div style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-.022em', whiteSpace: 'pre-wrap' }}>
                <Words words={state.words(OnboardingPhase.Open, 0)} />
              </div>
            </div>

            <div style={linesBlock}>
              {[1, 2, 3, 4].map(k => <Line key={k} state={state} phase={OnboardingPhase.Open} k={k} />)}
            </div>

            {state.showChips && (
              state.otherOpen ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, animation: 'onb-block-in .26s ease-out both' }}>
                  <input
                    value={state.other}
                    onChange={event => state.setOther(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') state.submitOther();
                      if (event.key === 'Escape') state.closeOther();
                    }}
                    placeholder={OTHER_PLACEHOLDER}
                    autoFocus
                    aria-label={OTHER_PLACEHOLDER}
                    style={{
                      flex: '1 1 auto', minWidth: 0, height: 50, padding: '0 20px', borderRadius: radius.pill,
                      border: `1px solid ${LINE}`, background: PAPER, outline: 'none', fontFamily: 'inherit',
                      fontSize: 16.5, color: INK, boxShadow: CARD_SHADOW,
                    }}
                  />
                  <button
                    type="button"
                    onClick={state.submitOther}
                    className={otherReady ? 'onb-hover-accent' : undefined}
                    style={primary(otherReady
                      ? {}
                      /* Not ready: the canvas's disabled button, the hover line's grey with muted type. */
                      : { background: line.hover, color: QUIET, cursor: 'default' })}
                  >
                    Tell him
                  </button>
                  <button
                    type="button"
                    onClick={state.closeOther}
                    className="onb-hover-quiet"
                    style={{ height: 42, padding: '0 16px', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 15.5, color: QUIET, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Back
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, animation: 'onb-block-in .3s ease-out both' }}>
                  {state.roles.map(role => (
                    <button key={role.label} type="button" onClick={role.pick} className="onb-hover" style={pill({})}>
                      {role.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={state.openOther}
                    className="onb-hover"
                    style={pill({ display: 'flex', alignItems: 'center', gap: 8, border: `1px dashed ${line.button}`, background: 'transparent', boxShadow: 'none', color: QUIET })}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" style={{ flex: '0 0 auto' }} aria-hidden focusable="false">
                      <path d="M4 18.5l1-4L16 3.5a2.1 2.1 0 013 3L8 17.5l-4 1z" />
                    </svg>
                    <span>Something else</span>
                  </button>
                </div>
              )
            )}

            {state.hasRole && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', animation: 'onb-chip-in .26s cubic-bezier(.22,.68,.36,1) both' }}>
                  <span style={userPill}>{state.roleLabel}</span>
                </div>

                <div style={linesBlock}>
                  {[0, 1, 2].map(k => <Line key={k} state={state} phase={OnboardingPhase.Role} k={k} />)}
                </div>

                {state.showTasks && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14, animation: 'onb-block-in .4s ease-out both' }}>
                    {state.tasks.map(one => (
                      <button
                        key={one.task}
                        type="button"
                        onClick={one.pick}
                        disabled={!one.pressable}
                        aria-disabled={!one.pressable}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 26, minHeight: 152,
                          padding: 20, borderRadius: radius.row, textAlign: 'left', fontFamily: 'inherit',
                          transition: 'background .18s, border-color .18s, opacity .18s',
                          cursor: one.pressable ? 'pointer' : 'default',
                          background: one.chosen ? HOVER : PAPER,
                          border: `1.5px solid ${one.chosen ? color.accent : LINE}`,
                          opacity: one.dim ? 0.42 : 1,
                          boxShadow: one.chosen || one.dim ? 'none' : CARD_SHADOW,
                        }}
                      >
                        <span style={logoTile(one, 46, 10)} />
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontSize: 16.5, fontWeight: 400, lineHeight: 1.35, color: INK, textWrap: 'pretty' }}>{one.label}</span>
                          {one.unavailable && (
                            <span style={{ fontSize: 13.5, color: QUIET }}>Not yet</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {state.task && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', animation: 'onb-chip-in .26s cubic-bezier(.22,.68,.36,1) both' }}>
                  <span style={userPill}>{state.task.label}</span>
                </div>

                <Line state={state} phase={OnboardingPhase.Perm} k={0} />

                {state.showPerm && (
                  <div style={card}>
                    <span style={logoTile(state.task, 44, 11)} />
                    <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 16.5, fontWeight: 500, letterSpacing: '-.01em', color: INK }}>{state.task.permTitle}</span>
                      <span style={{ fontSize: 15, color: QUIET }}>{state.working ? 'Working…' : state.task.permSub}</span>
                    </span>
                    {!state.working && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 9, flex: '0 0 auto' }}>
                        <button type="button" onClick={state.deny} className="onb-hover" style={pill({})}>Not now</button>
                        <button type="button" onClick={state.allow} className="onb-hover-accent" style={primary()}>Allow access</button>
                      </span>
                    )}
                  </div>
                )}

                {state.hasAnswer && (
                  <>
                    <Line state={state} phase={OnboardingPhase.Task} k={0} />

                    {state.showResult && (
                      <div style={card}>
                        <span style={logoTile(state.task, 44, 11)} />
                        <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <span style={{ fontSize: 16.5, fontWeight: 500, letterSpacing: '-.01em', color: INK }}>{state.task.resultName}</span>
                          <span style={{ fontSize: 15, color: QUIET }}>{state.task.resultKind}</span>
                        </span>
                        <button type="button" onClick={state.openResult} className="onb-hover" style={pill({ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' })}>
                          <span>{state.task.resultOpen}</span>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 auto' }} aria-hidden focusable="false">
                            <path d="M7 17L17 7" /><path d="M9 7h8v8" />
                          </svg>
                        </button>
                      </div>
                    )}

                    <div style={linesBlock}>
                      <Line state={state} phase={OnboardingPhase.Task} k={1} />
                      <Line state={state} phase={OnboardingPhase.Task} k={2} />
                    </div>

                    {state.showGetStarted && (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: '18px 0 4px', animation: 'onb-block-in .46s ease-out both' }}>
                        <button
                          type="button"
                          onClick={() => onDone({ workType: state.roleLabel, ownWords: state.ownWords })}
                          className="onb-hover-accent"
                          style={{
                            width: 'min(560px, 100%)', height: 56, borderRadius: radius.pill, border: 'none', background: color.accent, color: PAPER,
                            fontFamily: 'inherit', fontSize: 17, fontWeight: 500, letterSpacing: '-.005em', cursor: 'pointer', transition: HOVER_TRANSITION,
                          }}
                        >
                          Get Started
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, padding: '10px 0 38px' }}>
          {state.showSkip && (
            <button
              type="button"
              onClick={state.skip}
              className="onb-hover-quiet"
              style={{ height: 34, padding: '0 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 16, fontWeight: 400, color: QUIET, transition: 'color .15s' }}
            >
              Skip
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }} aria-hidden>
            {[0, 1, 2].map(n => (
              <span
                key={n}
                style={{
                  width: n === state.stage ? 22 : 14, height: 5, borderRadius: radius.pill,
                  transition: 'width .22s ease, background .22s ease',
                  background: n === state.stage ? INK : line.button,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
