# Orders — Atelier (updated 26 Aug — the founder unlocked design)

The founder's decision, verbatim intent: design everything the best
you can in our existing style; they will redesign if they wish —
« but tell them not to be lazy just because i might re-design. i
want them to do their best. » (Recorded in `lanes.md`.) The hold is
over.

0. First, the standing memory discipline: your handoff file
   (`docs/pierce/handoffs/atelier.md`), pushed with the work.
1. **Design and build the Watch delta view** — the « what changed
   between versions » page from your own inventory item 1. Your
   design, full effort, in the established style; engine behind it
   is merged (`polar.tieout.watch`); serve it through your own
   endpoint per the frozen-interface rules. Mark it agent-designed
   in your log. This is the demo's strongest missing moment — treat
   it as such.
2. **Then the source viewer** (inventory item 2): the click-a-number,
   see-the-highlighted-page moment; `POST /v1/chain/extract` and the
   fact store are live.
3. **Then the recalculation mark** (inventory item 3): the
   « validated by recalculation » state on report and model page,
   including its honest refusal face.
Work the list in order, one screen shipped whole (design, endpoint,
tests, screenshots in your log) before the next.
