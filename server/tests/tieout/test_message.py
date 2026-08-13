"""Reading an email for the figures it asserts.

The reader itself is the memo's and is tested there. What is tested here
is the part that is genuinely different, and every case below is a way a
message stops being the thing its writer wrote: Outlook's HTML, the quoted
thread underneath a reply, and a signature block full of numbers that are
not figures.

Each of those, read as the message, produces a **false positive** — a
banker told their correct sentence is wrong about a figure somebody else
typed three weeks ago. That is the one failure this product cannot afford,
so it is the one this file is mostly about.
"""

from polar.tieout.message import paragraphs_of, read_message


class TestTheBody:
    def test_outlooks_html_becomes_paragraphs(self) -> None:
        body = (
            "<html><head><style>p { margin: 0.75in; font-size: 11pt }</style></head>"
            "<body><p>FY24 Adjusted EBITDA is $41.9m.</p>"
            "<p>Revenue was $228.9mm.</p></body></html>"
        )
        assert read_message("", body).figures != []
        printed = {one.printed for one in read_message("", body).figures}
        assert "$41.9m" in printed
        assert "$228.9mm" in printed

    def test_the_inline_stylesheet_is_not_read(self) -> None:
        """Word writes a stylesheet into the body, and CSS is all numbers.

        `0.75in` and `11pt` are not figures, and a reader that took them
        would report drift against a margin.
        """
        body = (
            "<style>p { margin: 0.75in; line-height: 1.4; font-size: 11pt }</style>"
            "<p>Adjusted EBITDA is $41.9m.</p>"
        )
        printed = [one.printed for one in read_message("", body).figures]
        assert printed == ["$41.9m"]

    def test_a_line_break_ends_a_paragraph(self) -> None:
        """Two claims on two lines are two claims.

        Run together, « ... is $41.9m Revenue was $228.9mm » names the
        second figure « is $41.9m Revenue was », which is a label that
        matches nothing and a figure nobody checks.
        """
        text = paragraphs_of("Adjusted EBITDA is $41.9m<br>Revenue was $228.9mm")
        assert "Adjusted EBITDA is $41.9m" in text.split("\n")
        assert "Revenue was $228.9mm" in text.split("\n")

    def test_plain_text_is_read_as_it_stands(self) -> None:
        figures = read_message(
            "", "Adjusted EBITDA is $41.9m.\nRevenue was $228.9mm.", html=False
        ).figures
        assert len(figures) == 2


class TestWhatIsNotTheMessage:
    def test_the_quoted_thread_is_not_read(self) -> None:
        """The figures under a reply were written by somebody else.

        Reporting a drift against them is a finding whose only available
        fix is « edit a message you did not send ».
        """
        body = (
            "<p>Confirming: FY24 Adjusted EBITDA is $41.9m.</p>"
            "<p>From: Helena Vos</p>"
            "<p>Can you confirm the $42.6m figure in the deck?</p>"
        )
        printed = [one.printed for one in read_message("", body).figures]
        assert printed == ["$41.9m"]

    def test_the_older_conventions_too(self) -> None:
        for quote in (
            "On 18 March 2026 at 08:22, Helena Vos wrote:",
            "-----Original Message-----",
            "________________________________",
        ):
            body = f"<p>EBITDA is $41.9m.</p><p>{quote}</p><p>Was it $42.6m?</p>"
            printed = [one.printed for one in read_message("", body).figures]
            assert printed == ["$41.9m"], quote

    def test_a_chevron_quote_is_skipped_without_ending_the_message(self) -> None:
        """Interleaved replies are ordinary, so a « > » line is dropped
        rather than treated as the end of what the writer wrote."""
        body = "<p>&gt; Was it $42.6m?</p><p>No — FY24 Adjusted EBITDA is $41.9m.</p>"
        printed = [one.printed for one in read_message("", body).figures]
        assert printed == ["$41.9m"]

    def test_the_signature_is_not_read(self) -> None:
        body = (
            "<p>FY24 Adjusted EBITDA is $41.9m.</p>"
            "<p>Kind regards</p>"
            "<p>James Mercer | Rothmoor | 20 Finsbury Circus | +44 20 7946 0958</p>"
        )
        printed = [one.printed for one in read_message("", body).figures]
        assert printed == ["$41.9m"]


class TestTheSubject:
    def test_the_subject_is_a_claim_like_any_other(self) -> None:
        """It is the line people read without opening anything."""
        found = read_message(
            "Northgate — FY24 Adjusted EBITDA of $41.9m", "<p>See attached.</p>"
        ).figures
        assert [one.printed for one in found] == ["$41.9m"]
        assert found[0].location == "paragraph 1"

    def test_a_subject_with_no_figure_still_shifts_nothing(self) -> None:
        """The body's paragraph numbers stay meant for the body."""
        found = read_message("Northgate", "<p>Ignore.</p><p>EBITDA is $41.9m.</p>")
        assert [one.location for one in found.figures] == ["paragraph 3"]
