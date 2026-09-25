/**
 * Sharing is served (25 September 2026, docs/product/sharing-served.md).
 *
 * The cross-user sharing client (`host/extensions/cross-user-sharing/`) was
 * complete and waited on a relay Simeon Labs' server did not serve
 * (`server/polar/sand/sharing.py` serves it now). This measures the app
 * side offline: the served switch is on by default and "0" restores the
 * Coming Soon answer; the environment allows api.simeonlabs.com on a dev
 * host and still refuses Cursor's production origin; the `sand_multiplayer`
 * gate property the extension subscribes to reads Simeon's default; and
 * `SandXuserSharingService` against an in-process relay with the server's
 * shapes reads the room into the manager, mirrors a polled `room-entry`,
 * and acks it away on the next poll.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const readBody = (request) => new Promise((resolve) => { let body = ""; request.on("data", (chunk) => { body += chunk; }); request.on("end", () => resolve(body)); });

const HOST = "11111111-1111-4111-8111-111111111111";
const GUEST = "22222222-2222-4222-8222-222222222222";
const ROOM = { roomId: "33333333-3333-4333-8333-333333333333", name: "Muse", hostAuthId: HOST, hostName: "Bass", members: [
  { kind: "human", authId: HOST, displayName: "Bass" },
  { kind: "agent", authId: HOST, agentId: "agent-1", displayName: "Muse", avatarDataUrl: "data:image/png;base64,AAAA" },
  { kind: "human", authId: GUEST, displayName: "Guest" },
] };
const ENTRY = { kind: "human-message", entryId: "e1", authorAuthId: HOST, authorName: "Bass", text: "hello from the host", images: [], timestampMs: 1_700_000_000_000 };

/** The relay as server/polar/sand/sharing.py answers it, for the guest. */
async function startRelay() {
  const polls = [];
  let delivered = false;
  let sawAck;
  const acked = new Promise((resolve) => { sawAck = resolve; });
  const server = createServer(async (request, response) => {
    const body = JSON.parse((await readBody(request)) || "{}");
    const json = (status, value) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value)); };
    if (request.headers.authorization !== "Bearer token.eyJzdWIiOiIyMjIyMjIyMi0yMjIyLTQyMjItODIyMi0yMjIyMjIyMjIyMjIifQ.sig") return json(401, { error: "Unauthorized" });
    if (request.url === "/sand/share-state") return json(200, { pendingJoinRequests: [], rooms: [ROOM] });
    if (request.url === "/sand/xuser/poll") {
      polls.push(body);
      if (body.ackIds.includes("ev1")) sawAck();
      if (delivered) return json(200, { events: [] });
      delivered = true;
      return json(200, { events: [{ id: "ev1", kind: "room-entry", roomId: ROOM.roomId, entry: ENTRY }] });
    }
    return json(404, { detail: "Not a room you are in." });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, polls, acked, close: () => new Promise((resolve) => server.close(resolve)) };
}

test("the served switch is on by default and SAND_SHARING_SERVED=0 restores Coming Soon", async () => {
  const { module, dispose } = await load("source/host/extensions/cross-user-sharing/extension.ts", "sharing-extension");
  try {
    assert.equal(module.isSharingServed({}), true);
    assert.equal(module.isSharingServed({ SAND_SHARING_SERVED: "1" }), true);
    assert.equal(module.isSharingServed({ SAND_SHARING_SERVED: "0" }), false);
    assert.equal(module.SHARING_DISABLED_MESSAGE, "Sharing is coming soon in Simeon.");
  } finally {
    await dispose();
  }
});

