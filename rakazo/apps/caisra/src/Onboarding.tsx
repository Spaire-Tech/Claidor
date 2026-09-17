import type { ShownWord } from "@rakazo/core";
import { ONBOARDING_LOGOS, OnboardingPhase, OTHER_PLACEHOLDER, WordState } from "@rakazo/core";
import { type CSSProperties, useEffect, useMemo, useRef } from "react";
import {
  type AmbientCloud,
  cloudGeometry,
  cloudGradient,
  renderCloudImage,
} from "./ambientClouds.js";
import { Blob } from "./Blob.js";
import { ourMark } from "./marks.js";
import {
  type OnboardingBridge,
  type OnboardingState,
  type TaskCard,
  useOnboarding,
} from "./useOnboarding.js";
import "./onboarding.css";

/**
 * The first step: Yodo meets the person.
 *
 * Drawn from the founder's canvas of 16 September 2026 to the number — the
 * 760px column, the 30px greeting, the 17px lines at 1.6, the 42px chips and
 * pills, the 152px task cards, the 18px-radius permission and result cards, the
 * 560px Get Started, the three dots. The words stream at the canvas's speed and
 * fade in one by one; the ambient colour drifts behind a veil the canvas set at
 * 88% white. The clouds are blurred once into pictures rather than on every
 * frame (`ambientClouds.ts`), which is what made the stream stutter.
 *
 * Every sentence Yodo says is the founder's, and `caisra-onboarding.test.ts`
 * holds them to it.
 */

/**
 * The canvas's four clouds: colour, gradient edge, blur, size and opacity, and
 * where each sits and how it drifts.
 */
const AMBIENT: readonly { cloud: AmbientCloud; place: CSSProperties }[] = [
  {
    cloud: { hex: "#8fd3f4", edge: 0.68, blur: 90, vw: 76, opacity: 0.2 },
    place: { top: "-22%", left: "-14%", animation: "onb-drift-a 34s ease-in-out infinite" },
  },
  {
    cloud: { hex: "#cdbdf5", edge: 0.68, blur: 95, vw: 68, opacity: 0.26 },
    place: { top: "6%", right: "-18%", animation: "onb-drift-b 41s ease-in-out infinite" },
  },
  {
    cloud: { hex: "#f7c9a8", edge: 0.66, blur: 100, vw: 72, opacity: 0.22 },
    place: { bottom: "-30%", left: "18%", animation: "onb-drift-c 47s ease-in-out infinite" },
  },
  {
    cloud: { hex: "#a8e6cf", edge: 0.66, blur: 100, vw: 58, opacity: 0.18 },
    place: {
      bottom: "-16%",
      right: "4%",
      animation: "onb-drift-a 38s ease-in-out infinite reverse",
    },
  },
];

/** The clouds' pictures, drawn once for the window's width at first paint. */
function useAmbientClouds(): readonly { place: CSSProperties; cloud: CSSProperties }[] {
  return useMemo(
    () =>
      AMBIENT.map(({ cloud, place }) => {
        const width = typeof window === "undefined" ? 1120 : window.innerWidth;
        const image = renderCloudImage(cloud, width);
        const { pad } = cloudGeometry(cloud, width);
        return {
          place: {
            position: "absolute",
            width: `${cloud.vw}vw`,
            height: `${cloud.vw}vw`,
            opacity: cloud.opacity,
            willChange: "transform",
            ...place,
          },
          cloud: image
            ? {
                position: "absolute",
                inset: -pad,
                backgroundImage: `url(${image})`,
                backgroundSize: "100% 100%",
              }
            : {
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background: cloudGradient(cloud),
              },
        };
      }),
    [],
  );
}

/**
 * A line's words. All of them are in the flow from the line's first beat, so it
 * wraps once; a word not reached yet is invisible and holds its place, and a
 * word reached fades in.
 */
function Words({ words }: { words: readonly ShownWord[] }) {
  return (
    <>
      {words.map((word, index) => (
        <span
          // The words of a line are a fixed sequence; the position is the identity.
          // biome-ignore lint/suspicious/noArrayIndexKey: the index is the word
          key={index}
          className={
            word.state === WordState.Hidden
              ? "onb__word onb__word--hidden"
              : word.state === WordState.In
                ? "onb__word onb__word--in"
                : "onb__word"
          }
        >
          {word.text}
        </span>
      ))}
    </>
  );
}

