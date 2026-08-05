# Course Editor Audit — Technical Appendix

Full-trace audit of the course editor (UI → hooks → API → service → worker → student portal),
covering Outline, Landing, Community, Automations, Settings, Auth, Pricing, Customers, and the
episode/video upload pipeline. Each finding is classified:

- **WORKS** — wired to a real backend, persists, round-trips correctly
- **BROKEN** — wired but buggy
- **FAKE** — UI exists but does nothing / hardcoded / backend missing or field never read
- **INCONSISTENT** — works, but behaves differently from what the UI implies or differs between surfaces

Paths are relative to repo root. Frontend = `clients/apps/web/src`, backend = `server/polar`.

---

## 1. Episode / video upload pipeline (Mux)

### Replace flow (core complaint — confirmed)

1. **BROKEN** — Replacing a video never deletes/detaches the old Mux asset. "Replace" goes straight to `createMuxUpload`; `useRemoveLessonVideo` is instantiated but never invoked. Server overwrites `mux_upload_id`, leaves `mux_asset_id`/`mux_playback_id`/`duration_seconds` intact, never enqueues `course.mux_delete_asset`. Every replace orphans the previous asset (billed forever). — `editor/LessonEditorV2.tsx:250-284,502-505`; `hooks/queries/courses.ts:891-899`; `server/polar/course/endpoints.py:598-663`; cleanup exists only in `service.py:481-506` (`clear_lesson_video`, no UI caller).
2. **BROKEN** — Video-hours quota inflates permanently on every replace. Webhook adds new duration (`endpoints.py:1216-1226`); old duration only subtracted in the `video.asset.deleted` branch (`endpoints.py:1298-1324`), which never fires (asset never deleted) and couldn't match anyway (looks up by already-overwritten `mux_upload_id`, `endpoints.py:1043-1049`). Replacing a 30-min video 5× counts 150 min → eventual 402 quota wall (`endpoints.py:632-642`) with no way to reclaim.
3. **BROKEN** — Quota also never freed on Remove Video or Delete Lesson: `clear_lesson_video` nulls `mux_upload_id` before the webhook arrives; `delete_lesson` soft-deletes the row which `_find_lesson_by_upload` filters out — the negative quota emit is dead code in every real flow. — `service.py:496-520`, `endpoints.py:1043-1049,1298-1324`.
4. **BROKEN** — No progress/processing indicator during replace; the OLD video stays fully live. `processing` requires `!lesson.mux_playback_id` (`LessonEditorV2.tsx:150-153`), still set on replace, so the badge shows the old duration and Play plays the old video during the entire upload+transcode. The comment in `useCreateMuxUpload` (`courses.ts:881-888`) claiming invalidation fixes this is wrong.
5. **INCONSISTENT** — After replace, editor shows old video/duration/thumbnail until webhook + 5s poll; thumbnail is never auto-refreshed from the new asset.
6. **BROKEN** — Replacing while a previous upload is still processing orphans that asset silently: webhook for upload A arrives after `mux_upload_id` was overwritten with B → lookup returns None → asset A never attached, never deleted (`endpoints.py:1079-1115`). First XHR is never aborted (no `xhr.abort()`, `LessonEditorV2.tsx:263-276`).
7. **BROKEN** — No upload cancellation at all (no abort handle client-side; no Mux cancel call in `mux.py`). Navigating away mid-upload leaves `mux_status='waiting'` forever → the 5s poll (`courses.ts:334-358`) runs indefinitely.

### Success/error signaling

8. **FAKE** — "Video uploaded — processing now" toast fires on HTTP failure: `xhr.onload` resolves without checking `xhr.status` (`LessonEditorV2.tsx:269-272`).
9. **BROKEN** — Mux processing errors never reach the UI: webhook sets `mux_status='errored'` (`endpoints.py:1228-1248`) but no client code handles `'errored'`/`'quota_exceeded'`. Editor shows "Processing…" forever; after reload the tile reverts to empty. Poller never stops.
10. **BROKEN** — `quota_exceeded` invisible to the creator while the portal refuses playback for students (`customer_portal/endpoints/courses.py:620-623`).
11. **BROKEN** — Upload-init errors (402 quota detail, 503 Mux unconfigured) collapsed to generic "Video upload failed" (`LessonEditorV2.tsx:278-281`).
12. **BROKEN** — No webhook fallback: `get_asset_by_upload` defined and never called (`mux.py:144-157`); no cron reconciles `mux_status`.
13. **FAKE** — Advertised "local preview while transcoding" doesn't exist: `localVideoUrl` created/revoked but never rendered (`LessonEditorV2.tsx:6,143,155-167,257-259`); also never cleared if upload errors.
14. **FAKE/INCONSISTENT** — Captions row shows "Ready" the moment video is ready (`ready={!processing && captions}`, `LessonEditorV2.tsx:526-534,974-1008`) regardless of real caption/transcript state (`transcript_status` never rendered; the "outline transcription chip" referenced in `courses.ts:346-348` was removed, see `assistant/flag.ts:5`).

### Playback

15. **BROKEN (when Mux signing keys configured)** — Editor Play can't play signed assets: uploads are `playback_policy='signed'` (`mux.py:41`) but `LessonEditorV2.tsx:873-885` passes only the playback id and `HlsVideo.tsx:73-75` builds an unsigned URL → 403. Same defect: `SeriesSampleBlock.tsx:115-117,563-567` editor preview, public free previews `PublicPortalView.tsx:559-566` (also bypasses view-quota metering), unsigned `image.mux.com` thumbnails in `MasterClassLessonViewer.tsx:331,355,981,1725` and `email-marketing/.../courseMap.ts:16`. No dashboard playback-mint endpoint exists (portal has one: `customer_portal/endpoints/courses.py:590-655`).
16. **FAKE** — HlsVideo "Try again" doesn't retry: only clears `fatalError`; bootstrap effect keys on unchanged `[src]` (`HlsVideo.tsx:104-181`).

