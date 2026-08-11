"""Writing a corrected figure into a `.pptx`.

The two problems `docs/pierce/writing-pptx.md` names, and nothing else.

**1 · A figure is often not one run.** `$42.6mm` in a text frame can be
stored as `$42.` and `6mm` in two separate runs — a spell-check boundary,
an edit made three versions ago, one character in a different font. The
reader never saw this because `python-pptx` flattens runs on the way out,
so every figure has looked like one piece of text for the entire life of
this project, and it appears the first time anything is written.

What was stored is the right coordinate: a paragraph, and character
offsets **into the stripped paragraph text** — run-agnostic. So the writer
rebuilds that same text from the runs, keeps a map back into them, and
splices. Where a figure spans two runs the replacement is written into the
first of them and the rest of the span is emptied, which keeps the first
run's formatting: `$42.` and `6mm` are one number typed once, and the
formatting of its first character is the formatting a reader would say the
number has.

**2 · A chart number lives in two places.** A value exists in the cache in
the chart XML — which is what PowerPoint draws, and therefore the claim the
slide makes — and again in the embedded workbook part, which is what opens
when somebody clicks « Edit data ». Write one and not the other and the
file disagrees with itself. Both are written or neither is.

**Refuse rather than approximate.** Every path checks that the characters
about to be replaced are the characters the reader recorded, and raises
:class:`CannotWrite` when they are not. The alternative — search and
replace — lands on the second `$48.9mm` on the slide as readily as the
first, and a deck corrected in the wrong place is sent out by a banker who
has no reason to look.
"""

from collections.abc import Sequence
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Any

from pptx import Presentation
from pptx.oxml.ns import qn
from pptx.oxml.text import CT_RegularTextRun

from .edit import CannotWrite, Edit
from .embedded import write_cell

#: What separates two paragraphs in a text frame's own `text`, and what the
#: reader's offsets into a table cell were therefore measured against.
PARAGRAPH_BREAK = "\n"


def write_deck(payload: bytes, edits: Sequence[Edit]) -> bytes:
    """The deck, with every edit applied, or an exception and no file.

    All or nothing on purpose. A deck where three of four corrections
    landed is a deck nobody can describe, and « which ones » is exactly the
    question a banker cannot answer by looking.

    Edits are applied from the end of each paragraph backwards, so that two
    corrections on one line do not move each other's offsets. The `before`
    check would catch it either way; this means it does not have to.
    """
    if not edits:
        return payload

    presentation = Presentation(BytesIO(payload))
    for edit in sorted(edits, key=_order, reverse=True):
        _apply(presentation, edit)

    buffer = BytesIO()
    presentation.save(buffer)
    return buffer.getvalue()


def _order(edit: Edit) -> tuple[Any, ...]:
    """Position in the deck, coarse to fine, for a stable reverse pass."""
    anchor = edit.anchor
    return (
        edit.page,
        int(anchor.get("shape_id") or 0),
        int(anchor.get("row") or 0),
        int(anchor.get("column") or 0),
        int(anchor.get("paragraph") or 0),
        int(anchor.get("start") or 0),
    )


def _apply(presentation: Any, edit: Edit) -> None:
    kind = edit.anchor.get("kind")
    shape = _shape_for(presentation, edit)
    if kind == "text":
        _write_text(shape, edit)
    elif kind == "table":
        _write_table(shape, edit)
    elif kind == "chart":
        _write_chart(shape, edit)
    else:
        raise CannotWrite(
            f"This figure was recorded as « {kind or 'nothing'} », "
            "which is not something that can be written into a deck."
        )


# --- finding the shape ---------------------------------------------------


def _shape_for(presentation: Any, edit: Edit) -> Any:
    """The shape the figure was read from — both fields, and never a guess.

    **A shape id is not unique, and the Cascade deck proves it.** Slide 3
    carries a chart and a table that both call themselves shape 4.
    PowerPoint asks for unique ids and the tools that generate decks do not
    always oblige, so « the first shape with id 4 » would have written a
    table correction into a chart and raised nothing at all.

    So the two fields are used together, most specific first: the shape
    that answers to both, then the name alone, then the id alone. The name
    leads for the same reason it leads in the panel — it is the one field
    every reader of a `.pptx` is documented to see the same way — and an
    id that matches two shapes is refused rather than resolved.
    """
    slides = list(presentation.slides)
    if edit.page < 1 or edit.page > len(slides):
        raise CannotWrite(
            f"This deck has no slide {edit.page}; it has {len(slides)}. "
            "Upload the deck again and re-run the check."
        )
    shapes = list(slides[edit.page - 1].shapes)

    shape_id = edit.anchor.get("shape_id")
    name = edit.anchor.get("shape_name")
    by_name = [shape for shape in shapes if name and shape.name == name]
    by_id = [
        shape for shape in shapes if shape_id is not None and shape.shape_id == shape_id
    ]
    both = [shape for shape in by_name if shape in by_id]

    for candidates in (both, by_name, by_id):
        if len(candidates) == 1:
            return candidates[0]
        if len(candidates) > 1:
            raise CannotWrite(
                f"Slide {edit.page} has {len(candidates)} shapes that answer "
                f"to « {name or shape_id} », so there is no way to say which "
                f"one printed « {edit.before} »."
            )

    raise CannotWrite(
        f"The shape this figure was printed in is no longer on slide "
        f"{edit.page}. Upload the deck again and re-run the check."
    )


