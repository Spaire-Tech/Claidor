// Photographs the reconstructed renderer, offline, with fixture data.
//
//   node harness/shoot.mjs                 # every screen, light
//   node harness/shoot.mjs thread settings # named screens
//   SHOT_SCENARIO=dark node harness/shoot.mjs
//   SHOT_SCALE=2 node harness/shoot.mjs    # retina pictures
//   SHOT_NO_BUILD=1 node harness/shoot.mjs # reuse .build/frontend-shell
//   SHOT_FACES=0 node harness/shoot.mjs    # Grok's own marks, no face overlay
//
// The renderer is the real one (`frontend/src/main.tsx`, built by Vite into
// `.build/frontend-shell`). What is fake is the world around it:
// `fake-desktop.js` stands in for the Electron preload and the coordinator,
// answering from `fixtures.mjs`. Nothing leaves the loopback; the shooter
// fails if anything tries.
//
// Besides the pictures it writes `shots/audit.json`: every `sand-*` class in
// the DOM that no loaded stylesheet defines, grouped by the element it sits
// on, plus every text element still at the browser's default 16px. That list
// is the style fix's work list — the atoms the 0.18.0 stylesheet had and the
// reconstruction does not.
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { fixturesFor } from "./fixtures.mjs";
import { buildFaceOverlayScript } from "./face-overlay-bundle.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, "..");
const dist = path.join(desktopRoot, ".build", "frontend-shell");
const shotsDir = path.join(here, "shots");
const CHROMIUM = process.env.SHOT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff",
};

if (process.env.SHOT_NO_BUILD !== "1") {
  execFileSync("npx", ["vite", "build", "--config", "frontend/vite.config.ts", "--logLevel", "error"], { cwd: desktopRoot, stdio: "inherit" });
}
await mkdir(shotsDir, { recursive: true });
// The packaged app paints a clay face per agent over Grok's marks from the
// preload; the harness injects the same script so the pictures show them.
const faceOverlay = process.env.SHOT_FACES === "0" ? null : await buildFaceOverlayScript();

