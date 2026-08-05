# Plan — Mobile redesign of the Customer Portal & Course Player

**Status:** Phases 0–1 implemented (quick wins + navigation/shell); Phases 2–5 proposed
**Scope:** Everything under `/portal` (customer-facing), including the course home, the video player, and the text/quiz lesson viewer.
**North stars:** YouTube mobile (player, gestures, up-next, bottom-sheet everything) and Netflix mobile (course home, vertical episode lists, always-visible progress).

---

## 1. Where we are today (audit summary)

The portal currently runs on **three unrelated responsive systems**, and mobile is the loser in all three:

| Surface | Styling system | Breakpoints | Mobile story |
|---|---|---|---|
| Portal shell + native pages | Hand-written `.sp-*` CSS (`portal/portal.css`, ~1,600 lines) | 720px, 380px | Decent per-page, but nav is broken (see below) |
| Embedded widgets (Subscription, Team, Usage, Wallet, Seats) | Tailwind + `@spaire/ui` (`components/CustomerPortal/*`) | `sm/md/lg` (barely used) | Tables crush, fixed type, fragile dark mode |
| Course home + player + reading view | styled-jsx CSS (`Courses/watch/WatchPageStyles.tsx`, `WatchStyles.tsx`) + inline styles | 1200px, 820px, 560px | Desktop DOM reused on phones; hover-driven UX dead on touch |

### Concrete defects (found in the code, with locations)

**Shell & navigation**
- **D1 — No Settings / Log-out on mobile.** The account dropdown lives only behind the avatar (`_components/TopBar.tsx:392-449`), and `.sp-avatar { display: none }` at ≤720px (`portal.css:1116-1120`). `MobileTabBar` has no replacement. A phone user literally cannot sign out or open profile settings.
- **D2 — Bottom tab bar hardcoded to 5 columns.** `grid-template-columns: repeat(var(--sp-tabbar-cols, 5), 1fr)` (`portal.css:1035`); the variable is never set, so customers with 2–3 tabs get dead space on the right.
- **D3 — Team tab is desktop-only** (omitted from `MobileTabBar.buildTabs`, `MobileTabBar.tsx:150-208`) with no other mobile path to `/team`.
- **D4 — Two hand-maintained navs.** `TopBar.buildTabs` and `MobileTabBar.buildTabs` duplicate the tab logic and drift.

**Pages & widgets**
- **D5 — DataTables crush instead of scroll.** `DataTable` wraps a `table-fixed` table in `overflow-hidden` (`packages/ui/.../DataTable.tsx:126-132`). Affects Team members, Usage meters, subscription invoices, and seat management on any phone.
- **D6 — Non-wrapping form rows.** Add-member / invite rows are fixed horizontal flex (`CustomerPortalTeam.tsx:207`, `CustomerPortalSubscription.tsx:258`).
- **D7 — Fixed pixel widths**: notifications dropdown `width: 360` (`TopBar.tsx:540`) barely fits a 360px viewport; plan card (`sp-plan-card`) wraps awkwardly with no mobile rule.
- **D8 — Typography doesn't scale in embedded widgets** (`text-2xl`/`text-xl` with no responsive variants), clashing with the native pages that do scale.
- **D9 — Dark mode is three hacks stacked**: `.sp-dark` token remap, manual re-mapping of Tailwind gray utilities (`portal.css:1473-1540`), and imperative painting of `<html>/<body>` in a `useEffect` (`PortalShell.tsx:50-71`).

**Course home (`WatchHome`)**
- **D10 — Hover-driven browsing is dead on touch.** Hero focus is set via `onMouseEnter` (`WatchHome.tsx:1060,1087`); on a phone the hero is frozen and tapping a card immediately starts playback — there is no "browse" state.
- **D11 — Marquee hero hides progress and instructor below 1200/820px** (`WatchPageStyles.tsx:1040-1062`). Whether a phone user sees their progress depends on which hero variant the creator picked.
- **D12 — Horizontal lesson rail is the only lesson list.** At ≤560px cards are 82%-wide swipe cards — fine for 6 lessons, terrible for 40.

