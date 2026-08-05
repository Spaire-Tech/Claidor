# Apple FAQ Design

_Started 2026-06-11 19:44 UTC_

---

## User

in the same style. below, can we have an faq? apple style?  like this. but it should be good in dark and light mode so beware that.

## Assistant

_[tool: read_file]_

_[tool: list_files]_

_[tool: list_files]_

_[tool: str_replace_edit]_

The design system project is empty, but the file itself already defines a clear Apple-style system (SF Pro / Poppins, blue accent, `--bg`/`--text`/`--text-2` tokens, light+dark). I'll add the FAQ in that exact vocabulary. Let me drop it in below the lessons.Now the FAQ markup, inserted after the lessons block:

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now the toggle logic — and I need to make sure editing the contenteditable question doesn't also collapse the item:

_[tool: show_html]_

_[tool: show_html]_

Let me scroll to the FAQ and capture both states in light and dark mode:

_[tool: multi_screenshot]_

_[tool: save_screenshot]_

html-to-image didn't render the grid-expand or the light bg faithfully. Let me do a real pixel capture to confirm the open answer and light mode render correctly:

_[tool: save_screenshot]_

_[tool: eval_js]_

Items aren't expanding and theme isn't switching in the capture. Let me debug the live state:

_[tool: eval_js]_

Both readings were mid-transition (the `.4s` bg + `.42s` grid animations). Let me re-measure after settling:

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: grep]_

_[tool: eval_js]_

_[tool: read_file]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: str_replace_edit]_

Found it: animating `grid-template-rows` between `fr` units is failing to settle in this engine (with the transition off, the open rule works fine). I'll switch to a bulletproof JS height animation.

_[tool: str_replace_edit]_

_[tool: show_html]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: grep]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

Confirmed — `visibilityState` is "hidden" in my preview, which freezes CSS transitions at their start frame. That was the entire artifact; the accordion is correct. The JS height approach I switched to is robust, so I'll keep it. Let me reset my test mutations and verify the visuals via the real pixel screenshotter (which uses the visible user view).

_[tool: done]_

_[tool: fork_verifier_agent]_

Added an Apple-style **"Questions? Answers."** FAQ below the lessons, in the page's existing visual language:

- **Big Poppins headline**, centered, with hairline-divided rows and a chevron that rotates to the blue accent when open.
- **Smooth accordion** — each row expands to reveal its answer (golf-course-relevant copy). Both questions and answers are editable inline, matching the rest of the creator empty-state page.
- **Light + dark aware** — dividers, chevrons, and text all use theme tokens (`--hair`, `--faq-chev`, `--text`/`--text-2`) so it reads cleanly in both modes via the existing theme toggle.

One note: I wrote five placeholder FAQ entries with golf-course content — swap the copy to your real questions by clicking any line to edit.

## User

No issues found

## Assistant

The verifier confirmed everything works — smooth expand/collapse and legible in both light and dark mode. The FAQ is ready.

## User

the phrase Question? Answers. - Must fit in one line. the answers, the shade of the answer is too light.

## Assistant

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Both fixed: the headline now uses `white-space: nowrap` with a viewport-scaled size so **"Questions? Answers."** always sits on one line (down to small phones), and the answer text now uses a dedicated darker token — `#4a4a4f` in light mode and a stronger near-white in dark — so it reads clearly instead of looking washed out.

## User

Okay, now before faq i want a section about the instructor. but I really really want it apple/masterclass style. not claude style. i know what ai style looks like and im not a fan. i want it to blend well with everything. i'm letting you call up your creative genius on that.

## Assistant

_[tool: str_replace_edit]_

Let me add a cinematic instructor section between the lessons and the FAQ — MasterClass portrait-and-quote bones, Apple restraint, and the same empty-state glass vocabulary as the rest of the page.Now the markup and upload wiring:

_[tool: str_replace_edit]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Added the instructor section right before the FAQ, in the page's own language rather than a generic "AI card layout":

- **MasterClass bones** — a tall 4:5 cinematic portrait on the left with a small-caps "TEACHES THE SCORING GAME" overlay at the bottom, like a streaming-class poster. The portrait uses the same liquid-glass empty-state treatment as your lesson cards (ambient blur + glass tint + "Add a portrait" CTA), and fills/persists the same way when you drop a photo in.
- **Apple restraint on the right** — quiet small-caps eyebrow, the name huge in Poppins, a single role line, one tight bio paragraph, and a hairline-topped pull quote in display type. No stat chips, no icon grids, no cards.
- Everything is editable inline, and all text/hairlines ride the theme tokens so it holds up in light and dark.

Verifier is double-checking both modes now — but take a look and tell me if the quote or bio copy should hit differently.

## User

No issues found

## Assistant

Verified clean in both light and dark mode — the instructor section and FAQ are all set. Let me know if you'd like the quote, bio, or layout tuned.

## User

still not right.  feels too cliche.  want it like this. but instead of preview its an image/portait. also must be apple style. i've attached the fima file again for your ref

## Assistant

_[tool: view_image]_

_[tool: fig_ls]_

_[tool: grep]_

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Restructured to match your reference — same bones as the Charlie Puth page, but in this page's Apple vocabulary:

- **Header row**: small circular headshot slot (click to add — same liquid-glass empty state, persists like the other uploads) sitting beside the name and a short two-line credential summary.
- **Running bio below**: two plain paragraphs, no eyebrow, no pull quote, no cards — just clean text in the page's reading color.
- **Right side**: a large 1:1 rounded portrait slot instead of the video preview, with a dark frosted caption pill ("Jack Reeves · The Scoring Game") bottom-left, echoing the "Preview of…" pill in your screenshot.

Everything stays inline-editable and theme-aware. Verifier is checking both modes now.

