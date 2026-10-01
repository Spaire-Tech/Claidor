// The approved felt cloud's main.js (Simeon Forms), up to its render function. Site changes: the renderer
// draws on a canvas off the page, `anim` is swapped per cloud (site.js), the page's two 2D effect canvases
// are gone (site.js draws the effect layers into each cloud's canvas), and the fly-away halo's LOD cut
// follows the halved coat.

// ------------------------------------------------------------------ extra shaders (built from the approved ones)
const KNIT_FUNCS = KNIT_FS.slice(KNIT_FS.indexOf('// one yarn leg'), KNIT_FS.indexOf('void main(){'));
const KNIT_TAIL = KNIT_FS.slice(KNIT_FS.indexOf('  float stitchVar = k.id;'));
const KNIT2_VS = /* glsl */`
attribute vec2 aKuv; attribute float aRib; attribute float aAO;
varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec2 vKuv; varying float vRib; varying float vAO;
void main(){
  vec4 w = modelMatrix*vec4(position,1.);
  vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); vO = position; vKuv = aKuv; vRib = aRib; vAO = aAO;
  gl_Position = projectionMatrix*viewMatrix*w;
}`;
const KNIT2_FS = /* glsl */`
${GLSL_NOISE}
${GLSL_LIGHT}
uniform vec3 uYarn; uniform vec3 uYarnLight; uniform float uBump;
varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec2 vKuv; varying float vRib; varying float vAO;
${KNIT_FUNCS}
void main(){
  vec2 uv = vKuv;
  float isRib = step(0.5, vRib);
  vec2 kuv = isRib > 0.5 ? uv*vec2(2.1,1.) : uv;
  K k; if (isRib > 0.5) k = rib(kuv); else k = stock(uv);
${KNIT_TAIL}`;

const STUDIO_ENV = EYE_FS.slice(EYE_FS.indexOf('vec3 studioEnv(vec3 R){'), EYE_FS.indexOf('void main(){'));
const GLASS_VS = /* glsl */`
uniform float uInvR;
varying vec3 vW; varying vec3 vN; varying float vLy;
void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); vLy = position.y*uInvR; gl_Position = projectionMatrix*viewMatrix*w; }`;
const GLASS_FS = /* glsl */`
${GLSL_LIGHT}
uniform vec3 uTint; uniform float uAbs; uniform float uGrad; uniform float uRefl;
varying vec3 vW; varying vec3 vN; varying float vLy;
${STUDIO_ENV}
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCamPos - vW); float NoV = max(dot(N,V), 0.);
  float F = 0.04 + 0.96*pow(1.-NoV, 5.);
  vec3 env = studioEnv(reflect(-V, N));
  float ab = clamp(uAbs * mix(1., 1.-uGrad, clamp(0.5 - vLy*0.5, 0., 1.)), 0., 1.);
  vec3 col = uTint*ab*(hemi(N)*0.8 + uKeyCol*0.12) + env*F*uRefl;
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb, clamp(ab + F*0.6, 0., 1.));
}`;

// ------------------------------------------------------------------ 2D outlines
const sdC = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
function sdE2(x, y, rx, ry) { const k0 = Math.hypot(x / rx, y / ry), k1 = Math.hypot(x / (rx * rx), y / (ry * ry)); return k1 < 1e-9 ? -min(rx, ry) : (k0 * (k0 - 1)) / k1; }
function sdRB(x, y, bx, by, r) { const qx = abs(x) - bx + r, qy = abs(y) - by + r; return Math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r; }
function sdPoly(x, y, V) {
  let d = (x - V[0][0]) ** 2 + (y - V[0][1]) ** 2, s = 1;
  for (let i = 0, j = V.length - 1; i < V.length; j = i, i++) {
    const ex = V[j][0] - V[i][0], ey = V[j][1] - V[i][1], wx = x - V[i][0], wy = y - V[i][1];
    const h = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1); const bx = wx - ex * h, by = wy - ey * h;
    d = min(d, bx * bx + by * by);
    const c1 = y >= V[i][1], c2 = y < V[j][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * sqrt(d);
}
// The one form: a plump "flower cloud". A round pillow whose outline has seven soft, slightly uneven lobes
// (one on top, a shallow notch at the bottom), a little wider than tall.
const LOBES = [[0.44, 0.0], [0.42, 0.05], [0.45, -0.03], [0.415, 0.04], [0.44, -0.02], [0.425, 0.03], [0.43, -0.04]]
  .map(([r, j], i) => { const a = PI / 2 + (2 * PI * i) / 7 + j; return [0.59 * cos(a), 0.59 * sin(a), r]; });
const flowerD = (x, y) => { y /= 0.88; let d = sdC(x, y, 0, 0, 0.7); for (const [cx, cy, r] of LOBES) d = smin(d, sdC(x, y, cx, cy, r), 0.12); return d * 0.965; };
const FORMS = {
  cloud: { label: 'Cloud', d: flowerD, eyeY: 0.6, sep: 0.225, neckY: 0.3, topX: 0 },
};

// ------------------------------------------------------------------ SDF helpers for anchors
function march(sdf, o, d, tmax = 9) {
  let t = 0;
  for (let i = 0; i < 400; i++) {
    const x = o[0] + d[0] * t, y = o[1] + d[1] * t, z = o[2] + d[2] * t;
    const h = sdf(x, y, z);
    if (h < 2e-4) return [x, y, z];
    t += max(h * 0.8, 5e-4);
    if (t > tmax) break;
  }
  return null;
}
function gradN(sdf, p) {
  const e = 0.004, [x, y, z] = p;
  return vnorm([sdf(x + e, y, z) - sdf(x - e, y, z), sdf(x, y + e, z) - sdf(x, y - e, z), sdf(x, y, z + e) - sdf(x, y, z - e)]);
}
function projectOut(sdf, p, off) { // move a point onto the surface, then out along the normal
  let q = p.slice();
  for (let i = 0; i < 6; i++) { const d = sdf(...q); const n = gradN(sdf, q); q = vsub(q, vmul(n, d)); }
  return vadd(q, vmul(gradN(sdf, q), off));
}
function hashStr(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

// ------------------------------------------------------------------ renderer / scene
// the site: one renderer, drawing off screen; each cloud's own 2D canvas on the page gets a copy (site.js)
const canvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'default' });
renderer.setClearColor(0x000000, 0); // no backdrop: the character sits on the page
renderer.setPixelRatio(KNOBS.pixelRatio);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = qnum('exposure', 0.94);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 80);
const CAM = { pos: [0, 1.52, 7.2], tgt: [0, 1.17, 0] };

const SH = {
  uCamPos: { value: new THREE.Vector3() },
  uKeyDir: { value: new THREE.Vector3(-0.52, 0.66, 0.54).normalize() },
  uKeyCol: { value: new THREE.Color(1.0, 0.98, 0.95).multiplyScalar(1.3) },
  uFillDir: { value: new THREE.Vector3(0.8, 0.12, 0.58).normalize() },
  uFillCol: { value: new THREE.Color(0.9, 0.94, 1.0).multiplyScalar(0.45) },
  uRimDir: { value: new THREE.Vector3(0.18, 0.5, -0.85).normalize() },
  uRimCol: { value: new THREE.Color(1.0, 1.0, 1.0).multiplyScalar(0.9) },
  uSkyCol: { value: new THREE.Color(0.62, 0.66, 0.72) },
  uGroundCol: { value: new THREE.Color(0.3, 0.33, 0.4) },
  uShadowMap: { value: null },
  uShadowMat: { value: new THREE.Matrix4() },
  uShadowBias: { value: 0.0015 },
};
const shadowRT = new THREE.WebGLRenderTarget(KNOBS.shadowSize, KNOBS.shadowSize, {
  depthTexture: new THREE.DepthTexture(KNOBS.shadowSize, KNOBS.shadowSize), depthBuffer: true,
});
shadowRT.depthTexture.compareFunction = THREE.LessEqualCompare;
shadowRT.depthTexture.minFilter = shadowRT.depthTexture.magFilter = THREE.LinearFilter;
SH.uShadowMap.value = shadowRT.depthTexture;
const shadowCam = new THREE.OrthographicCamera(-2.1, 2.1, 2.1, -2.1, 1, 18);
shadowCam.layers.set(1);
const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });

// studio environment + lights for the accessory materials (enamel, metal, pearl, satin)
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;
const keyLight = new THREE.DirectionalLight(0xfff6ea, 2.4); keyLight.position.copy(SH.uKeyDir.value).multiplyScalar(10); scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xdce8ff, 0.5); fillLight.position.copy(SH.uFillDir.value).multiplyScalar(10); scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xffffff, 1.2); rimLight.position.copy(SH.uRimDir.value).multiplyScalar(10); scene.add(rimLight);

// ------------------------------------------------------------------ materials
const GRAD = { uGradTop: { value: new THREE.Vector3() }, uGradMid: { value: new THREE.Vector3() }, uGradBot: { value: new THREE.Vector3() },
  uGradM: { value: new THREE.Matrix4() }, uGradBox: { value: new THREE.Vector3(-1, 2, 2) } };