# --- text, as a sequence of runs -----------------------------------------


class _Piece:
    """One stretch of a text frame's text, and whether it can be written.

    A run can. A line break and a field cannot: `<a:br>` contributes a
    vertical tab to the text and holds none of it, and a field's text is
    generated by PowerPoint. A figure that spans one of those is a figure
    this refuses to touch.
    """

    __slots__ = ("element", "start", "text", "writable")

    def __init__(self, text: str, element: Any | None) -> None:
        self.text = text
        self.element = element
        self.writable = element is not None
        self.start = 0

    @property
    def end(self) -> int:
        return self.start + len(self.text)

    def set(self, value: str) -> None:
        assert self.element is not None
        self.element.text = value


def _pieces_of(paragraph: Any) -> list[_Piece]:
    """A paragraph's content, in order, with the runs marked writable."""
    pieces: list[_Piece] = []
    for element in paragraph._element.content_children:
        writable = element if isinstance(element, CT_RegularTextRun) else None
        pieces.append(_Piece(text=element.text, element=writable))
    return _positioned(pieces)


def _positioned(pieces: list[_Piece]) -> list[_Piece]:
    cursor = 0
    for piece in pieces:
        piece.start = cursor
        cursor += len(piece.text)
    return pieces


def _splice(pieces: list[_Piece], edit: Edit, *, lead: int, where: str) -> None:
    """Put `after` where `before` is, across however many runs it spans."""
    text = "".join(piece.text for piece in pieces)
    start = lead + int(edit.anchor.get("start", 0))
    end = lead + int(edit.anchor.get("end", 0))

    if not 0 <= start < end <= len(text):
        raise CannotWrite(
            f"{where} is shorter than it was when it was read — "
            f"{edit.before} is not at characters {start}–{end} any more. "
            "Upload the deck again and re-run the check."
        )
    found = text[start:end]
    if found != edit.before:
        raise CannotWrite(
            f"{where} now reads « {found} » where « {edit.before} » was "
            "read. Somebody has edited it since. Upload the deck again "
            "and re-run the check."
        )

    covered = [piece for piece in pieces if piece.start < end and piece.end > start]
    if not covered:
        raise CannotWrite(f"{where} holds no text at that position.")
    if not all(piece.writable for piece in covered):
        # A line break inside the number itself. Vanishingly rare and not
        # something to guess at: replacing it would delete the break and
        # silently re-flow the line.
        raise CannotWrite(
            f"« {edit.before} » in {where} is broken across a line break, "
            "so it cannot be replaced without changing the layout."
        )

    first, last = covered[0], covered[-1]
    head = first.text[: start - first.start]
    tail = last.text[end - last.start :]

    if first is last:
        first.set(head + edit.after + tail)
        return

    # Split across runs. The replacement goes into the first of them, which
    # keeps that run's formatting — a figure typed once and split by an
    # editing accident has the formatting of its first character.
    first.set(head + edit.after)
    for middle in covered[1:-1]:
        middle.set("")
    last.set(tail)


def _lead(text: str) -> int:
    """How much whitespace the reader stripped off the front."""
    return len(text) - len(text.lstrip())


def _write_text(shape: Any, edit: Edit) -> None:
    if not shape.has_text_frame:
        raise CannotWrite(
            f"The shape holding « {edit.before} » on slide {edit.page} no "
            "longer holds text."
        )
    index = int(edit.anchor.get("paragraph", 0))
    paragraphs = list(shape.text_frame.paragraphs)
    if index >= len(paragraphs):
        raise CannotWrite(
            f"That text box on slide {edit.page} no longer has a paragraph "
            f"{index + 1}. Upload the deck again and re-run the check."
        )
    paragraph = paragraphs[index]
    _splice(
        _pieces_of(paragraph),
        edit,
        lead=_lead(paragraph.text),
        where=f"paragraph {index + 1} on slide {edit.page}",
    )


