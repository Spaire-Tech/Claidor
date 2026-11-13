import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import test from "node:test";

import { buildHostBundle, HOST_COMPANIONS, LATEST_VERSION_FILE, publishPlan, staleAppReason, TRIAL_VERSION_FILE, versionIn } from "../scripts/lib/host-bundle-publish.mjs";

// The bundle the cloud computers mount, in the upstream app's layout (29 September 2026).
function members(tarGz) {
  const tar = gunzipSync(tarGz);
  const found = [];
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const name = tar.subarray(offset, offset + 100).toString("utf8").replace(/\0.*$/s, "");
    if (name === "") break;
    const size = Number.parseInt(tar.subarray(offset + 124, offset + 136).toString("ascii"), 8);
    const mtime = Number.parseInt(tar.subarray(offset + 136, offset + 148).toString("ascii"), 8);
    found.push({ name, mtime, bytes: tar.subarray(offset + 512, offset + 512 + size).toString() });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return found;
}

const companions = Object.fromEntries(HOST_COMPANIONS.map((name) => [name, Buffer.from(`worker ${name}`)]));

test("the bundle is the upstream app's layout, the same bytes every time, with the files the server reads", () => {
  const input = { version: "afb1dedebc53", hostBytes: Buffer.from("host"), boxExecDaemonBytes: Buffer.from("daemon"), companions };
  const first = buildHostBundle(input);
  assert.equal(first.tarballName, "sand-host-bundle-afb1dedebc53.tgz");
  assert.equal(first.versionName, LATEST_VERSION_FILE);
  assert.equal(first.versionBody, "afb1dedebc53\n");
  assert.ok(buildHostBundle(input).tarball.equals(first.tarball));
  assert.deepEqual(members(first.tarball), [
    { name: "host/host-main.cjs", mtime: 0, bytes: "host" },
    { name: "host/agent-isolation/agent-store-worker.cjs", mtime: 0, bytes: "worker agent-isolation/agent-store-worker.cjs" },
    { name: "host/agent-isolation/transcript-mirror-worker.cjs", mtime: 0, bytes: "worker agent-isolation/transcript-mirror-worker.cjs" },
    { name: "host/extensions/box-store-sync/box-store-vacuum-worker.cjs", mtime: 0, bytes: "worker extensions/box-store-sync/box-store-vacuum-worker.cjs" },
    { name: "host/extensions/content-search/search-index-worker.cjs", mtime: 0, bytes: "worker extensions/content-search/search-index-worker.cjs" },
    { name: "box-exec-daemon/main.cjs", mtime: 0, bytes: "daemon" },
  ]);
});

// 16 October 2026: on Simeon's own image (E2B) the host's folder held
// host-main.cjs alone, and every agent turn failed for want of its worker.
test("the host's own files travel with it, and a bundle without one is refused", () => {
  const files = { version: "abcdef12", hostBytes: Buffer.from("h"), boxExecDaemonBytes: Buffer.from("d") };
  assert.throws(() => buildHostBundle(files), /host's own files must be present: agent-isolation\/agent-store-worker.cjs/);
  const { [HOST_COMPANIONS[0]]: _dropped, ...withoutOne } = companions;
  assert.throws(() => buildHostBundle({ ...files, companions: withoutOne }), /agent-store-worker/);
  assert.throws(() => buildHostBundle({ ...files, companions: { ...companions, [HOST_COMPANIONS[3]]: Buffer.alloc(0) } }), /search-index-worker/);
});

test("the host's own files are the ones the host looks for beside host-main.cjs", async () => {
  const { readFile } = await import("node:fs/promises");
  const looked = [
    ["source/host/agent-isolation/agent-worker-pool.ts", ["agent-isolation", "agent-store-worker.cjs"]],
    ["source/host/agent-isolation/transcript-mirror-offload.ts", ["agent-isolation", "transcript-mirror-worker.cjs"]],
    ["source/host/extensions/box-store-sync/store-db-snapshot-upload.ts", ["extensions/box-store-sync/box-store-vacuum-worker.cjs"]],
    ["source/host/extensions/content-search/search-index-service.ts", ["extensions", "content-search", "search-index-worker.cjs"]],
  ];
  for (const [file, parts] of looked) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    for (const part of parts) assert.ok(text.includes(`"${part}"`), `${file} looks for ${part}`);
    assert.ok(HOST_COMPANIONS.includes(parts.join("/")), `${parts.join("/")} is in HOST_COMPANIONS`);
  }
});

