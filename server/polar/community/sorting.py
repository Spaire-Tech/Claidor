from enum import StrEnum


class CommunityPostSortProperty(StrEnum):
    """Feed sort options surfaced as the left-rail "Sort" list. Not a
    free-form column sort — these are pre-baked queries the repository
    knows how to apply."""

    # Default: coalesce(pinned_at, published_at) DESC, id DESC.
    recent = "recent"

    # Top this week: most-reacted posts in the last 7 days.
    top_week = "top_week"

    # Only posts tagged 'question' that have zero comments. Resolves to
    # "no replies yet" in the feed header.
    unanswered = "unanswered"


# Seed tag slugs. Matches the v4 design's filter row. Labels stay
# creator-renamable but slugs are stable identifiers the code (and tag
# pill colors in CSS) look up by. The legacy `milestone` slug is still
# referenced by create_milestone_post but the lookup is None-tolerant —
# courses without the tag just skip the auto-post.
COMMUNITY_TAG_SLUGS_SEEDED = ("activity", "question", "win", "discussion")
