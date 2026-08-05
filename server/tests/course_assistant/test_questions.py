"""Unit tests for Phase 5 question-log helpers (pure logic, no DB / network).

The aggregation queries live in the repository and are exercised by the
DB-backed suite; here we pin the normalization that decides how questions
cluster, plus the outcome-validation contract.
"""

from polar.course_assistant.service import (
    QUESTION_OUTCOMES,
    normalize_question,
)


class TestNormalizeQuestion:
    def test_lowercases_and_trims(self) -> None:
        assert normalize_question("  How DO I Price?  ") == "how do i price"

    def test_collapses_internal_whitespace(self) -> None:
        assert normalize_question("how   do\ti\nprice") == "how do i price"

    def test_strips_surrounding_punctuation(self) -> None:
        assert normalize_question("How do I price my course???") == (
            "how do i price my course"
        )

    def test_trivial_phrasings_cluster_to_same_key(self) -> None:
        a = normalize_question("How do I price my course?")
        b = normalize_question("how do i price my course")
        c = normalize_question("  How do I PRICE my course!  ")
        assert a == b == c

    def test_distinct_questions_do_not_collide(self) -> None:
        assert normalize_question("How do I price?") != normalize_question(
            "How do I refund?"
        )

    def test_unicode_is_nfkc_folded(self) -> None:
        # Fullwidth + accented input folds to a stable, casefolded key.
        assert normalize_question("ＣＡＦＥ́ tips") == normalize_question(
            "café tips"
        )

    def test_empty_and_punctuation_only(self) -> None:
        assert normalize_question("") == ""
        assert normalize_question("   ") == ""
        # All-punctuation falls back to the collapsed form (never crashes).
        assert normalize_question("???") == "???"

    def test_caps_length_to_grouping_column_width(self) -> None:
        assert len(normalize_question("word " * 600)) <= 500


class TestOutcomes:
    def test_known_outcomes(self) -> None:
        assert QUESTION_OUTCOMES == {"answered", "refused", "error"}
