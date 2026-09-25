/**
 * Memory backed up to Simeon Labs' server (25 September 2026,
 * docs/product/memory-sync-served.md).
 *
 * The server has served `POST /desktop/api/memory/sync` and
 * `GET /desktop/api/memory` since 11 September and nothing on the app side
 * ever called them (design-audit-ledger.md F-065, F-252, F-358). The
 * memory-sync host extension is that client. This runs it against an
 * in-process HTTP server that answers the two routes the way
 * `server/polar/desktop/service.py` does — versions, a union merge on a
 * stale base, tombstones under `deleted` — and measures: a fresh box
 * pulls; a local change pushes with its base version; a server-side newer
 * version is merged into the file; a deleted name removes the file; a local
 * deletion is told; the state file carries the versions; the watcher
 * triggers a round; the off switch; and the `[claidor] memory-sync` line.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => readFile(path.join(repoRoot, "source", file), "utf8");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

/** The server's memory routes, in memory: `sync_memory_files` in miniature. */
function startMemoryServer() {
  const rows = new Map(); // name -> { content, version, deleted }
  const requests = [];
  const factId = (line) => { const m = /^-\s+\((\d{4}-\d{2}-\d{2})\)\s+(.+?)\s*$/.exec(line); return m ? m[2].replace(/\s+/g, " ").trim().toLowerCase() : null; };
  const mergeFacts = (ours, theirs) => {
    const kept = ours.replace(/\n+$/, "").split("\n"); const known = new Set(kept.map(factId).filter(Boolean));
    for (const line of theirs.split("\n")) { const id = factId(line); if (id && !known.has(id)) { known.add(id); kept.push(line); } }
    return `${kept.join("\n")}\n`;
  };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const auth = req.headers.authorization ?? "";
      if (auth !== "Bearer box-token") { res.writeHead(401, { "content-type": "application/json" }); res.end(JSON.stringify({ code: 40101, message: "This desktop session has expired." })); return; }
      if (req.method === "GET" && req.url === "/desktop/api/memory") {
        requests.push({ method: "GET", url: req.url });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ files: [...rows].filter(([, r]) => !r.deleted).map(([name, r]) => ({ name, version: r.version, size: Buffer.byteLength(r.content) })) }));
        return;
      }
      if (req.method === "POST" && req.url === "/desktop/api/memory/sync") {
        const parsed = JSON.parse(body);
        requests.push({ method: "POST", url: req.url, body: parsed });
        for (const file of parsed.files ?? []) {
          // A server older than this client: it does not keep project.md.
          if (!/^(agents|user-memory|projects)\/[A-Za-z0-9][A-Za-z0-9._-]*\/.+\.md$/.test(file.name) || file.name.endsWith("/project.md")) { res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ code: 40001, message: `'${file.name}' is not a memory file Claidor keeps.` })); return; }
          const stored = rows.get(file.name);
          if (stored == null) { rows.set(file.name, { content: file.content, version: 1, deleted: false }); continue; }
          if (stored.deleted) { if (file.base_version >= stored.version) rows.set(file.name, { content: file.content, version: stored.version + 1, deleted: false }); continue; }
          const content = file.base_version === stored.version ? file.content : mergeFacts(stored.content, file.content);
          if (content !== stored.content) rows.set(file.name, { content, version: stored.version + 1, deleted: false });
        }
        for (const name of parsed.deleted ?? []) { const stored = rows.get(name); if (stored != null && !stored.deleted) rows.set(name, { content: "", version: stored.version + 1, deleted: true }); }
        const sent = new Map((parsed.files ?? []).map((f) => [f.name, f.content]));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          files: [...rows].filter(([, r]) => !r.deleted).sort(([a], [b]) => a.localeCompare(b)).map(([name, r]) => ({ name, content: r.content, version: r.version, changed: sent.get(name) !== r.content })),
          deleted: [...rows].filter(([, r]) => r.deleted).map(([name]) => name).sort()
        }));
        return;
      }
      res.writeHead(404); res.end();
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ rows, requests, url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((done) => server.close(done)) })));
}

