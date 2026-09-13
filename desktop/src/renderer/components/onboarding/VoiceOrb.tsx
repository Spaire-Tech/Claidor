import React, { useEffect, useState } from 'react';

import type { VoiceDefinition } from './voices';

/**
 * A voice as the founder drew it: a mesh of three slow gradient layers, a
 * grain over them, a soft inner shadow, and, on the chosen one, the white
 * play disc. The grain is a tile of random noise made once on a canvas; an
 * SVG noise is in place until the canvas has drawn.
 */

const GRAIN_TILE_SIZE = 256;
const GRAIN_FALLBACK = 'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNDAiIGhlaWdodD0iMjQwIj48ZmlsdGVyIGlkPSJuIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC45IiBudW1PY3RhdmVzPSI0IiBzdGl0Y2hUaWxlcz0ic3RpdGNoIi8+PGZlQ29sb3JNYXRyaXggdHlwZT0ic2F0dXJhdGUiIHZhbHVlcz0iMCIvPjxmZUNvbXBvbmVudFRyYW5zZmVyPjxmZUZ1bmNSIHR5cGU9ImxpbmVhciIgc2xvcGU9IjIuNCIgaW50ZXJjZXB0PSItMC43Ii8+PGZlRnVuY0cgdHlwZT0ibGluZWFyIiBzbG9wZT0iMi40IiBpbnRlcmNlcHQ9Ii0wLjciLz48ZmVGdW5jQiB0eXBlPSJsaW5lYXIiIHNsb3BlPSIyLjQiIGludGVyY2VwdD0iLTAuNyIvPjwvZmVDb21wb25lbnRUcmFuc2Zlcj48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMjQwIiBoZWlnaHQ9IjI0MCIgZmlsdGVyPSJ1cmwoI24pIi8+PC9zdmc+")';

let grainUrl: string | null = null;

const makeGrainUrl = (): string | null => {
  if (grainUrl) return grainUrl;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = GRAIN_TILE_SIZE;
    canvas.height = GRAIN_TILE_SIZE;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const image = context.createImageData(GRAIN_TILE_SIZE, GRAIN_TILE_SIZE);
    const data = image.data;
    for (let index = 0; index < data.length; index += 4) {
      const grey = Math.random() * 255 | 0;
      data[index] = grey;
      data[index + 1] = grey;
      data[index + 2] = grey;
      data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    grainUrl = `url(${canvas.toDataURL('image/png')})`;
    return grainUrl;
  } catch {
    return null;
  }
};

/** The grain tile as a CSS `url(...)`, the SVG noise until the canvas has drawn. */
export const useGrainUrl = (): string => {
  const [url, setUrl] = useState<string>(() => grainUrl ?? GRAIN_FALLBACK);
  useEffect(() => {
    if (grainUrl) {
      setUrl(grainUrl);
      return;
    }
    const made = makeGrainUrl();
    if (made) setUrl(made);
  }, []);
  return url;
};

const PLAY_DISC_SIZE = 56;
/** The ring sits just outside the disc, so neither crops the other. */
const PLAY_RING_SIZE = PLAY_DISC_SIZE + 10;

/**
 * What the disc is doing. The founder's note: « that play button doesnt
 * do anything as in, yes it will play the sound, but the icon stays the
 * same as if its paused. so no one knows. »
 *
 * Three states rather than two, because the sound does not start at the
 * moment of the click: the sentence is fetched, spoken by a service and
 * sent back as audio, and that wait is long enough to read as a dead
 * button. Loading is the state that answers the click.
 */
export const VoicePlayState = {
  Idle: 'idle',
  Loading: 'loading',
  Playing: 'playing',
} as const;
export type VoicePlayState = typeof VoicePlayState[keyof typeof VoicePlayState];

export interface VoiceOrbProps {
  voice: VoiceDefinition;
  /** A CSS length; the founder sizes the orbs with clamp(). */
  size: string;
  opacity: number;
  /** The chosen voice carries the play disc and plays on click. */
  selected: boolean;
  label: string;
  playLabel: string;
  /** Said instead of `playLabel` while the sound is playing. */
  stopLabel: string;
  /** Said while the sentence is on its way. */
  loadingLabel: string;
  playState: VoicePlayState;
  grainUrl: string;
  onSelect: () => void;
  onPlay: () => void;
}

const VoiceOrb: React.FC<VoiceOrbProps> = ({
  voice,
  size,
  opacity,
  selected,
  label,
  playLabel,
  stopLabel,
  loadingLabel,
  playState,
  grainUrl: grain,
  onSelect,
  onPlay,
}) => {
  const [base, bloom, highlight] = voice.gradients;
  const discLabel = playState === VoicePlayState.Playing
    ? stopLabel
    : playState === VoicePlayState.Loading
      ? loadingLabel
      : playLabel;
  return (
    <button
      type="button"
      aria-label={selected ? discLabel : label}
      aria-pressed={selected}
      aria-busy={selected && playState === VoicePlayState.Loading}
      onClick={selected ? onPlay : onSelect}
      className="maties-orb relative shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0"
      style={{ width: size, height: size, opacity }}
    >
      <span className="absolute inset-0 overflow-hidden rounded-full">
        <span className="maties-orb-base absolute inset-0" style={{ background: base }} />
        <span className="maties-orb-mesh-a absolute" style={{ inset: '-6%', background: bloom, filter: 'blur(6px)' }} />
        <span className="maties-orb-mesh-b absolute" style={{ inset: '-6%', background: highlight, filter: 'blur(6px)' }} />
        <span className="maties-orb-grain-screen absolute inset-0" style={{ backgroundImage: grain }} />
        <span className="maties-orb-grain-multiply absolute inset-0" style={{ backgroundImage: grain }} />
        <span className="absolute inset-0 rounded-full" style={{ boxShadow: 'inset 0 0 40px rgba(20,16,12,.14)' }} />
      </span>
      {selected && (
        <>
          {/* The ring turns only while the sentence is on its way. It sits
              outside the disc so the disc itself never moves: a control
              that jumps on click feels broken even when it works. */}
          {playState === VoicePlayState.Loading && (
            <span
              className="maties-orb-spinner absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: PLAY_RING_SIZE,
                height: PLAY_RING_SIZE,
                border: '2px solid rgba(255,255,255,.45)',
                borderTopColor: '#fff',
              }}
              aria-hidden="true"
            />
          )}
          <span
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white transition-transform duration-150"
            style={{ width: PLAY_DISC_SIZE, height: PLAY_DISC_SIZE, boxShadow: '0 2px 10px rgba(16,22,35,.14)' }}
            aria-hidden="true"
          >
            {playState === VoicePlayState.Playing ? (
              // A stop square, the shape every player uses for « this is
              // running, press to end it ». Rounded to match the disc.
              <svg width="15" height="15" viewBox="0 0 15 15" fill="#1c1f23">
                <rect width="15" height="15" rx="3.2" />
              </svg>
            ) : (
              <svg width="15" height="17" viewBox="0 0 15 17" fill="#1c1f23"><path d="M14 8.5 0 17V0z" /></svg>
            )}
          </span>
        </>
      )}
    </button>
  );
};

export default VoiceOrb;