function feltMaterial(gradOn = 1) {
  return new THREE.ShaderMaterial({
    vertexShader: FELT_VS, fragmentShader: FELT_FS,
    uniforms: { ...SH, ...GRAD, uGradOn: { value: gradOn }, uPal: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] },
      uFeltFreq: { value: 95 }, uBump: { value: 0.0045 }, uSheen: { value: 0.55 }, uWrap: { value: 0.5 }, uAOAmt: { value: 1 } },
  });
}
const feltMat = feltMaterial();
// the body's felt: the approved felt shader plus the app's morph (cloud -> dot / pencil tip) and fade, sharing the felt's uniforms
const MORPH = { uMorph: { value: 0 }, uMorphC: { value: new THREE.Vector3(0, 1.15, 0) }, uMorphR: { value: 1.1 }, uTear: { value: 0 }, uBodyFade: { value: 1 }, uBgCol: { value: new THREE.Vector3(0.953, 0.957, 0.969) } };
const bodyMat = new THREE.ShaderMaterial({ vertexShader: BODY_VS, fragmentShader: BODY_FS, uniforms: { ...feltMat.uniforms, ...MORPH } });
const pomCoreMat = feltMaterial(0);
const blackFelt = feltMaterial(0); // soft matte black felt for hats
for (const c of blackFelt.uniforms.uPal.value) c.setRGB(0.032, 0.032, 0.036);
blackFelt.uniforms.uSheen.value = 0.9; blackFelt.side = THREE.DoubleSide;
function feltGeo(g) { // the felt shader wants region weights + AO
  const n = g.attributes.position.count;
  if (!g.attributes.aReg) { const r = new Float32Array(n * 4); for (let i = 0; i < n; i++) r[4 * i] = 1; g.setAttribute('aReg', new THREE.BufferAttribute(r, 4)); }
  if (!g.attributes.aAO) g.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(n).fill(0.92), 1));
  return g;
}
const strandUniforms = {
  ...GRAD, ...MORPH, uGradOn: { value: 1 },
  uBones: { value: Array.from({ length: 6 }, () => new THREE.Matrix4()) },
  uPal: { value: Array.from({ length: 8 }, () => new THREE.Color()) },
  uHoles: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, -10)) },
  uViewH: { value: 1000 }, uWidthScale: { value: 1 }, uMinPx: { value: 0.85 }, uLenScale: { value: 1 }, uTime: { value: 0 },
  uTipRatio: { value: 0.3 },
  uSpecShift: { value: new THREE.Vector2(0.12, -0.18) }, uSpecExp: { value: new THREE.Vector2(60, 14) }, uSpecAmt: { value: new THREE.Vector2(0.06, 0.14) },
  uTrans: { value: 1.6 }, uRootOcc: { value: 0.58 }, uOpacity: { value: 1 }, uTipLight: { value: 0.55 }, uHalo: { value: 0.7 },
};
function strandMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: STRAND_VS, fragmentShader: STRAND_FS,
    uniforms: { ...SH, ...strandUniforms },
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
}
const shortMat = strandMaterial(), longMat = strandMaterial();
longMat.uniforms.uOpacity = { value: 1 }; // its own: the fly-away halo thins out while the cloud is a dot
const knitMats = new Map();
function knitMaterial(yarn, light) {
  const k = yarn.join(',');
  if (!knitMats.has(k)) knitMats.set(k, new THREE.ShaderMaterial({
    vertexShader: KNIT2_VS, fragmentShader: KNIT2_FS, side: THREE.DoubleSide,
    uniforms: { ...SH, uYarn: { value: lin(yarn) }, uYarnLight: { value: lin(light) }, uBump: { value: 0.55 } },
  }));
  return knitMats.get(k);
}
function glassMaterial(tint, abs_, grad = 0, refl = 1.4) {
  return new THREE.ShaderMaterial({
    vertexShader: GLASS_VS, fragmentShader: GLASS_FS, side: THREE.DoubleSide,
    uniforms: { ...SH, uTint: { value: lin(tint) }, uAbs: { value: abs_ }, uGrad: { value: grad }, uRefl: { value: refl }, uInvR: { value: 1 } },
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
}
const phys = (o) => new THREE.MeshPhysicalMaterial(o);
// accessories are simple black: soft matte felt (shader, below) or satin with a soft sheen. No gold, gems, colour or hard gloss.
const MAT = {
  enamel: phys({ color: 0x0b0b0e, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide }), // eyes / mouth only
  satin: phys({ color: 0x141418, roughness: 0.5, sheen: 0.7, sheenColor: 0x4c4c58, sheenRoughness: 0.45, side: THREE.DoubleSide }),
  beads: phys({ color: 0x121215, roughness: 0.34, clearcoat: 0.35, clearcoatRoughness: 0.4 }),
  glass: glassMaterial([0.9, 0.95, 1.0], 0.04, 0, 1.6),
  shade: glassMaterial([0.02, 0.02, 0.025], 0.94, 0, 1.2),
};
for (const m of Object.values(MAT)) m.userData.shared = true;

// ------------------------------------------------------------------ rig
const charRoot = new THREE.Group(); scene.add(charRoot);
const bodyBone = new THREE.Group(); charRoot.add(bodyBone);
const pomBone = new THREE.Group(); bodyBone.add(pomBone);
const lidBones = [new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group()]; // placeholders when no lids
for (const b of lidBones) bodyBone.add(b);
const BONE = { body: 0, pom: 1, lidL: 2, lidR: 3, lowL: 4, lowR: 5 };
const REG = { fur: 0, light: 1, dark: 2, brow: 3, yarn: 4, yarnFuzz: 5, fly: 6, tuft: 7 };

// ------------------------------------------------------------------ forms: build (cached)
const formCache = new Map();
function buildForm(id) {
  if (formCache.has(id)) { const f = formCache.get(id); formCache.delete(id); formCache.set(id, f); return f; }
  const F = FORMS[id];
  const tA = performance.now();
  let x0 = 9, x1 = -9, y0 = 9, y1 = -9, inr = 0;
  for (let j = 0; j <= 200; j++) for (let i = 0; i <= 200; i++) {
    const x = -2 + i * 0.02, y = -2 + j * 0.02, d = F.d(x, y);
    if (d < 0) { x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y); inr = max(inr, -d); }
  }
  const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2;
  const S = min(2.2 / w, 2.02 / h) * (F.scale || 1);
  const inW = inr * S;
  const R = F.R ?? min(0.95, inW * 0.9), D = F.D ?? min(0.74, inW * 0.8 + 0.08);
  const base = 0.14, yoff = -y0 * S + base; // floats: no floor, round lobes all the way round
  // the exact 2D distance has creases along its medial axis (a polygon's inner distance is a roof);
  // deep inside the outline use a blurred copy so the pillow is smooth, keep the exact one at the edge
  const GR = 0.014, GN = Math.ceil(4.2 / GR) + 1, G0 = -2.1;
  const grid = new Float32Array(GN * GN), tmpG = new Float32Array(GN * GN);
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) grid[i + GN * j] = F.d(G0 + i * GR, G0 + j * GR);
  {
    const sig = 0.2 / S / GR, rad = Math.ceil(2.5 * sig), ker = [];
    let ks = 0; for (let k = -rad; k <= rad; k++) { const w = Math.exp(-(k * k) / (2 * sig * sig)); ker.push(w); ks += w; }
    for (let k = 0; k < ker.length; k++) ker[k] /= ks;
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) { let a = 0; for (let k = -rad; k <= rad; k++) a += ker[k + rad] * grid[clamp(i + k, 0, GN - 1) + GN * j]; tmpG[i + GN * j] = a; }
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) { let a = 0; for (let k = -rad; k <= rad; k++) a += ker[k + rad] * tmpG[i + GN * clamp(j + k, 0, GN - 1)]; grid[i + GN * j] = a; }
  }
  const blurD = (x, y) => {
    const fx = (x - G0) / GR, fy = (y - G0) / GR;
    if (fx < 0 || fy < 0 || fx >= GN - 1 || fy >= GN - 1) return 1;
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, k = i + GN * j;
    return (grid[k] * (1 - u) + grid[k + 1] * u) * (1 - v) + (grid[k + GN] * (1 - u) + grid[k + GN + 1] * u) * v;
  };
  const d2 = (x, y) => { const e = F.d(x, y); if (e > -0.03) return e; return e + (blurD(x, y) - e) * sstep(0.03, 0.26, -e); };
  const sdf = F.d3
    ? (x, y, z) => F.d3(x / S + cx, (y - yoff) / S, z / S) * S
    : (x, y, z) => {
      const s = -d2(x / S + cx, (y - yoff) / S) * S;
      const qx = max(R - s, 0), dz = D + 0.14 * min(max(s - R, 0), 0.6);
      return sdE2(qx, abs(z), R, dz);
    };
  const Hb = h * S, H = base + Hb, W = w * S;
  const zr = F.d3 ? W / 2 + 0.1 : D + 0.2;
  const mesh = surfaceNets(sdf, [-W / 2 - 0.12, base - 0.1, -zr], [W / 2 + 0.12, H + 0.12, zr], KNOBS.cell);
  // AO from the form (no floor)
  const n = mesh.P.length / 3, ao = new Float32Array(n), reg = new Float32Array(n * 4);
  const scn = sdf;
  for (let i = 0; i < n; i++) {
    const x = mesh.P[3 * i], y = mesh.P[3 * i + 1], z = mesh.P[3 * i + 2], nx = mesh.N[3 * i], ny = mesh.N[3 * i + 1], nz = mesh.N[3 * i + 2];
    let occ = 0, wgt = 1;
    for (const st of [0.03, 0.07, 0.13, 0.22, 0.34]) { occ += wgt * max(0, st - scn(x + nx * (st + 0.004), y + ny * (st + 0.004), z + nz * (st + 0.004))); wgt *= 0.62; }
    ao[i] = clamp(1 - occ * 2.4, 0.08, 1); reg[4 * i] = 1;
  }
  // anchors
  const front = (x, y) => { const p = march(sdf, [x, y, zr + 2], [0, 0, -1]); return p ? { p, n: gradN(sdf, p) } : null; };
  const side = (y, s, z = 0) => { const p = march(sdf, [s * (W + 2), y, z], [-s, 0, 0]); return p ? { p, n: gradN(sdf, p) } : null; };
  const ey = base + F.eyeY * Hb;
  const eyes = [front(-F.sep, ey), front(F.sep, ey)];
  const topP = march(sdf, [F.topX || 0, H + 3, 0], [0, -1, 0]);
  const top = { p: topP, n: gradN(sdf, topP) };
  const tl = side(topP[1] - 0.2, -1), tr = side(topP[1] - 0.2, 1);
  top.halfW = tl && tr ? (tr.p[0] - tl.p[0]) / 2 : 0.4;
  top.cx = tl && tr ? (tr.p[0] + tl.p[0]) / 2 : 0;
  const A = {
    id, F, sdf, H, W, D, eyes, top, eyeY: ey, base,
    mouth: front(0, ey - (F.mouthDy ?? 0.19)),
    neck: front(0, base + F.neckY * Hb),
    sideL: side(ey, -1), sideR: side(ey, 1),
    front, side,
    ring(y, count = 72, a0 = 0, a1 = 2 * PI) { // contour loop at height y, angle 0 = front (+z)
      const pts = [];
      for (let i = 0; i < count; i++) {
        const a = a0 + ((a1 - a0) * i) / (a1 === 2 * PI ? count : count - 1);
        const d = [sin(a), 0, cos(a)];
        const p = march(sdf, [d[0] * 4, y, d[2] * 4], [-d[0], 0, -d[2]]);
        if (p) pts.push({ p, n: gradN(sdf, p), a });
      }
      return pts;
    },
    arcOver(cy, count = 49, span = PI / 2, z = 0) { // loop in the xy plane over the top, from left side to right side
      const pts = [];
      for (let i = 0; i < count; i++) {
        const a = -span + (2 * span * i) / (count - 1);
        const d = [sin(a), cos(a), 0];
        const o = [d[0] * 4, cy + d[1] * 4, z];
        const p = march(sdf, o, [-d[0], -d[1], 0]);
        if (p) pts.push({ p, n: gradN(sdf, p) });
      }
      return pts;
    },
  };
  const tB = performance.now();
  // ---- strands
  const rng = rngOf(hashStr(id));
  const shortSet = new StrandSet(), longSet = new StrandSet();
  const samp = makeSampler(mesh.P, mesh.idx);
  const faceC = [0, ey - 0.15, D + 0.7];
  let made = 0, tries = 0;
  while (made < KNOBS.budget.coat && tries < KNOBS.budget.coat * 2) {
    tries++;
    const s = samp(rng);
    const p = bary(mesh.P, 3, s), nn = vnorm(bary(mesh.N, 3, s)), a = bary(ao, 1, s)[0];
    const wf = woolField(p);
    const len = KNOBS.furLen * (0.6 + rng() * 0.8) * wf[2];
    const lean = min((0.75 + rng() * 0.75) * wf[1], 1.55);
    let flow = vadd(vmul(vnorm(vsub(p, faceC)), 0.7), [0, -0.5, 0]);
    let dir = rotAround(tangentize(vnorm(flow), nn), nn, wf[0] + (rng() - 0.5) * 0.7);
    shortSet.add(p, nn, dir, len, 0.0042, lean, (rng() - 0.35) * 1.6, rng(), REG.fur, a, BONE.body, 0.16 + rng() * 0.12, 1.0 + rng() * 1.8, 0.95);
    made++;
  }
  for (let i = 0, t2 = 0; i < KNOBS.budget.fly && t2 < 40000; t2++) {
    const s = samp(rng);
    const p = bary(mesh.P, 3, s), nn = vnorm(bary(mesh.N, 3, s)), a = bary(ao, 1, s)[0];
    // the approved halo of fine fly-away fibres
    const dir = rotAround(tangentize(vnorm(vsub(p, faceC)), nn), nn, (rng() - 0.5) * 3.0);
    const len = 0.07 + Math.pow(rng(), 2.2) * 0.2;
    longSet.add(p, nn, dir, len, 0.0028, 0.35 + rng() * 1.1, (rng() - 0.5) * 3.2, rng(), REG.fly, a, BONE.body, 0.22 + rng() * 0.25, 0.5 + rng() * 1.4, 0.6);
    i++;
  }
  const shortGeo = shortSet.build(KNOBS.shortSegments, rng), longGeo = longSet.build(KNOBS.longSegments, rng);
  const feltGeo = meshGeometry(mesh, { aReg: { array: reg, size: 4 }, aAO: { array: ao, size: 1 } });
  const feltM = new THREE.Mesh(feltGeo, bodyMat); feltM.layers.enable(1);
  const shortM = new THREE.Mesh(shortGeo, shortMat), longM = new THREE.Mesh(longGeo, longMat);
  for (const m of [shortM, longM]) { m.frustumCulled = false; m.renderOrder = 10; }
  longM.renderOrder = 11;
  const entry = { id, A, feltM, shortM, longM, strandGeos: [shortGeo, longGeo],
    timings: { sdf: Math.round(tB - tA), strands: Math.round(performance.now() - tB) },
    dispose() { feltGeo.dispose(); shortGeo.dispose(); longGeo.dispose(); } };
  formCache.set(id, entry);
  // keep memory bounded: at most 6 forms resident (not the one in use)
  while (formCache.size > 6) {
    const [k, v] = formCache.entries().next().value;
    if (cur.form && cur.form.id === k) { formCache.delete(k); formCache.set(k, v); continue; }
    formCache.delete(k); v.dispose(); purgeFor(k);
  }
  return entry;
}

// ------------------------------------------------------------------ eyes
const ER = 0.18; // regular eye radius
const LK = ER / 0.2;
const LIDD = { gap: 0.006 * LK, thick: 0.066 * LK, lowerThick: 0.034 * LK, back: 2.45, lowerEdge: -0.72, lowerBack: 0.75, roll: 0.13, closed: 0.86 };
const eyeGeo = new THREE.SphereGeometry(ER, 72, 54);
const beadGeo = new THREE.SphereGeometry(1, 48, 36);
const lidG = lidGeometry({ r0: ER + LIDD.gap, thick: LIDD.thick, bEdge: 0, bBack: LIDD.back, dir: 1, lip: 1.0, edgeCurve: 0.06 });
const lowG = lidGeometry({ r0: ER + LIDD.gap, thick: LIDD.lowerThick, bEdge: LIDD.lowerEdge, bBack: LIDD.lowerEdge - LIDD.lowerBack, dir: -1, lip: 1.0, edgeCurve: -0.04 });
for (const g of [lidG, lowG]) { // lid AO from the eyeball it wraps
  const P = g.attributes.position.array, Nn = g.attributes.normal.array, n = P.length / 3;
  const reg = new Float32Array(n * 4), ao = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    reg[4 * i] = 1; let occ = 0, w = 1;
    for (const h of [0.03, 0.07, 0.13]) { const px = P[3 * i] + Nn[3 * i] * h, py = P[3 * i + 1] + Nn[3 * i + 1] * h, pz = P[3 * i + 2] + Nn[3 * i + 2] * h; occ += w * max(0, h - (Math.hypot(px, py, pz) - ER)); w *= 0.62; }
    ao[i] = clamp(1 - occ * 2.0, 0.35, 1);
  }
  g.setAttribute('aReg', new THREE.BufferAttribute(reg, 4));
  g.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
}
// lid fur (roots in lid-local space, so it fits every form)
const lidStrandGeo = (() => {
  const set = new StrandSet(), rng = rngOf(4242);
  const addLid = (g, count, boneL, boneR, upper) => {
    const P = g.attributes.position.array, Nn = g.attributes.normal.array, F = g.attributes.aFur.array, Lp = g.attributes.aLip.array, AOa = g.attributes.aAO.array;
    const samp = makeSampler(P, g.index.array, (a, b, c) => (F[a] + F[b] + F[c]) / 3);
    for (let i = 0, tries = 0; i < count && tries < count * 6; tries++) {
      const s = samp(rng);
      const p = bary(P, 3, s), n = vnorm(bary(Nn, 3, s)), lip = bary(Lp, 1, s)[0], a = bary(AOa, 1, s)[0];
      const b = atan2(p[1], p[2]);
      if (upper && b > 1.65) continue;
      i++;
      const toEdge = upper ? [0, -cos(b), sin(b)] : [0, cos(b), -sin(b)];
      const dir = rotAround(tangentize(toEdge, n), n, (rng() - 0.5) * 1.0);
      const len = (upper ? 0.028 : 0.017) * (0.55 + rng() * 0.7) * (lip > 0.5 ? 0.8 : 1);
      const lean = lip > 0.5 ? 1.0 + rng() * 0.4 : 0.8 + rng() * 0.6;
      for (const bone of [boneL, boneR]) set.add(p, n, dir, len, 0.0038, lean, (rng() - 0.3) * 1.2, rng(), REG.fur, a, bone, 0.14 + rng() * 0.1, 1 + rng() * 1.5, 0.95);
    }
  };
  addLid(lidG, KNOBS.budget.lidCoat, BONE.lidL, BONE.lidR, true);
  addLid(lowG, KNOBS.budget.lowerLid, BONE.lowL, BONE.lowR, false);
  return set.build(KNOBS.shortSegments, rng);
})();
const lidStrandM = new THREE.Mesh(lidStrandGeo, shortMat); lidStrandM.frustumCulled = false; lidStrandM.renderOrder = 10; scene.add(lidStrandM);