// The watchers never fire: a test's writeFile is not atomic, and a round
// that reads a half-written file is the case the client guards against,
// not the one these rounds measure. The watcher test uses a real timer.
const never = { name: "never", wrap: () => Object.assign(() => {}, { dispose() {} }) };
const after = (ms) => ({ name: "timer", wrap: (fn) => { let handle = null; return Object.assign(() => { if (handle != null) clearTimeout(handle); handle = setTimeout(() => { handle = null; fn(); }, ms); }, { dispose() { if (handle != null) clearTimeout(handle); handle = null; } }); } });
const startExtension = (module, { sandRoot, url, env = {}, debounce = never, token = "box-token" }) => {
  const lines = []; const stops = [];
  const api = module.memorySyncExtension.start({
    deps: { auth: { getAccessToken: async () => token }, memory: { subscribe: () => () => {} } },
    host: { log: (line) => lines.push(`host:${line}`), whenBackgroundWorkReady: Promise.resolve() },
    onStop: (fn) => stops.push(fn),
    sandRoot, backendUrl: url, debounce, env, log: (line) => lines.push(line)
  });
  return { api, lines, stop: async () => { for (const fn of stops.reverse()) await fn(); } };
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (predicate()) return true; await wait(20); } return predicate(); };

test("a fresh box pulls what the server holds, a local change pushes with its base version, a newer server copy is merged in, and the state carries the versions", async () => {
  const { module, dispose } = await load("source/host/extensions/memory-sync/extension.ts", "memory-sync");
  const server = await startMemoryServer();
  const sandRoot = await mkdtemp(path.join(os.tmpdir(), "caisra-memsync-root-"));
  const profile = "agents/a1/memory/profile.md";
  server.rows.set(profile, { content: "# About the user\n\n- (2026-09-20) The founder is called Bass.\n", version: 3, deleted: false });
  server.rows.set("user-memory/agents/a1/log/2026-09.md", { content: "- (2026-09-24) Dakar this week.\n", version: 1, deleted: false });
  try {
    const ext = startExtension(module, { sandRoot, url: server.url });
    await ext.api.whenStarted;
    // The fresh box pulled both files and the state knows their versions.
    assert.equal(await readFile(path.join(sandRoot, "agents", "a1", "memory", "profile.md"), "utf8"), "# About the user\n\n- (2026-09-20) The founder is called Bass.\n");
    assert.equal(await readFile(path.join(sandRoot, "user-memory", "agents", "a1", "log", "2026-09.md"), "utf8"), "- (2026-09-24) Dakar this week.\n");
    const state = JSON.parse(await readFile(path.join(sandRoot, ".memory-sync", "state.json"), "utf8"));
    assert.equal(state.files[profile].version, 3);
    assert.equal(state.files["user-memory/agents/a1/log/2026-09.md"].version, 1);
    assert.deepEqual(server.requests.map((r) => r.method), ["GET", "POST"], "the start-up lists, then syncs");
    assert.deepEqual(server.requests[1].body, { files: [], deleted: [] }, "a fresh box sends nothing");
    assert.ok(ext.lines.some((line) => /^\[claidor\] memory-sync server holds 2 file\(s\)/.test(line)), ext.lines.join("\n"));
    assert.ok(ext.lines.some((line) => /^\[claidor\] memory-sync pushed=0 pulled=2 deleted=0 held=2/.test(line)), ext.lines.join("\n"));

    // A local change (what runTurnMemory's addMemory writes) goes up with
    // the version it started from…
    await writeFile(path.join(sandRoot, "agents", "a1", "memory", "profile.md"), "# About the user\n\n- (2026-09-20) The founder is called Bass.\n- (2026-09-25) Ships on Fridays.\n");
    const pushed = await ext.api.syncNow();
    assert.equal(pushed.kind, "synced"); assert.equal(pushed.pushed, 1); assert.equal(pushed.pulled, 0);
    const push = server.requests.at(-1).body;
    assert.deepEqual(push.files.map((f) => [f.name, f.base_version]), [[profile, 3]]);
    assert.equal(server.rows.get(profile).version, 4);
    assert.equal(JSON.parse(await readFile(path.join(sandRoot, ".memory-sync", "state.json"), "utf8")).files[profile].version, 4);

    // …and a round with nothing changed sends nothing at all.
    const idle = await ext.api.syncNow();
    assert.equal(idle.kind, "nothing-to-do");
    assert.equal(server.requests.length, 3);

    // Another machine wrote in between (version 5); this one writes too
    // with base 4: the server merges by fact id and the merge lands here.
    server.rows.set(profile, { content: "# About the user\n\n- (2026-09-20) The founder is called Bass.\n- (2026-09-25) Ships on Fridays.\n- (2026-09-25) Dog named Ada.\n", version: 5, deleted: false });
    await writeFile(path.join(sandRoot, "agents", "a1", "memory", "profile.md"), "# About the user\n\n- (2026-09-20) The founder is called Bass.\n- (2026-09-25) Ships on Fridays.\n- (2026-09-25) Stand-up at 9.\n");
    const merged = await ext.api.syncNow();
    assert.equal(merged.kind, "synced"); assert.equal(merged.pulled, 1);
    assert.equal(await readFile(path.join(sandRoot, "agents", "a1", "memory", "profile.md"), "utf8"), "# About the user\n\n- (2026-09-20) The founder is called Bass.\n- (2026-09-25) Ships on Fridays.\n- (2026-09-25) Dog named Ada.\n- (2026-09-25) Stand-up at 9.\n");
    assert.equal(JSON.parse(await readFile(path.join(sandRoot, ".memory-sync", "state.json"), "utf8")).files[profile].version, 6);
    assert.ok(ext.lines.some((line) => line.startsWith(`[claidor] memory-sync pushed=1 pulled=1 deleted=0 held=2 versions=${profile}@6`)), ext.lines.join("\n"));
    await ext.stop();
  } finally {
    await server.close(); await rm(sandRoot, { recursive: true, force: true }); await dispose();
  }
});

