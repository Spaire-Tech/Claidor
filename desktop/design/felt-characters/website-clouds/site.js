
// ------------------------------------------------------------------ the site: a few clouds around the page
// Each page load puts about six clouds (three on a phone) in open space: beside the hero's headline and in
// the margins and gaps of the sections below it, never over text, buttons, pictures or the app's window.
// Each is a small canvas inside its section, so it scrolls with the page. One WebGL renderer (e_felt.js)
// draws them one after another off screen and each canvas takes a copy, with the effect layers the app
// draws behind and in front of the character around it. Only clouds on screen are drawn, at most 30 times
// a second, nothing while the tab is hidden, and with Reduce Motion each is drawn once, still.
const state = {}; // applySync records the look here
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const PHONE = innerWidth < 600;
const COUNT = PHONE ? 3 : 6;
const BODY = PHONE ? [70, 112] : [84, 180];   // the cloud's own width in CSS px
const PAD = 1.65;                              // its canvas: the approved stage, the cloud at 61% of it, room for the effects
const FPS = 30;
const DEBUG = /[?&]clouds=debug\b/.test(location.search);

// The app's states, as a mix: mostly calm, now and then a reaction or a morph with its effect.
const CALM = ['idle', 'idle', 'idle', 'listening', 'listening', 'thinking', 'working', 'working', 'happy', 'curious', 'searching'];
const REACT = ['excited', 'surprised', 'playful', 'proud', 'laughing', 'shy', 'celebrate', 'confused', 'bored', 'suspicious', 'drowsy', 'waking'];
const MORPHS = ['orbit', 'radar', 'progress', 'spawning', 'humming', 'loading', 'dictating', 'writing', 'sending', 'receiving', 'uploading', 'notifying', 'alerting', 'dragging', 'bouncing'];
const rnd = (a, b) => a + Math.random() * (b - a);
const any = (a) => a[Math.floor(Math.random() * a.length)];
function nextMood(prev) {
  for (;;) {
    const r = Math.random(), s = r < 0.72 ? any(CALM) : r < 0.88 ? any(REACT) : any(MORPHS);
    if (s !== prev && MARK_STATES.includes(s)) return s;
  }
}