function eyeMaterial(o) {
  return new THREE.ShaderMaterial({
    vertexShader: EYE_VS, fragmentShader: EYE_FS,
    uniforms: { ...SH, uEyeR: { value: o.r }, uCamLocal: { value: new THREE.Vector3() }, uF0: { value: o.f0 ?? 0.045 },
      uIrisAng: { value: o.irisAng ?? 0.7 }, uPupil: { value: o.pupil ?? 0.45 }, uIrisDepth: { value: o.depth ?? 0.1 },
      uIris: { value: lin(o.iris) }, uIrisDark: { value: lin(o.irisDark) }, uSclera: { value: lin(o.sclera) },
      uLidInv: { value: new THREE.Matrix4() }, uLowInv: { value: new THREE.Matrix4() },
      uLidEdge: { value: o.lids ? 0 : 50 }, uLowEdge: { value: o.lids ? LIDD.lowerEdge : -50 } },
  });
}
function basisQuat(n, up = [0, 1, 0]) {
  const z = vnorm(n); let x = vcross(up, z); if (vlen(x) < 1e-3) x = [1, 0, 0]; x = vnorm(x); const y = vcross(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z)));
}
const faceN = (n, k = 0.35) => vnorm(vadd(vmul(n, 1 - k), [0, 0, k]));
function tubeMesh(pts, r, mat, closed = false, seg) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg || max(24, pts.length * 6), r, 12, closed), mat);
  if (!closed) { // round end caps
    const g = new THREE.Group(); g.add(m);
    for (const p of [pts[0], pts[pts.length - 1]]) { const c = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat); c.position.set(...p); g.add(c); }
    return g;
  }
  return m;
}
function arcPts(w, bow, n = 11, zc = 0.0) { // eye-local arc: x across, y bow (+ = ^, - = smile/closed), follows the face curvature
  const pts = [];
  for (let i = 0; i < n; i++) { const t = -1 + (2 * i) / (n - 1); pts.push([t * w, bow * (1 - t * t), -zc * t * t]); }
  return pts;
}

// Eye rig: regular (big dark iris under a soft felt lid), bead, sleepy arcs.
// Regular: the glossy eye's cornea + catchlight shader with a large near-black iris, the upper lid resting
// on the top of the iris and the lower lid just under it, no roll (a rolled lid reads cross or sad).
// Open and awake: no felt ridge above or below the eye at rest; the lids are tucked away and only
// sweep down to blink (and stay shut for happy / sleeping).
const REG_EYE = { sc: 0.8, squash: [0.92, 1.08, 0.92], inset: 0.34, irisAng: 0.86, pupil: 0.6, sep: 0.27, hide: -2.2,
};
// The eyes follow the app's eye frames: each eye's centre slides over the felt (the app moves it by the same px on its
// mark, measured from the app's rest frame, so the rest pose is this page's), and its outline's size, thickness and
// lean (second moments of the app's eye polygon) become the bead's / eyeball's shape: squints, wide eyes, dashes, tilts.
function faceSampler(A) { // a surface point + normal on the front of the form at (x, y), from a lazily ray-marched grid
  if (A.faceGrid) return A.faceGrid;
  const st = 0.04, x0 = -1.24, y0 = A.base, nx = Math.ceil(2.48 / st) + 1, ny = Math.ceil((A.H - A.base) / st) + 1, cache = new Map();
  const node = (i, j) => { const key = i * 1000 + j; if (!cache.has(key)) cache.set(key, A.front(x0 + i * st, y0 + j * st)); return cache.get(key); };
  A.faceGrid = (x, y) => {
    const fx = clamp((x - x0) / st, 0, nx - 1.001), fy = clamp((y - y0) / st, 0, ny - 1.001), i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const q = [node(i, j), node(i + 1, j), node(i, j + 1), node(i + 1, j + 1)], w = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
    let p = [0, 0, 0], n = [0, 0, 0], ws = 0;
    q.forEach((h, k) => { if (h) { p = vadd(p, vmul(h.p, w[k])); n = vadd(n, vmul(h.n, w[k])); ws += w[k]; } });
    return ws < 1e-6 ? null : { p: vmul(p, 1 / ws), n: vnorm(n) };
  };
  return A.faceGrid;
}
const wrapHalf = (a) => { while (a > PI / 2) a -= PI; while (a <= -PI / 2) a += PI; return a; };
function eyeLooks(M, eyes, A, lim) { // the app's eye pair -> where the two eyes sit on the form (form units)
  // each eye moves by the app's px from the app's rest frame; the pair's shared move is eased near the face's edge
  // (tanh) and the pair is kept on the face as a unit, so the app's spacing (the expression) survives
  const mk = A.W / 2 / MARK_GEO.halfW;
  const d = eyes.map((e, i) => { const c0 = MARK_EYES[0][i].c; return [(M.eyes[i].x - c0[0]) * mk, -(M.eyes[i].y - c0[1]) * mk]; });
  const mx = (d[0][0] + d[1][0]) / 2, my = (d[0][1] + d[1][1]) / 2;
  const ex = lim[0] * Math.tanh(mx / lim[0]), ey = my < 0 ? lim[1] * Math.tanh(my / lim[1]) : lim[2] * Math.tanh(my / lim[2]);
  const P = eyes.map((e, i) => [e.rest[0] + ex + d[i][0] - mx, e.rest[1] + ey + d[i][1] - my]);
  const lo = Math.min(P[0][0], P[1][0]), hi = Math.max(P[0][0], P[1][0]), edge = lim[3];
  const sh = lo < -edge ? -edge - lo : hi > edge ? edge - hi : 0;
  return P.map(([x, y]) => [x + sh, clamp(y, A.eyeY - lim[1] - 0.1, A.eyeY + lim[2] + 0.05)]);
}
function eyeLean(d, i) { // display angle of the eye's long axis (y down, from +x): app-exact, but the app's resting lean is straightened
  const a0 = EYE_REST[i].ang, dd = wrapHalf(d.ang - a0), w = Math.max(0, cos(2 * dd)) ** 2;
  return wrapHalf(d.ang + (PI / 2 - a0) * w);
}
const _q = new THREE.Quaternion(), _zAxis = new THREE.Vector3(0, 0, 1);
function makeEyes(kind, A) {
  const group = new THREE.Group();
  const rig = { kind, group, holes: [], eyes: [], front: 0.04 };
  const surf = faceSampler(A);
  if (kind === 'regular') {
    const E = REG_EYE, sc = E.sc;
    const reye = [A.front(-E.sep, A.eyeY), A.front(E.sep, A.eyeY)];
    reye.forEach((e, i) => {
      const side = i === 0 ? -1 : 1;
      const c = vsub(e.p, vmul(e.n, ER * sc * E.inset));
      const socket = new THREE.Group(); socket.position.set(...c); socket.scale.set(sc * E.squash[0], sc * E.squash[1], sc * E.squash[2]); group.add(socket);
      const mat = eyeMaterial({ r: ER, lids: true, f0: 0.05, irisAng: E.irisAng, pupil: E.pupil, depth: 0.05,
        iris: hex3('#33251E'), irisDark: hex3('#100B09'), sclera: hex3('#F4F1EC') });
      const eyeball = new THREE.Mesh(eyeGeo, mat); socket.add(eyeball); eyeball.layers.enable(1);
      const frame = new THREE.Group(); socket.add(frame);
      const nrm = e.n; const yaw = atan2(nrm[0], nrm[2]), pitch = -Math.asin(clamp(nrm[1], -1, 1)) * 0.8;
      frame.rotation.set(pitch, yaw, 0, 'YXZ');
      const upper = new THREE.Group(), lower = new THREE.Group(); frame.add(upper, lower);
      const um = new THREE.Mesh(lidG, feltMat), lm = new THREE.Mesh(lowG, feltMat); upper.add(um); lower.add(lm);
      um.layers.enable(1); lm.layers.enable(1);
      // a closed eye (the app's dash frames): a simple black line on the plush
      const zS = ER * E.inset + 0.04 / sc, hw = 0.11;
      const closed = tubeMesh(arcPts(hw, -0.045, 13, 0.012), 0.015, MAT.enamel);
      closed.position.set(0, 0, zS); closed.visible = false; frame.add(closed);
      rig.eyes.push({ socket, eyeball, mat, upper, lower, side, c, closed, frame, rest: [e.p[0], e.p[1]] });
      rig.holes.push([...c, ER * sc + 0.012]);
    });
    rig.front = ER * (1 - E.inset) * sc + 0.02;
    rig.lids = true;
    rig.update = (t, gaze, M) => {
      let open = 0;
      const looks = eyeLooks(M, rig.eyes, A, [0.45, 0.45, 0.25, 0.66]);
      // the app's angry frame slants the eyes into a V ("\ /"): on round eyeballs that becomes lids tilted down to the middle
      const dvs = rig.eyes.map((e, i) => { const o = M.eyes[i]; return wrapHalf(eyeLean(eyeShape(o.e, o.sx, o.syShape), i) - PI / 2) * e.side; });
      const frown = clamp((Math.min(dvs[0], dvs[1]) - 0.25) / 0.3, 0, 1);
      rig.eyes.forEach((e, i) => {
        const o = M.eyes[i], ds = eyeShape(o.e, o.sx, o.syShape), r0 = EYE_REST[i];
        const [x, y] = looks[i];
        const h = surf(x, y) || { p: [x, y, 0.6], n: [0, 0, 1] };
        const c = vsub(h.p, vmul(h.n, ER * sc * E.inset));
        e.bind = c; e.look = [x, y]; e.socket.position.set(...M.morphP(c));
        const size = clamp(Math.sqrt(ds.a / r0.a), 0.8, 1.35);
        e.socket.scale.set(sc * E.squash[0] * size, sc * E.squash[1] * size, sc * E.squash[2] * size);
        const shut = ds.b / ds.a < 0.28; // the app's dashes: a closed line
        const lean = eyeLean(ds, i), dv = wrapHalf(lean - PI / 2);
        const yaw = atan2(h.n[0], h.n[2]), pitch = -Math.asin(clamp(h.n[1], -1, 1)) * 0.8;
        e.frame.rotation.set(pitch, yaw, shut ? -wrapHalf(lean) : -dv * frown, 'YXZ');
        // lids: the app's openness (blinks, drowsy) sweeps the soft lid down
        const lid = frown > 0.02 ? 0.5 + 0.2 * frown : 0;   // the lid's covering range starts about half-way down its sweep
        const bl = M.eyesOn ? clamp(max(1 - o.open, lid, M.squeeze), 0, 1) : 0;
        const lidsOn = !shut && bl > 0.01;
        e.upper.rotation.x = E.hide + (LIDD.closed - E.hide) * sstep(0, 1, bl);
        e.lower.rotation.x = 0.02 - 0.12 * bl;
        e.upper.visible = lidsOn; e.lower.visible = lidsOn && bl > 0.5;
        e.eyeball.visible = !shut; e.closed.visible = shut;
        e.mat.uniforms.uLidEdge.value = lidsOn ? 0 : 50;
        e.mat.uniforms.uLowEdge.value = e.lower.visible ? LIDD.lowerEdge : -50;
        // the iris looks where the app's eyes went (plus the pointer)
        const lx = clamp((x - e.rest[0]) * 0.9, -0.5, 0.5), ly = clamp((y - e.rest[1]) * 0.9, -0.4, 0.4);
        const gy = gaze.yaw + lx + 0.05 * sin(t * 0.53), gp = gaze.pitch + ly + 0.03 * sin(t * 0.37);
        e.eyeball.rotation.set(-gp, gy + e.side * 0.08, 0, 'YXZ');
        if (lidsOn) open++;
      });
      rig.lidsVisible = open > 0;
      rig.holes = rig.eyes.map((e) => [...e.bind, ER * sc + 0.012]);
    };
  } else {
    const bead = kind === 'bead';
    const BW = 0.068, BH = 0.102, BD = 0.052;   // small glossy black vertical ovals
    A.eyes.forEach((e, i) => {
      const n = faceN(e.n, 0.3);
      const base = vadd(e.p, vmul(n, bead ? 0.02 : 0.035));
      const socket = new THREE.Group(); socket.position.set(...base); socket.quaternion.copy(basisQuat(n)); group.add(socket);
      const eye = { socket, base, n, side: i ? 1 : -1, rest: [e.p[0], e.p[1]] };
      if (bead) {
        const bm = eyeMaterial({ r: 1, lids: false, f0: 0.06, irisAng: 0.001, iris: [0, 0, 0], irisDark: [0, 0, 0], sclera: [0.012, 0.012, 0.016] });
        eye.mat = bm;
        const b = new THREE.Mesh(beadGeo, bm); b.scale.set(BW, BH, BD); socket.add(b); b.layers.enable(1); eye.bead = b;
      }
      const w = bead ? 0.075 : 0.1;
      eye.closed = tubeMesh(arcPts(w, -w * 0.42, 13, 0.01), 0.0145, MAT.enamel); socket.add(eye.closed);
      eye.closed.visible = !bead;
      rig.eyes.push(eye);
      rig.holes.push([...vsub(e.p, vmul(n, 0.01)), bead ? BH * 0.78 : 0.03]);
    });
    rig.front = bead ? 0.07 : 0.06;
    rig.lids = false;
    const qb0 = BW / BH;
    rig.update = (t, gaze, M) => {
      const looks = eyeLooks(M, rig.eyes, A, [0.55, 0.5, 0.28, 0.76]);
      rig.eyes.forEach((e, i) => {
        const o = M.eyes[i], r0 = EYE_REST[i];
        const [x, y] = looks[i];
        const h = surf(x, y) || { p: [x, y, 0.6], n: [0, 0, 1] };
        const n = faceN(h.n, 0.3), p = vadd(h.p, vmul(n, bead ? 0.02 : 0.035));
        e.socket.position.set(...M.morphP(p));
        e.socket.quaternion.copy(basisQuat(n));
        const squeeze = M.squeeze, d = eyeShape(o.e, o.sx, o.sy * (1 - 0.94 * squeeze));
        const lean = eyeLean(d, i);
        if (e.bead) {
          // the app's outline -> an oval bead: the long axis scales with the outline, its thickness keeps the
          // bead's own resting proportions (a round app eye stays round, a thin one becomes the page's dash)
          const q = d.b / d.a, q0 = r0.b / r0.a;
          const qb = q <= q0 ? qb0 * (q / q0) : qb0 + (1 - qb0) * Math.min(1, (q - q0) / (1 - q0));
          const major = BH * (d.a / r0.a) * (q < q0 ? 1 + 0.45 * (1 - q / q0) : 1);
          e.bead.scale.set(Math.max(major * qb, BH * 0.17), major, BD * (1 - 0.3 * clamp(1 - q / q0, 0, 1)));
          e.bead.rotation.z = -(lean - PI / 2);
          e.bead.visible = M.eyesOn;
          e.closed.visible = false;
        } else { // sleepy: always the closed arc, following the app eye's size and (for its dashes) its slant
          const wv = sin(lean) ** 2;
          e.closed.rotation.z = -wrapHalf(lean) * (1 - wv);
          e.closed.scale.setScalar(clamp(Math.sqrt((d.a * d.b) / (r0.a * r0.b)), 0.75, 1.35));
          e.closed.visible = M.eyesOn;
        }
        e.bind = h.p; e.look = [x, y];
      });
      rig.holes = rig.eyes.map((e) => [...vsub(e.bind, [0, 0, 0.01]), bead ? BH * 0.78 : 0.03]);
    };
  }
  rig.dispose = () => { for (const e of rig.eyes) if (e.mat) e.mat.dispose(); disposeTree(group); };
  return rig;
}
function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared && o.geometry !== eyeGeo && o.geometry !== beadGeo && o.geometry !== lidG && o.geometry !== lowG) o.geometry.dispose();
    if (o.material && !o.material.userData.shared && o.material !== feltMat && o.material.type !== 'ShaderMaterial') o.material.dispose();
  });
}

