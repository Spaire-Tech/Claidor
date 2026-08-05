"""Shared comment-thread utilities.

Both lesson comments and community comments share the same threaded-with-
tombstones behavior: a soft-deleted parent is included as a tombstone in
the returned list so its replies stay reachable. This kit holds the parts
of that logic that don't depend on which table the rows came from.

See docs/plans/community-feed-decision-comments-table.md for the
tables-stay-separate / behavior-stays-shared rationale ("Option C").
"""

from polar.kit.comments.tree import (
    CommentLike,
    find_orphan_parent_ids,
    merge_with_tombstones,
)

__all__ = [
    "CommentLike",
    "find_orphan_parent_ids",
    "merge_with_tombstones",
]
