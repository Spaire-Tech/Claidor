/**
 * Publishing a skill runs against Simeon Labs' server (25 September 2026,
 * design-audit-ledger.md F-157, docs/product/skill-publish-served.md).
 *
 * The app side never changed shape: `SandSkillPublishService` packs the
 * skill folder as a plugin tar.gz, posts it to
 * `aiserver.v1.DashboardService/PublishPlugin`, then runs the plugin sync
 * until `GetEffectiveUserPlugins` lists the answered `pluginId` at the
 * answered `commitSha`; `unpublish` restores the library copy and posts
 * `UnpublishPlugin`. This test stands up an in-process Connect JSON server
 * with the exact shapes `server/polar/sand/skill_registry.py` answers
 * (`Just me` as the personal team, the tarball's files as
 * `inlineContentJson`, `commitSha = sha256("{id}:{updatedAt}")[:40]`) and
 * drives the real service, the real plugin-skills sync and the real
 * Connect client at it.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => readFile(path.join(repoRoot, "source", file), "utf8");

async function load(entry, name, { extraExports = [] } = {}) {
  // Inside the tree, so the UMD package the bundle leaves external
  // (jsonc-parser, reached through the plugin loader) resolves from
  // node_modules; `/.tmp*/` is ignored by git, as the loop test does.
  const dir = path.join(repoRoot, `.tmp-${name}-${randomBytes(4).toString("hex")}`);
  await mkdir(dir, { recursive: true });
  let entryPoint = path.join(repoRoot, entry);
  if (extraExports.length > 0) {
    // One bundle, so the test and the module under test share one host-log sink.
    entryPoint = path.join(dir, `${name}-entry.ts`);
    const lines = [`export * from ${JSON.stringify(path.join(repoRoot, entry))};`];
    for (const [file, names] of extraExports) lines.push(`export { ${names.join(", ")} } from ${JSON.stringify(path.join(repoRoot, file))};`);
    await writeFile(entryPoint, lines.join("\n"));
  }
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [entryPoint], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron", "jsonc-parser"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

/** The regular files of a tar.gz (ustar; pax headers skipped), as the server unpacks it. */
function unpackTarGz(blob) {
  const tar = gunzipSync(blob);
  const files = [];
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.toString("utf8", 0, 100).replace(/\0.*$/, "");
    const size = parseInt(header.toString("utf8", 124, 136).replace(/\0.*$/, "").trim() || "0", 8);
    const type = String.fromCharCode(header[156]);
    const prefix = header.toString("utf8", 345, 500).replace(/\0.*$/, "");
    const body = tar.subarray(offset + 512, offset + 512 + size);
    if (type === "0" || type === "\0") files.push({ path: (prefix ? `${prefix}/${name}` : name).replace(/^\.\//, ""), data: Buffer.from(body) });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

const USER_ID = 4242; // `user_id_of(call)`, the 31-bit hash of the user's UUID on the server.
const commitShaOf = (id, updatedAt) => createHash("sha256").update(`${id}:${updatedAt}`).digest("hex").slice(0, 40);

/** `polar/sand/skill_registry.py`, in 60 lines: the five methods, the same field names. */
function startRegistry() {
  const plugins = new Map();
  let nextId = 1000;
  const calls = [];
  const personalTeam = { name: "Just me", id: USER_ID, role: 1, seats: 1, isDirectMember: true, teamSlug: "just-me", verified: true };
  const marketplace = { id: String(USER_ID), name: "just-me", displayName: "Just me", description: "Skills you published to your own account", gitUrl: "", userId: USER_ID, teamId: USER_ID, createdAt: "0", updatedAt: "0", autoReindex: false, isDefault: true, allowUserPublish: true };
  const handlers = {
    GetUserPrivacyMode: () => ({ privacyMode: 2, isEnforcedByTeam: false }),
    GetMe: () => ({ authId: "uuid", userId: USER_ID, email: "founder@simeonlabs.com" }),
    GetTeams: () => ({ teams: [personalTeam] }),
    PublishPlugin: (body) => {
      const teamId = Number(body.teamId ?? 0);
      if (teamId !== 0 && teamId !== USER_ID) return { status: 403, body: { code: "permission_denied", message: "You are not a member of that team, so the skill cannot be published there." } };
      const files = unpackTarGz(Buffer.from(body.pluginTarGz, "base64"));
      if (!files.some((file) => /^skills\/.+\/SKILL\.md$/.test(file.path))) return { status: 400, body: { code: "invalid_argument", message: "The plugin archive carries no skills/<name>/SKILL.md." } };
      const existing = [...plugins.values()].find((plugin) => plugin.name === body.name);
      const updatedAt = Math.max(Date.now(), (existing?.updatedAt ?? 0) + 1);
      const plugin = { id: existing?.id ?? nextId++, name: body.name, displayName: body.displayName, description: body.description, updatedAt, files };
      plugin.commitSha = commitShaOf(plugin.id, updatedAt);
      plugins.set(plugin.id, plugin);
      return { pluginId: String(plugin.id), marketplaceId: String(USER_ID), commitSha: plugin.commitSha };
    },
    UnpublishPlugin: (body) => {
      const plugin = plugins.get(Number(body.pluginId));
      if (plugin == null) return { status: 404, body: { code: "not_found", message: "That plugin is no longer published." } };
      plugins.delete(plugin.id);
      return { commitSha: commitShaOf(plugin.id, plugin.updatedAt + 1) };
    },
    GetEffectiveUserPlugins: () => ({
      plugins: [...plugins.values()].map((plugin) => ({
        plugin: { id: String(plugin.id), name: plugin.name, displayName: plugin.displayName, description: plugin.description, status: 3, isPublished: true, createdAt: String(plugin.updatedAt), updatedAt: String(plugin.updatedAt), publisherId: String(USER_ID), publisher: { id: String(USER_ID), name: "just-me", displayName: "Just me", ownerUserId: USER_ID, isUserOwned: true }, marketplaceId: String(USER_ID), marketplace, gitUrl: "", gitRef: plugin.commitSha, gitPath: "", fullRef: plugin.commitSha, skills: [], publishedByUser: true },
        isTeamRequired: false, isEnabled: true, pinnedGitRef: plugin.commitSha, configuredVariables: {}, hasTeamConfiguredVariables: false, installMode: 1,
        inlineContentJson: JSON.stringify({ files: plugin.files.map((file) => ({ path: file.path, content: file.data.toString("utf8") })) }),
      })),
      marketplaces: plugins.size > 0 ? [marketplace] : [],
    }),
  };
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const match = /^\/aiserver\.v1\.DashboardService\/(\w+)$/.exec(request.url ?? "");
      const method = match?.[1];
      calls.push(method ?? request.url);
      const handler = method != null ? handlers[method] : undefined;
      if (handler == null) { response.writeHead(404, { "content-type": "application/json" }); response.end(JSON.stringify({ code: "unimplemented", message: `${request.url} is not served by Simeon Labs' server.` })); return; }
      const raw = Buffer.concat(chunks).toString("utf8");
      const result = handler(raw.length > 0 ? JSON.parse(raw) : {});
      const status = result.status ?? 200;
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(status === 200 ? result : result.body));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${server.address().port}`, plugins, calls, close: () => new Promise((done) => server.close(done)) })));
}

const auth = { getAccessToken: async () => "claidor_da_test", getMachineId: async () => "machine-test", peekAccessToken: () => "claidor_da_test" };

test("a skill publishes to Just me, confirms on the first sync, and unpublish restores the library", async () => {
  const registry = await startRegistry();
  delete process.env.SAND_CONNECT_SERVED;
  process.env.SAND_BACKEND_URL = registry.url;
  const sandRoot = await mkdtemp(path.join(os.tmpdir(), "caisra-skill-publish-root-"));
  const publish = await load("source/host/extensions/mcp/skill-publish.ts", "skill-publish");
  const skills = await load("source/host/extensions/mcp/plugin-skills.ts", "plugin-skills");
  try {
    // A skill in the person's library: workflows/<id>/SKILL.md.
    const workflowsDir = path.join(sandRoot, "workflows");
    const skillDir = path.join(workflowsDir, "meeting-notes");
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: Meeting Notes\ndescription: Takes meeting notes.\n---\n\nTake notes.\n");
    await writeFile(path.join(skillDir, "helper.py"), "print('hi')\n");
    await writeFile(path.join(skillDir, "runs.json"), "[]"); // never published (UNPUBLISHABLE_FILES)
    const library = {
      get: (id) => { const filePath = path.join(workflowsDir, id, "SKILL.md"); if (!existsSync(filePath)) return null; const { name, description } = publish.module.readSkillFrontmatter(filePath); return { id, name, description, filePath }; },
      remove: (id) => { const folder = path.join(workflowsDir, id); if (!existsSync(folder)) return false; rmSync(folder, { recursive: true, force: true }); return true; },
    };
    const lines = [];
    const pluginSkills = new skills.module.SandPluginSkillsService({
      sandRootDir: sandRoot,
      load: skills.module.createSharedInstalledPluginsLoader({ sandRootDir: sandRoot, auth, isSparsePluginClonesEnabled: () => false, log: (line) => lines.push(line) }),
      log: (line) => lines.push(line),
    });
    const service = new publish.module.SandSkillPublishService({ sandRootDir: sandRoot, client: publish.module.createSandSkillPublishClient({ auth }), pluginSkills, library, log: (line) => lines.push(line) });

    // Targets: the personal team the server always lists.
    const targets = await service.listTargets();
    assert.deepEqual(targets, { teams: [{ teamId: USER_ID, name: "Just me" }], unavailableReason: null });

    // Publish.
    const published = await service.publish({ workflowId: "meeting-notes", teamId: USER_ID });
    assert.equal(published.pluginId, "1000");
    assert.equal(published.commitSha.length, 40);
    assert.equal(published.promotedWorkflowId, "plugin-1000-meeting-notes", "the library copy moved to the plugin's skill");
    assert.equal(registry.calls.filter((call) => call === "PublishPlugin").length, 1);
    assert.equal(registry.calls.filter((call) => call === "GetEffectiveUserPlugins").length, 1, "confirmed on the first sync pass, not the fifth");
    // What the server received: the plugin as synthesizeSkillPluginDir packs it, minus runs.json.
    const stored = registry.plugins.get(1000);
    assert.deepEqual(new Set(stored.files.map((file) => file.path)), new Set(["plugin.json", "skills/meeting-notes/SKILL.md", "skills/meeting-notes/helper.py"]));
    assert.equal(stored.name, "meeting-notes");
    assert.equal(stored.displayName, "Meeting Notes");
    assert.equal(stored.description, "Takes meeting notes.");
    // What the sync installed: the inline files, the skill discoverable, the version the answered sha.
    const index = pluginSkills.currentIndex();
    assert.equal(index.currentUserId, USER_ID);
    assert.equal(index.skills.length, 1);
    const record = index.skills[0];
    assert.equal(record.pluginId, "1000");
    assert.equal(record.pluginVersion, published.commitSha);
    assert.equal(record.name, "Meeting Notes");
    assert.equal(record.publisherUserId, USER_ID);
    assert.equal(record.marketplaceTeamId, USER_ID);
    assert.match(await readFile(record.filePath, "utf8"), /Take notes\./);
    assert.ok(existsSync(path.join(record.installPath, "skills", "meeting-notes", "helper.py")));
    assert.ok(!existsSync(path.join(record.installPath, "skills", "meeting-notes", "runs.json")));
    assert.ok(!existsSync(skillDir), "the library copy is gone");

    // Unpublish: the skill comes back to the library, the server row goes, the index empties.
    const restored = await service.unpublish({ workflowId: "plugin-1000-meeting-notes" });
    assert.deepEqual(restored, { restoredWorkflowId: "meeting-notes" });
    assert.match(await readFile(path.join(skillDir, "SKILL.md"), "utf8"), /Take notes\./);
    assert.ok(existsSync(path.join(skillDir, "helper.py")));
    assert.equal(registry.plugins.size, 0);
    assert.equal(pluginSkills.currentIndex().skills.length, 0);
  } finally {
    delete process.env.SAND_BACKEND_URL;
    await registry.close();
    await rm(sandRoot, { recursive: true, force: true });
    await publish.dispose();
    await skills.dispose();
  }
});

test("the server's own sentence reaches the card when targets or a publish fail; nothing says coming soon", async () => {
  const { module, dispose } = await load("source/host/extensions/mcp/skill-publish.ts", "skill-publish-sentence");
  try {
    const connectError = Object.assign(new Error("[unavailable] The registry is down for maintenance."), { rawMessage: "The registry is down for maintenance.", code: 14 });
    const service = new module.SandSkillPublishService({ sandRootDir: os.tmpdir(), client: { getTeams: async () => { throw connectError; }, publishPlugin: async () => { throw connectError; }, unpublishPlugin: async () => {} }, pluginSkills: { currentIndex: () => null, sync: async () => [] }, library: { get: () => null, remove: () => false } });
    const targets = await service.listTargets();
    assert.deepEqual(targets, { teams: [], unavailableReason: "Publishing is not available right now: The registry is down for maintenance." });
    assert.equal(module.serverSentence(connectError), "The registry is down for maintenance.");
    assert.equal(module.serverSentence(new Error("socket hang up")), "socket hang up");
    // A refusal on the publish itself is the server's sentence behind the refusal prefix.
    const skillDir = await mkdtemp(path.join(os.tmpdir(), "caisra-skill-"));
    await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: X\ndescription: d\n---\n\nbody\n");
    await assert.rejects(service.upload({ skillDir, skillRelativePath: "x", name: "X", description: "d", teamId: 1, pluginName: "x" }), /skill-publish\/refused: The registry is down for maintenance\./);
    await rm(skillDir, { recursive: true, force: true });
  } finally {
    await dispose();
  }
  const source = await src("host/extensions/mcp/skill-publish.ts");
  assert.doesNotMatch(source, /"Publishing a skill to a team is coming soon/);
});

test("an inline plugin's files are written to disk and its skills land in the manifest", async () => {
  const { module, dispose } = await load("source/packages/cursor-plugins/inline-plugin-synthesizer.ts", "inline-synth");
  const targetDir = await mkdtemp(path.join(os.tmpdir(), "caisra-inline-plugin-"));
  try {
    await module.synthesizeInlinePluginDir({ targetDir, pluginName: "meeting-notes", inlineContentJson: JSON.stringify({ files: [
      { path: "plugin.json", content: JSON.stringify({ name: "meeting-notes", displayName: "Meeting Notes", skills: ["skills/meeting-notes"] }) },
      { path: "skills/meeting-notes/SKILL.md", content: "---\nname: meeting-notes\n---\n\nTake notes.\n" },
      { path: "skills/meeting-notes/logo.png", contentBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64") },
    ] }) });
    assert.match(await readFile(path.join(targetDir, "skills", "meeting-notes", "SKILL.md"), "utf8"), /Take notes/);
    assert.deepEqual([...await readFile(path.join(targetDir, "skills", "meeting-notes", "logo.png"))], [0x89, 0x50, 0x4e, 0x47]);
    const manifest = JSON.parse(await readFile(path.join(targetDir, ".cursor-plugin", "plugin.json"), "utf8"));
    assert.deepEqual(manifest, { name: "meeting-notes", skills: ["skills/meeting-notes"], displayName: "Meeting Notes" });
    await assert.rejects(module.synthesizeInlinePluginDir({ targetDir, pluginName: "evil", inlineContentJson: JSON.stringify({ files: [{ path: "../escape.md", content: "x" }] }) }), /unsafe path/);
    assert.equal(module.isSafeInlineFilePath("/etc/passwd"), false);
    assert.equal(module.isSafeInlineFilePath("skills/a/SKILL.md"), true);
  } finally {
    await rm(targetDir, { recursive: true, force: true });
    await dispose();
  }
});

test("a failed daily sync writes one [claidor] plugins line and throws to nobody's turn", async () => {
  const { module, dispose } = await load("source/host/extensions/mcp/plugin-skills.ts", "plugin-skills-log", { extraExports: [["source/shared/host-log.ts", ["setHostLogSink"]]] });
  const sandRoot = await mkdtemp(path.join(os.tmpdir(), "caisra-plugin-skills-log-"));
  const hostLines = [];
  module.setHostLogSink((line) => hostLines.push(line));
  try {
    const service = new module.SandPluginSkillsService({ sandRootDir: sandRoot, load: async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:1"); } });
    await assert.rejects(service.sync("refresh"), /ECONNREFUSED/);
    assert.deepEqual(hostLines, ["[claidor] plugins sync=refresh failed: connect ECONNREFUSED 127.0.0.1:1"]);
    // The extension's poll swallows it (`startPluginSkillsWhenAuthenticated`), so a turn never sees it.
    assert.match(await src("host/extensions/mcp/extension.ts"), /try\{await options\.service\?\.sync\(trigger\);[^}]*\}catch\{\}/);
    hostLines.length = 0;
    const ok = new module.SandPluginSkillsService({ sandRootDir: sandRoot, load: async () => ({ plugins: [], authBlocked: [], listedPluginIds: [], listedCacheKeys: [], publisherFacts: new Map(), currentUserId: 7 }) });
    await ok.sync("startup");
    assert.deepEqual(hostLines, ["[claidor] plugins sync=startup skills=0 plugins=0 changed=false"]);
  } finally {
    module.setHostLogSink(null);
    await rm(sandRoot, { recursive: true, force: true });
    await dispose();
  }
});
