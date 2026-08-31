# Writing to a deck

Supersedes the line in `roadmap.md` (since deleted) that said PowerPoint's reversible-edit
story "has to be invented". That was wrong, and it was wrong in a way that
made the biggest remaining item look harder than it is.

## What is true

**The .pptx format has no revision model.** Word has `w:ins` / `w:del`.
Excel had a shared-workbook change log. PowerPoint has never had either,
and this is a fact about the specification rather than a gap in the
tooling.

**Nobody solved that. Everybody went around it.** (Founder's research,
August 2026 — not independently verified here, and worth re-checking before
anything is said to a customer.)

| | How it works |
|---|---|
| PowerPoint's own Compare | Opens two files, diffs them, stores nothing. Being retired on Windows; never existed on Mac or web |
| UpSlide | Same shape — the instructions tell you to pick a previous version to compare against |
| Aspose, GroupDocs | Produce a merged file or a report |

Vesence and Harvey both published on their **Word** engines. Neither has
published anything about PowerPoint revisions. The claim that either
"invented" a slide revision format does not hold, and it should not have
been repeated here.

## What we do instead, and why it is enough

**We already store both sides of every change.** A `Finding` carries
`printed` — what the deck says — and `expected` — what the model returns.
The database *is* the revision store, and it holds more than a tracked
change would: the cell it came from, the basis, the check run, and who
decided.

    accept   write `expected` into the shape
    reject   leave `printed` alone
    reverse  write `printed` back

No markup invented, nothing stored in the file that PowerPoint would not
understand, and a deck that has been accepted opens cleanly on a machine
that has never heard of us. That last property is worth more than a
revision mark: a banker sends the file out, and it has to be a normal file.

**The accept/reject surface is ours to build, and it is built.** Word's
Office.js exposes a change-tracking mode; PowerPoint's exposes nothing of
the sort. That is not a problem to solve — the panel already lists the
findings and takes the decision. What is missing behind it is only the
write.

## The two things that are actually hard

### 1 · A figure is often not one run

`$42.6mm` in a text frame can be stored as `$42.` and `6mm` in two
separate runs — spell-check, an edit made three versions ago, a font
change on one character. Search-and-replace across that boundary destroys
the formatting of both.

**We have never seen this, and that is the danger.** The reader takes
`paragraph.text` and `shape.text_frame.text`; python-pptx flattens the
runs on the way out, so every figure has looked like one piece of text for
the entire life of this project. It will appear the first time we write.

What we did store is the right coordinate:

```python
anchor=_anchor(shape, "text", paragraph=index, start=item.start, end=item.end)
```

`paragraph` and character offsets **into the stripped paragraph text** —
run-agnostic, which is exactly what a writer needs, and exactly where the
problem lands.

The published technique, in both Python and .NET: explode the paragraph so
every character is its own run, locate the match by offset, replace it,
then coalesce adjacent runs that share formatting. The formatting survives
because each character kept its own.

### 2 · A chart number lives in two places

A value on a chart exists in the **embedded workbook part** (a whole
`.xlsx` inside the `.pptx`) and again in the **cache in the chart XML**.
Write one and not the other and the file disagrees with itself: it draws
one number and reports another the moment someone opens the data.

**A correction to our own reader.** `deck.py` said python-pptx reads chart
values "from the embedded workbook part, where the numbers actually live —
the slide itself holds only bars." That is backwards, and reading
python-pptx's source settles it:

```python
def iter_values():
    val = self._element.val          # c:val → c:numRef → c:numCache
    for idx in range(val.ptCount_val):
        yield val.pt_v(idx)
```

`series.values` reads **the cache**. The embedded workbook is a separate
part that python-pptx exposes elsewhere and does not consult here.

On the read side this changes nothing — the cache is what PowerPoint
draws, so the cache is the printed claim, which is what we check. On the
write side it is the whole problem, and the comment being wrong is how a
writer would have got it wrong too.

## Tools

| | |
|---|---|
| **python-pptx** | Already a dependency. Does the job |
| **Clippit** | A maintained fork of a Microsoft tool Microsoft abandoned. Useful only if any of this were .NET. It is not |

**One warning worth keeping.** At least one of the small pptx-diff scripts
circulating has **no licence file at all**. No licence means no grant of
rights — it cannot go into a paid product, whatever its README says. Skip
it, and check `LICENSE` before adopting anything else.

## What this does to the estimate

Writing to a deck is no longer the riskiest item. It is two known problems
with published solutions, against a data model that already holds both
sides of every change.

The riskiest item is now the one that was always underneath it: **the deck
tie-out has never had its recall measured.** Being able to write a
correction into a slide is worth nothing if we cannot say how many
mistakes we find.
