import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { isHelperBundleOf, renamedIdentity, renameMacBundleIdentity } from "../scripts/lib/macos-bundle-rename.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Plists as JSON files, so the rename logic runs where plutil does not exist.
const jsonPlist = {
  read: async (file, key) => { const value = JSON.parse(await readFile(file, "utf8"))[key]; return typeof value === "string" ? value : null; },
  write: async (file, key, value) => { const record = JSON.parse(await readFile(file, "utf8")); record[key] = value; await writeFile(file, JSON.stringify(record)); },
};

async function fakeShell(root, name) {
  const app = path.join(root, "Out.app");
  const contents = path.join(app, "Contents");
  await mkdir(path.join(contents, "MacOS"), { recursive: true });
  await writeFile(path.join(contents, "MacOS", name), "main");
  await writeFile(path.join(contents, "Info.plist"), JSON.stringify({ CFBundleExecutable: name, CFBundleName: name, CFBundleDisplayName: "Simeon", CFBundleIdentifier: "com.example.app" }));
  const frameworks = path.join(contents, "Frameworks");
  for (const suffix of ["", " (GPU)", " (Plugin)", " (Renderer)"]) {
    const helper = `${name} Helper${suffix}`;
    await mkdir(path.join(frameworks, `${helper}.app`, "Contents", "MacOS"), { recursive: true });
    await writeFile(path.join(frameworks, `${helper}.app`, "Contents", "MacOS", helper), "helper");
    await writeFile(path.join(frameworks, `${helper}.app`, "Contents", "Info.plist"), JSON.stringify({ CFBundleExecutable: helper, CFBundleName: helper, CFBundleIdentifier: `com.example.helper${suffix}` }));
  }
  await mkdir(path.join(frameworks, "Electron Framework.framework", "Resources"), { recursive: true });
  await mkdir(path.join(frameworks, "Squirrel.framework"), { recursive: true });
  return app;
}

async function walk(root, current = root) {
  const out = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const target = path.join(current, entry.name);
    out.push(path.relative(root, target));
    if (entry.isDirectory()) out.push(...await walk(root, target));
  }
  return out.sort();
}

test("the name rule follows electron-packager: the product name and every name that starts with it", () => {
  assert.equal(renamedIdentity("Grok Bot", "Grok Bot", "Simeon"), "Simeon");
  assert.equal(renamedIdentity("Grok Bot Helper (GPU)", "Grok Bot", "Simeon"), "Simeon Helper (GPU)");
  assert.equal(renamedIdentity("Grok Bot Helper.app", "Grok Bot", "Simeon"), "Simeon Helper.app");
  assert.equal(renamedIdentity("Electron Framework", "Grok Bot", "Simeon"), "Electron Framework");
  assert.equal(renamedIdentity("Grok Bottle", "Grok Bot", "Simeon"), "Grok Bottle");
  assert.equal(isHelperBundleOf("Grok Bot Helper (Renderer).app", "Grok Bot"), true);
  assert.equal(isHelperBundleOf("Electron Framework.framework", "Grok Bot"), false);
  assert.equal(isHelperBundleOf("Grok Bot", "Grok Bot"), false);
});

