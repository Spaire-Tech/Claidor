from polar.exceptions import BadRequest, NotPermitted, PolarError, ResourceNotFound


class CommunityError(PolarError):
    """Base class for module-specific errors."""


class CommunityDisabled(NotPermitted):
    def __init__(self) -> None:
        super().__init__("Community is not enabled for this course.")


class CommunityNotEnrolled(ResourceNotFound):
    def __init__(self) -> None:
        # 404 (not 403) — the API never confirms a course exists if the
        # viewer has no relationship to it.
        super().__init__("Course not found or not enrolled.")


class CommentsLocked(NotPermitted):
    """Post-level comments_mode is 'locked' — existing replies render but
    no new ones can be created."""

    def __init__(self) -> None:
        super().__init__("Comments are locked.")


class CommentsHidden(NotPermitted):
    """Post-level comments_mode is 'hidden' — neither reads nor writes
    are permitted for non-creators."""

    def __init__(self) -> None:
        super().__init__("Comments are disabled.")


class InvalidParentComment(BadRequest):
    """The parent_id supplied on a reply doesn't belong to the same post."""

    def __init__(self) -> None:
        super().__init__("Invalid parent comment.")


class InvalidLessonReference(BadRequest):
    """`lesson_id` doesn't belong to the post's course."""

    def __init__(self) -> None:
        super().__init__("Invalid lesson reference.")


class InvalidTagReference(BadRequest):
    """`tag_id` doesn't belong to the post's course."""

    def __init__(self) -> None:
        super().__init__("Invalid tag reference.")


class InvalidMediaReference(BadRequest):
    """One or more file_ids on a post don't belong to the course's org,
    aren't the community_post_image service type, or haven't completed
    upload yet."""

    def __init__(self) -> None:
        super().__init__("Invalid media reference.")


class TagSlugInvalid(BadRequest):
    """Slug couldn't be derived from the label (empty after
    sanitization). Surfaces a friendly error rather than a 422 from the
    schema validator."""

    def __init__(self) -> None:
        super().__init__("Tag label must contain at least one letter or number.")


class TagSlugConflict(BadRequest):
    """A non-deleted tag with this slug already exists on the course.
    The partial-unique index in the migration enforces this at the
    DB level too — this check produces a clean 400 instead of a 500."""

    def __init__(self) -> None:
        super().__init__("A tag with this label already exists.")


class UnsupportedPostType(BadRequest):
    """Video posts are rejected until Phase 3 wires the Mux pipeline."""

    def __init__(self) -> None:
        super().__init__(
            "Video posts are not yet supported. "
            "Submit `type=text` for Phase 1."
        )


class PollNotFound(ResourceNotFound):
    """The post doesn't exist on this course, or carries no poll."""

    def __init__(self) -> None:
        super().__init__("Poll not found.")


class InvalidPollOption(BadRequest):
    """The option_id isn't one of the poll's options."""

    def __init__(self) -> None:
        super().__init__("Invalid poll option.")