### Misc

17. **INCONSISTENT** — Outline cards show no upload/processing/errored state at all (`OutlineTab.tsx:101-106,218-222`).
18. **BROKEN** — "Discard empty new lesson" prompt can delete a lesson whose video is mid-upload (`lessonLooksEmpty` keys on `!mux_playback_id`, `CourseEditor.tsx:100-119`); cleanup only enqueues when `mux_asset_id` set (`service.py:516-519`) → orphaned asset.
19. **INCONSISTENT** — Replace/remove leaves the OLD transcript live (`transcript`, `transcript_cues`, `transcript_status` never cleared — `endpoints.py:650-658`, `service.py:496-506`); Course Assistant keeps citing the previous video.
20. **WORKS** — Lesson + course thumbnail upload (content-addressed paths defeat caching) and ThumbnailPositioner drag — `endpoints.py:666-750`, `ThumbnailPositioner.tsx:39-158`.
21. **BROKEN** — Course trailer replace serves stale video from cache: fixed key `course-trailers/{course_id}.{ext}` (`endpoints.py:784`) — the exact pattern the thumbnail endpoints fixed (`endpoints.py:697-699`).
22. **Minor** — S3 orphans accumulate on replace (thumbnails, landing media, staging media) — `endpoints.py:585-588,700-704,833-836`. Attachment delete does clean up (`endpoints.py:928-933`).
23. **FAKE/dead** — Entire wizard staged-upload path has no UI: `POST /courses/staging/mux-upload` (`endpoints.py:473-532`), `/courses/staging/media` (`:535-589`), `useStageMuxUpload`/`useStageOrgMedia` (`courses.ts:904-936`), `CourseLessonCreate.mux_upload_id` plumbing — zero call sites.
24. **Minor** — `video.asset.errored` falls back to asset id as upload id (`endpoints.py:1229`); `video.asset.deleted` leaves `mux_upload_id` set with status `deleted` → permanent 5s poll.
25. **WORKS** — First-upload happy path end-to-end (quota gate → XHR with real progress → webhook attach → captions request → portal signed mint with quota refusal). Asset cleanup on lesson delete works when asset was ready (`service.py:508-520`, `tasks.py:17-25`, `mux.py:189-206`).

---

## 2. Outline tab

### WORKS
1. Lesson drag-reorder persists — `OutlineTab.tsx:591-611`, `courses.ts:639-655`, `endpoints.py:451-467`, `service.py:522-536`.
2. Publish/Unpublish persists; published-cap enforced; portal genuinely hides unpublished — `LessonOptionsMenu.tsx:93-100`, `LessonEditorV2.tsx:339-358`, `service.py:459-473`, `customer_portal/endpoints/courses.py:159,237-239,1084-1086`.
3. Draft/scheduled/drip gating real server-side (content stripped, playback blocked) — `customer_portal/endpoints/courses.py:84-268,1129-1158`, `service.py:1047-1109`.
4. "Make free preview" persists; bypasses drip and paywall — `LessonOptionsMenu.tsx:116-125`, `service.py:1089`, `courses.py:820-829`.
5. Lesson-level schedule menu persists; entitlement-gated server-side — `LessonOptionsMenu.tsx:175-329`, `CourseEditor.tsx:348-373`, `service.py:444-457`.
6. Module add/rename/delete — `OutlineTab.tsx:721-827`, `CourseEditor.tsx:235-285`, `endpoints.py:263-303`.
7. Add/delete lesson (delete enqueues Mux cleanup) — `CourseEditor.tsx:195-233,385-402`, `service.py:368-409,508-520`.
8. Preview button mints real sandboxed preview session — `OutlineTab.tsx:339-352`, `endpoints.py:940-1017`.
9. Badges driven by real fields; search filter; empty states; Mux status polling.

### BROKEN
10. Module-level schedule NOT entitlement-gated server-side (`update_module`/`add_module` accept drip with no `require_feature`, `service.py:295-338`) — frontend gate is the only barrier; `ScheduleMenu.tsx:25-29` comment is false.
11. Unsaved-changes guard is dead: `lessonDirty` never set true; QuizDetail silently discards unsaved edits on navigation — `CourseEditor.tsx:70-84,143-149,375-383`.
12. A graded short-answer question disables quiz Save forever with no message (`isAnyGradedAnswerable` requires a correct option; short answers have none; new questions default graded) — `QuizDetail.tsx:57-64,222-224,278`.
13. Quiz Save clobbers sibling `content` keys: `loadQuiz` rebuilds content without `attachments`; save PATCHes whole blob → previously uploaded attachments wiped — `QuizDetail.tsx:66-85,214-220`, `service.py:434-473`.
14. No optimistic update on reorder — card order snaps back until refetch — `OutlineTab.tsx:591-611`, `CourseEditor.tsx:287-297`.
15. Quiz correct answers shipped to students: `_serialize_lesson` returns full quiz content incl. `is_correct` + explanations; `QuizAttemptResult` always returns `correct_option_ids` even with `hide_answers_on_results` (client-side hide only) — `customer_portal/endpoints/courses.py:112-114,562-586`, `QuizPlayer.tsx:137`.

