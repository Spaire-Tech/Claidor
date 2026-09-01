# Swens house style

A checker that reads what the agent writes and fails it when the writing breaks a house rule. Same idea as a code linter, pointed at prose.

Built and tested in this container on 31 Aug 2026 against the agent's real answers.

## What was verified

Not read about. Installed and run.

- Vale 3.12.0 downloaded from GitHub and run.
- The Google, Microsoft, proselint, write-good and Readability packages downloaded and run.
- Licences read from the repositories themselves, not from a blog post.
- The plain-language word list pulled from the GSA archive and turned into a rule file.
- Both the agent's answer and a rewrite scored by two tools that do not share code: Vale's Readability package, and `textstat` in Python.

## Measured result

Readability, computed independently with `textstat`:

| | Agent answer | Agent, depreciation part | Rewrite |
|---|---|---|---|
| Flesch-Kincaid grade (want < 8) | 10.5 | 13.6 | **3.9** |
| Gunning Fog (want < 10) | 12.4 | 16.0 | **6.3** |
| Flesch reading ease (want > 70) | 51.8 | 43.6 | **83.8** |
| Words per sentence | 18.2 | 26.3 | **9.2** |

House-rule alerts: **39 on the agent's answer, 0 on the rewrite.**

The depreciation answer scores at grade 13.6 — first year of university. That is the number behind "feels complicated."

## Install

```bash
curl -sL -o vale.tar.gz \
  https://github.com/errata-ai/vale/releases/download/v3.12.0/vale_3.12.0_Linux_64-bit.tar.gz
tar xzf vale.tar.gz
cp -r swens-style/.vale.ini swens-style/styles .
./vale sync          # pulls the Readability package
./vale answer.md
```

## The rules

Eight files in `styles/Swens/`. Each one is the machine version of a rule we wrote down.

| File | Catches | Level |
|---|---|---|
| `Hedges.yml` | about, roughly, fairly, very, simply, by far | error |
| `CheckWhether.yml` | "check whether", "worth noting", "worth knowing" | error |
| `MachineVoice.yml` | "my reader", "nothing matched a search", "walked back from" | error |
| `PlainWords.yml` | siblings, pinned reference, hardcode, in-service date, vintage rows | error |
| `CellFirst.yml` | a sentence opening with a cell address | error |
| `Unverified.yml` | presumably, most likely, it appears, "whatever it holds" | error |
| `SentenceLength.yml` | sentences over 20 words | warning |
| `PlainLanguage.yml` | 222 word swaps from the US federal guidelines | warning |

Add to `PlainWords.yml` every time a finance word slips through. That file is the house vocabulary and it should grow.

## Sources and licences

Checked against each repository's own LICENSE file.

| What | Where | Licence |
|---|---|---|
| Vale (the checker) | `errata-ai/vale` | MIT |
| Readability package | `errata-ai/Readability` | MIT |
| Google style rules | `errata-ai/Google` | MIT |
| Microsoft style rules | `errata-ai/Microsoft` | MIT |
| write-good | `errata-ai/write-good` | MIT |
| proselint | `errata-ai/proselint` | BSD 3-Clause |
| Federal Plain Language Guidelines | `GSA/plainlanguage.gov` | CC0 (public domain) |

All safe to use in a commercial closed product. The plain-language guidelines ask only for a credit.

Note on that last one: plainlanguage.gov itself was taken down. The full content, 51 guideline pages and the 237-word substitution list, is still in the GitHub repository. That was cloned and read directly here.

## What to skip

- **write-good's E-Prime rule** fired 16 times on the agent's answer, every one for the word "is". Nobody should write English without "is". Leave it off.
- **Google and Microsoft styles** are written for software documentation. Useful ideas, wrong vocabulary. Read them once, copy the rules that fit, do not run them.
- **Grammar checkers.** Vale checks style, not grammar. Different job, and grammar is not the problem here.

## Wiring it into the agent

Two places, and both are worth having:

1. **In the prompt** — the rules as words, so the agent writes well the first time. That is `findings-voice.md`.
2. **In the gate** — Vale runs on the generated text before it reaches a user. Any `error`-level alert sends the text back to the agent with the alert list attached, and it rewrites. Cap it at two retries, then ship with a flag.

The gate is the part that matters. A prompt rule is a request. A gate is a rule.

---

## How this is wired, as built

*Added by Ledger on 1 September, after the founder handed these two
documents over as the rules.*

Both halves of the README's last section exist now.

**In the prompt** — `server/polar/tieout/agent/prompt_house.md` quotes
`findings-voice.md`: the four moves, the plain-word bar, the words a
banker says out loud, the never-say list. It is appended after the
founder's voice file, so it is the last prose the model reads.

**In the gate** — `server/polar/tieout/agent/style.py` re-implements
the eight rule files in Python, and `gate.py` runs them on every answer
before it reaches a person. An `error` sends the text back with the
alerts attached; two tries, then it ships with the alerts recorded.

**Why Python and not the Vale binary.** Vale is the right tool for a
person editing prose on a laptop, and it is how these rules were proven
— the 39-alerts-to-0 measurement above is Vale's. But the gate runs on
every answer in production, and that cannot depend on a binary
downloaded from GitHub at boot. The rules are the same rules; the
runner is different. Vale stays the bench.

**What the port cost.** Readability is computed from the same formulas
over an *estimated* syllable count rather than a dictionary, so the
numbers track rather than match: on the founder's own test answer it
reports Flesch-Kincaid 10.5 against textstat's 10.5, and reading ease
51.7 against 51.8. Good enough to gate on, not a figure to publish.

**One consequence worth knowing.** The chat no longer streams its
answer. Prose that may be sent back to be rewritten must not be on
screen while it is being judged, so the status lines stream and the
answer arrives once, revealed at a steady rate. That is what the
design's own `asType` did, and it is one flag to change if the writing
gets reliably clean.

**The vocabulary grows.** `PLAIN_WORDS` in `style.py` is the house
vocabulary. Every finance word that reaches a person is a line to add
there — the README says so above, and the file is written to be added
to rather than rewritten.

---

## The third document: open standards

`findings-standards.md` sits beside this one. The founder downloaded and
read SARIF (the OASIS standard for how any code-checking tool reports
what it found) and the Rust compiler's error-message style guide, both
open-licensed, on 31 August.

Its conclusion is worth the space: **two independent groups reached the
same rules we did.** SARIF's schema says the first sentence must stand
alone when space is limited — the founder's « first view » rule, written
into a standard. Rust's guide says « try not to emit multiple messages
for the same error » — the one-authoring-situation-one-finding rule,
arrived at here from the Ofwat flood.

Three adoptions it names, none of them built yet:

1. **`kind: review`** — a first-class state for « found it, could not
   judge it ». This is the Module1 fix, and it is one field rather than
   a sentence that has to be written carefully every time.
2. **`partialFingerprints`** — a stable identity per finding across
   runs. Fixes severity flapping *and* feeds the shift-aware version
   diff; one mechanism, two wins.
3. **The four applicability levels** for a correction —
   `MachineApplicable`, `HasPlaceholders`, `MaybeIncorrect`,
   `Unspecified` — where there are two today. The middle two are the
   ones missing: a repair whose shape is known but not its value, and a
   fix offered without pretending to be sure.

Ledger's note: (1) and (3) are small and belong to the findings engine
rather than to the writing, so they are not in `style.py`. (2) is not
small — a fingerprint that survives an inserted row is the same problem
as the version diff, and it should be built once for both.
