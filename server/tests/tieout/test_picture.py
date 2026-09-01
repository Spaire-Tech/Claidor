"""One picture of the model, and how each part of it was got.

Two rules from the founder, and this file exists for both.

> Resolve the model's structure once and store it. Every answer reads
> from that stored picture.

Three answers about one model contradicted each other — one said the
income statement was conventional, the next could not find a
depreciation line on it. The cause was not the wording: each question
built its own reading and nothing carried between them.

> Mark each part by how you got it. If you read the asset name off a
> cover cell, state it plainly. If you worked it out from sheet names
> or file names, show it as unconfirmed and ask me. Don't ask on files
> where you actually read the answer. And if you can't get a part at
> all, leave it blank. An empty field I can fill is fine. A confident
> wrong one is not.

So every test here is about which of those three a part landed in.
"""

from decimal import Decimal

from polar.tieout.agent.picture import READ, WORKED_OUT, as_prompt, picture_of
from polar.tieout.workbook import Cell, Workbook


def _cell(
    ref: str,
    *,
    value: float | None = None,
    row_label: str = "",
    formula: str | None = None,
) -> Cell:
    sheet, at = ref.split("!")
    return Cell(
        sheet=sheet,
        ref=ref,
        row=int("".join(c for c in at if c.isdigit())),
        column=1,
        value=None if value is None else Decimal(str(value)),
        formula=formula,
        row_label=row_label,
        column_label="",
    )


def _book(
    *cells: Cell,
    sheets: list[str] | None = None,
    words: dict[str, dict[int, str]] | None = None,
) -> Workbook:
    book = Workbook()
    book.cells = {one.ref: one for one in cells}
    book.sheets = sheets or sorted({one.sheet for one in cells})
    book.row_words = words or {}
    return book


class TestHowTheNameWasGot:
    def test_a_title_on_the_front_sheet_is_read(self) -> None:
        book = _book(
            _cell("Control Panel!C18", value=6e9, row_label="Equipment"),
            sheets=["Control Panel"],
            words={"Control Panel": {2: "CPO Semiconductor Manufacturing Project"}},
        )

        known = picture_of(book, filename="cpo_model_v2.xlsx").name

        assert known.value == "CPO Semiconductor Manufacturing Project"
        assert known.how == READ
        assert known.where == "Control Panel row 2"
        assert known.confirmed

    def test_a_read_name_is_never_asked_about(self) -> None:
        #: « Don't ask on files where you actually read the answer. »
        book = _book(
            _cell("Control Panel!C1", value=1),
            sheets=["Control Panel"],
            words={"Control Panel": {2: "Northbank Hospital PPP Model"}},
        )

        assert picture_of(book, filename="northbank.xlsx").to_ask() == []

    def test_with_no_title_it_is_worked_out_and_says_so(self) -> None:
        book = _book(_cell("Sheet1!A1", value=1), sheets=["Sheet1"])

        known = picture_of(book, filename="Northbank_Bid_Model_v22.xlsx").name

        assert known.value == "Northbank"
        assert known.how == WORKED_OUT
        assert not known.confirmed
        assert "unconfirmed" in known.said()

    def test_a_worked_out_name_is_the_thing_to_ask_about(self) -> None:
        book = _book(_cell("Sheet1!A1", value=1), sheets=["Sheet1"])

        assert "name" in picture_of(book, filename="Northbank_Model.xlsx").to_ask()

    def test_a_file_that_says_nothing_leaves_it_blank(self) -> None:
        #: « An empty field I can fill is fine. A confident wrong one is
        #: not. » Nothing is invented from the sheet names.
        book = _book(_cell("Sheet1!A1", value=1), sheets=["Sheet1"])

        known = picture_of(book, filename="v3.xlsx").name

        assert known.value == ""
        assert known.how == ""


