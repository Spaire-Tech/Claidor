# Customer Portal Audit — Technical Appendix

Full-trace audit of the student/customer portal (UI → hooks → API → service → models), companion
to `docs/course-editor-audit.md`. Same classifications: **WORKS / BROKEN / FAKE / INCONSISTENT**.
Paths relative to repo root; portal routes live under
`clients/apps/web/src/app/(main)/[organization]/portal/`.

The student side of Community is covered in the course editor audit (§6, findings 27–33).

---

## 1. Shell, navigation, theme

1. **WORKS** — Shell routing (standard / full-bleed course / immersive lesson / auth full-bleed) — `PortalShell.tsx:43-108`.
2. **FAKE** — `PortalLayoutHeader` is an admitted no-op still mounted by the layout — `PortalLayoutHeader.tsx:5-11`, `layout.tsx:26`.
3. **WORKS** — Theme toggle persisted per-org; falls back to enrolled course landing theme; shell↔topbar synced — `usePortalTheme.ts:26-74`, `TopBar.tsx:258-298`.
4. **BROKEN** — Theme derivation requires the courses API; expired/missing token → stale/wrong theme flash — `usePortalTheme.ts:50-59`.
5. **WORKS** — Overscroll background painting; sign-in screens intentionally follow creator's `customer_portal_sign_in_theme` — `PortalShell.tsx:50-88`.
6. **WORKS** — Tab permission gating (Enrollments/Billing/Team/Community conditions) — `TopBar.tsx:37-112`, `utils/customerPortal.ts:16-32`.
7. **WORKS** — Session token re-appended to every tab href — `TopBar.tsx:188-191`, `MobileTabBar.tsx:236-239`.
8. **INCONSISTENT** — Desktop vs mobile tab sets differ: mobile never shows Team; mobile "Courses" stays lit inside community sub-routes — `MobileTabBar.tsx:150-208` vs `TopBar.tsx:62-64,97-103`.
9. **BROKEN (mobile)** — Settings and Log out unreachable on mobile: CSS hides the avatar chip expecting a "dedicated tab" that doesn't exist — `portal/portal.css:1116-1120`, `MobileTabBar.tsx:157-207`.
10. **BROKEN (mobile)** — Tab bar grid hardcoded to 5 columns (`--sp-tabbar-cols` never set); fewer tabs bunch left — `portal.css:1035`, `MobileTabBar.tsx:241-262`.
11. **FAKE** — CSS/comments reference a mobile search entry; no search UI exists; `SearchIcon` unused — `portal.css:1097-1112`, `_components/icons.tsx:6-21`.
12. **FAKE (intentional)** — Downloads tab commented out in both navs ("Phase 4d"); route still live via deep link — `TopBar.tsx:80-87`, `MobileTabBar.tsx:184-191`.
13. **INCONSISTENT** — Tab labeled "Enrollments" routes to `/portal/orders` (page titled "Orders"); "Billing" routes to `/portal/settings` — `TopBar.tsx:88-94,104-110`.
14. **INCONSISTENT** — Orphan deep-link-only routes: `subscriptions/[id]`, `usage`, `wallet`, `team`, `downloads`.

## 2. Notifications bell

15. **WORKS** — Unread count 60s poll + SSE invalidation; backend real — `TopBar.tsx:478-602`, `customer_notifications/endpoints.py:32`.
16. **BROKEN** — Notification rows are dead ends: click only marks read, never navigates — `TopBar.tsx:604-639`.
17. **INCONSISTENT** — Copy knows only 5 `community.event.*` types; unknown types render generic title + empty subtitle — `TopBar.tsx:641-657`.
18. **BROKEN (minor)** — With no token, SSE still opens against the authed stream → background 401 retry loop — `TopBar.tsx:490`, `hooks/sse/index.ts:18-55`.
19. **WORKS** — Mark-read failures re-sync from server — `TopBar.tsx:512-519,557-594`.

## 3. Profile / onboarding

