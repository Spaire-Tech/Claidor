# Community Hub — Creator · Build Plan

Authoritative plan for replicating `Community Hub - Creator.html` (the Claude Design
handoff) into the real Next.js course editor, **replacing the existing v5
`CommunityPreview` + shared `components/Community/*`**.

Source of truth (in this folder):
- `creator-app.jsx` (1246 lines) — shell, nav, hero, tabs, Start/Events/Activities/Settings, shared atoms, RichComposer.
- `creator-feed.jsx` (302 lines) — Feed tab + post card + comments + composer.
- `community-data.jsx` — the prototype's data world ("The Baseline", Carla Marín tennis).
- `community.css` + `creator.css` — all tokens + component styles (reference verbatim during build).
- `chats/chat1..7.md` — design intent; **chat 7 is the final, authoritative pass.**

> The code is the source of truth for **what** to build; the chats for the **feel**
> and to resolve "is this final or discarded?" Where they conflict, the final code + chat 7 win.

---

## 0. Design system (from community.css / creator.css)

```
--bg #f5f5f7   --surface #fff   --ink #1d1d1f   --t2 #6e6e73   --t3 #86868b
--hair rgba(0,0,0,.11)  --fill rgba(0,0,0,.045)  --fill-2 rgba(0,0,0,.08)
--accent #0066cc   (the ONE accent — links + primary action + toggles + checks + rings)
--live #d8472b     (ONLY a tiny "live" dot — never for affirmative controls)
--sf  SF Pro / system  (body 16 / 1.47, -0.018em)
--po  Poppins 500/600/700  (display titles only)
--gut 32px (20px mobile)   --maxw 1024px
```
Rules from the chats: **light AND dark** (dark = visionOS frosted glass, base `#0d0d11`,
cards translucent + `backdrop-blur(40px)`, **never pure black**); **no white edge cast**
on glass; words over icons; hairlines over boxes; springy pops; theme persists.
Dark-mode toggle in the top bar; theme stored locally (later: per-user).

---

## 1. Shell & navigation (full-page surface)

The creator hub is a **full-page console** with its own chrome — not a panel inside the
editor's tab strip. Layout (top → bottom):

1. **`cr-top` frosted bar:** `‹ Community` back link (far left) · `{Course title}` crumb ·
   `Draft`/`Published` status pill (dot) · theme toggle (moon/sun) · **Publish** button.
   Lesson-editor styling. Back returns to the course editor.
2. **`HeroCover`:** full-bleed cover image with **drag-to-reposition (object-position)** +
   **click-to-replace (file picker)**. Overlaid: `SPAIRE ORIGINALS` eyebrow (→ org name),
   `{name}` title, `Hosted by {host}`. Hint: "Click to change · Drag to reposition".
3. **`mh-bar`:** `{N} members · {Live · accepting / Not published yet}` + **View as student**
   button (deep-links to the live portal community; inert-ish for now).
4. **`cr-tabs`:** Start · Feed · Activities · Events · Settings (underline-active).
5. **`content`** (max-width 1024).

Plus global: **toast** (2.4s), Esc-closes-modals, smooth-scroll-to-top on tab change.

**Mount decision (see §8):** replace `CommunityTab`/`CommunityPreview`; expose as a
full-page route entered from the editor's Community tab.

---

## 2. Shared atoms (build once, reuse)

| Atom | Purpose | Notes |
|---|---|---|
| `Field` | label + control + hint | — |
| `Seg` | Apple sliding-pill segmented control | white pill **slides** under active label; active label blue + blue underline; only position animates (no width transition) |
| `Toggle` | iOS switch | **blue** when on |
| `Ring` | SVG progress ring | blue stroke; .6s cubic-bezier; used by Start checklist |
| `CoverDrop` | form cover slot | upload (click/drag-drop) + **drag-to-reposition** → `center {pct}%`; "Add a cover / Click to replace / Drag to reposition" |
| `HeroCover` | masthead cover | same drag-reposition mechanic, larger |
| `DatePicker` | custom Apple calendar | month nav, today ring, `grid-column-start` offset (no empty cells), "Today ·" button |
| `TimePicker` | half-hour dropdown | auto-scrolls to selection |
| `ProviderSelect` + `ProviderLogo` | meeting provider picker | Zoom/Meet/Teams/Webex/Other; SVG logos transparent; placeholder adapts |
| `EpisodeSelect` | link activity → episode/module | thumbnail rows |
| `RichComposer` | shared composer (Feed + Activities) | text + photo + video + GIF + poll + emoji + event-link; removable previews |
| `PostExtras` | renders post video/gif/poll/event | poll = tappable bars + % + check |
| `EventAttach` | compact event card | in composer preview + published posts |
| `Popover` | scrim + frosted pop | gif/emoji/event pickers, menus |

