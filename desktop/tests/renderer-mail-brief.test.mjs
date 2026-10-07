import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// The mail brief (7 October 2026): an agent's message that is one ```simeon-mail block is drawn as
// sections of email, deadline, task and person rows. Read-only; the actions come later.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

async function parser() {
  const { MAIL_REPLACEMENTS } = await import(patchModule);
  const source = MAIL_REPLACEMENTS.find(([label]) => label === "mail-components")[2];
  const parse = source.slice(0, source.indexOf("function __simeonMailEmail"));
  return new Function(`${parse}; return __simeonMailParse;`)();
}

const block = (data) => "```simeon-mail\n" + JSON.stringify(data) + "\n```";

test("a simeon-mail block parses into sections of typed rows, and anything else is left as text", async () => {
  const parse = await parser();
  const brief = parse(block({ title: "This morning's inbox", subtitle: "3 need you", sections: [
    { title: "Needs you", items: [
      { kind: "email", from: " Maya Chen ", subject: "Redlines", why: "Needs your OK", time: "9:12 AM", due: "Due Fri", urgent: true, thread: 4, unread: true, reply: "Approved." },
      { kind: "email", from: "No subject" },
      { kind: "sticker", title: "unknown kinds are dropped" },
    ] },
    { title: "This week", items: [{ kind: "deadline", title: "Q3 tax", day: "Wednesday, Oct 15", note: "From Pilot" }, { kind: "event", title: "Partner meeting", day: "Thursday, Oct 9", time: "10:00 AM" }] },
    { title: "Empty", items: [] },
    { title: "People", items: [{ kind: "person", name: "Jon Park", role: "Partner", note: "3 threads" }, { kind: "task", title: "Send the deck", due: "Today" }] },
  ] }));
  assert.equal(brief.title, "This morning's inbox");
  assert.deepEqual(brief.sections.map((section) => section.title), ["Needs you", "This week", "People"], "a section left with no rows is not drawn");
  assert.deepEqual(brief.sections[0].items, [{ kind: "email", from: "Maya Chen", subject: "Redlines", why: "Needs your OK", time: "9:12 AM", due: "Due Fri", urgent: true, thread: 4, unread: true, reply: "Approved." }]);
  assert.deepEqual(brief.sections[1].items[0], { kind: "deadline", title: "Q3 tax", day: "Wednesday, Oct 15", time: "", note: "From Pilot", app: "" });
  assert.deepEqual(brief.sections[2].items.map((item) => item.kind), ["person", "task"]);

  // One section per message (the founder, 7 October 2026: "separate each message"): a title and its items alone.
  const one = parse(block({ title: "Waiting on you", app: "gmail", items: [{ kind: "person", name: "Jon Park", role: "Partner" }] }));
  assert.equal(one.title, "Waiting on you");
  assert.equal(one.app, "gmail", "the app's own icon beside the title, from the window's app logos");
  assert.equal(parse(block({ app: "../x", items: [{ kind: "task", title: "t", app: "Google Drive" }] })).app, "", "an app is a logo key, nothing else");
  assert.deepEqual(one.sections, [{ title: "", items: [{ kind: "person", name: "Jon Park", role: "Partner", note: "" }] }]);

  assert.equal(parse("Three emails need you."), null);
  assert.equal(parse("Here it is:\n" + block({ sections: [{ items: [{ kind: "task", title: "x" }] }] })), null, "only a message that is the block alone");
  assert.equal(parse("```simeon-mail\n{not json\n```"), null);
  assert.equal(parse(block({ sections: [{ items: [{ kind: "email" }] }] })), null, "nothing to draw is text");

  const many = parse(block({ sections: Array.from({ length: 9 }, (_, i) => ({ title: `S${i}`, items: Array.from({ length: 12 }, (_, j) => ({ kind: "task", title: `T${j}` })) })) }));
  assert.equal(many.sections.length, 6);
  assert.ok(many.sections.every((section) => section.items.length === 8));
});

test("the brief wraps the flights card's place in the message and brings its own styles, once", async () => {
  const { MAIL_REPLACEMENTS, FLIGHTS_REPLACEMENTS, MAIL_MARKER, patchOriginalMailStylesheet } = await import(patchModule);
  const message = MAIL_REPLACEMENTS.find(([label]) => label === "mail-message");
  assert.equal(message[1], FLIGHTS_REPLACEMENTS.find(([label]) => label === "flights-message")[2]);
  assert.ok(message[2].startsWith("(!h&&__simeonMailParse(r)!=null?p.jsx(__simeonMail,{content:r}):"));
  const css = patchOriginalMailStylesheet(":root{}");
  assert.ok(css.includes(MAIL_MARKER));
  assert.match(css, /\.simeon-mail\{--m-ink:light-dark\(/, "both themes from one set of tokens");
  // Calmer (the founder, 7 October 2026: "way too noisy … not those too accented colors … the white background"):
  // no white field behind the rows, no tinted avatars, no coloured chips.
  assert.doesNotMatch(css, /--m-group|--m-urgent|simeon-mail__avatar|simeon-mail__chip/);
  assert.throws(() => patchOriginalMailStylesheet(css), /already present/);
});
