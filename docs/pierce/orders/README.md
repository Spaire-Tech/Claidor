# Standing orders — the lead's channel to the lanes

Written and maintained by Ledger (the lead) at integration. Each
lane, at the start of every working turn: fetch
`origin/claude/pierce-phase-6-writing-mjkaj6`, read your file here,
do what it says, push to your own `swens/<name>` branch, and stop.
If your file conflicts with `lanes.md`, `swens-plan.md`, or
`swens.md`, the usual order of precedence applies and you say so in
your log instead of guessing. The founder's « go » means exactly:
follow your current orders file.

## Memory discipline (standing, every lane, from 26 Aug)

Context runs out — the founder is seeing it happen. So, from now on:

1. **Each lane maintains `docs/pierce/handoffs/<name>.md`** — the
   cold-start recovery file, written for a successor who remembers
   *nothing*: who you are (lane name, branch, charter pointer),
   what is DONE and merged, what is in flight and exactly where it
   stopped, your next step, the operational lessons your container
   taught you (env quirks, workarounds, credentials-shaped gaps —
   never secrets themselves). Update it **in the same push as any
   work**; a handoff that trails the work is a trap.
2. **The log is the diary; the handoff is the map.** Logs stay
   append-only history. The handoff is short, current, and
   overwritten freely — if it exceeds ~2 pages, it is hoarding
   history that belongs in the log.
3. **If your context was compacted or you feel memory thinning:**
   stop building, write the handoff first, push it, then continue.
   If you notice you are answering from memory about the plan, the
   product, or your own past work — open the file instead
   (`notes.md`'s rule applies to lanes too).
4. **Restart procedure** (for the founder, if a lane session dies):
   start a fresh session and paste —
   « You are <Name>, a Swens lane. Fetch and check out a branch
   from origin/claude/pierce-phase-6-writing-mjkaj6, read
   docs/pierce/notes.md, docs/pierce/lanes.md,
   docs/pierce/orders/<name>.md, and docs/pierce/handoffs/<name>.md,
   then continue on branch swens/<name>. » The handoff makes the
   new session the old one.