20. **WORKS** — First-sign-in onboarding auto-opens once per customer; preview customers skipped — `TopBar.tsx:328-388`.
21. **BROKEN** — Avatar "Remove" is a silent no-op: frontend PATCHes `avatar_url: null`; endpoint only assigns `is not None` — `ProfileOnboarding.tsx:112-119,180-197` vs `customer_portal/endpoints/customer.py:90-94`.
22. **WORKS** — Name+avatar save real (256px crop → data URL → PATCH profile; cache invalidated) — `ProfileOnboarding.tsx:44-81,174-202`.
23. **INCONSISTENT** — Profile modals hardcoded light; ignore dark theme — `ProfileOnboarding.tsx:313-535`.
24. **INCONSISTENT** — Generated client schema stale; `customer`/`avatar_url` hand-cast — `TopBar.tsx:321-327`.

## 4. Sign-in / claim / sessions

25. **WORKS** — Request → code → authenticate flow: 202 anti-enumeration, sessionStorage email, 6-char single-use code w/ 30-min TTL, multi-account 409 picker, member sessions — `RequestPage.tsx:49-151`, `AuthenticatePage.tsx:112-166`, `service/customer_session.py:65-272`.
26. **BROKEN** — Non-validation request errors (429/5xx) swallowed: button stops spinning, no message — `RequestPage.tsx:67-72`.
27. **INCONSISTENT** — Copy says "6-digit code"; backend generates 6-char alphanumeric — `AuthenticatePage.tsx:246` vs `customer_session.py:266-272`.
28. **INCONSISTENT** — 429 mapped to hardcoded "try again in 15 minutes"; real limit is per-minute — `customerPortal.ts:34-43` vs `rate_limit.py:44-57`.
29. **BROKEN** — Resend for multi-account emails omits `customer_id` → 409, no code sent, UI still shows resend countdown as if sent — `AuthenticatePage.tsx:168-179`.
30. **WORKS** — Success → auto-redirect with token; `/portal` → `/portal/overview` preserving params — `AuthenticatePage.tsx:61-110`, `portal/page.tsx:14-16`.
31. **WORKS** — Seat claim flow (token info, SSE fulfillment, redirect w/ fresh session) — `ClaimPage.tsx:28-182`.
32. **INCONSISTENT** — Claim page visually alien: dashboard ShadowBox w/ hardcoded `bg-white` on the full-bleed auth route; mixed "course access"/"Product"/"Seat" vocabulary — `ClaimPage.tsx:144-265`.
33. **WORKS** — Server-side 401 → `/portal/request` redirect on overview — `overview/page.tsx:99-106`.
34. **BROKEN** — Mid-session expiry inconsistent: only Billing components consume `CustomerPortalProvider.onUnauthorized`; TopBar/courses/community/notifications fail silently (tabs shrink, bell blanks, queries error, no redirect) — `CustomerPortalLayoutWrapper.tsx:29-31`, `TopBar.tsx:172-177`.
35. **BROKEN** — "Log out" doesn't revoke the session: clears sessionStorage flag + redirects; no revoke endpoint exists; token stays valid for remaining TTL (1h) via history/back — `TopBar.tsx:363-374`; no revoke route in `customer_portal/endpoints/customer_session.py`.
36. **INCONSISTENT** — Auth queries not keyed by token → brief cross-account name/avatar bleed when switching accounts — `customerPortal.ts:57-69`.
37. **INCONSISTENT** — Sign-in copy purchase-centric ("access your purchases") in a courses portal — `RequestPage.tsx:158-160`, `AuthenticatePage.tsx:200-215`, `customer_session.py:211`.

## 5. Overview (home)

38. **WORKS** — Continue / Recently-completed cards use real server data (`GET /v1/customer-portal/courses/`) — `OverviewPage.tsx:162-180`, `customer_portal/endpoints/courses.py:271-407`.
39. **FAKE** — "Minutes practiced" = `total_duration × completion_percent`, and the two inputs use different lesson denominators (all published w/ drip-locked vs accessible-only) — synthetic estimate presented as a stat — `OverviewPage.tsx:182-186`, `courses.py:326-347`.
40. **FAKE (mislabeled)** — "Courses started" = raw enrollment count incl. never-opened — `OverviewPage.tsx:209`.
41. **INCONSISTENT** — Overview % is server lesson-completion; watch page resume bars are per-device localStorage fractions — the two disagree by design — `WatchHome.tsx:58-75,207-222`.
42. **BROKEN** — Query errors render as "Your library is empty" + zero stats (no error state) — `OverviewPage.tsx:162-165,332-339`; same on CoursesPage `:142-147,189-196`.
43. **INCONSISTENT** — Completed courses un-complete when a dripped module unlocks (denominator grows, card moves back to "Continue") — `courses.py:326-357`.
44. **INCONSISTENT** — "Active plans" stat + plan block are subscription-shaped; one-time buyers see "Active plans: 0" — `OverviewPage.tsx:188-224,384-402`.
45. **WORKS** — Continue-learning CTA; greeting; Manage links correctly gated on meters/wallets/team — `OverviewPage.tsx:143-254`.