test("a version that is not a commit id, or a missing file, is refused", () => {
  const files = { hostBytes: Buffer.from("h"), boxExecDaemonBytes: Buffer.from("d"), companions };
  assert.throws(() => buildHostBundle({ version: "latest", ...files }), /commit id/);
  assert.throws(() => buildHostBundle({ version: "../x", ...files }), /commit id/);
  assert.throws(() => buildHostBundle({ version: "abcdef12", hostBytes: Buffer.alloc(0), boxExecDaemonBytes: Buffer.from("d"), companions }), /both be present/);
});

test("only an app built from the current engine sources is published (13 October 2026: an old app went out under a new name)", () => {
  const current = "ccc179cc749f0c4d2e3f4a5b6c7d8e9f0a1b2c3d";
  assert.equal(staleAppReason(`${current}\n`, current), null);
  assert.match(staleAppReason("", current), /run `npm run package` first/);
  assert.match(staleAppReason("804bb90b5ff6aaaabbbbccccddddeeeeffff0000", current), /built from 804bb90b5ff6, not the current engine sources ccc179cc749f/);
});

// A new engine goes to a few accounts first (13 November 2026).
test("the options say what a run does and which pointers it moves, the trial's first", () => {
  assert.deepEqual(publishPlan([]), { action: "publish", pointers: [TRIAL_VERSION_FILE, LATEST_VERSION_FILE], allowDirty: false });
  assert.deepEqual(publishPlan(["--trial", "--allow-dirty"]), { action: "trial", pointers: [TRIAL_VERSION_FILE], allowDirty: true });
  assert.deepEqual(publishPlan(["--promote"]), { action: "promote", pointers: [LATEST_VERSION_FILE], allowDirty: false });
  assert.deepEqual(publishPlan(["--back-to", "afb1dedebc53"]), { action: "back", version: "afb1dedebc53", pointers: [TRIAL_VERSION_FILE, LATEST_VERSION_FILE], allowDirty: false });
  // An app's path is not an option.
  assert.equal(publishPlan(["/tmp/Simeon.app", "--trial"]).action, "trial");
  assert.throws(() => publishPlan(["--back-to"]), /needs the commit id/);
  assert.throws(() => publishPlan(["--back-to", "latest"]), /needs the commit id/);
  assert.throws(() => publishPlan(["--trial", "--promote"]), /one of --trial, --promote at a time/);
  assert.throws(() => publishPlan(["--preview"]), /Unknown option --preview/);
  assert.equal(versionIn("afb1dedebc53\n"), "afb1dedebc53");
  assert.equal(versionIn("<Error><Code>NoSuchKey</Code></Error>"), null);
  assert.equal(versionIn(undefined), null);
});