### FAKE
16. Quiz "Results" tab is a permanent empty state — backend never persists quiz attempts (`submit_quiz_attempt` grades in-memory, writes only lesson-complete) — `QuizDetail.tsx:352-364`, `customer_portal/endpoints/courses.py:509-586`.
17. "Send email to member with link to results" persists a flag no server code reads — `QuizDetail.tsx:641-645`.
18. Short-answer questions: students get no input rendered at all; nothing stored — `QuizDetail.tsx:535-540`, `QuizPlayer.tsx:70-75,227-231`.
19. Quiz thumbnail "Image upload coming soon"; question/option `image_url` fields have no UI — `QuizDetail.tsx:579-604`.
20. Quiz lessons cannot be created from the UI — no call site passes `'quiz'` — `OutlineTab.tsx:41,643`, `CourseEditor.tsx:195-219,385-402`.
21. Module `status` ("draft") is dead — no UI, no backend gate — `schemas.py:140,149,161`.
22. `RichTextEditor.tsx` imported nowhere; lesson body is a plain textarea — `LessonEditorV2.tsx:697-713`.
23. `transcript_status` polled every 5s for a chip that was removed — `courses.ts:343-357`, `assistant/flag.ts:5`.

### INCONSISTENT
24. Editor paywall split counts DRAFT lessons; landing slices published-only — `OutlineTab.tsx:371-394` vs `courses.py:791-829`.
25. Lesson numbering disagrees: outline "Ep N" = global incl. drafts; editor header = per-module; watch page = published-only — `OutlineTab.tsx:354-364`, `LessonEditorV2.tsx:417-420`, `WatchHome.tsx:524,972-1004`.
26. Modules invisible to enrolled students (watch page renders flat rail) — `LessonViewerPage.tsx:70-92,217-229`, `WatchHome.tsx:824-1016`.
27. Drip badge precedence mismatch (badge keys on `drip_days`; backend prefers `release_at`) — `OutlineTab.tsx:194-206` vs `service.py:1047-1060`.
28. "Members Only" lock implies gating that doesn't apply to enrolled students; module-list omits locked lessons while flat list includes them — `courses.py:132-143,159-268`.
29. Quiz Draft/Published pill toggles instantly but persists only on Save — `QuizDetail.tsx:250-267,111-117`.
30. Discussion toggle collapses `comments_mode` ('locked' displays as ON and round-trips destroyed) — `LessonEditorV2.tsx:133-135,244-248`.
31. Entitlement gate flashes upgrade wall while subscription query loads — `entitlements.ts:88-89`, `CourseEditor.tsx:179-181`.
32. Header "N lessons" counts drafts; portal counts published — `CourseHeader.tsx:54-58`.

### Misc
33. Preview fallback opens portal URL without session token on error (login wall), no toast — `OutlineTab.tsx:339-352`, `QuizDetail.tsx:226-239`.
34. Best-effort discard of abandoned lesson swallows failures — `CourseEditor.tsx:132-139`.
35. `list_courses_by_organization` silently drops courses on serialization errors — `endpoints.py:166-178`.
36. Cross-module lesson drag impossible (per-module DndContext) — `OutlineTab.tsx:662-677`.
37. No lesson duplicate feature — `LessonOptionsMenu.tsx:87-137`.
38. Debounced autosave (600ms) has no flush on unload — `LessonEditorV2.tsx:169-203`.

---

## 3. Landing tab (heroes, lesson cards, preview vs public)

Architecture: editor preview (`CustomizeTab.tsx` → `CourseDesignEditor.tsx:790`) and public page (`ProductLandingPage.tsx:95` → `PublicPortalView.tsx:418`) share `GeneratedPortalPage.tsx`; drift comes from props each host passes. `CoverHero.tsx`/`MarqueeHero.tsx`/`SpotlightLessonCard.tsx`/`CatalogCard.tsx` are static clones used only by wizard pickers + `/embed/*` demos.

### Lesson cards
1. **BROKEN** — Per-lesson thumbnail reposition saved + shown in editor but ignored on public landing: `CourseLandingLesson` omits the field and `toGenerated` never sets `imagePosition` — `CourseDesignEditor.tsx:250,272`, `courses.py:102-104` (API returns it), `courses.ts:758-773`, `PublicPortalView.tsx:352-363`, `GeneratedPortalPage.tsx:1082/1182`.
2. **INCONSISTENT** — Lock/free chips: editor computes locks positionally over ALL lessons; public honors `is_free_preview` over PUBLISHED only — `CourseDesignEditor.tsx:214-222` vs `PublicPortalView.tsx:142-146`, `courses.py:808-828`.
3. **INCONSISTENT** — Editor counts/durations include unpublished lessons; public counts published only — `CourseDesignEditor.tsx:205-235` vs `courses.py:797-801,930`.
4. **INCONSISTENT** — Empty modules render in editor, skipped publicly → "Module N" numbering shifts — `PublicPortalView.tsx:375-386`, `GeneratedPortalPage.tsx:2112`.
5. **WORKS** — `lesson_card_variant` persists and drives editor+public+portal identically.
6. **INCONSISTENT** — LessonCardPicker previews clone components whose CSS differs from shipped cards — `SpotlightLessonCard.tsx` vs `GeneratedPortalPage.tsx:3624-3701,2516-2540`.
7. **FAKE (no UI)** — Hero style and card style cannot be changed after the wizard; backend PATCH accepts both (`schemas.py:221-222`) but no editor control sends them.
8. **FAKE** — Pickers persist to localStorage keys nothing reads — `HeroPicker.tsx:94-102`, `LessonCardPicker.tsx:67-75`.
9. **INCONSISTENT** — Picker defaults ('Spotlight'/'Marquee') differ from fallbacks everywhere else ('catalog'/'cover').

