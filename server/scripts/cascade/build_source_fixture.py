"""Build the audited accounts the Cascade model's inputs come from.

The chain stops at a typed input — `Model!D6 = 228.9`, a number somebody
entered — and the next question is *where did that come from*. These are
the answer: a set of statutory accounts with the same figures in them, so
the last hop can be checked rather than asserted.

**Every figure is read out of `cascade_model.xlsx` at build time**, the
same rule the memo fixture follows. A fixture with hand-copied numbers
disagrees with its own model the first time either is touched, and then
the test measures the transcription rather than the checker.

Two files, because the interesting case is not a typo:

`cascade_accounts.pdf` agrees with the model, and is what a clean
crosscheck looks like. `cascade_accounts_restated.pdf` is the same
accounts with two figures restated — which is what actually happens: the
auditors move something between line items in the final signed set, and
the model, built against the draft, never catches up. Nobody re-keys a
model when the accounts are signed, and that is exactly the mistake
nothing but this check would find.

    uv run python -m scripts.cascade.build_source_fixture

Written with `fpdf2`, already a dependency. The prose is the register real
accounts use — « for the year ended 31 December 2025 » rather than
« FY2025A » — because a fixture that writes the model's own vocabulary
back at it proves nothing about reading a document somebody else wrote.
"""

from decimal import Decimal
from pathlib import Path

from polar.tieout.workbook import Workbook, read_workbook

HERE = Path(__file__).resolve().parent
MODEL = HERE / "cascade_model.xlsx"

#: The lines the accounts state, each naming one cell of the model. The
#: text is written the way a note reads; the number comes from the cell.
NOTES: list[tuple[str, str, str]] = [
    # (heading, sentence with {} for the figure, cell reference)
    ("REVENUE", "Revenue for the year ended 31 December 2023 was {}.", "Model!B6"),
    ("REVENUE", "Revenue for the year ended 31 December 2024 was {}.", "Model!C6"),
    ("REVENUE", "Revenue for the year ended 31 December 2025 was {}.", "Model!D6"),
    (
        "COST OF SALES",
        "Cost of goods sold for the year ended 31 December 2025 was {}.",
        "Model!D9",
    ),
    (
        "OPERATING EXPENSES",
        "Selling, general and administrative expenses for the year ended "
        "31 December 2025 were {}.",
        "Model!D13",
    ),
    (
        "BORROWINGS",
        "Total debt outstanding at 31 December 2025 was {}.",
        "Assumptions!B24",
    ),
    (
        "CASH AND CASH EQUIVALENTS",
        "Cash and equivalents held at 31 December 2025 was {}.",
        "Assumptions!B25",
    ),
]

#: What the signed accounts restated. Both are real shapes of the problem:
#: a figure moved between line items, and a figure the auditors corrected.
RESTATED: dict[str, Decimal] = {
    "Model!D9": Decimal("-139.2"),
    "Assumptions!B24": Decimal("94.1"),
}


def money(value: Decimal) -> str:
    """How a set of accounts prints a figure in millions.

    Costs in brackets, which is the convention every set of accounts uses
    and which the reader already understands: parentheses in a statement
    mean « subtracted here », not « this number is negative ».
    """
    if value < 0:
        return f"({-value:.1f})"
    return f"${value:.1f}m"


def pages(book: Workbook, restated: dict[str, Decimal]) -> list[list[str]]:
    """The document, as lines, page by page."""
    front = [
        "CASCADE INDUSTRIAL HOLDINGS LIMITED",
        "ANNUAL REPORT AND FINANCIAL STATEMENTS",
        "For the year ended 31 December 2025",
        "",
        "The financial statements were approved by the board of directors "
        "and authorised for issue.",
        "These accounts are prepared on a statutory basis.",
    ]

    notes: list[str] = ["NOTES TO THE FINANCIAL STATEMENTS"]
    heading = ""
    for section, sentence, ref in NOTES:
        cell = book.get(ref)
        if cell is None or cell.value is None:
            raise SystemExit(f"{ref} is not a value in the model any more")
        value = restated.get(ref, cell.value)
        if section != heading:
            notes.extend(["", section])
            heading = section
        notes.append(sentence.format(money(value)))

    shares = book.get("Assumptions!B26")
    closing = [
        "SHARE CAPITAL",
        f"The number of diluted shares outstanding at the year end was "
        f"{shares.value:.1f}m."
        if shares and shares.value is not None
        else "",
        "",
        "INDEPENDENT AUDITOR'S REPORT",
        "In our opinion the financial statements give a true and fair view "
        "of the state of the company's affairs.",
    ]

    # Three pages, so that « p.2 » and « p.3 » are different answers and a
    # reader that lost the page number would be caught by the test.
    return [front, notes, [line for line in closing if line]]


def build(path: Path, book: Workbook, restated: dict[str, Decimal]) -> None:
    from fpdf import FPDF

    document = FPDF()
    document.set_auto_page_break(auto=False)
    document.set_margins(18, 22, 18)
    for lines in pages(book, restated):
        document.add_page()
        document.set_font("Helvetica", size=11)
        for line in lines:
            if not line:
                document.ln(6)
                continue
            # `w=0` is « to the right margin », which after a wrapped line
            # means « from wherever the cursor now is » — zero, eventually.
            document.set_x(document.l_margin)
            document.multi_cell(document.epw, 6, line)
    document.output(str(path))
    print(f"  {path.name}")


def main() -> None:
    book = read_workbook(str(MODEL))
    print("built from the model:")
    build(HERE / "cascade_accounts.pdf", book, {})
    build(HERE / "cascade_accounts_restated.pdf", book, RESTATED)
    for ref, value in RESTATED.items():
        cell = book.get(ref)
        was = cell.value if cell else None
        print(f"  restated {ref}: model {was} → accounts {value}")


if __name__ == "__main__":
    main()
