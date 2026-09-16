// Frame gaps while the greeting streams, under CSS overrides applied
// after load, so candidate fixes are measured without a rebuild.
//
//   node harness/onboarding-frames-variants.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve('harness/dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const SAMPLE_MS = 5000;

const VARIANTS = {
  base: '',
  promoteAmbient: `span[style*="onb-drift"] { will-change: transform !important; }`,
  noBackdrop: `div[style*="backdrop-filter"] { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }`,
  wordFadeOnly: `
    @keyframes onb-word-fade { from { opacity: 0; } to { opacity: 1; } }
    span[style*="onb-word-in"] { animation-name: onb-word-fade !important; }`,
  noAmbient: `span[style*="onb-drift"] { display: none !important; }`,
};
VARIANTS.noFilter = `span[style*="onb-drift"] { filter: none !important; }`;
VARIANTS.blur24 = `span[style*="onb-drift"] { filter: blur(24px) !important; }`;
VARIANTS.blur48 = `span[style*="onb-drift"] { filter: blur(48px) !important; }`;
VARIANTS.noFilterNoBackdrop = VARIANTS.noFilter + VARIANTS.noBackdrop;
VARIANTS.blur24NoBackdrop = VARIANTS.blur24 + VARIANTS.noBackdrop;
VARIANTS.halfRes = `@keyframes onb-drift-a-s { 0%,100% { transform: translate3d(-36%,-24%,0) scale(2.000); } 33% { transform: translate3d(60%,40%,0) scale(2.440); } 66% { transform: translate3d(24%,-52%,0) scale(1.720); } } @keyframes onb-drift-b-s { 0%,100% { transform: translate3d(48%,32%,0) scale(2.160); } 40% { transform: translate3d(-56%,-36%,0) scale(1.720); } 70% { transform: translate3d(-16%,56%,0) scale(2.480); } } @keyframes onb-drift-c-s { 0%,100% { transform: translate3d(16%,48%,0) scale(1.800); } 45% { transform: translate3d(-52%,-20%,0) scale(2.520); } 75% { transform: translate3d(56%,12%,0) scale(2.080); } }
      span[style*="onb-drift"] { width: 36.0vw !important; height: 36.0vw !important; filter: blur(48px) !important; will-change: transform; }
      span[style*="onb-drift-a"] { animation-name: onb-drift-a-s !important; }
      span[style*="onb-drift-b"] { animation-name: onb-drift-b-s !important; }
      span[style*="onb-drift-c"] { animation-name: onb-drift-c-s !important; }`;
VARIANTS.quarterRes = `@keyframes onb-drift-a-s { 0%,100% { transform: translate3d(-72%,-48%,0) scale(4.000); } 33% { transform: translate3d(120%,80%,0) scale(4.880); } 66% { transform: translate3d(48%,-104%,0) scale(3.440); } } @keyframes onb-drift-b-s { 0%,100% { transform: translate3d(96%,64%,0) scale(4.320); } 40% { transform: translate3d(-112%,-72%,0) scale(3.440); } 70% { transform: translate3d(-32%,112%,0) scale(4.960); } } @keyframes onb-drift-c-s { 0%,100% { transform: translate3d(32%,96%,0) scale(3.600); } 45% { transform: translate3d(-104%,-40%,0) scale(5.040); } 75% { transform: translate3d(112%,24%,0) scale(4.160); } }
      span[style*="onb-drift"] { width: 18.0vw !important; height: 18.0vw !important; filter: blur(24px) !important; will-change: transform; }
      span[style*="onb-drift-a"] { animation-name: onb-drift-a-s !important; }
      span[style*="onb-drift-b"] { animation-name: onb-drift-b-s !important; }
      span[style*="onb-drift-c"] { animation-name: onb-drift-c-s !important; }`;