class TestWhatItProduces:
    def test_a_bottom_line_on_an_output_sheet_is_read(self) -> None:
        book = _book(
            _cell("Summary!B4", value=0.11, row_label="Equity IRR", formula="=X1"),
            sheets=["Summary"],
        )

        known = picture_of(book).produces

        assert "Equity IRR" in known.value
        assert known.how == READ

    def test_a_model_with_no_such_row_leaves_it_blank(self) -> None:
        book = _book(_cell("Calc!B4", value=1, row_label="Opex"), sheets=["Calc"])

        assert picture_of(book).produces.value == ""


class TestTheTermIsNeverGuessed:
    def test_no_axis_means_no_term(self) -> None:
        #: A model's term inferred from a column count is exactly the
        #: confident wrong answer the founder ruled out.
        book = _book(_cell("Calc!B4", value=1), sheets=["Calc"])

        picture = picture_of(book, axes={})

        assert picture.term.value == ""
        assert not picture.axis_found


class TestWhatThePromptSays:
    def test_a_missing_part_is_said_out_loud_not_left_out(self) -> None:
        #: A field that is simply absent from the prompt reads as a
        #: field that did not matter.
        said = as_prompt(picture_of(_book(_cell("S!A1", value=1), sheets=["S"])))

        assert "What it is about: **not known**" in said

    def test_a_worked_out_part_is_marked_in_the_prompt(self) -> None:
        book = _book(_cell("S!A1", value=1), sheets=["S"])

        said = as_prompt(picture_of(book, filename="Northbank_Model.xlsx"))

        assert "unconfirmed" in said

    def test_the_missing_axis_is_given_as_a_sentence_to_reuse(self) -> None:
        #: The prompt hands over the exact wording, because this is the
        #: line the agent got wrong three times.
        said = as_prompt(picture_of(_book(_cell("S!A1", value=1), sheets=["S"])))

        assert "I could not find the period axis" in said
        assert "never « the model has no" in said

    def test_code_in_the_file_is_named_and_marked_unread(self) -> None:
        book = _book(_cell("S!A1", value=1), sheets=["S"])
        book.very_hidden_sheets = ("Module1",)

        said = as_prompt(picture_of(book, macros=["Module1"]))

        assert "**not read**" in said
        assert "never say what it does" in said


class TestOnePictureIsOnePicture:
    def test_the_same_file_reads_the_same_way_twice(self) -> None:
        #: The property the whole module exists for. Two questions about
        #: one model must not produce two readings of it.
        book = _book(
            _cell("Control Panel!C1", value=1),
            _cell("Summary!B4", value=0.1, row_label="Equity IRR", formula="=1"),
            sheets=["Control Panel", "Summary"],
            words={"Control Panel": {2: "Northbank Hospital PPP"}},
        )

        first = as_prompt(picture_of(book, filename="n.xlsx", version=3))
        second = as_prompt(picture_of(book, filename="n.xlsx", version=3))

        assert first == second


class TestThePictureCarriesTheRows:
    """The assistant said the income statement had no depreciation line.
    It has one. The picture now carries a statement sheet's rows, so an
    answer that claims a line is missing contradicts its own prompt."""

    def test_a_statement_sheet_tells_its_rows(self) -> None:
        from decimal import Decimal

        from polar.tieout.agent.picture import as_prompt, picture_of
        from polar.tieout.workbook import Cell, Workbook

        book = Workbook()
        for row, label in ((7, "Revenue"), (9, "Total Depreciation Expense")):
            ref = f"Income Statement!E{row}"
            book.cells[ref] = Cell(
                sheet="Income Statement",
                ref=ref,
                row=row,
                column=5,
                value=Decimal(1),
                formula=None,
                row_label=label,
                column_label="Year 1",
            )
        book.sheets = ["Income Statement"]
        #: A statement sheet, not a divider: the role reads the sheet's
        #: population and formulas, and an empty fixture reads as a tab.
        book.populated = {"Income Statement": 40}
        text = as_prompt(picture_of(book))
        assert (
            "Rows on « Income Statement »: Revenue; Total Depreciation Expense." in text
        )
        assert "do not say a line is missing" in text