// ------------------------------------------------------------------ mouth
function makeMouth(kind, A, rig) {
  if (kind === 'none' || !A.mouth) return null;
  const g = new THREE.Group();
  const n = faceN(A.mouth.n, 0.3);
  const s = new THREE.Group(); s.position.set(...vadd(A.mouth.p, vmul(n, 0.035))); s.quaternion.copy(basisQuat(n)); g.add(s);
  if (kind === 'smile') s.add(tubeMesh(arcPts(0.07, -0.035, 13, 0.008), 0.013, MAT.enamel));
  if (kind === 'grin') { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, 2 * PI, PI / 2, PI / 2), MAT.enamel); m.scale.set(0.085, 0.07, 0.03); m.rotation.x = 0; s.add(m); }
  if (kind === 'oh') { const m = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 12, 32), MAT.enamel); m.scale.y = 1.2; s.add(m); const d = new THREE.Mesh(new THREE.CircleGeometry(0.03, 24), MAT.enamel); s.add(d); }
  g.userData.hole = [...A.mouth.p, 0.03];
  return g;
}

// ------------------------------------------------------------------ canonical accessory shapes (SDF, polygonised once)
const shapeCache = new Map();
function sdfGeo(key, fn, bmin, bmax, cell) {
  if (shapeCache.has(key)) return shapeCache.get(key);
  const m = surfaceNets(fn, bmin, bmax, cell);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.N, 3));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  g.computeBoundingSphere(); g.userData.shared = true;
  shapeCache.set(key, g);
  return g;
}
const SHAPES = {
  bowtie: () => sdfGeo('bowtie', (x, y, z) => {
    const ax = abs(x);
    const zz = z + 0.3 * x * x;                        // lobes sweep back a little
    // lobe outline: narrow at the knot, tall at the tip, a small notch in the outer edge
    const dl = sdPoly(ax, y, [[0.03, -0.05], [0.265, -0.13], [0.3, -0.095], [0.278, 0], [0.3, 0.095], [0.265, 0.13], [0.03, 0.05]]) - 0.028;
    const sIn = -dl, Rb = 0.05, Db = 0.036 + 0.02 * sstep(0.04, 0.26, ax);
    let lobe = sdE2(max(Rb - sIn, 0), abs(zz - 0.004), Rb, Db);
    // two soft folds running from the knot to the corners
    const fold = min(abs(y - 0.33 * (ax - 0.04)), abs(y + 0.33 * (ax - 0.04))) - 0.004;
    lobe = smax(lobe, -(Math.hypot(max(fold, 0), zz - Db - 0.012) - 0.016), 0.012);
    const qx = ax - 0.052 + 0.02, qy = abs(y) - 0.068 + 0.02, qz = abs(z - 0.012) - 0.052 + 0.02;
    const knot = Math.hypot(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, qy, qz), 0) - 0.02;
    return smin(lobe, knot, 0.02);
  }, [-0.36, -0.19, -0.1], [0.36, 0.19, 0.1], 0.006),
  beret: () => sdfGeo('beret4', (x, y, z) => {
    // a big, flat, puffy felt disc (no hard rim), a soft band underneath, a small knob stem on top
    let d = sdEll(x, y, z, [0, 0.2, 0], [0.64, 0.215, 0.62]);
    d = smin(d, sdEll(x, y, z, [0, 0.07, 0], [0.46, 0.11, 0.45]), 0.12);
    d = smax(d, -y, 0.05);
    d = smin(d, sdCap(x, y, z, [0.03, 0.38, 0], [0.035, 0.45, 0], 0.022), 0.03);
    d = smin(d, sdSph(x, y, z, [0.036, 0.47, 0], 0.046), 0.015);
    return d;
  }, [-0.72, -0.05, -0.7], [0.72, 0.54, 0.7], 0.011),
  tophat: () => sdfGeo('tophat', (x, y, z) => {
    const r = Math.hypot(x, z);
    const rr = 0.33 + 0.03 * sstep(0.1, 0.62, y);
    let crown = max(r - rr, abs(y - 0.33) - 0.3);
    crown = min(crown, 0) + 0; crown = crownRound(r - rr, abs(y - 0.33) - 0.3, 0.03);
    const by = y - 0.03 - 0.07 * (x / 0.6) ** 2;
    const brim = crownRound(r - 0.56, abs(by) - 0.018, 0.018);
    return smin(crown, brim, 0.03);
  }, [-0.62, -0.05, -0.62], [0.62, 0.68, 0.62], 0.01),
  crown: () => sdfGeo('crown', (x, y, z) => {
    const r = Math.hypot(x, z), a = atan2(z, x);
    let d = crownRound(abs(r - 0.36) - 0.022, abs(y - 0.08) - 0.08, 0.01);
    const k = 7, seg = (2 * PI) / k, aa = ((a % seg) + seg * 1.5) % seg - seg / 2;
    const px = r * cos(aa) - 0.36, pz = r * sin(aa);
    const spike = sdRoundCone(Math.hypot(pz * 1.0, px * 2.2) , y - 0.12, 0.07, 0.012, 0.22) ;
    d = smin(d, max(spike, abs(px) - 0.03), 0.02);
    d = smin(d, sdSph(px, y, pz, [0, 0.35, 0], 0.03), 0.01);
    return d;
  }, [-0.46, -0.03, -0.46], [0.46, 0.42, 0.46], 0.0075),
};
function crownRound(dx, dy, r) { dx += r; dy += r; return min(max(dx, dy), 0) + Math.hypot(max(dx, 0), max(dy, 0)) - r; }

// ------------------------------------------------------------------ accessories
const pomStrandGeo = (() => {
  const set = new StrandSet(), r = rngOf(771);
  for (let i = 0; i < KNOBS.budget.pom; i++) {
    const n = vnorm([r() - 0.5, r() - 0.5, r() - 0.5]); const p = vmul(n, 0.07);
    const dir = tangentize([r() - 0.5, r() - 0.5, r() - 0.5], n);
    set.add(p, n, dir, 0.06 + r() * 0.04, 0.0045, 0.12 + r() * 0.35, (r() - 0.5) * 2.4, r(), REG.yarn, 0.8, BONE.pom, 0.22 + r() * 0.2, 0.6 + r(), 0.95);
  }
  return set.build(6, r);
})();
const pomStrandM = new THREE.Mesh(pomStrandGeo, longMat); pomStrandM.frustumCulled = false; pomStrandM.renderOrder = 11; pomStrandM.visible = false; scene.add(pomStrandM);
const pomCoreGeo = (() => { const g = new THREE.SphereGeometry(0.075, 24, 16); const n = g.attributes.position.count; const reg = new Float32Array(n * 4); for (let i = 0; i < n; i++) reg[4 * i] = 1; g.setAttribute('aReg', new THREE.BufferAttribute(reg, 4)); g.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(n).fill(0.7), 1)); g.userData.shared = true; return g; })();

// Soft hats: lower the underside of a canonical hat onto this form's head so it sits, instead of floating.
function drape(geo, frame, A, yCut, clear) {
  frame.updateMatrix();
  const M = frame.matrix, Mi = M.clone().invert();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(frame.quaternion).normalize();
  const P = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    const wgt = sstep(yCut, 0, v.y);
    if (wgt <= 0) continue;
    v.applyMatrix4(M);
    const hit = march(A.sdf, [v.x + up.x * 0.6, v.y + up.y * 0.6, v.z + up.z * 0.6], [-up.x, -up.y, -up.z], 1.5);
    if (!hit) { v.applyMatrix4(Mi); continue; }
    const dist = (v.x - hit[0]) * up.x + (v.y - hit[1]) * up.y + (v.z - hit[2]) * up.z;
    const k = wgt * sstep(0.5, 0.25, dist);
    v.addScaledVector(up, -clamp((dist - clear) * k, -0.03, 0.1));
    v.applyMatrix4(Mi);
    P.setXYZ(i, v.x, v.y, v.z);
  }
  P.needsUpdate = true; geo.computeVertexNormals(); geo.userData = {};
  return geo;
}
function hatFrame(A, o) { // position + orientation on the form's top
  const t = A.top; const up = vnorm(vadd([0, 1, 0], vmul(t.n, o.follow ?? 0.35)));
  const s = clamp((t.halfW / (o.fitW || 0.52)) * (o.k || 1), o.min ?? 0.6, o.max ?? 1.15);
  const g = new THREE.Group();
  g.position.set(...vadd(t.p, vmul(up, -(o.sink || 0) * s)));
  g.position.x += (o.dx || 0) * s;
  const q = basisQuat([0, 0, 1], up); // y along up
  const m = new THREE.Matrix4().makeBasis(...(() => { const x = vnorm(vcross(up, [0, 0, 1])); const z = vcross(x, up); return [new THREE.Vector3(...x), new THREE.Vector3(...up), new THREE.Vector3(...z)]; })());
  g.quaternion.setFromRotationMatrix(m);
  g.rotateZ(o.tilt || 0); g.rotateX(o.tiltX || 0);
  g.scale.setScalar(s);
  g.userData.s = s;
  return g;
}

