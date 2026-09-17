# The brief, audited

18 September 2026. The founder: *"thats tooo many rules that are wrong.
everything is a new rule wrong. this is becoming a nasty pattern. audit
this seriously."*

They are right, and the pattern is not that individual rules are badly
written. It is that the brief contradicts itself, in four places, on
exactly the four things that went wrong live. Every fault they reported
has a matching pair of rules where one says do it and the other says do
not, and in every case the *wrong* one is earlier in the file.

277 rules across 57 sections, 77,208 characters.

---

## 0. The brief has two authors and I manage half of it

Everything above `<!-- Caisra managed: do not edit below this line -->`
— about 5,400 characters, thirteen sections — is not ours. It is
OpenClaw's own template
(`vendor/openclaw-runtime/…/docs/reference/templates/AGENTS.md`), written
into the workspace before our section is appended. We never regenerate
it, no test has ever read it, and I have spent three days tuning the
other half without once looking at it.

It contains, verbatim:

- **`- **Discord/WhatsApp:** No markdown tables! Use bullet lists instead`**
  — an instruction to prefer bullet lists, in a brief whose whole
  purpose this week was to stop bullet lists.
- **`**🎭 Voice Storytelling:** If you have `sag` (ElevenLabs TTS), use
  voice for stories… Surprise people with funny voices.`** — a tool we
  do not ship, an instruction that cannot be followed.
- **`When you learn a lesson → update AGENTS.md`** — the agent is told
  to edit its own brief. It can only write above the marker, which is
  the half we never read. **The brief on a person's machine may not be
  the brief we generate, and we would not know.**
- **`## Related — [Default AGENTS.md](/reference/AGENTS.default)`** — a
  pointer at yet more upstream instructions.
- **`## Make It Yours — This is a starting point. Add your own
  conventions, style, and rules.`**
- Two sections on group-chat etiquette and emoji reactions that
  duplicate, with different rules, what our own sections say.

This is the same family as `## Deliverable File Links`, the inherited
section that turned every report into a `.docx` for two days. That one we
found by accident. These have never been looked at.

---

## 1. Ask or assume — a three-way contradiction, one of them word for word

| Where | What it says |
|---|---|
| L59, upstream | "When in doubt, ask." |
| **L181**, ours, section titled **"Decide, rather than asking"** | "**The default is to go ahead.** Make the ordinary call yourself, say which way you went in a few words, and carry on." |
| **L184**, ours | "If you assumed, say so in the same breath as the answer: *'Went with the invoices folder — say the word if you meant the archive.'*" |
| **L430**, ours (`cardsPrompt.ts`) | "Offer the next move instead of asking for it. When you would otherwise ask **a question with a handful of likely answers**, **answer first on your best assumption**…" |
| **L650**, ours (`openclawConfigSync.ts`) | "**A question with a handful of likely answers** never goes in prose… **If you are asking, you are calling this tool.**" |

L430 and L650 use **the same phrase** to give **opposite instructions**.
I wrote them two days apart, in two different files, and never looked for
the first when writing the second.

L184 is the template the model followed exactly: *"Assuming Tokyo as your
base and no fixed bookings yet."*

And the section at L181 is *titled* after the behaviour the founder does
not want. Fixing one clause inside another section, as I did an hour
before this audit, could never have worked.

## 2. Prose or a card

| Where | What it says |
|---|---|
| L130, upstream | "No markdown tables! Use bullet lists instead" |
| **L208**, ours | "**Prose beats bullets** unless the content is genuinely a list." |
| **L425**, ours | "**A block is the normal way to answer**, not a special occasion." |

L208 is 217 lines before L425. A fourteen-day meal plan is not "genuinely
a list" by any natural reading, so L208 says prose, and L208 is read
first.

## 3. Proactive or stay in your lane — and this is the missing document

| Where | What it says |
|---|---|
| **L185**, ours | "Do the thing they asked for. **Do not widen it** because you noticed something else along the way; mention what you noticed and let them choose." |
| **L455**, ours | "When you have just answered with a card that a person would plausibly want to keep… **write it up as a report in the same reply without being asked**." |

Writing an unasked-for document *is* widening the task. L185 forbids it,
270 lines before L455 asks for it. This is why "I've also put it in a
document" never appeared, and it is not the bug I assumed it was.

## 4. What was a real bug, and is fixed

Two of the six faults were code, not contradiction, and both are fixed:

- **The component names.** OpenUI ships two chat libraries; the model
  learned the other one. `CardHeader` where we want `Header`. An unknown
  component silently drops itself and every sibling after it. Fixed in
  `954ea6ce` with a correction pass and a test that reproduces the
  founder's screen exactly.
- **No pictures.** The rule was conditional on already having search
  results and never told the agent to go and get any. Fixed in the same
  commit, along with a dangling "the two routes above" in the Artifacts
  section that pointed at rules deleted two days earlier.

---

## Why this keeps happening

Five causes, in the order they matter.

**1. I edit through a keyhole.** The brief is 77,000 characters. I open
the section I am thinking about, change it, and never scan the rest of
the document for the same subject. Four contradictions is the proof, and
three of them are between two things I wrote myself.

**2. Every test I have checks that words are present, never that they
are right.** `expect(section).toContain('One block per reply')`. A rule
that flatly contradicts another rule passes every test in the suite. The
suite has never once been able to fail for the reason the founder keeps
finding.

**3. I only manage half the document** (§0).

**4. Rules are written as sentiment, not as a test the model can apply.**
"Prose beats bullets" is a taste. "The default is to go ahead" is a
posture. Neither tells a model what to check. The rules that have worked
— "never put a question with a handful of answers in prose" — are the
ones shaped like a decision procedure.

**5. I never simulate.** I have never taken a real message — "write me a
14 day meal plan" — and walked the brief asking which rules fire, in what
order, and what they jointly produce. Had I done that once, §1 to §3
would have fallen out in ten minutes.

---

## What would actually fix it

Not a rewrite of 277 rules. Three structural things:

**One subject, one place.** Asking is currently decided in four
sections. It should be decided in one, and the others should point at it.
Same for cards-versus-prose and for proactivity.

**A contradiction test.** A list of behavioural axes — ask/assume,
card/prose, proactive/narrow, speak/silent — with the rule that each axis
may be stated in exactly one section. Mechanical, cheap, and it fails on
the class rather than on one instance. This is the piece that stops the
pattern rather than the symptom.

**Bring the upstream half under management**, or at minimum under test:
assert what is above the marker, so a template change or an agent's own
edit cannot silently rewrite the rules.

## Unrun

Everything here is read from the generated brief and from the source. No
part of this audit has been run against a live model, and the three fixes
above are not built.
