/**
 * The Simeon Network's tools (10 November 2026, network-tools.ts): a Simeon
 * agent reads who is on the person's network and writes as itself to a
 * colleague's agent, through Simeon Labs' server
 * (`server/simeon/desktop/network.py`, `network/team` and `network/send`).
 * Nothing is asked of the server for a message that came through a channel;
 * the brief tells the agent the network is there.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron", "playwright", "playwright-core"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

async function run(createContext, tool, args) {
  const handler = { emitPartialToolCall() {}, executeToolCall: async (ctx, _initial, _id, work) => work(ctx) };
  const argsStream = (async function* () { yield JSON.stringify(args); })();
  return JSON.stringify(await tool.execute(createContext(), handler, argsStream, { toolCallId: "call-1" }));
}

/** The server's `network/team`, as Ana's computer reads it: Ana with Iris and her Claude Code, Maya with Nora. */
const TEAM = {
  network: { name: "Launch crew", invite: "Join the Simeon Network: https://simeonlabs.com/network/join/#sn1-x" },
  people: [{ handle: "ana", name: "Ana", you: true }, { handle: "maya", name: "Maya" }],
  agents: [
    { id: "iris", address: "ana/Iris", kind: "simeon", agent: "Simeon agent", status: "always on", role: "Travel" },
    { id: "nora", address: "maya/Nora", kind: "simeon", agent: "Simeon agent", status: "always on", role: "Research" },
    { id: "s1", address: "ana/claude", kind: "claude-code", agent: "Claude Code", status: "busy", machine: "studio", repo: "acme/api", branch: "main", doing: "Edit billing webhook" },
  ],
};

test("a Simeon agent reads the network and writes to a colleague's agent as itself", async () => {
  const tools = await load("source/host/runner/tools/network-tools.ts", "network-tools");
  const context = await load("source/packages/context/core.ts", "context-core-network");
  try {
    const calls = [];
    const kept = [];
    let source = "turn";
    let refuse;
    let reached = [{ to: "maya/Nora", id: "m1" }];
    const deps = {
      call: async (pathName, request = {}) => {
        calls.push({ path: pathName, method: request.method ?? "GET", json: request.json });
        if (refuse) throw new Error(refuse);
        if (pathName.startsWith("network/team")) return TEAM;
        if (pathName === "network/send") return { sent: reached };
        throw new Error("unexpected");
      },
      agentId: () => "iris",
      requestSource: () => source,
      sent: (to, message) => { kept.push([to, message]); },
      log: () => {},
    };
    const [list, send] = tools.module.createNetworkTools(deps);
    assert.deepEqual([list.name, send.name], ["ListNetwork", "SendNetworkMessage"]);
    const call = (tool, args) => run(context.module.createContext, tool, args);

    const listed = await call(list, {});
    assert.equal(calls.at(-1).path, "network/team");
    assert.match(listed, /The user's Simeon Network, \\"Launch crew\\":/);
    assert.match(listed, /People: Ana \(ana\) — the user, Maya \(maya\)\./);
    assert.match(listed, /- ana\/Iris \(you\): Simeon agent; Travel; always on/);
    assert.match(listed, /- maya\/Nora: Simeon agent; Research; always on/);
    assert.match(listed, /- ana\/claude: Claude Code; studio · acme\/api@main; doing: Edit billing webhook; busy/);
    await call(list, { query: "research", all: true });
    assert.equal(calls.at(-1).path, "network/team?query=research&all=true");

    // Written as this agent; the answer comes back as a message.
    const sent = await call(send, { to: "maya/nora", message: "Can Maya do Thursday?" });
    assert.deepEqual(calls.at(-1), { path: "network/send", method: "POST", json: { agentId: "iris", to: "maya/nora", message: "Can Maya do Thursday?" } });
    assert.match(sent, /Sent to maya\/Nora\. The answer comes back to this chat as a message/);
    // A server from before names nobody: the chat's line takes the last part of the address.
    assert.deepEqual(kept, [[{ address: "maya/Nora", name: "Nora" }, "Can Maya do Thursday?"]]);
    // An answer to one that asked: the server says its name and what it is, for the chat's line
    // ("Messaged Dots"), and nothing tells the agent to report whom it asked.
    reached = [{ to: "ana/windows-version", id: "m2", name: "Dots", bot: "dots" }];
    const answered = await call(send, { to: "ana/windows-version", message: "Yes, at 14:02.", reply_to: "m9" });
    assert.equal(calls.at(-1).json.replyTo, "m9");
    assert.deepEqual(kept.at(-1), [{ address: "ana/windows-version", name: "Dots", bot: "dots" }, "Yes, at 14:02."]);
    assert.match(answered, /Sent to ana\/windows-version\. It is kept in your conversation with it in this chat\./);
    assert.doesNotMatch(answered, /Tell the user/);
    reached = [{ to: "maya/Nora", id: "m1" }];

    // The server's refusal, in its words.
    refuse = "Maya's agents had enough messages from yours this hour: try again later.";
    assert.match(await call(send, { to: "maya/Nora", message: "Again" }), /Not sent: Maya's agents had enough messages from yours this hour/);
    refuse = undefined;

    // A channel's message (Discord, Slack…) can come from anyone: the network isn't asked.
    source = "connector";
    const before = calls.length;
    assert.match(await call(list, {}), /isn't used for a message that came through a channel/);
    assert.match(await call(send, { to: "maya/Nora", message: "Hi" }), /isn't used for a message that came through a channel/);
    assert.equal(calls.length, before);
  } finally {
    await tools.dispose();
    await context.dispose();
  }
});

test("the agent's brief and its turns know the network", async () => {
  const brief = await readFile(path.join(repoRoot, "source/host/runner/system-prompt.ts"), "utf8");
  assert.match(brief, /## The user's bots and coding agents/);
  assert.doesNotMatch(brief, /colleague/, "no colleagues while other people are off");
  assert.match(brief, /ListNetwork/);
  assert.match(brief, /SendNetworkMessage/);
  const toolset = await readFile(path.join(repoRoot, "source/host/runner/tools/turn-toolset.ts"), "utf8");
  assert.match(toolset, /const network = factories\.network\?\.\(\);/);
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  assert.match(composition, /createNetworkToolInputs: \(\) => \(\{/);
  assert.match(composition, /agentId: \(\) => session\.id,/);
});
