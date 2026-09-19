# The Grok Bot 0.18 source: where it came from and on what basis

**Record made 18 September 2026, at the time of the decision, so it is not
reconstructed later from memory.**

---

## What was brought in

The source-oriented reconstruction of **Grok Bot 0.18.0 for macOS**, published
at `https://gitee.com/xiguazhi/grok-bot-0.18-reconstructed` by `bennett`
(`b-nnett`), single commit `a9f633e`, 23 August 2026.

Grok Bot is **Anysphere's** product. Upstream bundle id `com.anysphere.sand`,
distributed from `downloads.cursor.com/grokbot/`. The reconstruction carries
**no licence of its own** — no `LICENSE` file, no `license` field — and its
`NOTICE.md` states that no upstream source-code licence is asserted or granted.

## On what basis

**Permission was given by Michael Truell, CEO of Anysphere, to Bass Fall,
verbally, on 18 September 2026.** Bass and Michael were flatmates at MIT. Bass
reported the exchange as follows: he told Michael what he was doing rather than
asking for permission; Michael replied that he had seen the reconstruction, that
it had been known about for some time, and that Grok Bot would eventually be
open source anyway.

**This permission is verbal and is recorded here on Bass's word**, given
explicitly and without qualification. It is not a written licence. Two things
follow, and both are Bass's to weigh:

1. **A one-line written confirmation would be worth having** — a reply in the
   same thread saying "no objection" is enough. Not because the word is doubted,
   but because a record that exists only in one person's memory is the kind of
   thing that becomes difficult years later, and it costs nothing to ask for now.
2. **Scope was not defined.** The permission as described covers using the
   reconstruction. It does not obviously extend to redistributing Anysphere's
   signed installers, which is why `research-archives/` — the preserved 0.18.0
   DMG and Windows EXE — was **deliberately excluded** from what came in.

## What was excluded, and why

- **`research-archives/`** — the original signed macOS and Windows installers,
  held in Git LFS. Redistributing a company's signed binaries is a different act
  from using reconstructed source, and nothing we are building needs them.
- **`.git`** — the upstream history is not ours to carry, and the tree is what
  matters.

## The honest caveats about the material itself

Recorded so nobody later mistakes this for Anysphere's own source:

- It is a **reconstruction from a compiled binary**, not the original repository.
  Module names and boundaries were inferred and may not match the real source.
- It targets **one pinned release**, 0.18.0, macOS Apple Silicon.
- **The renderer was never recovered.** The shipped app had no source maps, so
  the UI is absent; `frontend/` is the author's own partial redraw, not
  Anysphere's. This matters less to us than to most, because Caisra's interface
  is the founder's own design.
- **Zero stars, zero forks, one author, one commit.** Nobody has validated it.

## If this is ever withdrawn

The founder's instruction, verbatim: *"when michael answers and put limitations,
whatever that is we remove."* So: if Anysphere asks for any part of this to come
out, it comes out, without argument and without waiting to be asked twice. This
document exists partly so that whoever does that removal knows exactly what
arrived, from where, and on what basis.
