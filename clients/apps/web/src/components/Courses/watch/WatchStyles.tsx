'use client'

// Shared styles for the Spaire Originals v2 watch experience — a literal
// port of originals2.css scoped under `.sov2` (overlay roots). The player
// is always dark; the sheets/panels follow the page theme via `.sov2.dark`.

export function WatchStyles() {
  return (
    <style jsx global>{`
      .sov2 {
        --bg: #ffffff;
        --band: 255, 255, 255;
        --bt: #1d1d1f;
        --bt2: rgba(0, 0, 0, 0.56);
        --bt3: rgba(0, 0, 0, 0.4);
        --text: #1d1d1f;
        --text-2: #86868b;
        --ink: #07080a;
        --blue: #0071e3;
        --hair: rgba(0, 0, 0, 0.12);
        --ans: #4a4a4f;
        --sf:
          -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text',
          system-ui, sans-serif;
        --po:
          'Poppins', var(--font-poppins), -apple-system, BlinkMacSystemFont,
          system-ui, sans-serif;
        font-family: var(--sf);
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        letter-spacing: -0.014em;
      }
      .sov2.dark {
        --bg: #141416;
        --band: 20, 20, 22;
        --bt: #f5f5f7;
        --bt2: rgba(245, 245, 247, 0.65);
        --bt3: rgba(245, 245, 247, 0.45);
        --text: #f5f5f7;
        --text-2: rgba(245, 245, 247, 0.6);
        --hair: rgba(245, 245, 247, 0.16);
        --ans: rgba(245, 245, 247, 0.78);
      }
      .sov2 button {
        font-family: inherit;
        cursor: pointer;
        border: none;
        background: none;
        color: inherit;
        padding: 0;
      }
      .sov2 *,
      .sov2 *::before,
      .sov2 *::after {
        box-sizing: border-box;
      }

      /* ════════ glass sheets (overview) ════════ */
      .sov2.sheet-overlay {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: grid;
        place-items: center;
        padding: 24px;
        background: rgba(10, 10, 12, 0.4);
        -webkit-backdrop-filter: blur(22px) saturate(120%);
        backdrop-filter: blur(22px) saturate(120%);
        animation: sov2-ovIn 0.3s ease;
      }
      @keyframes sov2-ovIn {
        from {
          opacity: 0;
        }
      }
      .sov2 .x-sheet {
        width: min(560px, 100%);
        max-height: 100%;
        display: flex;
        flex-direction: column;
        border-radius: 28px;
        overflow: hidden;
        background: var(--bg);
        color: var(--text);
        box-shadow:
          0 50px 100px rgba(0, 0, 0, 0.4),
          0 8px 28px rgba(0, 0, 0, 0.2);
        animation: sov2-sheetIn 0.42s cubic-bezier(0.2, 1, 0.3, 1);
      }
      .sov2 .x-sheet.wide {
        width: min(640px, 100%);
      }
      @keyframes sov2-sheetIn {
        from {
          transform: translateY(22px) scale(0.96);
        }
      }
      .sov2 .xs-cover {
        position: relative;
        flex: none;
        aspect-ratio: 16 / 8.4;
        overflow: hidden;
        background: #111;
      }
      .sov2 .xs-cover img,
      .sov2 .xs-cover .xs-img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        background-size: cover;
        background-position: center;
      }
      .sov2 .xs-shade {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          0deg,
          rgba(5, 5, 8, 0.66) 0%,
          rgba(5, 5, 8, 0.24) 44%,
          transparent 70%
        );
      }
      .sov2 .xs-eyebrow {
        position: absolute;
        top: 20px;
        left: 24px;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: 8px;
        color: rgba(255, 255, 255, 0.9);
        font-family: var(--po);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.22em;
        text-transform: uppercase;
      }
      .sov2 .xs-eyebrow .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #e0482e;
      }
      .sov2 .xs-title {
        position: absolute;
        left: 24px;
        right: 70px;
        bottom: 16px;
        z-index: 2;
        font-family: var(--po);
        font-size: 26px;
        font-weight: 700;
        letter-spacing: -0.025em;
        line-height: 1.08;
        color: #fff;
      }
      .sov2 .xs-titlesub {
        font-family: var(--sf);
        font-size: 13px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.78);
        margin-top: 4px;
        letter-spacing: -0.01em;
      }
      .sov2 .xs-close {
        position: absolute;
        top: 16px;
        right: 16px;
        z-index: 3;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(10, 11, 13, 0.46);
        color: #fff;
        -webkit-backdrop-filter: blur(14px) saturate(150%);
        backdrop-filter: blur(14px) saturate(150%);
        display: grid;
        place-items: center;
        transition:
          background 0.18s,
          transform 0.16s;
      }
      .sov2 .xs-close:hover {
        background: rgba(40, 40, 46, 0.7);
        transform: scale(1.06);
      }
      .sov2 .xs-close:active {
        transform: scale(0.92);
      }
      .sov2 .xs-body {
        overflow-y: auto;
        overscroll-behavior: contain;
        min-height: 0;
        padding: 26px 32px 32px;
      }

      .sov2 .cta-main {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        width: 100%;
        height: 50px;
        border-radius: 980px;
        background: var(--text);
        color: var(--bg);
        font-size: 16px;
        font-weight: 600;
        letter-spacing: -0.01em;
        transition:
          transform 0.16s,
          opacity 0.16s,
          background 0.4s ease,
          color 0.4s ease;
      }
      .sov2 .cta-main:hover {
        opacity: 0.88;
        transform: scale(1.02);
      }
      .sov2 .cta-main:active {
        transform: scale(0.97);
      }
      .sov2 .icon-glass {
        position: relative;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: rgba(var(--band), 0.55);
        color: var(--bt);
        -webkit-backdrop-filter: blur(20px) saturate(160%);
        backdrop-filter: blur(20px) saturate(160%);
        box-shadow: inset 0 0 0 1px var(--bt3);
        display: grid;
        place-items: center;
        transition:
          background 0.18s,
          transform 0.16s,
          color 0.4s ease;
      }
      .sov2 .icon-glass:hover {
        transform: scale(1.06);
      }
      .sov2 .icon-glass:active {
        transform: scale(0.94);
      }
      .sov2.dark .icon-glass {
        background: rgba(255, 255, 255, 0.14);
        box-shadow: none;
        color: #fff;
      }
      .sov2 .icon-glass.on {
        background: var(--bt);
        color: var(--bg);
        box-shadow: none;
      }

      /* overview sheet internals */
      .sov2 .ov-chips {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 26px;
      }
      .sov2 .ov-chips .cta-main {
        flex: 1;
        width: auto;
      }
      .sov2 .ov-chips .icon-glass {
        flex: none;
      }
      .sov2 .ov-h {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-2);
        margin: 26px 0 12px;
      }
      .sov2 .ov-h:first-child {
        margin-top: 0;
      }
      .sov2 .ov-p {
        font-size: 15px;
        line-height: 1.6;
        color: var(--ans);
        transition: color 0.4s ease;
      }
      .sov2 .ov-p + .ov-p {
        margin-top: 12px;
      }
      .sov2 .ov-learn {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin: 0;
        padding: 0;
      }
      .sov2 .ov-learn li {
        position: relative;
        padding-left: 18px;
        font-size: 14.5px;
        line-height: 1.45;
        color: var(--ans);
      }
      .sov2 .ov-learn li::before {
        content: '';
        position: absolute;
        left: 2px;
        top: 0.58em;
        width: 4.5px;
        height: 4.5px;
        border-radius: 50%;
        background: var(--text-2);
      }
      .sov2 .ov-res {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .sov2 .ov-res-row {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 13px 16px;
        border-radius: 14px;
        background: rgba(125, 125, 135, 0.1);
        text-align: left;
        transition: background 0.15s;
        text-decoration: none;
        color: inherit;
      }
      .sov2 .ov-res-row:hover {
        background: rgba(125, 125, 135, 0.18);
      }
      .sov2.dark .ov-res-row {
        background: rgba(255, 255, 255, 0.07);
      }
      .sov2.dark .ov-res-row:hover {
        background: rgba(255, 255, 255, 0.12);
      }
      .sov2 .ov-res-ico {
        flex: none;
        color: var(--text-2);
        display: grid;
        place-items: center;
      }
      .sov2 .ov-res-main {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .sov2 .ov-res-main .rn {
        font-size: 14.5px;
        font-weight: 600;
        color: var(--text);
      }
      .sov2 .ov-res-main .rm {
        font-size: 12.5px;
        color: var(--text-2);
      }
      .sov2 .ov-res-dl {
        color: var(--text-2);
      }

      /* ════════ player (always dark) ════════ */
      .sov2.player {
        position: fixed;
        inset: 0;
        z-index: 300;
        background: #000;
        color: #fff;
        letter-spacing: -0.01em;
      }
      .sov2 .player-video {
        position: absolute;
        inset: 0;
        background-size: cover;
        background-position: center;
      }
      .sov2 .player-video video {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
        background: #000;
      }
      .sov2 .player-vignette {
        position: absolute;
        inset: 0;
        pointer-events: none;
        transition: opacity 0.35s ease;
        background: linear-gradient(
          180deg,
          rgba(0, 0, 0, 0.55) 0%,
          transparent 24%,
          transparent 60%,
          rgba(0, 0, 0, 0.78) 100%
        );
      }

      /* Idle chrome fades away while the video plays; any interaction
         (handled in WatchPlayer) brings it back. */
      .sov2.player.ui-hidden {
        cursor: none;
      }
      .sov2.player.ui-hidden .player-top,
      .sov2.player.ui-hidden .player-controls,
      .sov2.player.ui-hidden .player-vignette {
        opacity: 0;
        pointer-events: none;
      }
      .sov2 .pbtn {
        position: relative;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
        -webkit-backdrop-filter: blur(40px) saturate(150%);
        backdrop-filter: blur(40px) saturate(150%);
        display: grid;
        place-items: center;
        transition:
          background 0.18s,
          transform 0.16s;
      }
      .sov2 .pbtn:hover {
        background: rgba(255, 255, 255, 0.26);
        transform: scale(1.05);
      }
      .sov2 .pbtn:active {
        transform: scale(0.93);
      }
      .sov2 .pbtn.big {
        width: 64px;
        height: 64px;
      }
      .sov2 .pbtn.sm {
        width: 44px;
        height: 44px;
      }
      .sov2 .pbtn.on {
        background: rgba(255, 255, 255, 0.92);
        color: #0b0b0d;
      }
      .sov2 .pbtn-badge {
        position: absolute;
        top: -2px;
        right: -2px;
        min-width: 17px;
        height: 17px;
        padding: 0 5px;
        border-radius: 980px;
        background: var(--blue);
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        line-height: 17px;
      }
      .sov2 .player-top {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: 4;
        display: flex;
        align-items: center;
        gap: 18px;
        padding: 26px 36px;
        transition: opacity 0.35s ease;
      }
      .sov2 .player-title {
        flex: 1;
        min-width: 0;
      }
      .sov2 .pt-k {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.66);
      }
      .sov2 .pt-t {
        font-size: 17px;
        font-weight: 600;
        margin-top: 3px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sov2 .player-top-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .sov2 .pchip {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.05em;
        padding: 4px 9px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.14);
        color: rgba(255, 255, 255, 0.85);
        -webkit-backdrop-filter: blur(14px);
        backdrop-filter: blur(14px);
      }
      .sov2 .player-bigplay {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 4;
        width: 96px;
        height: 96px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.16);
        color: #fff;
        -webkit-backdrop-filter: blur(30px) saturate(150%);
        backdrop-filter: blur(30px) saturate(150%);
        display: grid;
        place-items: center;
        padding-left: 6px;
        transition:
          background 0.2s,
          transform 0.16s;
      }
      .sov2 .player-bigplay:hover {
        background: rgba(255, 255, 255, 0.28);
        transform: translate(-50%, -50%) scale(1.05);
      }
      .sov2 .player-controls {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 5;
        padding: 0 36px 28px;
        transition: opacity 0.35s ease;
      }
      .sov2 .scrub-row {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .sov2 .ptime {
        font-size: 13px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.85);
        font-variant-numeric: tabular-nums;
        min-width: 44px;
      }
      .sov2 .ptime:last-child {
        text-align: right;
      }
      .sov2 .scrub {
        position: relative;
        flex: 1;
        padding: 10px 0;
        cursor: pointer;
      }
      /* Hover-scrub preview — a floating frame card + time pill above the
         bar. No transition on left: it tracks the pointer 1:1, and only
         the appearance fades in. */
      .sov2 .scrub-preview {
        position: absolute;
        bottom: calc(100% + 14px);
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        pointer-events: none;
        animation: sov2-ovIn 0.18s ease;
      }
      .sov2 .scrub-thumb {
        position: relative;
        overflow: hidden;
        border-radius: 12px;
        background: rgba(20, 20, 24, 0.6);
        box-shadow: 0 16px 44px rgba(0, 0, 0, 0.55);
      }
      .sov2 .scrub-thumb img {
        position: absolute;
        top: 0;
        left: 0;
        max-width: none;
        user-select: none;
      }
      /* Hairline edge painted above the cropped sprite. */
      .sov2 .scrub-thumb::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
      }
      .sov2 .scrub-preview-time {
        padding: 3px 10px;
        border-radius: 980px;
        background: rgba(20, 20, 24, 0.55);
        -webkit-backdrop-filter: blur(14px) saturate(150%);
        backdrop-filter: blur(14px) saturate(150%);
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.01em;
      }
      .sov2 .scrub-track {
        position: relative;
        height: 5px;
        border-radius: 980px;
        background: rgba(255, 255, 255, 0.22);
      }
      .sov2 .scrub-buf {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        border-radius: 980px;
        background: rgba(255, 255, 255, 0.18);
      }
      .sov2 .scrub-fill {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        border-radius: 980px;
        background: #fff;
      }
      .sov2 .scrub-knob {
        position: absolute;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
      }
      .sov2 .transport {
        display: flex;
        align-items: center;
        margin-top: 8px;
      }
      .sov2 .tp-left {
        flex: 1;
        min-width: 0;
      }
      .sov2 .tp-chaplabel {
        font-size: 13px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.66);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sov2 .tp-center {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .sov2 .tp-right {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
      }
      /* Buffering — a hairline arc so a mid-stream stall never looks like
         a frozen frame. Independent of the auto-hiding chrome. */
      .sov2 .player-spin {
        position: absolute;
        top: 50%;
        left: 50%;
        z-index: 4;
        width: 54px;
        height: 54px;
        margin: -27px 0 0 -27px;
        pointer-events: none;
        border-radius: 50%;
        border: 2.5px solid rgba(255, 255, 255, 0.22);
        border-top-color: #fff;
        animation:
          sov2-spin 0.9s linear infinite,
          sov2-ovIn 0.25s ease;
      }
      @keyframes sov2-spin {
        to {
          transform: rotate(360deg);
        }
      }

      /* Volume — the slider slides out of a glass capsule on hover
         (macOS-player style) and while dragging or after a keyboard
         change (.open). */
      .sov2 .pvol {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .sov2 .pvol-slider {
        width: 0;
        opacity: 0;
        overflow: hidden;
        height: 28px;
        padding: 0;
        border-radius: 980px;
        background: rgba(255, 255, 255, 0.14);
        -webkit-backdrop-filter: blur(40px) saturate(150%);
        backdrop-filter: blur(40px) saturate(150%);
        display: flex;
        align-items: center;
        cursor: pointer;
        touch-action: none;
        transition:
          width 0.28s cubic-bezier(0.2, 1, 0.3, 1),
          opacity 0.2s ease,
          padding 0.28s cubic-bezier(0.2, 1, 0.3, 1);
      }
      .sov2 .pvol:hover .pvol-slider,
      .sov2 .pvol.open .pvol-slider {
        width: 96px;
        opacity: 1;
        padding: 0 12px;
      }
      .sov2 .pvol-track {
        position: relative;
        flex: 1;
        height: 4px;
        border-radius: 980px;
        background: rgba(255, 255, 255, 0.28);
      }
      .sov2 .pvol-fill {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        border-radius: 980px;
        background: #fff;
      }
      .sov2 .pvol-knob {
        position: absolute;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 11px;
        height: 11px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 5px rgba(0, 0, 0, 0.45);
      }

      /* Playback speed — text button + frosted menu above the transport. */
      .sov2 .prate {
        position: relative;
      }
      .sov2 .prate-label {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: -0.02em;
        font-variant-numeric: tabular-nums;
      }
      .sov2 .pmenu {
        position: absolute;
        bottom: calc(100% + 12px);
        right: 0;
        z-index: 6;
        min-width: 148px;
        padding: 6px;
        border-radius: 16px;
        background: rgba(28, 28, 32, 0.72);
        -webkit-backdrop-filter: blur(40px) saturate(150%);
        backdrop-filter: blur(40px) saturate(150%);
        box-shadow:
          0 20px 60px rgba(0, 0, 0, 0.5),
          inset 0 0 0 1px rgba(255, 255, 255, 0.08);
        animation: sov2-menuIn 0.28s cubic-bezier(0.2, 1, 0.3, 1);
      }
      @keyframes sov2-menuIn {
        from {
          opacity: 0;
          transform: translateY(8px) scale(0.97);
        }
      }
      .sov2 .pmenu-title {
        padding: 8px 12px 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.55);
      }
      .sov2 .pmenu-item {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 12px;
        border-radius: 10px;
        font-size: 13.5px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.9);
        font-variant-numeric: tabular-nums;
        transition: background 0.15s;
      }
      .sov2 .pmenu-item:hover {
        background: rgba(255, 255, 255, 0.12);
      }
      .sov2 .pmenu-item.on {
        font-weight: 600;
        color: #fff;
      }

      /* ════════ Up Next — Apple TV-style end screen ════════
         In the final seconds the player enters .endmode: the LIVE video
         shrinks into a floating card top-right (transform only — aspect
         never changes, playback never stops) while the next lesson's
         artwork takes over as the hero behind it. Deliberately NOT in
         the ui-hidden selectors: the prompt outlives the chrome fade. */
      .sov2 .player-video {
        transform-origin: top right;
        overflow: hidden;
        transition:
          transform 0.5s cubic-bezier(0.32, 0.72, 0, 1),
          border-radius 0.5s cubic-bezier(0.32, 0.72, 0, 1),
          box-shadow 0.5s ease;
      }
      .sov2.player.endmode .player-video {
        /* ~26% card pinned 40/84 from the top-right corner. Radius and
           shadow are authored large because the scale shrinks them too. */
        transform: translate(-40px, 84px) scale(0.26);
        border-radius: 56px;
        box-shadow:
          0 60px 160px rgba(0, 0, 0, 0.55),
          0 0 0 4px rgba(255, 255, 255, 0.14);
        z-index: 6;
        cursor: pointer;
      }
      /* End-screen chrome: transport, vignette and overlays step aside;
         the top bar (back button) stays reachable above the artwork. */
      .sov2.player.endmode .player-controls,
      .sov2.player.endmode .player-vignette {
        opacity: 0;
        pointer-events: none;
      }
      .sov2.player.endmode .player-bigplay,
      .sov2.player.endmode .player-cc,
      .sov2.player.endmode .tap-ind,
      .sov2.player.endmode .player-gestures {
        display: none;
      }
      .sov2.player.endmode .player-top {
        opacity: 1;
        pointer-events: auto;
        z-index: 8;
      }
      /* The outgoing lesson's title would fight the hero metadata. */
      .sov2.player.endmode .player-title {
        opacity: 0;
      }
      .sov2.player.endmode {
        cursor: default;
      }

      .sov2 .endscreen {
        position: absolute;
        inset: 0;
        z-index: 5;
        animation: sov2-esIn 0.35s ease both;
      }
      @keyframes sov2-esIn {
        from {
          opacity: 0;
        }
      }
      .sov2 .es-art {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .sov2 .es-art.ph {
        /* Liquid-glass ambient (the landing's placeholder) when the next
           lesson has no still yet. */
        background:
          radial-gradient(42% 52% at 20% 28%, #6e7a5e 0%, transparent 70%),
          radial-gradient(46% 56% at 76% 22%, #8a7565 0%, transparent 70%),
          radial-gradient(52% 62% at 62% 82%, #46464c 0%, transparent 72%),
          #57544e;
        filter: blur(40px);
        transform: scale(1.2);
      }
      .sov2 .es-scrim {
        position: absolute;
        inset: 0;
        background:
          linear-gradient(
            0deg,
            rgba(0, 0, 0, 0.78) 0%,
            rgba(0, 0, 0, 0.3) 38%,
            transparent 64%
          ),
          linear-gradient(100deg, rgba(0, 0, 0, 0.55) 0%, transparent 55%);
      }
      .sov2 .es-content {
        position: absolute;
        left: 56px;
        bottom: 60px;
        max-width: 560px;
        z-index: 2;
        animation: sov2-esRise 0.5s cubic-bezier(0.32, 0.72, 0, 1) both;
        animation-delay: 0.12s;
      }
      @keyframes sov2-esRise {
        from {
          opacity: 0;
          transform: translateY(18px);
        }
      }
      .sov2 .es-k {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.65);
      }
      .sov2 .es-title {
        margin: 10px 0 0;
        font-size: clamp(28px, 3.6vw, 42px);
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.08;
        color: #fff;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
      }
      .sov2 .es-meta {
        margin-top: 10px;
        font-size: 15px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.78);
        font-variant-numeric: tabular-nums;
      }
      .sov2 .es-desc {
        margin: 10px 0 0;
        max-width: 480px;
        font-size: 14.5px;
        line-height: 1.5;
        color: rgba(255, 255, 255, 0.7);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .sov2 .es-actions {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 24px;
      }
      /* The hero's real CTA, both variants (WatchPageStyles .abtn.play):
         cover = white pill with the black play chip; marquee = the band's
         46px rounded-rect play button. */
      .sov2 .es-play {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -0.01em;
        background: #fff;
        color: #111;
        transition:
          transform 0.16s cubic-bezier(0.2, 1.2, 0.3, 1),
          background 0.16s;
      }
      .sov2 .es-play:hover {
        transform: translateY(-1px);
      }
      .sov2 .es-play:active {
        transform: scale(0.975);
      }
      .sov2 .es-play.cover {
        gap: 11px;
        padding: 12px 24px 12px 12px;
        border-radius: 980px;
      }
      .sov2 .es-play-chip {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #111;
        color: #fff;
        display: grid;
        place-items: center;
        flex: none;
      }
      .sov2 .es-play.marquee {
        gap: 9px;
        height: 46px;
        padding: 0 22px;
        border-radius: 12px;
        box-shadow: 0 8px 26px rgba(0, 0, 0, 0.18);
      }
      .sov2 .es-cancel {
        height: 46px;
        padding: 0 24px;
        border-radius: 980px;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -0.01em;
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
        -webkit-backdrop-filter: blur(40px) saturate(150%);
        backdrop-filter: blur(40px) saturate(150%);
        transition:
          background 0.18s,
          transform 0.16s;
      }
      .sov2 .es-cancel:hover {
        background: rgba(255, 255, 255, 0.24);
      }
      .sov2 .es-cancel:active {
        transform: scale(0.975);
      }
      .sov2 .es-play.marquee ~ .es-cancel {
        border-radius: 12px;
      }
      .sov2 .es-count {
        margin-top: 16px;
        font-size: 13px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.7);
        font-variant-numeric: tabular-nums;
      }

      /* Captions — rendered by the player, not the browser: clean white
         text with a soft dark edge (no black box), film-subtitle style.
         Sits low over the picture; steps up above the transport whenever
         the chrome is visible so the controls never cover a line. */
      .sov2 .player-cc {
        position: absolute;
        left: 50%;
        bottom: 190px;
        transform: translateX(-50%);
        z-index: 4;
        max-width: min(82%, 900px);
        text-align: center;
        pointer-events: none;
        color: #fff;
        font-size: clamp(17px, 2.4vw, 28px);
        font-weight: 500;
        line-height: 1.35;
        letter-spacing: -0.005em;
        text-shadow: 0 0 2px rgba(0, 0, 0, 0.9), 0 1px 2px rgba(0, 0, 0, 0.85),
          0 2px 10px rgba(0, 0, 0, 0.5);
        transition: bottom 0.35s ease;
      }
      .sov2 .player-cc span {
        display: block;
      }
      /* Chrome faded → drop to the classic subtitle position. */
      .sov2.player.ui-hidden .player-cc {
        bottom: 64px;
      }

      /* ════════ discussion panel ════════ */
      .sov2.cmt-overlay {
        position: fixed;
        inset: 0;
        z-index: 400;
        display: flex;
        justify-content: flex-end;
        background: rgba(8, 8, 10, 0.3);
        animation: sov2-ovIn 0.25s ease;
      }
      .sov2 .cmt-panel {
        width: min(420px, 92vw);
        height: 100%;
        display: flex;
        flex-direction: column;
        background: rgba(var(--band), 0.88);
        color: var(--text);
        -webkit-backdrop-filter: blur(40px) saturate(150%);
        backdrop-filter: blur(40px) saturate(150%);
        box-shadow: -20px 0 60px rgba(0, 0, 0, 0.3);
        animation: sov2-panelIn 0.4s cubic-bezier(0.2, 1, 0.3, 1);
      }
      @keyframes sov2-panelIn {
        from {
          transform: translateX(60px);
          opacity: 0;
        }
      }
      .sov2 .cmt-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 24px 24px 12px;
      }
      .sov2 .cmt-h-title {
        font-size: 19px;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      .sov2 .cmt-h-sub {
        font-size: 13px;
        color: var(--text-2);
        margin-top: 2px;
      }
      .sov2 .cmt-x {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        flex: none;
        background: rgba(125, 125, 135, 0.16);
        color: var(--text);
        display: grid;
        place-items: center;
        transition:
          background 0.15s,
          transform 0.15s;
      }
      .sov2 .cmt-x:hover {
        background: rgba(125, 125, 135, 0.28);
      }
      .sov2 .cmt-x:active {
        transform: scale(0.92);
      }
      .sov2 .cmt-count {
        padding: 0 24px 10px;
        font-size: 13px;
        font-weight: 600;
        color: var(--text-2);
        border-bottom: 1px solid var(--hair);
      }
      .sov2 .cmt-list {
        flex: 1;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 16px 24px;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .sov2 .cmt {
        display: flex;
        gap: 12px;
      }
      .sov2 .cmt-av {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        object-fit: cover;
        flex: none;
        background: rgba(125, 125, 135, 0.2);
      }
      .sov2 .cmt-av.sm {
        width: 32px;
        height: 32px;
      }
      .sov2 .cmt-main {
        flex: 1;
        min-width: 0;
      }
      .sov2 .cmt-top {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .sov2 .cmt-name {
        font-size: 13.5px;
        font-weight: 600;
      }
      .sov2 .cmt-dot {
        width: 3px;
        height: 3px;
        border-radius: 50%;
        background: var(--text-2);
      }
      .sov2 .cmt-time {
        font-size: 12px;
        color: var(--text-2);
      }
      .sov2 .cmt-text {
        font-size: 14px;
        line-height: 1.5;
        color: var(--ans);
        margin-top: 4px;
      }
      .sov2 .cmt-actions {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-top: 7px;
      }
      .sov2 .cmt-like {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 12.5px;
        font-weight: 600;
        color: var(--text-2);
        transition: color 0.15s;
      }
      .sov2 .cmt-like.on {
        color: #e0482e;
      }
      .sov2 .cmt-reply {
        font-size: 12.5px;
        font-weight: 600;
        color: var(--text-2);
      }
      .sov2 .cmt-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        text-align: center;
        color: var(--text-2);
        font-size: 14px;
        padding: 48px 20px;
      }
      .sov2 .ce-ico {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: rgba(125, 125, 135, 0.14);
        display: grid;
        place-items: center;
      }
      .sov2 .cmt-compose {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 20px calc(14px + env(safe-area-inset-bottom, 0px));
        border-top: 1px solid var(--hair);
      }
      .sov2 .cmt-compose input {
        flex: 1;
        height: 40px;
        padding: 0 16px;
        border-radius: 980px;
        border: none;
        outline: none;
        background: rgba(125, 125, 135, 0.14);
        color: var(--text);
        font-family: var(--sf);
        font-size: 14px;
      }
      .sov2 .cmt-compose input::placeholder {
        color: var(--text-2);
      }
      .sov2 .cmt-send {
        color: var(--blue);
        display: grid;
        place-items: center;
        padding: 6px;
      }
      .sov2 .cmt-send:disabled {
        color: var(--text-2);
        opacity: 0.5;
        cursor: default;
      }

      /* ── discussion: threading + instructor moderation ── */
      .sov2 .cmt-pinned {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        font-weight: 600;
        color: var(--text-2);
        margin-bottom: 3px;
      }
      .sov2 .cmt-badge {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 2px 7px;
        border-radius: 980px;
        background: rgba(125, 125, 135, 0.18);
        color: var(--text);
      }
      .sov2 .cmt-name.is-instructor {
        color: var(--blue);
      }
      .sov2 .cmt-cheart {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 11.5px;
        font-weight: 600;
        color: var(--text-2);
      }
      .sov2 .cmt-cheart:disabled {
        cursor: default;
      }
      .sov2 .cmt-cheart-ico {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: rgba(125, 125, 135, 0.16);
        display: grid;
        place-items: center;
      }
      .sov2 .cmt-cheart.on .cmt-cheart-ico {
        background: rgba(224, 72, 46, 0.14);
      }
      .sov2 .cmt-mod {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        font-weight: 600;
        color: var(--text-2);
        transition: color 0.15s;
      }
      .sov2 .cmt-mod:hover {
        color: var(--text);
      }
      .sov2 .cmt-mod.on {
        color: var(--blue);
      }
      .sov2 .cmt-mod.danger:hover {
        color: #e0482e;
      }
      .sov2 .cmt-replies {
        margin-top: 14px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding-left: 2px;
        border-left: 2px solid var(--hair);
      }
      .sov2 .cmt.is-reply {
        padding-left: 12px;
      }
      .sov2 .cmt.is-reply .cmt-av {
        width: 26px;
        height: 26px;
      }
      .sov2 .cmt-compose-wrap {
        border-top: 1px solid var(--hair);
      }
      .sov2 .cmt-compose-wrap .cmt-compose {
        border-top: none;
      }
      .sov2 .cmt-replying {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 24px 0;
        font-size: 12px;
        color: var(--text-2);
      }
      .sov2 .cmt-replying strong {
        color: var(--text);
        font-weight: 600;
      }
      .sov2 .cmt-replying-x {
        margin-left: 4px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: rgba(125, 125, 135, 0.16);
        color: var(--text);
        display: grid;
        place-items: center;
      }

      @media (max-width: 820px) {
        .sov2 .player-top {
          padding: 18px 20px;
        }
        .sov2 .player-controls {
          padding: 0 20px 22px;
        }
        /* No hover on touch and no room in the transport row — volume is
           mute-only on small screens (system volume rules there anyway). */
        .sov2 .pvol-slider {
          display: none;
        }
        /* End screen on smaller viewports: the live-video card grows
           relative to the screen and the hero metadata hugs the edges. */
        .sov2.player.endmode .player-video {
          transform: translate(-16px, 72px) scale(0.34);
          border-radius: 40px;
        }
        .sov2 .es-content {
          left: 20px;
          right: 20px;
          bottom: 36px;
          max-width: none;
        }
        .sov2 .es-title {
          font-size: 26px;
        }
        .sov2 .xs-body {
          padding: 24px 22px 28px;
        }
      }

      /* ════════ player: lesson navigation + gestures ════════ */
      .sov2 .pbtn:disabled {
        opacity: 0.35;
        transform: none;
        cursor: default;
      }
      /* Transparent touch surface over the video — below the chrome (top
         bar z4 / controls z5 / bigplay z4) so buttons keep priority, above
         the vignette. Only touch handlers are bound; desktop mouse input
         is unaffected. */
      .sov2 .player-gestures {
        position: absolute;
        inset: 0;
        z-index: 3;
      }
      /* Double-tap seek indicator (YouTube-style). */
      .sov2 .tap-ind {
        position: absolute;
        top: 50%;
        z-index: 4;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        color: #fff;
        font-size: 12.5px;
        font-weight: 600;
        padding: 20px 22px;
        border-radius: 22px;
        background: rgba(0, 0, 0, 0.45);
        animation: sov2-tapind 0.55s ease both;
      }
      .sov2 .tap-ind.left {
        left: 9%;
      }
      .sov2 .tap-ind.right {
        right: 9%;
      }
      @keyframes sov2-tapind {
        from {
          opacity: 0;
          transform: translateY(-50%) scale(0.82);
        }
        25% {
          opacity: 1;
        }
        to {
          opacity: 0;
          transform: translateY(-50%) scale(1.04);
        }
      }

      /* (Up Next card styles live in the player section above — the
         pre-end .upnext-* glass card with the countdown ring.) */

      /* In-player lessons sheet — right drawer on desktop, bottom sheet on
         mobile (media block below). Always dark like the player. */
      .sov2 .pl-wrap {
        position: absolute;
        inset: 0;
        z-index: 7;
        display: flex;
        justify-content: flex-end;
        background: rgba(0, 0, 0, 0.5);
        animation: sov2-ovIn 0.25s ease;
      }
      .sov2 .pl-sheet {
        width: min(420px, 92vw);
        height: 100%;
        display: flex;
        flex-direction: column;
        background: rgba(18, 18, 22, 0.95);
        color: #fff;
        -webkit-backdrop-filter: blur(40px) saturate(150%);
        backdrop-filter: blur(40px) saturate(150%);
        box-shadow: -20px 0 60px rgba(0, 0, 0, 0.3);
        animation: sov2-panelIn 0.4s cubic-bezier(0.2, 1, 0.3, 1);
      }
      .sov2 .pl-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 20px 12px;
        font-size: 16px;
        font-weight: 700;
        letter-spacing: -0.015em;
      }
      .sov2 .pl-body {
        flex: 1;
        overflow-y: auto;
        overscroll-behavior: contain;
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 0 10px calc(16px + env(safe-area-inset-bottom, 0px));
      }
      .sov2 .pl-row {
        display: flex;
        align-items: center;
        gap: 12px;
        text-align: left;
        padding: 8px;
        border-radius: 12px;
        transition: background 0.15s;
      }
      .sov2 .pl-row:hover {
        background: rgba(255, 255, 255, 0.07);
      }
      .sov2 .pl-row.now {
        background: rgba(255, 255, 255, 0.12);
      }
      .sov2 .pl-row.locked {
        opacity: 0.5;
        cursor: default;
      }
      .sov2 .pl-thumb {
        position: relative;
        flex: none;
        width: 96px;
        aspect-ratio: 16 / 9;
        border-radius: 8px;
        overflow: hidden;
        background: #26262a;
        background-size: cover;
        background-position: center;
        display: grid;
        place-items: center;
        color: rgba(255, 255, 255, 0.9);
      }
      .sov2 .pl-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .sov2 .pl-num {
        font-size: 10.5px;
        font-weight: 600;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.6);
      }
      .sov2 .pl-title {
        font-size: 13.5px;
        font-weight: 600;
        line-height: 1.25;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
      }
      .sov2 .pl-dur {
        flex: none;
        font-size: 11.5px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.6);
        font-variant-numeric: tabular-nums;
      }

      /* ════════ mobile player controls (≤720) ════════
         The chapter label drops, the transport wraps into a centered
         cluster row (prev / −10 / play / +10 / next) with the utility
         buttons beneath, and paddings clear the home indicator. */
      @media (max-width: 720px) {
        .sov2 .tp-left {
          display: none;
        }
        .sov2 .transport {
          flex-wrap: wrap;
          justify-content: center;
          margin-top: 4px;
        }
        .sov2 .tp-center {
          width: 100%;
          justify-content: center;
          gap: 20px;
        }
        .sov2 .tp-right {
          width: 100%;
          flex: none;
          flex-wrap: wrap;
          justify-content: center;
          gap: 10px;
          margin-top: 8px;
        }
        .sov2 .player-controls {
          padding-bottom: max(18px, env(safe-area-inset-bottom, 0px));
        }
        .sov2 .ptime {
          min-width: 40px;
          font-size: 12px;
        }
        .sov2 .player-bigplay {
          width: 76px;
          height: 76px;
        }
        /* End screen on phones: actions stack full-width under the meta. */
        .sov2 .es-actions {
          flex-wrap: wrap;
        }
        .sov2 .es-play,
        .sov2 .es-cancel {
          flex: 1 1 auto;
          justify-content: center;
        }
        .sov2 .es-desc {
          display: none;
        }
        .sov2 .pl-wrap {
          justify-content: stretch;
          align-items: flex-end;
        }
        .sov2 .pl-sheet {
          width: 100%;
          height: min(72dvh, 620px);
          border-radius: 22px 22px 0 0;
          box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.3);
          animation: sov2-panelUp 0.4s cubic-bezier(0.2, 1, 0.3, 1);
        }
      }

      /* ════════ mobile (≤720): overlays become bottom sheets ════════
         The centered overview modal and the right-side discussion drawer
         both anchor to the bottom edge and slide up, matching the portal's
         PortalSheet behavior. */
      @media (max-width: 720px) {
        .sov2.sheet-overlay {
          padding: 0;
          place-items: end center;
        }
        .sov2 .x-sheet,
        .sov2 .x-sheet.wide {
          width: 100%;
          max-height: 92dvh;
          border-radius: 22px 22px 0 0;
          padding-bottom: env(safe-area-inset-bottom, 0px);
          animation: sov2-sheetUp 0.38s cubic-bezier(0.2, 1, 0.3, 1);
        }
        .sov2.cmt-overlay {
          justify-content: stretch;
          align-items: flex-end;
        }
        .sov2 .cmt-panel {
          width: 100%;
          height: min(82dvh, 680px);
          border-radius: 22px 22px 0 0;
          padding-bottom: env(safe-area-inset-bottom, 0px);
          box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.3);
          animation: sov2-panelUp 0.4s cubic-bezier(0.2, 1, 0.3, 1);
        }
      }
      @keyframes sov2-sheetUp {
        from {
          transform: translateY(48px);
          opacity: 0;
        }
      }
      @keyframes sov2-panelUp {
        from {
          transform: translateY(64px);
          opacity: 0;
        }
      }
    `}</style>
  )
}

export default WatchStyles