**Video player (`WatchPlayer`)**
- **D13 — One 820px media query that only adjusts padding** (`WatchStyles.tsx:931-941`). The desktop three-section transport bar is otherwise unchanged for a 5-inch screen.
- **D14 — No mobile gestures**: no double-tap seek, no swipe, no brightness/volume. Only scrub-bar touch drag exists (`WatchPlayer.tsx:282-303`).
- **D15 — No autoplay-next / up-next.** Completion fires `onComplete` and stops; nothing advances (`WatchPlayer.tsx:203-208`).
- **D16 — No PiP, no orientation handling**, keyboard shortcuts only (`WatchPlayer.tsx:305-325`).

**Reading view (`MasterClassLessonViewer`)**
- The only surface with a real mobile layout (`renderMobileLessonViewer`, `:1366-2038`) — but:
- **D17 — No prev/next lesson buttons anywhere** (desktop or mobile); navigation is only via the "All Lessons" list.
- **D18 — Only the first attachment is surfaced** in the reading view (`firstAttachment`, `:1967-2024`); the rest exist only in the video-home Overview sheet.
- **D19 — Two divergent video experiences**: inline native-controls `HlsVideo` for text lessons vs. custom-chrome `WatchPlayer` for video lessons.
- **D20 — Desktop/mobile split is a JS UA+width check** (`useIsMobile`, 768px) that swaps entire render trees — SSR paints desktop first, and a narrow desktop window still gets the two-column grid.

---

## 2. Design principles (borrowed from YouTube / Netflix mobile)

1. **One column, edge-to-edge media.** Video and hero imagery bleed full-width; everything else lives in a single scrolling column with 16px gutters.
2. **Bottom sheets, not dropdowns/drawers.** Every secondary surface (account menu, comments, lesson outline, resources, notifications) is a swipe-dismissable bottom sheet on mobile. One shared `<PortalSheet>` primitive.
3. **Thumb-zone navigation.** Primary nav is a bottom tab bar (we have one — it needs fixing), destructive/secondary actions at the top. Minimum 44×44px touch targets everywhere.
4. **Browse ≠ play (Netflix).** Tapping a card focuses/expands it; an explicit ▶ affordance starts playback. Progress bars are always visible on cards and hero — never hidden by a breakpoint.
5. **The player is a gesture surface (YouTube).** Double-tap edges to seek ±10s, tap to toggle chrome, swipe-down to dismiss/minimize, rotate for fullscreen, up-next countdown at the end.
6. **Vertical lists for long content.** Horizontal rails are for discovery (few items); lesson curricula are vertical lists with thumbnails, durations, and state (YouTube playlist / Netflix episode list).
7. **Progressive disclosure.** Dense desktop tables become stacked summary cards on mobile with tap-to-expand detail — never a horizontally-crushed table.
8. **CSS-first responsiveness.** Layouts adapt via container/media queries, not UA-sniffed tree swaps, so SSR is correct and narrow desktop windows behave.

---

## 3. The redesign, surface by surface

### 3.1 Portal shell & navigation

**Bottom tab bar (the fix for D1–D4):**
- Restructure to **4 fixed slots + "You"**, YouTube-style: `Overview · Courses · Community* · Billing* · You` (starred = conditional). The **"You" tab** (avatar icon) opens a full-screen/bottom-sheet profile hub containing: profile settings, **Team**, Wallet, Usage, Bookmarks, Downloads, notifications, theme toggle, **Log out** — everything currently trapped behind the desktop avatar dropdown. This resolves D1 and D3 in one move and gives overflow items a permanent mobile home.
- Set `--sp-tabbar-cols` from `tabs.length` in `MobileTabBar.tsx` (D2 — one-line fix, do it first).
- **Unify tab-building**: extract a single `usePortalTabs()` hook (permissions, feature flags, labels, icons) consumed by both `TopBar` and `MobileTabBar` (D4).
- Tab bar polish: frosted translucent background, `env(safe-area-inset-bottom)` padding (already present, keep), active-tab tint from `--sp-accent`, hide-on-scroll-down / reveal-on-scroll-up (mirror the existing `useHideOnScroll` used by the top bar).

