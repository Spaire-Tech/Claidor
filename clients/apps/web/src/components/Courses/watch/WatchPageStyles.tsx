'use client'

// Styles for the portal watch page — a 1:1 port of the Spaire Originals v2
// design's page chrome (originals2.css: now-playing marquee hero, frosted
// band, catalog lesson rail) scoped under `.sow`. Light/dark via `.sow.dark`
// (driven by the course's landing theme). The player/sheets/comments styles
// live in WatchStyles (.sov2).

export function WatchPageStyles() {
  return (
    <style jsx global>{`
      .sow {
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
        --card-bg: #ffffff;
        --card-bd: #e6e6e9;
        --sf:
          -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text',
          system-ui, sans-serif;
        --po:
          'Poppins', var(--font-poppins), -apple-system, BlinkMacSystemFont,
          system-ui, sans-serif;
        --gut: 64px;
        font-family: var(--sf);
        background: var(--bg);
        color: var(--text);
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        letter-spacing: -0.014em;
        transition: background 0.4s ease;
        min-height: 100vh;
      }
      .sow.dark {
        --bg: #141416;
        --band: 20, 20, 22;
        --bt: #f5f5f7;
        --bt2: rgba(245, 245, 247, 0.65);
        --bt3: rgba(245, 245, 247, 0.45);
        --text: #f5f5f7;
        --text-2: rgba(245, 245, 247, 0.6);
        --hair: rgba(245, 245, 247, 0.16);
        --ans: rgba(245, 245, 247, 0.78);
        --card-bg: #1d1d20;
        --card-bd: rgba(245, 245, 247, 0.12);
      }
      .sow *,
      .sow *::before,
      .sow *::after {
        box-sizing: border-box;
      }
      .sow button {
        font-family: inherit;
        cursor: pointer;
        border: none;
        background: none;
        color: inherit;
        padding: 0;
      }

      /* ════════ marquee hero — now playing ════════ */
      .sow .panel {
        position: relative;
        width: 100%;
        height: 100svh;
        min-height: 640px;
        overflow: hidden;
        background: var(--ink);
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
      }
      .sow .hero-layer {
        position: absolute;
        inset: 0;
        background-size: cover;
        background-position: center 24%;
        opacity: 0;
        transition: opacity 0.8s ease;
        transform: scale(1.03);
      }
      .sow .hero-layer.show {
        opacity: 1;
      }
      .sow .hero-layer.ph {
        background:
          radial-gradient(42% 52% at 20% 28%, #6e7a5e 0%, transparent 70%),
          radial-gradient(46% 56% at 76% 22%, #8a7565 0%, transparent 70%),
          radial-gradient(52% 62% at 62% 82%, #46464c 0%, transparent 72%),
          radial-gradient(36% 46% at 28% 78%, #5d6e6a 0%, transparent 70%),
          #57544e;
      }
      .sow .panel-scrim {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          115deg,
          rgba(0, 0, 0, 0.55) 0%,
          rgba(0, 0, 0, 0.16) 40%,
          transparent 62%
        );
      }
      .sow .panel-grain {
        position: absolute;
        inset: 0;
        opacity: 0.05;
        pointer-events: none;
        mix-blend-mode: overlay;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      }
      /* ════════ cover hero — full-bleed, lower-left content stack ════════ */
      /* The creator-chosen 'cover' hero: same full-viewport panel, but the
         frosted band is replaced by a left-anchored title/desc/actions stack
         over a bottom-weighted scrim (mirrors the public landing's cover). */
      /* ── cover hero content — ported 1:1 from the public landing's cover
         hero (.gpp .hero-* in "Course Page Empty State.html"); only the scope
         changes (.gpp → .sow .panel.cover) and the horizontal inset uses the
         portal's --gut so it lines up with the brand/top controls. ── */
      .sow .panel.cover .panel-scrim {
        background:
          linear-gradient(
            to top,
            rgba(0, 0, 0, 0.86) 0%,
            rgba(0, 0, 0, 0.45) 34%,
            transparent 70%
          ),
          linear-gradient(105deg, rgba(0, 0, 0, 0.5) 0%, transparent 56%);
      }
      .sow .panel.cover .hero-content {
        position: relative;
        z-index: 4;
        margin: 0 var(--gut) 52px;
        max-width: 760px;
        color: #fff;
      }
      .sow .panel.cover .hero-meta {
        display: flex;
        align-items: center;
        gap: 13px;
        margin-bottom: 18px;
      }
      .sow .panel.cover .badge {
        display: inline-flex;
        align-items: center;
        background: rgba(255, 255, 255, 0.92);
        color: #1d1d1f;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        padding: 7px 14px;
        border-radius: 980px;
      }
      .sow .panel.cover .badge.done {
        background: #6ddb8a;
        color: #08110b;
      }
      .sow .panel.cover .meta-line {
        display: flex;
        align-items: center;
        gap: 9px;
        font-size: 15px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.78);
      }
      .sow .panel.cover .meta-line .sep {
        opacity: 0.55;
      }
      .sow .panel.cover .hero-title {
        margin: 0;
        font-size: clamp(46px, 5.6vw, 84px);
        font-weight: 700;
        line-height: 1.02;
        letter-spacing: -0.025em;
        text-wrap: balance;
        /* A long lesson title clamps to two lines so the lower-left stack stays
           the landing's compact height and never overflows the hero. */
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
      }
      .sow .panel.cover .hero-desc {
        margin: 18px 0 0;
        max-width: 580px;
        font-size: 16px;
        font-weight: 500;
        line-height: 1.55;
        color: rgba(255, 255, 255, 0.88);
        /* calm, like the landing — two lines max for any lesson description */
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .sow .panel.cover .hero-actions {
        display: flex;
        align-items: center;
        gap: 13px;
        margin-top: 26px;
        flex-wrap: wrap;
      }
      /* Cover-hero CTAs adopt the landing cover-hero's pill style (btn-trailer /
         btn-enroll) instead of the marquee's square abtn — same playback
         actions, just the landing's shape/size. Always light-on-image (the
         cover sits over a photo), so colours are fixed, not theme vars. */
      .sow .panel.cover .hero-actions .abtn {
        height: auto;
        border-radius: 980px;
        box-shadow: none;
      }
      .sow .panel.cover .hero-actions .abtn.play {
        gap: 11px;
        padding: 12px 24px 12px 12px;
        background: #fff;
        color: #111;
      }
      .sow .panel.cover .hero-actions .abtn.play .play {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #111;
        color: #fff;
        display: grid;
        place-items: center;
        flex: none;
      }
      .sow .panel.cover .hero-actions .abtn.glass {
        padding: 15px 26px;
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
        -webkit-backdrop-filter: blur(40px) saturate(150%);
        backdrop-filter: blur(40px) saturate(150%);
      }
      .sow .panel.cover .hero-actions .abtn.glass:hover {
        background: rgba(255, 255, 255, 0.24);
      }
      .sow .panel.cover .hero-actions .icon-row {
        margin-top: 0;
      }
      .sow .panel.cover .hero-actions .icon-glass {
        width: 52px;
        height: 52px;
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
        box-shadow: none;
        -webkit-backdrop-filter: blur(40px) saturate(150%);
        backdrop-filter: blur(40px) saturate(150%);
      }
      .sow .panel.cover .hero-actions .icon-glass:hover {
        background: rgba(255, 255, 255, 0.24);
      }
      /* progress retained — the marquee band shows it too */
      .sow .cv-progress {
        margin-top: 26px;
        max-width: 420px;
      }
      .sow .cv-pt {
        display: flex;
        justify-content: space-between;
        font-size: 12.5px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.72);
        margin-bottom: 7px;
      }
      .sow .cv-pbar {
        height: 4px;
        border-radius: 980px;
        background: rgba(255, 255, 255, 0.22);
        overflow: hidden;
      }
      .sow .cv-pbar i {
        display: block;
        height: 100%;
        border-radius: 980px;
        /* Community blue with a slight light sweep toward the tip. */
        background: linear-gradient(90deg, #0066cc 0%, #2997ff 100%);
        transition: width 0.5s ease;
      }
      /* "Reset progress" — a quiet text affordance under the bar. Colors
         per surface: white-ish over the hero still, band ink on the band. */
      .sow .prog-reset {
        margin-top: 10px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: -0.005em;
        background: none;
        border: 0;
        padding: 0;
        cursor: pointer;
        transition:
          color 0.15s,
          opacity 0.15s;
      }
      .sow .prog-reset:disabled {
        opacity: 0.5;
        cursor: default;
      }
      .sow .cv-progress .prog-reset {
        color: rgba(255, 255, 255, 0.55);
      }
      .sow .cv-progress .prog-reset:hover {
        color: rgba(255, 255, 255, 0.9);
      }
      .sow .bc-progress .prog-reset {
        color: var(--bt3);
      }
      .sow .bc-progress .prog-reset:hover {
        color: var(--bt);
      }

      .sow .panel-brand {
        position: absolute;
        left: var(--gut);
        top: 32px;
        z-index: 6;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.82);
        text-shadow: 0 1px 12px rgba(0, 0, 0, 0.4);
      }
      .sow .panel-brand .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #e0482e;
      }
      .sow .top-controls {
        position: absolute;
        top: 26px;
        right: var(--gut);
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .sow .member-chip {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        height: 40px;
        padding: 0 16px;
        border-radius: 980px;
        background: rgba(20, 20, 24, 0.4);
        color: #fff;
        -webkit-backdrop-filter: blur(14px) saturate(150%);
        backdrop-filter: blur(14px) saturate(150%);
        font-size: 13px;
        font-weight: 600;
      }
      .sow .panel-title {
        position: relative;
        z-index: 4;
        margin: 0 var(--gut);
      }
      .sow .pt-kicker {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: rgba(255, 255, 255, 0.85);
        margin-bottom: 12px;
        text-shadow: 0 2px 18px rgba(0, 0, 0, 0.5);
      }
      .sow .pt-kicker.done {
        color: #6ddb8a;
      }
      .sow .pt-h {
        font-family: var(--po);
        font-size: clamp(38px, 4.4vw, 66px);
        font-weight: 700;
        letter-spacing: -0.03em;
        line-height: 1;
        max-width: 16ch;
        color: #fff;
        text-shadow: 0 4px 50px rgba(0, 0, 0, 0.4);
      }

      /* frosted control band */
      .sow .band {
        position: relative;
        z-index: 5;
        display: grid;
        grid-template-columns: 300px minmax(0, 1fr) 270px;
        gap: 44px;
        align-items: start;
        margin-top: 26px;
        padding: 34px var(--gut) 36px;
        -webkit-backdrop-filter: blur(32px) saturate(140%);
        backdrop-filter: blur(32px) saturate(140%);
        background: linear-gradient(
          0deg,
          rgba(var(--band), 0.97) 30%,
          rgba(var(--band), 0.82) 58%,
          rgba(var(--band), 0.45) 82%,
          rgba(var(--band), 0) 100%
        );
        -webkit-mask-image: linear-gradient(0deg, #000 86%, transparent 100%);
        mask-image: linear-gradient(0deg, #000 86%, transparent 100%);
        color: var(--bt);
        transition: color 0.4s ease;
      }
      .sow .band-actions {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .sow .abtn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        height: 46px;
        border-radius: 12px;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -0.01em;
        transition:
          transform 0.16s cubic-bezier(0.2, 1.2, 0.3, 1),
          background 0.16s,
          box-shadow 0.16s,
          color 0.4s ease;
      }
      .sow .abtn:active {
        transform: scale(0.975);
      }
      .sow .abtn.play {
        background: var(--bt);
        color: var(--bg);
        box-shadow: 0 8px 26px rgba(0, 0, 0, 0.18);
      }
      .sow .abtn.play:hover {
        transform: translateY(-1px);
      }
      .sow .abtn.glass {
        background: rgba(var(--band), 0.55);
        color: var(--bt);
        -webkit-backdrop-filter: blur(20px) saturate(160%);
        backdrop-filter: blur(20px) saturate(160%);
        box-shadow: inset 0 0 0 1px var(--bt3);
      }
      .sow .abtn.glass:hover {
        transform: translateY(-1px);
      }
      .sow.dark .abtn.glass {
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
        box-shadow: none;
      }
      .sow.dark .abtn.glass:hover {
        background: rgba(255, 255, 255, 0.24);
      }
      .sow .icon-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        margin-top: 2px;
      }
      .sow .icon-glass {
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
      .sow .icon-glass:hover {
        transform: scale(1.06);
      }
      .sow .icon-glass:active {
        transform: scale(0.94);
      }
      .sow.dark .icon-glass {
        background: rgba(255, 255, 255, 0.14);
        box-shadow: none;
        color: #fff;
      }
      .sow.dark .icon-glass:hover {
        background: rgba(255, 255, 255, 0.24);
      }
      .sow .icon-glass.on {
        background: var(--bt);
        color: var(--bg);
        box-shadow: none;
      }
      .sow.dark .icon-glass.on {
        background: #f5f5f7;
        color: #141416;
      }
      .sow .icon-badge {
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
      .sow .band-desc {
        padding-top: 2px;
      }
      .sow .bd-text {
        font-size: 16px;
        line-height: 1.5;
        font-weight: 400;
        color: var(--bt);
        max-width: 62ch;
        /* Keep the lesson blurb calm — clamp long descriptions so the band
           stays the landing's proportion (the hero is glanceable, not a wall
           of text). */
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .sow .bd-meta {
        font-size: 13.5px;
        font-weight: 500;
        color: var(--bt2);
        margin-top: 12px;
      }
      .sow .band-cast {
        padding-top: 2px;
      }
      .sow .bc-row {
        display: flex;
        align-items: center;
        gap: 13px;
      }
      .sow .bc-av {
        width: 46px;
        height: 46px;
        border-radius: 50%;
        object-fit: cover;
        box-shadow: 0 0 0 1px var(--hair);
        background: rgba(125, 125, 135, 0.2);
      }
      .sow .bc-k {
        font-size: 12px;
        font-weight: 600;
        color: var(--bt3);
        margin-bottom: 2px;
      }
      .sow .bc-v {
        font-size: 17px;
        font-weight: 600;
        letter-spacing: -0.02em;
        color: var(--bt);
      }
      .sow .bc-sub {
        font-size: 13.5px;
        line-height: 1.45;
        color: var(--bt2);
        margin-top: 10px;
        /* Instructor line stays a calm short byline — even a page-long bio
           shows as two tidy lines here (matches the landing's AI byline). */
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .sow .bc-progress {
        margin-top: 14px;
      }
      .sow .bc-pt {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        font-weight: 600;
        color: var(--bt2);
        margin-bottom: 6px;
      }
      .sow .bc-pbar {
        height: 4px;
        border-radius: 980px;
        background: rgba(125, 125, 135, 0.22);
        overflow: hidden;
      }
      .sow .bc-pbar i {
        display: block;
        height: 100%;
        border-radius: 980px;
        /* Community blue with a slight light sweep toward the tip. */
        background: linear-gradient(90deg, #0066cc 0%, #2997ff 100%);
        transition: width 0.5s ease;
      }

      /* ════════ lesson rail — catalog cards ════════ */
      .sow .lessons {
        padding: 48px var(--gut) 96px;
      }
      .sow .row-head {
        display: flex;
        align-items: baseline;
        gap: 13px;
        margin-bottom: 18px;
      }
      .sow .row-head .rh {
        font-size: 19px;
        font-weight: 700;
        letter-spacing: -0.015em;
        color: var(--text);
        transition: color 0.4s ease;
      }
      .sow .row-head .rh-meta {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-2);
        transition: color 0.4s ease;
      }
      .sow .strip-wrap {
        position: relative;
      }
      .sow .grid {
        display: flex;
        gap: 20px;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        scroll-snap-type: x mandatory;
        scroll-behavior: smooth;
        padding: 4px 2px 16px;
        scrollbar-width: none;
      }
      .sow .grid::-webkit-scrollbar {
        display: none;
      }
      .sow .grid .lc-catalog {
        flex: 0 0 calc((100% - 60px) / 4);
        /* min-width:0 keeps the card at its flex-basis — long titles/content
           wrap inside instead of stretching the card wider. */
        min-width: 0;
        scroll-snap-align: start;
      }
      .sow .arrow {
        position: absolute;
        top: 0;
        bottom: 16px;
        z-index: 5;
        width: 52px;
        color: rgba(0, 0, 0, 0.5);
        display: grid;
        place-items: center;
        opacity: 0;
        pointer-events: none;
        transition:
          opacity 0.2s,
          color 0.15s;
      }
      .sow .arrow:hover {
        color: #000;
      }
      .sow.dark .arrow {
        color: rgba(255, 255, 255, 0.55);
      }
      .sow.dark .arrow:hover {
        color: #fff;
      }
      .sow .arrow.prev {
        left: -52px;
      }
      .sow .arrow.next {
        right: -52px;
      }
      .sow .arrow.show {
        opacity: 1;
        pointer-events: auto;
      }
      .sow .lc-catalog {
        cursor: pointer;
        letter-spacing: -0.014em;
      }
      .sow .lc-card {
        width: 100%;
        height: 100%;
        border-radius: 16px;
        overflow: hidden;
        background: var(--card-bg);
        border: 1px solid var(--card-bd);
        display: flex;
        flex-direction: column;
        box-shadow:
          0 1px 2px rgba(0, 0, 0, 0.04),
          0 4px 16px rgba(0, 0, 0, 0.05);
        transition:
          transform 0.26s cubic-bezier(0.34, 1.3, 0.64, 1),
          box-shadow 0.26s,
          background 0.4s ease;
      }
      .sow .lc-catalog:hover .lc-card {
        transform: translateY(-5px);
        box-shadow:
          0 16px 48px rgba(0, 0, 0, 0.14),
          0 2px 8px rgba(0, 0, 0, 0.06);
      }
      .sow .lc-thumb {
        position: relative;
        flex: 0 0 auto;
        aspect-ratio: 380 / 214;
        background: #111;
        overflow: hidden;
      }
      .sow .lc-thumb.ph {
        background: none;
      }
      .sow .lc-thumb .img {
        position: absolute;
        inset: 0;
        background-size: cover;
        background-position: center;
      }
      /* Liquid-glass placeholder — the landing's exact treatment, so an
         unfilled tile looks the same here as on the public page. */
      .sow .lc-thumb .ph-ambient {
        position: absolute;
        inset: -15%;
        background:
          radial-gradient(42% 52% at 20% 28%, #6e7a5e 0%, transparent 70%),
          radial-gradient(46% 56% at 76% 22%, #8a7565 0%, transparent 70%),
          radial-gradient(52% 62% at 62% 82%, #46464c 0%, transparent 72%),
          radial-gradient(36% 46% at 28% 78%, #5d6e6a 0%, transparent 70%),
          #57544e;
        filter: blur(40px);
      }
      .sow .lc-thumb .glass-tint {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.18);
        -webkit-backdrop-filter: blur(60px) saturate(140%);
        backdrop-filter: blur(60px) saturate(140%);
      }
      .sow .lc-play {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.25);
        display: grid;
        place-items: center;
        opacity: 0;
        transition: opacity 0.2s ease;
        z-index: 2;
      }
      .sow .lc-catalog:hover .lc-play {
        opacity: 1;
      }
      .sow .lc-play-btn {
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.95);
        color: #07080a;
        display: grid;
        place-items: center;
        padding-left: 3px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      }
      .sow .lc-state {
        position: absolute;
        left: 12px;
        top: 12px;
        z-index: 2;
      }
      .sow .lc-lock {
        width: 25px;
        height: 25px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        color: rgba(255, 255, 255, 0.92);
        background: rgba(0, 0, 0, 0.42);
        -webkit-backdrop-filter: blur(8px);
        backdrop-filter: blur(8px);
      }
      .sow .lc-dur {
        position: absolute;
        right: 12px;
        top: 12px;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.92);
        font-variant-numeric: tabular-nums;
        background: rgba(0, 0, 0, 0.42);
        -webkit-backdrop-filter: blur(8px);
        backdrop-filter: blur(8px);
        padding: 4px 9px 4px 7px;
        border-radius: 980px;
      }
      /* Netflix-style partial-progress bar pinned to the thumb's bottom. */
      .sow .lc-progbar {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 3.5px;
        background: rgba(255, 255, 255, 0.28);
        z-index: 3;
      }
      .sow .lc-progbar i {
        display: block;
        height: 100%;
        border-radius: 0 980px 980px 0;
        /* Community blue with a slight light sweep toward the tip. */
        background: linear-gradient(90deg, #0066cc 0%, #2997ff 100%);
        transition: width 0.4s ease;
      }
      .sow .lc-ovbtn {
        position: absolute;
        right: 10px;
        bottom: 10px;
        z-index: 4;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.42);
        color: rgba(255, 255, 255, 0.92);
        -webkit-backdrop-filter: blur(8px);
        backdrop-filter: blur(8px);
        display: grid;
        place-items: center;
        opacity: 0;
        transition:
          opacity 0.2s,
          background 0.15s;
      }
      .sow .lc-catalog:hover .lc-ovbtn {
        opacity: 1;
      }
      .sow .lc-ovbtn:hover {
        background: rgba(0, 0, 0, 0.66);
      }
      /* Info block — the landing catalog card's exact metrics, so the same
         card reads identically on the public page and in the portal. */
      .sow .lc-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 18px 20px 20px;
      }
      .sow .lc-num {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--text-2);
        margin-bottom: 6px;
      }
      .sow .lc-title {
        font-size: 18px;
        font-weight: 600;
        letter-spacing: -0.02em;
        line-height: 1.2;
        color: var(--text);
        margin-bottom: 7px;
        /* Long titles wrap to a second line and clamp — never widen the card. */
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
        transition: color 0.4s ease;
      }
      .sow .lc-desc {
        font-size: 14px;
        color: var(--text-2);
        line-height: 1.45;
        text-wrap: pretty;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        min-height: 41px;
      }
      .sow .lc-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: auto;
        padding-top: 12px;
        font-size: 13px;
        font-weight: 500;
        color: var(--text-2);
        font-variant-numeric: tabular-nums;
      }

      /* ── spotlight lesson card — ported 1:1 from the public landing's
         .gpp .card (Apple TV-style episode card): 30px rail gap with a
         400px card floor, 24px radius, liquid-glass placeholder, and the
         frosted blur band fading up from the bottom of the still. ── */
      .sow .grid.spot-rail {
        gap: 30px;
      }
      .sow .grid .lc-spot {
        flex: 0 0 max(calc((100% - 90px) / 4), 400px);
        min-width: 0;
        scroll-snap-align: start;
      }
      .sow .lc-spot {
        cursor: pointer;
        letter-spacing: -0.014em;
      }
      .sow .spot-card {
        position: relative;
        width: 100%;
        aspect-ratio: 465 / 320;
        border-radius: 24px;
        overflow: hidden;
        background: #111;
        box-shadow: 0 20px 18px rgba(0, 0, 0, 0.04);
        transition:
          transform 0.26s cubic-bezier(0.34, 1.3, 0.64, 1),
          box-shadow 0.26s;
      }
      .sow .lc-spot:hover .spot-card {
        transform: translateY(-5px);
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.22);
      }
      /* liquid glass while awaiting a still (landing's placeholder) */
      .sow .spot-card .ph-ambient {
        display: none;
        position: absolute;
        inset: -15%;
        background:
          radial-gradient(42% 52% at 20% 28%, #6e7a5e 0%, transparent 70%),
          radial-gradient(46% 56% at 76% 22%, #8a7565 0%, transparent 70%),
          radial-gradient(52% 62% at 62% 82%, #46464c 0%, transparent 72%),
          radial-gradient(36% 46% at 28% 78%, #5d6e6a 0%, transparent 70%),
          #57544e;
        filter: blur(40px);
      }
      .sow .spot-card .glass-tint {
        display: none;
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.18);
        -webkit-backdrop-filter: blur(60px) saturate(140%);
        backdrop-filter: blur(60px) saturate(140%);
      }
      .sow .spot-card.ph .ph-ambient,
      .sow .spot-card.ph .glass-tint {
        display: block;
      }
      .sow .spot-card .img {
        position: absolute;
        inset: 0;
        background-size: cover;
        background-position: center;
      }
      .sow .spot-card.ph .img {
        display: none;
      }
      .sow .spot-shade {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          to top,
          rgba(0, 0, 0, 0.85) 0%,
          rgba(0, 0, 0, 0.4) 40%,
          rgba(0, 0, 0, 0.1) 100%
        );
        /* Frosted blur fading up from the bottom so the episode title/meta
           read cleanly over the still — the Apple-TV spotlight look. Masked
           so only the lower portion blurs and the artwork stays crisp. */
        -webkit-backdrop-filter: blur(16px);
        backdrop-filter: blur(16px);
        -webkit-mask-image: linear-gradient(
          to top,
          #000 0%,
          #000 24%,
          transparent 54%
        );
        mask-image: linear-gradient(to top, #000 0%, #000 24%, transparent 54%);
      }
      .sow .spot-info {
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        z-index: 10;
        padding: 0 20px 16px;
      }
      .sow .spot-info .lc-num {
        font-size: 11px;
        letter-spacing: 0.07em;
        color: rgba(235, 235, 245, 0.66);
        margin-bottom: 0;
      }
      .sow .spot-title {
        font-size: 18px;
        font-weight: 600;
        letter-spacing: -0.015em;
        line-height: 1.2;
        color: #fff;
        margin-top: 5px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
      }
      .sow .spot-desc {
        font-size: 14px;
        line-height: 1.45;
        color: rgba(235, 235, 245, 0.72);
        margin-top: 4px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        min-height: 40px;
      }
      .sow .spot-info .lc-meta {
        font-size: 13px;
        color: rgba(235, 235, 245, 0.75);
        margin-top: 8px;
        padding-top: 0;
      }

      /* now-playing equaliser bars */
      .sow .nowbars {
        display: inline-flex;
        align-items: flex-end;
        gap: 2.5px;
        height: 13px;
      }
      .sow .nowbars i {
        width: 3px;
        border-radius: 2px;
        background: currentColor;
        animation: sow-eq 1s ease-in-out infinite;
      }
      .sow .nowbars i:nth-child(1) {
        height: 50%;
        animation-delay: -0.3s;
      }
      .sow .nowbars i:nth-child(2) {
        height: 100%;
      }
      .sow .nowbars i:nth-child(3) {
        height: 65%;
        animation-delay: -0.6s;
      }
      @keyframes sow-eq {
        0%,
        100% {
          transform: scaleY(0.5);
        }
        50% {
          transform: scaleY(1);
        }
      }

      /* toast */
      .sow .toast {
        position: fixed;
        left: 50%;
        bottom: 36px;
        transform: translateX(-50%);
        z-index: 600;
        display: inline-flex;
        align-items: center;
        gap: 9px;
        height: 44px;
        padding: 0 20px;
        border-radius: 980px;
        background: rgba(15, 15, 18, 0.78);
        color: #fff;
        -webkit-backdrop-filter: blur(20px) saturate(150%);
        backdrop-filter: blur(20px) saturate(150%);
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
        animation: sow-toastIn 0.4s cubic-bezier(0.2, 1.2, 0.3, 1);
      }
      @keyframes sow-toastIn {
        from {
          transform: translate(-50%, 16px);
          opacity: 0;
        }
      }
      .sow .toast .tk {
        display: grid;
        place-items: center;
        color: #6ddb8a;
      }

      @media (max-width: 1200px) {
        .sow {
          --gut: 44px;
        }
        .sow .band {
          grid-template-columns: 300px minmax(0, 1fr);
          gap: 36px;
        }
        .sow .band-cast {
          display: none;
        }
        .sow .grid .lc-catalog {
          flex-basis: calc((100% - 40px) / 3);
        }
      }
      @media (max-width: 820px) {
        .sow {
          --gut: 22px;
        }
        .sow .band {
          grid-template-columns: 1fr;
          gap: 18px;
          padding-bottom: 26px;
        }
        .sow .band-desc {
          display: none;
        }
        .sow .grid .lc-catalog {
          flex-basis: calc((100% - 20px) / 2);
        }
      }
      @media (max-width: 560px) {
        .sow .grid .lc-catalog {
          flex-basis: 82%;
        }
      }

      /* ════════ mobile course home (≤720) — the landing's cinematic
         treatment. The desktop cover/marquee hero blocks and the horizontal
         rails hide; a tall variant-independent hero (.m-hero over the course
         cover .m-hero-art) and a full-width stack of the SAME landing-style
         lesson cards (.m-cards) take over. Markup for all of it is always
         rendered by WatchHome — visibility is purely these media rules. */
      .sow .m-hero {
        display: none;
      }
      .sow .m-hero-art {
        display: none;
      }
      @media (max-width: 720px) {
        .sow .panel {
          height: auto;
          min-height: min(88svh, 780px);
        }
        .sow .panel .hero-content,
        .sow .panel-title,
        .sow .band {
          display: none;
        }
        /* Variant-independent bottom scrim so the stacked hero content reads
           over the still on BOTH hero variants (the marquee otherwise has a
           side scrim only). Same specificity as the cover rule, later in
           source, so it wins inside this query. */
        .sow .panel .panel-scrim,
        .sow .panel.cover .panel-scrim {
          background: linear-gradient(
            to top,
            rgba(0, 0, 0, 0.9) 0%,
            rgba(0, 0, 0, 0.5) 36%,
            rgba(0, 0, 0, 0.12) 68%,
            transparent 100%
          );
        }

        /* Full-bleed COURSE cover behind the mobile hero — the landing's
           poster, not the focused lesson's still. Painted after the lesson
           layers in the DOM, so it covers them; its own bottom scrim keeps
           the centered stack readable. */
        .sow .m-hero-art {
          display: block;
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center;
        }
        .sow .m-hero-art::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(
            to top,
            rgba(0, 0, 0, 0.92) 0%,
            rgba(0, 0, 0, 0.5) 34%,
            rgba(0, 0, 0, 0.1) 66%,
            transparent 100%
          );
        }
        /* Centered bottom stack — title in the creator's Title Style, meta
           line, white Play pill + round overview button, then progress. */
        .sow .m-hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          position: relative;
          z-index: 4;
          margin: 0 var(--gut);
          padding-bottom: 26px;
          color: #fff;
        }
        .sow .m-hero .pt-kicker {
          justify-content: center;
        }
        .sow .m-hero-title {
          margin: 6px 0 0;
          font-family: var(--po);
          font-size: clamp(34px, 10.5vw, 48px);
          font-weight: 700;
          line-height: 1.02;
          letter-spacing: -0.025em;
          text-wrap: balance;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
          overflow-wrap: anywhere;
          text-shadow: 0 2px 28px rgba(0, 0, 0, 0.5);
        }
        .sow .m-hero-meta {
          margin-top: 10px;
          font-size: 14px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.85);
          text-shadow: 0 1px 14px rgba(0, 0, 0, 0.45);
        }
        .sow .m-hero-actions {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          margin-top: 18px;
          width: 100%;
        }
        /* Always light-on-image (the hero sits over a photo on both
           variants), so colours are fixed like the cover hero's, not
           theme vars. */
        .sow .m-hero-cta {
          display: flex;
          gap: 10px;
          width: 100%;
        }
        .sow .m-hero-cta .abtn.play {
          flex: 1;
          height: 52px;
          border-radius: 980px;
          background: #fff;
          color: #111;
          font-size: 16px;
        }
        .sow .m-hero-ov {
          flex: none;
          width: 52px;
          height: 52px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: rgba(255, 255, 255, 0.16);
          color: #fff;
          -webkit-backdrop-filter: blur(30px) saturate(150%);
          backdrop-filter: blur(30px) saturate(150%);
        }
        .sow .m-hero-next {
          font-size: 12.5px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.72);
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-shadow: 0 1px 12px rgba(0, 0, 0, 0.45);
        }
        .sow .m-hero-row {
          display: flex;
          justify-content: center;
          gap: 10px;
          margin-top: 2px;
        }
        .sow .m-hero-row .icon-glass {
          flex: none;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.14);
          color: #fff;
          box-shadow: none;
        }
        .sow .m-hero-row .icon-glass.on {
          background: #fff;
          color: #111;
        }
        /* Progress is part of the mobile hero on both variants — never
           hidden by a breakpoint again. */
        .sow .m-hero .cv-progress {
          margin-top: 18px;
          max-width: none;
          width: 100%;
        }

        /* ── lesson rails on phones — the SAME swipeable strips the landing
           uses. Scroll-snap does the paging; only the hover arrows hide.
           One card fills most of the view so the swipe reads card-by-card. ── */
        .sow .lessons {
          padding: 26px var(--gut) 80px;
        }
        .sow .arrow {
          display: none;
        }
        .sow .grid .lc-catalog,
        .sow .grid .lc-spot {
          flex: 0 0 84%;
          min-width: 0;
          scroll-snap-align: start;
        }
        .sow .row-head .rh {
          font-size: 17px;
        }
        .sow .row-head .rh-meta {
          font-size: 12.5px;
        }
      }
    `}</style>
  )
}

export default WatchPageStyles