def _write_table(shape: Any, edit: Edit) -> None:
    """A table cell, whose offsets are into the whole cell's text.

    The reader took `cell.text` — every paragraph of the cell joined by a
    newline — and stripped it. So the map has to span paragraphs, with the
    joins in it as pieces nothing can be written into.
    """
    if not shape.has_table:
        raise CannotWrite(
            f"The shape holding « {edit.before} » on slide {edit.page} is no "
            "longer a table."
        )
    row = int(edit.anchor.get("row", 0))
    column = int(edit.anchor.get("column", 0))
    table = shape.table
    if row >= len(table.rows) or column >= len(table.columns):
        raise CannotWrite(
            f"That table on slide {edit.page} no longer has a row {row + 1} "
            f"and a column {column + 1}. Upload the deck again and re-run "
            "the check."
        )

    cell = table.cell(row, column)
    pieces: list[_Piece] = []
    for index, paragraph in enumerate(cell.text_frame.paragraphs):
        if index:
            pieces.append(_Piece(text=PARAGRAPH_BREAK, element=None))
        pieces.extend(_pieces_of(paragraph))

    _splice(
        _positioned(pieces),
        edit,
        lead=_lead(cell.text),
        where=f"row {row + 1}, column {column + 1} of the table on slide {edit.page}",
    )


# --- charts, in both places ----------------------------------------------


def _write_chart(shape: Any, edit: Edit) -> None:
    """The cached point and the embedded workbook cell behind it.

    Written in that order and both in one pass: a chart whose cache says
    39.6 and whose workbook still says 43.0 draws the right number and
    hands the wrong one to the next person who opens the data.
    """
    if not shape.has_chart:
        raise CannotWrite(
            f"The shape holding « {edit.before} » on slide {edit.page} is no "
            "longer a chart."
        )

    value = _number(edit.after, edit)
    name = str(edit.anchor.get("series") or "")
    point = int(edit.anchor.get("point", 0))

    chart = shape.chart
    matches = [
        series
        for plot in chart.plots
        for series in plot.series
        if str(series.name or "").strip() == name
    ]
    if not matches:
        raise CannotWrite(
            f"The chart on slide {edit.page} no longer has a series called « {name} »."
        )
    if len(matches) > 1:
        # Two series of one name, and no way to say which one the figure
        # was read from. Refusing costs a correction; guessing corrects the
        # wrong bar.
        raise CannotWrite(
            f"The chart on slide {edit.page} has {len(matches)} series "
            f"called « {name} », so there is no way to say which « "
            f"{edit.before} » belongs to."
        )

    element = matches[0]._element
    values = element.find(qn("c:val"))
    reference = values.find(qn("c:numRef")) if values is not None else None
    cache = reference.find(qn("c:numCache")) if reference is not None else None
    if cache is None:
        raise CannotWrite(
            f"The « {name} » series on slide {edit.page} carries no cached "
            "values, so there is nothing to correct."
        )

    cached = next(
        (item for item in cache.findall(qn("c:pt")) if item.get("idx") == str(point)),
        None,
    )
    held = cached.find(qn("c:v")) if cached is not None else None
    if held is None or held.text is None:
        raise CannotWrite(
            f"Point {point + 1} of « {name} » on slide {edit.page} is empty."
        )
    if _number(held.text, edit) != _number(edit.before, edit):
        raise CannotWrite(
            f"Point {point + 1} of « {name} » on slide {edit.page} now reads "
            f"« {held.text} » where « {edit.before} » was read. Upload the "
            "deck again and re-run the check."
        )

    # The workbook first: it is the half that can refuse, and a cache
    # written against a workbook that then refuses is the disagreement this
    # whole function exists to prevent.
    formula = reference.find(qn("c:f"))
    _write_workbook(chart, formula.text if formula is not None else None, point, value)
    held.text = f"{value:f}"


def _number(text: str, edit: Edit) -> Decimal:
    try:
        return Decimal(text.strip())
    except (InvalidOperation, AttributeError) as problem:
        raise CannotWrite(
            f"« {text} » is not a number, and a chart point holds a number. "
            f"This correction was recorded as « {edit.before} » → "
            f"« {edit.after} »."
        ) from problem


def _write_workbook(
    chart: Any, formula: str | None, point: int, value: Decimal
) -> None:
    """The same value, in the workbook the chart was built from.

    `c:f` is the range the series was plotted from — `Sheet1!$B$2:$B$4` —
    and the point's index is its offset down that range. A chart with no
    `c:f` was given its numbers literally and has no workbook to keep in
    step, which is not a failure.
    """
    if not formula:
        return
    workbook = chart.part.chart_workbook
    part = workbook.xlsx_part
    if part is None:
        return
    workbook.update_from_xlsx_blob(write_cell(part.blob, formula, point, value))


__all__ = ["write_deck"]
