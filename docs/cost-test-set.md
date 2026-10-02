# Cost test set

Thirty real tasks, run on the Mac before and after a change that could move
cost or quality. The same tasks, in the same order, every time. It answers two
questions: did the change save money, and did the answers get worse?

Every run costs real money: about 30 tasks at a few cents to a dollar each.

## How to run it

1. Install the build under test. Sign in with an account used for nothing else
   that day, so the usage report shows only this run.
2. Create one fresh agent named "Test" (Simeon is created by onboarding).
3. Run the tasks below in order, each as a new message, and wait for each
   answer before sending the next. Tasks 21–24 need the cloud computer awake.
4. For each task, write down: pass or fail (the check column), and anything odd.
5. When done, read the cost on the server:

   ```sh
   cd server && uv run python -m scripts.desktop_usage_report test@example.com --hours 6
   ```

   Keep the two tables (per model, per reason) and the total.
6. Compare with the previous run: total dollars, dollars per reason, calls per
   reason, cached share (`cached ÷ input`), and the pass count.

A change is kept when the pass count is the same or better and the cost is
lower. A single task that flips from pass to fail is read again by hand before
deciding: one run is noisy.

## The tasks

| # | Kind | Message to send | Passes when |
|---|---|---|---|
| 1 | Greeting | "hello" | A short friendly reply, no tool use beyond SendMessage |
| 2 | Greeting | "thanks, that's all for now" | A short reply, nothing started |
| 3 | Question | "what can you do for me?" | A clear, short list; no made-up features |
| 4 | Question | "what's my name?" | Uses the name from onboarding |
| 5 | Question | "what time is it in Tokyo right now?" | Correct time |
| 6 | Small task | "write me a 3-line thank-you note to a client called Mara" | Three lines, names Mara |
| 7 | Small task | "summarise this: (paste one paragraph of any news article)" | Accurate, shorter than the paragraph |
| 8 | Small task | "turn this into a table: apples 3, pears 5, plums 2" | A correct three-row table |
| 9 | Search | "what's the latest version of macOS?" | Correct, with a source |
| 10 | Search | "find three good Italian restaurants near the Louvre" | Three real places with addresses |
| 11 | Search | "compare Notion and Linear for a 5-person team, short" | A fair comparison, sources |
| 12 | Research | "research the top 3 competitors to Superhuman email and how they price" | Real companies, real prices, sources |
| 13 | Research | "what changed in the EU AI Act in 2026? one paragraph" | Accurate, cites a source |
| 14 | Writing | "draft a one-page plan for launching a newsletter" | A usable plan with steps and dates |
| 15 | Writing | "rewrite this to sound warmer: (paste a cold two-line email)" | Same meaning, warmer |
| 16 | File | Attach a PDF of 2–5 pages: "what are the three main points?" | Three points that are in the PDF |
| 17 | File | Attach a CSV: "which row has the highest total?" | The right row |
| 18 | File | "make me a CSV of the 10 largest cities in Europe with population" | A file is attached; numbers are plausible |
| 19 | Image | "make an image of a lighthouse at dawn" | One image, matches the request |
| 20 | Image | Attach a photo: "what's in this picture?" | Accurate description |
| 21 | Computer | "open example.com on your computer and tell me the page title" | Correct title |
| 22 | Computer | "go to news.ycombinator.com and tell me the top story" | The current top story |
| 23 | Computer | "search Wikipedia for 'Ada Lovelace' and give me her birth date" | 10 December 1815 |
| 24 | Computer | "fill the form at httpbin.org/forms/post with test data, don't submit" | Fields filled, not submitted |
| 25 | Flights | "find me a flight from Paris to Lisbon next Friday, morning" | A flight card with real options |
| 26 | Routine | "every weekday at 9, send me one line of motivation" | A routine is created at a weekday 9 o'clock slot |
| 27 | Routine | (after it fires once, or use Run now) | The routine's message arrives; one run |
| 28 | Agents | "ask Simeon to give you a one-line status, then tell me" | Simeon replies; the answer reaches you; no back-and-forth past a few messages |
| 29 | Agents | To Simeon: "have Test write a two-line haiku about Mondays and send it to me" | The haiku arrives |
| 30 | Long task | "plan a 3-day trip to Rome for two in May: flights, hotel area, daily plan, budget" | A complete plan, several tools used, a sensible budget |

## What to look at besides the totals

- **Per reason.** `chat` is what people pay for. `routine`, `agent_wake`,
  `nudge`, `wake` and `background` are work nobody watched; if they grow, find
  out why.
- **Cached share.** On a warm conversation most input should be cached. A low
  share on tasks 2–8 means something near the start of the prompt changed
  between messages: compare the `prefix=sys:…` hashes on the `[simeon] model=`
  lines in `/tmp/sand-host.log` in the box.
- **Effort.** The `effort=` on each `[simeon] model=` line: `medium` for the
  first calls of a turn, `high` from the fifth, `low` for the helpers.
- **Calls per task.** Tasks 1–8 should take two or three calls each. A greeting
  that takes ten is a bug.

## Results

Keep one line per run here: the date, the build, the total, the pass count.

| Date | Build | Total ($) | Passed | Notes |
|---|---|---|---|---|
| | | | | |