**Mobile top bar:** slims to brand + notifications bell only (bell opens a bottom sheet instead of the fixed-360px dropdown — D7). Contextual pages get a back arrow + title.

**New shared primitive:** `_components/PortalSheet.tsx` — a bottom sheet (drag handle, snap points, scroll lock, safe-area aware) used by: account/"You" hub, notifications, comments, lesson outline, resources, and the order/invoice detail. This is the single biggest lever for making the whole portal feel native.

### 3.2 Portal pages (Overview, Courses, Orders, Billing, Usage, Team, Wallet)

- **Overview:** keep the greeting + stats (2×2 grid at ≤720px already works). "Continue watching" becomes a Netflix-style horizontal rail of wide cards **with always-visible progress bars**; "Manage" links become full-width tappable list rows (chevron right), not small links.
- **Kill crushed tables (D5) with a responsive list pattern**, not horizontal scroll: add a card/list renderer to the embedded widgets at ≤720px —
  - *Team members*: stacked rows — avatar, name/email, role badge, overflow-menu (⋮) for actions.
  - *Usage meters*: one card per meter — name on top, Consumed/Credited/Balance as a 3-up mini-stat row.
  - *Invoices*: row = date + amount + status chip; tap opens detail sheet.
  - *Seat management*: same stacked-row treatment.
  - Implement as a `mobileCard` render prop on `DataTable` (or a sibling `<DataList>`), and additionally wrap the desktop table in `overflow-x-auto` as a safety net.
- **Forms (D6):** all input+button rows become `flex-col sm:flex-row`; buttons full-width on mobile.
- **Orders/"Enrollments":** the expandable row pattern survives, but the expanded detail opens as a bottom sheet on mobile instead of pushing the accordion open.
- **Billing:** `sp-plan-card` gets a real ≤720px rule — plan info stacks above two full-width action buttons; payment methods are already 1-col (keep).
- **Typography (D8):** add a small fluid type scale to `portal.css` tokens (`--sp-fs-title: clamp(24px, 5vw, 30px)` etc.) and give embedded widget headings responsive variants (`text-xl md:text-2xl`) so both worlds match.

### 3.3 Course home (`WatchHome`) — Netflix mobile treatment

