"""Pure helpers for threaded comment lists.

Two operations both `lesson_comments` and `community_comments` need:

1. Given the visible (non-deleted) comments, find which parent IDs are
   referenced but missing — those parents have been soft-deleted and
   need to be pulled in as tombstones so their replies stay reachable.

2. Given the original visible list + the fetched tombstone parents,
   return a single created-at-ordered list with the tombstones spliced in.

These don't do any IO — the caller fetches the tombstones with whatever
repository / WHERE clause makes sense for its table. The kit just owns
the orphan detection and merge-sort.
"""

from collections.abc import Iterable, Sequence
from datetime import datetime
from typing import Protocol
from uuid import UUID


class CommentLike(Protocol):
    """Structural shape both LessonComment and CommunityComment satisfy.

    Only the four columns the threading logic actually reads are listed —
    `id`, `parent_id`, `created_at`. The Protocol is `runtime_checkable=False`
    on purpose; the kit only relies on attribute access, not isinstance.
    """

    id: UUID
    parent_id: UUID | None
    created_at: datetime


def find_orphan_parent_ids(visible: Sequence[CommentLike]) -> set[UUID]:
    """Return the set of `parent_id` values that point to a comment NOT
    in the visible list.

    The caller uses this to fetch the soft-deleted parents so the reply
    tree stays renderable. Returns an empty set when every reply's parent
    is already in `visible`.
    """
    visible_ids = {c.id for c in visible}
    return {
        c.parent_id
        for c in visible
        if c.parent_id is not None and c.parent_id not in visible_ids
    }


def merge_with_tombstones[T: CommentLike](
    visible: Sequence[T],
    tombstones: Iterable[T],
) -> list[T]:
    """Combine the visible list and the fetched tombstones into a single
    chronologically-sorted list.

    The returned list is a fresh `list[T]`; the inputs are not mutated.
    When `tombstones` is empty the result is just a list copy of
    `visible` — same ordering it already had if it was created-at sorted
    upstream.
    """
    combined = list(visible)
    extras = list(tombstones)
    if not extras:
        return combined
    combined.extend(extras)
    combined.sort(key=lambda c: c.created_at)
    return combined
