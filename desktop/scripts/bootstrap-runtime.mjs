import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, copyFile, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { archivedDmg, cachedDmg, cachedRuntimeApp, dmgSha256, dmgUrls } from "./lib/config.mjs";
import { run } from "./lib/process.mjs";
import { cacheRuntimeFromApp, hydrateSourcePayloadFromRuntime, validateRuntimeApp } from "./lib/runtime.mjs";
import { SYSTEM_TOOLS } from "./lib/system-tools.mjs";

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function sha256(target) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(target)) hash.update(chunk);
  return hash.digest("hex");
}

async function downloadDmg() {
  await mkdir(path.dirname(cachedDmg), { recursive: true });
  if (await exists(cachedDmg)) {
    const digest = await sha256(cachedDmg);
    if (digest === dmgSha256) return;
    await rm(cachedDmg, { force: true });
  }

  if (await exists(archivedDmg)) {
    const archivedDigest = await sha256(archivedDmg);
    if (archivedDigest !== dmgSha256) {
      throw new Error(`Archived DMG checksum mismatch: expected ${dmgSha256}, got ${archivedDigest}. Run git lfs pull before bootstrapping.`);
    }
    console.log(`Using archived release ${archivedDmg}`);
    await copyFile(archivedDmg, cachedDmg);
    return;
  }

  // Each source is tried in turn and each is held to the same pin, so a host
  // that is gone, throttled, or serving something else costs an attempt rather
  // than producing a wrong build. `dmgSha256` is the authority; the URL is not.
  const partial = `${cachedDmg}.partial`;
  const failures = [];
  for (const url of dmgUrls) {
    console.log(`Downloading ${url}`);
    await rm(partial, { force: true });
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok || response.body == null) {
        failures.push(`${url} — HTTP ${response.status}`);
        continue;
      }
      await pipeline(Readable.fromWeb(response.body), createWriteStream(partial, { mode: 0o600 }));
      const digest = await sha256(partial);
      if (digest !== dmgSha256) {
        failures.push(`${url} — checksum ${digest}`);
        continue;
      }
      await rename(partial, cachedDmg);
      return;
    } catch (error) {
      failures.push(`${url} — ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await rm(partial, { force: true });
  throw new Error(
    `Could not obtain the pinned 0.18.0 DMG (sha256 ${dmgSha256}).\n` +
      failures.map(line => `  ${line}`).join("\n") +
      `\n\n  Every source above is checked against that digest, so none of these\n` +
      `  is a substitution risk — they are simply unavailable. If you have the\n` +
      `  file or a 0.18.0 install, either of these skips the network entirely:\n` +
      `      GROK_BOT_018_APP="/Applications/Grok Bot.app" npm run bootstrap\n` +
      `      cp Grok_Bot_0.18.0.dmg research-archives/original/0.18.0/macos-arm64/\n` +
      `  Or point it at one you can reach: GROK_BOT_DMG_URL=… npm run bootstrap\n` +
      `  See docs/product/getting-the-pinned-dmg.md.`,
  );
}

async function extractRuntime() {
  const mountRoot = await mkdtemp(path.join(tmpdir(), "grok-bot-018-mount-"));
  let attached = false;
  try {
    await run(SYSTEM_TOOLS.hdiutil, ["attach", "-readonly", "-nobrowse", "-mountpoint", mountRoot, cachedDmg]);
    attached = true;
    await cacheRuntimeFromApp(path.join(mountRoot, "Grok Bot.app"));
  } finally {
    if (attached) await run(SYSTEM_TOOLS.hdiutil, ["detach", mountRoot]);
    await rm(mountRoot, { recursive: true, force: true });
  }
}

const configuredApp = process.env.GROK_BOT_018_APP?.trim();
let runtimeApp;
if (configuredApp) {
  runtimeApp = await cacheRuntimeFromApp(configuredApp);
} else if (await exists(cachedRuntimeApp)) {
  runtimeApp = await validateRuntimeApp(cachedRuntimeApp);
} else {
  await downloadDmg();
  await extractRuntime();
  runtimeApp = await validateRuntimeApp(cachedRuntimeApp);
}

const hydrated = await hydrateSourcePayloadFromRuntime(runtimeApp);

console.log(`Runtime ready: ${cachedRuntimeApp}`);
console.log(`Checksum-pinned source payload ready: ${hydrated.destination} (${hydrated.sha256})`);
console.log("The checksum-pinned app supplies only the Electron shell, ABI-matched native dependencies, and explicitly documented build fallbacks.");