Image-repositioning mechanic (the user stressed this): pointer-drag on a cover computes
`pct = clamp(base - dy/h*100)` and writes `object-position: center {pct}%`; a <3px move =
click → opens file picker. Position **persists into published cards/sheets/pages**. The
existing backend already has the columns: `hero_thumbnail_object_position`,
`community_activities.cover_object_position`, `community_activity_submissions.image_object_position`.

---

## 3. Tab specs + backend mapping

Legend: ✅ existing backend · 🟡 partial/enum-mismatch · 🔴 net-new backend · ⬜ frontend-only

### START  (frontend-only; derived state)
- 0/4 checklist Ring: **Post a welcome** (→Feed) · **Create an activity** · **Schedule a live moment** · **Publish**. Each done-state derives from real data (posts exist / activities exist / events exist / `settings.enabled`). ⬜/✅
- "Ready to open the doors" banner when complete; **At a glance** links (Feed first). ⬜
- Draft→Published drives header pill; **Publish** = set `settings.enabled = true`. 🟡 (lifecycle is just the `enabled` flag today; "Published" label is new but derivable)

### FEED  (`creator-feed.jsx`)
- RichComposer (posts **as host**). ✅ create post (`author_user_id`)
- Post card: avatar (host **no ring**), name + **blue verified seal**, role headline, time + visibility globe. ✅
- **Like + Comment ONLY** — single heart, fills when liked. No emoji dock, no repost/send. 🟡 maps onto `community_reactions` as a **single emoji** (`heart`); UI shows binary like, not 6-set. Settings "reactions" toggle still applies.
- Proof line: `{likes}` ❤ · `{n} comments`. ✅
- Threaded comments, **reply as Carla/host**; like comments. ✅ (`community_comments` + reactions)
- One-tap **pin** icon (fills blue, "Pinned to the top" label, floats to top) + in ••• menu. ✅ (`pin_type='announcement'`)
- ••• menu: Pin/Unpin · Copy link · **Feature this post** (members only) · **Remove**. 🟡 (pin/copy/remove ✅; "feature" is new — could map to a 2nd pin type or be cosmetic)
- Empty state: "Your feed is quiet — for now" + "Write a welcome post". ⬜
- Composer attachments — see §4 (poll/gif/video/emoji/event).

### ACTIVITIES  (`creator-app.jsx`)
- Empty state → round **+** → `ActivityForm` → published `ActivityCard` grid → click → **full `ActivityPage`**.
- Form: **CoverDrop** (✅ cover_url + cover_object_position) · "What you're asking members to do" (prompt → `description`, title) ✅ · **Submission format** Seg: Video/Photo/**Photo + note**/Text/Link 🟡 (backend has photo/video/text/link — "photo+note" is new) · **Link to an episode** (EpisodeSelect) ✅ (`channel_kind` module/lesson + module_id/lesson_id).
- Card: cover + format tag + episode tag + avatar stack + **{n} submissions**. ✅ (`submission_count`, `distinct_submitter_count`)
- **ActivityPage**: hero (cover, tags, prompt, count) + RichComposer + submissions rendered as **full feed posts** (reuse `CRFPost`) with photo + threaded comments. ✅ (`community_activity_submissions` + `_submission_comments`); submission video via Mux ✅.
- Format is a **label only**, not an upload restriction. ⬜

### EVENTS  (`creator-app.jsx`)
- Empty state → **+** → `EventForm` → `EventCard` (Upcoming/Past split) → click → `EventSheet`.
- Form: **CoverDrop** 🔴 (needs `cover_url`/`cover_object_position` — `community_events` has cover_url + cover_object_position ✅ actually present) · **Type** Seg Workshop/Q&A/Watch Party 🟡 (backend enum = workshop/office/cohort/guest — **mismatch, needs migration or mapping**) · Title ✅ · **DatePicker + TimePicker** ⬜ (→ `start_at` + `timezone`) · Duration ✅ (`duration_minutes`) · **Meeting provider + link** 🔴 (backend has `meeting_url` only — **no provider column**) · Description ✅.
- Card: cover + type tag + **provider logo** + date/title + "Join with {provider}" / past → dimmed + "Ended" + "View recap". 🟡
- `EventSheet`: cover, full date, "Hosted on {provider} · {dur}", description, **Join with {provider}**, url. 🟡
- (Existing backend also has RSVP, announcements, reminder emails, .ics — keep/wire.) ✅

