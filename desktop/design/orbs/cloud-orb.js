// <cloud-orb> — circular fragment-shader disc of slow-moving, domain-warped fBm clouds.
// Vertical ramp: near-white at the top → saturated brand hue at the bottom. Soft, watercolour edges.
// All instances share ONE WebGL context and blit into per-element 2D canvases, so a page can
// hold any number of orbs without exhausting the browser's context limit.
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

  // flowing liquid: stacked layers of domain-warped noise advected in different directions,
  // then the colour field is sampled through that flow so it pours and folds inside the disc
  vec2 q = uv;
  if (uShape == 1) q.x *= uAspect / (uAspect * 0.55 + 0.45);
  vec2 f1 = vec2(fbm(q * 1.3 + vec2( t * 0.9,  t * 0.35)),
                 fbm(q * 1.3 + vec2(-t * 0.6,  t * 0.8) + 3.1));
  vec2 f2 = vec2(fbm((q + f1 * 0.9) * 1.9 + vec2(-t * 0.5, -t * 0.7) + 7.3),
                 fbm((q + f1 * 0.9) * 1.9 + vec2( t * 0.75, -t * 0.4) + 11.9));
  vec2 p = q + f1 * 0.55 + f2 * 0.45;
  // a slow swirl on top so the whole body turns over, like water in a glass
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

  // bright currents where the flow field is high, dark eddies where it's low
  float cur = fbm(p * 2.6 + vec2(t * 1.1, -t * 0.7));
  col = mix(col, col + vec3(1.0) * 0.34, smoothstep(0.05, 0.42, cur) * 0.28);
  col = mix(col, col * 0.86, smoothstep(-0.05, -0.4, cur) * 0.5);

  // soft inner falloff at the rim, watercolour rather than a hard edge
  col = mix(col, col * 0.88, smoothstep(0.55, 1.0, r) * 0.6);

  // film grain
  float g = hash(gl_FragCoord.xy) - 0.5;
  col += g * uGrain;

  // signed distance to the chosen outline, in disc units
  vec2 q2 = vec2(uv.x * uAspect, uv.y);
  float sd;
  if (uShape == 1) {                           // pill (horizontal capsule)
    vec2 a = vec2(-(uAspect - 1.0), 0.0), b = vec2(uAspect - 1.0, 0.0);
    vec2 pa = q2 - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    sd = length(pa - ba * h) - 1.0;
  } else if (uShape == 2) {                    // squircle
    vec2 v = abs(q2);
    sd = pow(pow(v.x, 4.0) + pow(v.y, 4.0), 0.25) - 1.0;
  } else if (uShape == 3) {                    // rounded square
    vec2 v = abs(q2) - vec2(0.62);
    sd = length(max(v, 0.0)) + min(max(v.x, v.y), 0.0) - 0.38;
  } else if (uShape == 4) {                    // blob: circle with a slow-breathing wobble
    float ang = atan(uv.y, uv.x);
    float wob = 0.075 * sin(ang * 3.0 + t * 1.6) + 0.045 * sin(ang * 5.0 - t * 1.1);
    sd = r - (0.9 + wob);
  } else if (uShape == 5) {                    // hexagon, flat top and bottom, rounded corners
    vec2 v = abs(q2.yx);
    const vec3 kk = vec3(-0.866025404, 0.5, 0.577350269);
    v -= 2.0 * min(dot(kk.xy, v), 0.0) * kk.xy;
    v -= vec2(clamp(v.x, -kk.z * 0.86, kk.z * 0.86), 0.86);
    sd = length(v) * sign(v.y) - 0.1;
  } else {                                     // disc
    sd = r - 1.0;
  }
  float mask = smoothstep(0.0, -0.045, sd);
  fragColor = vec4(clamp(col, 0.0, 1.0) * mask, mask);
}`;

  function hexToRgb(hex){
    const h = (hex || '').trim().replace('#','');
    const s = h.length === 3 ? h.split('').map(c=>c+c).join('') : h;
    const n = parseInt(s || 'ffffff', 16);
    return [((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255];
  }

  // ---- shared renderer -------------------------------------------------
  const R = {
    gl: null, prog: null, u: null, canvas: null, size: 0,
    instances: new Set(), t0: performance.now(), raf: null, timer: null, ok: false
  };

  function boot(){
    if (R.gl || R.failed) return R.ok;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 512;
    const gl = cv.getContext('webgl2', { alpha:true, antialias:true, premultipliedAlpha:true, preserveDrawingBuffer:true });
    if (!gl){ R.failed = true; return false; }
    const sh = (type, s) => { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error('[cloud-orb]', gl.getShaderInfoLog(o)); return o; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.error('[cloud-orb]', gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = {};
    for (const n of ['uTime','uCount','uSeed','uGrain','uShape','uAspect']) u[n] = gl.getUniformLocation(prog, n);
    u.uCols = gl.getUniformLocation(prog, 'uCols[0]');
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); R.gl = null; R.ok = false; }, false);
    Object.assign(R, { gl, prog, u, canvas: cv, size: 512, ok: true });
    return true;
  }

  function fit(px){
    if (px <= R.size) return;
    R.size = Math.min(1024, Math.max(px, R.size * 2));
    R.canvas.width = R.canvas.height = R.size;
  }

  function paint(el, tSec){
    const gl = R.gl; if (!gl) return;
    el._aspect = Math.max(1, (el.clientWidth || 1) / (el.clientHeight || 1));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(el.clientWidth * dpr));
    const h = Math.max(1, Math.round(el.clientHeight * dpr));
    if (!w || !h) return;
    fit(Math.max(w, h));
    gl.viewport(0, R.size - h, w, h);
    gl.useProgram(R.prog);
    gl.uniform1f(R.u.uTime, tSec);
    gl.uniform1f(R.u.uSeed, el._seed);
    gl.uniform1f(R.u.uGrain, el._grain);
    gl.uniform1i(R.u.uShape, el._shape);
    gl.uniform1f(R.u.uAspect, el._aspect);
    gl.uniform1i(R.u.uCount, el._count);
    gl.uniform3fv(R.u.uCols, el._cols);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, R.size - h, w, h);
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
    const c = el._canvas;
    if (c.width !== w || c.height !== h){ c.width = w; c.height = h; }
    const ctx = el._ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(R.canvas, 0, 0, w, h, 0, 0, w, h);
  }

  function frame(){
    const t = (performance.now() - R.t0) / 1000;
    if (R.ok || boot()) for (const el of R.instances) { if (el.isConnected) paint(el, t); }
  }

  function loop(){
    frame();
    R.raf = requestAnimationFrame(loop);
  }

  function start(){
    if (R.raf == null) R.raf = requestAnimationFrame(loop);
    // animation frames are paused while the document is hidden — keep a slow timer going
    if (R.timer == null) R.timer = setInterval(() => { if (document.visibilityState === 'hidden') frame(); }, 66);
  }

  class CloudOrb extends HTMLElement {
    static get observedAttributes(){ return ['colors','grain','seed','shape']; }

    connectedCallback(){
      if (!this._built){
        this._built = true;
        this.style.display = 'block';
        const root = this.attachShadow({ mode:'open' });
        root.innerHTML = '<style>:host{display:block;width:100%;height:100%;overflow:hidden}canvas{display:block;width:100%;height:100%}</style><canvas></canvas>';
        this._canvas = root.querySelector('canvas');
        this._ctx = this._canvas.getContext('2d');
        this._readAttrs();
      }
      R.instances.add(this);
      start();
      if (boot()) requestAnimationFrame(() => paint(this, (performance.now() - R.t0) / 1000));
      else { const c = (this.getAttribute('colors') || '#9fd86a,#6fb8e8').split(','); this.style.background = `radial-gradient(circle at 35% 30%, ${c[0]}, ${c[c.length-1]})`; }
    }

    disconnectedCallback(){ R.instances.delete(this); }

    attributeChangedCallback(){ if (this._built) this._readAttrs(); }

    _readAttrs(){
      const raw = (this.getAttribute('colors') || '#9fd86a,#6fb8e8,#f0a35c,#b9a6e8,#ffffff')
        .split(',').map(s => s.trim()).filter(Boolean).slice(0, 6);
      this._count = raw.length;
      this._cols = new Float32Array(18);
      raw.forEach((hex, i) => { const c = hexToRgb(hex); this._cols[i*3] = c[0]; this._cols[i*3+1] = c[1]; this._cols[i*3+2] = c[2]; });
      this._grain = parseFloat(this.getAttribute('grain') || '0.075');
      this._seed = parseFloat(this.getAttribute('seed') || '0');
      const SH = { disc:0, pill:1, squircle:2, square:3, blob:4, hex:5 };
      this._shape = SH[(this.getAttribute('shape') || 'disc').toLowerCase()] ?? 0;
      this._aspect = Math.max(1, (this.clientWidth || 1) / (this.clientHeight || 1));
    }
  }

  if (!customElements.get('cloud-orb')) customElements.define('cloud-orb', CloudOrb);
})();
