#!/usr/bin/env node
/**
 * Screenshots of Simeon's own window against the demo's fake backend, for
 * looking at a slice before it goes to the Air:
 *
 *   node window/scripts/build-window-demo.mjs --serve &
 *   node window/test/screenshots.mjs [outDir]
 *
 * Writes signin.png, main-light.png, main-dark.png, rail.png, group.png.
 * Needs the demo server on 127.0.0.1:4174 (SIMEON_WINDOW_DEMO_PORT).
 */
import { mkdirSync } from "node:fs";
import path from "node:path";

import { chromium } from "playwright-core";

const outDir = path.resolve(process.argv[2] ?? ".build/window-shots");
mkdirSync(outDir, { recursive: true });
const base = `http://127.0.0.1:${process.env.SIMEON_WINDOW_DEMO_PORT ?? 4174}/`;
const browser = await chromium.launch({ executablePath: process.env.SIMEON_CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const failures = [];
try {
  const shot = async (name, query, act) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    page.on("pageerror", error => failures.push(`${name}: ${error.message}`));
    await page.goto(`${base}${query}`, { waitUntil: "load" });
    await page.waitForSelector("[data-screen]", { timeout: 15_000 });
    await page.waitForTimeout(1500);
    if (act != null) await act(page);
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
    const screen = await page.getAttribute("[data-screen]", "data-screen");
    await page.close();
    return screen;
  };
  const signin = await shot("signin", "?onboarding&theme=light");
  if (signin !== "sign-in") failures.push(`signin: expected the sign-in screen, got ${signin}`);
  const main = await shot("main-light", "?theme=light", async page => {
    const rows = await page.locator(".agent-row").count();
    if (rows < 3) failures.push(`main-light: expected at least 3 agent rows, got ${rows}`);
    const bubbles = await page.locator(".bubble").count();
    if (bubbles < 2) failures.push(`main-light: expected a conversation, got ${bubbles} bubbles`);
  });
  if (main !== "shell") failures.push(`main-light: expected the shell, got ${main}`);
  await shot("main-dark", "?theme=dark");
  await shot("rail", "?theme=light", async page => { await page.keyboard.press("Meta+b"); await page.waitForTimeout(300); });
  await shot("group", "?theme=light", async page => {
    const group = page.locator(".agent-row", { hasText: "squad" }).first();
    if (await group.count() === 0) { failures.push("group: no group row"); return; }
    await group.click();
    await page.waitForTimeout(800);
  });
  await shot("typed", "?theme=light", async page => {
    await page.fill(".composer__input", "Where are we on the launch?");
    await page.waitForTimeout(200);
  });
} finally {
  await browser.close();
}
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`screenshots in ${outDir}`);
