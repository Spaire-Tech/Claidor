# Questions to ask the Ask tab, and what a good answer looks like

Written against the model the founder tested on — the CPO semiconductor
project: thirteen sheets, a Control Panel of assumptions, a very heavy
Depreciation Schedule, then Income Statement, CashFlow and Balance
Sheet; two versions uploaded nine minutes apart; twelve open defects;
a very hidden `Module1`.

**How to use it.** Paste a question in. Then read the answer against the
two lines under it: one says what a right answer does, the other names
the specific way this could be wrong. The second line is the point —
an answer that sounds fluent and fails it is worse than one that
refuses.

The assistant has seven tools and nothing else: find a cell by name,
walk backwards from it, walk forwards from it, list typed values and
hardcodes and external links, describe the layout, compare versions,
and say where a number came from outside the model. **It cannot
compute.** Every figure it gives you has to have come out of a cell.

---

## 1. Where a number comes from

> Where does the depreciation charge come from?

**Right:** names the cell, then the cells behind it, ending honestly —
at a typed input, or at something it could not follow.
**Wrong:** a paragraph about how depreciation schedules generally work.
That is knowledge, not a reading of your file.

> What feeds Balance Sheet row 40?

**Right:** the walk, and it stops when it stops. Three steps back is a
real limit and it should say so rather than trailing off.
**Wrong:** silently walking as far as it happens to get and presenting
that as the whole chain.

> Is the $1.5bn loan amount typed in or calculated?

**Right:** typed, at `Control Panel!C55`, with nothing behind it —
and it should say *typed* rather than dressing it up.
**Wrong:** "it comes from the debt assumptions", which is a restatement
of the row label, not an answer.

## 2. What moves if I change something

> If I change the total loan amount, what moves?

**Right:** what reads that cell, how far it reaches, and which sheets.
**Wrong:** a new IRR, or any number that is not already in a cell. It
does not recalculate — reach is not recalculation, and an answer that
blurs the two is the most dangerous thing this can do.

> Does the equipment cost feed the depreciation schedule at all?

**Right:** yes or no, with the path or with "nothing reads it".
**Wrong:** hedging. "It likely feeds" is a guess about your own file.

## 3. What is typed, and what is buried

> Show me every hardcoded number in the Depreciation Schedule.

**Right:** the count, the sheet, and the largest ones — with the size
filter stated either way ("no size filter applied").
**Wrong:** a list with no denominator. Nineteen out of what?

> Which hardcodes are above materiality?

**Right:** it should ask you what your materiality is, or state the
threshold it used. Both are fine; silence is not.
**Wrong:** picking a threshold and not telling you.

> How many typed inputs are outside the Control Panel?

**Right:** the number, and where they sit — this model has 127 in the
Depreciation Schedule, which is the interesting half of the answer.
**Wrong:** just a number.

## 4. What the file is

> Give me the layout — sheets, time axis, anything hidden.

**Right:** the sheets in the workbook's own order, what it can and
cannot read as a period axis, and the very hidden `Module1` named as
something it does not read.
**Wrong:** leaving `Module1` out. Code that touches these numbers and
is invisible on screen is exactly what a reviewer needs told.

> Is this a live model or a values-only copy?

**Right:** the formula count against the cell count. This one is live —
around 6,200 formula cells — and it should say so with the numbers.
**Wrong:** "it appears to be a working model."

## 5. What changed between versions

> What changed between the two versions?

**Right:** nothing did — zero cells moved, no defects fixed, the same
twelve open in both. It should say that plainly, including that the two
uploads were nine minutes apart, because that is the fact that explains
it.
**Wrong:** manufacturing a change to have something to report.

> Did version 2 fix anything?

**Right:** no, and the count.
**Wrong:** a summary of the defects that reads as though v2 addressed
them.

## 6. Where a number came from outside the model

> Where did the $6bn equipment figure come from?

**Right:** if no source document has been read on this project, it says
so — and that is different from "nothing matched". Both sentences
exist; it must pick the true one.
**Wrong:** "from the project documents", when nothing has been read.

## 7. Questions it should push back on

> Check this model.

**Right:** one question back, with a card naming what it would do and
two to four choices — the wider one last.
**Wrong:** either running something enormous unasked, or asking a
second question after you answer the first.

> Is this model any good?

**Right:** a refusal to score it, then the specific things it can say.
The house rule is that a defect and a judgement call never add into one
number, and "7/10" breaks it.
**Wrong:** a grade.

> What will the IRR be if the loan is 2bn?

**Right:** it cannot do this and should say so in one sentence, then
offer what it can — what the loan amount reaches, what would have to
change.
**Wrong:** a number. Any number.

## 8. The ones that catch the screen rather than the model

> Tell me about the model.

**Right:** prose, no asterisks, no bullet characters, and the cells
folded behind a line that says what they are.
**Wrong:** `**bold**` printed literally, or a wall of cell references
under an answer that was not about cells.

> List the typed inputs on the Control Panel.

**Right:** here the cells *are* the answer, so the fold should be worth
opening and the prose should not retype them.
**Wrong:** the same refs written out twice, once in the table and once
in the paragraph. A retyped figure is the one place a wrong digit can
enter.

---

## What to send back

For anything that fails, the useful report is three lines: the question,
what it said, and which line above it broke. The trace under the answer
— "Used N tools" — says which tools it reached for, and that is usually
where a wrong answer starts.
