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