### Cover vs Marquee hero
10. **INCONSISTENT** — Field asymmetry: Marquee renders eyebrow/title/desc/byline/badges/freeLine; Cover renders badge/titleLines/desc/hardcoded "— With {instructor}". Marquee ignores `ai_hero.titleLines` entirely (`GeneratedPortalPage.tsx:1355`); edits on one variant invisible on the other — `GeneratedPortalPage.tsx:1342-1650`.
11. **INCONSISTENT** — Headline editing writes different fields per variant (cover → `ai_hero.titleLines`; marquee → `course.title`) — `CourseDesignEditor.tsx:499-524`.
12. **INCONSISTENT** — Default crop differs ('center 18%' vs 'center') — `GeneratedPortalPage.tsx:1302,1504`.
13. **FAKE** — Cover hero meta hardcodes "All levels" (`:1563`); marquee hardcodes current year (`:1393`).
14. **INCONSISTENT** — Picker previews advertise CTAs ("Play Lesson 1 Free", "Enroll · $79") the real page doesn't have (always "Play Trailer"); `CoverHero.tsx:151` mirrors art; standalone marquee typography differs.

### CTAs / pricing display
15. **FAKE (dead props)** — `playLabel`/`freeLessons`/`playStartsSample` declared but never read by `GeneratedPortalPage` (`:242-243,259`); both hosts compute them carefully; hero CTA is always literal "Play Trailer".
16. **BROKEN** — No trailer uploaded: marquee "Play Trailer" actually plays a free lesson; cover hero hides the button leaving NO play affordance in the hero — `GeneratedPortalPage.tsx:493-498`, `PublicPortalView.tsx:297-303,470-473`.
17. **INCONSISTENT** — Editor never passes `showTrailerButton` (defaults true) — preview shows buttons the public page may hide.
18. **BROKEN** — `formatProductPrice` hardcodes `$`, ignores `price_currency` (`courseLandingPrice.ts:19-22`); enroll-sheet price regex-parsed from label (`GeneratedPortalPage.tsx:483`) — PWYW shows no price.
19. **WORKS** — buy label / enrollPriceSub / checkout wiring.

### Cover image / theme / sample / text blocks
20. **WORKS** — Customize-tab cover upload + drag-reposition (debounced PATCH, undo, server-validated, applied publicly).
21. **BROKEN-ish** — SettingsTab's ThumbnailPositioner doesn't wire `onCommit`; drag-and-leave loses the change unless Save clicked — `SettingsTab.tsx:297-301,159-168`.
22. **INCONSISTENT** — Two opposite drag conventions for the same field (positioner vs GPP canvas) — `GeneratedPortalPage.tsx:625-641`.
23. **WORKS** — Sample block save/clear + gated minting + clip playback — `SeriesSampleBlock.tsx:371-406`, `courses.py:870-908`.
24. **BROKEN** — Sample popover save/clear failures only `console.error` — `SeriesSampleBlock.tsx:391,404`.
25. **FAKE** — Stale header docs; `SampleSettingsModal` used only by demo route.
26. **INCONSISTENT** — Sample section renders only when `paywall_enabled && trial_mode==='lesson_sample' && samplePlayable`; configurable-but-never-visible with no warning — `GeneratedPortalPage.tsx:491-492`.
27. **WORKS** — All EditText landing fields (hero copy, instructor, FAQ, badges, portrait + position, avatar, section visibility) round-trip with optimistic write + rollback + undo — `useLandingEditor.ts`, `landing.py:35-57`, `PublicPortalView.tsx:306-322,442,450-463`.
28. **INCONSISTENT** — Instructor name fallback differs (public → org name, editor → empty).
29. **FAKE** — `instructor_name_italic/bold/uppercase` stored/served, never rendered — `CourseWizard.tsx:400-402`, `courses.py:919-921`.
30. **FAKE** — `LandingOverrides.text/media/order/theme/textFormat/spacingBefore/ai_landing` (incl. LandingTheme system) never written/read — `courses.ts:215-232`.
31. **FAKE (dead pipeline)** — `landing-style.ts` (SHARED_STYLEBOOK, `normalizeLandingCardinality`) and AI routes `courses/landing/route.ts` + `landing-rewrite/route.ts` have zero callers; the "✨ Rewrite" control described doesn't exist.
32. **WORKS** — Theme toggle persists `theme_mode`; public + portal apply it.
33. **BROKEN** — Course creation reads theme from app-global `localStorage['spaire_theme']` (written by unrelated tools); `WizardPortalPreview` screen is unreachable dead code — `CourseWizard.tsx:374-380,645-687`.
34. **INCONSISTENT** — Enrolled portal ignores per-lesson `thumbnail_object_position` and smears course cover onto tiles without thumbnails, contradicting GPP's media rule — `WatchHome.tsx:877-884` vs `GeneratedPortalPage.tsx:22-25`; also ignores `landing_overrides.visible`.

---

## 4. Pricing tab

### Critical
1. **FAKE** — Editing the price amount in EditPricingModal silently does nothing: form seeds each price's `id` (`EditPricingModal.tsx:44`); MoneyInput sets amount without clearing id (`CourseWizard.steps.tsx:2339-2343`); backend parses any object with `id` as `ExistingProductPrice` (extra fields ignored — `product/schemas.py:460-472`, `product/service.py:557-566`). "Pricing updated" toast shows; charge unchanged. (The real product form clears ids on edit — `ProductPricingSection.tsx:130,198,253,307,404`. Fixed↔Free switches and added currencies DO work — ids rebuilt, `CourseWizard.steps.tsx:2141-2179`.)
2. **BROKEN** — One-time → Recurring always fails server-side ("Recurring interval cannot be changed", `product/service.py:313-330`); UI exposes the toggle unconditionally; raw JSON error toast (`EditPricingModal.tsx:79-84`).
3. **BROKEN** — Recurring → One-time silently converts (null skips the guard, applied by `exclude_unset` loop, `product/service.py:440-445`); subscribers unreconciled; trial fields nulled.
4. **BROKEN** — Modal's cover media picker edits `full_medias` but save body never sends `medias` — cover reverts — `CourseWizard.steps.tsx:2214-2225`, `EditPricingModal.tsx:70-77`.

