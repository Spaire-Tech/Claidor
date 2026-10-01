// Simeon's felt clouds on simeonlabs.com (public/clouds.js, written by build.py from this folder).
//
// The character is the approved felt "flower cloud" (Simeon Forms, three.js 0.170.0): a_utils.js,
// b_mesh.js, c_glsl.js, d_markdata.js and d_engine.js are its parts as approved, unchanged; e_felt.js is
// its main.js up to the render function (form, fur, bead eyes, the app's states and their effects),
// with the page's own canvas, UI and loop left out. site.js places a few clouds around the page
// and draws them all with the one renderer.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const Q = new URLSearchParams(); // the forms page's query knobs: none on the site
const qnum = (k, d) => d;
const KNOBS = {
  pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  shadowSize: 1024,          // the forms page: 2048, for a cloud filling the screen
  shortSegments: 3,
  longSegments: 10,
  cell: 0.02,
  furLen: 0.056,
  // Half the forms page's coat and fly-aways are grown (it is only ever drawn small here); the tiers are doubled to
  // match, so each size draws exactly as many strands, as wide, as the forms page does at that size.
  budget: { coat: 24000, fly: 1300, lidCoat: 2000, lowerLid: 450, pom: 2600 },
  tiers: [
    { name: 'large', minPx: 330, frac: 1.0 },
    { name: 'medium', minPx: 160, frac: 0.44 },
    { name: 'small', minPx: 70, frac: 0.16 },
    { name: 'tiny', minPx: 0, frac: 0.06 },
  ],
};
// ------------------------------------------------------------------ palette
// the app's 12 character palettes, as the app has them: [label, top, mid (at 55%), bottom]
const PAL = {
  yellow:  ['Dusk',   '#8b8bea', '#f7a1b3', '#ffb98a'],
  cyan:    ['Sage',   '#2f6f72', '#6e9c95', '#b8d1c5'],
  violet:  ['Lagoon', '#7cc0e0', '#d7a9dc', '#2b4c92'],
  red:     ['Ember',  '#ff9a76', '#ffd0a0', '#6b3e8f'],
  green:   ['Moss',   '#6f8f4f', '#a8c58a', '#dfeacb'],
  brown:   ['Sand',   '#f6e2c4', '#f2b48b', '#c6754e'],
  magenta: ['Berry',  '#e07aa8', '#f4b7d0', '#3e2a7a'],
  blue:    ['Ocean',  '#1f3b73', '#3c7fb7', '#7fd4d0'],
  gray:    ['Rose',   '#f6c1c7', '#f0a4b8', '#8f5c86'],
  black:   ['Slate',  '#8c9db8', '#5e6d86', '#d9dfe8'],
  orange:  ['Peach',  '#ffd1a6', '#ffb0a3', '#e56f8f'],
  mint:    ['Mint',   '#bff0e2', '#8fd3c3', '#3c8a86'],
};
const hex3 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const mixS = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const toHex = (c) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
// no solid colours: every colour is a gradient (kept empty so the swatch code below stays unchanged)
const SOLID = {};
for (const [id, [label, look, hex]] of Object.entries(SOLID)) {
  const c = hex3(hex);
  PAL[id] = [label, toHex(mixS(c, [1, 1, 1], 0.04)), hex, toHex(mixS(c, [0, 0, 0], 0.05))];
  PAL[id].solid = look;
}
const palCss = (id) => { const [, a, b, c] = PAL[id]; return PAL[id].solid ? PAL[id].solid : `linear-gradient(171.5deg, ${a} 0%, ${b} 55%, ${c} 100%)`; };
const lumS = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const desatS = (c, t) => { const l = lumS(c); return c.map((v) => v + (l - v) * t); };
const lin = (c) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);

function scheme(id) {
  const [, top, mid, bot] = PAL[id].slice(0).map((v, i) => (i ? hex3(v) : v));
  const avg = mixS(mixS(top, bot, 0.5), mid, 0.5);
  const fur = mid;                                              // flat stand-in; the coat itself is the gradient
  const furLight = mixS(mid, hex3('#FFF6EA'), 0.6);
  const furDark = mixS(avg, [0, 0, 0], 0.52);
  const brow = mixS(avg, [0, 0, 0], 0.22);
  // every accessory is plain black now (knit, pom-poms)
  const yarn = [0.075, 0.075, 0.085];
  const yarnLight = [0.16, 0.16, 0.175];
  const bg = hex3('#EEF1F5');
  return { fur, furLight, furDark, brow, yarn, yarnLight, bg, grad: [top, mid, bot] };
}

// ------------------------------------------------------------------ small math / rng
const { sqrt, abs, min, max, sin, cos, atan2, PI } = Math;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const v3 = (x, y, z) => [x, y, z];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vmul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vlen = (a) => sqrt(vdot(a, a));
const vnorm = (a) => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// smooth 3D value noise (for fur flow / clumping fields)
function hash3(i, j, k) { let h = (i * 374761393 + j * 668265263 + k * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  const fx = x - i, fy = y - j, fz = z - k;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash3(i, j, k), hash3(i + 1, j, k), ux), L(hash3(i, j + 1, k), hash3(i + 1, j + 1, k), ux), uy),
           L(L(hash3(i, j, k + 1), hash3(i + 1, j, k + 1), ux), L(hash3(i, j + 1, k + 1), hash3(i + 1, j + 1, k + 1), ux), uy), uz);
}
// felted wool is not combed: fibres swirl in coherent patches. Returns [swirl angle, lean mult, length mult]
function woolField(p) {
  const a = vnoise(p[0] * 9 + 3.1, p[1] * 9, p[2] * 9) * 0.65 + vnoise(p[0] * 23, p[1] * 23 + 7.7, p[2] * 23) * 0.35;
  const b = vnoise(p[0] * 17 + 11, p[1] * 17, p[2] * 17 + 5);
  const c = vnoise(p[0] * 31, p[1] * 31 + 2, p[2] * 31 + 9);
  return [(a - 0.5) * 5.0, 0.75 + 0.6 * b, 0.7 + 0.6 * c];
}

// ------------------------------------------------------------------ SDF primitives
function sdSph(x, y, z, c, r) { const dx = x - c[0], dy = y - c[1], dz = z - c[2]; return sqrt(dx * dx + dy * dy + dz * dz) - r; }
function sdEll(x, y, z, c, r) {
  const px = (x - c[0]) / r[0], py = (y - c[1]) / r[1], pz = (z - c[2]) / r[2];
  const k0 = sqrt(px * px + py * py + pz * pz);
  const qx = px / r[0], qy = py / r[1], qz = pz / r[2];
  const k1 = sqrt(qx * qx + qy * qy + qz * qz);
  return k1 < 1e-9 ? -min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1;
}
function sdCap(x, y, z, a, b, r) {
  const pax = x - a[0], pay = y - a[1], paz = z - a[2];
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  let h = (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz);
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return sqrt(dx * dx + dy * dy + dz * dz) - r;
}
function sdRoundCone(qx, py, r1, r2, h) { // qx = radial distance from axis, py = along axis
  const b = (r1 - r2) / h, a = sqrt(1 - b * b);
  const k = qx * -b + py * a;
  if (k < 0) return sqrt(qx * qx + py * py) - r1;
  if (k > a * h) return sqrt(qx * qx + (py - h) * (py - h)) - r2;
  return qx * a + py * b - r1;
}
function smin(a, b, k) { const h = max(k - abs(a - b), 0) / k; return min(a, b) - h * h * k * 0.25; }
function smax(a, b, k) { return -smin(-a, -b, k); }
function boxDist(x, y, z, bb) { // distance to an AABB (0 inside) — a cheap lower bound
  const dx = max(bb[0] - x, 0, x - bb[3]), dy = max(bb[1] - y, 0, y - bb[4]), dz = max(bb[2] - z, 0, z - bb[5]);
  return sqrt(dx * dx + dy * dy + dz * dz);
}
// ------------------------------------------------------------------ surface nets
function surfaceNets(sdf, bmin, bmax, h) {
  const nx = Math.ceil((bmax[0] - bmin[0]) / h) + 1, ny = Math.ceil((bmax[1] - bmin[1]) / h) + 1, nz = Math.ceil((bmax[2] - bmin[2]) / h) + 1;
  const val = new Float32Array(nx * ny * nz);
  const C = 4, cx = Math.ceil((nx - 1) / C) + 1, cy = Math.ceil((ny - 1) / C) + 1, cz = Math.ceil((nz - 1) / C) + 1;
  const cv = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++)
    cv[i + cx * (j + cy * k)] = sdf(bmin[0] + i * C * h, bmin[1] + j * C * h, bmin[2] + k * C * h);
  const band = (C * h + 2.5 * h) * 1.7;
  for (let k = 0; k < nz; k++) {
    const z = bmin[2] + k * h, kc = min(Math.round(k / C), cz - 1);
    for (let j = 0; j < ny; j++) {
      const y = bmin[1] + j * h, jc = min(Math.round(j / C), cy - 1);
      for (let i = 0; i < nx; i++) {
        const ic = min(Math.round(i / C), cx - 1);
        const d0 = cv[ic + cx * (jc + cy * kc)];
        val[i + nx * (j + ny * k)] = abs(d0) > band ? d0 : sdf(bmin[0] + i * h, y, z);
      }
    }
  }
  const cnx = nx - 1, cny = ny - 1, cnz = nz - 1;
  const cell = new Int32Array(cnx * cny * cnz).fill(-1);
  const pos = [];
  const OFF = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const EDG = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const g = new Float32Array(8);
  for (let k = 0; k < cnz; k++) for (let j = 0; j < cny; j++) for (let i = 0; i < cnx; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const o = OFF[c]; const v = val[(i + o[0]) + nx * ((j + o[1]) + ny * (k + o[2]))]; g[c] = v; if (v < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDG) {
      if ((g[a] < 0) !== (g[b] < 0)) {
        const t = g[a] / (g[a] - g[b]);
        sx += OFF[a][0] + (OFF[b][0] - OFF[a][0]) * t; sy += OFF[a][1] + (OFF[b][1] - OFF[a][1]) * t; sz += OFF[a][2] + (OFF[b][2] - OFF[a][2]) * t; n++;
      }
    }
    cell[i + cnx * (j + cny * k)] = pos.length / 3;
    pos.push(bmin[0] + (i + sx / n) * h, bmin[1] + (j + sy / n) * h, bmin[2] + (k + sz / n) * h);
  }
  const CI = (i, j, k) => cell[i + cnx * (j + cny * k)];
  const idx = [];
  const quad = (a, b, c, d) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; idx.push(a, b, c, a, c, d); };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = i + nx * (j + ny * k), v0 = val[p] < 0;
    if (i < cnx && j > 0 && k > 0 && j < ny - 1 + 1 && (val[p + 1] < 0) !== v0) quad(CI(i, j - 1, k - 1), CI(i, j, k - 1), CI(i, j, k), CI(i, j - 1, k));
    if (j < cny && i > 0 && k > 0 && (val[p + nx] < 0) !== v0) quad(CI(i - 1, j, k - 1), CI(i, j, k - 1), CI(i, j, k), CI(i - 1, j, k));
    if (k < cnz && i > 0 && j > 0 && (val[p + nx * ny] < 0) !== v0) quad(CI(i - 1, j - 1, k), CI(i, j - 1, k), CI(i, j, k), CI(i - 1, j, k));
  }
  // project to surface and compute gradient normals
  const P = new Float32Array(pos), N = new Float32Array(pos.length);
  const e = h * 0.5;
  for (let v = 0; v < P.length; v += 3) {
    let x = P[v], y = P[v + 1], z = P[v + 2];
    for (let it = 0; it < 2; it++) {
      const d = sdf(x, y, z);
      let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
      const gl = sqrt(gx * gx + gy * gy + gz * gz) || 1; gx /= gl; gy /= gl; gz /= gl;
      if (it === 0) { const s = clamp(d, -h, h); x -= gx * s; y -= gy * s; z -= gz * s; }
      else { N[v] = gx; N[v + 1] = gy; N[v + 2] = gz; }
    }
    P[v] = x; P[v + 1] = y; P[v + 2] = z;
  }
  // orient triangles with the field gradient
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
    const s = fx * (N[a] + N[b] + N[c]) + fy * (N[a + 1] + N[b + 1] + N[c + 1]) + fz * (N[a + 2] + N[b + 2] + N[c + 2]);
    if (s < 0) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
  }
  return { P, N, idx: new Uint32Array(idx) };
}

function meshGeometry(m, extra) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.N, 3));
  for (const k in extra) g.setAttribute(k, new THREE.BufferAttribute(extra[k].array, extra[k].size));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ eyelid shell geometry (eye-local, blink axis = +x)
