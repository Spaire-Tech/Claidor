"""C4's verifying traces where the right answer is by construction.

The soundness gate runs on real corpus files under the registered
harness; these tests pin the trace's sensitivity — every part of
the receipt must matter — and the one thing the whole round exists
for: a shifted-but-unchanged cell is proved across the shift.
"""

from decimal import Decimal

from polar.tieout.watch.trace import fingerprint, fingerprints, proved_unchanged
from polar.tieout.workbook import Cell, Workbook


def cell(
    ref: str,
    row: int,
    column: int,
    *,
    value: str | None = None,
    formula: str | None = None,
    label: str = "",
    precedents: tuple[str, ...] = (),
) -> Cell:
    return Cell(
        sheet="M",
        ref=f"M!{ref}",
        row=row,
        column=column,
        value=None if value is None else Decimal(value),
        formula=formula,
        row_label=label,
        column_label="FY2025",
        precedents=precedents,
    )


def book(cells: list[Cell]) -> Workbook:
    built = Workbook(sheets=["M"])
    for one in cells:
        built.cells[one.ref] = one
    return built


BASE = [
    cell("B2", 2, 2, value="100", label="Revenue"),
    cell("B3", 3, 2, value="40", formula="=B2*0.4", label="Cost", precedents=("M!B2",)),
    cell(
        "B4",
        4,
        2,
        value="60",
        formula="=B2-B3",
        label="EBITDA",
        precedents=("M!B2", "M!B3"),
    ),
]


class TestTheReceiptsParts:
    def test_identical_cells_hash_identically(self) -> None:
        one = book(BASE)
        two = book(BASE)
        assert fingerprints(one) == fingerprints(two)

    def test_a_changed_input_value_breaks_the_match(self) -> None:
        revised = book(
            [
                cell("B2", 2, 2, value="120", label="Revenue"),
                BASE[1],
                BASE[2],
            ]
        )
        b4 = "M!B4"
        assert fingerprint(book(BASE).cells[b4], book(BASE)) != fingerprint(
            revised.cells[b4], revised
        )

    def test_a_stale_recache_breaks_the_match_by_its_own_value(self) -> None:
        """Same formula, same inputs, different stored answer — the own
        value inside the trace is what makes the proof sound with no
        volatile-function denylist."""
        stale = book(
            [
                BASE[0],
                BASE[1],
                cell(
                    "B4",
                    4,
                    2,
                    value="61",
                    formula="=B2-B3",
                    label="EBITDA",
                    precedents=("M!B2", "M!B3"),
                ),
            ]
        )
        b4 = "M!B4"
        assert fingerprint(book(BASE).cells[b4], book(BASE)) != fingerprint(
            stale.cells[b4], stale
        )

    def test_an_unseen_input_is_part_of_the_receipt(self) -> None:
        with_blank = cell(
            "B5", 5, 2, value="1", formula="=B9+1", label="X", precedents=("M!B9",)
        )
        no_precedent = cell("B5", 5, 2, value="1", formula="=B9+1", label="X")
        assert fingerprint(with_blank, book([with_blank])) != fingerprint(
            no_precedent, book([no_precedent])
        )


class TestProvedUnchanged:
    def test_identical_books_prove_everything(self) -> None:
        proof = proved_unchanged(book(BASE), book(BASE))
        assert not proof.suspects
        assert len(proof.proved) == 3
        assert proof.proved_fraction == 1.0

    def test_a_retyped_input_and_its_dependents_are_suspects(self) -> None:
        revised = book(
            [
                cell("B2", 2, 2, value="120", label="Revenue"),
                cell(
                    "B3",
                    3,
                    2,
                    value="48",
                    formula="=B2*0.4",
                    label="Cost",
                    precedents=("M!B2",),
                ),
                cell(
                    "B4",
                    4,
                    2,
                    value="72",
                    formula="=B2-B3",
                    label="EBITDA",
                    precedents=("M!B2", "M!B3"),
                ),
            ]
        )
        proof = proved_unchanged(book(BASE), revised)
        assert proof.suspects == {"M!B2", "M!B3", "M!B4"}
        assert not proof.proved

    def test_a_shifted_but_unchanged_cell_is_proved_across_the_shift(self) -> None:
        """The whole point of the round: a row insert moves every cell
        below it, C1 calls them all changed, and the trace proves the
        genuinely-unchanged ones at hash cost. The honest exception,
        inherited from the shape encoding and named in C2: a reference
        *crossing* the insert point changes relative shape under
        Excel's own updating, so that cell stays a suspect."""
        base = [
            cell("B2", 2, 2, value="100", label="Revenue"),
            cell(
                "B3",
                3,
                2,
                value="40",
                formula="=B2*0.4",
                label="Cost",
                precedents=("M!B2",),
            ),
            cell(
                "B4",
                4,
                2,
                value="80",
                formula="=B3*2",
                label="Double cost",
                precedents=("M!B3",),
            ),
        ]
        shifted = book(
            [
                base[0],
                cell("B3", 3, 2, value="5", label="One-offs"),
                cell(
                    "B4",
                    4,
                    2,
                    value="40",
                    formula="=B2*0.4",
                    label="Cost",
                    precedents=("M!B2",),
                ),
                cell(
                    "B5",
                    5,
                    2,
                    value="80",
                    formula="=B4*2",
                    label="Double cost",
                    precedents=("M!B4",),
                ),
            ]
        )
        proof = proved_unchanged(book(base), shifted)
        assert "M!B2" in proof.proved  # above the insert, untouched
        assert proof.proved["M!B5"] == "M!B4"  # shifted with its input: proved
        assert "M!B3" in proof.suspects  # the inserted line itself
        assert "M!B4" in proof.suspects  # Cost's ref crosses the insert
