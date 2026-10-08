/**
 * A scripted voice call for the review link (8 October 2026, the founder's
 * iPhone screenshots of the call: a pill at the top of the chat, a full
 * screen behind it). It stands in for the call the phone will make, behind
 * the same `window.desktop.voiceCall` the window's phone button calls, plus
 * the three things the phone's call needs that the Mac's banner keeps to
 * itself: `subscribe` (the call as it goes), `mute` and `hangUp`.
 *
 * Only on the review link (`?review`): the website's demo has no calls.
 */

export type DemoCallPhase = "ringing" | "live" | "ended";

export interface DemoCallLine { readonly speaker: "user" | "agent"; readonly text: string }

export interface DemoCallState {
  readonly phase: DemoCallPhase;
  readonly status: string;
  readonly agentId: string;
  readonly agentName: string;
  readonly agentColor: string;
  readonly isMuted: boolean;
  readonly mode: "speaking" | "listening";
  readonly levels: readonly number[];
  readonly lines: readonly DemoCallLine[];
  readonly connectedAtMs: number | null;
  readonly endedAtMs: number | null;
}

/** The call as it goes, a beat at a time: [milliseconds after the call starts, what happens]. */
const SCRIPT: readonly (readonly [number, "live" | "speak" | "listen" | DemoCallLine])[] = [
  [2400, "live"],
  [3000, "speak"],
  [3200, { speaker: "agent", text: "Hey Bass. What can I do for you?" }],
  [5200, "listen"],
  [7600, { speaker: "user", text: "Can you move the launch review to Friday?" }],
  [8400, "speak"],
  [8600, { speaker: "agent", text: "Done. It's Friday at 2 pm, and Dana and Marcus have the new time." }],
  [11800, "listen"],
  [14200, { speaker: "user", text: "Perfect, thanks." }],
  [14800, "speak"],
  [15000, { speaker: "agent", text: "Anytime. Anything else?" }],
  [16800, "listen"],
];

const VOICES = [
  { id: "aria", name: "Aria" },
  { id: "roger", name: "Roger" },
  { id: "sarah", name: "Sarah" },
  { id: "laura", name: "Laura" },
];

export function createDemoCall(now: () => number = Date.now) {
  let state: DemoCallState | null = null;
  const listeners = new Set<(state: DemoCallState | null) => void>();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let wave: ReturnType<typeof setInterval> | null = null;
  const voices = new Map<string, string>();

  const emit = () => { for (const listener of listeners) listener(state); };
  const set = (patch: Partial<DemoCallState>) => { if (state != null) { state = { ...state, ...patch }; emit(); } };
  const stop = () => {
    for (const timer of timers.splice(0)) clearTimeout(timer);
    if (wave != null) { clearInterval(wave); wave = null; }
  };

  return {
    getAvailability: () => ({ enabled: true }),
    start(agentId: string, agentName?: string, agentColor?: string) {
      if (state != null) return { started: false };
      state = { phase: "ringing", status: "Calling…", agentId, agentName: agentName ?? "Agent", agentColor: agentColor ?? "blue", isMuted: false, mode: "listening", levels: [], lines: [], connectedAtMs: null, endedAtMs: null };
      emit();
      for (const [at, beat] of SCRIPT) {
        timers.push(setTimeout(() => {
          if (beat === "live") set({ phase: "live", status: "", connectedAtMs: now() });
          else if (beat === "speak" || beat === "listen") set({ mode: beat === "speak" ? "speaking" : "listening" });
          else set({ lines: [...(state?.lines ?? []), beat] });
        }, at));
      }
      // The waveform: a voice's loudness, bar by bar, louder while the agent speaks.
      wave = setInterval(() => {
        if (state == null || state.phase !== "live") return;
        const loud = state.mode === "speaking" ? 1 : state.isMuted ? 0 : 0.35;
        set({ levels: Array.from({ length: 24 }, () => loud * (0.25 + Math.random() * 0.75)) });
      }, 90);
      return { started: true };
    },
    noteAgent: () => undefined,
    listVoices: () => VOICES,
    getAgentVoice: (agentId: string) => ({ voiceId: voices.get(agentId) ?? VOICES[0]!.id, isDefault: !voices.has(agentId) }),
    setAgentVoice: (agentId: string, voiceId: string | null) => {
      if (voiceId == null) voices.delete(agentId); else voices.set(agentId, voiceId);
      return { voiceId: voiceId ?? VOICES[0]!.id, isDefault: voiceId == null };
    },
    previewUrl: () => null,
    rateCall: () => undefined,
    subscribe(listener: (state: DemoCallState | null) => void) {
      listeners.add(listener);
      listener(state);
      return () => { listeners.delete(listener); };
    },
    mute(isMuted: boolean) { set({ isMuted }); },
    hangUp() {
      if (state == null || state.phase === "ended") return;
      stop();
      set({ phase: "ended", status: "Call ended", mode: "listening", levels: [], endedAtMs: now() });
      // A finished call leaves by itself, as the Mac's banner does (ENDED_DISMISS_MS).
      timers.push(setTimeout(() => { state = null; emit(); }, 1200));
    },
  };
}
