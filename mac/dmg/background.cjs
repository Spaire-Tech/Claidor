// The disk image's window picture (mac/scripts/dmg.sh, 29 October 2026), drawn in Chromium: six clay faces,
// each with its cursor, scattered around the places of Simeon and Applications. Finder draws the two icons
// (128 points, centred on LEFT and RIGHT at ICON_Y, as dmg.sh places them) and their names under them.
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
const W = 720, H = 480, TITLE_BAR = 28;
const LEFT = 210, RIGHT = 510, ICON_Y = 215;
const GROUND = "#FAFAF8";
// Each face where it sits, its cursor pointing at Applications, in a brighter shade of the face's own background.
const FACES_AT = [
  { face: "clay-06", x: 468, y: 50, colour: "#E2643F" },
  { face: "clay-14", x: 338, y: 110, colour: "#E59A2F" },
  { face: "clay-23", x: 664, y: 100, colour: "#2FA39A" },
  { face: "clay-19", x: 342, y: 338, colour: "#A35CC7" },
  { face: "clay-simeon", x: 652, y: 356, colour: "#3D8FD6" },
  { face: "clay-27", x: 486, y: 412, colour: "#4FA352" },
];
const FACE = 40, RING = 2.5, REACH = 35;

const data = (file, type) => `data:${type};base64,${readFileSync(file).toString("base64")}`;
const face = ({ face: id, x, y }) =>
  `<div style="position:absolute;left:${x - FACE / 2}px;top:${y - FACE / 2}px;width:${FACE}px;height:${FACE}px;box-sizing:border-box;border:${RING}px solid #fff;border-radius:50%;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.18)">` +
  `<img src="${data(path.join(FACES, `${id}.webp`), "image/webp")}" style="width:100%;height:100%;object-fit:cover;transform:scale(1.4) translateY(10%)"></div>`;
// A pointer beside the face, its tip toward the Applications folder's centre.
const cursor = ({ x, y, colour }) => {
  const toward = Math.atan2(ICON_Y - y, RIGHT - x);
  const cx = x + REACH * Math.cos(toward), cy = y + REACH * Math.sin(toward);
  return `<path transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${((toward * 180) / Math.PI).toFixed(1)}) scale(1.15)" d="M11 0 L-9 -9.5 L-4.5 0 L-9 9.5 Z" fill="${colour}" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/>`;
};
const picture = `
  <div style="position:absolute;inset:0;background:${GROUND}"></div>
  <svg style="position:absolute;left:0;top:0;overflow:visible;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.22))" width="${W}" height="${H}">${FACES_AT.map(cursor).join("")}</svg>
  ${FACES_AT.map(face).join("")}`;

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
