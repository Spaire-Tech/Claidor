"""`--calls` lists every call with the time since the previous call to the
same model, what the model reused and what it stored again, and says why a
Claude call stored a large part of its prompt again."""

from datetime import UTC, datetime, timedelta

from scripts.desktop_usage_report import call_lines
from simeon.models import DesktopUsage

START = datetime(2026, 10, 13, 22, 41, 7, tzinfo=UTC)


def _call(
    after: timedelta,
    model: str,
    *,
    fresh: int = 4,
    reused: int = 0,
    stored: int = 0,
    output: int = 300,
    provider: str = "anthropic",
    reason: str = "chat",
    status: int = 200,
) -> DesktopUsage:
    return DesktopUsage(
        created_at=START + after,
        model=model,
        provider=provider,
        reason=reason,
        input_tokens=fresh,
        cache_read_tokens=reused,
        cache_creation_tokens=stored,
        output_tokens=output,
        credits=1_000,
        upstream_status=status,
    )


def _notes(rows: list[DesktopUsage]) -> list[str]:
    # The note is everything after the dollars column.
    return [line.split("0.003", 1)[1].strip() for line in call_lines(rows)[1:]]


def test_a_message_after_a_long_pause_says_the_copy_had_expired() -> None:
    rows = [
        _call(timedelta(0), "claude-sonnet-5-5", stored=89_385),
        _call(timedelta(seconds=9), "claude-haiku-5-5", stored=1_000, reason="memory"),
        # "check my emails", twelve minutes later: everything stored again.
        _call(timedelta(minutes=12), "claude-sonnet-5-5", stored=93_818),
        # The next step of the same message reads it back.
        _call(
            timedelta(minutes=12, seconds=20),
            "claude-sonnet-5-5",
            reused=93_822,
            stored=19_492,
        ),
    ]
    lines = call_lines(rows)
    assert "12m 00s" in lines[3], "the gap is to the previous call to the same model"
    assert _notes(rows) == [
        "first call to this model in the window: stored in full",
        "",
        "over 5 min since this model's last call: its copy had expired",
        "",
    ]


def test_a_store_within_five_minutes_points_at_the_request() -> None:
    rows = [
        _call(timedelta(0), "claude-sonnet-5-5", stored=89_385),
        _call(timedelta(minutes=2), "claude-sonnet-5-5", reused=23_000, stored=70_818),
    ]
    assert (
        _notes(rows)[1]
        == "within 5 min, yet stored again: the request's start changed, or another chat"
    )


def test_openai_and_small_stores_carry_no_note() -> None:
    rows = [
        _call(timedelta(0), "gpt-6-sol", provider="openai", fresh=90_000),
        _call(
            timedelta(minutes=30),
            "gpt-6-sol",
            provider="openai",
            fresh=4_000,
            reused=90_000,
        ),
        _call(timedelta(minutes=31), "claude-sonnet-5-5", stored=4_000),
    ]
    assert _notes(rows) == ["", "", ""]


def test_a_refused_call_says_so() -> None:
    rows = [_call(timedelta(0), "claude-sonnet-5-5", status=529, output=0)]
    assert _notes(rows) == ["refused by the provider (529)"]