### Display vs charge
5. **BROKEN** — `formatProductPrice` hardcodes `$` (`courseLandingPrice.ts:19-22`); multi-currency presentment (checkout picks by buyer IP, `checkout/service.py:2265-2268`) never reflected on landing.
6. **INCONSISTENT** — Same product renders 3 ways: PricingTab `ProductPriceLabel` (correct), landing `formatProductPrice` ("$X"), wizard `Intl.NumberFormat`.
7. **BROKEN** — Paid course with paywall OFF advertises "Enroll Free"/"Free for everyone" (`PublicPortalView.tsx:92,247-262`; `CourseDesignEditor.tsx:740-762`) but checkout charges the real price.
8. **BROKEN** — Wizard defaults `price_amount: 0` (`CourseWizard.tsx:174-179`); backend requires ≥50¢ (`product/schemas.py:99-106`); no step validation → "Something went wrong" at the very end.
9. **INCONSISTENT** — Enroll sheet hardcodes "yours … forever" for subscriptions; price regex fails for non-symbol currencies — `GeneratedPortalPage.tsx:483,2322-2326`.
10. **INCONSISTENT** — `StorefrontCourseCard.tsx:154-168` shows no price at all.

### Trials
11. **WORKS** — StepPricingWizard billing trial is real end-to-end (`trial_interval` → checkout `_update_trial_end` → subscription `trialing`, with abuse tracking) — `CourseWizard.steps.tsx:2181-2190`, `product/service.py:332-352`, `checkout/service.py:2289-2304,1218-1302`, `subscription/service.py:567-592`.
12. **FAKE-adjacent** — FreeTrialPicker's "trial" is content preview (`trial_mode` + `paywall_position`), not a billing trial; the two concepts never cross-reference.
13. **INCONSISTENT** — Landing never advertises the real billing trial anywhere.
14. **FAKE** — FreeTrialPicker "Play Sample" pill just toasts — `FreeTrialPicker.tsx:243-256`.
15. **BROKEN** — 'Lesson Sample' mode with no configured sample: public "Play Sample" hero label falls through to checkout — `PublicPortalView.tsx:242-243,267-290`.
16. **FAKE** — FreeTrialPicker localStorage keys read by nothing but its demo embed; count capped 1–5 vs PricingTab unlimited.

