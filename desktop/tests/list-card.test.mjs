/**
 * The list card (24 October 2026): ShowList posts three to eight things of
 * one kind as a row each (source/host/runner/tools/list-card-tool.ts,
 * source/shared/list-card.ts); the apps draw it (SimeonCore's ListCard.swift).
 * Money and any other figure are told apart, addresses are https only, a
 * picture from the web is kept on the computer, and the card carries itself
 * in words for an app from before it.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

async function run(tool, args) {
  const context = await load("source/packages/context/core.ts", `context-${Math.random().toString(36).slice(2)}`);
  try {
    const handler = { emitPartialToolCall() {}, executeToolCall: async (ctx, _initial, _id, work) => work(ctx) };
    const argsStream = (async function* () { yield JSON.stringify(args); })();
    return JSON.stringify(await tool.execute(context.module.createContext(), handler, argsStream, { toolCallId: "call-1" }));
  } finally {
    await context.dispose();
  }
}

test("ShowList posts the list card: money apart from other figures, https only, pictures kept on the computer", async () => {
  const tool = await load("source/host/runner/tools/list-card-tool.ts", "list-card-tool");
  try {
    let message;
    const kept = [];
    const show = tool.module.createShowListTool({
      emitCard: (posted) => { message = posted; return "t4s2"; },
      persistPicture: async (url) => { kept.push(url); return url.includes("broken") ? undefined : { url: "file:///Users/a/.simeon/attachments/lamb.jpg" }; },
    });
    assert.equal(show.name, "ShowList");
    const shown = await run(show, {
      title: "Coût matières par portion",
      subtitle: "Prix d'oct. 2025 à août 2026",
      items: [
        { title: "Thiéboudiène", amount: "717–805 FCFA", value: "ignored", tag: "à valider", tone: "pending" },
        { title: "Mafé", amount: "966 FCFA", tag: "ok", tone: "neutral" },
        { title: "Rosemary lamb", detail: "Lemon, garlic, rosemary.", value: "2 h", image_url: "https://example.com/lamb.jpg", url: "https://example.com/lamb" },
        { title: "Potatoes", image_url: "https://example.com/broken.jpg", url: "http://example.com/potatoes" },
        { title: "Carrots", image_url: "http://example.com/carrots.jpg" },
      ],
    });
    assert.match(shown, /list card is in the chat \(entry t4s2\)/);
    assert.match(shown, /Don't repeat its rows in text/);
    assert.equal(message.type, "list");
    assert.equal(message.title, "Coût matières par portion");
    assert.equal(message.subtitle, "Prix d'oct. 2025 à août 2026");
    assert.deepEqual(message.items[0], { title: "Thiéboudiène", amount: "717–805 FCFA", tag: "à valider", tone: "pending" }, "money wins over another figure");
    assert.deepEqual(message.items[1], { title: "Mafé", amount: "966 FCFA", tag: "ok" }, "grey is the default tone, left out");
    assert.deepEqual(message.items[2], { title: "Rosemary lamb", detail: "Lemon, garlic, rosemary.", value: "2 h", imageUrl: "file:///Users/a/.simeon/attachments/lamb.jpg", url: "https://example.com/lamb" }, "a picture kept on the computer");
    assert.deepEqual(message.items[3], { title: "Potatoes", imageUrl: "https://example.com/broken.jpg" }, "a picture that can't be kept stays at its address; no plain http page");
    assert.deepEqual(message.items[4], { title: "Carrots" }, "no plain http picture");
    assert.deepEqual(kept, ["https://example.com/lamb.jpg", "https://example.com/broken.jpg"]);
    assert.equal(message.content, [
      "Coût matières par portion",
      "Prix d'oct. 2025 à août 2026",
      "- Thiéboudiène: 717–805 FCFA (à valider)",
      "- Mafé: 966 FCFA (ok)",
      "- Rosemary lamb: 2 h. Lemon, garlic, rosemary.",
      "- Potatoes",
      "- Carrots",
    ].join("\n"), "the card in words, for an app from before it");

    await assert.rejects(run(show, { title: "Too few", items: [{ title: "One" }, { title: "Two" }] }), /at least 3/, "one or two things are written, not carded");
  } finally {
    await tool.dispose();
  }
});

// The founder's two messages after the card shipped (24 October 2026): lists in text, no card.
const RESTAURANTS = `Here are four that came up on Tripadvisor's October 2026 Dakar listings:

1. Restaurant Lagon 1: French and African, top price tier, 4.2 from about 1,000 reviews. It's the safest pick if you want to impress.
2. Au Comptoir De La Fourchette: very French and formal, with velvet banquettes. Good for a quiet, serious conversation.
3. Noliane Ristorante: Italian and Mediterranean, 4.5 from 67 reviews. A solid middle option.
4. Le Ngor: African and seafood, open to the ocean, 4.0 from 465 reviews. It's more relaxed, and it's listed as good for groups.

These come from review rankings, not business-dining guides. Want me to narrow it down?`;
const COSTS = `Planchers sourcés par portion (une personne), sans les ingrédients dont je n'ai pas de prix fiable :

- Thiéboudiène : 717 à 805 FCFA
- Yassa poulet : 1 078 FCFA
- Mafé : 966 FCFA
- Soupou kandja : 528 à 588 FCFA

Le vrai coût sera plus haut (tomate, ail, piment, pâte d'arachide, gombo, etc. manquent, plus les pertes).`;

test("a list of things of one kind in a message is held once for the card; steps, short lists and code are not", async () => {
  const guard = await load("source/host/runner/list-card-guard.ts", "list-card-guard");
  try {
    const { listedThings, holdForCard, listCardNudge } = guard.module;
    assert.equal(listedThings(RESTAURANTS), 4);
    assert.equal(listedThings(COSTS), 4);
    assert.equal(listedThings("**Notion**: $10\n**Slack**: $8.75\n**Linear**: $10"), 0, "not a list without its marks");
    assert.equal(listedThings("- **Notion**: $10\n- **Slack**: $8.75\n- **Linear**: $10"), 3, "bold names count");
    assert.equal(listedThings("- Notion: $10\n- Slack: $8.75"), 0, "two things stay in a sentence");
    assert.equal(listedThings("1. Open Settings\n2. Tap Wallet\n3. Add a card"), 0, "steps without names");
    assert.equal(listedThings("1. Step 1: open Settings\n2. Step 2: tap Wallet\n3. Step 3: add a card"), 0, "steps to follow keep their numbers");
    assert.equal(listedThings("```\n- a: 1\n- b: 2\n- c: 3\n```"), 0, "code is code");
    assert.equal(listedThings(Array.from({ length: 9 }, (_, i) => `- Item ${i}: ${i}`).join("\n")), 0, "more than a card holds");
    assert.equal(listedThings("- Docs: https://a.example\n- Site: https://b.example\n- Blog: https://c.example"), 3);
    assert.equal(listedThings("- https://a.example/x\n- https://b.example/y\n- https://c.example/z"), 0, "bare links have no names");

    assert.equal(holdForCard(COSTS, 1_000), true, "held the first time");
    assert.equal(holdForCard(COSTS, 2_000), false, "the same words again go through");
    assert.equal(holdForCard(COSTS, 3_000), true, "and are held again the next time");
    assert.equal(holdForCard(RESTAURANTS, 0), true);
    assert.equal(holdForCard(RESTAURANTS, 31 * 60_000), true, "too long after, held anew");
    assert.match(listCardNudge(4), /lists 4 things of one kind.*call ShowList/);
  } finally {
    await guard.dispose();
  }
});

test("SendMessage holds a listed message once, with the word to use the card, and lets the same words through after", async () => {
  const tool = await load("source/host/runner/tools/send-message-tool.ts", "send-message-list");
  try {
    const sent = [];
    const send = tool.module.createSendMessageTool({ getIngestAttachment: () => undefined, onSendMessage: (message) => { sent.push(message); return `t9s${sent.length}`; } });
    const words = COSTS.replace("Planchers", "Planchers (test)");
    const first = await run(send, { type: "text", content: words });
    assert.match(first, /lists 4 things of one kind/);
    assert.equal(sent.length, 0, "nothing reached the chat");
    const again = await run(send, { type: "text", content: words });
    assert.doesNotMatch(again, /lists 4 things/);
    assert.equal(sent.length, 1, "sent the second time");
    await run(send, { type: "text", content: "Modèle mis à jour avec les premiers prix de Cheikh." });
    assert.equal(sent.length, 2, "a plain message goes at once");
  } finally {
    await tool.dispose();
  }
});