## User

No issues found

## Assistant

_[tool: snip]_

Verified in both light and dark mode — the new instructor layout is set. Drop your headshot into the circle and a square portrait into the right slot whenever you're ready.

## User

so for the card of spotlight. i changed my mind and want them exactly this size and dimension and style.

## Assistant

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Spotlight cards are now the Apple TV episode-rail style from your reference:

- **4 large cards per viewport** (was 6), ~1.45:1 wide format with 24px corners and 30px gaps — the remaining lessons in each module sit off-screen in a horizontal rail that scrolls with snap, no visible scrollbar (rails bleed to the page edge like Apple TV).
- **Reference gradient** — once you add a still, it gets the exact `to top` black overlay from your spec (.85 → .4 → .1).
- **Type bumped to spec**: 12px uppercase LESSON label, 19px semibold single-line title with ellipsis, 15px two-line description, 14px duration + ••• in the meta row.

Verifier is confirming the rail behavior and both themes now.

## User

Found issues — fixing…

## Assistant

_[tool: str_replace_edit]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Fixed — the "Add image or cover" pill is now anchored 16px from the top of each card (centered horizontally), well clear of the bottom-pinned lesson text at any viewport width. Verifier is re-checking now.

## User

not quite claude. check your proportions. use your logic. why the lesson card start so on the left?

look at my pasted text.

## Assistant

_[tool: show_html]_

Let me look at the current render first to diagnose the proportions and the left-alignment question:

_[tool: show_html]_

_[tool: multi_screenshot]_

_[tool: str_replace_edit]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Good catch on the left edge — that was a real bug, not a style choice: the rail uses scroll-snap, and snap points ignore the rail's side padding, so on load the first card got yanked to the raw viewport edge. Fixed with `scroll-padding-inline` matching the page gutter, so card 1 now lines up exactly under the module heading.

On your critique, point by point:

- **Proportions** — the ratio was always 1.45:1, but with 4-up shrinking on a ~1400px window the cards collapsed to ~260px wide, which is what made the text eat half the card. Cards now have a **400px floor**: they fill 4-up when the viewport supports it, and below that they hold cinematic size and the rail scrolls instead of shrinking.
- **Image-to-text balance** — type scaled down (11px label / 18px title / 14px two-line desc / 13px meta, tighter stack), so the info block sits in roughly the bottom third, ~70/30 like the reference.
- **Empty placeholders breaking rhythm** — each unfilled card now carries a subtly different ambient tint instead of five identical gray boxes, so the row keeps an artwork-like cadence until your stills go in. (Real images are still the cure — the placeholders can only fake it so far.)

## User

No issues found

## Assistant

_[tool: snip]_

All verified — first card aligns with the module heading, cards hold their cinematic size, and the rail scrolls for the rest. The page is in good shape.

## User

well done Claude. now in another page, can you do the same for Catalog

## Assistant

_[tool: write_file]_

Building the viewer-facing Catalog page in the same vocabulary — featured hero, Apple TV-style course rails with the exact card spec we just settled, light/dark, liquid-glass empty slots, all text editable:

_[tool: done]_

_[tool: fork_verifier_agent]_

Catalog page is up — same system, applied to browsing:

- **Featured hero** (78vh) spotlighting The Golfer's Blueprint, with a "View course" button that links straight to the course page, plus key-art slot and the shared theme toggle (light/dark choice carries across both pages).
- **Three cinematic rails** — New & Noteworthy, Popular This Week, Coming Soon — using the exact card spec we settled: 4-up with a 400px floor, 1.45:1, 24px radius, 30px gaps, snap-scrolling rails that align with the headings.
- **Course cards** carry category + lesson count, title, one-line hook, and instructor — all editable inline, each with its own key-art slot and the varied ambient tints. The golf card click-throughs to its course page.
- If you already added a cover on the course page, the catalog hero borrows it automatically until you set dedicated key art.

One caveat: the example courses/instructors are placeholders — swap in your real catalog by clicking any text. Verifier is doing a pass on both themes now.

## User

whats this? i meant catalogue lesson card. you know how we have spotlight, and catalogue?

## Assistant

_[tool: list_files]_

_[tool: grep]_

_[tool: read_file]_

_[tool: delete_file]_

_[tool: str_replace_edit]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Sorry for the detour — deleted the browse page I'd invented. The **Catalog lesson card** (on Marquee Empty State, the episodic page from your card picker) now gets the same treatment as Spotlight:

- **Same rail spec**: 4-up with a 400px minimum card width, 30px gaps, snap scrolling — cards never shrink into cramped tiles.
- **24px radius** on the card shell (was 16), matching the spotlight cards.
- **Same type scale**: 11px episode label, 18px title, 14px two-line description, 13px meta — with the thumb keeping its 16:9 top position and the details below, which is what makes Catalog *Catalog*.
- **Varied ambient tints** across the empty thumbs, same as the spotlight rail.

Verifier is checking both modes now. Want me to mirror the same card update onto **Marquee Course Page.html** (the filled version) so the pair stays in sync?

## User

No issues found

## Assistant

Verified clean in both modes — the Catalog cards now match the Spotlight spec. Just say the word if you'd like the same update mirrored onto Marquee Course Page (the filled version) so both stay in sync.

## User

can you to see please try to put "your instructor" section up below the hero? i wanna see something

## Assistant

_[tool: str_replace_edit]_

_[tool: done]_

Done — the instructor section now sits directly below the hero (order: hero → instructor → free sample → lessons → FAQ), with its padding rebalanced for the new position: more air after the full-bleed hero, tighter into the sample section so the page rhythm still flows. Take a look and see how it feels — happy to move it back or try it between sample and lessons instead.

