import { Fragment, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ADVENTURER_CREDIT, AVATAR_KEYS, OnboardingCharacter } from "../recovered/features/onboarding/signed-in/character";
import type { OnboardingCharacterState } from "../recovered/features/onboarding/signed-in/scene";

// The founder's twenty-one avatars at the five sizes the app draws them, in
// both themes, running through the seven states the sidebar shows. Built by
// `node scripts/face-preview.mjs`, which also takes the screenshots in
// docs/product/faces-adventurer/. Nothing here ships in the app.

const SIZES = [16, 28, 36, 64, 80] as const;
const STATES: readonly OnboardingCharacterState[] = ["idle", "thinking", "working", "searching", "excited", "celebrate", "sleeping"];
type Theme = "light" | "dark";

declare global {
  interface Window { __facePreview?: { setState(state: OnboardingCharacterState): void; setTheme(theme: Theme): void; setRunning(running: boolean): void; setPaused(paused: boolean): void } }
}

function Row({ size, state, paused }: { size: number; state: OnboardingCharacterState; paused: boolean }) {
  const gap = size >= 64 ? 10 : size >= 36 ? 8 : 6;
  return <section className="grid-section">
    <h2>{size} px · {state}</h2>
    <div className="grid" style={{ gridTemplateColumns: `repeat(${AVATAR_KEYS.length}, ${size}px)`, gap }}>
      {AVATAR_KEYS.map((key) => <span className="cell" key={key} style={{ width: size, height: size }} title={key}>
        <OnboardingCharacter color="blue" paused={paused} shape={key} sizePx={size} sourceId={`preview-${key}-${size}`} state={state} />
      </span>)}
    </div>
  </section>;
}

function StatesSheet({ paused }: { paused: boolean }) {
  return <section className="grid-section">
    <h2>the seven states, every avatar, 64 px; one avatar at 28 px</h2>
    <div className="grid" style={{ gridTemplateColumns: `auto repeat(${STATES.length}, 64px)`, gap: 10 }}>
      <span />
      {STATES.map((state) => <span className="label" key={state}>{state}</span>)}
      {AVATAR_KEYS.map((key) => <Fragment key={key}>
        <span className="label row-label">{key.replace("adventurer-", "")}</span>
        {STATES.map((state) => <span className="cell" key={`${key}-${state}`} style={{ width: 64, height: 64 }}>
          <OnboardingCharacter color="blue" paused={paused} shape={key} sizePx={64} sourceId={`sheet-${key}-${state}`} state={state} />
        </span>)}
      </Fragment>)}
      <span className="label row-label">28 px</span>
      {STATES.map((state) => <span className="cell" key={`small-${state}`} style={{ width: 64, height: 64 }}>
        <OnboardingCharacter color="blue" paused={paused} shape={AVATAR_KEYS[10]} sizePx={28} sourceId={`sheet-small-${state}`} state={state} />
      </span>)}
    </div>
  </section>;
}

function App() {
  const params = new URLSearchParams(window.location.search);
  const [theme, setTheme] = useState<Theme>(params.get("theme") === "dark" ? "dark" : "light");
  const [state, setState] = useState<OnboardingCharacterState>((params.get("state") as OnboardingCharacterState | null) ?? "idle");
  const [running, setRunning] = useState(params.get("run") === "1");
  const [paused, setPaused] = useState(params.get("paused") === "1");
  useEffect(() => {
    window.__facePreview = { setState, setTheme, setRunning, setPaused };
    return () => { delete window.__facePreview; };
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setState((current) => STATES[(STATES.indexOf(current) + 1) % STATES.length]), 2500);
    return () => window.clearInterval(timer);
  }, [running]);
  useEffect(() => { document.documentElement.dataset.theme = theme === "dark" ? "cursor-dark" : "cursor-light"; }, [theme]);
  return <div className="page" data-theme={theme === "dark" ? "cursor-dark" : "cursor-light"}>
    <header className="controls">
      <strong>Simeon avatars</strong>
      <span className="group">{(["light", "dark"] as const).map((candidate) => <button aria-pressed={theme === candidate} key={candidate} onClick={() => setTheme(candidate)} type="button">{candidate}</button>)}</span>
      <span className="group">{STATES.map((candidate) => <button aria-pressed={state === candidate} key={candidate} onClick={() => { setRunning(false); setState(candidate); }} type="button">{candidate}</button>)}</span>
      <span className="group"><button aria-pressed={running} onClick={() => setRunning((value) => !value)} type="button">run</button><button aria-pressed={paused} onClick={() => setPaused((value) => !value)} type="button">paused</button></span>
      <small className="credit">{ADVENTURER_CREDIT}</small>
    </header>
    {SIZES.map((size) => <Row key={size} paused={paused} size={size} state={state} />)}
    <StatesSheet paused={paused} />
  </div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