function lidGeometry(o) {
  // o: r0 inner radius, thick, bEdge (edge angle from +z toward +y), bBack, dir (+1 upper, -1 lower)
  const prof = [];
  const nO = 20, nL = 12, nI = 6, rMid = o.r0 + o.thick / 2, hr = o.thick / 2;
  for (let i = 0; i <= nO; i++) { const s = i / nO; const tap = Math.pow(sstep(0, 0.72, s), 0.8); prof.push({ r: o.r0 + 0.002 + (o.thick - 0.002) * tap, b: o.bBack + (o.bEdge - o.bBack) * s, fur: s > 0.12 ? 1 : 0 }); }
  for (let i = 1; i < nL; i++) { const ps = (PI * i) / nL; prof.push({ r: rMid + hr * cos(ps), b: o.bEdge - o.dir * (hr * sin(ps) * o.lip) / rMid, fur: ps < PI * 0.62 ? 1 : 0, lip: 1 }); }
  for (let i = 0; i <= nI; i++) { const s = i / nI; prof.push({ r: o.r0, b: o.bEdge + (o.bBack - o.bEdge) * s, fur: 0 }); }
  const nA = 56, a0 = 0.05;
  const pos = [], fur = [], lipA = [];
  for (let ia = 0; ia <= nA; ia++) {
    const a = a0 + (PI - 2 * a0) * (ia / nA), sa = sin(a);
    const pinch = Math.pow(sa, 0.55);
    const bOff = o.edgeCurve * (1 - sa);
    for (const p of prof) {
      const r = o.r0 + (p.r - o.r0) * pinch;
      const b = p.b + (p.b === o.bBack ? 0 : bOff * sstep(0.5, 0, abs(p.b - o.bEdge)));
      pos.push(r * cos(a), r * sa * sin(b), r * sa * cos(b));
      fur.push(p.fur); lipA.push(p.lip ? 1 : 0);
    }
  }
  const idx = [], np = prof.length;
  for (let ia = 0; ia < nA; ia++) for (let ip = 0; ip < np - 1; ip++) {
    const a = ia * np + ip, b = a + np;
    if (o.dir > 0) idx.push(a, b, a + 1, b, b + 1, a + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.setAttribute('aFur', new THREE.Float32BufferAttribute(fur, 1));
  g.setAttribute('aLip', new THREE.Float32BufferAttribute(lipA, 1));
  return g;
}

// ------------------------------------------------------------------ area sampling of roots
function makeSampler(pos, idx, weightFn) {
  const nT = idx.length / 3, cdf = new Float64Array(nT);
  let acc = 0;
  for (let t = 0; t < nT; t++) {
    const a = idx[3 * t] * 3, b = idx[3 * t + 1] * 3, c = idx[3 * t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const wx = pos[c] - pos[a], wy = pos[c + 1] - pos[a + 1], wz = pos[c + 2] - pos[a + 2];
    const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
    let area = 0.5 * sqrt(cx * cx + cy * cy + cz * cz);
    if (weightFn) area *= weightFn(idx[3 * t], idx[3 * t + 1], idx[3 * t + 2]);
    acc += area; cdf[t] = acc;
  }
  return (rng) => {
    const r = rng() * acc; let lo = 0, hi = nT - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < r) lo = m + 1; else hi = m; }
    let u = rng(), v = rng(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
    return { tri: lo, a: idx[3 * lo], b: idx[3 * lo + 1], c: idx[3 * lo + 2], u, v, w: 1 - u - v };
  };
}
const bary = (arr, size, s) => { const o = []; for (let k = 0; k < size; k++) o.push(arr[s.a * size + k] * s.w + arr[s.b * size + k] * s.u + arr[s.c * size + k] * s.v); return o; };

// ------------------------------------------------------------------ strand store
class StrandSet {
  constructor() { this.root = []; this.nrm = []; this.dir = []; this.shape = []; this.misc = []; this.curl = []; this.n = 0; }
  add(p, n, d, len, width, lean, bend, seed, region, ao, bone, amp, freq, alpha) {
    this.root.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.dir.push(d[0], d[1], d[2]);
    this.shape.push(len, width, lean, bend); this.misc.push(seed, region, ao, bone); this.curl.push(amp, freq, alpha);
    this.n++;
  }
  build(segments, rng) {
    // shuffle so any prefix is a uniform subsample (LOD by instanceCount)
    const n = this.n, perm = new Uint32Array(n);
    for (let i = 0; i < n; i++) perm[i] = i;
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    const pack = (src, size) => { const out = new Float32Array(n * size); for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) out[i * size + k] = src[perm[i] * size + k]; return out; };
    const g = new THREE.InstancedBufferGeometry();
    const tpos = [], tidx = [];
    for (let s = 0; s <= segments; s++) { const t = s / segments; tpos.push(t, -1, 0, t, 1, 0); }
    for (let s = 0; s < segments; s++) { const a = s * 2; tidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(tpos, 3));
    g.setIndex(tidx);
    g.setAttribute('iRoot', new THREE.InstancedBufferAttribute(pack(this.root, 3), 3));
    g.setAttribute('iNrm', new THREE.InstancedBufferAttribute(pack(this.nrm, 3), 3));
    g.setAttribute('iDir', new THREE.InstancedBufferAttribute(pack(this.dir, 3), 3));
    g.setAttribute('iShape', new THREE.InstancedBufferAttribute(pack(this.shape, 4), 4));
    g.setAttribute('iMisc', new THREE.InstancedBufferAttribute(pack(this.misc, 4), 4));
    g.setAttribute('iCurl', new THREE.InstancedBufferAttribute(pack(this.curl, 3), 3));
    g.instanceCount = n; g.userData.total = n;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.7, 0), 3);
    return g;
  }
}
// rotate vector d around axis n by angle a
function rotAround(d, n, a) { const c = cos(a), s = sin(a), k = vcross(n, d), dn = vdot(n, d); return [d[0] * c + k[0] * s + n[0] * dn * (1 - c), d[1] * c + k[1] * s + n[1] * dn * (1 - c), d[2] * c + k[2] * s + n[2] * dn * (1 - c)]; }
function tangentize(d, n) { const t = vsub(d, vmul(n, vdot(d, n))); const l = vlen(t); if (l < 1e-4) { const alt = abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; return vnorm(vcross(n, alt)); } return vmul(t, 1 / l); }
// ------------------------------------------------------------------ GLSL
const GLSL_NOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+10.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float hash11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056,0.00583715)))); }
`;
const GLSL_LIGHT = /* glsl */`
uniform vec3 uCamPos;
uniform vec3 uKeyDir; uniform vec3 uKeyCol;
uniform vec3 uFillDir; uniform vec3 uFillCol;
uniform vec3 uRimDir; uniform vec3 uRimCol;
uniform vec3 uSkyCol; uniform vec3 uGroundCol;
uniform sampler2DShadow uShadowMap; uniform mat4 uShadowMat; uniform float uShadowBias;
const vec2 PD[12] = vec2[12](vec2(-0.326,-0.406),vec2(-0.840,-0.074),vec2(-0.696,0.457),vec2(-0.203,0.621),vec2(0.962,-0.195),vec2(0.473,-0.480),vec2(0.519,0.767),vec2(0.185,-0.893),vec2(0.507,0.064),vec2(0.896,0.412),vec2(-0.322,-0.933),vec2(-0.792,-0.598));
// hardware-filtered (bilinear compare) PCF over a fixed Poisson disc: smooth, no per-pixel dither noise
float shadowAt(vec3 wp, float soft, float rot, int taps){
  vec4 sc = uShadowMat*vec4(wp,1.); vec3 s = sc.xyz/sc.w*.5+.5;
  if(s.x<0.||s.x>1.||s.y<0.||s.y>1.||s.z>1.) return 1.;
  float c=cos(rot), sn=sin(rot); float acc=0.; float n=0.;
  for(int i=0;i<12;i++){ if(i>=taps) break; vec2 o=PD[i]; o=vec2(c*o.x-sn*o.y, sn*o.x+c*o.y)*soft;
    acc += texture(uShadowMap, vec3(s.xy+o, s.z-uShadowBias)); n+=1.; }
  return acc/n;
}
vec3 hemi(vec3 N){ return mix(uGroundCol, uSkyCol, clamp(N.y*.5+.5,0.,1.)); }
float charlieD(float rough, float NoH){ float inv=1./rough; float s2=max(1.-NoH*NoH, 1e-4); return (2.+inv)*pow(s2, inv*.5)/6.2831853; }
`;

// the app's character fill: a 3-stop linear gradient, top -> mid (55%) -> bottom, x drifting 0 -> 0.15 across the height.
// Evaluated in the body's rest space (uGradM = inverse body bone) so hops, squash and blinking lids never slide it.
const GLSL_GRAD = /* glsl */`
uniform vec3 uGradTop; uniform vec3 uGradMid; uniform vec3 uGradBot; uniform mat4 uGradM; uniform vec3 uGradBox; uniform float uGradOn;
vec3 gradCol(vec3 wp){
  vec3 q = (uGradM*vec4(wp,1.)).xyz;
  float u = clamp((q.x - uGradBox.x)/uGradBox.y, 0., 1.);
  float v = clamp((uGradBox.z - q.y)/uGradBox.z, 0., 1.);
  float t = clamp((0.15*u + v)/1.0225, 0., 1.);
  vec3 c = t < 0.55 ? mix(uGradTop, uGradMid, t/0.55) : mix(uGradMid, uGradBot, (t-0.55)/0.45);
  return pow(c, vec3(2.2));
}
`;

// The app's morph (ported to 3D): the body's surface slides radially onto a ball (or the app's teardrop,
// point down, for the pencil) of radius uMorphR around the body centre; the bone then scales it down to a dot.
const GLSL_MORPH = /* glsl */`
uniform float uMorph; uniform vec3 uMorphC; uniform float uMorphR; uniform float uTear;
float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2){
  vec3 ba = b - a; float l2 = dot(ba,ba); float rr = r1 - r2; float a2 = l2 - rr*rr; float il2 = 1./l2;
  vec3 pa = p - a; float y = dot(pa,ba); float z = y - l2; vec3 xv = pa*l2 - ba*y; float x2 = dot(xv,xv); float y2 = y*y*l2; float z2 = z*z*l2;
  float k = sign(rr)*rr*rr*x2;
  if (sign(z)*a2*z2 > k) return sqrt(x2 + z2)*il2 - r2;
  if (sign(y)*a2*y2 < k) return sqrt(x2 + y2)*il2 - r1;
  return (sqrt(x2*a2*il2) + y*rr)*il2 - r1;
}
float sdTear(vec3 q){ return sdRoundCone(q, uMorphC + vec3(0., .228*uMorphR, 0.), uMorphC - vec3(0., .86*uMorphR, 0.), .77*uMorphR, .14*uMorphR); }
void morphPN(inout vec3 p, inout vec3 n){
  vec3 d = p - uMorphC; float l = length(d); d = l > 1e-5 ? d/l : vec3(0.,0.,1.);
  vec3 q = uMorphC + d*uMorphR; vec3 nq = d;
  if (uTear > 0.) {
    float lo = 0., hi = 1.7*uMorphR;
    for (int i = 0; i < 14; i++) { float m = .5*(lo+hi); if (sdTear(uMorphC + d*m) < 0.) lo = m; else hi = m; }
    vec3 qt = uMorphC + d*(.5*(lo+hi)); float e = .004;
    vec3 nt = normalize(vec3(sdTear(qt+vec3(e,0,0))-sdTear(qt-vec3(e,0,0)), sdTear(qt+vec3(0,e,0))-sdTear(qt-vec3(0,e,0)), sdTear(qt+vec3(0,0,e))-sdTear(qt-vec3(0,0,e))));
    q = mix(q, qt, uTear); nq = normalize(mix(nq, nt, uTear));
  }
  p = mix(p, q, uMorph); n = normalize(mix(n, nq, uMorph));
}
`;

// --- velvet/felt underlayer
const FELT_VS = /* glsl */`
attribute vec4 aReg; attribute float aAO;
varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec4 vReg; varying float vAO;
void main(){
  vec4 w = modelMatrix*vec4(position,1.);
  vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); vO = position; vReg = aReg; vAO = aAO;
  gl_Position = projectionMatrix*viewMatrix*w;
}`;
const FELT_FS = /* glsl */`
${GLSL_NOISE}
${GLSL_LIGHT}
${GLSL_GRAD}
uniform vec3 uPal[4];
uniform float uFeltFreq; uniform float uBump; uniform float uSheen; uniform float uWrap; uniform float uAOAmt;
varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec4 vReg; varying float vAO;
vec3 feltLight(vec3 N, vec3 V, vec3 L, vec3 Lc, vec3 alb, vec3 sheenCol){
  float NoL = dot(N,L);
  float diff = max(0., (NoL + uWrap)/(1.+uWrap));
  // wool scatters: the terminator goes saturated instead of grey
  float term = smoothstep(-uWrap, 0.1, NoL) * (1.-smoothstep(0.1, 0.7, NoL));
  vec3 satAlb = alb * mix(vec3(1.), alb/max(max(alb.r,max(alb.g,alb.b)),1e-3), 0.55*term);
  vec3 H = normalize(L+V); float NoV = max(dot(N,V),1e-3); float nl = max(NoL,0.);
  float D = charlieD(0.55, max(dot(N,H),0.)); float Vis = 1./(4.*(nl+NoV-nl*NoV)+1e-3);
  vec3 sheen = sheenCol * D * Vis * nl * uSheen;
  return (satAlb*diff + sheen) * Lc;
}
void main(){
  vec4 rw = vReg / max(1e-3, vReg.x+vReg.y+vReg.z+vReg.w);
  vec3 base = (uGradOn > 0.5 ? gradCol(vW) : uPal[0])*rw.x + uPal[1]*rw.y + uPal[2]*rw.z + uPal[3]*rw.w;
  vec3 q = vO * uFeltFreq;
  float n1 = snoise(q), n2 = snoise(q*2.13+vec3(7.1,3.3,1.7)), n3 = snoise(q*0.31+11.);
  float fib = pow(1.-abs(n1), 4.)*0.6 + pow(1.-abs(n2), 4.)*0.4;   // squiggly tangled fibres
  float fw = length(fwidth(q));
  float detail = 1. - smoothstep(0.35, 1.2, fw);                  // fade before it aliases
  float h = (n1*0.22 + n3*0.35) * detail;   // smooth only: sharp ridges through dFdx give 2x2-block grain
  vec3 N0 = normalize(vN);
  vec3 dpx = dFdx(vW), dpy = dFdy(vW); float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, N0), r2 = cross(N0, dpx); float det = dot(dpx, r1);
  vec3 grad = sign(det)*(dhx*r1 + dhy*r2);
  vec3 N = normalize(abs(det)*N0 - uBump*grad);
  if (!gl_FrontFacing) N = -N;
  vec3 alb = base * mix(1., mix(0.9, 1.05, fib) * (1.+n3*0.05), detail);
  vec3 V = normalize(uCamPos - vW);
  float sh = shadowAt(vW + N0*0.012, 0.0065, 0.7, 8);
  float ao = mix(1., vAO, uAOAmt);
  vec3 sheenCol = mix(alb, vec3(1.), 0.35);
  vec3 col = feltLight(N, V, uKeyDir, uKeyCol*sh, alb, sheenCol)*mix(0.6,1.,ao)
           + feltLight(N, V, uFillDir, uFillCol, alb, sheenCol)*ao
           + feltLight(N, V, uRimDir, uRimCol, alb, sheenCol)*ao;
  // back-lit fuzz: fibres on the silhouette scatter the rim light
  float NoV = max(dot(N0,V),0.);
  float rimScatter = pow(1.-NoV, 3.) * max(0., dot(uRimDir, -V)*.5+.5);
  col += alb * uRimCol * rimScatter * 0.9 * ao;
  col += alb * hemi(N) * ao * (0.85 + 0.15*fib);
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// --- knit (stockinette + 1x1 rib), procedural, derivative-filtered
const KNIT_VS = /* glsl */`
attribute vec4 aKnit; attribute float aAO;
varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec4 vKnit; varying float vAO;
void main(){
  vec4 w = modelMatrix*vec4(position,1.);
  vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); vO = position; vKnit = aKnit; vAO = aAO;
  gl_Position = projectionMatrix*viewMatrix*w;
}`;
const KNIT_FS = /* glsl */`
${GLSL_NOISE}
${GLSL_LIGHT}
uniform vec3 uYarn; uniform vec3 uYarnLight;
uniform vec3 uArmA[2]; uniform vec3 uArmDir[2];
uniform vec2 uStitch;       // stitch width, row height (object units)
uniform float uBump;
varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec4 vKnit; varying float vAO;
// one yarn leg: rounded tube with an elliptical footprint.
// returns (height, ply coordinate, d height/d uv) - the gradient is analytic so the bump has no 2x2-quad grain
vec4 leg(vec2 p, vec2 c, vec2 ax, float hl, float hw){
  vec2 d = p - c; vec2 px = vec2(-ax.y, ax.x); float a = dot(d, ax); float b = dot(d, px);
  float e = (a*a)/(hl*hl) + (b*b)/(hw*hw);
  float m = max(0., 1.-e);
  float h = pow(m, 0.62);                                  // rounder shoulder, soft contact with the next leg
  vec2 de = 2.*a/(hl*hl)*ax + 2.*b/(hw*hw)*px;
  vec2 g = m > 1e-3 ? -0.62*pow(m, -0.38)*de : vec2(0.);
  g = g/(1.+length(g)*0.08);
  return vec4(h, a*9. + b*16., g);
}
struct K { float h; float ply; vec2 g; float id; };
// stockinette: columns of V's, uv in stitch units (x across, y up); hand-knit jitter per stitch
K stock(vec2 uv){
  vec2 cell = floor(uv); vec2 f = uv - cell;
  K k; k.h = 0.; k.ply = 0.; k.g = vec2(0.); k.id = 0.;
  vec2 aL = normalize(vec2(-0.42, 1.)), aR = normalize(vec2(0.42, 1.));
  for (int dy=-1; dy<=1; dy++) for (int dx=-1; dx<=1; dx++){
    vec2 o = vec2(float(dx), float(dy));
    float hj = hash11(dot(cell+o, vec2(17.13, 91.7)));
    vec2 j = (vec2(hj, hash11(hj*77.1+3.))-.5)*vec2(0.07, 0.09);
    float sz = 0.94 + 0.1*hj;
    vec4 L1 = leg(f, o + j + vec2(0.5-0.215, 0.64), aL, 0.6*sz, 0.235*sz);
    vec4 R1 = leg(f, o + j + vec2(0.5+0.215, 0.64), aR, 0.6*sz, 0.235*sz);
    if (L1.x > k.h) { k.h = L1.x; k.ply = L1.y; k.g = L1.zw; k.id = hash11(dot(cell+o, vec2(12.9898, 78.233))); }
    if (R1.x > k.h) { k.h = R1.x; k.ply = R1.y + 3.1; k.g = R1.zw; k.id = hash11(dot(cell+o, vec2(12.9898, 78.233))+.37); }
  }
  return k;
}
// 1x1 rib: raised knit columns (V's), recessed purl columns (small horizontal bumps, mostly hidden)
K rib(vec2 uv){
  // 1x1 rib pulls in: knit columns take ~72% of each 2-column repeat, purl sits deep in the valley
  float rep = uv.x*0.5; float cid = floor(rep); float fx = fract(rep);
  K k; k.h = 0.; k.ply = 0.; k.g = vec2(0.); k.id = hash11(cid*7.13+.5);
  float kw = 0.72;
  if (fx < kw){
    float sx = 1./(2.*kw);                       // du_local/du
    vec2 g = vec2(fx/kw, fract(uv.y));
    vec2 aL = normalize(vec2(-0.36, 1.)), aR = normalize(vec2(0.36, 1.));
    for (int dy=-1; dy<=1; dy++){
      vec2 o = vec2(0., float(dy));
      vec4 L1 = leg(g, o + vec2(0.5-0.2, 0.64), aL, 0.6, 0.27);
      vec4 R1 = leg(g, o + vec2(0.5+0.2, 0.64), aR, 0.6, 0.27);
      if (L1.x > k.h) { k.h = L1.x; k.ply = L1.y; k.g = L1.zw; }
      if (R1.x > k.h) { k.h = R1.x; k.ply = R1.y; k.g = R1.zw; }
    }
    k.h = 0.25 + 0.75*k.h; k.g *= vec2(sx, 1.)*0.75;
    // columns roll down into the valley on both sides
    float edge = min(fx, kw-fx)/kw;
    k.h *= smoothstep(0.0, 0.18, edge);
  } else {
    float px = (fx-kw)/(1.-kw);
    vec2 g = vec2(px, fract(uv.y*1.0));
    vec4 B = leg(g, vec2(0.5, 0.5), vec2(1.,0.), 0.5, 0.3);
    k.h = B.x*0.1; k.ply = B.y; k.g = B.zw*0.1;
  }
  return k;
}
void main(){
  vec3 p = vO;
  // choose mapping: torso cylinder vs sleeve cylinder
  float wl = vKnit.x, wr = vKnit.y;
  vec2 uv;
  float isRib = step(0.5, vKnit.z);
  if (max(wl, wr) > 0.5){
    int i = wl > wr ? 0 : 1;
    vec3 ax = uArmDir[i]; vec3 q = p - uArmA[i];
    float along = dot(q, ax); vec3 rad = q - ax*along;
    vec3 ef = normalize(vec3(0.,0.,1.) - ax*ax.z); vec3 es = cross(ax, ef);
    float ang = atan(dot(rad, es), dot(rad, ef));
    uv = vec2(ang*0.2/uStitch.x, -along/uStitch.y);
  } else {
    float ang = atan(p.x, p.z);
    float R = vKnit.w > 0.5 ? 0.34 : 0.74;
    uv = vec2(ang*R/uStitch.x, p.y/uStitch.y);
    if (vKnit.w > 0.5) uv.y = (p.y - 1.29)/uStitch.y*1.4;
  }
  vec2 kuv = isRib > 0.5 ? uv*vec2(2.1,1.) : uv;
  K k; if (isRib > 0.5) k = rib(kuv); else k = stock(uv);
  float stitchVar = k.id;
  float fw = max(length(fwidth(uv)), 1e-4);
  float detail = 1. - smoothstep(0.22, 0.6, fw);
  // yarn: ply twist and fibre noise
  float plyT = 0.5+0.5*sin(k.ply);
  float fn2 = snoise(vO*45.+3.);
  vec3 N0 = normalize(vN);
  // cotangent frame from the (smooth) uv mapping, then perturb with the analytic stitch gradient
  vec3 dpx = dFdx(vW), dpy = dFdy(vW); vec2 dux = dFdx(kuv), duy = dFdy(kuv);
  vec3 dp2perp = cross(dpy, N0), dp1perp = cross(N0, dpx);
  vec3 Tu = dp2perp*dux.x + dp1perp*duy.x; vec3 Tv = dp2perp*dux.y + dp1perp*duy.y;
  float invmax = inversesqrt(max(dot(Tu,Tu), dot(Tv,Tv)) + 1e-12);
  Tu *= invmax; Tv *= invmax;
  vec2 gk = k.g * detail * step(0.02, k.h);
  vec3 N = normalize(N0 - uBump*(gk.x*Tu + gk.y*Tv));
  if (!gl_FrontFacing) N = -N;
  float h = mix(0.55, k.h, detail);
  float cavity = mix(1., mix(0.55, 1., smoothstep(0.0, 0.5, k.h)), detail);
  vec3 fq = vO*150.; float fdet = 1. - smoothstep(0.3, 0.9, length(fwidth(fq)));
  float fib = snoise(fq*vec3(1.,2.6,1.)) ;
  float plyD = detail * (1. - smoothstep(0.35, 1.2, length(fwidth(vec2(k.ply)))*0.15));
  vec3 alb = uYarn * (0.88 + 0.16*plyT*plyD) * (1. + fn2*0.06) * (1. + (stitchVar-.5)*0.16*detail) * (1. + fib*0.1*fdet);
  alb = mix(alb, uYarnLight, 0.16*smoothstep(0.5,1.,k.h)*detail);
  vec3 V = normalize(uCamPos - vW);
  float sh = shadowAt(vW + N0*0.012, 0.0065, 0.7, 8);
  float ao = vAO * cavity;
  vec3 col = vec3(0.);
  vec3 Ls[3]; Ls[0]=uKeyDir; Ls[1]=uFillDir; Ls[2]=uRimDir;
  vec3 Cs[3]; Cs[0]=uKeyCol*sh; Cs[1]=uFillCol; Cs[2]=uRimCol;
  float NoV = max(dot(N,V),1e-3);
  for (int i=0;i<3;i++){
    float NoL = dot(N, Ls[i]);
    float diff = max(0., (NoL+0.35)/1.35);
    vec3 H = normalize(Ls[i]+V); float nl = max(NoL,0.);
    float D = charlieD(0.45, max(dot(N,H),0.)); float Vis = 1./(4.*(nl+NoV-nl*NoV)+1e-3);
    vec3 sheen = mix(alb, vec3(1.), 0.4) * D*Vis*nl*0.6;
    col += (alb*diff + sheen) * Cs[i] * (i==0 ? mix(0.55,1.,ao) : ao);
  }
  float rimScatter = pow(1.-max(dot(N0,V),0.), 3.) * max(0., dot(uRimDir, -V)*.5+.5);
  col += alb * uRimCol * rimScatter * 0.7 * ao;
  col += alb * hemi(N) * ao;
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// --- strands
const STRAND_VS = /* glsl */`
${GLSL_NOISE}
${GLSL_LIGHT}
${GLSL_GRAD}
uniform mat4 uBones[6];
uniform vec3 uPal[8];
uniform float uViewH; uniform float uWidthScale; uniform float uMinPx; uniform float uLenScale; uniform float uTime;
uniform float uTipRatio;
uniform vec4 uHoles[8];
uniform float uBodyFade;
${GLSL_MORPH}
attribute vec3 iRoot; attribute vec3 iNrm; attribute vec3 iDir;
attribute vec4 iShape;   // len, width, lean, bend
attribute vec4 iMisc;    // seed, region, ao, bone
attribute vec3 iCurl;    // amp, freq, alpha
varying vec3 vT; varying vec3 vN; varying vec3 vW; varying vec3 vCol;
varying float vTt; varying float vAlpha; varying float vAO; varying float vSh; varying float vSide; varying float vFade;
vec3 curve(float t, vec3 R, vec3 N, vec3 D, vec3 B, float L, float lean, float bend, float amp, float freq, float ph){
  float k = abs(bend) < 1e-3 ? 1e-3 : bend;
  float a = lean + k*t;
  float cn = (sin(a) - sin(lean))/k;
  float cd = (cos(lean) - cos(a))/k;
  vec3 P = R + L*(N*cn + D*cd);
  float c = amp*L*sqrt(t);
  float w = 6.2831853*freq*t + ph;
  vec3 perp = N*(-sin(a)) + D*cos(a);
  P += c*(B*sin(w) + perp*cos(w)*0.7);
  return P;
}
void main(){
  float t = position.x; float side = position.y;
  int bi = int(iMisc.w + .5);
  mat4 M = uBones[bi];
  vec3 r0 = iRoot, n0 = iNrm;
  if (bi == 0 && uMorph > 0.) morphPN(r0, n0);   // the app's morph: the cloud becomes a dot / a pencil tip
  vec3 R = (M*vec4(r0,1.)).xyz;
  vec3 N = normalize(mat3(M)*n0);
  vFade = bi == 0 ? uBodyFade : 1.;
  vec3 D = mat3(M)*iDir; D = normalize(D - N*dot(D,N));
  vec3 B = cross(N, D);
  float seed = iMisc.x;
  float L = iShape.x*uLenScale;
  // features (eyes, mouth) clear the coat around them: roots inside a hole are dropped, near it they shorten
  float hd = 9.;
  if (bi == 0) for (int i=0;i<8;i++) hd = min(hd, length(iRoot - uHoles[i].xyz) - uHoles[i].w);
  float holeK = smoothstep(0., 0.07, hd);
  L *= mix(0.3, 1., holeK);
  float ph = seed*61.7;
  vec3 P = curve(t, R, N, D, B, L, iShape.z, iShape.w, iCurl.x, iCurl.y, ph);
  float dt = t < .95 ? .03 : -.03;
  vec3 P2 = curve(t+dt, R, N, D, B, L, iShape.z, iShape.w, iCurl.x, iCurl.y, ph);
  vec3 T = normalize((P2 - P)*sign(dt));
  vec3 toCam = uCamPos - P;
  vec3 S = cross(T, toCam); float sl = length(S); S = sl > 1e-6 ? S/sl : vec3(1.,0.,0.);
  float w = iShape.y*uWidthScale*mix(1., uTipRatio, t);
  vec4 clip = projectionMatrix*viewMatrix*vec4(P,1.);
  float px = clip.w*2./(projectionMatrix[1][1]*uViewH);
  float wMin = px*uMinPx; float cov = 1.;
  if (w < wMin) { cov = w/wMin; w = wMin; }
  vec3 Pw = P + S*side*w*.5;
  gl_Position = projectionMatrix*viewMatrix*vec4(Pw,1.);
  // colour
  int reg = int(iMisc.y + .5);
  vec3 base = uPal[reg];
  if (uGradOn > 0.5 && (reg == 0 || reg == 6 || reg == 7)) {
    vec3 g = gradCol(R);
    base = reg == 6 ? mix(g, mix(g, vec3(1., 0.92, 0.83), 0.6), 0.55) : g;   // fly-aways run a touch paler, as before
  }
  float h1 = hash11(seed*1000.+.5), h2 = hash11(seed*1731.+7.3), h3 = hash11(seed*913.+2.1);
  base *= 0.92 + 0.14*h1;
  base = mix(base, base*base/max(max(base.r,max(base.g,base.b)),1e-3), 0.15*h3);   // some fibres deeper
  if (h2 > 0.97) base = mix(base, vec3(1.), 0.2);                               // a few pale fibres
  vCol = base;
  vT = T; vN = N; vW = P; vTt = t; vAO = iMisc.z; vSide = side;
  float tipFade = 1. - smoothstep(0.62, 1., t);
  vAlpha = cov * iCurl.z * tipFade * step(0., hd);
  vSh = shadowAt(P + N*0.006, 0.006, seed*6.2831, 6);
}`;
const STRAND_FS = /* glsl */`
${GLSL_LIGHT}
uniform vec2 uSpecShift; uniform vec2 uSpecExp; uniform vec2 uSpecAmt; uniform float uTrans; uniform float uRootOcc;
uniform float uOpacity; uniform float uTipLight; uniform float uHalo;
varying vec3 vT; varying vec3 vN; varying vec3 vW; varying vec3 vCol;
varying float vTt; varying float vAlpha; varying float vAO; varying float vSh; varying float vSide; varying float vFade;
vec3 hairLight(vec3 L, vec3 Lc, vec3 T, vec3 N, vec3 V, vec3 base, float t, float occ){
  float NoL = dot(N, L);
  float wrap = clamp((NoL + .55)/1.55, 0., 1.);
  float TL = dot(T, L); float kk = sqrt(max(0., 1. - TL*TL));
  float diff = wrap * mix(1., kk, .45);
  vec3 H = normalize(L + V);
  float a1 = dot(normalize(T + N*uSpecShift.x), H); float s1 = pow(sqrt(max(0.,1.-a1*a1)), uSpecExp.x);
  float a2 = dot(normalize(T + N*uSpecShift.y), H); float s2 = pow(sqrt(max(0.,1.-a2*a2)), uSpecExp.y);
  float facing = smoothstep(-.2, .4, NoL);
  vec3 spec = (vec3(s1)*uSpecAmt.x + base*s2*uSpecAmt.y) * facing;
  float back = max(0., dot(L, -V));
  vec3 trans = base * pow(back, 3.) * kk * uTrans * (.35 + .65*t);
  return (base*diff*occ + spec*mix(.4,1.,t) + trans) * Lc;
}
void main(){
  float t = vTt;
  float a = vAlpha * uOpacity * vFade;
  if (a < 0.004) discard;
  vec3 T = normalize(vT); vec3 N = normalize(vN); vec3 V = normalize(uCamPos - vW);
  float occ = mix(uRootOcc, 1., smoothstep(0., .9, t)) * mix(vAO, 1., .45 + .55*t);
  vec3 base = vCol;
  // thin tips scatter more and read lighter / less saturated than the roots
  vec3 tipCol = mix(base, vec3(max(base.r, max(base.g, base.b))), 0.3) * 1.18;
  base = mix(base, tipCol, t*t*uTipLight);
  vec3 col = hairLight(uKeyDir, uKeyCol*vSh, T, N, V, base, t, occ)
           + hairLight(uFillDir, uFillCol, T, N, V, base, t, occ)
           + hairLight(uRimDir, uRimCol, T, N, V, base, t, occ);
  col += base * hemi(N) * occ;
  // silhouette halo: tips seen edge-on against the backdrop scatter the rim + sky light
  float edgeOn = pow(1. - abs(dot(N, V)), 2.5);
  col += mix(base, vec3(1.), .35) * (uRimCol*.55 + uSkyCol*.6) * edgeOn * t * uHalo;
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a);
}`;

// --- eye
const EYE_VS = /* glsl */`
varying vec3 vW; varying vec3 vN; varying vec3 vL;
uniform float uEyeR;
void main(){ vL = position/uEyeR; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*w; }`;
const EYE_FS = /* glsl */`
${GLSL_NOISE}
${GLSL_LIGHT}
uniform float uF0;
uniform vec3 uCamLocal; uniform float uIrisAng; uniform float uPupil; uniform float uIrisDepth;
uniform vec3 uIris; uniform vec3 uIrisDark; uniform vec3 uSclera;
uniform mat4 uLidInv; uniform mat4 uLowInv; uniform float uLidEdge; uniform float uLowEdge;
varying vec3 vW; varying vec3 vN; varying vec3 vL;
vec3 studioEnv(vec3 R){
  vec3 c = mix(uGroundCol*0.35, uSkyCol*1.05, smoothstep(-0.35, 0.75, R.y));
  vec3 k = normalize(uKeyDir); vec3 ku = normalize(cross(vec3(0.,1.,0.), k)); vec3 kv = cross(k, ku);
  float d = dot(R, k);
  if (d > 0.){ vec2 q = vec2(dot(R,ku), dot(R,kv))/d; vec2 b = abs(q) - vec2(0.2, 0.28); float sd = length(max(b,0.)) + min(max(b.x,b.y),0.) - 0.08; c += uKeyCol*7.*smoothstep(0.04, -0.04, sd); }
  vec3 r = normalize(uRimDir); vec3 ru = normalize(cross(vec3(0.,1.,0.), r)); vec3 rv = cross(r, ru);
  float d2 = dot(R, r);
  if (d2 > 0.){ vec2 q = vec2(dot(R,ru), dot(R,rv))/d2; vec2 b = abs(q) - vec2(0.08, 0.5); float sd = length(max(b,0.)) + min(max(b.x,b.y),0.) - 0.04; c += uRimCol*4.*smoothstep(0.04, -0.04, sd); }
  // round beauty-dish near the camera, up-left: the catchlight that sits just under the lid
  vec3 bd = normalize(vec3(-0.36, -0.28, 1.0)); float db = dot(R, bd);
  c += vec3(1.,.98,.95)*9.*smoothstep(0.9965, 0.998, db);
  c += vec3(1.)*0.9*smoothstep(0.985, 0.998, db);
  return c;
}
void main(){
  vec3 n = normalize(vL);
  vec3 Vl = normalize(uCamLocal - n);
  vec3 N = normalize(vN); vec3 V = normalize(uCamPos - vW);
  float cz = cos(uIrisAng), sz = sin(uIrisAng);
  // refract into the anterior chamber and hit the recessed iris plane
  vec3 rd = refract(-Vl, n, 1./1.376);
  float planeZ = cz - uIrisDepth;
  float tt = (planeZ - n.z)/min(rd.z, -1e-3);
  vec3 hp = n + rd*max(tt, 0.);
  vec2 ip = hp.xy/sz;
  float r = length(ip); float ang = atan(ip.y, ip.x);
  float corneaMask = smoothstep(cz - 0.035, cz + 0.01, n.z);
  float irisMask = corneaMask * smoothstep(1.03, 0.95, r);
  float streak = snoise(vec3(cos(ang)*9., sin(ang)*9., r*2.2)) * 0.5 + snoise(vec3(cos(ang)*22., sin(ang)*22., r*5.)) * 0.35;
  vec3 iris = mix(uIrisDark, uIris, smoothstep(1.0, 0.6, r));
  iris *= 0.8 + 0.35*streak;
  iris = mix(iris, uIris*1.35, 0.35*smoothstep(0.1, 0.0, abs(r - uPupil*1.45)));
  float pupil = smoothstep(uPupil + 0.035, uPupil - 0.035, r);
  iris = mix(iris, vec3(0.004, 0.004, 0.006), pupil);
  vec3 sclera = uSclera * mix(1., 0.8, smoothstep(0.35, -0.5, n.z));
  vec3 alb = mix(sclera, iris, irisMask);
  // lid contact shadows (analytic): angle below the upper lid edge, above the lower lid edge
  vec3 lu = (uLidInv*vec4(vW,1.)).xyz; float bu = atan(lu.y, lu.z);
  float lidAO = mix(0.4, 1., smoothstep(-0.02, 0.22, uLidEdge - bu));
  vec3 ll = (uLowInv*vec4(vW,1.)).xyz; float bl = atan(ll.y, ll.z);
  lidAO *= mix(0.6, 1., smoothstep(0.0, 0.16, bl - uLowEdge));
  float sh = shadowAt(vW + N*0.004, 0.004, 0.7, 8);
  float NoV = max(dot(N,V), 1e-3);
  vec3 col = vec3(0.);
  vec3 Ls[3]; Ls[0]=uKeyDir; Ls[1]=uFillDir; Ls[2]=uRimDir;
  vec3 Cs[3]; Cs[0]=uKeyCol*sh; Cs[1]=uFillCol; Cs[2]=uRimCol;
  for (int i=0;i<3;i++){ float NoL = dot(N, Ls[i]); col += alb*max(0.,(NoL+.25)/1.25)*Cs[i]; }
  col += alb*hemi(N);
  col *= lidAO;
  // wet cornea: fresnel reflection of the studio + a tight key highlight
  vec3 R = reflect(-V, N);
  float F = uF0 + (1.-uF0)*pow(1.-NoV, 5.);
  vec3 env = studioEnv(R);
  float spec = pow(max(dot(R, uKeyDir),0.), 900.)*18.;
  col = col*(1.-F) + env*F*mix(0.45,1.,lidAO) + uKeyCol*spec*0.25*sh*lidAO;
  // wet meniscus where the lower lid meets the eye: a thin bright line
  float men = smoothstep(0.07, 0.0, bl - uLowEdge) * smoothstep(-0.02, 0.01, bl - uLowEdge);
  col += vec3(0.9,0.95,1.)*men*0.22*pow(max(dot(R, normalize(vec3(0.,0.6,1.))),0.),4.);
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// --- backdrop (cyclorama) with contact AO from analytic occluders
const BG_VS = /* glsl */`
varying vec3 vW; varying vec3 vN;
void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*w; }`;
const BG_FS = /* glsl */`
${GLSL_LIGHT}
uniform vec3 uBg; uniform vec3 uBgFloor; uniform vec4 uOcc[6]; uniform float uNOcc;
varying vec3 vW; varying vec3 vN;
float ign2(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056,0.00583715)))); }
void main(){
  vec3 N = normalize(vN);
  float wall = smoothstep(0.2, 3.5, vW.y);
  vec3 base = mix(uBgFloor, uBg, wall);
  // soft top-to-bottom studio falloff and a gentle vignette around the subject
  float r = length(vec2(vW.x*0.55, (vW.y-1.8)*0.8 + min(vW.z,0.)*0.0));
  base *= mix(1.06, 0.84, smoothstep(1.5, 9., r));
  float occ = 0.;
  for (int i=0;i<6;i++){ if (float(i) >= uNOcc) break; vec3 d = uOcc[i].xyz - vW; float l = length(d); float rr = uOcc[i].w;
    occ += rr*rr*max(dot(N, d/l), 0.)/(l*l) ; }
  float ao = 1. - 0.55*clamp(occ, 0., 1.);
  float sh = shadowAt(vW + N*0.02, 0.018, 0.7, 12);
  float key = max(dot(N, uKeyDir), 0.);
  vec3 col = base * (0.78 + 0.28*key*mix(0.55, 1., sh)) * ao;
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// --- the body's felt: the approved felt shader + the morph + a fade (the app dims the dot in some morphs)
const BODY_VS = /* glsl */`
${GLSL_MORPH}
attribute vec4 aReg; attribute float aAO;
varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec4 vReg; varying float vAO;
void main(){
  vec3 p = position, n = normal;
  if (uMorph > 0.) morphPN(p, n);
  vec4 w = modelMatrix*vec4(p,1.);
  vW = w.xyz; vN = normalize(mat3(modelMatrix)*n); vO = position; vReg = aReg; vAO = aAO;
  gl_Position = projectionMatrix*viewMatrix*w;
}`;
const BODY_FS = FELT_FS.replace('uniform vec3 uPal[4];', 'uniform vec3 uPal[4];\nuniform float uBodyFade; uniform vec3 uBgCol;')
  .replace(/\}\s*$/, '  gl_FragColor.rgb = mix(uBgCol, gl_FragColor.rgb, uBodyFade);\n}');
// --- the effects around the character (dots, rings, pencil, "!"): the same felt, with an opacity; rings are tori
// built in the vertex shader (radius, tube, arc from 12 o'clock clockwise)
const FX_VS = /* glsl */`
attribute vec4 aReg; attribute float aAO;
uniform vec4 uRing;
varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec4 vReg; varying float vAO;
void main(){
  vec3 p = position, n = normal;
  if (uRing.w > .5) {
    float a = 1.5707963 - uv.x*uRing.z, b = uv.y*6.2831853;
    vec3 c = vec3(cos(a), sin(a), 0.);
    n = c*cos(b) + vec3(0.,0.,sin(b)); p = c*uRing.x + n*uRing.y;
  }
  vec4 w = modelMatrix*vec4(p,1.);
  vW = w.xyz; vN = normalize(mat3(modelMatrix)*n); vO = mat3(modelMatrix)*p; vReg = aReg; vAO = aAO;
  gl_Position = projectionMatrix*viewMatrix*w;
}`;
const FX_FS = FELT_FS.replace('uniform vec3 uPal[4];', 'uniform vec3 uPal[4];\nuniform float uOp;')
  .replace(/\}\s*$/, '  gl_FragColor *= uOp;\n}');
// ------------------------------------------------------------------ the app's character data (extracted from the pinned app bundle)
// MARK_EYES[frame][eye] = { c: eye centre in app px from the mark centre, m: the app's 2x2 eye transform (pose + eye scale), p: outline (every 2nd point) around its centroid }
const MARK_EYES = [[{"c":[5.8,-11.96],"m":[0.9024,0.0428,-0.1197,0.907],"p":[-6.3,-20.8,-1.6,-19.9,2.3,-17.5,5.1,-13.6,7.1,-9.4,9.2,-5.1,11.1,-0.8,13,3.5,14.7,7.9,15.5,12.5,14,16.9,10.5,20,5.9,21.2,1.4,20.3,-2.5,17.5,-4.9,13.5,-6.8,9.2,-8.6,4.8,-10.6,0.5,-12.6,-3.7,-14.8,-7.9,-15.9,-12.5,-14.5,-16.9,-10.9,-19.8]},{"c":[56.77,-20.03],"m":[1.034,-0.1098,-0.1755,0.9717],"p":[-9.1,-20.1,-5,-18.7,-1.5,-16.2,1.3,-12.9,3.6,-9.2,5.6,-5.3,7.5,-1.4,9.2,2.6,10.8,6.6,12.3,10.7,12.9,15,11.9,19.1,8.1,20.9,4.1,19.5,0.8,16.6,-1.4,12.9,-3.1,8.9,-4.6,4.8,-6.3,0.8,-8.1,-3.1,-10.1,-7,-12.2,-10.8,-13.8,-14.8,-13.1,-18.9]}],[{"c":[-41.13,44.79],"m":[0.8314,0.1251,0.0102,0.7563],"p":[-4.8,-29,1.1,-28,5.9,-24.4,8.6,-19,9.6,-13.1,10.6,-7.1,11.7,-1.1,12.9,4.8,14.2,10.7,15.5,16.6,15.1,22.6,11.1,27,5.3,28.7,-0.6,27.6,-5.6,24.3,-8.6,19.1,-10,13.2,-11.3,7.3,-12.4,1.3,-13.5,-4.6,-14.5,-10.6,-15.4,-16.6,-14.3,-22.5,-10.5,-27.1]},{"c":[14.18,40.84],"m":[0.9229,0.019,-0.0068,0.7761],"p":[-3.5,-29.3,2.4,-28,6.8,-23.9,8.8,-18.3,10.2,-12.3,11.4,-6.4,12.6,-0.5,13.7,5.5,14.7,11.5,15.1,17.5,12.9,23.1,8.5,27.3,2.9,29.3,-3,28.3,-7.3,24.1,-8.6,18.3,-9.6,12.3,-10.7,6.3,-11.8,0.4,-13.1,-5.6,-14.5,-11.5,-15.2,-17.4,-13.4,-23.1,-9.2,-27.4]}],[{"c":[-35.36,41.55],"m":[0.8422,0.1126,-0.0003,0.7685],"p":[7.3,-43.6,16.1,-41,22.7,-34.6,25.6,-25.9,24.4,-16.8,21.9,-7.9,19.4,1.1,17.1,10,14.7,19,12.5,28,9.5,36.6,2.2,42.2,-6.9,43.2,-15.6,40.5,-22.6,34.5,-26,26,-24.5,16.9,-22.2,7.9,-19.9,-1.1,-17.5,-10,-15.1,-18.9,-12.6,-27.9,-8.8,-36.2,-1.7,-42]},{"c":[28.69,51.45],"m":[0.9558,-0.0191,0.0271,0.7368],"p":[9.1,-43.5,17.2,-40.2,22,-32.9,22.9,-24.1,21.7,-15.2,20.1,-6.5,18.1,2.2,15.6,10.8,12.7,19.2,9.3,27.5,4,34.6,-3.3,39.5,-11.9,41.8,-20.5,40.1,-25,32.8,-22.7,24.3,-19.5,16,-16.7,7.5,-14.3,-1.1,-12.4,-9.8,-10.9,-18.6,-9.6,-27.4,-6,-35.5,0.5,-41.4]}],[{"c":[-78.71,24.25],"m":[0.7453,0.225,-0.0188,0.79],"p":[-1.1,-27.9,5.2,-26.2,10.7,-22.6,15.2,-17.9,18.6,-12.2,20.9,-6.1,22.1,0.4,22,7,20.7,13.4,17.9,19.3,13.4,24.1,7.7,27.2,1.1,27.9,-5.2,26.2,-10.7,22.7,-15.2,17.9,-18.6,12.3,-20.9,6.1,-22.1,-0.4,-22,-6.9,-20.7,-13.4,-17.9,-19.3,-13.4,-24.1,-7.6,-27.2]},{"c":[-18.72,19.22],"m":[0.8678,0.0829,-0.051,0.8273],"p":[-0.2,-28.2,7.2,-27.3,14,-24.5,19.9,-20.1,24.4,-14.2,27.3,-7.4,28.3,-0.1,27.3,7.2,24.6,14,20.1,19.9,14.3,24.4,7.5,27.3,0.2,28.2,-7.2,27.3,-14,24.5,-19.9,20.1,-24.4,14.3,-27.3,7.4,-28.3,0.1,-27.3,-7.2,-24.6,-14,-20.1,-19.9,-14.3,-24.4,-7.5,-27.3]}],[{"c":[-20.51,17.91],"m":[0.8649,0.0862,-0.0533,0.83],"p":[-22.3,-10.9,-17,-10.4,-11.7,-9.3,-6.5,-8.3,-1.2,-7.3,4.1,-6.2,9.3,-5.2,14.6,-4.1,19.8,-3,24.9,-1.4,27.7,3,26.6,8.1,22.3,11,17,10.4,11.7,9.3,6.5,8.2,1.2,7.2,-4.1,6.2,-9.3,5.1,-14.6,4.1,-19.9,3.1,-25,1.5,-27.7,-2.9,-26.7,-8.1]},{"c":[38.26,28.26],"m":[0.9668,-0.0319,-0.0337,0.8073],"p":[-17.9,-10.6,-13.3,-10,-8.7,-9,-4.2,-8,0.3,-7,4.9,-6,9.4,-5,13.9,-3.9,18.5,-2.9,22.2,-0.5,23.1,4,21.6,8.4,17.9,10.9,13.3,10,8.8,8.9,4.3,7.9,-0.3,6.9,-4.8,5.9,-9.4,5,-13.9,4,-18.4,2.9,-22.2,0.4,-23.4,-4,-21.8,-8.3]}],[{"c":[-45.58,48.24],"m":[0.8216,0.1364,0.0224,0.7422],"p":[-5.8,-29.8,0.4,-28.8,5.6,-25.3,8.7,-19.9,9.9,-13.7,11.1,-7.5,12.3,-1.4,13.7,4.8,15.3,10.9,16.9,17,16.6,23.1,12.5,27.7,6.5,29.3,0.3,28.3,-5.1,25.1,-8.7,20,-10.4,13.9,-12,7.8,-13.4,1.7,-14.6,-4.5,-15.8,-10.7,-16.7,-16.9,-15.7,-23.1,-11.7,-27.8]},{"c":[12.03,45.07],"m":[0.9202,0.0222,0.0036,0.764],"p":[20.4,-12.6,24.5,-10.1,24.9,-5.3,21.9,-1.4,17.4,0.5,12.7,2.3,8.1,4,3.3,5.6,-1.4,7.1,-6.2,8.5,-11,9.8,-15.8,11,-20.7,11.7,-24.7,9.1,-25.4,4.3,-22.2,0.7,-17.4,-0.6,-12.6,-1.9,-7.8,-3.2,-3,-4.7,1.7,-6.2,6.4,-7.7,11.1,-9.4,15.7,-11.2]}],[{"c":[-15.51,27.97],"m":[0.8737,0.0761,-0.0341,0.8077],"p":[0.9,-19.1,5.1,-18.6,8.9,-16.5,11.5,-13.2,12.8,-9.1,12.6,-4.8,11.7,-0.6,11,3.6,10.2,7.8,9,12,6.7,15.5,3.2,18,-0.9,19.1,-5.2,18.6,-8.9,16.5,-11.6,13.2,-12.8,9.1,-12.6,4.8,-11.7,0.6,-10.9,-3.6,-10.1,-7.8,-9.1,-12,-6.8,-15.6,-3.3,-18]},{"c":[35.1,34.96],"m":[0.9619,-0.0261,-0.0179,0.7889],"p":[3.1,-19.1,6.9,-17.6,9.6,-14.7,11.1,-10.9,11.2,-6.8,10.6,-2.8,9.9,1.2,9.1,5.2,8.2,9.2,6.6,13,4.1,16.1,0.7,18.3,-3.3,18.9,-7.2,17.7,-10,14.7,-11.3,10.9,-11.1,6.8,-10.2,2.9,-9.4,-1.1,-8.7,-5.1,-8,-9.2,-6.7,-13,-4.3,-16.3,-0.9,-18.5]}],[{"c":[-14,10.42],"m":[0.8738,0.076,-0.0688,0.8479],"p":[-13.3,-26.2,-7.2,-25,-2.6,-20.9,1.5,-16.1,5.5,-11.4,9.5,-6.6,13.5,-1.8,17.4,3,21.3,7.9,23.7,13.6,22.8,19.7,19,24.5,13.1,26.5,7.1,25.1,2.6,20.8,-1.3,16,-5.2,11.1,-9.2,6.3,-13.2,1.6,-17.3,-3.2,-21.4,-7.9,-24,-13.4,-23.1,-19.5,-19.1,-24.2]},{"c":[38.74,7.08],"m":[0.9656,-0.0304,-0.0829,0.8643],"p":[3.7,-28.7,9,-26.6,12.8,-22.3,14.8,-16.9,14.2,-11.2,12.9,-5.6,11.4,-0.1,9.8,5.5,8,11,6,16.4,3.9,21.7,0.5,26.3,-4.8,28.2,-10.3,26.6,-14,22.3,-15.4,16.8,-14.2,11.2,-12.1,5.8,-10.2,0.3,-8.4,-5.1,-6.8,-10.7,-5.3,-16.2,-4,-21.8,-1.6,-27]}],[{"c":[-72.29,9],"m":[0.7641,0.2032,-0.0596,0.8373],"p":[11.5,-23.5,16.3,-21.4,19,-16.8,19,-11.6,16.5,-6.9,13.1,-2.8,9.7,1.3,6.4,5.5,3.3,9.8,0.2,14.1,-2.7,18.6,-5.9,22.8,-10.8,24.3,-15.4,21.8,-17.9,17.2,-18.3,11.9,-16.5,7,-13.5,2.5,-10.5,-1.9,-7.4,-6.2,-4.2,-10.4,-0.8,-14.5,2.6,-18.6,6.5,-22.2]},{"c":[-25.51,24.69],"m":[0.858,0.0943,-0.0392,0.8136],"p":[-3.6,-27.6,1.6,-25.4,4.8,-20.8,6.3,-15.3,7.8,-9.8,9.3,-4.4,10.9,1.1,12.4,6.6,14,12,15.2,17.6,13.5,22.9,9.2,26.5,3.7,27.5,-1.5,25.4,-4.7,20.8,-6.4,15.4,-7.9,9.9,-9.5,4.4,-11,-1.1,-12.5,-6.5,-14,-12,-15.1,-17.6,-13.4,-22.9,-9.1,-26.6]}],[{"c":[-25.15,48.82],"m":[0.8588,0.0934,0.0156,0.7501],"p":[-0.6,-21.9,5.3,-21.2,10.9,-19.3,15.9,-16,19.9,-11.6,22.7,-6.3,23.8,-0.4,23.1,5.5,20.8,11,17,15.7,12.2,19.1,6.6,21.2,0.6,21.9,-5.3,21.2,-10.9,19.3,-15.9,16,-19.9,11.6,-22.7,6.3,-23.8,0.4,-23.1,-5.5,-20.8,-11,-17,-15.7,-12.2,-19.1,-6.6,-21.2]},{"c":[38.08,39.92],"m":[0.9708,-0.0365,-0.0038,0.7726],"p":[1,-12.1,4,-11.8,6.6,-10.5,8.7,-8.4,10,-5.7,10.6,-2.8,10.5,0.2,9.8,3.1,8.5,5.8,6.7,8.2,4.5,10.1,1.9,11.5,-1,12.2,-4,11.8,-6.6,10.5,-8.7,8.4,-10,5.7,-10.6,2.8,-10.5,-0.2,-9.8,-3.1,-8.5,-5.8,-6.7,-8.2,-4.5,-10.1,-1.9,-11.5]}],[{"c":[-32.01,15.87],"m":[0.8468,0.1073,-0.0554,0.8324],"p":[3.5,-30.4,9.7,-29.3,14.5,-25.3,16.6,-19.4,15.7,-13.2,14.2,-7,12.7,-0.8,11.3,5.4,9.9,11.6,8.6,17.8,6.9,23.9,2.8,28.6,-3.2,30.6,-9.4,29.3,-14.2,25.3,-16.4,19.4,-15.9,13.1,-14.5,6.9,-13.1,0.7,-11.7,-5.5,-10.2,-11.7,-8.7,-17.8,-6.8,-23.9,-2.5,-28.4]},{"c":[22.4,27.88],"m":[0.9348,0.0053,-0.036,0.8099],"p":[3.4,-30.7,9.3,-29,13.6,-24.6,15.4,-18.7,14.8,-12.5,13.7,-6.4,12.4,-0.3,11,5.8,9.5,11.8,7.9,17.8,5.7,23.7,1.5,28.2,-4.3,30.3,-10.3,29.1,-14.6,24.7,-15.9,18.7,-14.5,12.6,-12.9,6.6,-11.3,0.5,-9.9,-5.5,-8.7,-11.6,-7.5,-17.8,-6.2,-23.8,-2.4,-28.7]}],[{"c":[-72.96,29.44],"m":[0.7628,0.2046,-0.0101,0.7799],"p":[-6,-46.2,2,-42,6.5,-34,8.1,-24.9,9.8,-15.8,12.1,-6.8,14.7,2.1,17.8,10.8,21.4,19.3,24.8,27.9,24.4,37,18.2,43.6,9.1,44.3,0.8,40.4,-5.4,33.6,-9.5,25.3,-12.9,16.7,-15.9,8,-18.5,-0.9,-20.7,-9.9,-22.4,-19,-23.1,-28.2,-20.7,-37.1,-14.8,-44.1]},{"c":[-16,24.42],"m":[0.8726,0.0774,-0.0411,0.8159],"p":[-9.2,-45.8,0.2,-44.2,7.7,-38.1,11.5,-29.3,14.3,-20,17.1,-10.7,19.8,-1.4,22.6,7.9,25.4,17.2,27.4,26.7,24.9,35.9,18.2,42.8,9.1,45.8,-0.4,44.3,-7.8,38.2,-11.4,29.3,-14.2,20,-16.9,10.7,-19.7,1.4,-22.5,-7.9,-25.3,-17.2,-27.3,-26.6,-25,-35.9,-18.4,-42.9]}],[{"c":[-30.81,47.02],"m":[0.8494,0.1043,0.0123,0.7539],"p":[0.3,-26.1,7.3,-24.9,13.9,-22.2,19.6,-18,24.1,-12.5,27,-6.1,28.1,0.9,27.1,7.9,24.2,14.4,19.5,19.7,13.5,23.6,6.8,25.7,-0.3,26.1,-7.3,24.9,-13.9,22.2,-19.6,18,-24.1,12.5,-27,6.1,-28.1,-0.9,-27.1,-7.9,-24.2,-14.4,-19.5,-19.7,-13.5,-23.6,-6.8,-25.7]},{"c":[37.73,55.36],"m":[0.9823,-0.0498,0.0482,0.7122],"p":[6.7,-24.9,13,-24.3,18.5,-21.4,22.2,-16.3,23.7,-10.1,23.4,-3.8,21.6,2.3,18.8,7.9,15,13,10.5,17.5,5.3,21.1,-0.5,23.7,-6.7,24.9,-13,24.3,-18.5,21.4,-22.2,16.3,-23.7,10.1,-23.4,3.8,-21.6,-2.3,-18.8,-7.9,-15,-13,-10.5,-17.5,-5.3,-21.1,0.5,-23.7]}],[{"c":[-60.83,33.76],"m":[0.7938,0.1687,-0.0078,0.7772],"p":[18,-9.3,22.5,-7.8,25,-3.7,24.4,1.1,20.6,3.9,15.8,4.7,11,5.5,6.1,6.2,1.3,6.9,-3.5,7.5,-8.4,8.1,-13.2,8.6,-18.1,9.1,-22.5,7.3,-24.9,3.1,-24.6,-1.7,-20.7,-4.2,-15.8,-4.7,-11,-5.2,-6.1,-5.8,-1.3,-6.4,3.6,-7.1,8.4,-7.8,13.2,-8.6]},{"c":[-3.89,31.47],"m":[0.8918,0.0551,-0.028,0.8006],"p":[21.9,-11.9,26.2,-9.1,27.2,-4,24.5,0.5,19.6,2.3,14.4,3.6,9.3,4.9,4.1,6.2,-1.1,7.5,-6.3,8.7,-11.5,9.8,-16.7,10.9,-21.9,11.4,-26.3,8.6,-27.5,3.5,-24.6,-0.8,-19.6,-2.4,-14.4,-3.5,-9.2,-4.6,-4,-5.8,1.2,-7,6.4,-8.3,11.5,-9.6,16.7,-10.9]}],[{"c":[-50.76,6.04],"m":[0.8122,0.1474,-0.0715,0.8511],"p":[5.7,-31.9,12,-29.8,16.1,-24.7,16.7,-18.2,15.2,-11.8,13.7,-5.4,12.3,1.1,11,7.6,9.9,14.2,8.9,20.7,6.5,26.8,1.5,31.1,-4.9,32.2,-11,29.8,-15.1,24.7,-16.5,18.3,-15.7,11.7,-14.6,5.2,-13.4,-1.4,-12,-7.8,-10.5,-14.3,-8.9,-20.7,-5.9,-26.6,-0.7,-30.6]},{"c":[5.13,18.99],"m":[0.9044,0.0405,-0.054,0.8308],"p":[-20.7,-10.6,-15.7,-9.9,-10.8,-8.9,-5.9,-7.8,-1,-6.7,3.9,-5.7,8.8,-4.5,13.7,-3.4,18.6,-2.3,23.3,-0.7,25.8,3.5,24.8,8.3,20.6,10.8,15.7,9.9,10.8,8.8,5.9,7.6,1,6.5,-3.9,5.5,-8.8,4.4,-13.7,3.4,-18.6,2.3,-23.3,0.8,-25.9,-3.3,-24.9,-8.1]}],[{"c":[35.28,15.86],"m":[0.9582,-0.0219,-0.0625,0.8406],"p":[-1.8,-19.1,2.1,-18,5.3,-15.6,7.5,-12.1,8.7,-8.2,9.5,-4.1,10.3,-0.1,10.9,3.9,11.3,8,10.7,12.1,8.7,15.7,5.6,18.2,1.6,19.2,-2.3,18.2,-5.5,15.7,-7.5,12.1,-8.4,8.1,-9.1,4.1,-9.8,0,-10.6,-4,-11.3,-8,-10.8,-12.1,-9,-15.7,-5.8,-18.3]},{"c":[78.06,7.62],"m":[1.1203,-0.2098,-0.0911,0.8738],"p":[-3.2,-19,0,-17.3,2.3,-14.5,3.8,-11.2,4.8,-7.7,5.6,-4.1,6.3,-0.5,6.9,3,7.4,6.7,7.5,10.3,7,13.9,5.6,17.2,2.6,19.1,-0.6,17.7,-2.6,14.7,-3.8,11.2,-4.4,7.6,-4.9,4,-5.5,0.4,-6.3,-3.2,-7.1,-6.7,-7.6,-10.3,-7.4,-13.9,-6.2,-17.4]}],[{"c":[-79.83,26.36],"m":[0.7403,0.2308,-0.0119,0.782],"p":[-4.7,-30.5,0.5,-28.1,3.2,-22.9,4.3,-17.1,5.4,-11.2,6.6,-5.5,8.1,0.3,9.8,6,11.6,11.6,13.6,17.2,14.4,23,11.9,28.2,6.4,29.8,1.1,27.3,-2.6,22.7,-4.8,17.2,-6.7,11.6,-8.4,5.9,-9.9,0.2,-11.2,-5.6,-12.4,-11.4,-13.3,-17.3,-12.9,-23.2,-10,-28.3]},{"c":[-35.83,43.2],"m":[0.8412,0.1137,0.004,0.7635],"p":[12,-24.6,17.7,-23,21.9,-18.9,23.3,-13.2,21.6,-7.6,17.9,-2.9,14,1.6,10,6,6.1,10.5,2.1,14.9,-1.9,19.3,-6.3,23.3,-12,24.4,-17.7,22.6,-22,18.6,-23.7,13,-21.8,7.5,-17.8,3.1,-13.8,-1.3,-9.8,-5.8,-5.9,-10.3,-2,-14.7,1.9,-19.2,6.3,-23.2]}],[{"c":[-23.73,21.03],"m":[0.8604,0.0915,-0.0467,0.8223],"p":[6,-27.5,11.2,-25.5,14.6,-21,14.9,-15.4,13.4,-9.9,11.9,-4.4,10.3,1.1,8.8,6.6,7.2,12,5.8,17.5,3.8,22.9,-0.3,26.6,-5.9,27.5,-11.1,25.5,-14.5,21,-14.9,15.4,-13.5,9.9,-11.9,4.4,-10.4,-1.1,-8.9,-6.6,-7.3,-12,-5.7,-17.5,-3.8,-22.8,0.4,-26.6]},{"c":[31.32,14.25],"m":[0.9499,-0.0123,-0.0658,0.8445],"p":[-11.1,-23.8,-6,-22,-2.1,-18.2,1.4,-14,4.8,-9.8,8.2,-5.5,11.5,-1.1,14.6,3.4,17.6,8,19.3,13.1,18.6,18.5,15.5,22.8,10.4,24.6,5.5,22.5,2.3,18.1,-0.8,13.6,-4,9.2,-7.3,4.8,-10.7,0.6,-14.2,-3.7,-17.7,-7.8,-20,-12.7,-19.5,-18.1,-16.3,-22.4]}],[{"c":[-39.33,8.99],"m":[0.8335,0.1227,-0.0677,0.8467],"p":[1.7,-23.6,7.8,-22.5,13.2,-19.8,17.8,-15.7,21.1,-10.6,22.9,-4.7,23.2,1.4,21.9,7.4,19.2,12.8,15.1,17.5,10.1,20.9,4.4,23.1,-1.7,23.6,-7.8,22.5,-13.2,19.8,-17.8,15.7,-21.1,10.6,-23,4.7,-23.2,-1.4,-21.9,-7.4,-19.2,-12.9,-15.1,-17.5,-10.1,-21,-4.4,-23.1]},{"c":[22.19,22.7],"m":[0.9335,0.0067,-0.0472,0.8229],"p":[-0.3,-12.6,2.8,-12.2,5.7,-10.9,8.1,-8.9,9.9,-6.3,11.1,-3.4,11.6,-0.3,11.3,2.8,10.2,5.8,8.5,8.5,6.2,10.6,3.4,12,0.3,12.6,-2.8,12.2,-5.7,11,-8.1,8.9,-9.9,6.4,-11.1,3.4,-11.6,0.3,-11.3,-2.8,-10.3,-5.8,-8.5,-8.5,-6.2,-10.6,-3.4,-12]}],[{"c":[-64.84,34.12],"m":[0.7839,0.1802,-0.0042,0.773],"p":[-5.2,-30.2,0.6,-28.8,4.9,-24.5,6.9,-18.8,7.9,-12.8,9,-6.8,10.2,-0.8,11.6,5.1,13.2,11,15,16.8,15.2,22.9,12.1,27.9,6.3,29.7,0.5,28.1,-4.2,24.2,-7,18.9,-8.7,13,-10.2,7.1,-11.6,1.2,-12.9,-4.8,-13.9,-10.8,-14.8,-16.8,-14.1,-22.8,-10.7,-27.8]},{"c":[-13.52,32.91],"m":[0.8771,0.0721,-0.0241,0.7961],"p":[-3.9,-30.2,2.2,-28.6,6.6,-24.3,8.7,-18.4,10.1,-12.3,11.5,-6.1,12.9,0,14.3,6.2,15.7,12.3,16.5,18.6,14.5,24.4,9.8,28.6,3.8,30.2,-2.3,28.7,-6.8,24.4,-8.7,18.4,-10.1,12.3,-11.4,6.1,-12.8,0,-14.2,-6.2,-15.6,-12.3,-16.5,-18.5,-14.5,-24.4,-9.9,-28.6]}],[{"c":[-21.85,50.88],"m":[0.8546,0.0982,0.0221,0.7426],"p":[7.6,-41.4,16.1,-39,22.8,-33.2,25.9,-24.9,25,-16.1,22.5,-7.5,20,1.1,17.5,9.7,14.9,18.2,12.3,26.8,8.7,34.9,1.2,39.7,-7.6,40.5,-16.2,38.2,-23.4,33,-26.9,25,-24.9,16.3,-22.3,7.7,-19.7,-0.8,-17.2,-9.4,-14.6,-18,-12.2,-26.6,-8.2,-34.5,-1.2,-39.8]},{"c":[35.55,57.14],"m":[0.981,-0.0483,0.0549,0.7046],"p":[8.8,-41.2,16.8,-39.2,21.7,-32.4,22.4,-24,21.2,-15.6,19.5,-7.3,17.4,1,14.8,9,11.7,16.9,7.9,24.5,2.5,31,-4.4,35.9,-12.3,38.8,-20.7,38.7,-25.1,32.2,-22,24.3,-18.5,16.6,-15.5,8.7,-13.1,0.5,-11.1,-7.7,-9.7,-16.1,-8.3,-24.4,-4.9,-32.2,1,-38.2]}],[{"c":[-71.51,31.08],"m":[0.7666,0.2003,-0.0069,0.7762],"p":[-2.6,-27.5,4,-26.2,9.9,-23.1,15,-18.7,19,-13.3,21.9,-7.2,23.5,-0.7,23.8,6,22.6,12.6,19.7,18.6,15.2,23.6,9.2,26.7,2.6,27.5,-4,26.2,-9.9,23.1,-15,18.7,-19,13.3,-21.9,7.2,-23.5,0.7,-23.8,-6,-22.6,-12.6,-19.7,-18.6,-15.2,-23.6,-9.2,-26.7]},{"c":[-8.31,27.7],"m":[0.8846,0.0634,-0.0354,0.8092],"p":[0.3,-28.2,7.5,-27.2,14.3,-24.4,20.1,-19.9,24.5,-14,27.2,-7.2,28.1,0.1,27,7.4,24.1,14.1,19.6,19.9,13.8,24.4,7,27.2,-0.2,28.2,-7.5,27.2,-14.3,24.4,-20.1,19.9,-24.5,14,-27.2,7.2,-28.1,-0.1,-27,-7.4,-24.1,-14.1,-19.6,-19.9,-13.8,-24.4,-7,-27.2]}],[{"c":[-37.96,1.21],"m":[0.8336,0.1226,-0.0836,0.8651],"p":[-19.1,-9.5,-14,-8.9,-8.8,-8.3,-3.6,-7.6,1.6,-6.8,6.7,-6,11.9,-5.2,17,-4.3,22.2,-3.4,26.3,-0.4,27.1,4.6,24.1,8.8,19.1,9.7,14,8.8,8.8,7.9,3.6,7.1,-1.5,6.3,-6.7,5.6,-11.9,4.9,-17,4.3,-22.2,3.7,-26.5,1,-27,-4.1,-24.1,-8.3]},{"c":[20.65,13.99],"m":[0.9298,0.011,-0.0655,0.8442],"p":[-18.8,-11.8,-13.9,-10.7,-8.9,-9.5,-4,-8.3,0.9,-7,5.9,-5.6,10.8,-4.3,15.6,-2.8,20.5,-1.4,24.5,1.6,25.6,6.5,23.5,11,18.8,12.1,13.9,10.6,9,9.2,4.1,7.8,-0.8,6.5,-5.7,5.2,-10.7,4,-15.6,2.8,-20.6,1.6,-24.7,-1.2,-25.9,-6,-23.6,-10.4]}],[{"c":[-24.72,42.25],"m":[0.8599,0.0921,-0.0014,0.7698],"p":[-2.3,-31.1,3.9,-29.3,8.6,-24.8,10.7,-18.7,11.7,-12.2,12.7,-5.7,13.8,0.7,14.9,7.1,16,13.6,16.7,20.1,14.2,26,8.9,29.7,2.5,30.8,-3.8,29.1,-8.6,24.9,-10.7,18.7,-11.9,12.3,-13,5.8,-14.1,-0.6,-15.1,-7.1,-16.1,-13.5,-16.4,-20,-13.8,-25.9,-8.7,-29.9]},{"c":[33.99,35.78],"m":[0.9597,-0.0236,-0.016,0.7868],"p":[18.6,-12.4,22.2,-9.9,22.8,-5.4,20.7,-1.3,16.6,0.8,12.2,2.4,7.9,4,3.5,5.6,-0.9,7,-5.4,8.4,-9.8,9.7,-14.3,10.9,-18.8,11.6,-22.6,9.1,-23.3,4.6,-20.9,0.7,-16.6,-1,-12.1,-2.2,-7.7,-3.5,-3.2,-4.8,1.2,-6.2,5.6,-7.7,9.9,-9.3,14.3,-11]}],[{"c":[-34.42,36.82],"m":[0.8442,0.1103,-0.0117,0.7817],"p":[0.1,-18.6,4.3,-18.1,8,-16.2,10.7,-13.1,12.2,-9.1,12.1,-4.9,11.5,-0.8,11,3.4,10.4,7.6,9.6,11.7,7.4,15.3,4,17.7,-0.1,18.6,-4.2,18.1,-7.9,16.2,-10.7,13,-12.2,9.1,-12.2,4.9,-11.6,0.8,-11,-3.4,-10.4,-7.6,-9.5,-11.7,-7.4,-15.2,-3.9,-17.7]},{"c":[17.1,43.25],"m":[0.9288,0.0122,-0.0004,0.7686],"p":[1.6,-18.6,5.6,-17.9,9,-15.6,11.1,-12.1,11.8,-8.1,11.4,-4,10.8,0.1,10.3,4.1,9.6,8.2,8.1,12,5.6,15.2,2.2,17.5,-1.8,18.5,-5.8,17.9,-9.2,15.7,-11.3,12.2,-11.7,8.1,-11.1,4.1,-10.5,0,-10,-4.1,-9.4,-8.1,-8.2,-12,-5.7,-15.3,-2.4,-17.6]}]];
const MARK_GEO = { Re: 114.2705, halfW: 114.211, top: -91.73, bottom: 91.75, radius: 118.67, belt: 114.2 };
const EYE_FRAMES = {"sleeping":[13,22,4],"waking":[13],"idle":[0,8],"listening":[10,1,19],"thinking":[8,16,14,17,5],"searching":[15,9,3,20,12,18],"working":[7,16,11,10],"excited":[2,17,21,3,11],"surprised":[3,21],"suspicious":[14,5,23],"angry":[7,16],"drowsy":[4,22,13],"happy":[2,11,17,19],"curious":[3,21,0,15],"confused":[14,5,8],"bored":[4,22,0],"proud":[15,8,2],"shy":[0,24,13],"sad":[4,13,22],"laughing":[2,11,17],"scared":[3,21],"playful":[2,17,11,8],"celebrate":[2,8,17],"orbit":[0,8],"radar":[0,8],"progress":[0,8],"spawning":[3,0],"humming":[0,8],"loading":[0,8],"dictating":[10,1,19],"sending":[0,8],"receiving":[19,0,8],"uploading":[15,9,8],"writing":[15,9],"notifying":[3,21,0],"alerting":[3,21],"bouncing":[2,17],"dragging":[3,15,0],"powering-down":[13,22]};
const FRAME_HOLD = {"sleeping":[6000,10000],"waking":[800,800],"idle":[9000,16000],"listening":[2800,5000],"thinking":[2000,3600],"searching":[1000,1800],"working":[1800,3200],"excited":[1100,2000],"surprised":[2500,4000],"suspicious":[2600,4500],"angry":[2200,3800],"drowsy":[4000,8000],"happy":[2500,4500],"curious":[1800,3200],"confused":[2200,3800],"bored":[3500,6000],"proud":[3500,6000],"shy":[3000,5500],"sad":[4000,7000],"laughing":[1200,2400],"scared":[900,1800],"playful":[1500,3000],"celebrate":[1400,2600],"orbit":[4000,8000],"radar":[4000,8000],"progress":[4000,8000],"spawning":[1200,1200],"humming":[5000,9000],"loading":[6000,10000],"dictating":[4000,8000],"sending":[4000,8000],"receiving":[4000,8000],"uploading":[4000,8000],"writing":[4000,8000],"notifying":[1500,2600],"alerting":[2000,3600],"bouncing":[3000,6000],"dragging":[1600,3000],"powering-down":[6000,9000]};
const BLINK_EVERY = {"sleeping":null,"waking":null,"idle":[6000,14000],"listening":[3000,7000],"thinking":[3500,7000],"searching":[1600,4000],"working":[2800,5500],"excited":[2000,4000],"surprised":[1800,3500],"suspicious":[4500,8000],"angry":[3500,7000],"drowsy":null,"happy":[2500,5000],"curious":[2500,5500],"confused":[2800,5500],"bored":[4000,8000],"proud":[3500,7000],"shy":[3000,6000],"sad":[4000,8000],"laughing":[2500,5000],"scared":[1200,3000],"playful":[2000,4500],"celebrate":[2200,4500],"orbit":null,"radar":null,"progress":null,"spawning":null,"humming":[4000,8000],"loading":null,"dictating":null,"sending":null,"receiving":null,"uploading":null,"writing":null,"notifying":[2000,4000],"alerting":null,"bouncing":null,"dragging":[2200,4500],"powering-down":null};

// ------------------------------------------------------------------ the app's character motion, ported
// A line-by-line port of the app's mark component (the per-frame state machine, its springs, blink / wink /
// saccade / eye-frame timers, spins and hops, the morphs into a dot and the effects drawn around it, and the
// comet belts + confetti). Everything is in the app's own units: px of its 228 px mark, y down, ms.
// The page maps the result onto the 3D felt cloud (applyMark in main.js).
const MARK_GROUPS = [
  { label: 'Lifecycle', states: ['sleeping', 'waking', 'idle', 'listening', 'thinking', 'searching', 'working'] },
  { label: 'Reactions', states: ['excited', 'surprised', 'suspicious', 'angry', 'drowsy', 'happy', 'curious', 'confused', 'bored', 'proud', 'shy', 'sad', 'laughing', 'scared', 'playful', 'celebrate'] },
  { label: 'Agent morphs', states: ['orbit', 'radar', 'progress'] },
  { label: 'Product lifecycle', states: ['spawning', 'humming', 'loading', 'dictating', 'writing', 'sending', 'receiving', 'uploading', 'notifying', 'alerting', 'dragging', 'bouncing', 'powering-down'] },
];
const MARK_STATES = MARK_GROUPS.flatMap((g) => g.states);
// state -> the morph it turns into (the character shrinks into a dot and the effect plays around it)
const MORPH_OF = { thinking: 'dots', orbit: 'orbit', radar: 'radar', progress: 'progress', spawning: 'gather', dictating: 'wave', sending: 'send',
  receiving: 'receive', uploading: 'dock', bouncing: 'ball', loading: 'whirl', 'powering-down': 'standby', writing: 'pencil', alerting: 'bang' };
const MORPH_KINDS = ['dots', 'orbit', 'radar', 'progress', 'gather', 'wave', 'send', 'receive', 'dock', 'ball', 'whirl', 'pencil', 'bang', 'standby'];
const MORPH_DOT = { dots: 22, orbit: 19, radar: 19, progress: 19, gather: 19, wave: 16, send: 20, receive: 20, dock: 20, ball: 18, whirl: 15, pencil: 17, bang: 13, standby: 13 };
const TIMED = new Set(['progress', 'spawning']), TIMED_MS = { progress: 2500, spawning: 2000 }, TIMED_REST = 1500;
const SPIN_JOY = new Set(['happy', 'excited', 'proud']), SPIN_PLAY = new Set(['playful']);
const HOPS = [{ h: 48, d: 0.5 }, { h: 28, d: 0.382 }, { h: 14, d: 0.27 }, { h: 6, d: 0.177 }], HOPS_T = HOPS.reduce((a, h) => a + h.d, 0);
const FACE_SX = 0.79 * 1.18, FACE_SY = 0.7; // the cloud's face box (x gap scale with the app's face tune, y)
const CONFETTI = ['#f9705c', '#5b95f0', '#3fbe86', '#f5b13f', '#9a72ee', '#35c3bd'], STAR_COL = '#f4c34e';
const mSpring = (x) => ({ x, v: 0, t: x });
function mStep(n, w, z, s) { // the app's spring: critically/under-damped, fixed 1/120 s substeps
  n.v += (-2 * z * w * n.v - w * w * (n.x - n.t)) * s; n.x += n.v * s;
  if (!Number.isFinite(n.x) || !Number.isFinite(n.v)) { n.x = n.t; n.v = 0; }
}
const K2 = (n) => (n < 0.5 ? 4 * n * n * n : 1 - Math.pow(-2 * n + 2, 3) / 2);   // cubic in-out
const easeOut3 = (n) => 1 - Math.pow(1 - n, 3);
const backOut = (n) => 1 + 2.70158 * Math.pow(n - 1, 3) + 1.70158 * Math.pow(n - 1, 2);
const smooth01 = (n) => n * n * (3 - 2 * n);
function eyeLerp(A, B, t) {
  return A.map((a, i) => { const b = B[i];
    return { c: [a.c[0] + (b.c[0] - a.c[0]) * t, a.c[1] + (b.c[1] - a.c[1]) * t], m: a.m.map((v, j) => v + (b.m[j] - v) * t), p: a.p.map((v, j) => v + (b.p[j] - v) * t) }; });
}
// second moments of a closed polygon -> the ellipse with the same area moments (centre, semi-axes, major-axis angle; y down)
function ellipseOf(P) {
  let A = 0, cx = 0, cy = 0, xx = 0, yy = 0, xy = 0; const n = P.length / 2;
  for (let i = 0; i < n; i++) {
    const x0 = P[2 * i], y0 = P[2 * i + 1], j = (i + 1) % n, x1 = P[2 * j], y1 = P[2 * j + 1], c = x0 * y1 - x1 * y0;
    A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c; xx += (x0 * x0 + x0 * x1 + x1 * x1) * c; yy += (y0 * y0 + y0 * y1 + y1 * y1) * c; xy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c;
  }
  A /= 2; if (Math.abs(A) < 1e-9) return { cx: 0, cy: 0, a: 0.01, b: 0.01, ang: 0 };
  cx /= 6 * A; cy /= 6 * A; xx = xx / 12 / A - cx * cx; yy = yy / 12 / A - cy * cy; xy = xy / 24 / A - cx * cy;
  const tr = (xx + yy) / 2, d = Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy);
  return { cx, cy, a: 2 * Math.sqrt(Math.max(tr + d, 1e-6)), b: 2 * Math.sqrt(Math.max(tr - d, 1e-6)), ang: 0.5 * Math.atan2(2 * xy, xx - yy) };
}
function eyeShape(e, sx, sy) { // the app draws each eye as m * diag(sx, sy) * outline
  const m = e.m, p = e.p, Q = new Array(p.length);
  for (let i = 0; i < p.length; i += 2) { const x = p[i] * sx, y = p[i + 1] * sy; Q[i] = m[0] * x + m[2] * y; Q[i + 1] = m[1] * x + m[3] * y; }
  return ellipseOf(Q);
}
const EYE_REST = MARK_EYES[0].map((e) => eyeShape(e, 1, 1));

// ---- comet belts and confetti (the app's particle layer around the mark)
class MarkParticles {
  constructor(sim) { this.sim = sim; this.m = []; this.o = 0; this.l = 1; this.c = false; this.u = false; this.d = -1;
    this.y = false; this.k = false; this.v = []; this.x = []; this.E = 4; this.N = 0; this.P = 0; this.J = 0; this.h = 0; }
  R(a, b) { return this.sim.R(a, b); }
  rad() { return this.sim.belt / 114.2705; }
  burst(W = 20, H = 1, G = 0) {
    if (this.m.length > 120) return;
    for (let Y = 0; Y < W; Y++) {
      const U = (Y / W) * PI * 2 + this.R(-0.35, 0.35), ee = this.R(96, 116) * this.rad(), te = this.R(170, 360) * H, ne = -sin(U), j = cos(U), Z = G * te * 0.2, star = this.sim.rnd() < 0.18;
      this.m.push({ x: cos(U) * ee, y: sin(U) * ee, vx: cos(U) * te + ne * Z, vy: sin(U) * te + j * Z - this.R(20, 75), life: 0, max: this.R(0.45, 0.85),
        r: star ? this.R(4, 7) : this.R(3.5, 8), rot: this.R(0, 360), vr: this.R(-260, 260), curl: 0, color: star ? STAR_COL : CONFETTI[(this.sim.rnd() * 6) | 0],
        round: !star && this.sim.rnd() < 0.3, star, ret: 0, orbit: null, op: 0, sz: 0 });
    }
  }
  belts(W = 1) {
    const H = this.R(-0.85, 0.85); this.x = [];
    for (let G = 0; G < W; G++) this.x.push({ tilt: this.R(0.16, 0.5), roll: H + (G * PI) / W + this.R(-0.12, 0.12) });
    this.E = W > 1 ? W * 3 : Math.round(this.R(3, 5)); this.N = this.R(0, 360);
  }
  comet(W, H, G) {
    if (this.m.length > 110) return;
    this.x.length || this.belts();
    const Y = this.x[G % this.x.length], E = this.E, rr = this.sim.rnd;
    this.m.push({ x: 0, y: 0, ret: 0, life: 0, max: 9, r: E <= 3 ? this.R(8, 10.5) : E === 4 ? this.R(6.6, 8.6) : this.R(5.6, 7.4), color: CONFETTI[(rr() * 6) | 0],
      hue: this.N + (G * 360) / Math.max(E, 1) + this.R(-14, 14), hueSpan: this.R(45, 95) * (rr() < 0.5 ? 1 : -1), hueVel: this.R(18, 42) * (rr() < 0.5 ? 1 : -1),
      orbit: { lam: W, lamVel: H * this.R(0.5, 1.1), tilt: Y.tilt + this.R(-0.04, 0.04), roll: Y.roll + this.R(-0.05, 0.05),
        rad: this.rad() * 116 + ((G / this.x.length) | 0) * (38 / Math.max(Math.ceil(E / this.x.length) - 1, 1)) + this.R(-1.5, 1.5), radVel: this.R(0, 2.5), follow: this.R(0.74, 0.94), carry: 0, arc: this.R(2.2, 3.4) },
      hist: [], op: 0, w: 0 });
  }
  update(now, dt, G) {
    const Y = this.d < 0 ? dt : Math.max((now - this.d) / 1000, 0);
    this.d = now; this.l = G.sizeScale; this.o = G.spinAngle; this.c = G.wideStyle; this.u = G.sustain === true;
    // angular speed of the spin drives the belts
    let H = this.o - this.P; if (!isFinite(H) || Math.abs(H) > 1.2) H = 0; this.P = this.o;
    const was = Math.abs(this.J) >= 0.9; this.J = dt > 0 ? H / dt : 0; const is = Math.abs(this.J) >= 0.9;
    if (!was && is) { this.belts(this.c ? 3 : 1); this.y = false; this.k = false; }
    if (was && !is) { this.v.length = 0; this.k = false; }
    this.h = this.o;
    const sp = Math.abs(this.J), live = this.m.some((U) => U.orbit != null && U.ret < 1);
    if (this.u && this.y && this.v.length === 0 && sp >= 0.9 && !live) { this.y = false; this.k = true; }
    if (!this.y && (sp >= 5 || (this.u && this.k && sp >= 0.9))) { this.y = true; this.k = false; this.v = []; for (let U = 0; U < this.E; U++) this.v.push({ at: now + U * this.R(55, 105), i: U }); }
    while (this.v.length && now >= this.v[0].at) { const U = this.v.shift(); this.comet(this.h - this.R(0, 0.18), Math.sign(this.J) || 1, U.i); }
    this.step(dt, Y);
  }
  step(W, H) {
    if (!this.m.length) return;
    const spinning = Math.abs(this.J) >= 0.9, J = this.J, te = J * W, keep = [];
    for (const j of this.m) {
      j.life += j.life > 0 ? H : W;
      const Z = clamp(j.life / j.max, 0, 1);
      if (j.orbit) { j.ret = clamp(j.ret + (!spinning || Z > 0.55 ? H / 0.5 : -H / 0.35), 0, 1); if (j.ret >= 1) continue; }
      else if (j.life >= j.max) continue;
      if (j.orbit) {
        const ce = j.orbit;
        if (spinning) { ce.carry = J * ce.follow; ce.lam += te * ce.follow + ce.lamVel * W; ce.rad += ce.radVel * W; }
        else { ce.lam += (ce.carry + ce.lamVel) * W; ce.carry *= Math.exp(-2.6 * W); ce.lamVel *= Math.exp(-2.6 * W); ce.rad += ce.radVel * W; }
        const z = cos(ce.lam) * cos(ce.tilt), fe = 0.72 + 0.28 * clamp(z, 0, 1), ke = Math.min(j.life / 0.34, 1), be = ke * ke * (3 - 2 * ke);
        j.w = Math.max(j.r * fe * 1.7 * this.l * be * (1 - 0.72 * j.ret * j.ret), 0.5);
        j.op = Math.min(1, j.life / 0.26);
        const A = j.hist, last = A.length ? A[A.length - 1].l : ce.lam, dl = ce.lam - last, n = Math.min(Math.ceil(Math.abs(dl) / 0.09), 24);
        for (let q = 1; q <= n; q++) A.push({ l: last + (dl * q) / n });
        A.length || A.push({ l: ce.lam });
        const arc = ce.arc * (1 - j.ret * j.ret * (3 - 2 * j.ret));
        while (A.length > 2 && Math.abs(ce.lam - A[0].l) > arc) A.shift();
        const over = Math.abs(ce.lam - A[0].l) - arc;
        if (A.length >= 2 && over > 0) A[0] = { l: A[0].l + Math.sign(ce.lam - A[0].l) * over };
        if (A.length > 48) A.splice(0, A.length - 48);
        j.hue0 = (j.hue ?? 0) + (j.hueVel ?? 0) * j.life;
        keep.push(j); continue;
      }
      const se = Math.pow(0.94, W * 60);
      j.x += j.vx * W; j.y += j.vy * W; j.vx *= se; j.vy = j.vy * se + 40 * W;
      const le = j.life / j.max; j.op = le < 0.1 ? le / 0.1 : Math.pow(1 - (le - 0.1) / 0.9, 1.7); j.sz = Math.max(j.r * (1 - le * 0.4), 0.5);
      if (j.star) j.rot += j.vr * W;
      keep.push(j);
    }
    this.m = keep;
  }
  // a point of a comet's orbit in app px (x right, y down, z toward the viewer)
  static at(o, lam) {
    const G = o.rad * sin(lam), Y = -o.rad * cos(lam) * sin(o.tilt), U = cos(o.roll), ee = sin(o.roll);
    return [G * U - Y * ee, G * ee + Y * U, o.rad * cos(lam) * cos(o.tilt)];
  }
}

// ---- the state machine
class MarkSim {
  constructor(seed = 1) { this.reset(seed); }
  reset(seed = 1) {
    this.rnd = rngOf(seed);
    this.now = 0; this.acc = 0; this.state = 'idle'; this.stateAt = 0; this.pointer = null;
    this.xe = mSpring(1); this.fe = mSpring(0); this.ke = mSpring(0); this.be = mSpring(0); this.Ne = mSpring(1); this.Ae = mSpring(1); this.oe = mSpring(1);
    this.ve = mSpring(0); this.ge = mSpring(0); this.Le = mSpring(0); this.Me = mSpring(1); this.rt = mSpring(0); this.Sn = mSpring(0); this.vn = mSpring(0);
    this.eyeFrom = MARK_EYES[0]; this.eyeTo = MARK_EYES[0]; this.Se = 0; this.nn = 7;
    this.rn = null; this.it = null; this.ct = 0; this.Ze = 0; this.wt = 0; this.St = 0; this.Nt = 0; this.ot = 0; this.tt = 0; this.Ke = 0; this.Nn = 0;
    this.ye = 0; this.ue = 0; this.de = -1e9; this.Te = 0; this.Yt = -1; this.xn = -1; this.Vt = -0.7; this.lt = []; this.Cs = false; this.celebAt = 0;
    this.hs = this.R(2500, 5000); this.ys = null; this.vr = -1; this.Qt = false; this.Vs = null;
    this.Kr = 0; this.yi = 0; this.ki = 0; this.Yr = 0; this.Zr = 0; this.wi = 0; this.Mr = 0;
    this.Ft = 0; this.xt = 0; this.at = 1; this.Be = false; this.Ve = null; this.De = null; this.morphKey = null; this.morphAt = 0; this.timedOff = false; this.timedOffAt = 0; this.et = -1e9;
    this.ln = []; this.Mn = { x: 0, y: 0 }; this.ws = 0; this.belt = MARK_GEO.belt;
    this.parts = new MarkParticles(this);
    this.out = null;
    this.mn(0, 1 / 60);
  }
  R(a, b) { return a + this.rnd() * (b - a); }
  setState(s) { if (s !== this.state && MARK_STATES.includes(s)) { this.state = s; this.stateAt = this.now; } }
  advance(sec) { this.acc += sec; while (this.acc >= 1 / 60 - 1e-9) { this.frame(1 / 60); this.acc -= 1 / 60; } }
  // eye frame switch (the app's `en`): blend from wherever the eyes are now
  en(f, stiff = 7) {
    if (f === this.Se && this.xe.t === 1) return;
    const t = clamp(this.xe.x, 0, 1);
    this.eyeFrom = eyeLerp(this.eyeFrom, this.eyeTo, t); this.eyeTo = MARK_EYES[f]; this.Se = f;
    this.xe.x = 0; this.xe.v = 0; this.xe.t = 1; this.nn = stiff;
  }
  spin(n = 1, dir = this.rnd() < 0.5 ? 1 : -1) { if (!this.rn) this.rn = { x: 0, v: 0, t: n * PI * 2 * dir }; }
  hop() { if (this.vr < 0) this.vr = this.now; }
  spinFx(kind) { if (this.ys) return; const dir = this.rnd() < 0.5 ? 1 : -1; this.ys = { kind, t0: this.now, dir, turns: kind === 'spinDizzy' ? Math.round(this.R(3, 4)) : kind === 'spinWild' ? 9 : 1 }; }
  blink(ze) { // the blink keyframes (and sometimes a double blink)
    this.lt.push({ at: ze, v: 0.05 }, { at: ze + 70, v: 0.05 }, { at: ze + 150, v: 1.08 }, { at: ze + 300, v: 1 });
    if (this.rnd() < 0.14) this.lt.push({ at: ze + 370, v: 0.05 }, { at: ze + 480, v: 1 });
  }
  frame(dt) {
    const Pt = Math.min(dt, 0.1); this.now += dt * 1000; const ze = this.now, st = this.state;
    const mk = MORPH_OF[st] ?? null;
    if (mk !== this.morphKey) { this.morphKey = mk; this.morphAt = ze; this.timedOff = false; }
    let on = mk != null;
    if (mk && TIMED.has(st)) {
      if (!this.timedOff && ze - this.morphAt > (TIMED_MS[st] ?? 2500)) { this.timedOff = true; this.timedOffAt = ze; }
      else if (this.timedOff && ze - this.timedOffAt > TIMED_REST) { this.timedOff = false; this.morphAt = ze; }
      on = !this.timedOff;
    }
    this.Le.t = on ? 1 : 0;
    if (mk && mk !== this.Ve) {
      if (this.Ve && this.Le.x > 0.02) { this.De = this.Ve; this.Me.x = 0; this.Me.v = 0; this.Me.t = 1; }
      else { this.De = null; this.Me.x = 1; this.Me.v = 0; this.Me.t = 1; }
      this.Ve = mk; this.et = ze;
    }
    if (!mk && this.Le.x < 0.004) { this.Ve = null; this.De = null; }
    if (this.Me.x > 0.996) this.De = null;
    if (on !== this.Be) { if (on) this.at = this.rnd() < 0.5 ? 1 : -1; this.xt += PI * this.at; this.rt.t = this.xt; this.Be = on; } // half a turn in and out of a morph
    this.gr(ze);
    const n = Math.max(1, Math.ceil(Pt / (1 / 120))), s = Pt / n;
    for (let i = 0; i < n; i++) {
      mStep(this.xe, this.nn, 1, s); if (this.rn) mStep(this.rn, 6.2, 1, s);
      mStep(this.fe, 5, 0.9, s); mStep(this.ke, 3.5, 1, s); mStep(this.be, 4, 1, s); mStep(this.Ne, 10, 0.8, s); mStep(this.Ae, 26, 1, s); mStep(this.oe, 9, 0.85, s);
      mStep(this.Sn, 9, 0.55, s); mStep(this.vn, 6, 1, s); mStep(this.ve, 13, 1, s); mStep(this.ge, 13, 1, s); mStep(this.Le, 14, 1, s); mStep(this.Me, 11, 1, s); mStep(this.rt, 14, 1, s);
    }
    this.mn(ze, Pt);
    const hum = st === 'humming', load = st === 'loading';
    this.vn.t = hum ? 1 : 0;
    if (hum || load) {
      const Zt = (ze - this.stateAt) / 1000, dn = load ? 3 : 1.6;
      const w = Zt < 0.5 ? 7 * K2(Zt / 0.5) : Zt < 1.3 ? 7 + (dn - 7) * K2((Zt - 0.5) / 0.8) : dn + 0.3 * sin(Zt * 0.5);
      this.Ft += w * Pt;
    }
    if (this.rn) this.ws = this.rn.x; else if (this.Vs !== null) this.ws = this.Vs; else if (hum || load) this.ws = this.Ft;
    this.parts.update(ze, Pt, { spinAngle: this.ws, sizeScale: 1, wideStyle: (this.ys && this.ys.kind === 'spinWild') || this.Qt || hum, sustain: hum || load });
  }
  gr(ze) { // the app's per-state targets
    const Pt = this.state, mt = ze / 1000, Dt = (ze - this.stateAt) / 1000, R = (a, b) => this.R(a, b);
    const fe = this.fe, ke = this.ke, be = this.be, Ne = this.Ne, Ae = this.Ae;
    if (this.it !== Pt) {
      this.it = Pt; this.ct = 0; this.Ze = ze + R(...FRAME_HOLD[Pt]); this.wt = ze + R(1500, 7000);
      this.St = ze + (Pt === 'excited' ? R(400, 1100) : Pt === 'searching' ? R(800, 1600) : Pt === 'working' ? R(1200, 2400) : R(6000, 10000));
      this.Nt = ze + R(500, 1200); this.ot = ze + R(1200, 2200); this.tt = 0; this.ye = ze + R(500, 1400); this.ue = ze + R(3000, 8000);
      this.Yt = -1; this.xn = -1; this.ln = []; this.Cs = false;
      if (Pt === 'celebrate') this.celebAt = ze + 140;
      if (Pt !== 'waking' && Pt !== 'sleeping') { if (Pt !== 'drowsy') this.blink(ze); this.en(EYE_FRAMES[Pt][0], Pt === 'excited' ? 10 : 8); }
    }
    if (Pt === 'celebrate' && !this.ys && ze >= this.celebAt) { this.spinFx('spinWild'); this.celebAt = ze + 6200; }
    if (ze >= this.hs) {
      const joy = SPIN_JOY.has(Pt), play = SPIN_PLAY.has(Pt);
      if ((joy || play) && !this.rn && this.vr < 0 && !this.ys) {
        const r = this.rnd();
        if (joy) r < 0.55 ? this.spin(1) : this.spinFx('spinBounce');
        else r < 0.34 ? this.spinFx('spinBounce') : r < 0.62 ? this.hop() : r < 0.86 ? this.spinFx('spinDizzy') : this.spin(1);
      }
      this.hs = ze + R(9000, 18000);
    }
    let Mt = 1, Lt = 1; // eye openness, eye size
    switch (Pt) {
      case 'sleeping': {
        if (EYE_FRAMES.sleeping.includes(this.Se)) Mt = this.xe.x > 0.85 ? 1 : 0.08;
        else if (Dt < 1.2) { const d = Math.min(1, Dt / 1); Mt = Math.max(0.08, 1 - d * (1 + 0.15 * sin(Dt * 6.5))); }
        else { Mt = 0.08; if (Ae.x < 0.18) this.en(13, 11); }
        const En = Math.min(Dt / 2, 1), Zt = sin(clamp(Dt / 0.5, 0, 1) * PI);
        fe.t = 4 * En + sin(mt * 0.25) * 2; ke.t = -2 * En; be.t = 8 * En + sin(mt * 0.55) * 3 - Zt * 5; Ne.t = 1 + sin(mt * 0.55) * 0.016 + Zt * 0.05;
        break;
      }
      case 'waking': {
        if (Dt < 0.5) { Mt = 0.07; this.en(3, 12); be.t = 6; }
        else if (Dt < 1.2) { Mt = 1; Lt = 1.12; be.t = -5; ke.t = 0; fe.t = 0; Ne.t = 1.04; if (!this.Cs) { this.parts.burst(R(9, 13), 0.8); this.Cs = true; } }
        else if (Dt < 2.2) { if (this.lt.length === 0 && Dt < 1.4) this.blink(ze); this.en(0); be.t = 0; Ne.t = 1; }
        else { const Et = Math.min((Dt - 2.2) / 0.8, 1); this.en(0); fe.t = sin(Et * PI * 3) * 6 * (1 - Et); be.t = sin(mt * 0.9) * 2; }
        break;
      }
      case 'idle': fe.t = sin(mt * 0.5) * 1.5 + sin(mt * 0.17) * 0.6; ke.t = sin(mt * 0.27) * 1; be.t = sin(mt * 0.85) * 1.2; Ne.t = 1 + sin(mt * 0.85) * 0.007; break;
      case 'listening': {
        fe.t = 8 + sin(mt * 0.5) * 1.5; ke.t = 2; be.t = -2 + sin(mt * 0.8) * 0.8; Ne.t = 1.015;
        if (ze >= this.ot) { this.Ke = ze + 380; this.ot = ze + R(1800, 3200); }
        if (ze < this.Ke) { const Et = 1 - (this.Ke - ze) / 380; be.t += sin(Et * PI) * 4.5; fe.t += sin(Et * PI) * 2; } // a small nod
        break;
      }
      case 'thinking': fe.t = -9 + sin(mt * 0.35) * 5; ke.t = sin(mt * 0.3) * 5; be.t = sin(mt * 0.6) * 2.5; Ne.t = 1; break;
      case 'searching': { const Et = sin(mt * 1.3); fe.t = Et * 13; ke.t = Et * 7; be.t = sin(mt * 1.7) * 3; Ne.t = 1; if (ze >= this.St) { this.spin(); this.St = ze + R(4000, 7000); } break; }
      case 'working': { const Et = sin(mt * PI * 2 * 1.6); fe.t = 4 + Et * 2.5; ke.t = 3; be.t = 1.5 + Math.max(0, Et) * 3; Ne.t = 1 - Math.max(0, Et) * 0.02; if (ze >= this.St) { this.spin(1, 1); this.St = ze + R(6000, 9000); } break; }
      case 'excited': {
        const Et = (mt * 2.2) % 1, En = sin(Et * PI);
        be.t = -En * 10 + 2; Ne.t = Et < 0.1 ? 0.92 : Et < 0.3 ? 1.05 : 1; ke.t = sin(mt * 1.1) * 4; Lt = 1.06;
        if (ze >= this.St) { this.spin(1); this.St = ze + R(2800, 5000); }
        fe.t = sin(mt * PI * 2 * 1.1) * 7;
        break;
      }
      case 'surprised': { const Et = Math.min(Dt / 1.2, 1); ke.t = -4 * (1 - Et); be.t = -8 * (1 - Et); Ne.t = Dt < 0.2 ? 1.08 : 1; Lt = 1.15 - Et * 0.08; fe.t = sin(mt * 11) * 1.5 * (1 - Et); break; }
      case 'suspicious': fe.t = -6 + sin(mt * 0.3) * 3; ke.t = sin(mt * 0.25) * -4; be.t = 1 + sin(mt * 0.45) * 1.2; Ne.t = 1; Mt = 0.85; if (ze >= this.Nt) { fe.v += 30; this.Nt = ze + R(4000, 7000); } break;
      case 'angry': if (ze >= this.Nt) { this.Nn = ze + 420; be.v += 70; this.Nt = ze + R(1800, 3200); } fe.t = ze < this.Nn ? sin(ze * 0.05) * 4.5 : 0; ke.t = 0; be.t = 3.5; Ne.t = 0.975; break;
      case 'drowsy': {
        fe.t = sin(mt * 0.32) * 2.5; ke.t = sin(mt * 0.2) * 1.5; be.t = 6 + sin(mt * 0.36) * 2.2; Ne.t = 1 + sin(mt * 0.36) * 0.022; Mt = 0.34 + sin(mt * 0.8) * 0.07;
        if (ze >= this.ot && !this.tt) this.tt = ze;
        if (this.tt) { // nods off, jerks awake, settles
          const En = (ze - this.tt) / 1000, Zt = 1.7, dn = 0.3, on = 1.5;
          if (En < Zt) { const bn = En / Zt, Cn = bn * bn, bi = sin(bn * PI * 2.5) * 2.2 * (1 - bn); be.t = 6 + Cn * 19 + bi; fe.t = Cn * 10; Mt = 0.34 - Cn * (0.34 - 0.04); Ne.t = 1 - Cn * 0.045; }
          else if (En < Zt + dn) { const bn = (En - Zt) / dn, Cn = sin(bn * PI); be.t = 25 - Cn * 7; fe.t = 10 - Cn * 4; Mt = 0.04 + Cn * 0.42; }
          else if (En < Zt + dn + on) { const bn = (En - Zt - dn) / on, Cn = 1 - Math.pow(1 - bn, 2.2); be.t = 25 - 19 * Cn; fe.t = 10 * (1 - Cn); Mt = 0.46 + (0.34 - 0.46) * Cn; if (bn > 0.32 && bn < 0.46) Mt = 0.05; }
          else { this.tt = 0; this.ot = ze + R(1500, 3500); }
        }
        break;
      }
      case 'happy': { const Et = sin(mt * 2.4); fe.t = sin(mt * 1.2) * 3; ke.t = sin(mt * 1.1) * 2.5; be.t = -Math.abs(Et) * 3; Ne.t = 1 + Et * 0.02; Lt = 1.05; break; }
      case 'curious': {
        fe.t = 10 + sin(mt * 0.7) * 6; ke.t = sin(mt * 0.6) * 5; be.t = -2 + sin(mt * 0.9) * 1.5; Ne.t = 1.01; Lt = 1.08;
        if (ze >= this.ot) { this.Ke = ze + 440; this.ot = ze + R(1600, 2800); }
        if (ze < this.Ke) { const Et = 1 - (this.Ke - ze) / 440; ke.t += sin(Et * PI) * 8; fe.t += sin(Et * PI) * 5; }
        break;
      }
      case 'confused': { const Et = sin(mt * 0.8); fe.t = Et * 12; ke.t = Et * 3; be.t = sin(mt * 0.5) * 2; Ne.t = 1; Mt = 0.9; if (ze >= this.Nt) { fe.v += 22; this.Nt = ze + R(2600, 4200); } break; }
      case 'bored': {
        fe.t = -3 + sin(mt * 0.25) * 4; ke.t = sin(mt * 0.2) * 4; be.t = 5 + sin(mt * 0.35) * 1.5; Ne.t = 0.99; Mt = 0.6; Lt = 0.98;
        if (ze >= this.Nt) { this.Ke = ze + 600; this.Nt = ze + R(4000, 7000); }
        if (ze < this.Ke) { const Et = 1 - (this.Ke - ze) / 600; Ne.t = 1 + sin(Et * PI) * 0.05; be.t += sin(Et * PI) * 3; } // a sigh
        break;
      }
      case 'proud': fe.t = sin(mt * 0.4) * 2.5; ke.t = sin(mt * 0.35) * 2; be.t = -4 + sin(mt * 0.6); Ne.t = 1.03; Lt = 1.02; Mt = 0.9; break;
      case 'shy': fe.t = -8 + sin(mt * 0.5) * 3; ke.t = -3 + sin(mt * 0.4) * 2; be.t = 3; Ne.t = 0.98; Lt = 0.95; Mt = 0.85; break;
      case 'sad': fe.t = 3 + sin(mt * 0.3) * 2; ke.t = sin(mt * 0.25) * 1.5; be.t = 7 + sin(mt * 0.4); Ne.t = 0.97; Mt = 0.7; Lt = 0.97; break;
      case 'laughing': { const Et = sin(mt * PI * 2 * 3.2); fe.t = Et * 4; ke.t = sin(mt * 2) * 2; be.t = -Math.abs(Et) * 5; Ne.t = 1 + Et * 0.03; Mt = 0.7; Lt = 1; break; }
      case 'scared': fe.t = sin(ze * 0.04) * 2; ke.t = -2 + sin(ze * 0.05) * 1.5; be.t = 2 + sin(mt * 1.5); Ne.t = 0.97; Lt = 1.12; Mt = 1.05; break;
      case 'playful': fe.t = sin(mt * 1.4) * 8; ke.t = sin(mt * 1.1) * 4; be.t = -Math.abs(sin(mt * 2.2)) * 3; Ne.t = 1 + sin(mt * 2.2) * 0.015; Lt = 1.06; if (ze >= this.St) { this.spin(1); this.St = ze + R(3500, 6000); } break;
      case 'celebrate': fe.t = 0; ke.t = 0; be.t = -Math.abs(sin(mt * 1.6)) * 2.5; Ne.t = 1; Lt = 1.1; Mt = 1.1; break;
      case 'orbit': case 'radar': case 'progress': case 'spawning': case 'loading': case 'dictating': case 'sending': case 'receiving': case 'uploading': case 'writing': case 'alerting': case 'bouncing': case 'powering-down':
        fe.t = 0; ke.t = 0; be.t = 0; Ne.t = 1; break;
      case 'dragging': { // lifted, carried across, dropped
        const En = (Dt % 3.4) / 3.4, Zt = Math.floor(Dt / 3.4);
        if (En < 0.12) { ke.t = -16; be.t = -22; fe.t = -5; }
        else if (En < 0.62) { const dn = (En - 0.12) / 0.5; ke.t = -16 + 32 * K2(dn); be.t = -22 + sin(mt * 1.4) * 2; fe.t = sin(mt * 2.6) * 6; Lt = 1.06; }
        else { if (Zt !== this.Yt) { this.Yt = Zt; be.v += 90; } ke.t = 16; be.t = 0; fe.t = 0; }
        Ne.t = 1;
        break;
      }
      case 'humming': fe.t = sin(mt * 0.4) * 2; ke.t = sin(mt * 0.3) * 1.5; be.t = sin(mt * 0.7) * 1.5; Ne.t = 1; break;
      case 'notifying': if (this.Yt < 0 && Dt > 0.12) { this.Yt = 0; be.v -= 26; this.blink(ze); } Lt = 1 + 0.05 * Math.exp(-Dt * 3); fe.t = 3; ke.t = 2; be.t = -1; Ne.t = 1; break;
    }
    if (ze >= this.ye) { // saccades: where the eyes dart next, and how soon
      const side = () => (this.rnd() < 0.5 ? -1 : 1);
      let dn = 0, on = 0, bn = 2500, Cn = 5000;
      switch (Pt) {
        case 'idle': dn = 0; on = 0; bn = 2500; Cn = 5500; break;
        case 'listening': dn = R(-0.3, 0.3) * 15; on = R(-0.25, 0.25) * 9; bn = 2200; Cn = 4200; break;
        case 'thinking': dn = side() * R(0.5, 1) * 15; on = -R(0.4, 1) * 9; bn = 1500; Cn = 2800; break;
        case 'searching': dn = side() * R(0.7, 1) * 15; on = R(-1, 1) * 9; bn = 550; Cn = 1150; break;
        case 'working': dn = R(-0.4, 0.4) * 15; on = R(0.4, 1) * 9; bn = 1200; Cn = 2400; break;
        case 'excited': dn = R(-1, 1) * 15; on = R(-1, 0.3) * 9; bn = 700; Cn = 1400; break;
        case 'surprised': dn = 0; on = 0; bn = 1600; Cn = 2600; break;
        case 'suspicious': dn = side() * 15; on = 0.3 * 9; bn = 2200; Cn = 4200; break;
        case 'angry': dn = R(-0.2, 0.2) * 15; on = 0.2 * 9; bn = 1800; Cn = 3200; break;
        case 'drowsy': dn = R(-0.4, 0.4) * 15; on = R(0.4, 1) * 9; bn = 2500; Cn = 4500; break;
        case 'happy': dn = R(-0.7, 0.7) * 15; on = -R(0, 0.6) * 9; bn = 1800; Cn = 3400; break;
        case 'curious': dn = side() * R(0.6, 1) * 15; on = R(-1, 1) * 9; bn = 950; Cn = 1900; break;
        case 'confused': dn = side() * R(0.5, 1) * 15; on = R(-0.6, 1) * 9; bn = 1100; Cn = 2300; break;
        case 'bored': dn = side() * R(0.7, 1) * 15; on = R(0.4, 0.9) * 9; bn = 3000; Cn = 6000; break;
        case 'proud': dn = R(-0.3, 0.3) * 15; on = -R(0.3, 0.7) * 9; bn = 2600; Cn = 4600; break;
        case 'shy': dn = side() * R(0.6, 1) * 15; on = R(0.5, 1) * 9; bn = 2000; Cn = 4000; break;
        case 'sad': dn = R(-0.3, 0.3) * 15; on = R(0.6, 1) * 9; bn = 2800; Cn = 5000; break;
        case 'laughing': dn = R(-0.5, 0.5) * 15; on = -R(0.2, 0.6) * 9; bn = 800; Cn = 1700; break;
        case 'scared': dn = side() * R(0.7, 1) * 15; on = R(-0.6, 0.6) * 9; bn = 450; Cn = 1050; break;
        case 'playful': dn = side() * R(0.5, 1) * 15; on = -R(0, 0.6) * 9; bn = 900; Cn = 1800; break;
        case 'notifying': { const up = this.rnd() < 0.72; dn = (up ? 0.45 : 0.1) * 15; on = -(up ? 0.3 : 0.05) * 9; bn = 1200; Cn = 2400; break; }
        default: dn = R(-0.4, 0.4) * 15; on = R(-0.3, 0.3) * 9; break;
      }
      this.ve.t = dn; this.ge.t = on; this.ye = ze + R(bn, Cn);
    }
    if ((Pt === 'idle' || Pt === 'happy' || Pt === 'excited' || Pt === 'curious' || Pt === 'playful') && ze >= this.ue) { this.de = ze; this.Te = this.rnd() < 0.5 ? 0 : 1; this.ue = ze + R(4500, 10000); } // a wink
    this.Vs = null; this.Kr = 0; this.yi = 0; this.ki = 0; this.Yr = 0; this.Zr = 0; this.wi = 0;
    if (this.ys) {
      const Et = (ze - this.ys.t0) / 1000, { kind, dir: Zt, turns: dn } = this.ys;
      if (kind === 'spinDizzy') {
        const on = 0.55 + dn * 0.16, bn = 1.5;
        if (Et < on) { const Cn = Et / on; this.Vs = dn * PI * 2 * Zt * (Cn * Cn); }
        else if (Et < on + bn) { const Cn = Et - on, bi = Math.pow(1 - Cn / bn, 1.3); this.Kr = sin(Cn * 10) * 17 * Zt * bi; this.yi = cos(Cn * 10) * 10 * Zt * bi; this.ki = sin(Cn * 20) * 3 * bi; Mt = 0.46 + 0.14 * sin(Cn * 21); Lt = 1.03; }
        else this.ys = null;
      } else if (kind === 'spinWild') { // wind up, whirl nine turns while rolling three, wobble out
        const ud = 2, Pc = 0.5, Go = PI * 2, end = 0.24 + 2.3 + 1.25, gm = (dn * Go + Pc) / (0.3 / 2 + ud + 1.25 / 4);
        if (Et < end + 1.7) {
          let cr;
          if (Et < 0.24) cr = (-Pc * (1 - cos((Et / 0.24) * PI))) / 2;
          else if (Et < 0.24 + 0.3) { const u = Et - 0.24; cr = -Pc + (gm * u * u) / (2 * 0.3); }
          else if (Et < 0.24 + 2.3) cr = -Pc + gm * (0.3 / 2 + (Et - 0.24 - 0.3));
          else if (Et < end) { const u = (Et - 0.24 - 2.3) / 1.25; cr = -Pc + gm * (0.3 / 2 + ud) + (gm * 1.25 * (1 - Math.pow(1 - u, 4))) / 4; }
          else cr = dn * Go;
          this.Vs = cr * Zt;
          let pl = 0;
          if (Et > 0.24 + 2.3) { const u = Math.min((Et - 0.24 - 2.3) / 1.25, 1); pl = u < 0.4 ? 0 : Math.pow((u - 0.4) / 0.6, 2); if (Et >= end) pl = Math.pow(1 - (Et - end) / 1.7, 1.6); }
          const Yl = Math.max(Et - 0.24 - 2.3, 0);
          this.Yr = (cr / (dn * Go)) * 3 * 360 * Zt; this.Kr = sin(Yl * 9.2) * 11 * Zt * pl; this.yi = (cos(Yl * 9.2) - 1) * 6 * Zt * pl; this.ki = sin(Yl * 18.4) * 2.6 * pl;
          this.Zr = sin(Yl * 11.5) * 13 * Zt * pl; this.wi = (cos(Yl * 9) - 1) * 3.5 * pl; Mt = 1.14 - 0.44 * pl + 0.1 * sin(Yl * 16) * pl; Lt = 1.12 - 0.09 * pl;
        } else this.ys = null;
      } else if (kind === 'spinBounce') { if (Et < 0.7) this.Vs = dn * PI * 2 * Zt * K2(Et / 0.7); else { this.hop(); this.ys = null; } }
    }
    this.Mr = 0;
    if (this.vr >= 0) { // the hop sequence: four parabolic hops, each lower
      const Et = (ze - this.vr) / 1000;
      if (Et >= HOPS_T) this.vr = -1;
      else { let En = 0, Zt = 0; for (; Zt < HOPS.length && !(Et < En + HOPS[Zt].d); Zt++) En += HOPS[Zt].d; const { h, d } = HOPS[Zt], bn = (Et - En) / d; this.Mr = -4 * h * bn * (1 - bn); }
    }
    if (Pt !== 'waking' && Pt !== 'sleeping' && ze >= this.Ze) { // next eye expression of this state
      const Et = EYE_FRAMES[Pt];
      this.ct = (this.ct + 1 + Math.floor(R(0, Et.length - 1))) % Et.length;
      this.en(Et[this.ct], Pt === 'searching' || Pt === 'excited' ? 10 : 6); this.Ze = ze + R(...FRAME_HOLD[Pt]);
    }
    const yn = BLINK_EVERY[Pt];
    if (yn && ze >= this.wt) { this.blink(ze); this.wt = ze + R(yn[0], yn[1]); }
    let an = null;
    while (this.lt.length && ze >= this.lt[0].at) { an = this.lt[0].v; this.lt.shift(); }
    Ae.t = an ?? (this.lt.length ? Ae.t : Mt); this.oe.t = Lt;
  }
  // morph amount of one kind (the app's kl)
  kl(k, yl, Mc, gu) { return k == null ? 0 : k === this.Ve ? yl * Mc : k === gu ? yl * (1 - Mc) : 0; }
  // the three-dot wave (thinking): lift, pop and tone of dot i
  wave3(ze, i, amt) {
    const Dt = ((((ze - this.et) / 1400 + 0.119) % 1) + 1) % 1;
    let d = Math.abs(Dt - i / 3); d = Math.min(d, 1 - d);
    const L = Math.exp(-(d * d) / (2 * 0.15 * 0.15));
    return { lift: L * 9 * amt, pop: 0.84 + 0.22 * L, tone: 1 - 0.5 * (1 - L) };
  }
  pencil(ze) { // where the pencil tip is in its writing cycle
    const Pt = ze - this.stateAt, mt = (((Pt / 2500) % 1) + 1) % 1;
    if (mt < 0.68) { const M = mt / 0.68, L = M * M * (3 - 2 * M), yn = clamp(M / 0.08, 0, 1) * clamp((1 - M) / 0.08, 0, 1); return { x: -54 + 118 * L, y: 26, wig: sin(M * 24) * 3.2 * yn, rot: 17 + sin(Pt * 6e-4) * 1, lift: false }; }
    const D = K2((mt - 0.68) / 0.32);
    return { x: 64 - 118 * D, y: 26 - 20 * sin(D * PI), wig: 0, rot: 17 - 2 * sin(D * PI) + sin(Pt * 6e-4) * 1, lift: true };
  }
  mn(ze, dt) { // everything that is drawn this frame
    const out = { eyes: [], prims: [], body: null, kinds: {} };
    const Pt = clamp(this.xe.x, 0, 1);
    let spin = 0, spinning = false;
    if (this.rn) { spin = this.rn.x; spinning = true; if (Math.abs(this.rn.t - this.rn.x) < 0.004 && Math.abs(this.rn.v) < 0.015) { this.rn = null; this.Qt = false; spin = 0; spinning = false; } }
    const eyes = eyeLerp(this.eyeFrom, this.eyeTo, Pt);
    const unsettled = this.Le.x > 0.001 || Math.abs(this.rt.t - this.rt.x) > 0.01;
    if (this.Vs !== null) { spin += this.Vs; spinning = true; }
    let turn = unsettled ? this.rt.x : null;
    turn = spinning ? (turn ?? 0) + spin : turn;
    // gaze toward the pointer (the app: +-0.6 of the mark's box -> 22 px / 14 px)
    const pg = this.pointer;
    const tx = pg ? clamp(pg.x, -0.6, 0.6) * 22 : 0, ty = pg ? clamp(pg.y, -0.6, 0.6) * 14 : 0;
    const Zl = 1 - Math.exp(Math.log(1 - 0.16) * 60 * dt);
    this.Mn.x += (tx - this.Mn.x) * Zl; this.Mn.y += (ty - this.Mn.y) * Zl;
    const P2 = 1 + 0.07 * sin(Pt * PI);
    let a1 = 0, o1 = 0; for (let i = 0; i < eyes[0].p.length; i += 2) { a1 = max(a1, abs(eyes[0].p[i])); o1 = max(o1, abs(eyes[1].p[i])); }
    const l1 = Math.abs(eyes[1].c[0] - eyes[0].c[0]), spread = a1 + o1 > 0.5 ? clamp(l1 / (a1 + o1), 0.35, 4) : 4;
    const size = Math.min(clamp(this.oe.x, 0.2, 2), spread / P2);
    const badge = clamp(this.Sn.x, 0, 1);
    for (let i = 0; i < 2; i++) {
      let Ui = Math.max(this.Ae.x, 0.04);
      if (i === this.Te && ze < this.de + 320) { const xr = (ze - this.de) / 320, Fr = xr < 0.42 ? 1 - xr / 0.42 : (xr - 0.42) / 0.58; Ui = Math.max(Ui * Fr, 0.04); }
      let Kj = sin(ze * 42e-5 + i) * 1.4 + sin(ze * 0.001 + i * 2) * 0.5, Ko = sin(ze * 58e-5 + i) * 0.9;
      Kj += this.Mn.x; Ko += this.Mn.y;
      const J2 = pg ? 0.2 : 1;
      Kj += this.ve.x * J2 + this.Zr; Ko += this.ge.x * J2 + this.wi;
      Kj -= 10 * badge; Ko += 7 * badge;
      const e = eyes[i];
      out.eyes.push({ x: e.c[0] + Kj * FACE_SX, y: e.c[1] + Ko * FACE_SY, e, open: Ui, sx: clamp(size * P2, 0.02, 2.4), sy: clamp(size * Ui * P2, 0.02, 2.4), syShape: clamp(size * P2, 0.02, 2.4) });
    }
    out.eyesOn = this.Le.x < 0.5;
    // the morph: amounts of each kind, dot size, body transform
    const yl = clamp(this.Le.x, 0, 1), Mc = clamp(this.Me.x, 0, 1), gu = Mc < 0.999 ? this.De : null, Ve = this.Ve;
    const kl = (k) => this.kl(k, yl, Mc, gu);
    for (const k of MORPH_KINDS) out.kinds[k] = kl(k);
    const A2 = Ve ? MORPH_DOT[Ve] * Mc + (gu ? MORPH_DOT[gu] : MORPH_DOT[Ve]) * (1 - Mc) : 19;
    const rX = this.wave3(ze, 1, yl), dots = kl('dots');
    let iX = Ve === 'dots' || gu === 'dots' ? 1 + (rX.pop - 1) * (dots / Math.max(yl, 0.001)) : 1;
    const Bee = ze - this.stateAt;
    const rcv = kl('receive'); if (rcv > 0.004) { const u = (((Bee / 1700) % 1) + 1) % 1, g = clamp((u - 0.58) / 0.34, 0, 1); iX *= 1 + 0.11 * sin(g * PI) * rcv; }
    const snd = kl('send'); if (snd > 0.004) { const u = (((Bee / 1500) % 1) + 1) % 1, a = u < 0.18 ? -0.06 * sin((u / 0.18) * PI) : 0, b = u >= 0.18 && u < 0.42 ? 0.05 * sin(((u - 0.18) / 0.24) * PI) : 0; iX *= 1 + (a + b) * snd; }
    const bang = kl('bang'); if (bang > 0.004) iX *= 1 + 0.04 * Math.exp(-((Bee / 1000) % 2.2) * 5.5) * bang;
    let mx = 0, my = 0, mrot = 0;
    const pen = kl('pencil'); if (pen > 0.004) { const p = this.pencil(ze); mx += p.x * pen; my += (p.y + p.wig * 0.5) * pen; mrot += p.rot * pen; }
    if (bang > 0.004) my += 58 * bang;
    const whirl = kl('whirl'); if (whirl > 0.004) { const t = ze / 1000; mx += (sin(t * 0.9) * 2 + sin(t * 1.7) * 0.8) * whirl; my += (sin(t * 1.3) * 2.4 + sin(t * 0.6) * 1.2) * whirl; }
    const ball = kl('ball');
    if (ball > 0.004) { // a ball dropped from 40 px, then bouncing 52 px high every 0.62 s
      const t = Bee / 1000, per = 0.62, hgt = 52, g = (8 * hgt) / (per * per), h0 = 40, t0 = Math.sqrt((2 * h0) / g);
      const ph = ((((t - t0) / per) % 1) + 1) % 1, Ea = t < t0 ? h0 - 0.5 * g * t * t : 4 * hgt * ph * (1 - ph);
      my += (40 - Ea) * ball;
    }
    const dotS = (A2 / 114.2705) * iX, w = 1 - yl;
    const standby = kl('standby'), dim = standby > 0 ? (0.28 + 0.2 * sin(ze * 0.0016)) * standby : 0;
    const Jc = clamp(yl / 0.62, 0, 1);
    const tear = Ve === 'pencil' || gu === 'pencil' ? (Ve === 'pencil' ? K2(Mc) : 0) + (gu === 'pencil' ? 1 - K2(Mc) : 0) : 0;
    out.body = {
      x: this.ke.x * w + this.yi * w + mx * yl,
      y: (this.be.x + this.Mr) * w + this.ki * w - rX.lift * dots + my * yl,
      rot: (this.fe.x * w + this.Kr * w) + this.Yr * w + mrot * yl,
      sx: w + dotS * yl, sy: this.Ne.x * w + dotS * yl,
      turn: turn ?? 0, morph: yl, shape: K2(Jc), tear: clamp(tear, 0, 1),
      op: (1 - (1 - rX.tone) * dots) * (1 - dim),
    };
    // the notification badge (top-right of the outline)
    this.Sn.t = this.state === 'notifying' ? 1 : 0;
    const bz = clamp(this.Sn.x, 0, 1.4);
    if (bz > 0.01) out.prims.push({ k: 'badge', x: 69.59, y: -69.59, r: 20 * bz });
    // the effects of each morph kind (the app's per-kind draw functions)
    const P = out.prims, ball3 = (x, y, z, r, op) => P.push({ k: 'ball', x, y, z, r, op }), ring = (r, wd, op, arc = 1, x = 0, y = 0) => P.push({ k: 'ring', x, y, r, w: wd, op, arc });
    for (const kind of MORPH_KINDS) {
      const gn = out.kinds[kind]; if (gn <= 0.004) continue;
      if (kind === 'dots') {
        for (let Dt = 0; Dt < 2; Dt++) {
          const Lt = clamp((gn - Dt * 0.12) / (1 - Dt * 0.12), 0, 1); if (Lt <= 0.004) continue;
          const yn = easeOut3(Lt), an = backOut(Lt), E = this.wave3(ze, Dt === 0 ? 0 : 2, gn);
          ball3((Dt ? 62 : -62) * an, -E.lift, 0, 22 * yn * E.pop * 1.02, yn * E.tone);
        }
      } else if (kind === 'orbit') {
        const mt = easeOut3(gn), R0 = 52 * backOut(gn), yn = ze * 0.0017;
        for (let an = 0; an < 5; an++) { const En = yn + (an * PI * 2) / 5, Zt = cos(En), dn = 0.5 + 0.5 * clamp(Zt, 0, 1);
          ball3(R0 * sin(En), -R0 * 0.42 * Zt, R0 * 0.9 * Zt, Math.max(12 * dn * mt, 0.3), clamp((Zt + 0.4) / 0.6, 0.18, 1) * mt); }
      } else if (kind === 'radar') {
        const Dt = easeOut3(gn);
        for (let yn = 0; yn < 3; yn++) { const Et = (ze / 1300 + yn / 3) % 1; ring(A2 + (104 - A2) * Et, 3.4 * (1 - Et * 0.55), Dt * (1 - Et) * 0.9); }
      } else if (kind === 'progress') {
        const mt = easeOut3(gn), Dt = backOut(gn), Lt = clamp((ze - this.morphAt) / TIMED_MS.progress, 0, 1), yn = clamp(Lt / 0.85, 0, 1);
        ring(62 * Dt, 5, mt * 0.16); ring(62 * Dt, 5, mt, yn);
      } else if (kind === 'gather') {
        const mt = easeOut3(gn);
        for (let Mt = 0; Mt < 5; Mt++) { const yn = clamp(((ze - this.morphAt) / TIMED_MS.spawning - Mt * 0.09) / 0.62, 0, 1); if (yn >= 1) continue;
          const an = 1 - Math.pow(1 - yn, 3), Et = Mt * 2.4 + yn * 2.2, En = 96 * (1 - an);
          ball3(En * cos(Et), En * sin(Et) * 0.8, En * sin(Et) * 0.6, 9 * (0.5 + 0.5 * an) * mt, mt * clamp(yn * 5, 0, 1) * (1 - an * 0.25)); }
      } else if (kind === 'wave') {
        const lev = (t, i) => (0.42 + 0.29 * sin(t * 0.0021) * sin(t * 0.0034) + 0.29 * sin(t * 0.0013 + 1.7)) * (0.55 + 0.45 * sin(t * 0.012 - Math.abs(i) * 1.05));
        for (const yn of [-2, -1, 1, 2]) { const an = clamp((gn - Math.abs(yn) * 0.1) / (1 - Math.abs(yn) * 0.1), 0, 1); if (an <= 0.004) continue;
          const En = lev(ze, yn), Zt = (7 + 9 * clamp(En, 0.08, 1)) * easeOut3(an), dn = 6 * clamp(En, 0, 1) * an;
          ball3(yn * 44 * backOut(an), -dn, 0, Zt * (yn < 0 ? 1.02 : 1), an); }
      } else if (kind === 'send') {
        const mt = easeOut3(gn), Dt = ((((ze - this.stateAt) / 1500) % 1) + 1) % 1, Mt = clamp((Dt - 0.18) / 0.55, 0, 1), Lt = Mt * Mt * (0.4 + 0.6 * Mt), ux = 0.74, uy = -0.62;
        if (Mt > 0 && Mt < 1) ball3(ux * 108 * Lt, uy * 108 * Lt, 20 * Lt, 10 * (1 - Lt * 0.55) * mt, mt * (1 - Lt * Lt));
        const on = clamp((Dt - 0.26) / 0.55, 0, 1), bn = on * on * (0.4 + 0.6 * on); if (Mt > 0 && on > 0 && on < 1) ball3(ux * 108 * bn, uy * 108 * bn, 20 * bn, 5 * (1 - bn * 0.6) * mt, mt * 0.3 * (1 - bn));
        const q = clamp((Dt - 0.18) / 0.3, 0, 1); if (q > 0 && q < 1) ring(20 + 34 * easeOut3(q), 2.8 * (1 - q), mt * (1 - q) * 0.8);
      } else if (kind === 'receive') {
        const mt = easeOut3(gn), Dt = ze - this.stateAt, Mt = Math.floor(Dt / 1700);
        if (Mt !== this.xn) { this.xn = Mt; this.Vt = this.R(-PI * 1.25, PI * 0.25); }
        const Lt = (((Dt / 1700) % 1) + 1) % 1, yn = clamp(Lt / 0.6, 0, 1), an = 1 - Math.pow(1 - yn, 3), Et = cos(this.Vt), En = sin(this.Vt), Zt = 108 * (1 - an);
        if (yn < 1) { const Cn = 18 * sin(yn * PI) * (1 - an * 0.7); ball3(Et * Zt - En * Cn, En * Zt + Et * Cn, 30 * (1 - an), 3.5 + 6.5 * an, mt * clamp(yn * 3.5, 0, 1) * (0.3 + 0.7 * an)); }
        const bn = clamp((Lt - 0.58) / 0.32, 0, 1); if (bn > 0 && bn < 1) ring(20 + 26 * easeOut3(bn), 2.8 * (1 - bn), mt * (1 - bn) * 0.8);
      } else if (kind === 'dock') {
        const mt = easeOut3(gn), Dt = (ze - this.stateAt) / 1000;
        for (let yn = 0; yn < 2; yn++) { const Et = clamp((Dt - (0.2 + yn * 1.3)) / 0.9, 0, 1); if (Et <= 0) continue;
          const En = 1 - Math.pow(1 - Et, 3), Zt = ze * 0.001 * 1.1 + yn * PI, dn = 42 * sin(Zt), on = 42 * 0.5 * cos(Zt) + sin(ze * 0.003 + yn) * 2, bx = -120 + yn * 30, by = 95;
          ball3(bx + (dn - bx) * En, by + (on - by) * En, 42 * cos(Zt) * 0.8 * En, (7 + 3 * En) * mt, mt * clamp(Et * 4, 0, 1)); }
      } else if (kind === 'pencil') {
        const mt = this.pencil(ze), La = ((mt.rot - 90) * PI) / 180;
        P.push({ k: 'shaft', x: (mt.x + cos(La) * 68) * gn, y: (mt.y + mt.wig * 0.15 + sin(La) * 68) * gn, rot: mt.rot * gn, s: easeOut3(gn), op: clamp(gn * 1.6 - 0.3, 0, 1) });
        if (gn > 0.6 && !mt.lift) { const x = mt.x, y = mt.y + mt.wig + 19, l = this.ln[this.ln.length - 1];
          if (!l || Math.hypot(x - l[0], y - l[1]) > 2.4) { this.ln.push([x, y]); if (this.ln.length > 64) this.ln.shift(); } else { l[0] = x; l[1] = y; } }
        else if (this.ln.length) this.ln.splice(0, 2);
        if (this.ln.length >= 2) P.push({ k: 'trail', pts: this.ln.map((p) => p.slice()), w: 6, op: clamp(gn * 1.2, 0, 1) });
      } else if (kind === 'bang') {
        const Dt = (ze - this.stateAt) / 1000, Mt = easeOut3(clamp(gn * 1.1, 0, 1)), L = Math.exp(-(Dt % 2.2) * 5.5);
        P.push({ k: 'bang', y: -26 - (1 - Mt) * 70, wob: sin(Dt * 42) * 2.2 * L, s: clamp(gn * 1.2, 0, 1), op: clamp(gn * 1.5 - 0.2, 0, 1) });
      } else if (kind === 'standby') {
        const mt = easeOut3(gn), L = 0.5 + 0.5 * sin(ze * 0.0016);
        ball3(0, 0, -2, 26 + 7 * L, mt * (0.06 + 0.1 * L));
        if (gn < 0.995) ring(104 - 88 * mt, 2.4, (1 - mt) * 0.5);
      }
    }
    // humming: two notes circling wide around the character
    const hum = clamp(this.vn.x, 0, 1);
    if (hum > 0.01) for (let i = 0; i < 2; i++) { const G = this.Ft * 0.85 + i * PI, R0 = MARK_GEO.radius * 1.3, c = cos(G), Si = 0.55 + 0.45 * clamp((c + 1) / 2, 0, 1);
      ball3(R0 * sin(G), -R0 * 0.38 * c - 8, R0 * 0.9 * c, 7.5 * Si * hum, (0.3 + 0.7 * Si) * hum); }
    this.belt = MARK_GEO.belt + (this.state === 'loading' ? (52 - MARK_GEO.belt) * clamp(this.Le.x, 0, 1) : 0);
    this.out = out;
  }
}
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
