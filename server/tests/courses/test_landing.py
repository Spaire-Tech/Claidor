"""Unit tests for the landing_overrides helpers (merge + validation).

Pure functions, no DB — they back the editor's save path (deep merge so a
stale client blob can't wipe sibling keys) and the input validation wired into
the course schemas (size cap, script-scheme rejection, object-position).
"""

import pytest

from polar.course.landing import (
    MAX_LANDING_OVERRIDES_BYTES,
    merge_landing_overrides,
    validate_landing_overrides,
    validate_object_position,
)


class TestMergeLandingOverrides:
    def test_adds_new_key_without_touching_existing(self) -> None:
        existing = {"ai_hero": {"description": "old"}, "ai_faq": [{"q": "a", "a": "b"}]}
        result = merge_landing_overrides(existing, {"theme_mode": "dark"})
        assert result == {
            "ai_hero": {"description": "old"},
            "ai_faq": [{"q": "a", "a": "b"}],
            "theme_mode": "dark",
        }

    def test_partial_nested_patch_keeps_siblings(self) -> None:
        existing = {"ai_hero": {"description": "old", "eyebrow": "keep"}}
        result = merge_landing_overrides(existing, {"ai_hero": {"description": "new"}})
        assert result == {"ai_hero": {"description": "new", "eyebrow": "keep"}}

    def test_stale_blob_does_not_wipe_unknown_sibling(self) -> None:
        # Server already has ai_faq written by a concurrent job; a client that
        # never saw it patches ai_hero. ai_faq must survive.
        existing = {"ai_faq": [{"q": "x", "a": "y"}]}
        result = merge_landing_overrides(existing, {"ai_hero": {"description": "n"}})
        assert result["ai_faq"] == [{"q": "x", "a": "y"}]
        assert result["ai_hero"] == {"description": "n"}

    def test_none_value_deletes_key(self) -> None:
        existing = {"portrait_url": "https://x/y.jpg", "theme_mode": "dark"}
        result = merge_landing_overrides(existing, {"portrait_url": None})
        assert result == {"theme_mode": "dark"}

    def test_list_replaces_wholesale(self) -> None:
        existing = {"badges": ["a", "b", "c", "d"]}
        result = merge_landing_overrides(existing, {"badges": ["x", "y"]})
        assert result == {"badges": ["x", "y"]}

    def test_none_existing_treated_as_empty(self) -> None:
        assert merge_landing_overrides(None, {"theme_mode": "light"}) == {
            "theme_mode": "light"
        }

    def test_does_not_mutate_inputs(self) -> None:
        existing = {"ai_hero": {"description": "old"}}
        patch = {"ai_hero": {"eyebrow": "new"}}
        merge_landing_overrides(existing, patch)
        assert existing == {"ai_hero": {"description": "old"}}
        assert patch == {"ai_hero": {"eyebrow": "new"}}


class TestValidateLandingOverrides:
    def test_none_passes(self) -> None:
        assert validate_landing_overrides(None) is None

    def test_normal_blob_passes(self) -> None:
        blob = {
            "ai_hero": {"description": "A grounded line."},
            "media": {"cover": {"kind": "image", "url": "https://cdn/x.jpg"}},
            "badges": ["All Levels"],
        }
        assert validate_landing_overrides(blob) == blob

    def test_rejects_javascript_scheme(self) -> None:
        with pytest.raises(ValueError):
            validate_landing_overrides(
                {"media": {"cover": {"url": "javascript:alert(1)"}}}
            )

    def test_rejects_scheme_with_leading_whitespace_and_case(self) -> None:
        with pytest.raises(ValueError):
            validate_landing_overrides({"x": "  JavaScript:alert(1)"})

    def test_rejects_data_html(self) -> None:
        with pytest.raises(ValueError):
            validate_landing_overrides({"x": "data:text/html;base64,PHN2Zz4="})

    def test_rejects_oversized_blob(self) -> None:
        big = {"text": "a" * (MAX_LANDING_OVERRIDES_BYTES + 10)}
        with pytest.raises(ValueError):
            validate_landing_overrides(big)

    def test_allows_normal_data_image(self) -> None:
        # data:image is not in the blocklist (only data:text/html is).
        blob = {"x": "data:image/png;base64,iVBORw0KGgo="}
        assert validate_landing_overrides(blob) == blob


class TestValidateObjectPosition:
    @pytest.mark.parametrize(
        "value",
        ["50% 30%", "center", "top left", "left top", "12px 30%", "50%", None, ""],
    )
    def test_valid(self, value: str | None) -> None:
        # Should not raise; empty string normalizes to None.
        result = validate_object_position(value)
        if value in (None, ""):
            assert result is None

    @pytest.mark.parametrize(
        "value",
        [
            "red;width:99vw",
            "url(x)",
            "50% 30% 10%",
            "expression(alert(1))",
            "50%;",
            "center }",
        ],
    )
    def test_invalid(self, value: str) -> None:
        with pytest.raises(ValueError):
            validate_object_position(value)