VARIANTS.halfResNoBackdrop = VARIANTS.halfRes + VARIANTS.noBackdrop;
VARIANTS.quarterResNoBackdrop = VARIANTS.quarterRes + VARIANTS.noBackdrop;
VARIANTS.softGradientNoFilter = `span[style*="onb-drift"] { filter: none !important; background: radial-gradient(circle, var(--onb-c, transparent) 0%, transparent 72%) !important; }`;
// The cloud's opacity baked into the gradient stops (so the gradient is
// dithered at its real contrast instead of drawn strong and then faded
// as a layer, which is what makes the rings), eased stops standing in
// for the blur, no filter, no backdrop.
const baked = (rgb, a) => `radial-gradient(circle, rgba(${rgb},${(a * 0.92).toFixed(3)}) 0%, rgba(${rgb},${(a * 0.7).toFixed(3)}) 28%, rgba(${rgb},${(a * 0.42).toFixed(3)}) 48%, rgba(${rgb},${(a * 0.18).toFixed(3)}) 64%, rgba(${rgb},${(a * 0.05).toFixed(3)}) 78%, rgba(${rgb},0) 92%)`;
VARIANTS.bakedNoFilterNoBackdrop = `
  span[style*="onb-drift"] { filter: none !important; opacity: 1 !important; will-change: transform; }
  span[style*="76vw"] { background: ${baked('143,211,244', 0.2)} !important; }
  span[style*="68vw"] { background: ${baked('205,189,245', 0.26)} !important; }
  span[style*="72vw"] { background: ${baked('247,201,168', 0.22)} !important; }
  span[style*="58vw"] { background: ${baked('168,230,207', 0.18)} !important; }
` + VARIANTS.noBackdrop;
VARIANTS.bakedNoFilter = VARIANTS.bakedNoFilterNoBackdrop.replace(VARIANTS.noBackdrop, '');
// The panel's 88% white folded into the page background and the clouds'
// strength (x0.12, x1.15 for the backdrop's saturate), so the clouds are
// dithered at the contrast the eye actually gets, and nothing sits on
// top of them to flatten the dither into rings.
const seen = a => a * 0.12 * 1.15;
VARIANTS.flatPanel = `
  div[style*="100vh"] { background: radial-gradient(120% 90% at 50% 0%, #fdfdfe 0%, #fbfcfd 100%) !important; }
  div[style*="backdrop-filter"] { background: transparent !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
  span[style*="onb-drift"] { filter: none !important; opacity: 1 !important; will-change: transform; }
  span[style*="76vw"] { background: ${baked('143,211,244', seen(0.2))} !important; }
  span[style*="68vw"] { background: ${baked('205,189,245', seen(0.26))} !important; }
  span[style*="72vw"] { background: ${baked('247,201,168', seen(0.22))} !important; }
  span[style*="58vw"] { background: ${baked('168,230,207', seen(0.18))} !important; }
`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = url.pathname === '/' ? '/index.html' : url.pathname;
  try {
    const body = await readFile(path.join(DIST, file));
    res.setHeader('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean);
for (const [name, css] of Object.entries(VARIANTS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const page = await browser.newPage({ viewport: { width: 1120, height: 845 }, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${port}/?screen=onboarding`, { waitUntil: 'networkidle' });
  if (css) await page.addStyleTag({ content: css });
  await page.waitForTimeout(2400);
  const gaps = await page.evaluate((sampleMs) => new Promise(resolve => {
    const out = [];
    let last = performance.now();
    const start = last;
    const tick = now => {
      out.push(now - last);
      last = now;
      if (now - start < sampleMs) requestAnimationFrame(tick);
      else resolve(out);
    };
    requestAnimationFrame(tick);
  }), SAMPLE_MS);
  const sorted = [...gaps].sort((a, b) => a - b);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  console.log(name.padEnd(16), JSON.stringify({
    fps: Number((1000 / mean).toFixed(1)),
    meanMs: Number(mean.toFixed(1)),
    p95Ms: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(1)),
    lateOver33ms: gaps.filter(g => g > 33).length,
    frames: gaps.length,
  }));
  await page.screenshot({ path: `harness/shots/onb-variant-${name}.png` });
  await page.close();
}

await browser.close();
server.close();