test("an engine is tried, given to everyone and taken back, through a stand-in for the aws command", async (t) => {
  const { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } = await import("node:fs/promises");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const os = await import("node:os");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { createPackage } = await import("@electron/asar");
  const run = promisify(execFile);

  const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const root = await mkdtemp(path.join(os.tmpdir(), "simeon-publish-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = path.join(root, "s3");
  const calls = path.join(root, "calls.log");
  await mkdir(path.join(root, "bin"));
  await mkdir(store);
  // `aws s3 cp` (up, or down to "-") and `aws s3 ls`, over a folder; every call is noted.
  await writeFile(
    path.join(root, "bin", "aws"),
    `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const [, , s3, verb, from, to] = process.argv;
fs.appendFileSync(${JSON.stringify(calls)}, [verb, from, to ?? ""].join(" ") + "\\n");
const kept = (address) => path.join(${JSON.stringify(store)}, address.replace("s3://bucket/engines/", ""));
if (s3 !== "s3") process.exit(2);
if (verb === "ls") process.exit(fs.existsSync(kept(from)) ? 0 : 1);
if (verb === "cp" && to === "-") { if (!fs.existsSync(kept(from))) { console.error("404"); process.exit(1); } process.stdout.write(fs.readFileSync(kept(from))); process.exit(0); }
if (verb === "cp") { fs.copyFileSync(from, kept(to)); process.exit(0); }
process.exit(2);
`,
  );
  await chmod(path.join(root, "bin", "aws"), 0o755);

  // A packaged app holding the engine's six files.
  const inside = path.join(root, "inside");
  for (const [name, text] of [["dist/host/host-main.cjs", "host"], ["dist/box-exec-daemon/main.cjs", "daemon"], ...HOST_COMPANIONS.map((name) => [`dist/host/${name}`, `worker ${name}`])]) {
    await mkdir(path.dirname(path.join(inside, name)), { recursive: true });
    await writeFile(path.join(inside, name), text);
  }
  const app = path.join(root, "Simeon.app");
  await mkdir(path.join(app, "Contents", "Resources"), { recursive: true });
  await createPackage(inside, path.join(app, "Contents", "Resources", "app.asar"));

  const env = { ...process.env, PATH: `${path.join(root, "bin")}${path.delimiter}${process.env.PATH}`, SIMEON_HOST_BUNDLE_S3: "s3://bucket/engines/", SIMEON_HOST_BUNDLE_OUT: path.join(root, "out") };
  const publish = async (...options) => {
    try {
      const { stdout } = await run(process.execPath, [path.join(desktop, "scripts", "publish-host-bundle.mjs"), ...options], { cwd: desktop, env });
      return { ok: true, said: stdout };
    } catch (error) {
      return { ok: false, said: `${error.stdout ?? ""}${error.stderr ?? ""}` };
    }
  };
  const pointer = async (name) => (await readFile(path.join(store, name), "utf8").catch(() => "none")).trim();
  const pointers = async () => ({ trial: await pointer(TRIAL_VERSION_FILE), everyone: await pointer(LATEST_VERSION_FILE) });
  const { stdout: head } = await run("git", ["rev-parse", "--short=12", "HEAD"], { cwd: desktop });
  const now = head.trim();
  const earlier = "aaaaaaaaaaaa";

  // Nothing on trial yet: there is nothing to give to everyone.
  const none = await publish("--promote");
  assert.equal(none.ok, false);
  assert.match(none.said, /No engine is on trial/);

  // Everyone is on an earlier engine; this one goes to the trial accounts only, its file before its pointer.
  await writeFile(path.join(store, `sand-host-bundle-${earlier}.tgz`), "earlier engine");
  await writeFile(path.join(store, LATEST_VERSION_FILE), `${earlier}\n`);
  const tried = await publish(app, "--trial", "--allow-dirty");
  assert.equal(tried.ok, true, tried.said);
  assert.deepEqual(await pointers(), { trial: now, everyone: earlier });
  assert.match(tried.said, new RegExp(`everyone else keeps ${earlier}`));
  assert.match(tried.said, /publish:host-bundle -- --promote/);
  assert.deepEqual(members(await readFile(path.join(store, `sand-host-bundle-${now}.tgz`))).map((member) => member.name)[0], "host/host-main.cjs");
  const uploads = (await readFile(calls, "utf8")).split("\n").filter((line) => line.startsWith("cp ") && !line.endsWith(" -")).map((line) => path.basename(line.split(" ")[2]));
  assert.deepEqual(uploads, [`sand-host-bundle-${now}.tgz`, TRIAL_VERSION_FILE]);

  // Given to everyone: only everyone's pointer moves, and the way back is said.
  const given = await publish("--promote");
  assert.equal(given.ok, true, given.said);
  assert.deepEqual(await pointers(), { trial: now, everyone: now });
  assert.match(given.said, new RegExp(`--back-to ${earlier}`));
  assert.match((await publish("--promote")).said, /already has/);

  // Taken back: both pointers name the earlier engine. One that was never published changes nothing.
  const back = await publish("--back-to", earlier);
  assert.equal(back.ok, true, back.said);
  assert.deepEqual(await pointers(), { trial: earlier, everyone: earlier });
  const never = await publish("--back-to", "bbbbbbbbbbbb");
  assert.equal(never.ok, false);
  assert.match(never.said, /No engine bbbbbbbbbbbb is published.*nothing was changed/);
  assert.deepEqual(await pointers(), { trial: earlier, everyone: earlier });

  // With no option, as before: to everyone, and the trial's pointer moves with it.
  const all = await publish(app, "--allow-dirty");
  assert.equal(all.ok, true, all.said);
  assert.deepEqual(await pointers(), { trial: now, everyone: now });
  assert.match(all.said, new RegExp(`--back-to ${earlier}`));
  assert.deepEqual((await readdir(path.join(root, "out"))).sort(), [LATEST_VERSION_FILE, `sand-host-bundle-${now}.tgz`, TRIAL_VERSION_FILE].sort());
});