## 6. Courses list

46. **WORKS** — List, counts, filter chips, thumbnails honoring `thumbnail_object_position`, published-only lesson counts, no draft leakage — `CoursesPage.tsx:59-226`, `courses.py:359-379`.
47. **FAKE (mislabeled)** — "In progress" filter = "not completed" (includes never-started) — `CoursesPage.tsx:153`.
48. **INCONSISTENT (minor)** — Tokenless redirect drops searchParams (courses, bookmarks) while overview preserves them — `courses/page.tsx:24-26`.

## 7. Bookmarks

49. **FAKE (no server)** — Entire feature is localStorage-only: lost on new device; shared across different customers on the same browser (keyed by org slug only, no customer id) — `BookmarksPage.tsx:20-63`.
50. **BROKEN** — Two incompatible key schemes: viewer writes `polar:bookmark:{courseId}:{lessonId}` (`MasterClassLessonViewer.tsx:138,323-350`), watch home writes `polar:bookmark:{lessonId}` (`WatchHome.tsx:89,261-290`) → duplicate cards, un-toggling removes the wrong key (bookmark resurrects), saved-state disagrees between surfaces.
51. **BROKEN (edge)** — One malformed entry aborts reading ALL bookmarks (single try/catch around the scan) — `WatchHome.tsx:92-103`.
52. **WORKS** — Within BookmarksPage: list, remove, clear-all, cross-tab refresh — `BookmarksPage.tsx:145-220`.
53. **BROKEN (stale links)** — Bookmarks never validated: deleted/unpublished/relocked lesson silently drops to course overview; revoked enrollment → generic error — `LessonViewerPage.tsx:60-95,142-150,217`.
54. **INCONSISTENT** — Bookmarks nav exists only in desktop TopBar; mobile has no path to the page — `TopBar.tsx:234-240`.
55. **INCONSISTENT (minor)** — Bookmark card thumbnails ignore object-position crop — `BookmarksPage.tsx:81-88`.

## 8. Watch experience

Architecture: `LessonViewerPage.tsx` orchestrates — no `?lesson=` → **WatchHome** (hero + rail; video in **WatchPlayer** overlay, URL unchanged); `?lesson=<id>` → **MasterClassLessonViewer** (used for text/quiz lessons and any deep link: assistant citations, bookmarks, back/forward). Same video lesson thus has two players with different rules.

