"""Reading CourtListener's bulk export.

The format facts here were established against the real 50 GB file, not
inferred from documentation, because both would fail silently if wrong:
the CSV escapes quotes with a backslash rather than by doubling them, and
opinion text carries raw newlines inside quoted fields.

The sample below is written in the file's own conventions so a regression
in the parser shows up as a failing test rather than as a corpus full of
quietly mangled judgments.
"""

import bz2
import io

import pytest

from polar.registry.bulk import (
    _StreamingBz2,
    iter_rows,
    opinions_url,
    strip_markup,
    text_of,
)
from polar.registry.courtlistener import (
    NON_HOLDING_TYPES,
    normalise_opinion_type,
)

HEADER = (
    "id,date_created,date_modified,author_str,per_curiam,joined_by_str,type,"
    "sha1,page_count,download_url,local_path,plain_text,html,html_lawbox,"
    "html_columbia,html_anon_2020,xml_harvard,xml_scan,html_with_citations,"
    "extracted_by_ocr,author_id,cluster_id"
)


def _row(opinion_id: str, plain_text: str, opinion_type: str = "010combined") -> str:
    """One row, quoted and escaped the way the real export does it."""
    escaped = plain_text.replace("\\", "\\\\").replace('"', '\\"')
    cells = [
        opinion_id,
        "2016-12-06 20:08:36+00",
        "2025-07-23 13:59:55+00",
        "Barnes",
        "f",
        "",
        opinion_type,
        "sha1here",
        "14",
        "http://example/x.pdf",
        "pdf/x.pdf",
        escaped,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "f",
        "",
        "999",
    ]
    return ",".join(f'"{c}"' for c in cells)


def _stream(body: str) -> io.RawIOBase:
    raw = bz2.compress(body.encode("utf-8"))
    return _StreamingBz2(iter([raw[i : i + 64] for i in range(0, len(raw), 64)]))


class TestParsingTheBulkFormat:
    def test_a_plain_row_is_read(self) -> None:
        body = HEADER + "\n" + _row("4105007", "The indemnity provision reads…") + "\n"
        rows = list(iter_rows(_stream(body)))

        assert len(rows) == 1
        assert rows[0]["id"] == "4105007"
        assert rows[0]["plain_text"] == "The indemnity provision reads…"

    def test_text_containing_newlines_stays_one_row(self) -> None:
        # Opinion text always contains newlines. Splitting on them — the
        # obvious way to stream a large file — would shred every judgment.
        judgment = "IN THE COURT OF APPEALS\n\nNO. 2015-CA-00646\n\nPARTIES\n"
        body = HEADER + "\n" + _row("1", judgment) + "\n" + _row("2", "second") + "\n"
        rows = list(iter_rows(_stream(body)))

        assert [r["id"] for r in rows] == ["1", "2"]
        assert rows[0]["plain_text"] == judgment

    def test_quotes_are_backslash_escaped_not_doubled(self) -> None:
        # The decisive format fact. Parsed with Python's default
        # doublequote=True, a 12 MB sample of the real file gave 76,172 rows
        # of which 76,151 had the wrong field count; with escapechar it gave
        # 250 rows and none malformed. Getting this wrong corrupts text
        # rather than raising.
        quoted = 'The clause said "indemnify and hold harmless" throughout.'
        body = HEADER + "\n" + _row("1", quoted) + "\n"
        rows = list(iter_rows(_stream(body)))

        assert len(rows) == 1
        assert rows[0]["plain_text"] == quoted

    def test_a_backslash_in_the_text_survives(self) -> None:
        body = HEADER + "\n" + _row("1", r"path\to\thing and \"quoted\"") + "\n"
        rows = list(iter_rows(_stream(body)))
        assert rows[0]["plain_text"] == r"path\to\thing and \"quoted\""

    def test_a_desynchronised_row_is_skipped_not_yielded_half_read(self) -> None:
        body = HEADER + "\n" + '"1","only","three"\n' + _row("2", "fine") + "\n"
        rows = list(iter_rows(_stream(body)))
        assert [r["id"] for r in rows] == ["2"]

    def test_the_stream_survives_chunk_boundaries_mid_field(self) -> None:
        # 64-byte chunks split rows, fields and multi-byte characters. The
        # decompressor and the CSV reader have to cope; the real download
        # arrives in arbitrary pieces too.
        long_text = ("Motifs — accentué. " * 400) + '\nwith "quotes"\n'
        body = HEADER + "\n" + _row("1", long_text) + "\n"
        rows = list(iter_rows(_stream(body)))
        assert rows[0]["plain_text"] == long_text


class TestChoosingText:
    def test_plain_text_is_preferred(self) -> None:
        row = {"plain_text": "the opinion", "html": "<p>markup</p>"}
        assert text_of(row) == ("the opinion", "plain_text")

    def test_html_is_a_fallback_with_tags_removed(self) -> None:
        row = {"plain_text": "", "html_with_citations": "<p>Held: <b>void</b></p>"}
        found = text_of(row)
        assert found is not None
        text, column = found
        assert column == "html_with_citations"
        assert "<" not in text
        assert "Held" in text
        assert "void" in text

    def test_a_row_with_no_text_is_reported_rather_than_faked(self) -> None:
        # An opinion we cannot read is a gap in the corpus. Returning an
        # empty string would let it pass as a successful fetch.
        assert text_of({"plain_text": "", "html": "  "}) is None
        assert text_of({}) is None

    def test_entities_are_unescaped(self) -> None:
        found = text_of({"html": "<p>Smith &amp; Jones &#8212; held</p>"})
        assert found is not None
        assert "&amp;" not in found[0]
        assert "Smith & Jones" in found[0]

    def test_stripping_markup_keeps_the_words(self) -> None:
        assert strip_markup("<div><p>one</p><p>two</p></div>").split() == [
            "one",
            "two",
        ]


class TestOpinionTypeVocabularies:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("010combined", "combined"),
            ("020lead", "lead"),
            ("040dissent", "dissent"),
            ("100trialcourt", "trialcourt"),
            ("combined-opinion", "combined"),
            ("lead-opinion", "lead"),
            ("dissent", "dissent"),
            ("concurrence-opinion", "concurrence"),
            ("in-part-opinion", "in-part"),
            (None, ""),
            ("", ""),
        ],
    )
    def test_both_vocabularies_reduce_to_the_same_word(
        self, raw: str | None, expected: str
    ) -> None:
        # The search API and the bulk export name the same document
        # differently. Verified against real data from each.
        assert normalise_opinion_type(raw) == expected

    def test_dissents_are_non_holding_in_either_spelling(self) -> None:
        assert normalise_opinion_type("040dissent") in NON_HOLDING_TYPES
        assert normalise_opinion_type("dissent") in NON_HOLDING_TYPES
        assert normalise_opinion_type("010combined") not in NON_HOLDING_TYPES
        assert normalise_opinion_type("020lead") not in NON_HOLDING_TYPES


class TestSnapshotUrl:
    def test_the_snapshot_is_pinned_in_the_url(self) -> None:
        # Which quarterly snapshot an opinion came from is provenance. A
        # date that rolled forward on its own would make a run
        # unreproducible without anyone noticing.
        assert opinions_url("2026-06-30").endswith("/opinions-2026-06-30.csv.bz2")
