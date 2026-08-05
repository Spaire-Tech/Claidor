from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from polar.kit.comments import (
    find_orphan_parent_ids,
    merge_with_tombstones,
)


# Minimal stand-in for LessonComment / CommunityComment — both production
# models satisfy the same `CommentLike` Protocol the kit reads from.
@dataclass
class FakeComment:
    id: UUID
    parent_id: UUID | None
    created_at: datetime


def _at(seconds_from_epoch: int) -> datetime:
    return datetime(2026, 1, 1, tzinfo=UTC) + timedelta(seconds=seconds_from_epoch)


class TestFindOrphanParentIds:
    def test_empty_visible_returns_empty(self) -> None:
        assert find_orphan_parent_ids([]) == set()

    def test_no_replies_returns_empty(self) -> None:
        rows = [
            FakeComment(id=uuid4(), parent_id=None, created_at=_at(0)),
            FakeComment(id=uuid4(), parent_id=None, created_at=_at(1)),
        ]
        assert find_orphan_parent_ids(rows) == set()

    def test_all_parents_visible_returns_empty(self) -> None:
        parent_id = uuid4()
        rows = [
            FakeComment(id=parent_id, parent_id=None, created_at=_at(0)),
            FakeComment(id=uuid4(), parent_id=parent_id, created_at=_at(1)),
        ]
        assert find_orphan_parent_ids(rows) == set()

    def test_missing_parent_is_orphan(self) -> None:
        missing_parent_id = uuid4()
        reply = FakeComment(
            id=uuid4(), parent_id=missing_parent_id, created_at=_at(0)
        )
        assert find_orphan_parent_ids([reply]) == {missing_parent_id}

    def test_dedupes_orphan_ids(self) -> None:
        # Two replies under the same soft-deleted parent — orphan set
        # should hold one entry, not two.
        missing_parent_id = uuid4()
        rows = [
            FakeComment(
                id=uuid4(), parent_id=missing_parent_id, created_at=_at(0)
            ),
            FakeComment(
                id=uuid4(), parent_id=missing_parent_id, created_at=_at(1)
            ),
        ]
        assert find_orphan_parent_ids(rows) == {missing_parent_id}


class TestMergeWithTombstones:
    def test_no_tombstones_returns_visible_as_list(self) -> None:
        rows = [
            FakeComment(id=uuid4(), parent_id=None, created_at=_at(0)),
            FakeComment(id=uuid4(), parent_id=None, created_at=_at(1)),
        ]
        merged = merge_with_tombstones(rows, [])
        assert merged == rows
        # And it's a fresh list — mutating it must not touch the input.
        merged.pop()
        assert len(rows) == 2

    def test_tombstones_spliced_chronologically(self) -> None:
        parent = FakeComment(id=uuid4(), parent_id=None, created_at=_at(0))
        reply1 = FakeComment(id=uuid4(), parent_id=parent.id, created_at=_at(2))
        reply2 = FakeComment(id=uuid4(), parent_id=parent.id, created_at=_at(4))
        # `visible` only has the replies (parent was soft-deleted, so it
        # isn't in the default repo statement). The kit splices the
        # tombstone parent back into the correct chronological slot.
        visible = [reply1, reply2]
        merged = merge_with_tombstones(visible, [parent])
        assert merged == [parent, reply1, reply2]

    def test_input_visible_is_not_mutated(self) -> None:
        a = FakeComment(id=uuid4(), parent_id=None, created_at=_at(0))
        b = FakeComment(id=uuid4(), parent_id=None, created_at=_at(2))
        tombstone = FakeComment(id=uuid4(), parent_id=None, created_at=_at(1))
        visible = [a, b]
        merge_with_tombstones(visible, [tombstone])
        assert visible == [a, b]