// A shell that hugs the form's top (beanie, cap): rays from a point inside the head.
function hugShell(A, amax, off, na = 26, nb = 72, rCap = 0.62) {
  const c = [A.top.cx * 0.5, max(A.top.p[1] - 0.72, A.H * 0.42), 0];
  const P = [], N = [];
  const hitAt = (a, b) => { const u = [sin(a) * sin(b), cos(a), sin(a) * cos(b)]; return march(A.sdf, vadd(c, vmul(u, 4)), vmul(u, -1)); };
  const top0 = hitAt(0, 0) || A.top.p;
  const amaxB = [];
  for (let j = 0; j <= nb; j++) { // per direction: stop where the footprint gets wider than a hat
    const b = (2 * PI * j) / nb; let am = amax;
    for (let a = 0.05; a <= amax; a += 0.02) { const h = hitAt(a, b); if (h && Math.hypot(h[0] - top0[0], h[2] - top0[2]) > rCap) { am = a; break; } }
    amaxB.push(am);
  }
  for (let j = 0; j <= nb; j++) { const k = (j + nb) % nb; amaxB[j] = (amaxB[(k + nb - 1) % nb] + 2 * amaxB[k] + amaxB[(k + 1) % nb]) / 4; }
  for (let i = 0; i <= na; i++) for (let j = 0; j <= nb; j++) {
    const a = (amaxB[j] * i) / na, b = (2 * PI * j) / nb;
    const u = [sin(a) * sin(b), cos(a), sin(a) * cos(b)];
    const p = march(A.sdf, vadd(c, vmul(u, 4)), vmul(u, -1)) || vadd(c, vmul(u, 0.6));
    const n = gradN(A.sdf, p);
    P.push(vadd(p, vmul(n, off(a / amax)))); N.push(n);
  }
  return { P, N, na, nb, c };
}
function gridGeometry(P, na, nb, uvFn, extra) {
  const pos = new Float32Array(P.length * 3); P.forEach((p, i) => pos.set(p, 3 * i));
  const idx = [];
  for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) { const a = i * (nb + 1) + j, b = a + nb + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  if (extra) for (const k in extra) g.setAttribute(k, extra[k]);
  return g;
}
// knit tube along a path (scarf, beanie brim). columns run along the path.
function knitTube(path, radius, closed, rib, flat = 1) {
  const n = path.length, ns = 20, pos = [], kuv = [], ribA = [], ao = [];
  const L = [0]; for (let i = 1; i < n + (closed ? 1 : 0); i++) L.push(L[i - 1] + vlen(vsub(path[i % n], path[i - 1])));
  const cnt = closed ? n + 1 : n;
  for (let i = 0; i < cnt; i++) {
    const p = path[i % n], pn = path[(i + 1) % n], pp = path[(i - 1 + n) % n];
    const T = vnorm(closed ? vsub(pn, pp) : vsub(path[min(i + 1, n - 1)], path[max(i - 1, 0)]));
    let B = vnorm(vcross(T, [0, 1, 0])); if (vlen(vcross(T, [0, 1, 0])) < 0.2) B = vnorm(vcross(T, [1, 0, 0]));
    const Nn = vcross(B, T);
    for (let k = 0; k <= ns; k++) {
      const a = (2 * PI * k) / ns;
      const o = vadd(vmul(B, cos(a) * radius), vmul(Nn, sin(a) * radius * flat));
      pos.push(...vadd(p, o));
      kuv.push(L[i] / 0.07, (a * radius) / 0.055); ribA.push(rib ? 1 : 0); ao.push(0.75 + 0.25 * sstep(-1, 1, sin(a)));
    }
  }
  const idx = [];
  for (let i = 0; i < cnt - 1; i++) for (let k = 0; k < ns; k++) { const a = i * (ns + 1) + k, b = a + ns + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  g.setAttribute('aKuv', new THREE.Float32BufferAttribute(kuv, 2)); g.setAttribute('aRib', new THREE.Float32BufferAttribute(ribA, 1)); g.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
  return g;
}
function smoothLoop(pts, it = 2) { let p = pts.map((q) => q.slice()); for (let k = 0; k < it; k++) p = p.map((q, i) => vmul(vadd(vadd(p[(i - 1 + p.length) % p.length], p[(i + 1) % p.length]), vmul(q, 2)), 0.25)); return p; }

function lensFrame(A, rig) { // shared geometry for eyewear: where each lens sits and faces
  const [e0, e1] = A.eyes;
  const avg = vnorm(vadd(vadd(e0.n, e1.n), [0, 0, 1.2]));
  const sep = (e1.p[0] - e0.p[0]) / 2;
  const L = [e0, e1].map((e, i) => {
    const n = vnorm(vadd(faceN(e.n, 0.2), avg));
    const c = vadd(e.p, vmul(n, rig.front + 0.05));
    const q = basisQuat(n);
    const m = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
    const tx = new THREE.Vector3(1, 0, 0).applyMatrix3(m).toArray(), ty = new THREE.Vector3(0, 1, 0).applyMatrix3(m).toArray();
    return { c, n, q, tx, ty, side: i ? 1 : -1 };
  });
  return { L, sep };
}
function lensAt(l, x, y) { return vadd(l.c, vadd(vmul(l.tx, x), vmul(l.ty, y))); }
function temples(A, g, L, rl, wire, mat, ex = 1) {
  for (const l of L) {
    // short arms that run back a little and disappear into the fur
    const o = lensAt(l, l.side * rl * ex, 0.02);
    const p1 = projectOut(A.sdf, vadd(o, [l.side * 0.09, 0.005, -0.12]), 0.03);
    const p2 = projectOut(A.sdf, vadd(o, [l.side * 0.15, 0.01, -0.3]), -0.02);
    g.add(tubeMesh([o, p1, p2], wire * 0.8, mat));
  }
}
function ringPath(kind, r) { // closed 2D outline of a lens
  const pts = [];
  const N = 64;
  for (let i = 0; i < N; i++) {
    const t = (2 * PI * i) / N;
    if (kind === 'round') pts.push([r * cos(t), r * sin(t)]);
    else if (kind === 'square') { const p = 5, c = cos(t), s = sin(t); pts.push([r * 1.12 * Math.sign(c) * Math.pow(abs(c), 2 / p), r * 0.86 * Math.sign(s) * Math.pow(abs(s), 2 / p)]); }
    else if (kind === 'heart') { const x = 16 * sin(t) ** 3, y = 13 * cos(t) - 5 * cos(2 * t) - 2 * cos(3 * t) - cos(4 * t); pts.push([(x / 17) * r * 1.12, (y / 17) * r * 1.12 + r * 0.12]); }
    else if (kind === 'aviator') { const c = cos(t), s = sin(t); const x = r * 1.08 * c * (1 + 0.1 * s), y = r * (s > 0 ? 0.78 * s : 1.02 * s) * (1 - 0.22 * c * c * (s < 0 ? 1 : 0)); pts.push([x - 0.12 * r * (s < 0 ? -s : 0) * Math.sign(c) * 0, y]); }
  }
  return pts;
}
function eyewear(id, A, rig) {
  const g = new THREE.Group();
  const { L, sep } = lensFrame(A, rig);
  const rl = clamp(sep * 0.84, 0.13, 0.3) * (id === 'monocle' ? 1.05 : 1);
  const spec = {
    round: { path: 'round', wire: 0.013, frame: MAT.satin, lens: MAT.glass },
    sunglasses: { path: 'round', wire: 0.016, frame: MAT.satin, lens: MAT.shade },
    square: { path: 'square', wire: 0.02, frame: MAT.satin, lens: MAT.glass },
    heart: { path: 'heart', wire: 0.018, frame: MAT.satin, lens: MAT.shade },
    monocle: { path: 'round', wire: 0.013, frame: MAT.satin, lens: MAT.glass },
  }[id];
  const lenses = id === 'monocle' ? [L[1]] : L;
  for (const l of lenses) {
    let path = ringPath(spec.path, rl);
    if (spec.path === 'aviator' && l.side < 0) path = path.map(([x, y]) => [-x, y]);
    const pts3 = path.map(([x, y]) => lensAt(l, x, y));
    g.add(tubeMesh(pts3, spec.wire, spec.frame, true, 160));
    const shape = new THREE.Shape(path.map(([x, y]) => new THREE.Vector2(x, y)));
    const lg = new THREE.ShapeGeometry(shape, 1);
    const lm = new THREE.Mesh(lg, spec.lens.clone ? spec.lens : spec.lens);
    lm.position.set(...vsub(l.c, vmul(l.n, 0.004))); lm.quaternion.copy(l.q); lm.renderOrder = 30;
    lm.onBeforeRender = () => { spec.lens.uniforms.uInvR.value = 1 / rl; };
    g.add(lm);
  }
  if (id === 'monocle') {
    const l = L[1];
    const a = lensAt(l, rl * 0.7, -rl * 0.7);
    const sd = A.sideR ? A.sideR.p : vadd(l.c, [0.4, -0.3, -0.2]);
    const low = projectOut(A.sdf, [sd[0] * 0.85, max(0.25, sd[1] - 0.55), sd[2] + 0.25], 0.03);
    const midp = vadd(vmul(vadd(a, low), 0.5), [0.02, -0.16, 0.08]);
    g.add(tubeMesh([a, projectOut(A.sdf, midp, 0.04), low], 0.005, MAT.satin, false, 60));
  } else {
    // bridge
    const a = lensAt(L[0], rl * (spec.path === 'square' ? 1.12 : 1) * 0.98, spec.path === 'heart' ? 0.05 : 0.02);
    const b = lensAt(L[1], -rl * (spec.path === 'square' ? 1.12 : 1) * 0.98, spec.path === 'heart' ? 0.05 : 0.02);
    const m = vadd(vmul(vadd(a, b), 0.5), [0, 0.045, 0.02]);
    g.add(tubeMesh([a, m, b], spec.wire * 0.9, spec.frame, false, 30));
    temples(A, g, L, rl, spec.wire, spec.frame, spec.path === 'square' ? 1.12 : 1.0);
  }
  return g;
}

function headwear(id, A, rig) {
  const g = new THREE.Group();
  const s0 = scheme(cur.color || 'blue');
  const felt = (geo) => { const m = new THREE.Mesh(feltGeo(geo), blackFelt); m.layers.enable(1); return m; };
  if (id === 'beret') {
    // big, flat, soft, slouched over the left side so it overhangs the edge; a small stem on top
    const f = hatFrame(A, { sink: 0.4, tilt: 0.3, dx: -0.27, fitW: 0.5, min: 1.25, max: 1.3, follow: 0.2 });
    f.rotateX(0.1);
    f.add(felt(drape(SHAPES.beret().clone(), f, A, 0.06, 0.02))); g.add(f);
  } else if (id === 'tophat') {
    const f = hatFrame(A, { sink: 0.07, tilt: 0.1, fitW: 0.46, min: 0.55, max: 1.05, follow: 0.3 });
    f.add(felt(SHAPES.tophat().clone()));
    g.add(f);
  } else if (id === 'crown') {
    const f = hatFrame(A, { sink: 0.07, tilt: 0.12, fitW: 0.46, min: 0.62, max: 1.0, follow: 0.4 });
    const m = new THREE.Mesh(SHAPES.crown(), MAT.satin); m.layers.enable(1); f.add(m);
    g.add(f);
  } else if (id === 'beanie' || id === 'cap') {
    const beanie = id === 'beanie';
    const amax = beanie ? 1.3 : 1.1;
    const sh = hugShell(A, amax, (u) => (beanie ? 0.1 + 0.06 * (1 - u) * (1 - u) : 0.085 + 0.02 * (1 - u)), 26, 80, beanie ? 0.98 : 0.86);
    const { P, na, nb } = sh;
    const rim = []; for (let j = 0; j < nb; j++) rim.push(P[na * (nb + 1) + j]);
    const circ = rim.reduce((acc, p, j) => acc + vlen(vsub(p, rim[(j + 1) % nb])), 0);
    const kuv = new Float32Array(P.length * 2), rib = new Float32Array(P.length), ao = new Float32Array(P.length);
    for (let j = 0; j <= nb; j++) {
      let acc = 0;
      for (let i = na; i >= 0; i--) {
        const k = i * (nb + 1) + j;
        if (i < na) acc += vlen(vsub(P[k], P[k + nb + 1]));
        kuv[2 * k] = ((j / nb) * circ) / 0.072 * (0.35 + 0.65 * sin(max(0.12, (amax * i) / na)) / sin(amax));
        kuv[2 * k + 1] = acc / 0.056; ao[k] = 0.8 + 0.2 * (1 - i / na);
      }
    }
    const geo = gridGeometry(P, na, nb, null, { aKuv: new THREE.BufferAttribute(kuv, 2), aRib: new THREE.BufferAttribute(rib, 1), aAO: new THREE.BufferAttribute(ao, 1) });
    if (beanie) {
      const km = knitMaterial(s0.yarn, s0.yarnLight);
      const shell = new THREE.Mesh(geo, km); shell.layers.enable(1); g.add(shell);
      const band = knitTube(smoothLoop(rim.map((p, j) => vadd(p, vmul(sh.N[na * (nb + 1) + j], 0.005))), 2), 0.06, true, true, 0.9);
      const bm = new THREE.Mesh(band, km); bm.layers.enable(1); g.add(bm);
      const tp = P[0];
      const tn = vnorm(vadd(sh.N[0], [0, 1, 0]));
      const core = new THREE.Mesh(pomCoreGeo, pomCoreMat); core.position.set(...vadd(tp, vmul(tn, 0.1))); core.scale.setScalar(1.25); core.layers.enable(1); g.add(core);
      g.userData.pom = true;
    } else {
      g.add(felt(geo));
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.04, 20, 12), MAT.satin); btn.position.set(...vadd(P[0], vmul(sh.N[0], 0.01))); btn.scale.y = 0.6; g.add(btn);
      // visor: fan out from the front of the rim
      const vp = [], vi = [];
      const front = []; for (let j = 0; j < nb; j++) { const a = (2 * PI * j) / nb; const d = abs(((a + PI) % (2 * PI)) - PI); if (d < 0.8) front.push({ p: rim[j], d, a }); }
      front.sort((u, v) => ((u.a + PI) % (2 * PI)) - ((v.a + PI) % (2 * PI)));
      front.forEach((f, i) => {
        const outd = vnorm(vadd(vmul(vnorm([f.p[0] - sh.c[0], 0, f.p[2] - sh.c[2]]), 0.45), [0, 0, 0.55]));
        const Lv = 0.3 * cos((f.d / 0.8) * PI / 2) ** 0.55 + 0.015;
        const o = vadd(f.p, vadd(vmul(outd, Lv), [0, -0.36 * Lv, 0]));
        vp.push(...f.p, ...o, ...vadd(f.p, [0, -0.02, 0]), ...vadd(o, [0, -0.02, 0]));
        if (i) { const a = (i - 1) * 4, b = i * 4; vi.push(a, b, a + 1, b, b + 1, a + 1, a + 2, a + 3, b + 2, b + 2, a + 3, b + 3, a + 1, b + 1, a + 3, b + 1, b + 3, a + 3); }
      });
      const vg = new THREE.BufferGeometry(); vg.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3)); vg.setIndex(vi); vg.computeVertexNormals();
      g.add(felt(vg));
    }
  } else if (id === 'partyhat') {
    const f = hatFrame(A, { sink: 0.03, tilt: -0.18, dx: 0.05, fitW: 0.5, min: 0.6, max: 1.0, follow: 0.4 });
    const cone = felt(new THREE.ConeGeometry(0.3, 0.74, 64, 1, true)); cone.position.y = 0.37; f.add(cone);
    g.add(f);
    f.updateMatrix(); const tip = new THREE.Vector3(0, 0.78, 0).applyMatrix4(f.matrix);
    const core = new THREE.Mesh(pomCoreGeo, pomCoreMat); core.position.copy(tip); core.scale.setScalar(f.userData.s * 0.9); g.add(core);
    g.userData.pom = true;
  } else if (id === 'headphones') {
    const arc = A.arcOver(A.eyeY, 41, PI / 2 - 0.08).map((q) => vadd(q.p, vmul(q.n, 0.085)));
    const band = tubeMesh(smoothLoop(arc, 0).slice(), 0.03, MAT.satin, false, 120); band.traverse((o) => o.layers && o.layers.enable(1)); g.add(band);
    for (const sd of [A.sideL, A.sideR]) {
      if (!sd) continue;
      const n = vnorm([sd.n[0], sd.n[1] * 0.3, sd.n[2] * 0.6]);
      const cup = new THREE.Group(); cup.position.set(...vadd(sd.p, vmul(n, 0.07))); cup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...n));
      const prof = []; for (let i = 0; i <= 12; i++) { const a = (i / 12) * PI / 2; prof.push(new THREE.Vector2(0.2 - 0.05 + 0.05 * cos(a), 0.05 + 0.05 * sin(a) + 0.04)); } prof.unshift(new THREE.Vector2(0.2, 0.0)); prof.push(new THREE.Vector2(0, 0.14));
      const shell = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), MAT.satin); shell.layers.enable(1); cup.add(shell);
      const cush = felt(new THREE.TorusGeometry(0.16, 0.045, 16, 48)); cush.rotation.x = PI / 2; cush.scale.z = 0.8; cup.add(cush);
      g.add(cup);
    }
  } else if (id === 'flower' || id === 'bow') {
    const t = A.top; const x = t.cx + t.halfW * 0.55;
    const hit = march(A.sdf, [x, A.H + 2, 0.15], [0, -1, 0]) || t.p;
    const n = gradN(A.sdf, hit);
    const f = new THREE.Group(); f.position.set(...vadd(hit, vmul(n, id === 'bow' ? 0.06 : 0.05)));
    f.quaternion.copy(basisQuat(vnorm(vadd(vmul(n, 0.5), [0.1, 0.25, 1]))));
    if (id === 'flower') {
      for (let i = 0; i < 6; i++) {
        const a = (2 * PI * i) / 6;
        const p = felt(new THREE.SphereGeometry(1, 28, 16));
        p.scale.set(0.12, 0.075, 0.03); p.position.set(cos(a) * 0.11, sin(a) * 0.11, -0.01); p.rotation.z = a;
        f.add(p);
      }
      const ctr = new THREE.Mesh(new THREE.SphereGeometry(0.055, 28, 18), MAT.satin); ctr.scale.z = 0.6; ctr.position.z = 0.02; f.add(ctr);
    } else {
      const m = new THREE.Mesh(SHAPES.bowtie(), MAT.satin); m.scale.setScalar(1.25); f.add(m); f.rotateZ(-0.35);
    }
    if (id === 'flower') f.scale.setScalar(1.7);
    f.traverse((o) => o.layers && o.layers.enable(1));
    g.add(f);
  }
  return g;
}