// ---- where the clouds may go
function pageRect(r) { return { l: r.left + scrollX, t: r.top + scrollY, r: r.right + scrollX, b: r.bottom + scrollY }; }
const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const grow = (a, p) => ({ l: a.l - p, t: a.t - p, r: a.r + p, b: a.b + p });
const opaque = (c) => { const m = c.match(/[\d.]+/g); return m && (m.length < 4 || +m[3] > 0.02); };
function obstacles(layers) {
  // everything a cloud must not cover: text, controls, pictures, the app's window and anything drawn as a box,
  // each cut to what its scrolling or clipping boxes let show (a marquee's hidden tiles, a picture's overflow)
  const out = [], W = document.documentElement.clientWidth, clips = new Map();
  const clipOf = (el) => { // the part of the page el's content can show in
    if (!el || el === document.body) return null;
    if (clips.has(el)) return clips.get(el);
    let c = clipOf(el.parentElement);
    const cs = getComputedStyle(el), br = el.getBoundingClientRect();
    if (cs.overflow !== 'visible' && cs.display !== 'contents' && br.width > 0 && br.height > 0) {
      const r = pageRect(br);
      c = c ? { l: Math.max(c.l, r.l), t: Math.max(c.t, r.t), r: Math.min(c.r, r.r), b: Math.min(c.b, r.b) } : r;
    }
    clips.set(el, c);
    return c;
  };
  const add = (r, el) => {
    if (r.width < 0.5 || r.height < 0.5) return;
    let q = pageRect(r); const c = clipOf(el);
    if (c) q = { l: Math.max(q.l, c.l), t: Math.max(q.t, c.t), r: Math.min(q.r, c.r), b: Math.min(q.b, c.b) };
    if (q.r - q.l > 0.5 && q.b - q.t > 0.5) out.push(q);
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (/\S/.test(n.data) && !layers.some((l) => l.contains(n)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const range = document.createRange();
  for (let n; (n = walker.nextNode());) { range.selectNodeContents(n); for (const r of range.getClientRects()) add(r, n.parentElement); }
  const skip = new Set([document.documentElement, document.body, ...document.querySelectorAll('section, #main')]);
  for (const el of document.body.querySelectorAll('*')) {
    if (skip.has(el) || layers.some((l) => l.contains(el)) || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden') continue;
    if (/^(IMG|SVG|VIDEO|IFRAME|CANVAS|PICTURE|BUTTON|A|INPUT|SELECT|TEXTAREA|LABEL)$/i.test(el.tagName) || el.getAttribute('role') === 'button') { add(r, el.parentElement); continue; }
    if (r.width >= W * 0.95) continue; // full-width bands are the page's background, not content
    const box = cs.backgroundImage !== 'none' || cs.boxShadow !== 'none' || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0
      || (opaque(cs.backgroundColor) && cs.backgroundColor !== getComputedStyle(el.parentElement).backgroundColor && String(bgOf(el.parentElement)) !== String(bgOf(el)));
    if (box) add(r, el.parentElement);
  }
  return out;
}
function zones() {
  // each section's box; the hero only above its window (the laptop's scroll scene pins the window
  // and the painting below the headline while the page scrolls)
  const out = [];
  for (const s of document.querySelectorAll('section[data-framer-name]')) {
    const name = s.dataset.framerName;
    const z = pageRect(s.getBoundingClientRect());
    if (name === 'FAQ') { // its answers open and close, moving what is below the first question
      const q = s.querySelector('.sd-faq');
      if (!q) continue;
      z.b = pageRect(q.getBoundingClientRect()).t;
    }
    if (name === 'Hero') {
      const h1 = s.querySelector('h1'), group = h1 && (h1.closest('[data-framer-name="Title Group"]') || h1.parentElement);
      const below = group && group.nextElementSibling;
      if (below) z.b = pageRect(below.getBoundingClientRect()).t;
      z.t = Math.max(z.t, 64); // under the nav bar
    }
    if (z.b - z.t > 60) out.push({ el: s, name, ...z });
  }
  return out;
}
function place(clouds, layers) {
  // A phone has little open space: there only the cloud's own box (and 14 px) must be clear, and a
  // passing effect may cross a margin. On a larger screen nearly all of its canvas must be.
  const W = document.documentElement.clientWidth, obs = obstacles(layers).map((o) => grow(o, 10));
  const Z = zones(), hero = Z.filter((z) => z.name === 'Hero'), rest = Z.filter((z) => z.name !== 'Hero');
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  const order = [...hero, ...rest], taken = [], placed = [];
  let zi = 0;
  for (const c of clouds) {
    let spot = null;
    for (let tried = 0; tried < order.length && !spot; tried++) {
      const z = order[zi++ % order.length], near = obs.filter((o) => o.b > z.t - 400 && o.t < z.b + 400);
      for (let body = rnd(BODY[0], BODY[1]); body >= BODY[0] - 0.5 && !spot; body *= 0.86) {
        const clear = PHONE ? 4 : body * 0.23; // beyond the 10 px every obstacle already has
        const size = Math.round(body * PAD), inset = (size - body) / 2 - clear;
        const x0 = 4, x1 = W - size - 4, y0 = z.t - inset, y1 = z.b - size + inset;
        if (x1 <= x0 || y1 <= y0) continue;
        for (let k = 0; k < 400; k++) {
          const x = rnd(x0, x1), y = rnd(y0, y1);
          // the room it needs: the cloud itself and a margin (on a phone), or most of its canvas, effects and all
          const box = { l: x + inset, t: y + inset, r: x + size - inset, b: y + size - inset };
          if (near.some((o) => hit(o, box)) || taken.some((o) => hit(o, box))) continue;
          spot = { z, x: Math.round(x), y: Math.round(y), size, body: Math.round(body), inset };
          taken.push(grow(box, 36));
          break;
        }
      }
    }
    if (spot) placed.push([c, spot]);
  }
  return placed;
}

// ---- the clouds
const clouds = [];
const palettes = Object.keys(PAL);
for (let i = palettes.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [palettes[i], palettes[j]] = [palettes[j], palettes[i]]; }
for (let i = 0; i < COUNT; i++) {
  const sim = new MarkSim(Math.floor(Math.random() * 1e9) + 1);
  // with Reduce Motion each cloud is one still, as the forms page's thumbnails are: a calm state, 1.2 s in
  const mood = REDUCED ? any(['idle', 'idle', 'listening', 'curious']) : nextMood(null);
  sim.setState(mood); sim.advance(REDUCED ? 1.2 : rnd(0.6, 2.4));
  clouds.push({ i, color: palettes[i % palettes.length], sim, mood, time: 0, until: rnd(3, 6.5),
    anim: { gaze: { yaw: 0, pitch: 0 }, target: { yaw: 0, pitch: 0 }, hopT: -9 },
    drift: [rnd(0, 2 * PI), rnd(0, 2 * PI), rnd(0.55, 0.8), rnd(0.35, 0.55)], visible: false, drawn: false, host: null });
}

const style = document.createElement('style');
style.textContent = `.sd-cloud{position:absolute;z-index:1;pointer-events:none;contain:layout paint size}
.sd-cloud canvas{position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity .6s ease}
.sd-cloud.on canvas{opacity:1}
.sd-cloud i{position:absolute;left:21%;right:21%;top:24%;bottom:26%;border-radius:50%;pointer-events:auto;cursor:pointer;-webkit-tap-highlight-color:transparent}`;
document.head.append(style);

function bgOf(el) { // the colour behind the cloud, for the body's fade
  for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (opaque(c)) { const m = c.match(/[\d.]+/g); return [m[0] / 255, m[1] / 255, m[2] / 255]; } }
  return [0.965, 0.965, 0.953];
}
const io = new IntersectionObserver((entries) => {
  for (const e of entries) { const c = e.target.__cloud; if (c) c.visible = e.isIntersecting; }
  wake();
}, { rootMargin: '80px 0px' });

let maxSize = 0;
function layout() {
  for (const c of clouds) if (c.host) { io.unobserve(c.host); c.host.remove(); c.host = null; c.visible = false; }
  const placed = place(clouds, []);
  maxSize = 0;
  for (const [c, s] of placed) {
    const host = document.createElement('div'); host.className = 'sd-cloud'; host.setAttribute('aria-hidden', 'true');
    const sr = s.z.el.getBoundingClientRect();
    host.style.cssText = `left:${s.x - (sr.left + scrollX)}px;top:${s.y - (sr.top + scrollY)}px;width:${s.size}px;height:${s.size}px`;
    const cv = document.createElement('canvas'), px = Math.round(s.size * KNOBS.pixelRatio);
    cv.width = cv.height = px;
    const tap = document.createElement('i');
    tap.addEventListener('pointerdown', () => { if (!REDUCED) c.anim.hopT = c.time; });
    host.append(cv, tap);
    s.z.el.append(host);
    Object.assign(c, { host, canvas: cv, ctx: cv.getContext('2d'), size: s.size, px, spot: s, drawn: false, bg: bgOf(s.z.el) });
    host.__cloud = c; io.observe(host);
    maxSize = Math.max(maxSize, s.size);
  }
  if (maxSize) renderer.setSize(maxSize, maxSize, false);
  wake();
}

// ---- drawing
let pointer = null;
addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
document.documentElement.addEventListener('pointerleave', () => { pointer = null; });
function aim(c) { // the approved page's pointer handler, per cloud
  if (!pointer) { c.anim.target.yaw = 0; c.anim.target.pitch = 0; c.sim.pointer = null; return; }
  const r = c.canvas.getBoundingClientRect();
  const fx = r.left + r.width / 2, fy = r.top + r.height * 0.5;
  const dx = (pointer.x - fx) / (r.width * 0.6), dy = (fy - pointer.y) / (r.height * 0.6);
  c.anim.target.yaw = clamp(dx, -1, 1) * 0.5; c.anim.target.pitch = clamp(dy, -1, 1) * 0.36;
  c.sim.pointer = { x: (pointer.x - fx) / r.width, y: (pointer.y - fy) / r.height };
}
function draw(c, dt, still) {
  setColor(c.color);
  MORPH.uBgCol.value.set(...c.bg);
  anim = c.anim;
  const tm = performance.now();
  applyMark(c.sim, c.time, dt, still);
  perf.mark += performance.now() - tm;
  if (!still) { // a gentle drift and bob in place (form units: the cloud is 2.2 tall)
    const [p, q, fx, fy] = c.drift, t = c.time;
    charRoot.position.x = 0.035 * sin(t * fx + p);
    charRoot.position.y += 0.045 * sin(t * fy * 2 + q);
  } else charRoot.position.x = 0;
  const size = c.size;
  renderView(0, maxSize - size, size, size); // the top-left corner of the drawing buffer
  const px = c.px, ctx = c.ctx;
  ctx.clearRect(0, 0, px, px);
  drawLayers(c.sim, px, px, ctx, null);
  ctx.drawImage(canvas, 0, 0, px, px, 0, 0, px, px);
  drawLayers(c.sim, px, px, null, ctx);
  if (!c.drawn) { c.drawn = true; c.host.classList.add('on'); }
}
let raf = 0, last = 0, lastDraw = 0;
function frame(now) {
  raf = 0;
  const live = clouds.filter((c) => c.visible && c.host);
  if (!live.length || document.hidden) return; // the observer or the tab coming back wakes it
  raf = requestAnimationFrame(frame);
  if (now - lastDraw < 1000 / FPS - 3) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now; lastDraw = now;
  for (const c of live) {
    c.time += dt;
    if (c.time > c.until) { c.mood = nextMood(c.mood); c.sim.setState(c.mood); c.until = c.time + rnd(3, 6.5); }
    c.sim.advance(dt);
    aim(c);
    const t = performance.now();
    try { draw(c, dt, false); } catch (e) { console.error(e); }
    perf.ms += performance.now() - t; perf.draws++;
  }
  perf.frames++;
}
const perf = { ms: 0, mark: 0, draws: 0, frames: 0 };
function wake() {
  if (REDUCED) { // one still of each cloud when it first comes into view
    for (const c of clouds) if (c.visible && c.host && !c.drawn) try { draw(c, 0, true); } catch (e) { console.error(e); }
    return;
  }
  if (!raf && !document.hidden) { last = lastDraw = performance.now() - 1000 / FPS; raf = requestAnimationFrame(frame); }
}
document.addEventListener('visibilitychange', wake);

// ---- start: grow the felt once, then place and draw
const t0 = performance.now();
applySync({ form: 'cloud', color: clouds[0].color, eyes: 'bead', eyewear: 'none', head: 'none', neck: 'none', mouth: 'none', mood: 'idle' });
const tBuild = performance.now() - t0;
await document.fonts.ready; // the text in its final place before the clouds look for room
layout();
let lastW = innerWidth, resizeT = 0;
addEventListener('resize', () => {
  if (innerWidth === lastW) return; // a phone's toolbar showing or hiding changes only the height
  lastW = innerWidth; clearTimeout(resizeT); resizeT = setTimeout(layout, 300);
});
if (DEBUG) window.__clouds = {
  zones: () => zones().map((z) => [z.name, Math.round(z.l), Math.round(z.t), Math.round(z.r), Math.round(z.b)]),
  obstacles: () => obstacles(clouds.filter((c) => c.host).map((c) => c.host)).map((o) => [o.l, o.t, o.r, o.b].map(Math.round)),
  report: () => ({ build: Math.round(tBuild), drawMs: +(perf.ms / Math.max(1, perf.draws)).toFixed(2), markMs: +(perf.mark / Math.max(1, perf.draws)).toFixed(2), frames: perf.frames, timings: cur.form && cur.form.timings, maxSize,
    // anything covering a placed cloud now (after the page's own animations have run)
    hits: (() => { const obs = obstacles(clouds.filter((c) => c.host).map((c) => c.host)); return clouds.filter((c) => c.host).map((c) => {
      const s = c.spot, ins = s.inset, box = { l: s.x + ins, t: s.y + ins, r: s.x + s.size - ins, b: s.y + s.size - ins };
      return obs.filter((o) => hit(o, box)).length; }); })(),
    clouds: clouds.map((c) => ({ color: c.color, mood: c.mood, section: c.spot && c.spot.z.name, x: c.spot && c.spot.x, y: c.spot && c.spot.y, size: c.size, body: c.spot && c.spot.body, placed: !!c.host, drawn: c.drawn })) }),
};