const problems = [];
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://x");
  if (url.pathname === "/favicon.ico") { response.statusCode = 204; response.end(); return; }
  // The renderer posts a health report to its Vite dev host; there is none here.
  if (url.pathname === "/__reconstructed_health") { response.statusCode = 204; response.end(); return; }
  const file = url.pathname === "/" ? "/index.html" : url.pathname;
  try {
    const body = await readFile(path.join(dist, file));
    response.setHeader("content-type", TYPES[path.extname(file)] ?? "application/octet-stream");
    response.end(body);
  } catch {
    problems.push(`404 from the harness server: ${file}`);
    response.statusCode = 404;
    response.end("not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

const scenario = process.env.SHOT_SCENARIO ?? "light";
const [width, height] = (process.env.SHOT_VIEWPORT ?? "1280x820").split("x").map(Number);
const scale = Number(process.env.SHOT_SCALE ?? "1");
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--use-gl=swiftshader"] });

async function openPage(activeAgentId) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: scenario === "dark" ? "dark" : "light" });
  page.on("console", (message) => { if (message.type() === "error") problems.push(`console: ${message.text().slice(0, 300)}`); });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 300)}`));
  page.on("response", (response) => { if (response.status() >= 400) problems.push(`${response.status()}: ${response.url()}`); });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.protocol !== "data:" && url.protocol !== "blob:") problems.push(`left the loopback: ${request.url()}`);
  });
  await page.addInitScript((fixtures) => { window.__caisraFixtures = fixtures; }, fixturesFor(scenario, activeAgentId));
  await page.addInitScript({ path: path.join(here, "fake-desktop.js") });
  if (faceOverlay != null) await page.addInitScript({ path: faceOverlay });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.locator(".sand-agent-item").first().waitFor({ timeout: 15_000 });
  await page.locator(".sand-prompt-form, .sand-chat-input-dock").first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(600);
  return page;
}

async function shot(page, name) {
  const file = path.join(shotsDir, `${scenario === "light" ? "" : `${scenario}-`}${name}.png`);
  await page.screenshot({ path: file });
  console.log("shot", path.relative(desktopRoot, file));
}

const SCREENS = {
  async thread(page) { await shot(page, "thread"); },
  async "account-menu"(page) {
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await page.getByRole("menuitem", { name: "Settings" }).waitFor();
    await shot(page, "account-menu");
  },
  async settings(page) {
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await page.locator(".sand-settings-dialog, [aria-label='Caisra settings']").first().waitFor();
    await page.waitForTimeout(400);
    await shot(page, "settings");
  },
  async plugins(page) {
    await page.locator(".sand-agents-sidebar__plugins").click();
    await page.locator(".sand-plugins-dialog").waitFor();
    await page.waitForTimeout(400);
    await shot(page, "plugins");
  },
  async "agent-settings"(page) {
    // The header sits under the window's drag strip (`.sand-cover-drag`), so
    // the click has to be forced past the hit test, as a real pointer is.
    await page.getByRole("button", { name: "View agent settings" }).click({ force: true });
    await page.locator(".sand-info-pane").waitFor();
    await page.waitForTimeout(300);
    await shot(page, "agent-settings");
  },
  async composing(page) {
    const field = page.locator(".sand-prompt-form textarea, .sand-prompt-form [contenteditable='true']").first();
    await field.click();
    await page.keyboard.type("check my most recent excel file and tell me the headline numbers");
    await page.waitForTimeout(200);
    await shot(page, "composing");
  },
  async group(page) { await shot(page, "group"); },
  // Every mark on the thread put into a different state, so one picture
  // shows the bob, the lean and the eye openness side by side; the video
  // from `node harness/face-preview.mjs` shows them moving.
  async faces(page) {
    const states = ["working", "thinking", "searching", "listening", "excited", "sleeping", "celebrate", "curious", "sad"];
    const found = await page.evaluate((states) => {
      const marks = [...document.querySelectorAll(".sand-grok-bot-mark")];
      marks.forEach((mark, index) => {
        const target = mark.querySelector("[data-grok-state]") ?? mark;
        target.setAttribute("data-grok-state", states[index % states.length]);
      });
      return marks.length;
    }, states);
    if (found === 0) throw new Error("no .sand-grok-bot-mark on the thread");
    await page.waitForTimeout(450);
    const counts = await page.evaluate(() => ({
      moving: document.querySelectorAll("[data-caisra-face] .caisra-face__face[transform]").length,
      // Group and shared-room avatars keep Grok's own marks, by design.
      grouped: document.querySelectorAll(".sand-group-avatar .sand-grok-bot-mark, .sand-shared-room-avatar .sand-grok-bot-mark").length,
    }));
    if (counts.moving === 0) throw new Error(`${found} marks but no face carries a transform`);
    console.log(`faces: ${found} marks, ${counts.moving} moving, ${counts.grouped} inside group avatars left as Grok's`);
    if (counts.moving + counts.grouped < found) problems.push(`faces: ${found - counts.moving - counts.grouped} mark(s) outside a group avatar were not painted`);
    await shot(page, "faces");
  },
};
const AGENT_FOR_SCREEN = { group: "board-pack" };

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCREENS);
let audit = null;
for (const screen of wanted) {
  const run = SCREENS[screen];
  if (run == null) { problems.push(`no such screen: ${screen}`); continue; }
  const page = await openPage(AGENT_FOR_SCREEN[screen] ?? "perrin");
  try {
    await run(page);
    if (screen === "thread") audit = await auditNakedStyles(page);
  } catch (error) {
    problems.push(`${screen}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    await shot(page, `${screen}-FAILED`);
  } finally {
    await page.close();
  }
}

// Which `sand-*` classes in the DOM have no rule in any loaded stylesheet,
// and which text is still at the browser default size. Run on the thread,
// which is the screen with the most of the app on it.
async function auditNakedStyles(page) {
  return page.evaluate(() => {
    const defined = new Set();
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      const walk = (list) => {
        for (const rule of list) {
          if (rule.selectorText) for (const match of rule.selectorText.matchAll(/\.(sand-[A-Za-z0-9_-]+)/g)) defined.add(match[1]);
          if (rule.cssRules) walk(rule.cssRules);
        }
      };
      walk(rules);
    }
    const undefinedTokens = new Map();
    const elements = document.querySelectorAll(".sand-shell *");
    for (const element of elements) {
      const tokens = [...element.classList].filter((token) => token.startsWith("sand-"));
      const missing = tokens.filter((token) => !defined.has(token));
      if (missing.length === 0) continue;
      const semantic = tokens.filter((token) => defined.has(token));
      let owner = element.parentElement;
      while (owner != null && ![...owner.classList].some((token) => token.startsWith("sand-") && defined.has(token))) owner = owner.parentElement;
      const ownerClass = owner == null ? "(none)" : [...owner.classList].find((token) => token.startsWith("sand-") && defined.has(token));
      for (const token of missing) {
        const entry = undefinedTokens.get(token) ?? { count: 0, on: new Set(), under: new Set(), tags: new Set() };
        entry.count += 1;
        entry.tags.add(element.tagName.toLowerCase());
        for (const own of semantic) entry.on.add(own);
        entry.under.add(ownerClass);
        undefinedTokens.set(token, entry);
      }
    }
    const rootSize = getComputedStyle(document.documentElement).fontSize;
    const defaultSized = [];
    for (const element of elements) {
      if (element.children.length > 0 || (element.textContent ?? "").trim().length === 0) continue;
      const style = getComputedStyle(element);
      if (style.fontSize === rootSize) {
        defaultSized.push({
          tag: element.tagName.toLowerCase(),
          classes: [...element.classList].join(" "),
          text: (element.textContent ?? "").trim().slice(0, 40),
          parent: [...(element.parentElement?.classList ?? [])].filter((token) => token.startsWith("sand-")).join(" "),
        });
      }
    }
    return {
      definedSandClasses: defined.size,
      elementsInShell: elements.length,
      rootFontSize: rootSize,
      undefinedTokens: [...undefinedTokens.entries()]
        .map(([token, entry]) => ({ token, count: entry.count, tags: [...entry.tags], on: [...entry.on], under: [...entry.under] }))
        .sort((left, right) => right.count - left.count),
      defaultSizedText: defaultSized,
    };
  });
}

await browser.close();
server.close();

if (audit != null) {
  await writeFile(path.join(shotsDir, "audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
  const undefinedCount = audit.undefinedTokens.length;
  const undefinedUses = audit.undefinedTokens.reduce((sum, entry) => sum + entry.count, 0);
  console.log(`audit: ${audit.definedSandClasses} sand-* classes defined; ${undefinedCount} undefined classes used ${undefinedUses} times; ${audit.defaultSizedText.length} text elements at the default ${audit.rootFontSize}`);
  console.log("audit: most-used undefined classes:");
  for (const entry of audit.undefinedTokens.slice(0, 25)) {
    console.log(`  ${entry.token.padEnd(18)} ×${String(entry.count).padEnd(4)} on ${entry.on.join(",") || "-"}  under ${entry.under.join(",")}`);
  }
}

const unique = [...new Set(problems)];
if (unique.length > 0) {
  console.log(`\n${unique.length} problem(s):`);
  for (const problem of unique) console.log(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log("\nno console errors, no failed requests, nothing left the loopback");
}