function conformGeo(geo, A, y0, off) { // map a flat (x,y,z) shape onto the front of the form
  const P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const h = A.front(x, max(0.02, y0 + y));
    const hz = h ? h.p[2] : 0, nz = h ? max(h.n[2], 0.35) : 1;
    P.setXYZ(i, x, y0 + y, hz + (off + z) / nz);
  }
  P.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
}
function neckwear(id, A, rig) {
  const g = new THREE.Group();
  const s0 = scheme(cur.color || 'blue');
  const ny = A.neck ? A.neck.p[1] : 0.25;
  if (id === 'bowtie') {
    const n = faceN(A.neck.n, 0.6);
    const m = new THREE.Mesh(SHAPES.bowtie(), MAT.satin);
    const s = clamp((A.W * 0.34) / 0.6, 0.8, 1.2);
    m.position.set(...vadd(A.neck.p, vmul(n, 0.07 * s))); m.quaternion.copy(basisQuat(n)); m.scale.setScalar(s); m.layers.enable(1);
    g.add(m);
  } else if (id === 'necktie') {
    const top = min(A.eyeY - 0.34, ny + 0.4), len = max(0.35, top - 0.1);
    const sh = new THREE.Shape();
    const w0 = 0.055, w1 = 0.1 * clamp(len / 0.6, 0.8, 1.3);
    sh.moveTo(-w0, -0.09); sh.lineTo(-w1, -len + 0.12); sh.lineTo(0, -len); sh.lineTo(w1, -len + 0.12); sh.lineTo(w0, -0.09); sh.lineTo(-w0, -0.09);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 4, steps: 1 });
    const tess = tessellate(geo, 5);
    conformGeo(tess, A, top, 0.045);
    const blade = new THREE.Mesh(tess, MAT.satin); blade.layers.enable(1); g.add(blade);
    const ks = new THREE.Shape(); ks.moveTo(-0.075, 0); ks.lineTo(0.075, 0); ks.lineTo(0.05, -0.1); ks.lineTo(-0.05, -0.1); ks.lineTo(-0.075, 0);
    const kg = tessellate(new THREE.ExtrudeGeometry(ks, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 4 }), 3);
    conformGeo(kg, A, top, 0.06);
    const knot = new THREE.Mesh(kg, MAT.satin); knot.layers.enable(1); g.add(knot);
  } else if (id === 'scarf' || id === 'pearls') {
    const yy = id === 'scarf' ? A.eyeY - 0.58 : A.eyeY - 0.36;
    const ring = A.ring(yy, 96);
    if (id === 'scarf') {
      const loop = smoothLoop(ring.map((q) => vadd(q.p, vmul(q.n, 0.06))), 4);
      const km = knitMaterial(s0.yarn, s0.yarnLight);
      const tube = new THREE.Mesh(knitTube(loop, 0.06, true, false, 1.9), km); tube.layers.enable(1); g.add(tube);
      // tail hanging at the front-right
      const st = ring.reduce((b, q) => (abs(q.a - 0.45) < abs(b.a - 0.45) ? q : b), ring[0]);
      const tail = [];
      for (let i = 0; i <= 10; i++) { const y = st.p[1] - 0.04 - i * 0.05; const h = A.front(st.p[0] + 0.012 * i, max(0.2, y)); if (h) tail.push(vadd(h.p, vmul(h.n, 0.085 + 0.004 * i))); }
      if (tail.length > 3) { const tm = new THREE.Mesh(knitTube(tail, 0.04, false, false, 2.6), km); tm.layers.enable(1); g.add(tm);
        const endp = tail[tail.length - 1]; for (let k = -3; k <= 3; k++) { const fr = tubeMesh([vadd(endp, [k * 0.022, 0, 0.0]), vadd(endp, [k * 0.026, -0.08, 0.01])], 0.009, km); g.add(fr); } }
    } else {
      // a necklace hangs: the strand dips into a soft U at the front
      const path = [];
      for (let i = 0; i <= 60; i++) {
        const a = -1.35 + (2.7 * i) / 60, y = yy - 0.2 * cos(a) ** 2;
        const q = march(A.sdf, [sin(a) * 4, y, cos(a) * 4], [-sin(a), 0, -cos(a)]);
        if (q) path.push(vadd(q, vmul(gradN(A.sdf, q), 0.06)));
      }
      // resample by arc length
      const pr = 0.042; let acc = 0; const pos = [path[0]];
      for (let i = 1; i < path.length; i++) { const d = vlen(vsub(path[i], path[i - 1])); acc += d; if (acc >= pr * 2.02) { pos.push(path[i]); acc = 0; } }
      const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(pr, 24, 16), MAT.beads, pos.length);
      const m4 = new THREE.Matrix4(); pos.forEach((p, i) => { inst.setMatrixAt(i, m4.makeTranslation(p[0], p[1], p[2])); });
      inst.layers.enable(1); g.add(inst);
    }
  }
  return g;
}
function tessellate(geo, iters) { // split long triangles so the shape bends with the surface
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (let k = 0; k < iters; k++) {
    const P = g.attributes.position.array, U = g.attributes.uv ? g.attributes.uv.array : null;
    const np = [], nu = [];
    for (let t = 0; t < P.length; t += 9) {
      const a = [P[t], P[t + 1], P[t + 2]], b = [P[t + 3], P[t + 4], P[t + 5]], c = [P[t + 6], P[t + 7], P[t + 8]];
      const ua = U ? [U[t / 3 * 2], U[t / 3 * 2 + 1]] : [0, 0], ub = U ? [U[t / 3 * 2 + 2], U[t / 3 * 2 + 3]] : [0, 0], uc = U ? [U[t / 3 * 2 + 4], U[t / 3 * 2 + 5]] : [0, 0];
      const lab = vlen(vsub(a, b)), lbc = vlen(vsub(b, c)), lca = vlen(vsub(c, a));
      const mx = max(lab, lbc, lca);
      if (mx < 0.05) { np.push(...a, ...b, ...c); nu.push(...ua, ...ub, ...uc); continue; }
      const mid = (p, q) => vmul(vadd(p, q), 0.5), mu = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      if (mx === lab) { const m = mid(a, b), m2 = mu(ua, ub); np.push(...a, ...m, ...c, ...m, ...b, ...c); nu.push(...ua, ...m2, ...uc, ...m2, ...ub, ...uc); }
      else if (mx === lbc) { const m = mid(b, c), m2 = mu(ub, uc); np.push(...a, ...b, ...m, ...a, ...m, ...c); nu.push(...ua, ...ub, ...m2, ...ua, ...m2, ...uc); }
      else { const m = mid(c, a), m2 = mu(uc, ua); np.push(...a, ...b, ...m, ...m, ...b, ...c); nu.push(...ua, ...ub, ...m2, ...m2, ...ub, ...uc); }
    }
    const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(np, 3)); ng.setAttribute('uv', new THREE.Float32BufferAttribute(nu, 2));
    if (g !== geo) g.dispose();
    g = ng;
  }
  geo.dispose();
  return g;
}

const ACC = {
  eyewear: { none: 'None', round: 'Round glasses', sunglasses: 'Round sunglasses', square: 'Square glasses', heart: 'Heart sunglasses', monocle: 'Monocle' },
  head: { none: 'None' },   // head and neck accessories removed (the founder: "remove all head and neck acessory")
  neck: { none: 'None' },
  mouth: { none: 'None', smile: 'Smile', oh: 'Oh', grin: 'Grin' },
};
const EYES = { bead: 'Bead', regular: 'Regular', sleepy: 'Sleepy' };

// ------------------------------------------------------------------ no backdrop; a very faint soft shadow under the cloud
const shadowBlob = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.9), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  vertexShader: 'varying vec2 vU; void main(){ vU = uv*2.-1.; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'varying vec2 vU; uniform float uA; void main(){ float r = length(vU); float a = uA*pow(max(0., 1.-r), 1.8); gl_FragColor = vec4(0., 0., 0., a); }',
  uniforms: { uA: { value: 0.07 } },
}));
shadowBlob.rotation.x = -PI / 2; shadowBlob.position.y = -0.02; scene.add(shadowBlob);

// ------------------------------------------------------------------ colour
const colorScheme = scheme;
function setColor(id) {
  const s = colorScheme(id);
  const pal = feltMat.uniforms.uPal.value;
  pal[0].copy(lin(s.fur)); pal[1].copy(lin(s.furLight)); pal[2].copy(lin(s.furDark)); pal[3].copy(lin(s.brow));
  const pc = pomCoreMat.uniforms.uPal.value; for (const c of pc) c.copy(lin(s.yarn));
  const sp = strandUniforms.uPal.value;
  sp[REG.fur].copy(lin(s.fur)); sp[REG.light].copy(lin(s.furLight)); sp[REG.dark].copy(lin(s.furDark)); sp[REG.brow].copy(lin(s.brow));
  sp[REG.yarn].copy(lin(s.yarn)); sp[REG.yarnFuzz].copy(lin(mixS(s.yarn, s.yarnLight, 0.7)));
  sp[REG.fly].copy(lin(mixS(s.fur, s.furLight, 0.55))); sp[REG.tuft].copy(lin(s.fur));
  const [gt, gm, gb] = s.grad;
  GRAD.uGradTop.value.set(...gt); GRAD.uGradMid.value.set(...gm); GRAD.uGradBot.value.set(...gb);
  // soft, even studio: the hue stays clean (only a touch lighter top-left, a touch deeper underneath)
  SH.uGroundCol.value.copy(lin(s.bg)).multiplyScalar(0.46);
  SH.uSkyCol.value.copy(lin(mixS(s.bg, [1, 1, 1], 0.55))).multiplyScalar(0.62);
  return s;
}