### Paywall
17. **WORKS** — Server-side paywall enforcement is solid: locked lessons stripped, playback mint requires enrollment + accessibility, enrolled detail 404s without enrollment; purchase → `course_access` benefit → enrollment — `courses.py:84-129,589-656,797-829,1129-1158`, `course/service.py:183-252`.
18. **WORKS** — PricingTab paywall toggle + position persist; free-preview flags surfaced correctly — `PricingTab.tsx:39-55,185-191,215-219`.
19. **INCONSISTENT** — PricingTab "N of M lessons visible" counts ALL lessons incl. drafts (`PricingTab.tsx:36`); server indexes published only.
20. **INCONSISTENT** — CourseDesignEditor preview ignores per-lesson `is_free_preview` (locks purely positionally) — `CourseDesignEditor.tsx:213-221`.
21. **FAKE** — `paywall_lesson_id` persisted/echoed, never read by gating or UI — `course/service.py:104`, `schemas.py:175/217/339`.
22. **FAKE** — `PaywallIcon.tsx` orphaned. `PaywallRow` works (presentational; enforcement server-side).
23. **BROKEN/at-risk** — Public free-preview playback bypasses signing and view-quota metering (see upload #15) — `HlsVideo.tsx:73-76`, `courses.py:633-650`; sample clip path was fixed (`courses.py:964-1044`), lesson previews were not.

### Misc
24. **FAKE** — `EnrollToWatchSheet.tsx` dead code with triple-wrong pricing logic.
25. Hardcoded `courseLessons={12}` fallback in wizard — `CourseWizard.tsx:608`, `CourseWizard.steps.tsx:2470,2483`.
26. **WORKS** — Free price model end-to-end; gap: EditPricingModal doesn't sync paywall off (dummy state, `EditPricingModal.tsx:53-58`) unlike the wizard (`CourseWizard.steps.tsx:2154-2157`).
27. Absent — No discount controls anywhere in course pricing UI.
28. Swallowed errors: checkout/enroll detail discarded (`PublicPortalView.tsx:107-113`); EditPricingModal shows raw `JSON.stringify(result.error)`; stale "live checkout preview" comment (empty `<main>` at `CourseWizard.steps.tsx:2490`).

---

## 5. Customers tab

1. **WORKS** — Rows are real enrollments (`GET /v1/courses/{id}/enrollments` → `course_enrollments`) — `courses.ts:609-623`, `endpoints.py:370-412`, `service.py:609-630`.
2. **WORKS** — "Enrolled" = real purchases via auto-attached `course_access` benefit — `course/service.py:183-252`, `benefit/strategies/course_access/service.py:48-83`.
3. **FAKE** — "Admin" row synthesized client-side: name = email prefix, "Joined" = org creation date; other org members never appear — `CustomersTab.tsx:78-88,147-149`.
4. **INCONSISTENT** — Header count = page-1 rows (≤50) + fake admin; `total_count` returned but never read — `CustomersTab.tsx:100-103,144`.
5. **BROKEN** — Preview-sandbox customers (`preview+{userId}@course-preview.invalid`) appear in list, count, and CSV — `endpoints.py:979-1010` (no filter in list endpoint).
6. **BROKEN** — Pagination truncated at 50 with no pager; students 51+ invisible — `courses.ts:613-614`, `CustomersTab.tsx:74`.
7. **WORKS (within page)** — Client-side search over loaded rows only.
8. **FAKE (absent)** — No sort controls.
9. **BROKEN** — Fetch errors render as "No students enrolled yet." — `CustomersTab.tsx:74-75,188-193`.
10. **FAKE (absent)** — No progress UI at all (no bars, percentages, last-active, per-customer view).
11. **INCONSISTENT** — Real progress data exists server-side (`CourseLessonProgress` via portal complete endpoint — `WatchPlayer.tsx:344-349`, `WatchHome.tsx:454-466`, `courses.ts:1132-1148`, `customer_portal/endpoints/courses.py:659-685`) and is shown to students and used by automations — the instructor tab reads none of it.
12. **BROKEN (design gap)** — Partial watch progress is localStorage-only (`spaire_watch:{courseId}`, `WatchHome.tsx:62-71,444-453`); only binary completion persisted; no server-side last-active possible.
13. **WORKS (caveats)** — Remove student soft-deletes enrollment, but: confirm text "progress will be cleared" is false (rows orphaned); paid benefit grant NOT revoked → grant re-runs silently re-enroll; error swallowed to generic toast — `endpoints.py:415-429`, `service.py:579-587`, `CustomersTab.tsx:117,125-127`.
14. **BROKEN** — CSV export = loaded page + fake admin + preview customers only — `CustomersTab.tsx:42-63,130-137`.
15. **FAKE (absent)** — No manual enroll by email.
16. **FAKE (absent)** — No email-the-customer action.
17. **WORKS** — Joined-date rendering (tz-aware UTC → locale).

---

## 6. Community tab

**Verdict: real end-to-end, not a shell** — students can post (text/photo/video/poll/event), read, comment, react, vote, RSVP, submit to activities against persisted endpoints (`server/polar/community/endpoints.py`); enabled/archived gating enforced server-side (`service.py:344-356`).

### Publish / gating
1. **WORKS** — Publish sets `enabled=true`; portal tab appears only when an enrolled course has `community_enabled` — `CommunityHub.tsx:138-145,199-206`, `TopBar.tsx:178-186`, `repository.py:128-160`.
2. **BROKEN** — "Your community is live" toast fires unconditionally (no onError) — `CommunityHub.tsx:138-145`, `community.ts:880-896`.
3. **BROKEN** — Deep link `/{org}/portal/courses/{id}/community` bypasses tab gating: full hub chrome renders for unpublished community; queries 403 into generic error cards; settings GET lazy-creates and returns 200 — `CommunityHubStudent.tsx:82-99`, `endpoints.py:1002-1023,1042`.
4. **INCONSISTENT** — Archived-but-enabled community still shows the portal tab, then 403s everywhere — `service.py:354` vs `repository.py:128-160`.
5. **BROKEN** — Archive/Restore toasts success regardless of PATCH outcome — `Settings.tsx:303-313`.
6. **BROKEN** — "View as student" opens portal URL with no `customer_session_token` → redirects to `/portal/request` login screen — `CommunityHub.tsx:264-276`, `portal/courses/[courseId]/community/page.tsx:24-26`.
7. **WORKS (partial)** — Delete community is a real DELETE, but next settings GET lazy-recreates a fresh row and embedded mode routes back to the same editor — presents as "reset" not removal.

### Creator side
8. **WORKS** — Feed preview, post create (all types), pin/unpin, delete, comments, reactions, poll vote — `Feed.tsx:1063-1095,705-710,736-739`, `composer.tsx:182-317`, `community.ts:474-601,1110-1170`.
9. **WORKS** — Start-tab checklist derives from live data — `Start.tsx:41-78`.
10. **WORKS** — Hero cover upload + drag-reposition (debounced PATCH, error toast).
11. **FAKE (dead)** — Tags: full CRUD hooks + backend, zero UI; post tag chips never rendered — `community.ts:918-1012,101-138`.
12. **FAKE (dead)** — Feed sort/filters (`top_week`, `unanswered`, module/lesson/tag) supported by hooks+backend; feeds hardcode `sort:'recent'`, no filter UI — `Feed.tsx:1063-1068,1123-1128`.
13. **FAKE (missing)** — Activities: no edit/close/delete UI (`useUpdate`/`useDelete` hooks unused); `pin_to_feed` hardcoded false, `notify_on_publish` hardcoded true — `Activities.tsx:125-126`, `community.ts:1669-1709`.
14. **FAKE (dead)** — Activity-pin CTA panel in feed schema never rendered.
15. **FAKE (missing)** — No member management/moderation anywhere (no Members tab creator-side; no remove/ban/approve) despite Settings copy.
16. **BROKEN** — Pin only ever pins as `announcement`; other pin types + `pin_expires_at` unreachable — `Feed.tsx:736-739`.

### Settings
17. **WORKS** — Name/tagline, cover, comments toggle, reactions toggle, meeting provider, member RSVP — persist and student hub reads them.
18. **BROKEN** — Every Settings control fails silently (no onError; silent revert on refetch) — `Settings.tsx:137`, `community.ts:880-896`.
19. **INCONSISTENT** — Comments toggle enforced only for feed posts, not activity submissions (which the hint text describes) — `service.py:1028,1548-1560`.
20. **INCONSISTENT** — `reactions_enabled` enforced only on customer endpoints, not creator; student Like button never hidden; optimistic flip rolls back silently — `endpoints.py:861,918,1367,1434`, `Feed.tsx:900-912`, `community.ts:818-823`.
21. **FAKE (dead schema)** — `who_can_post`, `moderate_new_members`, `profanity_filter`, `weekly_digest`, `notify_new_submissions`, `notify_new_comments`, `watching_rail_enabled`, `show_in_portal_tabs` stored/returned, no UI, no enforcement anywhere — `community.ts:154-183`.
22. **INCONSISTENT** — Start-tab copy promises "access, moderation, notifications" sections Settings doesn't have — `Start.tsx:100`.

### Events
23. **WORKS** — Create/edit/delete events, calendar links, join link, RSVP with server enforcement — `Events.tsx:141-318,447-494,546-563`, `events_endpoints.py:405`.
24. **BROKEN** — Event edit silently drops cover reposition (`cover_object_position` omitted from update body); timezone/location never editable — `Events.tsx:184-193`, `community.ts:1324-1333`.
25. **INCONSISTENT** — Feed-embedded EventSheet defaults `memberRsvp` true → students see RSVP even when off; server rejects into generic error — `Feed.tsx:201-208`, `Events.tsx:406-407,546`.
26. **BROKEN (cosmetic)** — Feed event embeds briefly render fabricated placeholder event — `Feed.tsx:110-141`.

### Student side
27. **WORKS** — Post/read/comment/react/vote/delete-own; activity submissions (4 types); roster; profile + prefs; notifications bell with SSE.
28. **BROKEN** — Activity submission composer swallows all failures (`try/finally` no catch, `void`-invoked) — `Activities.tsx:425-466,518-520,548-550`.
29. **BROKEN** — Comment create/delete and post delete fail silently; comment text cleared before POST resolves (failure loses text) — `Feed.tsx:568,635-640,830-839`.
30. **BROKEN** — Notification rows only mark-as-read; navigate nowhere — `TopBar.tsx:619-638`.
31. **FAKE (scope)** — Reactions hardcode `'heart'` despite 6-emoji backend enum; no picker — `Feed.tsx:446,560,903`.
32. **WORKS (caveat)** — "Copy link" `#post-{id}` only resolves if post is on loaded pages.
33. **WORKS** — GIF intentionally unshipped (renders existing media fine) — `composer.tsx:14`.

---

## 7. Automations tab

Chain: builder → `/v1/email-sequences` → `EmailSequenceStep` rows → course events (`course/service.py:571,678,782`) → `enroll_for_trigger` → Dramatiq → 5-min cron `process_due` → flow engine → Resend send with idempotency + analytics rows; Resend webhooks update opened/clicked.

### WORKS
1. Automations list (real filtered query) — `AutomationsPanel.tsx:43-49`, `emailMarketing.ts:918-939`, `endpoints.py:54-75`.
2. New/edit/delete (real soft-delete with confirm).
3. Create/save persists full flow (`trigger_config.flow_doc` + materialized steps) — `AutomationSequenceBuilder.tsx:295-377`, `service.py:191-225,366-478`.
4-7. Triggers real: enrols (`on_purchase`), lesson completed, first lesson completed, course completed (see BROKEN 4) — `course/service.py:571-576,731-743,816-819,862-865`.
8. "Inactive N days" daily cron — `email_sequence/tasks.py:148-218` (see BROKEN 5).
9. Wait steps scheduled correctly — `flow_engine.py:864-879`, `tasks.py:128-145`.
10. Email steps: full editor, personalization, unsubscribe headers, open/click tracking, idempotency, retry — `tasks.py:379-603`.
11. Opened/Clicked branches query real send statuses — `flow_engine.py:253-263,605-627` (see INCONSISTENT 3).
12-13. Tag branch + add/remove tag actions real and idempotent — `flow_engine.py:264-270,663-674`, `tags.py:36-92`.
14. Goal nodes exit enrolment incl. mid-wait — `flow_engine.py:726-742`, `service.py:674-721` (see INCONSISTENT 5/6).
15-16. Turn on/off/save; status pill real; tier cap server-side — `service.py:249-269`.
17. Send windows honored at enrolment/waits/deferrals — `flowDoc.ts:238-255`, `service.py:56-120`.
18. Frequency cap = real rolling-7-day query with deferral — `tasks.py:400-421`, `repository.py:353-372`.
19. "Send test to me" real — `email_broadcast/endpoints.py:608`.
20. Leave-guard + debounced autosave.

### BROKEN
1. "Notify my team on Slack" is a permanent silent no-op: reads `getattr(org, "slack_webhook_url", None)` — column doesn't exist anywhere, no settings UI — `webhooks.py:117-142`, `AutomationSequenceBuilder.tsx:63-66`, `flowDoc.ts:87`.
2. Course-level "Lesson completed" can save permanently dead: lesson matched by TITLE string; unresolved → `lesson_id NULL` → fan-out filter never matches; the picker even offers "Add a lesson to your course first" as a selectable value — `AutomationSequenceBuilder.tsx:181-192`, `automationTrigger.ts:45-49`, `repository.py:86-87`.
3. Race: enrollment-triggered emails can silently never fire — `EmailSubscriber` row created by low-priority async task (`order/service.py:1860-1874`); `_fire_course_event` returns silently if missing, no retry (`course/service.py:690-695`); non-order enrollments (incl. preview) have no subscriber row at all.
4. "Course completed"/"Halfway" denominators use ALL lessons incl. drafts (`course/repository.py:137-144`, `service.py:802`) while students can only complete published — any draft lesson makes "Course completed" unfireable. (Flow-engine branches use published-only — `flow_engine.py:509-521` — the two disagree.)
5. Inactivity automation loops: daily scan re-enqueues every still-inactive student; `enroll()` recycles completed enrolments to fresh runs → whole win-back sequence re-sent forever — `tasks.py:200-218`, `service.py:577-646`.
6. `until-event` waits can never wake tree-cursor enrolments (legacy `flow_index` cursor never advanced) — `events.py:97-106`, `flow_engine.py:864-879`; not UI-reachable but the fire-event API implies it works — `endpoints.py:444`.

### FAKE
1. Audience counts in the sequence email editor: hardcoded ('1,204', '860', '612', '494', '237', '318') until query resolves; then only TOTAL enrolled substituted next to trigger-specific labels it doesn't measure — `emailEngine.ts:103-108,170,177-179,359,1036`, `SequenceEmailModal.tsx:94-95`.
2. `/embed/automation*` demo routes: local-only saves + six invented sample lessons (by design, not reachable from editor).

### INCONSISTENT
1. Editor copy "Pick a template or start from scratch" — no template picker exists; backend template system (8+ templates, `/from-template`) fully built and unwired — `CourseEditor.tsx:463-466`, `email_sequence/templates.py`.
2. "Send in subscriber's timezone": plumbing complete, but `EmailSubscriber.timezone` has zero writers — always UTC — `models/email_subscriber.py:81`.
3. Opened/Clicked branch right after an email evaluates within ~0-5 min → effectively always "No" without a Wait; no UI warning — `flow_engine.py:857-858`.
4. Branch 'Has tag "committed"' can never be true via this UI (only add-"engaged"/remove-"at-risk" offered).
5. Goal "Finishes next lesson" means "finishes ANY lesson" (no lesson selector) — `flowDoc.ts:103-109`.
6. Goal exit is org-wide, not course-scoped: completing course A closes course B's goal — `service.py:674-721`, `flowDoc.ts:168`.
7. Trigger subtitle "Enrols every buyer on purchase, then waits" misdescribes (entry happens AT the milestone) — `AutomationSequenceBuilder.tsx:986`.
8. Changing trigger away from "Lesson completed" can't clear stored `lesson_id` (undefined dropped; service only sets non-None) — `AutomationSequenceBuilder.tsx:359`, `service.py:270-273`.
9. Editing a `paused` sequence silently rewrites status to `draft` on autosave — `AutomationSequenceBuilder.tsx:364`.
10. All save failures → generic "Could not save", hiding entitlement/tier-cap reasons — `AutomationSequenceBuilder.tsx:370-374`, `service.py:205-207,258-268`.
11. Per-lesson automations card only offers "New automation", never lists existing — `LessonEditorV2.tsx:849-868`.

Stats verdict: panel/builder counters are real; full analytics backend (`/{id}/analytics`, `/{id}/step-analytics` — `endpoints.py:425-492`, `repository.py:275-417`) exists but is surfaced nowhere.

---

## 8. Settings tab

1. **WORKS** — Title (required-validated), instructor name, thumbnail upload/remove/focal-point (server-validated, applied on landing + sign-in fallback).
2. **INCONSISTENT** — Description help text "shown in meta tags and product previews" is false: meta tags use `product.description`, never synced; on the page itself only a fallback under `aiHero?.description` — `SettingsTab.tsx:224-226`, `products/[productId]/page.tsx:28,54`, `PublicPortalView.tsx:307`.
3. **BROKEN (partial)** — Instructor bio only renders when AI byline absent (`aiHero?.byline || landing.instructor_bio`) — invisible edits on AI-generated courses — `PublicPortalView.tsx:308`.
4. **BROKEN (severe)** — Assistant toggle + strictness persist and are genuinely enforced for students, but `_course_read` never serializes `assistant_enabled`/`assistant_strictness` (`endpoints.py:111-141`) so schema defaults (True / course_plus_general, `schemas.py:342-343`) always come back → the switch snaps back ON after save; the editor permanently displays the wrong state — `SettingsTab.tsx:69-71,110-129`, `models/course.py:83-85`, `course_assistant/endpoints.py:205-207`, `course_assistant/service.py:577,614`.
5. **FAKE (dead)** — `paywall_enabled/paywall_position` in `CourseSettingsEdits` never set; forwarded as undefined — `SettingsTab.tsx:22-23`, `CourseEditor.tsx:314-315`.
6. Swallowed errors: generic "Failed to save settings" (`CourseEditor.tsx:321-323`); thumbnail-upload failure shows nothing (`courses.ts:971-997`, `SettingsTab.tsx:142-144`).
7. **MISSING** — No slug/URL field (slug column is write-never/read-never — API-level fake); no publish/visibility control; **no course delete/archive anywhere** (no `DELETE /v1/courses/{id}` endpoint at all); no certificates; no completion settings.

---

## 9. Auth tab

1. **INCONSISTENT (naming)** — Contains no authentication settings. It's a WYSIWYG editor for the org-wide portal sign-in page appearance (cover, focal point, theme). No per-course access modes exist anywhere.
2. **WORKS** — Cover photo upload/remove (org endpoint, size/type validated both sides, errors toast) — `AuthTab.tsx:165-179`, `organization/endpoints.py:161-249`, `PortalAuthScene.tsx:24-44`.
3. **BROKEN (silent failure)** — Drag-to-reposition persists via `useUpdateOrganization`, but the hook returns `{data,error}` without throwing (`org.ts:92-108` `if (error) return`) — failed PATCH shows no toast while "Changes save automatically" implies success. Also mouse-only (no touch handlers); no server-side position format validation — `AuthTab.tsx:189-194,274`.
4. **WORKS (same caveat)** — Light/dark theme toggle persists `customer_portal_sign_in_theme`; portal applies to auth screens, creator-chosen — `PortalShell.tsx:77-88`.
5. **INCONSISTENT** — Fallback preview shows THIS course's cover/focal point; the live server fallback uses the org's most-recently-created course — with >1 course, preview ≠ live — `AuthTab.tsx:181-187,465-471`, `customer_portal/service/organization.py:27-40`.
6. **WORKS** — Preview link → `/portal/request` (real page, shared stylesheet); right-hand sign-in panel is an explicit static mock.

### Access model (context)
7. Single implicit model, enforced server-side: purchase → `course_access` benefit → enrollment; email-OTP customer sessions; watch-side 404 without enrollment; landing strips content/playback ids from locked lessons; playback minted only via enrollment+quota-checked endpoint; drip enforced in `calculate_lesson_accessibility`. Nothing in these tabs changes any of it — `course/service.py:183-252,1062-1109`, `customer_portal/endpoints/courses.py:52-129,414-424,589+`.
8. Dashboard preview-access backdoor intentional and org-member-restricted — `course/endpoints.py:940-1017`.