test("a name deleted on another machine is removed here, a local deletion is told, and .dreaming never travels", async () => {
  const { module, dispose } = await load("source/host/extensions/memory-sync/extension.ts", "memory-sync-del");
  const server = await startMemoryServer();
  const sandRoot = await mkdtemp(path.join(os.tmpdir(), "caisra-memsync-root-"));
  const log = "agents/a1/memory/log/2026-08.md";
  const profile = "agents/a1/memory/profile.md";
  await mkdir(path.join(sandRoot, "agents", "a1", "memory", "log"), { recursive: true });
  await mkdir(path.join(sandRoot, "agents", "a1", "memory", ".dreaming", "tombstones"), { recursive: true });
  await writeFile(path.join(sandRoot, "agents", "a1", "memory", "log", "2026-08.md"), "- (2026-08-01) old.\n");
  await writeFile(path.join(sandRoot, "agents", "a1", "memory", "profile.md"), "- (2026-08-01) Bass.\n");
  await writeFile(path.join(sandRoot, "agents", "a1", "memory", ".dreaming", "tombstones", "abc.deleted"), "");
  await writeFile(path.join(sandRoot, "agents", "a1", "transcript.db"), "not memory");
  try {
    const ext = startExtension(module, { sandRoot, url: server.url });
    await ext.api.whenStarted;
    // The box's own files went up (base 0) and nothing else did.
    assert.deepEqual(server.requests[1].body.files.map((f) => [f.name, f.base_version]).sort(), [[log, 0], [profile, 0]]);
    assert.ok(![...server.rows.keys()].some((name) => name.includes(".dreaming") || name.includes("transcript")));

    // Another machine deletes the log: the next round removes it here.
    server.rows.set(log, { content: "", version: 2, deleted: true });
    const round = await ext.api.syncNow({ pullEvenIfNothingChanged: true });
    assert.equal(round.kind, "synced"); assert.equal(round.deleted, 1);
    assert.ok(!existsSync(path.join(sandRoot, "agents", "a1", "memory", "log", "2026-08.md")));
    const state = JSON.parse(await readFile(path.join(sandRoot, ".memory-sync", "state.json"), "utf8"));
    assert.ok(!(log in state.files)); assert.equal(state.files[profile].version, 1);

    // Deleting the profile here (the memory pane's clear) is told to the
    // server as `deleted`, and the server tombstones it.
    await rm(path.join(sandRoot, "agents", "a1", "memory", "profile.md"));
    const told = await ext.api.syncNow();
    assert.equal(told.kind, "synced");
    assert.deepEqual(server.requests.at(-1).body, { files: [], deleted: [profile] });
    assert.equal(server.rows.get(profile).deleted, true);
    assert.ok(ext.lines.some((line) => /memory-sync pushed=0 pulled=0 deleted=0 told-deleted=1 held=0/.test(line)), ext.lines.join("\n"));
    await ext.stop();
  } finally {
    await server.close(); await rm(sandRoot, { recursive: true, force: true }); await dispose();
  }
});

