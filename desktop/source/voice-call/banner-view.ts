/**
 * The banner's DOM: the approved mock-up's markup (index.html) brought to
 * life. It paints a `BannerView` (call-state.ts), the agent's mark, the
 * mute button, and the waveform bars, and animates the mark the way the
 * mock-up does: a slow breath, a blink every few seconds, eyes almost shut
 * once the call is over.
 */
import { agentMarkSvg, agentPalette } from "../shared/voice-call/agent-mark.js";
import type { BannerView } from "../shared/voice-call/call-state.js";

export const WAVE_BARS = 46;
/** Tallest bar above the 2 pt floor, speaking and listening (the mock-up's 16 and 9, listening lifted for a real microphone). */
const WAVE_SPEAKING = 16;
const WAVE_LISTENING = 12;

export interface BannerElements {
  readonly banner: HTMLElement;
  readonly avatar: HTMLElement;
  readonly name: HTMLElement;
  readonly status: HTMLElement;
  readonly quick: HTMLButtonElement;
  readonly wave: HTMLElement;
  readonly mute: HTMLButtonElement;
  readonly end: HTMLButtonElement;
  readonly again: HTMLButtonElement;
  readonly chat: HTMLButtonElement;
  readonly close: HTMLButtonElement;
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (found == null) throw new Error(`The banner has no ${selector}.`);
  return found;
}

export function bannerElements(root: ParentNode = document): BannerElements {
  return {
    banner: required(root, ".banner"),
    avatar: required(root, ".av"),
    name: required(root, ".nm"),
    status: required(root, ".st"),
    quick: required(root, ".quick"),
    wave: required(root, ".wave"),
    mute: required(root, ".mute"),
    end: required(root, ".end"),
    again: required(root, ".again"),
    chat: required(root, ".chat"),
    close: required(root, ".close"),
  };
}

export interface BannerPainter {
  paintAgent(agent: { readonly name: string; readonly color: string | null; readonly avatarDataUrl: string | null; readonly agentId: string }): void;
  paint(view: BannerView, isMuted: boolean): void;
  /** One value per bar in [0, 1], or null to lay the bars flat. */
  setLevels(levels: readonly number[] | null, mode: "speaking" | "listening"): void;
  /** Breath and blink, driven by the page's animation frame. */
  animate(nowMs: number, state: string): void;
}

export function createBannerPainter(elements: BannerElements, options: { readonly reducedMotion: boolean; readonly seed: number }): BannerPainter {
  const bars: HTMLElement[] = [];
  for (let index = 0; index < WAVE_BARS; index += 1) {
    const bar = elements.wave.ownerDocument.createElement("i");
    elements.wave.append(bar);
    bars.push(bar);
  }
  let mark: SVGSVGElement | null = null;
  let eyes: SVGGElement | null = null;
  let lastState = "";
  let lastStatus = "";
  let lastMuted: boolean | null = null;

  return {
    paintAgent(agent) {
      elements.name.textContent = agent.name;
      const palette = agentPalette(agent.color);
      elements.banner.style.setProperty("--ink-from", palette.top);
      elements.banner.style.setProperty("--ink-mid", palette.mid);
      elements.banner.style.setProperty("--ink-to", palette.bottom);
      if (agent.avatarDataUrl != null) {
        const image = elements.avatar.ownerDocument.createElement("img");
        image.alt = "";
        image.src = agent.avatarDataUrl;
        elements.avatar.replaceChildren(image);
        mark = null; eyes = null;
        return;
      }
      elements.avatar.innerHTML = agentMarkSvg(`call-${agent.agentId.slice(0, 12)}`);
      mark = elements.avatar.querySelector("svg");
      eyes = mark?.querySelector<SVGGElement>("g[clip-path]") ?? null;
      eyes?.classList.add("eyes");
    },
    paint(view, isMuted) {
      if (view.state !== lastState) { elements.banner.dataset.state = view.state; lastState = view.state; }
      if (view.status !== lastStatus) { elements.status.textContent = view.status; lastStatus = view.status; }
      if (isMuted !== lastMuted) {
        lastMuted = isMuted;
        elements.mute.setAttribute("aria-pressed", String(isMuted));
        const use = elements.mute.querySelector("use");
        use?.setAttribute("href", isMuted ? "#i-micoff" : "#i-mic");
        const label = elements.mute.querySelector("span");
        if (label != null) label.textContent = isMuted ? "Unmute" : "Mute";
      }
    },
    setLevels(levels, mode) {
      const amplitude = mode === "speaking" ? WAVE_SPEAKING : WAVE_LISTENING;
      bars.forEach((bar, index) => {
        const window = Math.sin((Math.PI * (index + 0.5)) / bars.length);
        const level = levels == null ? 0 : Math.max(0, Math.min(1, levels[index] ?? 0));
        bar.style.height = `${(2 + level * amplitude * window).toFixed(1)}px`;
      });
    },
    animate(nowMs, state) {
      if (options.reducedMotion || mark == null) return;
      const t = nowMs / 1000;
      const breath = 1 + Math.sin(t * 2 + options.seed) * 0.015;
      mark.style.transform = `scale(${(2 - breath).toFixed(4)},${breath.toFixed(4)})`;
      if (eyes != null) {
        const phase = (t + options.seed) % 4.2;
        const open = state === "ended" || state === "failed" ? 0.15 : phase < 0.14 ? 1 - Math.sin((phase / 0.14) * Math.PI) * 0.9 : 1;
        eyes.style.transform = `scaleY(${open.toFixed(3)})`;
      }
    },
  };
}

/**
 * Bar levels from the SDK's byte frequency data (0..255, voice range): the
 * lowest bins, where a voice is loudest, in the middle bars, falling off
 * toward the edges, so the shape matches the mock-up's.
 */
export function levelsFromFrequencies(data: Uint8Array | null | undefined, previous: readonly number[] | null, bars = WAVE_BARS): number[] {
  const levels: number[] = [];
  const usable = data == null ? 0 : Math.max(1, Math.min(data.length, 48));
  const middle = (bars - 1) / 2;
  for (let index = 0; index < bars; index += 1) {
    const distance = Math.abs(index - middle) / (middle + 1);
    const bin = Math.min(usable - 1, Math.floor(distance * usable));
    const target = data == null || usable === 0 ? 0 : (data[bin] ?? 0) / 255;
    const before = previous?.[index] ?? 0;
    levels.push(Math.max(target, before * 0.82));
  }
  return levels;
}
