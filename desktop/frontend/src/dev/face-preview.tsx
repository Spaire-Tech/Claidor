import { Fragment, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { OnboardingCharacter, PERSONA_HAIR_STYLES, SKIN_TONES, resolvePersonaTone } from "../recovered/features/onboarding/signed-in/character";
import type { OnboardingCharacterState } from "../recovered/features/onboarding/signed-in/scene";

// The clay faces, every style × every colour at the five sizes the app draws
// them, in both themes, running through the seven states the sidebar shows.
// Built by `node scripts/face-preview.mjs`, which also takes the screenshots
// in docs/product/faces-clay/. Nothing here ships in the app.

const SHAPES = ["blob", "pebble", "squircle", "tablet", "wedge", "hex", "cloud", "teardrop"] as const;
const COLORS = ["black", "brown", "red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta", "gray"] as const;
const SIZES = [16, 28, 36, 64, 80] as const;
const STATES: readonly OnboardingCharacterState[] = ["idle", "thinking", "working", "searching", "excited", "celebrate", "sleeping"];
type Theme = "light" | "dark";

declare global {
  interface Window { __facePreview?: { setState(state: OnboardingCharacterState): void; setTheme(theme: Theme): void; setRunning(running: boolean): void; setPaused(paused: boolean): void } }
}

function Grid({ size, state, paused }: { size: number; state: OnboardingCharacterState; paused: boolean }) {
  const gap = size >= 64 ? 12 : size >= 36 ? 8 : 6;
  return <section className="grid-section">
    <h2>{size} px · {state}</h2>
    <div className="grid" style={{ gridTemplateColumns: `auto repeat(${COLORS.length}, ${size}px)`, gap }}>
      <span />
      {COLORS.map((color) => <span className="label" key={color}>{size >= 36 ? color : ""}</span>)}
      {SHAPES.map((shape) => <Fragment key={shape}>
        <span className="label row-label">{shape}<small>{PERSONA_HAIR_STYLES[shape].name}</small></span>
        {COLORS.map((color) => <span className="cell" key={`${shape}-${color}`} style={{ width: size, height: size }}>
          <OnboardingCharacter color={color} paused={paused} shape={shape} sizePx={size} sourceId={`preview-${shape}-${color}-${size}`} state={state} />
        </span>)}
      </Fragment>)}
    </div>
  </section>;
}

function StatesSheet({ paused }: { paused: boolean }) {
  return <section className="grid-section">
    <h2>the seven states, every style, 64 px and 28 px</h2>
    <div className="grid" style={{ gridTemplateColumns: `auto repeat(${STATES.length}, 64px)`, gap: 12 }}>
      <span />
      {STATES.map((state) => <span className="label" key={state}>{state}</span>)}
      {SHAPES.map((shape, index) => <Fragment key={shape}>
        <span className="label row-label">{shape}<small>{COLORS[(index * 3 + 1) % COLORS.length]}</small></span>
        {STATES.map((state) => <span className="cell" key={`${shape}-${state}`} style={{ width: 64, height: 64 }}>
          <OnboardingCharacter color={COLORS[(index * 3 + 1) % COLORS.length]} paused={paused} shape={shape} sizePx={64} sourceId={`sheet-${shape}-${state}`} state={state} />
        </span>)}
      </Fragment>)}
      <span className="label row-label">28 px</span>
      {STATES.map((state) => <span className="cell" key={`small-${state}`} style={{ width: 64, height: 64 }}>
        <OnboardingCharacter color="blue" paused={paused} shape="pebble" sizePx={28} sourceId={`sheet-small-${state}`} state={state} />
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
      <strong>Clay faces</strong>
      <span className="group">{(["light", "dark"] as const).map((candidate) => <button aria-pressed={theme === candidate} key={candidate} onClick={() => setTheme(candidate)} type="button">{candidate}</button>)}</span>
      <span className="group">{STATES.map((candidate) => <button aria-pressed={state === candidate} key={candidate} onClick={() => { setRunning(false); setState(candidate); }} type="button">{candidate}</button>)}</span>
      <span className="group"><button aria-pressed={running} onClick={() => setRunning((value) => !value)} type="button">run</button><button aria-pressed={paused} onClick={() => setPaused((value) => !value)} type="button">paused</button></span>
      <span className="group tones">{SKIN_TONES.map((tone) => <span className="tone" key={tone} style={{ background: tone }} title={tone} />)}<small>skin tones, by hair colour: {COLORS.map((color) => `${color}→${SKIN_TONES.indexOf(resolvePersonaTone(color) as typeof SKIN_TONES[number]) + 1}`).join(" ")}</small></span>
    </header>
    {SIZES.map((size) => <Grid key={size} paused={paused} size={size} state={state} />)}
    <StatesSheet paused={paused} />
  </div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