test("a dev host pointed at api.simeonlabs.com is allowed; Cursor's production origin still needs the opt-in", async () => {
  const { module, dispose } = await load("source/host/extensions/cross-user-sharing/xuser-sharing-environment.ts", "sharing-environment");
  try {
    const dev = { SAND_PACKAGED: "0", SAND_DEV_XUSER_SHARING: "1" };
    assert.deepEqual(module.resolveXuserSharingEnvironment({ backendUrl: "https://api.simeonlabs.com/", env: dev }), { isAllowed: true });
    assert.deepEqual(module.resolveXuserSharingEnvironment({ backendUrl: "http://127.0.0.1:8000", env: dev }), { isAllowed: true });
    const cursor = module.resolveXuserSharingEnvironment({ backendUrl: "https://api2.cursor.sh", env: dev });
    assert.equal(cursor.isAllowed, false);
    assert.match(cursor.reason, /Cursor's PRODUCTION backend/);
    assert.deepEqual(module.resolveXuserSharingEnvironment({ backendUrl: "https://api2.cursor.sh", env: { ...dev, SAND_XUSER_SHARING_ALLOW_PROD: "1" } }), { isAllowed: true });
    assert.equal(module.resolveXuserSharingEnvironment({ backendUrl: "https://api.simeonlabs.com", env: { SAND_PACKAGED: "0" } }).isAllowed, false, "a dev host still opts in with SAND_DEV_XUSER_SHARING=1");
    assert.deepEqual(module.resolveXuserSharingEnvironment({ backendUrl: "https://api.simeonlabs.com", env: { SAND_PACKAGED: "1" } }), { isAllowed: true });
  } finally {
    await dispose();
  }
});

test("the sand_multiplayer gate property the extension subscribes to reads Simeon's default", async () => {
  const { module, dispose } = await load("source/shared/node/experiments/simeon-gate-defaults.ts", "gate-defaults");
  try {
    assert.equal(module.SIMEON_FEATURE_GATE_DEFAULTS.sand_multiplayer, true);
    assert.equal(module.simeonGateDefault("sand_multiplayer", {}), true);
    assert.equal(module.simeonGateDefault("sand_multiplayer", { SAND_FEATURE_GATE_OVERRIDES: "sand_multiplayer=0" }), false);
    // The raw service builds the property from the bundled table (false), the way SandExperimentService.getFeatureGateProperty does.
    const property = { value: false, get() { return this.value; }, set(value) { this.value = value; } };
    const raw = { checkFeatureGate: () => false, getSnapshot: () => ({ featureGates: { sand_multiplayer: false } }), subscribe: () => () => {}, getFeatureFlagOverridesRecord: () => ({}), getFeatureGateProperty: () => property };
    const service = module.applySimeonGateDefaults(raw, {});
    assert.equal(service.getFeatureGateProperty("sand_multiplayer").get(), true);
    assert.equal(service.checkFeatureGate("sand_multiplayer"), true);
    assert.equal(service.getSnapshot().featureGates.sand_multiplayer, true);
    const off = module.applySimeonGateDefaults({ ...raw, getFeatureGateProperty: () => ({ value: true, get() { return this.value; }, set(value) { this.value = value; } }) }, { SAND_FEATURE_GATE_OVERRIDES: "sand_multiplayer=0" });
    assert.equal(off.getFeatureGateProperty("sand_multiplayer").get(), false, "the environment kill switch still wins");
  } finally {
    await dispose();
  }
});

test("the sharing service reads the room from the relay, mirrors a polled room-entry into the manager and acks it on the next poll", async () => {
  const relay = await startRelay();
  const service = await load("source/host/extensions/cross-user-sharing/xuser-sharing-service.ts", "sharing-service");
  const scheduling = await load("source/internal/scheduling.ts", "sharing-scheduling");
  try {
    const { SandXuserSharingService } = service.module;
    const { createDeadlinePolicy, createExpiryPolicy, createPollingPolicy, realClock } = scheduling.module;
    const mirrored = [];
    const ensured = [];
    const emitted = [];
    const manager = {
      getSharedRoomIdForAgent: async () => null, listRoomAgentIds: async () => [], markMirrorRoomRevoked: async () => {},
      getAgentDisplayProfile: async () => null, getAgentAvatar: async () => null, restampRoomEntry: async () => {},
      appendSharedRoomActivityNotice: async () => {}, runRemoteRequestedMemberTurn: async () => [],
      appendMirrorRoomEntry: async (args) => { mirrored.push(args); return true; }, postSharedRoomGuestMessage: async () => {},
      ensureMirrorRoom: async (room, selfAuthId) => { ensured.push({ room, selfAuthId }); }, ensureHostedSharedRoom: async () => null,
      findRoomAgentId: async () => null, isAgentCapReached: async () => false,
    };
    const sharing = new SandXuserSharingService({
      getAccessToken: async () => "token.eyJzdWIiOiIyMjIyMjIyMi0yMjIyLTQyMjItODIyMi0yMjIyMjIyMjIyMjIifQ.sig",
      getBackendUrl: () => relay.origin,
      getSelfAuthId: async () => GUEST,
      isEnabled: () => true,
      manager,
      emitSharing: (state) => emitted.push(state),
      resolveAttachment: async () => null,
      timing: {
        clock: realClock,
        relayPoll: createPollingPolicy(realClock, { name: "test-relay-poll", intervalMs: 20 }),
        reconcilePoll: createPollingPolicy(realClock, { name: "test-reconcile", intervalMs: 60_000 }),
        selfIdentityRetry: createPollingPolicy(realClock, { name: "test-identity", intervalMs: 1_000 }),
        remoteTurnDeadline: createDeadlinePolicy(realClock, { name: "test-turn", timeoutMs: 10_000 }),
        typingExpiry: (ttlMs) => createExpiryPolicy(realClock, { name: "test-typing", ttlMs }),
      },
    });
    await sharing.start();
    const state = sharing.getState();
    assert.equal(state.isEnabled, true);
    assert.equal(state.selfAuthId, GUEST);
    assert.deepEqual(state.rooms.map((room) => room.roomId), [ROOM.roomId]);
    assert.equal(state.rooms[0].hostName, "Bass");
    assert.deepEqual(ensured, [{ room: ROOM, selfAuthId: GUEST }], "a room hosted by someone else is materialised as a mirror room for this person");
    await Promise.race([relay.acked, new Promise((_, reject) => setTimeout(() => reject(new Error("the second poll never acked ev1")), 5_000))]);
    sharing.stop();
    assert.equal(mirrored.length, 1);
    assert.equal(mirrored[0].roomId, ROOM.roomId);
    assert.equal(mirrored[0].selfAuthId, GUEST);
    assert.deepEqual(mirrored[0].entry, { kind: "human-message", entryId: "e1", authorAuthId: HOST, authorName: "Bass", text: "hello from the host", images: [], timestampMs: ENTRY.timestampMs });
    assert.deepEqual(relay.polls[0], { ackIds: [] });
    assert.deepEqual(relay.polls.find((poll) => poll.ackIds.length > 0), { ackIds: ["ev1"] });
    assert.ok(emitted.length > 0, "the state reached the gateway's subscribers");
  } finally {
    await relay.close();
    await service.dispose();
    await scheduling.dispose();
  }
});
