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

test("a simeon-mail block is one card: emails that need you, dated items, and the rest on one line", async () => {
  const parse = await parser();
  const card = parse(block({ title: "Needs you", subtitle: "3 of 31", app: "gmail", items: [
    { kind: "email", id: "m1", from: " Maya Chen ", address: "maya@haleward.com", subject: "Redlines", why: "Needs your OK", time: "9:12 AM", due: "Due Friday", urgent: true, waiting: "Waiting since 9:12 AM",
      draft: { to: ["maya@haleward.com"], subject: "Re: Redlines", body: "Approved." },
      thread: [{ from: "Maya Chen", time: "Mon", body: "Attached." }, { from: "You", time: "Mon", body: "" }] },
    { kind: "email", from: "No subject" },
    { kind: "person", name: "people are not a kind any more" },
    { kind: "event", title: "Partner meeting", weekday: "Thu", date: "Oct 9", time: "10:00 AM", note: "Zoom", app: "google-calendar" },
  ], rest: { label: "28 can wait · 3 handled by Iris", items: [{ from: "Stripe", subject: "Payout", note: "Can wait" }, {}] } }));
  assert.equal(card.title, "Needs you");
  assert.equal(card.app, "gmail", "the app's own icon beside the title, from the window's app logos");
  assert.deepEqual(card.items.map((item) => item.kind), ["email", "event"], "an email with no subject and an unknown kind are left out");
  assert.deepEqual(card.items[0].draft, { to: ["maya@haleward.com"], subject: "Re: Redlines", body: "Approved." }, "the reply the agent prepared, for the composer");
  assert.deepEqual(card.items[0].thread, [{ from: "Maya Chen", time: "Mon", body: "Attached." }], "the thread for the pane, empty messages dropped");
  assert.equal(card.items[0].from, "Maya Chen");
  assert.deepEqual(card.items[1], { kind: "event", title: "Partner meeting", weekday: "Thu", date: "Oct 9", time: "10:00 AM", note: "Zoom", app: "google-calendar", today: false });
  assert.deepEqual(card.rest, { label: "28 can wait · 3 handled by Iris", items: [{ from: "Stripe", subject: "Payout", note: "" + "Can wait" }] });
  assert.equal(parse(block({ items: [{ kind: "email", subject: "x" }] })).items[0].draft, null, "no draft means a plain Reply");

  assert.equal(parse("Three emails need you."), null);
  assert.equal(parse("Here it is:\n" + block({ items: [{ kind: "deadline", title: "x" }] })), null, "only a message that is the block alone");
  assert.equal(parse("```simeon-mail\n{not json\n```"), null);
  assert.equal(parse(block({ items: [{ kind: "email" }] })), null, "nothing to draw is text");
  assert.equal(parse(block({ app: "../x", items: [{ kind: "deadline", title: "t", app: "Google Drive" }] })).app, "", "an app is a logo key, nothing else");
  assert.equal(parse(block({ items: Array.from({ length: 12 }, (_, i) => ({ kind: "deadline", title: `T${i}` })) })).items.length, 8);
});

test("the brief wraps the flights card's place in the message and brings its own styles, once", async () => {
  const { MAIL_REPLACEMENTS, FLIGHTS_REPLACEMENTS, MAIL_MARKER, patchOriginalMailStylesheet } = await import(patchModule);
  const message = MAIL_REPLACEMENTS.find(([label]) => label === "mail-message");
  const pane = MAIL_REPLACEMENTS.find(([label]) => label === "mail-pane-body");
  assert.equal(pane[1], "p.jsx(__simeonFlightDetails,{offer:__fo.offer})", "an email opens in the agent's pane, in the flight's place");
  const source = MAIL_REPLACEMENTS.find(([label]) => label === "mail-components")[2];
  assert.match(source, /p\.jsx\(As,\{color:"monochrome",variant:"primary",size:"md",type:"submit"[^}]*children:"Send email"\}\)/, "the reply is sent from the window's own button, as the email composer does");
  assert.equal(message[1], FLIGHTS_REPLACEMENTS.find(([label]) => label === "flights-message")[2]);
  assert.ok(message[2].startsWith("(!h&&__simeonMailParse(r)!=null?p.jsx(__simeonMail,{content:r}):"));
  const css = patchOriginalMailStylesheet(":root{}");
  assert.ok(css.includes(MAIL_MARKER));
  assert.match(css, /\.simeon-mail,\.simeon-mail-pane\{--m-ink:light-dark\(/, "both themes from one set of tokens");
  // Calmer (the founder, 7 October 2026: "way too noisy … not those too accented colors … the white background"):
  // no white field behind the rows, no tinted avatars, no coloured chips.
  assert.doesNotMatch(css, /--m-group|--m-urgent|simeon-mail__avatar|simeon-mail__chip/);
  assert.throws(() => patchOriginalMailStylesheet(css), /already present/);
});
