// The editor's static shell markup — a faithful copy of the creator's design
// body. React injects this once into the container; the engine then drives it
// imperatively (palette into #palette, canvas into #email, inspector into
// #inspBody, etc.). Kept as a string so the markup stays byte-identical to the
// design rather than being re-expressed (and subtly drifting) in JSX.

export const SHELL_HTML = `
<header class="topbar" data-screen-label="Editor Header">
  <button class="tb-back" type="button">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"></path></svg>
    Back
  </button>
  <span class="tb-divide"></span>
  <button class="tb-crumb" id="crumbBtn" type="button">
    <span class="tb-course">Course</span>
    <svg class="tb-sep" width="7" height="11" viewBox="0 0 6 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l4 4-4 4"></path></svg>
    <span class="tb-name" id="crumbName">Enrolment</span>
    <svg class="tb-caret" width="11" height="7" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l4 4 4-4"></path></svg>
  </button>
  <span class="tb-status" id="saveStatus"><span class="saved-dot"></span>Saved</span>
  <div class="tb-actions">
    <div class="btn-split">
      <button class="bs-main" id="sendBtn" type="button">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
        Save
      </button>
      <button class="bs-caret" id="sendCaret" type="button" aria-label="More options">
        <svg width="11" height="7" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l4 4 4-4"></path></svg>
      </button>
    </div>
  </div>
</header>

<div class="shell">
  <aside class="side" data-screen-label="Block Palette">
    <div id="palette"></div>
    <div class="pal-group" style="margin-top:22px">
      <div class="pal-label">Personalize</div>
      <div class="merge-wrap" id="mergeWrap"></div>
      <div class="merge-hint">Click a tag while editing text to insert it. We swap in each subscriber's details at send.</div>
    </div>
  </aside>

  <div class="canvas-col">
    <div class="canvas-head" data-screen-label="Canvas Toolbar">
      <div class="seg" id="deviceSeg">
        <button type="button" data-d="desktop" class="on">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"></rect><path d="M8 21h8M12 17v4"></path></svg>
          Desktop
        </button>
        <button type="button" data-d="mobile">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"></rect><path d="M11 18h2"></path></svg>
          Mobile
        </button>
      </div>
      <div class="ch-spacer"></div>
      <span class="ch-meta" id="audienceMeta"></span>
    </div>

    <main class="canvas" id="canvas" data-screen-label="Email Canvas">
      <div class="stage" id="stage">
        <div class="email" id="email"></div>
      </div>
    </main>
  </div>

  <aside class="inspector" data-screen-label="Inspector">
    <div class="insp-head">
      <div class="ih-main">
        <div class="ih-k" id="ihK">Email</div>
        <div class="ih-t" id="ihT">Settings</div>
      </div>
    </div>
    <div class="insp-body" id="inspBody"></div>
  </aside>
</div>

<div class="toast" id="toast"><span class="tk">
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 6.5"></path></svg>
</span><span id="toastMsg">Saved</span></div>
`