56. **BROKEN (critical, mobile)** — Mobile students cannot take quizzes: `renderMobileLessonViewer` never renders `QuizPlayer` (desktop-only at `MasterClassLessonViewer.tsx:705-713`; mobile branch `:1366-2038` shows no questions).
57. **BROKEN (mobile)** — Mobile shows "Mark complete" for quiz lessons; POST /complete 400s for quizzes; silent failure — `MasterClassLessonViewer.tsx:1593-1624`, `courses.py:676-682`.
58. **BROKEN** — Quiz pass fires a guaranteed-400 complete request (completion survives only because the attempt endpoint recorded it) — `LessonViewerPage.tsx:122-125`, `courses.py:574-577,676`.
59. **BROKEN (content leak)** — Student Course TA builds its knowledge base from ALL lessons incl. drafts and drip-locked (`_buildable_lessons`, no published/accessibility filter) — students can extract unreleased content via chat; citations can point at lessons they can't open — `course_assistant/service.py:211-223,586-596`, `endpoints.py:250-253`.
60. **BROKEN** — Citation to an unpublished lesson: toast "Opening Lesson N", pushes `?lesson=`, nothing renders — `AskAssistant.tsx:476-494`.
61. **BROKEN** — Deep-linking a drip-locked lesson bypasses the UI guard (no `locked` check on `?lesson=` selection): blank black player + Mark complete that silently 403s — `LessonViewerPage.tsx:60-68,94-95`, `MasterClassLessonViewer.tsx:441`, `courses.py:1149-1156`.
62. **BROKEN** — CommentThread create/reply/delete failures fully silent (no catch) — `CommentThread.tsx:85-99,241`. WatchHome's panel does toast — `WatchHome.tsx:344-371`.
63. **BROKEN** — HlsVideo "Try again" no-op (effect keyed on unchanged `[src]`) — `HlsVideo.tsx:104-181`.
64. **BROKEN** — Player hotkeys fire while typing in the assistant chat (`textarea` not exempted; only INPUT is) — `WatchPlayer.tsx:307-308`, `AskAssistant.tsx:644`.
65. **BROKEN (minor)** — Mobile attachment card reads `.name` but attachments carry `.filename` → always shows fallback "Lesson resource" — `MasterClassLessonViewer.tsx:2011`, `courses.ts:4-11`.
66. **BROKEN (minor)** — Resume restarts at 0 when `duration_seconds` is null (frac × 0) though the card shows "Continue · X%" — `WatchHome.tsx:427-428`.
67. **INCONSISTENT** — Partial progress exists only on the WatchHome/WatchPlayer path (localStorage); MasterClass records/reads none — deep-linked videos start at 0 and don't update home rail bars — `WatchHome.tsx:58-75,444-453`.
68. **INCONSISTENT** — Completion thresholds differ: WatchPlayer 97% (`WatchPlayer.tsx:203-208`); MasterClass literal `ended` (`MasterClassLessonViewer.tsx:374-376`).
69. **INCONSISTENT** — `comments_mode='locked'`: WatchHome hides discussion entirely; MasterClass shows read-only w/ pill; backend allows reading — `WatchHome.tsx:342`, `CommentThread.tsx:101-143`, `courses.py:1252-1255`.
70. **INCONSISTENT** — Comment counts disagree across three surfaces (all rows incl. deleted / roots only / roots+replies excl. deleted) — `CommentThread.tsx:129`, `WatchHome.tsx:664`, `WatchSheets.tsx:389-392`.
71. **INCONSISTENT** — Two comment UIs, different feature sets on same data: CommentThread 3-level nesting, no likes/pins; CommentsPanel likes/pin/instructor badge, 1-level nesting, re-parents deeper replies as top-level "orphans" — `CommentThread.tsx:319`, `WatchSheets.tsx:308`, `WatchHome.tsx:327-334`.
72. **INCONSISTENT** — Quota/playback errors: MasterClass surfaces the 402 detail; WatchHome swallows into generic "Could not start playback" — `MasterClassLessonViewer.tsx:203-210,413-417`, `WatchHome.tsx:437-439`.
73. **INCONSISTENT** — "Episode N" (WatchHome) vs "Lesson N of M" (MasterClass) vs hardcoded "Lesson {n}" (WatchPlayer title bar) — `WatchHome.tsx:190-191`, `MasterClassLessonViewer.tsx:530,596`, `WatchPlayer.tsx:403`.
74. **INCONSISTENT** — Notes exist only in MasterClass tabs; WatchHome (primary video surface) has no notes UI — `MasterClassLessonViewer.tsx:842-880`.
75. **INCONSISTENT** — MasterClass exposes only `attachments[0]` as a hardcoded "Class Guide" pill (disabled pill when none); extras unreachable there; WatchHome's sheet lists all — `MasterClassLessonViewer.tsx:360-361,655-673`, `WatchSheets.tsx:151-194`.
76. **INCONSISTENT** — Duration formatting: rail/player show "75:32" for 75 min (no hours) vs sidebar h:mm:ss — `WatchGlyphs.tsx:118-121`, `MasterClassLessonViewer.tsx:76-83`.
77. **FAKE** — No next-lesson autoplay anywhere; "Up next" labels are labels — `WatchPlayer.tsx:203-208,344-349`.
78. **FAKE** — No speed/quality controls in WatchPlayer (skip±10/play/CC/discussion/fullscreen only); MasterClass falls back to native controls — `WatchPlayer.tsx:435-505`.
79. **FAKE** — `lesson-grid` class has no CSS anywhere; desktop grid never collapses on tablets — `MasterClassLessonViewer.tsx:549`.
80. **FAKE** — `assistant/AssistantPanel.tsx` dead code; assistant "Try asking" chips hardcoded per-course-identical; creator's reviewed sample questions never used — `course_assistant/endpoints.py:217-226`.
81. **Dead (harmless)** — `data.progress.completed` map always empty (endpoint never returns it) — `WatchHome.tsx:202-205` vs `courses.py:470-478`.
82. **Absent** — No transcript or chapters UI anywhere (transcripts feed only the assistant).
83. **WORKS** — Locking/drip enforcement + UI unlock dates; per-play signed URL minting with monthly view-quota; idempotent mark-complete; notes autosave w/ flush-on-unload; player shortcuts/captions/scrub/fullscreen; quiz grading server-side (answer key still ships to client — see editor audit); Course TA end-to-end (SSE proxy, guardrails, citations w/ timestamp jumps) — `courses.py:84-129,509-684,1129-1158`, `MasterClassLessonViewer.tsx:238-310`, `WatchPlayer.tsx:111-153,306-325`, `course_assistant/service.py:619-703`.
84. **WORKS (UX caveat)** — WatchHome playback never updates the URL: refresh loses the open player; browser Back exits the course page instead of closing the player — `WatchHome.tsx:404-442`.