Add a real ≤720px layout (CSS-first, same component):
- **Hero → poster card**: full-width image (2:3 or 16:9 depending on art), title, meta line, and **two stacked full-width buttons**: primary `▶ Resume — Lesson 4 · 12:30 left` and secondary `Overview`. The progress bar sits directly under the Resume button and is **never hidden** — this fixes D11 by making the mobile hero variant-independent (cover vs marquee collapse to the same mobile hero).
- **Lesson rail → vertical episode list (D12)**: Netflix episodes pattern — each row is a 116×70 thumbnail (reuse the reading view's row design, `MasterClassLessonViewer.tsx:1692-1883`), title, duration, per-lesson progress bar, downloaded/locked/completed state. Module headers group the list. The horizontal rail remains desktop-only.
- **Touch semantics (D10):** on mobile, tapping a row plays (rows are explicit enough); the hero "browse focus" concept simply doesn't exist on mobile — remove the dependency on `onMouseEnter`. On desktop, add `onFocus` for keyboard parity while we're in there.
- Overview sheet and comments panel both move onto the shared `PortalSheet`.

### 3.4 Video player (`WatchPlayer`) — YouTube mobile treatment

This is the deepest work. Target behavior on phones:

- **Layout**: portrait = 16:9 letterboxed video pinned to top of a black fullscreen surface; controls redesigned for small screens: center cluster `⏪10 · ⏯ · 10⏩` (56px targets), scrub bar full-width at the bottom with times at the ends, top row = down-chevron (dismiss), lesson title, ⋮ overflow (captions, speed, quality → bottom sheet).
- **Gestures (D14)**:
  - single tap → toggle chrome (exists via `revealUi`, formalize as toggle)
  - **double-tap left/right thirds → ±10s** with YouTube-style ripple indicator
  - swipe down → dismiss player (return to course home, position saved — the save/flush plumbing at `WatchPlayer.tsx:491-562` already exists)
  - long-press → 2× speed while held (stretch goal)
- **Orientation (D16)**: on rotate to landscape, auto-enter fullscreen (keep the existing iOS `webkitEnterFullscreen` fallback, `WatchPlayer.tsx:232-257`); offer an explicit rotate-to-fullscreen button in portrait.
- **Up next (D15)**: at `onComplete` (≥97%), show an up-next card — next lesson thumbnail + title + 5s countdown ring + `Cancel`. Autoplays the next unlocked lesson; at course end shows a completion card. Add **prev/next buttons** in the chrome (`⏮ ⏭`) — this also resolves D17 for video lessons.
- **Lesson outline in-player**: a "Lessons" button opens the vertical episode list (same component as 3.3) as a bottom sheet, so users can jump lessons without leaving the player — YouTube's playlist sheet.
- **Comments**: `CommentsPanel` becomes a bottom sheet in portrait (right-side drawer stays for landscape/desktop).
- **PiP**: expose `video.requestPictureInPicture()` where supported (progressive enhancement; low effort since we control the `<video>` in `HlsVideo.tsx`).

### 3.5 Reading view (`MasterClassLessonViewer`)

Its mobile layout is the best in the codebase — evolve, don't rewrite:
- **Add sticky prev/next footer (D17)**: `← Previous · Mark complete / Continue →` pinned above the safe-area inset. "Continue" = the `nextUpId` already computed at `:946-956`.
- **Show all attachments (D18)**: replace the single "Class Guide" card with a Resources list (type/size labels already exist in `WatchHome.lessonOverview`, `:134-171` — reuse).
- **Sticky mini-video**: when scrolling past the video, shrink it to a docked mini-player top-right (YouTube-style) so notes/comments can be read while watching. (Stretch goal — Phase 4.)
- **Unify video surfaces (D19)**: text-lesson inline video adopts the same `WatchPlayer` chrome (or at minimum the same custom controls skin) instead of native controls.
- **Replace the UA tree-swap (D20)** with CSS: collapse `.lesson-grid` (`gridTemplateColumns: 'minmax(0,1fr) 380px'`) to one column at ≤820px via a media query; keep `useIsMobile` only for genuinely behavioral differences (sheets vs. sidebars). This makes SSR paint correctly and fixes narrow desktop windows.

### 3.6 Cross-cutting foundation

- **One breakpoint contract**: standardize on `560 / 720 / 820 / 1200` (already the de-facto union) and document them as `--sp-bp-*` tokens in `portal.css`. All three systems reference the same numbers.
- **Touch targets**: audit for 44px minimum (tab bar items, chips, player buttons, ⋮ menus).
- **Safe areas**: `env(safe-area-inset-*)` on tab bar (done), player chrome, sheets, and sticky footers.
- **Dark mode (D9)** — contain, don't boil the ocean: keep `.sp-dark` tokens as the source of truth; migrate embedded widgets from raw gray utilities to `--sp-*`-token-backed classes as they're touched in Phase 2, shrinking the manual utility-remap block over time. The imperative `<html>/<body>` painting stays for now (it works) with a TODO.
- **Performance**: lesson list rows virtualized above ~50 lessons; hero images `srcset`-sized; keep `hls.js` dynamic import.

---

## 4. Phased delivery

Each phase ships independently and is verifiable on a device.

**Phase 0 — Quick wins (bug-level, ~1 PR)**
1. `--sp-tabbar-cols` set from tab count (D2).
2. Wrap all four DataTables in `overflow-x-auto` as a stopgap (D5).
3. `flex-col sm:flex-row` on the two form rows (D6).
4. `sp-plan-card` mobile rule; notifications dropdown `max-width: calc(100vw - 24px)` (D7).

**Phase 1 — Navigation & shell (unblocks everything)**
1. `usePortalTabs()` shared hook (D4).
2. `PortalSheet` primitive.
3. "You" tab + profile hub sheet: settings, Team, Wallet, Usage, Bookmarks, Downloads, theme, **log out** (D1, D3).
4. Notifications → bottom sheet; tab-bar polish (hide-on-scroll, active tint).

**Phase 2 — Portal pages**
1. `DataTable` mobile card renderer (`mobileCard` prop / `DataList`); apply to Team, Usage, invoices, seats (D5 properly).
2. Overview rails + list-row "Manage" links; Orders detail as sheet; Billing stacking.
3. Fluid type tokens; widget heading variants (D8); start token-migration of touched widgets (D9).

**Phase 3 — Course home (Netflix pass)**
1. Mobile hero (poster + stacked Resume/Overview + permanent progress) for both hero variants (D10, D11).
2. Vertical episode list with module grouping, progress, lock states (D12) — built as a shared `<LessonList>` used by course home, player sheet, and reading view.
3. Overview/comments onto `PortalSheet`.

**Phase 4 — Player (YouTube pass)**
1. Mobile control layout + 44px targets (D13).
2. Double-tap seek, tap-toggle chrome, swipe-down dismiss (D14).
3. Up-next autoplay card + prev/next buttons (D15, D17-video).
4. Landscape/fullscreen-on-rotate; PiP button (D16).
5. In-player lesson sheet (uses `<LessonList>`).

**Phase 5 — Reading view & unification**
1. Sticky prev/next footer (D17); all attachments (D18).
2. CSS-collapse of `.lesson-grid`, shrink `useIsMobile` usage (D20).
3. Unified video chrome for inline lessons (D19); sticky mini-video (stretch).

**Verification per phase:** Playwright viewport runs at 360×800 and 390×844 (portrait) + 844×390 (landscape, player phases), plus manual device pass for gestures/safe-areas/fullscreen (emulators lie about `webkitEnterFullscreen` and notches).

---

## 5. Key files touched (map)

| Area | Files |
|---|---|
| Shell/nav | `portal/PortalShell.tsx`, `portal/_components/TopBar.tsx`, `portal/_components/MobileTabBar.tsx`, `portal/portal.css`, new `_components/PortalSheet.tsx`, new `_components/usePortalTabs.ts` |
| Widgets | `components/CustomerPortal/{CustomerPortalTeam,CustomerUsage,CustomerPortalSubscription,SeatManagementTable}.tsx`, `packages/ui/.../DataTable.tsx` |
| Pages | `portal/{overview,orders,settings,courses}/…Page.tsx` |
| Course home | `components/Courses/watch/{WatchHome,WatchPageStyles}.tsx`, new shared `LessonList` |
| Player | `components/Courses/watch/{WatchPlayer,WatchStyles,WatchSheets}.tsx`, `components/Courses/HlsVideo.tsx` |
| Reading view | `portal/courses/[courseId]/{LessonViewerPage,MasterClassLessonViewer}.tsx`, `utils/mobile.ts` |

## 6. Out of scope (explicitly)

- Public pre-purchase storefront (`PublicPortalView` / `GeneratedPortalPage`) — separate surface, separate pass.
- Offline downloads / native-app features.
- Full dark-mode re-architecture (contained incremental migration only).
- Backend/API changes — everything here is frontend; the progress-sync and comments APIs already support the plan.