// ------------------------------------------------------------------ character state
const cur = { form: null, color: null, eyes: null, rig: null, acc: {}, keys: {} };
const accCache = new Map();
function cached(key, make) {
  if (accCache.has(key)) { const v = accCache.get(key); accCache.delete(key); accCache.set(key, v); return v; }
  const v = make(); accCache.set(key, v);
  while (accCache.size > 36) {
    const [k, old] = accCache.entries().next().value;
    if (Object.values(cur.keys).includes(k)) { accCache.delete(k); accCache.set(k, old); break; }
    accCache.delete(k); if (old) (old.dispose ? old.dispose() : disposeTree(old.group || old));
  }
  return v;
}
function purgeFor(formId) {
  for (const [k, v] of [...accCache.entries()]) if (k.includes(`|${formId}|`) && !Object.values(cur.keys).includes(k)) { accCache.delete(k); if (v) (v.dispose ? v.dispose() : disposeTree(v.group || v)); }
}
function applySync(cfg) {
  const f = buildForm(cfg.form);
  if (cur.form !== f) {
    if (cur.form) bodyBone.remove(cur.form.feltM), scene.remove(cur.form.shortM, cur.form.longM);
    bodyBone.add(f.feltM); scene.add(f.shortM, f.longM);
    cur.form = f;
    const A = f.A, W = A.W;
    GRAD.uGradBox.value.set(-W / 2, W, A.H + 0.05);
  }
  cur.color = cfg.color;
  const s = setColor(cfg.color);
  const A = f.A;
  const sw = (slot, key, make) => {
    if (cur.keys[slot] === key) return cur.acc[slot];
    if (cur.acc[slot]) (cur.acc[slot].group || cur.acc[slot]).removeFromParent();
    const v = key ? cached(key, make) : null;
    if (v) bodyBone.add(v.group || v);
    cur.keys[slot] = key; cur.acc[slot] = v;
    return v;
  };
  const rig = sw('eyes', `eyes|${cfg.form}|${cfg.eyes}`, () => makeEyes(cfg.eyes, A));
  cur.rig = rig;
  sw('mouth', cfg.mouth !== 'none' ? `mouth|${cfg.form}|${cfg.mouth}` : null, () => makeMouth(cfg.mouth, A, rig));
  sw('eyewear', cfg.eyewear !== 'none' ? `eyewear|${cfg.form}|${cfg.eyewear}|${cfg.eyes}` : null, () => eyewear(cfg.eyewear, A, rig));
  const yarnDep = ['beanie', 'cap'].includes(cfg.head) ? s.yarn.join(',') : '';
  sw('head', cfg.head !== 'none' ? `head|${cfg.form}|${cfg.head}|${yarnDep}` : null, () => headwear(cfg.head, A, rig));
  sw('neck', cfg.neck !== 'none' ? `neck|${cfg.form}|${cfg.neck}|${cfg.neck === 'scarf' ? s.yarn.join(',') : ''}` : null, () => neckwear(cfg.neck, A, rig));
  // pom-pom bone placement is recomputed from the head accessory
  const head = cur.acc.head;
  pomStrandM.visible = !!(head && head.userData.pom);
  if (pomStrandM.visible) { const core = head.children.find((o) => o.geometry === pomCoreGeo) || head; pomBone.position.copy(core.position); pomBone.scale.copy(core.scale); pomBone.userData.base = core.position.clone(); }
  lidStrandM.visible = false;
  // fur holes
  const holes = [...rig.holes];
  if (cur.acc.mouth && cur.acc.mouth.userData.hole) holes.push(cur.acc.mouth.userData.hole);
  strandUniforms.uHoles.value.forEach((h, i) => (holes[i] ? h.set(...holes[i]) : h.set(0, 0, 0, -10)));
  Object.assign(state, cfg);
}

// ------------------------------------------------------------------ animation: the app's engine on the felt cloud
// d_engine.js runs the app's own state machine (in the app's px); here its output drives the 3D rig:
//   the app's roll (deg)          -> the cloud rolls about the view axis, around its centre
//   the app's x / y offset (px)   -> the cloud translates (the app's px scaled to the cloud's width)
//   the app's y scale             -> squash / stretch (height only, like the app)
//   the app's turn (spins, the half turn into and out of a morph) -> the cloud turns about its vertical axis
//   the app's morph into a dot    -> the felt slides onto a ball (the pencil: the app's teardrop) and shrinks
//   the app's eye frames          -> bead / regular / sleepy eyes (see makeEyes)
//   the app's effects             -> felt dots, felt rings, the pencil and the "!" in 3D (fxRoot); comet belts and
//                                    confetti on two 2D layers behind / in front of the canvas, like the app's SVG layers
let anim = { gaze: { yaw: 0, pitch: 0 }, target: { yaw: 0, pitch: 0 }, hopT: -9 };
const _m4 = new THREE.Matrix4(), _m4b = new THREE.Matrix4(), _v3 = new THREE.Vector3();
function markFrame(A) { // app px -> form units, and the body centre (the app scales and rotates about its centre)
  return { k: A.W / 2 / MARK_GEO.halfW, C: [0, (A.base + A.H) / 2, 0] };
}
function morphPoint(p, C, R, m, tear) { // the shader's morph, on the CPU (eyes, mouth, glasses ride on the surface)
  if (m <= 0) return p;
  const d = vsub(p, C), l = vlen(d) || 1, u = vmul(d, 1 / l);
  let t = R;
  if (tear > 0) {
    const a = vadd(C, [0, 0.228 * R, 0]), b = vsub(C, [0, 0.86 * R, 0]), r1 = 0.77 * R, r2 = 0.14 * R;
    const sd = (q) => { // round cone, iq
      const ba = vsub(b, a), l2 = vdot(ba, ba), rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2, pa = vsub(q, a), y = vdot(pa, ba), z = y - l2;
      const xv = vsub(vmul(pa, l2), vmul(ba, y)), x2 = vdot(xv, xv), y2 = y * y * l2, z2 = z * z * l2, kk = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(z) * a2 * z2 > kk) return sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(y) * a2 * y2 < kk) return sqrt(x2 + y2) * il2 - r1;
      return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
    };
    let lo = 0, hi = 1.7 * R; for (let i = 0; i < 14; i++) { const mm = 0.5 * (lo + hi); if (sd(vadd(C, vmul(u, mm))) < 0) lo = mm; else hi = mm; }
    t = R + (0.5 * (lo + hi) - R) * tear;
  }
  return vadd(p, vmul(vsub(vadd(C, vmul(u, t)), p), m));
}
function hopPose(ht) { // the page's click hop: squash on the press, spring up, settle
  let sx = 1, sy = 1, hop = 0, squeeze = 0;
  if (ht >= 0 && ht < 1.1) {
    if (ht < 0.12) { const k = sin((ht / 0.12) * PI / 2); sy *= 1 - 0.17 * k; sx *= 1 + 0.09 * k; }
    else if (ht < 0.42) { const u = (ht - 0.12) / 0.3; const k = cos(u * PI / 2); sy *= 1 - 0.17 * k + 0.07 * sin(u * PI); sx *= 1 + 0.09 * k - 0.035 * sin(u * PI); hop = 0.07 * sin(u * PI); }
    else { const u = (ht - 0.42) / 0.68; const k = Math.exp(-u * 4) * sin(u * PI * 3); sy *= 1 - 0.035 * k; sx *= 1 + 0.02 * k; }
    squeeze = ht < 0.08 ? sstep(0, 0.08, ht) : 1 - sstep(0.38, 0.52, ht);
  }
  return { sx, sy, hop, squeeze };
}
function applyMark(sim, time, dt, still) {
  if (!cur.form) return;
  const A = cur.form.A, { k, C } = markFrame(A), o = sim.out, b = o.body;
  const hp = still ? { sx: 1, sy: 1, hop: 0, squeeze: 0 } : hopPose(time - anim.hopT);
  const R = 114.2705 * k;
  MORPH.uMorph.value = b.shape; MORPH.uTear.value = b.tear; longMat.uniforms.uOpacity.value = 1 - 0.9 * b.shape; MORPH.uMorphC.value.set(...C); MORPH.uMorphR.value = R; MORPH.uBodyFade.value = clamp(b.op, 0, 1);
  // body: T(centre + offset) . roll . turn . scale . T(-centre)
  bodyBone.matrixAutoUpdate = false;
  const sx = b.sx * hp.sx, sy = b.sy * hp.sy;
  _m4.makeTranslation(-C[0], -C[1], -C[2]);
  _m4.premultiply(_m4b.makeScale(sx, sy, sx));
  _m4.premultiply(_m4b.makeRotationY(b.turn));
  _m4.premultiply(_m4b.makeRotationZ((-b.rot * PI) / 180));
  _m4.premultiply(_m4b.makeTranslation(C[0] + b.x * k, C[1] - b.y * k, C[2]));
  bodyBone.matrix.copy(_m4); bodyBone.matrixWorldNeedsUpdate = true;
  // the page's own touches: the click hop, and the whole cloud turning toward the pointer
  charRoot.position.y = hp.hop;
  if (still) { anim.gaze.yaw = anim.target.yaw; anim.gaze.pitch = anim.target.pitch; }
  else { const kk = min(1, dt * 6); anim.gaze.yaw += (anim.target.yaw - anim.gaze.yaw) * kk; anim.gaze.pitch += (anim.target.pitch - anim.gaze.pitch) * kk; }
  const w = 1 - b.morph;
  charRoot.rotation.set(-anim.gaze.pitch * 0.32 * w, anim.gaze.yaw * 0.62 * w, -anim.gaze.yaw * 0.1 * w, 'YXZ');
  // eyes, and what rides on the face (mouth, glasses): on the morphing surface, hidden once the cloud is a dot
  const M = { eyes: o.eyes, eyesOn: o.eyesOn, squeeze: hp.squeeze, morphP: (p) => morphPoint(p, C, R, b.shape, b.tear) };
  if (cur.rig) {
    cur.rig.group.visible = o.eyesOn;
    cur.rig.update(time, { yaw: anim.gaze.yaw * 0.45, pitch: anim.gaze.pitch * 0.5 }, M);
    lidStrandM.visible = !!(cur.rig.lids && cur.rig.lidsVisible && o.eyesOn);
    const holes = [...cur.rig.holes];
    if (cur.acc.mouth && cur.acc.mouth.userData.hole) holes.push(cur.acc.mouth.userData.hole);
    strandUniforms.uHoles.value.forEach((h, i) => (holes[i] ? h.set(...holes[i]) : h.set(0, 0, 0, -10)));
    const ew = cur.acc.eyewear;
    if (ew) { // glasses follow the eyes' average slide
      const e0 = A.eyes, mid = vmul(vadd(e0[0].p, e0[1].p), 0.5), E = cur.rig.eyes;
      const dx = (E[0].look[0] - E[0].rest[0] + E[1].look[0] - E[1].rest[0]) / 2, dy = (E[0].look[1] - E[0].rest[1] + E[1].look[1] - E[1].rest[1]) / 2;
      const h0 = faceSampler(A)(mid[0], mid[1]), h1 = faceSampler(A)(mid[0] + dx, mid[1] + dy);
      const d = [dx, dy, h0 && h1 ? h1.p[2] - h0.p[2] : 0], mp = M.morphP(vadd(mid, d));
      ew.position.set(...vsub(mp, mid)); ew.visible = o.eyesOn;
    }
  }
  const mouth = cur.acc.mouth;
  if (mouth && A.mouth) { mouth.position.set(...vsub(M.morphP(A.mouth.p), A.mouth.p)); mouth.visible = o.eyesOn; }
  updateFx(o, k, C, A);
}