test("a write under a watched root triggers a round after the debounce, a refusal is one log line, and the off switch sends nothing", async () => {
  const { module, dispose } = await load("source/host/extensions/memory-sync/extension.ts", "memory-sync-watch");
  const server = await startMemoryServer();
  const sandRoot = await mkdtemp(path.join(os.tmpdir(), "caisra-memsync-root-"));
  try {
    const ext = startExtension(module, { sandRoot, url: server.url, debounce: after(100) });
    await ext.api.whenStarted;
    const before = server.requests.length;
    await mkdir(path.join(sandRoot, "user-memory", "agents", "a2"), { recursive: true });
    await writeFile(path.join(sandRoot, "user-memory", "agents", "a2", "profile.md"), "- (2026-09-25) Muse says hi.\n");
    assert.ok(await until(() => server.rows.get("user-memory/agents/a2/profile.md")?.content === "- (2026-09-25) Muse says hi.\n"), "the watcher's round pushed the new shard");
    assert.ok(server.requests.length > before);

    // A refusal (a name this server does not keep) is one line with the
    // server's sentence, and the state is left alone.
    await mkdir(path.join(sandRoot, "projects", "launch"), { recursive: true });
    await writeFile(path.join(sandRoot, "projects", "launch", "project.md"), "---\nname: Launch\n---\n");
    await until(() => ext.lines.some((line) => line.includes("memory-sync refused")));
    assert.ok(ext.lines.some((line) => /^\[claidor\] memory-sync refused 400 'projects\/launch\/project\.md' is not a memory file Claidor keeps\./.test(line)), ext.lines.join("\n"));
    assert.ok(!("projects/launch/project.md" in JSON.parse(await readFile(path.join(sandRoot, ".memory-sync", "state.json"), "utf8")).files));
    await ext.stop();

    // A box that is signed out (no credential) says so and sends nothing.
    const signedOut = startExtension(module, { sandRoot, url: server.url, token: "" });
    await signedOut.api.whenStarted;
    assert.ok(signedOut.lines.some((line) => line.includes("memory-sync skipped: no credential")), signedOut.lines.join("\n"));
    await signedOut.stop();

    // SAND_MEMORY_SYNC=0 switches the whole thing off.
    const count = server.requests.length;
    const off = startExtension(module, { sandRoot, url: server.url, env: { SAND_MEMORY_SYNC: "0" } });
    await off.api.whenStarted;
    assert.equal(off.api.isEnabled(), false);
    assert.equal((await off.api.syncNow()).kind, "nothing-to-do");
    await wait(50);
    assert.equal(server.requests.length, count);
    assert.ok(off.lines.some((line) => line === "[claidor] memory-sync off (SAND_MEMORY_SYNC=0)"));
    await off.stop();
  } finally {
    await server.close(); await rm(sandRoot, { recursive: true, force: true }); await dispose();
  }
});

test("the names it syncs are the server's shapes and nothing else; the extension is registered with auth and memory as peers", async () => {
  const { module, dispose } = await load("source/host/extensions/memory-sync/memory-sync-client.ts", "memory-sync-names");
  try {
    for (const name of ["MEMORY.md", "USER.md", "memory/2026-09-11.md", "agents/a1/memory/profile.md", "agents/a1/memory/log/2026-09.md", "user-memory/agents/a1/profile.md", "user-memory/agents/a1/log/2026-09.md", "projects/launch/memory/agents/a1/profile.md", "projects/launch/memory/agents/a1/log/2026-09.md", "projects/launch/project.md"]) assert.ok(module.isSyncedMemoryName(name), name);
    for (const name of ["agents/a1/memory/.dreaming/next-refresh-at", "agents/a1/memory/.dreaming/tombstones/x.deleted", "agents/../x/memory/profile.md", "agents/.x/memory/profile.md", "agents/a1/transcript.db", "agents/a1/memory/profile.md.tmp", "agents/a1/memory/notes.md", "projects/launch/automation.json", "user-memory/a1/profile.md", "/etc/passwd", "", `agents/${"a".repeat(200)}/memory/profile.md`]) assert.ok(!module.isSyncedMemoryName(name), name);
    assert.equal(module.memoryNameOf("/root/sand", "/root/sand/agents/a1/memory/profile.md"), "agents/a1/memory/profile.md");
    assert.equal(module.memoryNameOf("/root/sand", "/root/sand/agents/a1/x.db"), null);
  } finally { await dispose(); }
  const ids = await src("host/extensions/extension-ids.generated.ts");
  assert.match(ids, /MemorySync: "memory-sync"/);
  const registry = await src("host/extensions/registry.ts");
  assert.match(registry, /HostExtensions\.MemorySync\]/);
  const production = await src("host/host-production-extensions.ts");
  assert.match(production, /\[HostExtensions\.MemorySync\]: bind\(memorySyncExtension\)/);
  const extension = await src("host/extensions/memory-sync/extension.ts");
  assert.match(extension, /dependencies: \[HostExtensions\.Auth, HostExtensions\.Memory\]/);
  assert.match(extension, /getAccessToken: \(options\) => auth\.getAccessToken\(options\)/, "the box's own token, the one the model proxy takes");
  const endpoints = await readFile(path.join(repoRoot, "..", "server", "polar", "desktop", "endpoints.py"), "utf8");
  assert.match(endpoints, /"\/api\/memory\/sync",[\s\S]*?Depends\(get_desktop_or_box_session\)/, "the server takes the box's credential on the sync route");
});
