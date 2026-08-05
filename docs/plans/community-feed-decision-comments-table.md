# Decision — Community comments: polymorphic vs. fork

## Context

We're adding a Community feed (per-course, customer-portal tab + course-builder editor tab). The feed has top-level **posts**, and posts have threaded **replies**. We already have a working `lesson_comments` table powering threaded discussion under each lesson (`server/polar/models/lesson_comment.py`, `course/service.py:588-660`, `customer_portal/endpoints/courses.py:987-1108`).

The question: should community comments live in the existing `lesson_comments` table (made polymorphic), or in a new `community_comments` table?

## TL;DR

**Fork the table — create `community_comments` — and lift the shared tree-build + tombstone rendering into `polar/kit/comments/`.**

The two surfaces share *behavior* (threading, soft-delete with tombstones, `visible/hidden/locked` mode), not *shape* (authorship model differs, FK targets differ, extra fields differ). Keep the behavior shared via a kit util; keep the data separate.

## Options considered

### Option A — Polymorphic (`target_type` + `target_id`)

One table. Add `target_type ENUM('lesson', 'post')` and rename `lesson_id` → `target_id`. Optionally replace `enrollment_id` with an `(author_user_id, author_enrollment_id)` pair so creators can author too.

| | |
|---|---|
| **Pros** | Single service, single repository, single tree-build, single moderation surface. Zero behavioral drift. |
| **Cons** | No FK enforcement on `target_id` (Postgres can't conditionally FK to two tables). Loses `ondelete CASCADE` safety — deleted posts/lessons leave orphan comment rows that must be reaped by a job. Composite `(target_type, target_id)` indexes are slightly slower than direct FKs. `enrollment_id` is wrong-shaped for community posts authored by creators (instructors aren't enrolled — they don't have a `CourseEnrollment` row). Forces an awkward `NULLable enrollment_id + NULLable author_user_id + CHECK exactly-one` constraint. Mixed querying (e.g. "all comments by user X across lessons and posts") becomes the hot path even when only one context is wanted. |

### Option B — Fork (`community_comments` is a new table)

Copy the column shape, swap FKs and author union, add community-only fields. Keep `lesson_comments` exactly as it is today.

| | |
|---|---|
| **Pros** | Clean FKs (`post_id REFERENCES community_posts ON DELETE CASCADE`). Distinct author union (`author_enrollment_id` OR `author_user_id`, never both). Independent `comments_mode` policy per surface. Community-only fields (`timestamp_seconds` for video posts) don't pollute the lesson table. Zero risk of regressing the production lesson-comments path while iterating on community moderation. Each surface's repository stays under 150 lines. |
| **Cons** | Two tables. Two repositories. Comment tree-build (`buildTree` in `CommentThread.tsx:29-41`) and tombstone-aware list serialization (`courses.py:987-1028`) live in two places unless lifted. Schema drift risk if one surface evolves and the other doesn't. |

### Option C — Hybrid (fork tables, lift behavior to `polar/kit/comments/`) — **chosen**

Fork the tables (Option B), but factor the *non-table* parts into a shared kit module:

```
polar/kit/comments/
├── __init__.py
├── tree.py          # build_tree(rows) → roots[] (used by both surfaces)
├── tombstone.py     # serialize_with_tombstones(comments, viewer_id) → list
└── moderation.py    # comments_mode enum + guard helpers
```

And in the frontend:

```
clients/apps/web/src/lib/comments/
├── build-tree.ts    # the same logic, ported from CommentThread.tsx
└── format.ts        # relative-time, author label resolution
```

| | |
|---|---|
| **Pros** | Keeps Option B's clean schema *and* Option A's "one place to change tree behavior." If we ever decide moderation rules should diverge (e.g. community gets pinned replies), it's a per-surface override of a shared base, not a divergent reimplementation. |
| **Cons** | One small refactor of the existing lesson-comment path to call the kit (low risk — same function, different import). |

## Decision criteria & scoring

| Criterion | A: Polymorphic | B: Fork | C: Hybrid |
|---|---|---|---|
| FK integrity / cascade safety | ✗ (orphan reaper needed) | ✓ | ✓ |
| Author-model fit (creator + student) | ✗ (CHECK constraint workaround) | ✓ | ✓ |
| Adding community-only fields (e.g. `timestamp_seconds`) | ✗ (pollutes lesson table) | ✓ | ✓ |
| Single source of truth for tree/tombstone logic | ✓ | ✗ | ✓ |
| Risk to production lesson-comments path | medium (schema change in hot path) | none | low (kit lift only) |
| Implementation cost | medium | low | low + small refactor |
| Long-term maintainability | medium | medium | high |

Option C wins because the *only* real downside of Option B (duplicated tree logic) is solved with ~80 lines of kit code, and the *only* real downside of Option A (no FK + bad author shape) is unfixable without significant compromises.

## Data shape — what `community_comments` will look like vs. `lesson_comments`

| Column | `lesson_comments` (existing) | `community_comments` (new) | Why different |
|---|---|---|---|
| `id` | uuid PK | uuid PK | — |
| `parent_id` | uuid → self CASCADE | uuid → self CASCADE | — |
| target FK | `lesson_id → course_lessons CASCADE` | `post_id → community_posts CASCADE` | different parent |
| author | `enrollment_id → course_enrollments NOT NULL` | `author_enrollment_id → course_enrollments NULL` **+** `author_user_id → users NULL` **+** `CHECK ((author_enrollment_id IS NOT NULL) <> (author_user_id IS NOT NULL))` | creators post too |
| `content` | text NOT NULL | text NOT NULL | — |
| `timestamp_seconds` | — | int NULL | video-post replies cluster on the scrubber |
| `created_at`, `modified_at`, `deleted_at` | TIMESTAMPTZ | TIMESTAMPTZ | shared RecordModel base |

Indexes (mirrors existing pattern):
- `ix_community_comments_post_id`
- `ix_community_comments_parent_id`
- `ix_community_comments_author_enrollment_id` (partial WHERE author_enrollment_id IS NOT NULL)
- `ix_community_comments_author_user_id` (partial WHERE author_user_id IS NOT NULL)

## What this decision unlocks / forecloses

**Unlocks:**
- Community gets pinned replies later (one new column on `community_comments`, no change to lessons).
- Lesson comments can keep their strict "students only" invariant — currently enforced by the NOT NULL `enrollment_id`.
- Per-surface notification rules ("notify on community reply" ≠ "notify on lesson reply" frequency caps).

**Forecloses:**
- A unified "all comments I've ever written" timeline becomes a UNION query instead of a single index scan. We don't ship this view today; if it becomes a feature, the UNION costs <10ms at our scale.

## Migration follow-up if we change our minds

If we later regret the fork, **moving from C → A is mechanical**: a one-shot migration that creates a unified `comments` table, copies both source tables in with their `target_type` set, swaps services to query the new table, then drops the old ones. No data loss, no API change (services were already kit-backed). Reverse direction (A → C) is much harder.

This asymmetry is the final reason to start with C.

## Open questions deferred to implementation

1. **Author display name for creators in community comments** — use `User.name`/`Organization.name`/instructor name from the course? *Default:* `course.instructor_name` if set, else `organization.name`. Resolves in `_load_authors` analog.
2. **Should creators be able to comment on lesson_comments?** *Out of scope for this decision — lesson comments stay students-only for now.*
3. **Hard cap on reply depth?** v3 shows two visual levels. Server allows N deep; UI flattens beyond level 2. Same rule both surfaces.
