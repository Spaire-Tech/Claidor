
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