test("the executable, the four helpers, their executables and their plists are renamed together", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "caisra-bundle-rename-"));
  try {
    const app = await fakeShell(root, "Grok Bot");
    const result = await renameMacBundleIdentity({ appPath: app, fromName: "Grok Bot", toName: "Simeon", plist: jsonPlist });
    assert.deepEqual(result.executable, { from: "Grok Bot", to: "Simeon" });
    assert.deepEqual(result.helpers.map((helper) => helper.bundle.to), ["Simeon Helper (GPU).app", "Simeon Helper (Plugin).app", "Simeon Helper (Renderer).app", "Simeon Helper.app"]);
    const tree = await walk(app);
    assert.equal(tree.some((entry) => entry.includes("Grok Bot")), false, `old name survives: ${tree.filter((entry) => entry.includes("Grok Bot")).join(", ")}`);
    assert.ok(tree.includes(path.join("Contents", "MacOS", "Simeon")));
    assert.ok(tree.includes(path.join("Contents", "Frameworks", "Electron Framework.framework")), "frameworks not named after the product are untouched");
    // The launch invariant: what Electron opens is
    // Frameworks/<CFBundleName> Helper*.app/Contents/MacOS/<same name> Helper*,
    // and each plist's CFBundleExecutable must be a file in its own MacOS dir.
    const mainPlist = JSON.parse(await readFile(path.join(app, "Contents", "Info.plist"), "utf8"));
    assert.equal(mainPlist.CFBundleExecutable, "Simeon");
    assert.equal(mainPlist.CFBundleName, "Simeon");
    assert.equal(mainPlist.CFBundleIdentifier, "com.example.app", "the bundle id is not this step's");
    for (const suffix of ["", " (GPU)", " (Plugin)", " (Renderer)"]) {
      const bundle = path.join(app, "Contents", "Frameworks", `${mainPlist.CFBundleName} Helper${suffix}.app`);
      const plist = JSON.parse(await readFile(path.join(bundle, "Contents", "Info.plist"), "utf8"));
      assert.equal(plist.CFBundleExecutable, `Simeon Helper${suffix}`);
      assert.equal(plist.CFBundleName, `Simeon Helper${suffix}`);
      assert.equal(plist.CFBundleIdentifier, `com.example.helper${suffix}`);
      assert.ok((await stat(path.join(bundle, "Contents", "MacOS", plist.CFBundleExecutable))).isFile());
    }
    assert.equal((await stat(path.join(app, "Contents", "MacOS", mainPlist.CFBundleExecutable))).isFile(), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a bundle whose executable is not the expected name, or that has no helpers, is refused untouched", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "caisra-bundle-rename-"));
  try {
    const app = await fakeShell(root, "Grok Bot");
    await assert.rejects(renameMacBundleIdentity({ appPath: app, fromName: "Other", toName: "Simeon", plist: jsonPlist }), /Expected CFBundleExecutable "Other"/);
    const before = await walk(app);
    await rm(path.join(app, "Contents", "Frameworks"), { recursive: true });
    await mkdir(path.join(app, "Contents", "Frameworks"));
    await assert.rejects(renameMacBundleIdentity({ appPath: app, fromName: "Grok Bot", toName: "Simeon", plist: jsonPlist }), /No helper bundle/);
    assert.deepEqual((await walk(app)).filter((entry) => !entry.startsWith(path.join("Contents", "Frameworks"))), before.filter((entry) => !entry.startsWith(path.join("Contents", "Frameworks"))));
    assert.deepEqual(await renameMacBundleIdentity({ appPath: app, fromName: "Simeon", toName: "Simeon", plist: jsonPlist }), { executable: { from: "Simeon", to: "Simeon" }, helpers: [] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("packaging renames the shell before signing, and verification reads the renamed executable", async () => {
  const packager = await readFile(path.join(repoRoot, "scripts", "package-macos.mjs"), "utf8");
  const renameAt = packager.indexOf("await renameMacBundleIdentity({");
  const signAt = packager.indexOf("await signAppBundleAdHoc(outputApp)");
  assert.ok(renameAt > 0 && signAt > renameAt, "the rename must come before the ad-hoc signature that covers it");
  assert.match(packager, /fromName: await capture\(SYSTEM_TOOLS\.plutil, \["-extract", "CFBundleExecutable", "raw", infoPlist\]\)/);
  assert.match(packager, /toName: reconstructedExecutableName/);
  assert.doesNotMatch(packager, /"-replace", "CFBundleName"/, "CFBundleName is written by the rename, with the helpers, never alone");
  const verification = await readFile(path.join(repoRoot, "scripts", "lib", "macos-package-verification.mjs"), "utf8");
  assert.match(verification, /path\.join\(reconstructedApp, "Contents", "MacOS", reconstructedExecutableName\)/);
  assert.match(verification, /path\.join\(officialApp, "Contents", "MacOS", "Grok Bot"\)/, "the official reference keeps its own name");
  const config = await readFile(path.join(repoRoot, "scripts", "lib", "config.mjs"), "utf8");
  assert.match(config, /export const reconstructedExecutableName = reconstructedName;/);
});
