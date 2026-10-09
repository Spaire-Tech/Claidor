// The cloud computer's wallpaper (9 October 2026): the host writes Simeon's
// picture to a folder and points the computer's own `sand-wallpaper` at it.
// Checked here: the embedded copy is box/wallpapers' file; the folder holds
// the picture under both images' names; every paint carries the folder and
// the fallback; a folder that can't be written leaves the image's own
// wallpaper; and, where this machine has an X server and hsetroot, Simeon's
// script paints the picture on a real display.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

import { OUT_FILE, WALLPAPER_FILE, renderWallpaperModule } from "../scripts/make-box-wallpaper.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopRoot, "..");

async function loadCommands() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-wallpaper-test-"));
  const outfile = path.join(dir, "commands.mjs");
  await build({ entryPoints: [path.join(desktopRoot, "source/host/extensions/wallpaper/box-wallpaper-commands.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  return import(pathToFileURL(outfile).href);
}

test("the host's copy of the wallpaper is box/wallpapers' file", async () => {
  const bytes = await readFile(WALLPAPER_FILE);
  assert.equal(await readFile(OUT_FILE, "utf8"), renderWallpaperModule(bytes), "run: node scripts/make-box-wallpaper.mjs");
  // A JPEG, the same picture for every tone of Simeon's image.
  assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  for (const tone of ["a", "c"]) assert.ok(bytes.equals(readFileSync(path.join(repoRoot, "box/wallpapers", `simeon-${tone}.png`))), `simeon-${tone}.png differs`);
});

test("a paint writes the picture under both images' names and points sand-wallpaper at it", async () => {
  const { createBoxWallpaperCommands, WALLPAPER_FILE_NAMES } = await loadCommands();
  const dir = path.join(await mkdtemp(path.join(os.tmpdir(), "simeon-wallpaper-dir-")), "wallpaper");
  const runs = [];
  const logs = [];
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
  const commands = createBoxWallpaperCommands({
    settingsPath: "/nowhere/settings.json",
    log: (line) => logs.push(line),
    wallpaperDir: dir,
    wallpaperBytes: bytes,
    exists: existsSync,
    readDisplays: async () => [{ display: ":1", uid: 1000, gid: 1000 }, { display: ":2", uid: 1000, gid: 1000 }],
    runCommand: async (file, args, options) => { runs.push({ file, args, options }); return { stdout: "" }; },
  });
  await commands.paint();
  assert.deepEqual(WALLPAPER_FILE_NAMES, ["sand-wallpaper-02-a.png", "simeon-a.png", "sand-wallpaper-02-b.png", "simeon-b.png", "sand-wallpaper-02-c.png", "simeon-c.png"]);
  for (const name of WALLPAPER_FILE_NAMES) assert.ok(readFileSync(path.join(dir, name)).equals(bytes), name);
  assert.deepEqual(runs.map((run) => run.args), [["paint", ":1"], ["paint", ":2"]]);
  for (const run of runs) {
    assert.equal(run.options.env.SAND_WALLPAPER_TONE_DIR, dir);
    assert.equal(run.options.env.SAND_WALLPAPER_FALLBACK, path.join(dir, "simeon-b.png"));
    assert.equal(run.options.env.PATH, process.env.PATH);
  }
  assert.deepEqual(logs, []);
});

test("a folder that can't be written leaves the image's own wallpaper, said once", async () => {
  const { createBoxWallpaperCommands, writeWallpaperFolder } = await loadCommands();
  const base = await mkdtemp(path.join(os.tmpdir(), "simeon-wallpaper-link-"));
  mkdirSync(path.join(base, "elsewhere"));
  symlinkSync(path.join(base, "elsewhere"), path.join(base, "link"));
  assert.equal(writeWallpaperFolder(path.join(base, "link"), Buffer.from([1])), false);
  await writeFile(path.join(base, "file"), "x");
  assert.equal(writeWallpaperFolder(path.join(base, "file"), Buffer.from([1])), false);

  const runs = [];
  const logs = [];
  const commands = createBoxWallpaperCommands({
    settingsPath: "/nowhere/settings.json",
    log: (line) => logs.push(line),
    wallpaperDir: path.join(base, "link"),
    exists: existsSync,
    readDisplays: async () => [{ display: ":1", uid: 1000, gid: 1000 }],
    runCommand: async (file, args, options) => { runs.push(options); return { stdout: "" }; },
  });
  await commands.paint();
  await commands.paint();
  assert.equal(runs.length, 2);
  for (const options of runs) assert.equal(options.env, undefined);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /could not be written/);
  // And none at all when asked for none.
  const plain = createBoxWallpaperCommands({ settingsPath: "/x", log: () => {}, wallpaperDir: null, readDisplays: async () => [{ display: ":1", uid: 0, gid: 0 }], runCommand: async (file, args, options) => { runs.push(options); return { stdout: "" }; } });
  await plain.paint();
  assert.equal(runs.at(-1).env, undefined);
});

function has(tool) {
  try { execFileSync("sh", ["-c", `command -v ${tool}`], { stdio: "ignore" }); return true; } catch { return false; }
}

const canPaint = process.platform === "linux" && ["Xvfb", "hsetroot", "convert", "import"].every(has);

test("Simeon's sand-wallpaper paints the picture on a real display", { skip: canPaint ? false : "needs Linux with Xvfb, hsetroot and ImageMagick" }, async () => {
  const { createBoxWallpaperCommands } = await loadCommands();
  const display = ":91";
  const xvfb = spawn("Xvfb", [display, "-screen", "0", "1280x800x24"], { stdio: "ignore" });
  try {
    for (let i = 0; i < 50 && !existsSync("/tmp/.X11-unix/X91"); i++) await new Promise((resolve) => setTimeout(resolve, 100));
    const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-wallpaper-paint-"));
    const commands = createBoxWallpaperCommands({
      settingsPath: path.join(dir, "settings.json"),
      log: () => {},
      wallpaperDir: path.join(dir, "wallpaper"),
      wallpaperCommandPath: path.join(repoRoot, "box/bin/sand-wallpaper"),
      readDisplays: async () => [{ display, uid: process.getuid(), gid: process.getgid() }],
      runCommand: (file, args, options) => new Promise((resolve, reject) => {
        const child = spawn(file, args, { env: { ...options.env, SAND_WALLPAPER_TONE_SCRIPT: path.join(repoRoot, "box/bin/sand-wallpaper-tone.mjs"), SAND_WALLPAPER_NODE: process.execPath }, stdio: "ignore" });
        child.on("exit", (code) => (code === 0 ? resolve({ stdout: "" }) : reject(new Error(`exit ${code}`))));
      }),
    });
    await commands.paint();
    const mean = (args) => Number(execFileSync("convert", [...args, "-colorspace", "gray", "-format", "%[fx:mean]", "info:"], { env: { ...process.env, DISPLAY: display } }).toString());
    const shot = path.join(dir, "root.png");
    execFileSync("import", ["-window", "root", shot], { env: { ...process.env, DISPLAY: display } });
    const painted = mean([shot]);
    const picture = mean([WALLPAPER_FILE]);
    // The picture, not the solid fallback colour (#1b2a4a is about 0.15 in grey).
    assert.ok(Math.abs(painted - picture) < 0.01, `root ${painted} vs picture ${picture}`);
    await rm(dir, { recursive: true, force: true });
  } finally {
    xvfb.kill();
  }
});