function Line({
  state,
  phase,
  k,
  className,
}: {
  state: OnboardingState;
  phase: OnboardingPhase;
  k: number;
  className?: string;
}) {
  return (
    <div className={className ?? "onb__line"}>
      <Words words={state.words(phase, k)} />
    </div>
  );
}

/** The mark on a task card, from our own logos. */
function taskMark(task: TaskCard | { task: keyof typeof ONBOARDING_LOGOS }): string | undefined {
  return ourMark(ONBOARDING_LOGOS[task.task]);
}

export function Onboarding({
  userName,
  bridge,
  onDone,
}: {
  /** The person, as greeted. */
  userName: string;
  /** How to reach the Mac. Absent in a browser; the cards then say so. */
  bridge?: OnboardingBridge;
  /**
   * Get Started, with what they said they do: a work type as its button read,
   * or their own words, and which of the two it was.
   */
  onDone?: (work: { workType: string; ownWords: boolean }) => void;
}) {
  const state = useOnboarding(userName, bridge);
  const ambient = useAmbientClouds();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Follow the words down while the person is near the bottom, as the canvas
  // does; somebody who scrolled up to reread is left alone.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.clientHeight - el.scrollTop < 260) el.scrollTop = el.scrollHeight;
  });

  const otherReady = state.other.trim().length > 0;

  return (
    <div className="onb">
      <div className="onb__clouds" aria-hidden>
        {ambient.map((one, index) => (
          // Four fixed clouds in a fixed order.
          // biome-ignore lint/suspicious/noArrayIndexKey: the index is the cloud
          <span key={index} style={one.place}>
            <span style={one.cloud} />
          </span>
        ))}
      </div>

      {/* The canvas's veil at 88% white, over the clouds, and no blur behind it:
          the clouds are blurred already and blurring the window again every
          frame was half the lag. */}
      <div className="onb__veil">
        {state.intro ? (
          <div className="onb__intro">
            <span className="onb__introcloud">
              <Blob seed="yodo" size={158} label="Yodo" />
            </span>
          </div>
        ) : null}

        <div className="onb__top">
          {state.intro ? null : (
            <span className="onb__face">
              <Blob seed="yodo" size={42} label="Yodo" />
            </span>
          )}
        </div>

        <div className="onb__scroll" ref={scrollRef}>
          <div className="onb__column">
            <div className="onb__greetingbox">
              <div className="onb__greeting">
                <Words words={state.words(OnboardingPhase.Open, 0)} />
              </div>
            </div>

            <div className="onb__lines">
              {[1, 2, 3, 4].map((k) => (
                <Line key={k} state={state} phase={OnboardingPhase.Open} k={k} />
              ))}
            </div>

            {state.showChips ? (
              state.otherOpen ? (
                <div className="onb__otherrow">
                  <input
                    className="onb__otherinput"
                    value={state.other}
                    onChange={(event) => state.setOther(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") state.submitOther();
                      if (event.key === "Escape") state.closeOther();
                    }}
                    placeholder={OTHER_PLACEHOLDER}
                    aria-label={OTHER_PLACEHOLDER}
                  />
                  <button
                    type="button"
                    className={`onb__primary ${otherReady ? "" : "onb__primary--waiting"}`}
                    onClick={state.submitOther}
                  >
                    Tell him
                  </button>
                  <button type="button" className="onb__quiet" onClick={state.closeOther}>
                    Back
                  </button>
                </div>
              ) : (
                <div className="onb__chips">
                  {state.roles.map((role) => (
                    <button
                      key={role.label}
                      type="button"
                      className="onb__pill"
                      onClick={role.pick}
                    >
                      {role.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="onb__pill onb__pill--other"
                    onClick={state.openOther}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.9}
                      strokeLinecap="round"
                      aria-hidden
                      focusable="false"
                    >
                      <path d="M4 18.5l1-4L16 3.5a2.1 2.1 0 013 3L8 17.5l-4 1z" />
                    </svg>
                    <span>Something else</span>
                  </button>
                </div>
              )
            ) : null}

            {state.hasRole ? (
              <>
                <div className="onb__said">
                  <span className="onb__userpill">{state.roleLabel}</span>
                </div>

                <div className="onb__lines">
                  {[0, 1, 2].map((k) => (
                    <Line key={k} state={state} phase={OnboardingPhase.Role} k={k} />
                  ))}
                </div>

                {state.showTasks ? (
                  <div className="onb__tasks">
                    {state.tasks.map((one) => {
                      const mark = taskMark(one);
                      return (
                        <button
                          key={one.task}
                          type="button"
                          onClick={one.pick}
                          disabled={!one.pressable}
                          className={`onb__task ${one.chosen ? "onb__task--chosen" : ""} ${
                            one.dim ? "onb__task--dim" : ""
                          }`}
                        >
                          <span
                            className="onb__taskmark"
                            style={mark ? { backgroundImage: `url(${mark})` } : undefined}
                          />
                          <span className="onb__taskwords">
                            <span className="onb__tasklabel">{one.label}</span>
                            {one.unavailable ? <span className="onb__notyet">Not yet</span> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </>
            ) : null}

            {state.task ? (
              <>
                <div className="onb__said">
                  <span className="onb__userpill">{state.task.label}</span>
                </div>

                <Line state={state} phase={OnboardingPhase.Perm} k={0} />

                {state.showPerm ? (
                  <div className="onb__card">
                    <span
                      className="onb__cardmark"
                      style={(() => {
                        const mark = state.task ? taskMark(state.task) : undefined;
                        return mark ? { backgroundImage: `url(${mark})` } : undefined;
                      })()}
                    />
                    <span className="onb__cardwords">
                      <span className="onb__cardtitle">{state.task.permTitle}</span>
                      <span className="onb__cardsub">
                        {state.working ? "Working…" : state.task.permSub}
                      </span>
                    </span>
                    {state.working ? null : (
                      <span className="onb__cardbuttons">
                        <button type="button" className="onb__pill" onClick={state.deny}>
                          Not now
                        </button>
                        <button type="button" className="onb__primary" onClick={state.allow}>
                          Allow access
                        </button>
                      </span>
                    )}
                  </div>
                ) : null}

                {state.hasAnswer ? (
                  <>
                    <Line state={state} phase={OnboardingPhase.Task} k={0} />

                    {state.showResult ? (
                      <div className="onb__card">
                        <span
                          className="onb__cardmark"
                          style={(() => {
                            const mark = state.task ? taskMark(state.task) : undefined;
                            return mark ? { backgroundImage: `url(${mark})` } : undefined;
                          })()}
                        />
                        <span className="onb__cardwords">
                          <span className="onb__cardtitle">{state.task.resultName}</span>
                          <span className="onb__cardsub">{state.task.resultKind}</span>
                        </span>
                        <button
                          type="button"
                          className="onb__pill onb__pill--open"
                          onClick={state.openResult}
                        >
                          <span>{state.task.resultOpen}</span>
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                            focusable="false"
                          >
                            <path d="M7 17L17 7" />
                            <path d="M9 7h8v8" />
                          </svg>
                        </button>
                      </div>
                    ) : null}

                    <div className="onb__lines">
                      <Line state={state} phase={OnboardingPhase.Task} k={1} />
                      <Line state={state} phase={OnboardingPhase.Task} k={2} />
                    </div>

                    {state.showGetStarted ? (
                      <div className="onb__getstartedrow">
                        <button
                          type="button"
                          className="onb__getstarted"
                          onClick={() =>
                            onDone?.({ workType: state.roleLabel, ownWords: state.ownWords })
                          }
                        >
                          Get Started
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        <div className="onb__foot">
          {state.showSkip ? (
            <button type="button" className="onb__skip" onClick={state.skip}>
              Skip
            </button>
          ) : null}
          <div className="onb__dots" aria-hidden>
            {[0, 1, 2].map((n) => (
              <span key={n} className={`onb__dot ${n === state.stage ? "onb__dot--on" : ""}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