### SETTINGS  (was "Frame")
- **Identity:** CoverDrop (✅) · Name 🔴 (no community name field — today it's `feed_title_override`; maps) · Tagline 🔴 (→ `feed_eyebrow_override` maps).
- **The masterclass:** linked course card + "View course". ✅
- **Posting & moderation:** Who can post (Everyone/Approved) 🔴 · Review first post from new members 🔴 · Members can comment 🟡 (`comments_mode`) · Reactions on posts ✅ (`reactions_enabled`) · Profanity filter 🔴.
- **Events:** Default meeting provider 🔴 · Members can RSVP 🔴 (toggle new; RSVP itself ✅).
- **Notifications:** Email me new submissions 🔴 · Email me new comments 🔴 · Weekly digest to members 🔴.
- **Danger zone:** Archive 🔴 · Delete 🔴.

---

## 4. Composer (shared, Feed + Activities) — `RichComposer`
text · **photo** (✅ image upload) · **video** (🟡 Mux exists, create schema blocks type=video) ·
**GIF** picker (🔴 store as media URL) · **poll** builder 2–4 opts (🔴 net-new storage + vote) ·
**emoji** insert (⬜) · **link event** → embeds `EventAttach`, opens sheet (✅ data, ⬜ embed).
Each attachment = removable preview; a post may carry text+media+poll+event together.

---

## 5. Gap summary (net-new backend, 🔴)

Heaviest, in rough effort order:
1. **Event meeting provider** (column + enum; logos) — small.
2. **Event type enum** Workshop/Q&A/Watch Party vs workshop/office/cohort/guest — migration or label-map — small.
3. **Photo+note** submission format — small (enum add) or treat as photo+body.
4. **Polls** (post storage + options + votes) — medium.
5. **GIF** attachment — small (media URL).
6. **Video posts** finish (unblock `type=video` schema) — small/medium.
7. **Settings**: who-can-post, review-first-post (moderation queue), profanity filter,
   default provider, member-RSVP toggle, email-on-submission/comment, weekly digest,
   archive/delete — **medium-large** (several are whole subsystems).
8. **Draft/Published** lifecycle label — derivable from `enabled` (small).

Everything else is ✅ existing or ⬜ frontend-only.

---

## 6. What is pure frontend (no backend) ⬜
Shell/nav/hero/tabs/theme, Start checklist, all Apple atoms (Seg/Toggle/Ring/Date/Time/
Provider/Episode pickers), image-reposition mechanic, empty states, toasts, emoji insert,
"View as student" deep-link, format-as-label.

---

## 7. Build order (per section, incremental)
1. **Foundation:** port `community.css` + `creator.css` into the codebase (scoped/modularized), build shared atoms, the shell (nav + HeroCover + tabs + theme + toast).
2. **Feed** (most-used; exercises composer + posts + comments + pin + reactions-as-like).
3. **Activities** (reuses composer + post card on the submissions page).
4. **Events** (date/time/provider pickers + sheet; needs the small backend additions).
5. **Settings** (grouped lists; gated on which net-new settings we build).
6. **Start** (derives from 2–5).
7. Net-new backend slices, wired per section as we reach them.

---

## 8. Open decisions (need user input before/at build)
- **Gap handling:** for 🔴 features — build backend **for real now**, or **UI-complete + stub wiring** and backend in a follow-up phase? (Recommend: build-real for the *small* ones; stub the *medium-large* moderation/digest/archive until a backend phase.)
- **Mount point:** full-page route entered from the editor Community tab (recommended), vs embedded inside the existing editor tab chrome.
- **Data world:** the prototype is tennis/"The Baseline". We wire to the real course/org — confirm copy like the `SPAIRE ORIGINALS` eyebrow → org name.
- **Reactions:** confirm Feed ships the design's **single Like** (not the 6-emoji set), with the `reactions_enabled` toggle still hiding it.
