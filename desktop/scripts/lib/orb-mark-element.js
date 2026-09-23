// <cloud-orb> for the agents' marks — the founder's liquid shader (design/orbs/cloud-orb.js,
// "Orb Shapes", 23 September 2026) made to live inside the pinned renderer's mark SVG.
//
// This file is not bundled: package time copies it to dist/renderer/assets/cloud-orb.js and
// index.html loads it as a classic script before the renderer module (the page's CSP is
// script-src 'self', so it cannot be inline). scripts/lib/orb-mark-patch.mjs is what puts the
// element into the SVG, and docs/product/orb-marks-measured.md is the record.
//
// What differs from the design page:
//   * shape "none": the shader paints the whole quad and the mark's own SVG clipPath cuts the
//     outline, so every shape the animator can draw or morph to is the orb's outline too.
//   * the orb reads its host mark (the closest span.sand-grok-bot-mark): the agent colour from
//     the inline --fg the renderer already writes, a per-agent seed from --orb-seed, and the
//     state from data-grok-state, which sets how fast the liquid moves.
//   * sizing comes from the on-screen rectangle, not clientWidth: inside a <foreignObject> the
//     layout box is 259 user units however small the mark is drawn.
//   * marks that are off screen, hidden or under 10 px (the hidden engine container) are skipped,
//     and marks under 48 px repaint every other frame.
(function () {
  const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FRAG = `#version 300 es
precision highp float;
uniform float uTime;
uniform vec3 uCols[6];
uniform int uCount;
uniform float uSeed;
uniform float uGrain;
uniform int uShape;
uniform float uAspect;
in vec2 vUv;
out vec4 fragColor;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453123); }

vec2 hash2(vec2 p){
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))) + uSeed;
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float gnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(dot(hash2(i + vec2(0,0)), f - vec2(0,0)),
                 dot(hash2(i + vec2(1,0)), f - vec2(1,0)), u.x),
             mix(dot(hash2(i + vec2(0,1)), f - vec2(0,1)),
                 dot(hash2(i + vec2(1,1)), f - vec2(1,1)), u.x), u.y);
}

float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++){ v += a * gnoise(p); p = rot * p * 2.03; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = vUv * 2.0 - 1.0;
  float r = length(uv);
  float t = uTime * 0.22;

  vec2 q = uv;
  if (uShape == 1) q.x *= uAspect / (uAspect * 0.55 + 0.45);
  vec2 f1 = vec2(fbm(q * 1.3 + vec2( t * 0.9,  t * 0.35)),
                 fbm(q * 1.3 + vec2(-t * 0.6,  t * 0.8) + 3.1));
  vec2 f2 = vec2(fbm((q + f1 * 0.9) * 1.9 + vec2(-t * 0.5, -t * 0.7) + 7.3),
                 fbm((q + f1 * 0.9) * 1.9 + vec2( t * 0.75, -t * 0.4) + 11.9));
  vec2 p = q + f1 * 0.55 + f2 * 0.45;
  float sw = 0.35 * sin(t * 0.6) * (1.0 - r * r);
  p = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * p;

  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 6; i++){
    if (i >= uCount) break;
    float fi = float(i);
    float ang = fi * 2.3999632 + uSeed * 0.7 + t * (0.35 + 0.12 * mod(fi, 3.0)) * (mod(fi, 2.0) < 0.5 ? 1.0 : -1.0);
    float rad = 0.46 + 0.3 * sin(t * 0.9 + fi * 1.31);
    vec2 c = vec2(cos(ang), sin(ang)) * rad;
    float d = length(p - c);
    float k = 0.5 + 0.12 * sin(t * 1.3 + fi);
    float wi = exp(-(d * d) / (k * k)) + 0.01;
    sum += uCols[i] * wi;
    wsum += wi;
  }
  vec3 col = sum / wsum;

  float cur = fbm(p * 2.6 + vec2(t * 1.1, -t * 0.7));
  col = mix(col, col + vec3(1.0) * 0.34, smoothstep(0.05, 0.42, cur) * 0.28);
  col = mix(col, col * 0.86, smoothstep(-0.05, -0.4, cur) * 0.5);
  col = mix(col, col * 0.88, smoothstep(0.55, 1.0, r) * 0.6);

  float g = hash(gl_FragCoord.xy) - 0.5;
  col += g * uGrain;

  vec2 q2 = vec2(uv.x * uAspect, uv.y);
  float sd;
  if (uShape == 1) {
    vec2 a = vec2(-(uAspect - 1.0), 0.0), b = vec2(uAspect - 1.0, 0.0);
    vec2 pa = q2 - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    sd = length(pa - ba * h) - 1.0;
  } else if (uShape == 2) {
    vec2 v = abs(q2);
    sd = pow(pow(v.x, 4.0) + pow(v.y, 4.0), 0.25) - 1.0;
  } else if (uShape == 3) {
    vec2 v = abs(q2) - vec2(0.62);
    sd = length(max(v, 0.0)) + min(max(v.x, v.y), 0.0) - 0.38;
  } else if (uShape == 4) {
    float ang = atan(uv.y, uv.x);
    float wob = 0.075 * sin(ang * 3.0 + t * 1.6) + 0.045 * sin(ang * 5.0 - t * 1.1);
    sd = r - (0.9 + wob);
  } else if (uShape == 5) {
    vec2 v = abs(q2.yx);
    const vec3 kk = vec3(-0.866025404, 0.5, 0.577350269);
    v -= 2.0 * min(dot(kk.xy, v), 0.0) * kk.xy;
    v -= vec2(clamp(v.x, -kk.z * 0.86, kk.z * 0.86), 0.86);
    sd = length(v) * sign(v.y) - 0.1;
  } else if (uShape == 6) {
    sd = -1.0;                                // none: the host clips the outline
  } else {
    sd = r - 1.0;
  }
  float mask = uShape == 6 ? 1.0 : smoothstep(0.0, -0.045, sd);
  fragColor = vec4(clamp(col, 0.0, 1.0) * mask, mask);
}`;

  // The founder's six palettes, keyed by the renderer's colour ids. The renderer writes
  // --fg as light-dark(<light>, <dark>) from its own table (snt), so the light hex names the id.
  const PALETTES = {
    blue:    ["#dbe9f5", "#6f9fe0", "#2f5aa8", "#f2a97e"],
    green:   ["#eaf3c6", "#8cc26f", "#3f8a5e", "#f0c94a"],
    orange:  ["#ffe3c2", "#f39a68", "#c94f35", "#f6d08a"],
    violet:  ["#ecdff8", "#ad8fe3", "#6b4bb5", "#f28fc0"],
    cyan:    ["#d8f2ec", "#6fc9c0", "#2b8a92", "#a7e0b8"],
    gray:    ["#e0e6ee", "#8ea1ba", "#3e5673", "#b3c2d3"],
  };
  const PALETTE_SEEDS = { blue: 3, green: 11, orange: 19, violet: 27, cyan: 43, gray: 99 };
  const COLOR_IDS_BY_LIGHT_HEX = {
    "#000000": "gray", "#a27952": "orange", "#ff3e51": "orange", "#ff781c": "orange",
    "#ffaf38": "orange", "#00c972": "green", "#1cc3b0": "cyan", "#2a92fe": "blue",
    "#a97efe": "violet", "#ff5eb1": "violet", "#959595": "gray",
  };
  // How the liquid moves per mark state: a thinking or working agent stirs, a sleeping one
  // barely moves. Unlisted states run at 1.
  const STATE_SPEED = {
    sleeping: 0.25, "powering-down": 0.25, drowsy: 0.5, bored: 0.6, idle: 1, waking: 1.3,
    listening: 1.4, dictating: 1.4, thinking: 2, searching: 2.2, working: 2.2, writing: 2,
    loading: 2, sending: 1.8, receiving: 1.8, uploading: 2, excited: 2.6, celebrate: 2.6,
    laughing: 2.2, surprised: 2, alerting: 2.4, notifying: 1.8, spawning: 2, humming: 1.2,
  };

  function hexToRgb(hex) {
    const h = (hex || "").trim().replace("#", "");
    const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const n = parseInt(s || "ffffff", 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function mixHex(hex, towards, amount) {
    const a = hexToRgb(hex), b = hexToRgb(towards);
    return "#" + a.map((v, i) => Math.round((v + (b[i] - v) * amount) * 255).toString(16).padStart(2, "0")).join("");
  }

  // The palette for a --fg value. A known light hex is one of the eleven ids; anything else
  // (an ink's flat colour, a hex the founder types) gets tints and shades of itself.
  function paletteForFg(fg) {
    const hexes = (fg || "").toLowerCase().match(/#[0-9a-f]{3,6}/g) || [];
    const light = hexes[0] || "#2a92fe";
    const id = COLOR_IDS_BY_LIGHT_HEX[light];
    if (id) return { id, colors: PALETTES[id], seed: PALETTE_SEEDS[id] };
    return { id: light, colors: [mixHex(light, "#ffffff", 0.8), mixHex(light, "#ffffff", 0.3), mixHex(light, "#000000", 0.35), mixHex(light, "#ffd28a", 0.5)], seed: 7 };
  }

  const R = { gl: null, prog: null, u: null, canvas: null, size: 0, instances: new Set(), t0: performance.now(), last: performance.now(), raf: null, ok: false, failed: false };
  const reducedMotion = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

  function boot() {
    if (R.gl || R.failed) return R.ok;
    const cv = document.createElement("canvas");
    cv.width = cv.height = 512;
    const gl = cv.getContext("webgl2", { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (!gl) { R.failed = true; return false; }
    const sh = (type, s) => { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error("[cloud-orb]", gl.getShaderInfoLog(o)); return o; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error("[cloud-orb]", gl.getProgramInfoLog(prog)); R.failed = true; return false; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = {};
    for (const n of ["uTime", "uCount", "uSeed", "uGrain", "uShape", "uAspect"]) u[n] = gl.getUniformLocation(prog, n);
    u.uCols = gl.getUniformLocation(prog, "uCols[0]");
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    cv.addEventListener("webglcontextlost", (e) => { e.preventDefault(); R.gl = null; R.ok = false; }, false);
    Object.assign(R, { gl, prog, u, canvas: cv, size: 512, ok: true });
    return true;
  }

  function fit(px) {
    if (px <= R.size) return;
    R.size = Math.min(1024, Math.max(px, R.size * 2));
    R.canvas.width = R.canvas.height = R.size;
  }

  function readHost(el) {
    const host = el._host && el._host.isConnected ? el._host : (el._host = el.closest(".sand-grok-bot-mark"));
    if (!host) return;
    const fg = host.style.getPropertyValue("--fg");
    if (fg !== el._fg && !el._fixedColors) {
      el._fg = fg;
      const palette = paletteForFg(fg);
      el._paletteId = palette.id;
      el._setColors(palette.colors);
      if (!el.hasAttribute("seed")) el._seedBase = palette.seed;
    }
    const seed = host.style.getPropertyValue("--orb-seed");
    if (seed !== el._seedAttr) { el._seedAttr = seed; el._seedOffset = parseFloat(seed) || 0; }
    const state = host.getAttribute("data-grok-state") || "idle";
    if (state !== el._state) { el._state = state; el._speed = STATE_SPEED[state] ?? 1; }
  }

  function paint(el, dt) {
    const gl = R.gl; if (!gl) return;
    readHost(el);
    const rect = el.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;   // the hidden engine container is 8 px
    // Sidebar-size marks repaint every other frame: at 36 px nobody sees 60 Hz liquid.
    if (rect.width < 48 && (el._skip = !el._skip)) return;
    if (rect.bottom < 0 || rect.right < 0 || rect.top > innerHeight || rect.left > innerWidth) return;
    if (el.checkVisibility && !el.checkVisibility()) return;
    const still = reducedMotion?.matches;
    if (!still) el._t += dt * (el._speed ?? 1);
    else if (el._painted) return;
    el._aspect = Math.max(1, rect.width / rect.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    fit(Math.max(w, h));
    gl.viewport(0, R.size - h, w, h);
    gl.useProgram(R.prog);
    gl.uniform1f(R.u.uTime, el._t);
    gl.uniform1f(R.u.uSeed, (el._seedBase ?? 0) + (el._seedOffset ?? 0));
    gl.uniform1f(R.u.uGrain, el._grain);
    gl.uniform1i(R.u.uShape, el._shape);
    gl.uniform1f(R.u.uAspect, el._aspect);
    gl.uniform1i(R.u.uCount, el._count);
    gl.uniform3fv(R.u.uCols, el._cols);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, R.size - h, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
    const c = el._canvas;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    el._ctx.clearRect(0, 0, w, h);
    el._ctx.drawImage(R.canvas, 0, 0, w, h, 0, 0, w, h);
    el._painted = true;
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - R.last) / 1000);
    R.last = now;
    if (R.ok || boot()) for (const el of R.instances) { if (el.isConnected) paint(el, dt); }
    R.raf = R.instances.size > 0 ? requestAnimationFrame(frame) : null;
  }

  function start() {
    if (R.raf == null) { R.last = performance.now(); R.raf = requestAnimationFrame(frame); }
  }

  const SHAPES = { disc: 0, pill: 1, squircle: 2, square: 3, blob: 4, hex: 5, none: 6 };

  class CloudOrb extends HTMLElement {
    static get observedAttributes() { return ["colors", "grain", "seed", "shape"]; }

    connectedCallback() {
      if (!this._built) {
        this._built = true;
        this._t = 0;
        this.style.display = "block";
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = "<style>:host{display:block;width:100%;height:100%;overflow:hidden;pointer-events:none}canvas{display:block;width:100%;height:100%}</style><canvas></canvas>";
        this._canvas = root.querySelector("canvas");
        this._ctx = this._canvas.getContext("2d");
        this._readAttrs();
      }
      R.instances.add(this);
      if (boot()) start();
      else {
        const c = (this.getAttribute("colors") || "").split(",").filter(Boolean);
        const fg = this.closest(".sand-grok-bot-mark")?.style.getPropertyValue("--fg");
        const palette = c.length > 0 ? c : paletteForFg(fg).colors;
        this.style.background = `radial-gradient(circle at 35% 30%, ${palette[0]}, ${palette[palette.length - 1]})`;
      }
    }

    disconnectedCallback() { R.instances.delete(this); }

    attributeChangedCallback() { if (this._built) this._readAttrs(); }

    _setColors(list) {
      const raw = list.slice(0, 6);
      this._count = raw.length;
      this._cols = new Float32Array(18);
      raw.forEach((hex, i) => { const c = hexToRgb(hex); this._cols[i * 3] = c[0]; this._cols[i * 3 + 1] = c[1]; this._cols[i * 3 + 2] = c[2]; });
    }

    _readAttrs() {
      const colors = (this.getAttribute("colors") || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (colors.length > 0) { this._setColors(colors); this._fg = undefined; this._fixedColors = true; }
      else if (!this._cols) this._setColors(PALETTES.blue);
      this._grain = parseFloat(this.getAttribute("grain") || "0.075");
      if (this.hasAttribute("seed")) this._seedBase = parseFloat(this.getAttribute("seed")) || 0;
      this._shape = SHAPES[(this.getAttribute("shape") || "disc").toLowerCase()] ?? 0;
    }
  }

  if (!customElements.get("cloud-orb")) customElements.define("cloud-orb", CloudOrb);
})();
