// The disk image's window picture (mac/scripts/dmg.sh, 29 October 2026), drawn in Chromium: five clay faces
// above the places of Simeon and Applications, and an arrow between them. Finder draws the two icons (128
// points, centred on LEFT and RIGHT at ICON_Y, as dmg.sh places them) and their names under them.
//
//   node mac/dmg/background.cjs              # background.png and background@2x.png, beside this file
//   node mac/dmg/background.cjs preview.png  # also the window as Finder shows it, with stand-ins for the icons
//
// It needs Playwright and its Chromium (npm install -g playwright && npx playwright install chromium).
const { chromium } = require("playwright");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "../..");
const FACES = path.join(ROOT, "ios/SimeonCore/Sources/SimeonCore/Resources/Faces");
const ICON = path.join(ROOT, "mac/Simeon/Assets.xcassets/MacIcon.appiconset/icon_256x256.png");
// The window's size in points (dmg.sh's bounds); the title bar takes the top 28 of it, so the picture's last
// 28 points are under the window's edge.
const W = 640, H = 400, TITLE_BAR = 28;
const LEFT = 160, RIGHT = 480, ICON_Y = 200;
const ROW = ["clay-06", "clay-17", "clay-simeon", "clay-30", "clay-22"];
const GROUND = "#F7F6F3";

const data = (file, type) => `data:${type};base64,${readFileSync(file).toString("base64")}`;
const face = (id, i) =>
  `<div style="width:44px;height:44px;margin-left:${i ? -10 : 0}px;border:2.5px solid ${GROUND};border-radius:50%;overflow:hidden;position:relative;z-index:${5 - Math.abs(i - 2)}">` +
  `<img src="${data(path.join(FACES, `${id}.webp`), "image/webp")}" style="width:100%;height:100%;object-fit:cover;transform:scale(1.35) translateY(9%)"></div>`;
const picture = `
  <div style="position:absolute;inset:0;background:${GROUND}"></div>
  <div style="position:absolute;left:0;right:0;top:48px;display:flex;justify-content:center">${ROW.map(face).join("")}</div>
  <svg style="position:absolute;left:0;top:0" width="${W}" height="${H}">
    <path d="M${LEFT + 116} ${ICON_Y} H${RIGHT - 116} M${RIGHT - 128} ${ICON_Y - 10} L${RIGHT - 115} ${ICON_Y} L${RIGHT - 128} ${ICON_Y + 10}"
      fill="none" stroke="#BDB8B1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

const folder = `<svg width="128" height="128" viewBox="0 0 128 128"><path d="M10 30q0-8 8-8h30l8 8h54q8 0 8 8v62q0 8-8 8H18q-8 0-8-8z" fill="#5AA9E6"/><path d="M10 40h108v60q0 8-8 8H18q-8 0-8-8z" fill="#74BBF0"/><text x="64" y="88" text-anchor="middle" font-family="Helvetica" font-size="34" font-weight="700" fill="#3C88C7">A</text></svg>`;
const item = (x, art, name) =>
  `<div style="position:absolute;left:${x - 64}px;top:${ICON_Y - 64}px;width:128px;text-align:center">${art}<div style="font:13px -apple-system,Helvetica,Arial;color:#1d1d1f;margin-top:4px">${name}</div></div>`;
const lights = ["#FF5F57", "#FEBC2E", "#28C840"].map((c) => `<i style="display:block;width:12px;height:12px;border-radius:50%;background:${c}"></i>`).join("");
const window = `
  <div style="width:${W}px;margin:40px;border-radius:12px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.25),0 0 0 .5px rgba(0,0,0,.2)">
    <div style="height:${TITLE_BAR}px;position:relative;background:#ECEAE7;border-bottom:.5px solid #D6D3CF;font:600 13px/${TITLE_BAR}px -apple-system,Helvetica,Arial;color:#4A4A4A;text-align:center">
      <span style="position:absolute;left:10px;top:8px;display:flex;gap:8px">${lights}</span>Simeon</div>
    <div style="position:relative;width:${W}px;height:${H - TITLE_BAR}px;overflow:hidden">${picture}
      ${item(LEFT, `<img src="${data(ICON, "image/png")}" width="128" height="128">`, "Simeon")}
      ${item(RIGHT, folder, "Applications")}
    </div>
  </div>`;

async function shoot(browser, html, size, scale, file) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: scale });
  await page.setContent(`<body style="margin:0;position:relative">${html}</body>`, { waitUntil: "load" });
  await page.screenshot({ path: file });
  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  await shoot(browser, picture, { width: W, height: H }, 1, path.join(__dirname, "background.png"));
  await shoot(browser, picture, { width: W, height: H }, 2, path.join(__dirname, "background@2x.png"));
  if (process.argv[2]) {
    const page = `<div style="background:#9AA3AD;padding:1px 0">${window}</div>`;
    await shoot(browser, page, { width: W + 80, height: H + 82 }, 2, path.resolve(process.argv[2]));
  }
  await browser.close();
})();
