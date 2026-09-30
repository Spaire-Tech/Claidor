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