## 9. Orders (list + detail + invoice)

85. **WORKS** — Order rows, expandable line items, status pills, client-side pagination — `orders/OrdersPage.tsx:79-355`.
86. **BROKEN** — Single `limit:100` fetch, no server paging; order #101+ never appears; "lifetime" total computed off truncated set — `orders/page.tsx:70-75`, `OrdersPage.tsx:296-302`.
87. **INCONSISTENT** — "Lifetime" counts only `paid` (excludes partially_refunded); assumes single currency — `OrdersPage.tsx:299-302`.
88. **BROKEN** — Hand-rolled `formatCurrency` always /100: zero-decimal currencies (JPY) shown at 1/100; detail page uses the correct shared formatter — `OrdersPage.tsx:15-25` (dup at `BillingPage.tsx:26-36`, `OverviewPage.tsx:407-417`) vs `packages/currency/src/index.ts:1-42`.
89. **FAKE** — `canceled` status pill unreachable (`statusKind` can't return it) — `OrdersPage.tsx:39-58`.
90. **INCONSISTENT** — "Invoice" button with download icon is just a link to the detail page — `OrdersPage.tsx:259-267`, `BillingPage.tsx:388-397`.
91. **BROKEN** — Member-without-billing 403 redirect drops the session token → bounces to sign-in — `orders/page.tsx:86-89`, `orders/[id]/page.tsx:86-89`, `settings/page.tsx:118-121`.
92. **WORKS** — Order detail totals; invoice generate/download end-to-end (PATCH billing → POST → SSE `order.invoice_generated` → auto-download) — `CustomerPortalOrder.tsx:141-319`, `DownloadInvoice.tsx:88-161,428-461`, `order.py:133-175`.
93. **BROKEN** — Invoice billing modal: country & state pickers hardcoded `disabled` while country is required → orders without a billing address can never generate an invoice — `DownloadInvoice.tsx:339-371`.
94. **BROKEN** — Invoice flow swallows errors; dropped SSE → infinite spinner — `DownloadInvoice.tsx:93-96`.
95. **INCONSISTENT** — No receipt UI anywhere; invoices carry no course info beyond product-name lines.
96. **WORKS** — Payment retry for subscription dunning orders (saved cards, 3DS, confirm, status polling) — `OrderPaymentRetry.tsx:88-201`, `order.py:178-244`.
97. **INCONSISTENT** — One-time purchases can never be retried (`canRetryOrderPayment` requires a subscription + dunning date) — `utils/order.ts`.
98. **INCONSISTENT** — Retry modal titled "Update Payment Method"; failure state renders the success green check with "Payment Failed" text; summary hardcodes `$` — `OrderPaymentRetryModal.tsx:85`, `OrderPaymentRetry.tsx:385-420`.
99. **INCONSISTENT** — "What's included" benefit rows meaningless for courses: generated client lacks `course_access` type → generic icon, blank type label, no course link — `BenefitGrant.tsx:318-333`, `Benefit/utils.tsx:24-25,61-70` (see also #113).
100. **INCONSISTENT** — Tab "Enrollments" / page "Orders" vocabulary mix; UUID vs `id.slice(0,8)` fallbacks differ between list and billing page.

## 10. Subscriptions

101. **WORKS** — Detail (amount/Free, status, dates, per-sub invoice table); cancel end-to-end (reason modal → `cancel_at_period_end` → audit-logged) — `CustomerPortalSubscription.tsx:160-355`, `subscription.py:136-217`.
102. **INCONSISTENT (key)** — Cancel flow never mentions course access ends — and it does (benefit revocation → `revoke_enrollment`); modal is a generic SaaS churn survey — `CustomerCancellationModal.tsx:112-199`, `benefit/strategies/course_access/service.py:70-84`.
103. **BROKEN** — Uncancel unreachable: button only in dead `CustomerSubscriptionDetails.tsx:84-99` (dead chain via unimported `CustomerPortalOverview`); backend supports it. Cancel-by-mistake is unrecoverable in the portal.
104. **BROKEN** — Change Plan likewise unreachable (`CustomerChangePlanModal` only in the dead chain); backend `update_product` exists.
105. **FAKE** — Dead cancel modal in `CustomerSubscriptionDetails` (`showCancelModal` never set true) — `:41,267-272`.
106. **BROKEN** — No subscriptions index route (`/portal/subscriptions` 404s); Billing links only the FIRST active sub → 2+ subs are unmanageable — `settings/BillingPage.tsx:202-279`.
107. **WORKS** — Seat quantity +/- (org setting + billing gated, server permission check) — `CustomerSeatQuantityManager.tsx:44-99`.
108. **INCONSISTENT** — Trials shown as "Renews {date}" with no trial mention; trial-aware UI lives only in dead components (`CurrentPeriodOverview.tsx:50-64`).
109. **FAKE/dead** — Next-charge preview (subtotal/tax) endpoint's only consumer is dead code — `subscription.py:103-133`.
110. **INCONSISTENT** — Billing "Current plan" card never shows the course/plan name — `BillingPage.tsx:207-253`.

## 11. Billing / settings

111. **WORKS** — Payment methods list/add (SetupIntent incl. 3DS return) /delete (in-use guard) — `BillingPage.tsx:183-235`, `AddPaymentMethodModal.tsx:50-182`, `customer.py:97-201`.
112. **BROKEN** — Cannot set an existing method as default (`set_default` hardcoded on add only; "Primary" badge display-only) — `AddPaymentMethodModal.tsx:56,135`, `BillingPage.tsx:293`.
113. **BROKEN (major)** — Billing details + Tax ID editing unreachable: `EditBillingDetails.tsx` only rendered by unimported `CustomerPortalSettings.tsx`; backend PATCH fully supports it. Combined with #93, invoices are effectively unobtainable for address-less buyers.
114. **INCONSISTENT** — Primary card removal blocked with hint, but non-card default methods always removable; `window.confirm/alert` instead of toasts; Stripe Elements hardcodes `currency:'usd'` — `BillingPage.tsx:92-152,214-227`, `AddPaymentMethodModal.tsx:193`.
115. **INCONSISTENT** — "Invoice history" hard-caps at 12 with no pagination; "N invoices" reports the truncated count — `BillingPage.tsx:237,315-321`.
116. **WORKS** — Empty states; storefront upsell — `BillingPage.tsx:298-341,403-416`.
117. **FAKE (dead code sweep)** — Unimported in this fork's portal: `CustomerPortalOrders`, `CustomerPortalSubscriptions`, `CustomerPortalSettings`, `CurrentPeriodOverview`, `EditBillingDetails`, `PaymentMethod`, `CustomerPortalOverview`, `CustomerSubscriptionDetails`, `CustomerChangePlanModal` — uncancel/change-plan/tax-ID/trial-preview/set-default all exist in code but are dead.

## 12. Grants ("What's included") — critical

118. **BROKEN (critical)** — `GET /v1/customer-portal/benefit-grants/` 500s for every course customer: every course auto-creates a `course_access` benefit (`course/service.py:178-235`); the portal service doesn't filter it (`service/benefit_grant.py:43-138`); the `CustomerBenefitGrant` response union has no course_access variant (`schemas/benefit_grant.py:94-104`) → pydantic ValidationError at `endpoints/benefit_grant.py:97` → HTTP 500. Symptom: "What's included" never renders on order/subscription pages (component returns null on undefined data — `CustomerPortalGrants.tsx:41-43`), and downloadables/license-key grants bought alongside a course are invisible too. No test covers course_access grants.
119. **BROKEN (dependent)** — Frontend couldn't render it anyway: generated `BenefitType` lacks course_access (`client/src/v1.ts:9111-9117`); no branch in `BenefitGrant.tsx:318-373`; no display name (`Benefit/utils.tsx:61-71`).
120. **INCONSISTENT** — Grants search copy names the exact type the pipeline can't deliver ("Search course access...") — `CustomerPortalGrantsComplex.tsx:63,71-73`; per-keystroke unbounced search — `:27-33`.

## 13. Downloads

121. **WORKS** — List + enrichment, tokenized download URL, counter increment, category chips, empty states — `DownloadsPage.tsx:255-262`, `downloadables.py:26-122`, `service/downloadables.py:139-214`.
122. **INCONSISTENT** — Tab commented out of both navs; page is deep-link-only — see #12.
123. **INCONSISTENT** — "Preview" uses the download URL → counts as a download, flips card to "Downloaded" — `DownloadsPage.tsx:198-207`.
124. **INCONSISTENT** — Expired token → "No downloads yet" (error swallowed) — `DownloadsPage.tsx:349-355`.
125. **INCONSISTENT (minor)** — Per-card refetch races counter increment; "Download all" fires N anchor clicks (browser may block all but first) — `DownloadsPage.tsx:324-340,401`.

## 14. License keys

126. **WORKS (backend)** — list/get/validate/activate/deactivate complete — `license_keys.py:36-179`.
127. **BROKEN (via #118)** — Only portal UI is inside the grants list → hidden by the 500 for course customers.
128. **FAKE (false success)** — Deactivate activation toasts success even when the API errored (hook never throws on `result.error`) — `customerPortal.ts:214-236`, `LicenseKeyActivations.tsx:21-43`.
129. **INCONSISTENT (minor)** — "TODO: Style me" raw Loading divs — `LicenseKeyBenefitGrant.tsx:48-51`, `DownloadablesBenefitGrant.tsx:136-139`.

## 15. Usage

130. **WORKS** — Meters table wired to real endpoint; progress ring genuinely bound to consumed/credited — `CustomerUsage.tsx:15-121`, `customer_meter.py:30-59`.
131. **INCONSISTENT** — No charts; single table. Route unguarded: tokenless deep link renders full UI with generic "No Results" (no 401 redirect, `token as string` cast) — `usage/page.tsx:47-71`. Dead Tabs wrapper — `CustomerUsage.tsx:22-26`.

## 16. Wallet

132. **WORKS (display only)** — Balance card real; 401/403 redirects correct — `wallet/page.tsx:66-96`, `wallet.py:28-67`.
133. **FAKE (promise)** — Schema docs say "You can top-up your wallet"; no portal top-up endpoint or button exists (merchant API only) — `schemas/wallet.py:4-11` vs `wallet/endpoints.py:88-121`.
134. **BROKEN** — Zero wallets → literally blank page (no empty state); only `wallets[0]` shown — `WalletPage.tsx:16-26`.
135. **INCONSISTENT** — No transactions list anywhere; unused API client built — `CustomerPortalWallet.tsx:16`.

## 17. Team / seats

136. **WORKS (backend)** — Member list/add/update-role/remove with owner rules; frontend error toasts — `member.py:38-229`, `member/service.py:79-138,485-580`, `CustomerPortalTeam.tsx:93-185`.
137. **INCONSISTENT (auth mismatch)** — Team tab shown to team customers with a plain customer session, but all /members endpoints require a Member subject → tab visible, every call 403s — `TopBar.tsx:44-49,97-103`, `member.py:47-48`, `utils/customerPortal.ts:23-26`.
138. **BROKEN** — Members query error renders "You are the only member of this team" + a live-looking Add form that then errors; no token/401 handling on the route — `CustomerPortalTeam.tsx:73-74,238-243`, `team/page.tsx:47-65`.
139. **INCONSISTENT** — Team tab absent from mobile nav entirely — `MobileTabBar.tsx:150-208`.
140. **WORKS** — Seat invite/revoke/resend + quantity end-to-end — `customer_seat.py:30-233`, `customerPortal.ts:445-531`.
141. **INCONSISTENT** — Order view shows the seat-invite form ungated (non-billing members get 403s); gray error text vs red elsewhere; unreachable "cannot decrease" warning; `SeatManagementTable` mutates props via in-place sort — `CustomerPortalOrder.tsx:54,321,347-351`, `CustomerSeatQuantityManager.tsx:41,96-100,163-168`, `SeatManagementTable.tsx:85-88`.
