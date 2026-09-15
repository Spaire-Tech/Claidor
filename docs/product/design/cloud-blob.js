// <cloud-blob> — soft puffy cloud character with eyes. Tintable, animated (bob, squish, blink, pupil drift).
// Attributes: colors="#8fd3f4,#f7b2d9" (2-3 stops, top→bottom), seed="3", mood="calm|awake"
(function () {
  function rng(seed) {
    let a = (seed | 0) + 0x6d2b79f5;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class CloudBlob extends HTMLElement {
    static get observedAttributes() { return ['colors', 'seed', 'mood']; }
    connectedCallback() { this.draw(); }
    attributeChangedCallback() { if (this.shadowRoot) this.draw(); }

    draw() {
      const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
      const cols = (this.getAttribute('colors') || '#8fd3f4,#b9c4ee,#f7b2d9')
        .split(',').map(s => s.trim()).filter(Boolean);
      const seed = parseFloat(this.getAttribute('seed') || '1') || 1;
      const r = rng(Math.round(seed * 977));
      const awake = (this.getAttribute('mood') || 'calm') === 'awake';
      const uid = 'b' + Math.random().toString(36).slice(2, 8);

      // lobes: one core ellipse + a ring of puffs
      const lobes = [];
      const n = 7;
      for (let i = 0; i < n; i++) {
        const ang = -Math.PI / 2 + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.34;
        const rad = 38 + r() * 8;
        lobes.push({
          cx: 100 + Math.cos(ang) * rad,
          cy: 104 + Math.sin(ang) * rad * 0.82,
          rr: 27 + r() * 11
        });
      }
      const puffs = lobes.map(l => `<circle cx="${l.cx.toFixed(1)}" cy="${l.cy.toFixed(1)}" r="${l.rr.toFixed(1)}"/>`).join('');

      const stops = cols.map((c, i) =>
        `<stop offset="${(i / Math.max(cols.length - 1, 1) * 100).toFixed(0)}%" stop-color="${c}"/>`).join('');

      const bobDur = (3.4 + r() * 1.6).toFixed(2);
      const blinkDur = (4.6 + r() * 3.4).toFixed(2);
      const driftDur = (5.2 + r() * 2.6).toFixed(2);
      const dly = (r() * 2).toFixed(2);

      root.innerHTML = `
<style>
  :host { display:block; }
  svg { display:block; width:100%; height:100%; overflow:hidden; }
  .body { animation: bob ${bobDur}s ease-in-out ${dly}s infinite, squish ${bobDur}s ease-in-out ${dly}s infinite; transform-origin:100px 150px; }
  .face { animation: bob ${bobDur}s ease-in-out ${dly}s infinite; }
  .eye  { animation: blink ${blinkDur}s ease-in-out ${dly}s infinite; }
  .pupil { animation: drift ${driftDur}s ease-in-out ${dly}s infinite; }
  .shade { animation: shadePulse ${bobDur}s ease-in-out ${dly}s infinite; }
  @keyframes bob { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-5px); } }
  @keyframes squish { 0%,100% { scale:1 1; } 50% { scale:1.015 0.985; } }
  @keyframes blink { 0%,92%,100% { transform:scaleY(1); } 95% { transform:scaleY(.08); } }
  @keyframes drift {
    0%,100% { transform:translate(0,0); }
    30% { transform:translate(${awake ? 2.6 : 1.6}px,-1px); }
    65% { transform:translate(${awake ? -2.4 : -1.4}px,1.2px); }
  }
  @keyframes shadePulse { 0%,100% { opacity:.2; transform:scale(1); } 50% { opacity:.13; transform:scale(.93); } }
</style>
<svg viewBox="16 26 168 168">
  <defs>
    <linearGradient id="g-${uid}" x1="0" y1="0" x2="0.25" y2="1">${stops}</linearGradient>
    <radialGradient id="hi-${uid}" cx="0.36" cy="0.24" r="0.52">
      <stop offset="0%" stop-color="#fff" stop-opacity=".5"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="lo-${uid}" cx="0.62" cy="0.92" r="0.6">
      <stop offset="0%" stop-color="#2a2f3a" stop-opacity=".16"/>
      <stop offset="100%" stop-color="#2a2f3a" stop-opacity="0"/>
    </radialGradient>
    <mask id="m-${uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
      <g fill="#fff"><ellipse cx="100" cy="106" rx="58" ry="48"/>${puffs}</g>
    </mask>
    <filter id="soft-${uid}" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3.2"/>
    </filter>
    <filter id="blur-${uid}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
  </defs>

  <ellipse class="shade" cx="102" cy="172" rx="46" ry="8" fill="#5b6478" filter="url(#blur-${uid})"/>

  <g class="body">
    <g mask="url(#m-${uid})" filter="url(#soft-${uid})">
      <rect x="0" y="0" width="200" height="200" fill="url(#g-${uid})"/>
      <rect x="0" y="0" width="200" height="200" fill="url(#hi-${uid})"/>
      <rect x="0" y="0" width="200" height="200" fill="url(#lo-${uid})"/>
    </g>
  </g>

  <g class="face">
    <g class="eye" style="transform-origin:84px 100px">
      <ellipse cx="84" cy="100" rx="11.4" ry="14" fill="#fff"/>
      <g class="pupil"><ellipse cx="85" cy="101" rx="6.8" ry="8.2" fill="#14181f"/>
      <circle cx="82.4" cy="97" r="1.9" fill="#fff" opacity=".9"/></g>
    </g>
    <g class="eye" style="transform-origin:120px 100px; animation-delay:${(parseFloat(dly) + 0.04).toFixed(2)}s">
      <ellipse cx="120" cy="100" rx="11.4" ry="14" fill="#fff"/>
      <g class="pupil"><ellipse cx="121" cy="101" rx="6.8" ry="8.2" fill="#14181f"/>
      <circle cx="118.4" cy="97" r="1.9" fill="#fff" opacity=".9"/></g>
    </g>
  </g>
</svg>`;
    }
  }
  if (!customElements.get('cloud-blob')) customElements.define('cloud-blob', CloudBlob);
})();
