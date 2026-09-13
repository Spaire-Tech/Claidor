// <cloud-orb> — circular fragment-shader disc of slow-moving, domain-warped fBm clouds.
// Vertical ramp: near-white at the top → saturated brand hue at the bottom. Soft, watercolour edges.
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
  float t = uTime * 0.085;

  // gentle domain warp so the colour blobs drift and fold rather than slide
  vec2 w = vec2(fbm(uv * 1.4 + vec2(0.0, t)), fbm(uv * 1.4 + vec2(4.7, 1.9) - vec2(t, 0.0)));
  w += 0.14 * vec2(sin(t * 2.3 + uv.y * 2.1), cos(t * 1.9 + uv.x * 2.4));
  vec2 p = uv + w * 0.42;

  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 6; i++){
    if (i >= uCount) break;
    float fi = float(i);
    float ang = fi * 2.3999632 + uSeed * 0.7 + t * (0.6 + 0.18 * mod(fi, 3.0)) * (mod(fi, 2.0) < 0.5 ? 1.0 : -1.0);
    float rad = 0.42 + 0.3 * sin(t * 1.7 + fi * 1.31);
    vec2 c = vec2(cos(ang), sin(ang)) * rad;
    float d = length(p - c);
    float k = 0.62 + 0.16 * sin(t * 2.1 + fi);
    float wi = exp(-(d * d) / (k * k));
    sum += uCols[i] * wi;
    wsum += wi;
  }
  vec3 col = sum / max(wsum, 0.0001);

  // let the lightest colour pool where the warp field is high — keeps it airy, not muddy
  float lift = smoothstep(-0.2, 0.35, fbm(p * 1.9 + vec2(t * 0.6, -t * 0.4)));
  col = mix(col, col + vec3(1.0) * 0.32, lift * 0.22);

  // soft inner falloff at the rim, watercolour rather than a hard edge
  col = mix(col, col * 0.88, smoothstep(0.55, 1.0, r) * 0.6);

  // film grain
  float g = hash(gl_FragCoord.xy) - 0.5;
  col += g * uGrain;

  float mask = smoothstep(1.0, 0.955, r);
  fragColor = vec4(clamp(col, 0.0, 1.0) * mask, mask);
}`;

  function hexToRgb(hex){
    const h = (hex || '').trim().replace('#','');
    const s = h.length === 3 ? h.split('').map(c=>c+c).join('') : h;
    const n = parseInt(s || 'ffffff', 16);
    return [((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255];
  }

  class CloudOrb extends HTMLElement {
    static get observedAttributes(){ return ['colors','grain','seed']; }

    connectedCallback(){
      if (this._built) return;
      this._built = true;
      this.style.display = 'block';
      this.style.width = '100%';
      this.style.height = '100%';
      const root = this.attachShadow({ mode:'open' });
      root.innerHTML = '<style>:host{display:block;border-radius:50%;overflow:hidden}canvas{display:block;width:100%;height:100%}</style><canvas></canvas>';
      this._canvas = root.querySelector('canvas');
      this._init();
    }

    disconnectedCallback(){
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = null;
      if (this._ro) { this._ro.disconnect(); this._ro = null; }
    }

    attributeChangedCallback(){ this._readAttrs(); }

    _readAttrs(){
      const raw = (this.getAttribute('colors') || '#9fd86a,#6fb8e8,#f0a35c,#b9a6e8,#ffffff')
        .split(',').map(s => s.trim()).filter(Boolean).slice(0, 6);
      this._count = raw.length;
      this._cols = new Float32Array(18);
      raw.forEach((hex, i) => { const c = hexToRgb(hex); this._cols[i*3] = c[0]; this._cols[i*3+1] = c[1]; this._cols[i*3+2] = c[2]; });
      this._grain = parseFloat(this.getAttribute('grain') || '0.075');
      this._seed = parseFloat(this.getAttribute('seed') || '0');
    }

    _init(){
      this._readAttrs();
      const gl = this._canvas.getContext('webgl2', { alpha:true, antialias:true, premultipliedAlpha:true, preserveDrawingBuffer:true });
      if (!gl){ const c = (this.getAttribute('colors') || '#9fd86a,#6fb8e8').split(','); this.style.background = `radial-gradient(circle at 35% 30%, ${c[0]}, ${c[c.length-1]})`; return; }
      this._gl = gl;

      const sh = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error('[cloud-orb]', gl.getShaderInfoLog(s));
        return s;
      };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.error('[cloud-orb]', gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      this._prog = prog;

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      this._u = {};
      for (const n of ['uTime','uCount','uSeed','uGrain']) this._u[n] = gl.getUniformLocation(prog, n);
      this._u.uCols = gl.getUniformLocation(prog, 'uCols[0]');

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      this._resize();
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this);

      const t0 = performance.now();
      const tick = now => {
        const gl = this._gl, u = this._u;
        if (!this.clientWidth || !this.clientHeight || !this.isConnected) {
          this._raf = requestAnimationFrame(tick);
          return;
        }
        this._resize();
        gl.useProgram(this._prog);
        gl.uniform1f(u.uTime, (now - t0) / 1000);
        gl.uniform1f(u.uSeed, this._seed);
        gl.uniform1f(u.uGrain, this._grain);
        gl.uniform1i(u.uCount, this._count);
        gl.uniform3fv(u.uCols, this._cols);
        gl.clearColor(0,0,0,0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    }

    _resize(){
      const gl = this._gl;
      if (!gl) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(this.clientWidth * dpr));
      const h = Math.max(1, Math.round(this.clientHeight * dpr));
      if (this._canvas.width !== w || this._canvas.height !== h){ this._canvas.width = w; this._canvas.height = h; }
      gl.viewport(0, 0, w, h);
    }
  }

  if (!customElements.get('cloud-orb')) customElements.define('cloud-orb', CloudOrb);
})();
