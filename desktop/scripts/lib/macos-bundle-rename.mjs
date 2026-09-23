import { readdir, rename, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Rename a macOS Electron bundle's identity the way electron-packager does
 * (its `mac.js`): the main executable, every helper bundle under
 * Contents/Frameworks named after the old product, each helper's inner
 * executable, and the plist keys that point at them, all together.
 *
 * Why all together: Electron finds its helpers as
 * `Contents/Frameworks/<name> Helper*.app/Contents/MacOS/<name> Helper*`,
 * trying its compiled-in product name and then the main bundle's
 * CFBundleName. On 23 September 2026 CFBundleName alone was set to Simeon
 * while the helpers stayed "Grok Bot Helper*.app"; the app died at launch
 * with SIGTRAP in ElectronMain ("Unable to find helper app"). So the name
 * the helpers carry and the name CFBundleName carries must be one name.
 *
 * `plist.read(file, key)` returns the key's string or null when absent;
 * `plist.write(file, key, value)` sets a string key. Production passes
 * plutil; the test passes JSON files.
 */
export function renamedIdentity(value, fromName, toName) {
  if (value === fromName) return toName;
  if (value.startsWith(`${fromName} `)) return `${toName}${value.slice(fromName.length)}`;
  return value;
}

export function isHelperBundleOf(entryName, fromName) {
  return entryName.endsWith(".app") && entryName.startsWith(`${fromName} `);
}

export async function renameMacBundleIdentity({ appPath, fromName, toName, plist, log = () => {} }) {
  for (const [label, value] of Object.entries({ appPath, fromName, toName })) {
    if (typeof value !== "string" || value.length === 0) throw new TypeError(`renameMacBundleIdentity needs a non-empty ${label}`);
  }
  if (fromName === toName) return { executable: { from: fromName, to: toName }, helpers: [] };
  const contents = path.join(appPath, "Contents");
  const mainPlist = path.join(contents, "Info.plist");
  const mainExecutable = await plist.read(mainPlist, "CFBundleExecutable");
  if (mainExecutable !== fromName) {
    throw new Error(`Expected CFBundleExecutable ${JSON.stringify(fromName)} in ${mainPlist}, found ${JSON.stringify(mainExecutable)}.`);
  }

  const frameworks = path.join(contents, "Frameworks");
  const helpers = [];
  for (const entry of (await readdir(frameworks)).sort()) {
    if (!isHelperBundleOf(entry, fromName)) continue;
    const bundle = path.join(frameworks, entry);
    if (!(await stat(bundle)).isDirectory()) continue;
    const helperPlist = path.join(bundle, "Contents", "Info.plist");
    const helperExecutable = await plist.read(helperPlist, "CFBundleExecutable");
    if (helperExecutable == null) throw new Error(`Helper ${entry} has no CFBundleExecutable in ${helperPlist}.`);
    const renamedExecutable = renamedIdentity(helperExecutable, fromName, toName);
    if (renamedExecutable === helperExecutable) throw new Error(`Helper ${entry} has an executable not named after ${JSON.stringify(fromName)}: ${JSON.stringify(helperExecutable)}.`);
    const macos = path.join(bundle, "Contents", "MacOS");
    await rename(path.join(macos, helperExecutable), path.join(macos, renamedExecutable));
    await plist.write(helperPlist, "CFBundleExecutable", renamedExecutable);
    for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
      const value = await plist.read(helperPlist, key);
      if (value != null && renamedIdentity(value, fromName, toName) !== value) await plist.write(helperPlist, key, renamedIdentity(value, fromName, toName));
    }
    const renamedBundle = renamedIdentity(entry, fromName, toName);
    await rename(bundle, path.join(frameworks, renamedBundle));
    helpers.push({ bundle: { from: entry, to: renamedBundle }, executable: { from: helperExecutable, to: renamedExecutable } });
    log(`renamed helper ${entry} -> ${renamedBundle}`);
  }
  if (helpers.length === 0) throw new Error(`No helper bundle named after ${JSON.stringify(fromName)} under ${frameworks}; refusing to rename the main executable alone (that is the launch crash of 23 September 2026).`);

  const macos = path.join(contents, "MacOS");
  await rename(path.join(macos, fromName), path.join(macos, toName));
  await plist.write(mainPlist, "CFBundleExecutable", toName);
  await plist.write(mainPlist, "CFBundleName", toName);
  log(`renamed executable ${fromName} -> ${toName} (${helpers.length} helpers)`);
  return { executable: { from: fromName, to: toName }, helpers };
}