// ------------------------------------------------------------------ the effects around the character
const fxRoot = new THREE.Group(); scene.add(fxRoot);
const fxBallGeo = feltGeo(new THREE.SphereGeometry(1, 40, 28));
const fxRingGeo = feltGeo(new THREE.TorusGeometry(1, 0.5, 14, 160));
const fxShaftGeo = feltGeo(new THREE.CapsuleGeometry(15, 58, 10, 32));
const fxBangGeo = (() => { // the app's "!" bar: 30 px wide at the top, 17 at the bottom, 96 tall, round ends
  const pr = [], r1 = 8.5, r2 = 15, y1 = -48 + r1, y2 = 48 - r2;
  for (let i = 0; i <= 10; i++) { const a = -PI / 2 + (i / 10) * (PI / 2); pr.push(new THREE.Vector2(max(1e-3, r1 * cos(a)), y1 + r1 * sin(a))); }
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * (PI / 2); pr.push(new THREE.Vector2(max(1e-3, r2 * cos(a)), y2 + r2 * sin(a))); }
  return feltGeo(new THREE.LatheGeometry(pr, 40));
})();
for (const g of [fxBallGeo, fxRingGeo, fxShaftGeo, fxBangGeo]) g.userData.shared = true;
function fxMaterial(solid) {
  const m = new THREE.ShaderMaterial({
    vertexShader: FX_VS, fragmentShader: FX_FS,
    uniforms: { ...SH, uGradTop: GRAD.uGradTop, uGradMid: GRAD.uGradMid, uGradBot: GRAD.uGradBot, uGradBox: GRAD.uGradBox, uGradM: { value: new THREE.Matrix4() },
      uGradOn: { value: solid ? 0 : 1 }, uPal: solid ? { value: [new THREE.Color(...solid), new THREE.Color(), new THREE.Color(), new THREE.Color()] } : feltMat.uniforms.uPal,
      uFeltFreq: { value: 95 }, uBump: { value: 0.0045 }, uSheen: { value: 0.55 }, uWrap: { value: 0.5 }, uAOAmt: { value: 1 }, uOp: { value: 1 }, uRing: { value: new THREE.Vector4(1, 0.1, 2 * PI, 0) } },
    transparent: true, depthWrite: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  return m;
}
const FXP = { ball: [], ring: [], shaft: null, bang: null, trail: null, badge: null, badgeRim: null };
function fxMesh(geo, ext, solid) { const m = new THREE.Mesh(geo, fxMaterial(solid)); m.userData.ext = ext; m.renderOrder = 20; m.visible = false; m.frustumCulled = false; fxRoot.add(m); return m; }
for (let i = 0; i < 12; i++) FXP.ball.push(fxMesh(fxBallGeo, 1));
for (let i = 0; i < 6; i++) { const r = fxMesh(fxRingGeo, 1); r.material.uniforms.uRing.value.w = 1; FXP.ring.push(r); }
FXP.shaft = fxMesh(fxShaftGeo, 44); FXP.bang = fxMesh(fxBangGeo, 48); FXP.trail = fxMesh(new THREE.BufferGeometry(), 70);
FXP.badge = fxMesh(fxBallGeo, 1, lin(hex3('#1d9bf0')).toArray()); FXP.badgeRim = fxMesh(fxRingGeo, 1, [1, 1, 1]); FXP.badgeRim.material.uniforms.uRing.value.w = 1;
bodyBone.add(FXP.badge, FXP.badgeRim);
let trailKey = '';
function setOp(m, op) { m.material.uniforms.uOp.value = clamp(op, 0, 1); m.material.depthWrite = op > 0.6; m.visible = op > 0.004; }
function updateFx(o, k, C, A) {
  fxRoot.position.set(...C); fxRoot.scale.setScalar(k);
  let nb = 0, nr = 0; let shaft = false, bang = false, trail = false, badge = false;
  for (const p of o.prims) {
    if (p.k === 'ball' && nb < FXP.ball.length) { const m = FXP.ball[nb++]; m.position.set(p.x, -p.y, p.z || 0); m.scale.setScalar(Math.max(p.r, 0.01)); setOp(m, p.op); m.userData.ext = 1; }
    else if (p.k === 'ring' && nr < FXP.ring.length) { const m = FXP.ring[nr++]; m.position.set(p.x, -p.y, nr * 0.4); m.scale.setScalar(1); m.material.uniforms.uRing.value.set(p.r, Math.max(p.w / 2, 0.05), 2 * PI * clamp(p.arc, 0, 1), 1); m.userData.ext = p.r + p.w; setOp(m, p.arc > 0.001 ? p.op : 0); }
    else if (p.k === 'shaft') { const m = FXP.shaft; m.position.set(p.x, -p.y, 0); m.rotation.z = (-p.rot * PI) / 180; m.scale.setScalar(Math.max(p.s, 0.01)); setOp(m, p.op); shaft = true; }
    else if (p.k === 'bang') { const m = FXP.bang, w = (p.wob * PI) / 180; m.position.set(-74 * sin(w), -(74 * cos(w) - 74 + p.y), 0); m.rotation.z = -w; m.scale.setScalar(Math.max(p.s, 0.01)); setOp(m, p.op); bang = true; }
    else if (p.k === 'trail') {
      const key = p.pts.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(';');
      if (key !== trailKey) {
        trailKey = key; const old = FXP.trail.geometry;
        const pts = p.pts.map((q) => new THREE.Vector3(q[0], -q[1], 0));
        FXP.trail.geometry = feltGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), Math.max(8, pts.length * 3), p.w / 2, 8, false));
        old.dispose();
      }
      setOp(FXP.trail, p.op); trail = true;
    } else if (p.k === 'badge') { // the notification dot on the body's top-right edge, white-ringed like the app's
      const x = p.x * k, y = C[1] - p.y * k, h = A.front(x * 0.93, C[1] + (y - C[1]) * 0.93), z = h ? h.p[2] + 0.02 : 0.3;
      const r = p.r * k;
      FXP.badge.position.set(x, y, z); FXP.badge.scale.set(r * 0.86, r * 0.86, r * 0.5); setOp(FXP.badge, 1);
      FXP.badgeRim.position.set(x, y, z); FXP.badgeRim.material.uniforms.uRing.value.set(r, 3 * k, 2 * PI, 1); FXP.badgeRim.userData.ext = r; setOp(FXP.badgeRim, 1);
      badge = true;
    }
  }
  for (let i = nb; i < FXP.ball.length; i++) FXP.ball[i].visible = false;
  for (let i = nr; i < FXP.ring.length; i++) FXP.ring[i].visible = false;
  if (!shaft) FXP.shaft.visible = false; if (!bang) FXP.bang.visible = false; if (!trail) FXP.trail.visible = false;
  if (!badge) FXP.badge.visible = FXP.badgeRim.visible = false;
}
const _gm = new THREE.Matrix4(), _gm2 = new THREE.Matrix4();
function fxGradients() { // each effect wears the whole body gradient over its own extent, like the body's dot
  const bx = GRAD.uGradBox.value;
  const map = _gm2.makeTranslation(bx.x + bx.y / 2, bx.z / 2, 0).multiply(_gm.makeScale(bx.y / 2, bx.z / 2, 1));
  for (const m of [...FXP.ball, ...FXP.ring, FXP.shaft, FXP.bang, FXP.trail]) {
    if (!m.visible) continue;
    const ext = m.userData.ext || 1;
    const ref = new THREE.Matrix4().copy(m.matrixWorld).multiply(_gm.makeScale(ext, ext, ext));
    m.material.uniforms.uGradM.value.copy(map).multiply(ref.invert());
  }
}

// ---- comet belts and confetti: two 2D layers, behind and in front of the canvas (the app's back / front SVG groups)
const _pv = new THREE.Vector3();
function drawLayers(sim, w, h, ctxB, ctxF) { // either context may be null (the video grab draws one layer at a time)
  if (!cur.form || !sim) return;
  const { k, C } = markFrame(cur.form.A);
  const dist = camera.position.distanceTo(_pv.set(...C)), ppu = h / (2 * dist * Math.tan((camera.fov * PI) / 360)), pxs = k * ppu; // screen px per app px
  const proj = (x, y, z) => { _pv.set(C[0] + x * k, C[1] - y * k, C[2] + z * k).project(camera); return [(_pv.x * 0.5 + 0.5) * w, (0.5 - _pv.y * 0.5) * h]; };
  for (const j of sim.parts.m) {
    if (j.orbit) {
      const A = j.hist; if (A.length < 2) continue;
      const pts = A.map((q) => { const [x, y, z] = MarkParticles.at(j.orbit, q.l); const s = proj(x, y, z); return { x: s[0], y: s[1], z }; });
      const { front, back } = ribbon(pts, j.w * pxs);
      const g0 = pts[0], g1 = pts[pts.length - 1];
      for (const [polys, cx] of [[back, ctxB], [front, ctxF]]) {
        if (!polys.length || !cx) continue;
        const gr = cx.createLinearGradient(g0.x, g0.y, g1.x, g1.y);
        for (let s = 0; s < 5; s++) { const P = s / 4, hh = j.hue0 + P * j.hueSpan; gr.addColorStop(P, `hsl(${(((hh % 360) + 360) % 360).toFixed(0)} 56% ${(56 + 11 * P).toFixed(0)}%)`); }
        cx.globalAlpha = j.op; cx.fillStyle = gr; for (const poly of polys) cx.fill(poly); cx.globalAlpha = 1;
      }
    } else { // confetti: dots, streaks and little stars, behind the character
      const [sx, sy] = proj(j.x, j.y, 0), r = j.sz * pxs, cx = ctxB;
      if (!cx) continue;
      cx.globalAlpha = clamp(j.op, 0, 1); cx.fillStyle = j.color;
      cx.save(); cx.translate(sx, sy);
      if (j.star) { cx.rotate((j.rot * PI) / 180); cx.beginPath(); for (let e = 0; e < 10; e++) { const t = -PI / 2 + (e * PI) / 5, s = e % 2 === 0 ? 1 : 0.42; e ? cx.lineTo(cos(t) * s * r, sin(t) * s * r) : cx.moveTo(cos(t) * s * r, sin(t) * s * r); } cx.closePath(); cx.fill(); }
      else if (j.round) { cx.beginPath(); cx.arc(0, 0, r, 0, 2 * PI); cx.fill(); }
      else { const sp = Math.hypot(j.vx, j.vy), ww = Math.max(j.sz * 2, Math.min(sp * 0.05, 30)) * pxs, hh = j.sz * 1.5 * pxs; cx.rotate(Math.atan2(j.vy, j.vx)); cx.beginPath(); cx.roundRect(-ww / 2, -hh / 2, ww, hh, hh / 2); cx.fill(); }
      cx.restore(); cx.globalAlpha = 1;
    }
  }
}
function ribbon(W, H) { // the app's comet ribbon: widening toward the head, round head, split where it passes behind
  const G = W.length; let Y = 0;
  for (let i = 1; i < G; i++) Y += Math.hypot(W[i].x - W[i - 1].x, W[i].y - W[i - 1].y);
  if (Y < 2) return { front: [], back: [] };
  const U = Math.min(H, Y * 0.34), ex = [], ey = [];
  for (let i = 0; i < G; i++) {
    const a = W[i > 0 ? i - 1 : 0], b = W[i < G - 1 ? i + 1 : G - 1]; let dx = b.x - a.x, dy = b.y - a.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const f = (U * (0.5 + 0.5 * (i / (G - 1)))) / 2; ex.push(-dy * f); ey.push(dx * f);
  }
  const seg = (s, e) => {
    const p = new Path2D();
    for (let i = s; i <= e; i++) i === s ? p.moveTo(W[i].x + ex[i], W[i].y + ey[i]) : p.lineTo(W[i].x + ex[i], W[i].y + ey[i]);
    if (e === G - 1) { const r = Math.max(Math.hypot(ex[e], ey[e]), 0.2), a0 = Math.atan2(ey[e], ex[e]); p.arc(W[e].x, W[e].y, r, a0, a0 - PI, true); }
    for (let i = e; i >= s; i--) p.lineTo(W[i].x - ex[i], W[i].y - ey[i]);
    if (s === 0) { const r = Math.max(Math.hypot(ex[0], ey[0]), 0.2), a0 = Math.atan2(-ey[0], -ex[0]); p.arc(W[0].x, W[0].y, r, a0, a0 - PI, true); }
    p.closePath(); return p;
  };
  const front = [], back = [];
  for (let s = 0; s < G;) {
    const fr = W[s].z >= 0; let q = s;
    while (q + 1 < G && W[q + 1].z >= 0 === fr) q++;
    const a = Math.max(s - 1, 0), c = Math.min(q + 1, G - 1);
    if (c > a) (fr ? front : back).push(seg(a, c));
    s = q + 1;
  }
  return { front, back };
}

// ------------------------------------------------------------------ render
const tmpM = new THREE.Matrix4();
function lod(heightPx) {
  const t = KNOBS.tiers.find((x) => heightPx >= x.minPx) || KNOBS.tiers[KNOBS.tiers.length - 1];
  const geos = [...(cur.form ? cur.form.strandGeos : []), lidStrandGeo, pomStrandGeo];
  for (const g of geos) g.instanceCount = Math.max(1, Math.floor(g.userData.total * t.frac));
  // a lighter coat (?coat=, used for the video) keeps the same cover: fewer, proportionally wider fibres
  strandUniforms.uWidthScale.value = Math.pow(1 / (t.frac * min(1, KNOBS.budget.coat / 48000)), 0.55);
  if (cur.form) cur.form.longM.visible = t.frac * min(1, KNOBS.budget.coat / 48000) > 0.025; // the site grows half the coat (pre.js)
  return t.name;
}
function renderView(x, y, w, h) {
  camera.aspect = w / h; camera.position.set(...CAM.pos); camera.lookAt(...CAM.tgt); camera.updateProjectionMatrix();
  scene.updateMatrixWorld(true);
  fxGradients();
  SH.uCamPos.value.copy(camera.position);
  const rig = cur.rig;
  const bones = [bodyBone, pomBone, ...(rig && rig.lids ? [rig.eyes[0].upper, rig.eyes[1].upper, rig.eyes[0].lower, rig.eyes[1].lower] : lidBones)];
  for (let i = 0; i < 6; i++) strandUniforms.uBones.value[i].copy(bones[i].matrixWorld);
  GRAD.uGradM.value.copy(bodyBone.matrixWorld).invert();
  if (rig) for (const e of rig.eyes) if (e.eyeball) {
    tmpM.copy(e.eyeball.matrixWorld).invert();
    e.mat.uniforms.uCamLocal.value.copy(camera.position).applyMatrix4(tmpM).divideScalar(ER);
    e.mat.uniforms.uLidInv.value.copy(e.upper.matrixWorld).invert();
    e.mat.uniforms.uLowInv.value.copy(e.lower.matrixWorld).invert();
  }
  if (rig) for (const e of rig.eyes) if (e.bead) {
    tmpM.copy(e.bead.matrixWorld).invert();
    e.bead.material.uniforms.uCamLocal.value.copy(camera.position).applyMatrix4(tmpM);
  }
  const dist = camera.position.distanceTo(new THREE.Vector3(...CAM.tgt));
  const hPx = (2.2 / (2 * dist * Math.tan((camera.fov * PI) / 360))) * h * renderer.getPixelRatio();
  const tier = lod(hPx);
  strandUniforms.uViewH.value = h * renderer.getPixelRatio();
  const kd = SH.uKeyDir.value;
  shadowCam.position.set(kd.x * 9, 1.2 + kd.y * 9, kd.z * 9); shadowCam.lookAt(0, 1.2, 0); shadowCam.updateMatrixWorld(true);
  SH.uShadowMat.value.multiplyMatrices(shadowCam.projectionMatrix, shadowCam.matrixWorldInverse);
  scene.overrideMaterial = depthMat;
  renderer.setRenderTarget(shadowRT); renderer.clear(); renderer.render(scene, shadowCam);
  scene.overrideMaterial = null; renderer.setRenderTarget(null);
  renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h); renderer.setScissorTest(true);
  renderer.render(scene, camera);
  renderer.setScissorTest(false);
  return tier;
}
