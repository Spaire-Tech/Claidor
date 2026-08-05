from datetime import datetime
from typing import Any

from pydantic import UUID4, Field

from polar.kit.schemas import Schema, TimestampedSchema


class AnalysisCreate(Schema):
    organization_id: UUID4 | None = Field(
        default=None,
        description=(
            "The ID of the organization running the analysis. "
            "**Required unless you use an organization token.**"
        ),
    )
    ref: str = Field(
        min_length=1,
        max_length=500,
        description=(
            "The pasted body-of-work reference: a YouTube @handle, channel"
            " URL, or raw channel id."
        ),
    )
    faq_answer: str | None = Field(
        default=None,
        max_length=2000,
        description=(
            'Optional answer to "what do people keep asking you about?" —'
            " can also be provided later via PATCH while the analysis runs."
        ),
    )


class AnalysisFaqUpdate(Schema):
    faq_answer: str = Field(
        min_length=1,
        max_length=2000,
        description=(
            "The creator's answer to \"what do people keep asking you"
            ' about?". Picked up by the deep pass if it arrives in time;'
            " harmlessly stored otherwise."
        ),
    )


class Analysis(TimestampedSchema):
    id: UUID4
    organization_id: UUID4
    input_ref: str = Field(description="What the creator pasted, verbatim.")
    status: str = Field(description="queued | mirror_ready | completed | failed")
    failure_reason: str | None = Field(
        default=None,
        description=(
            "Typed reason when status is failed: not_youtube |"
            " channel_not_found | channel_too_small | quota_exhausted |"
            " upstream_unavailable | ai_unavailable | ai_output_invalid."
            " The wizard maps each to warm fork copy — never a raw error."
        ),
    )
    channel: dict[str, Any] | None = Field(
        default=None,
        description=(
            "Resolved channel snapshot (title, handle, avatar_url,"
            " subscriber_count, video_count, created_at) — the instant"
            " confirmation moment."
        ),
    )
    faq_answer: str | None = None
    mirror: dict[str, Any] | None = Field(
        default=None,
        description=(
            "Fast-pass evidence (pure stats): top outlier videos with"
            " ratios, views, and verbatim demand quotes."
        ),
    )
    proposals: dict[str, Any] | None = Field(
        default=None,
        description=(
            "Deep-pass output after the anti-fabrication gate: proposals"
            " (0-3, receipts attached, three-status footage map), banked"
            " themes, flagship flag, no_proposal_reason."
        ),
    )
    recipe_version: str | None = None
    mirror_ready_at: datetime | None = None
    completed_at: datetime | None = None
