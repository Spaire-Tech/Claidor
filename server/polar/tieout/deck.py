"""Reading a `.pptx` for figures and the labels that name them.

`python-pptx` gives shapes, tables and charts. What it does not give is
« which words describe this number », and that is the entire problem —
see :mod:`polar.tieout.figures`.

Three shapes carry figures in a banker's deck, and each needs its own idea
of a label:

**A metric tile** is a caption and a value, usually as separate shapes
stacked a few points apart. The caption is above the value and there is
nothing between them, so the label is « the nearest text shape above,
close enough to be part of the same tile ». Proximity, not structure,
because the file has no structure to offer — the tile is a visual
convention, not an object.

**A table cell** is named by its row and its column. `Median` × `EV /
EBITDA` is the peer median multiple, and the same value in the row above
is a peer's own. This is where a value-only matcher does its worst damage.

**A sentence names each of its figures separately.** This is the part it
is easy to get wrong. « FY2025A reported EBITDA of $41.2mm adjusts to
$48.9mm » holds two figures on two different bases, and a label built from
the whole sentence would name both of them the same thing — which means
reconciling $41.2mm against the adjusted cell, or $48.9mm against the
reported one. Either is a false positive of the worst kind: confidently
wrong about a figure that is correct. So a line is cut at its figures, and
each figure is named by the words between it and the figure before it.

The cost is real and it is the right cost: « adjusts to $48.9mm » names
nothing, so that figure goes unlinked. A miss is a figure nobody checked.
A false positive is a banker told their correct deck is wrong, and after
two of those nobody runs the checker again.

**A chart is a fourth shape, and skipping it was a mistake.** The reasoning
was that a chart restates the table beside it, so reading both would report
every drift twice. On slide 3 of the Cascade deck the chart's adjusted
EBITDA series reads 37.8 / 43.0 / 48.9 and the table beside it reads
30.8 / 39.6 / 48.9 — the model says 30.8 / 39.6 / 48.9, and no cell in it
holds 37.8 or 43.0 at all. The chart and the table on one slide disagree,
and the assumption that made them redundant was false on the very deck it
was written against.

A chart series is named the way a table cell is: the series name and the
category, which is a line item and a period. `python-pptx` reads them from
the embedded workbook part, where the numbers actually live — the slide
itself holds only bars.
"""

import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from pptx import Presentation
from pptx.util import Emu

from .figures import Extraction, Figure, figures_in

#: How far above a value a caption can sit and still be its label. A tile
#: is a caption and a number a few points apart; half an inch is generous
#: for that and far too tight to accidentally capture a slide title.
TILE_GAP = Emu(int(0.55 * 914_400))

#: How far a caption may be offset horizontally and still belong to the
#: same tile. Tiles sit in a row, so this must be tighter than the gap
#: between two tiles.
TILE_DRIFT = Emu(int(0.35 * 914_400))

#: A slide's title and subtitle sit at the top. Everything above this line
#: is the page's own heading, which is context for every figure on it and
#: a name for none of them.
HEADER_BAND = Emu(int(1.3 * 914_400))

#: Text between two figures that makes them the ends of one range rather
#: than two independent claims. « $455mm to $528mm » is a reference range;
#: there is no single cell it reconciles to, so neither end is linked.
RANGE_JOIN = re.compile(r"^\s*(?:to|and|-|–|—|through|,)\s*$", re.IGNORECASE)

#: Where one clause ends and the next begins. A figure's name does not
#: reach across punctuation: in « ... management plan, 9.8% WACC, 2.5%
#: terminal growth », each figure is named inside its own comma-delimited
#: piece, and reading across the commas swaps the two names round.
CLAUSE_BREAK = re.compile(r"[,;:.]|\s—\s|\s--\s")

#: Row labels that name a derivation rather than a line item. In every
#: financial table ever built, « % margin » means « as a percentage of the
#: row above », and the same three characters appear twice on slide 3 of
#: the Cascade deck — once under gross profit and once under adjusted
#: EBITDA. Read on their own they are the same label for two different
#: figures, and whichever output wins gets applied to both.
DERIVED_ROW = re.compile(
    r"^\s*(?:%|as\s+%\s+of)?\s*(margin|growth|change|yield)\b", re.IGNORECASE
)

#: Column headers that name no quantity. A one-column table headed
#: « Value » is not saying its rows are about value; it is filling in a
#: header cell. Carrying that word into every label on the page makes
#: « Less: total debt » look like it might be the DCF's equity value.
GENERIC_HEADERS = frozenset(
    {"value", "amount", "total", "$mm", "($mm)", "€mm", "(€mm)", "x", "%", ""}
)


@dataclass
class TextShape:
    text: str
    top: int
    left: int
    height: int


def _label_above(shapes: list[TextShape], target: TextShape) -> str:
    """The caption belonging to this value, or empty.

    Nearest text shape whose bottom edge is above the value's top edge, no
    further than TILE_GAP, and roughly aligned with it. A caption further
    away than that is a different tile or the slide's own title, and
    borrowing it would give a figure a name that has nothing to do with it.
    """
    best: TextShape | None = None
    for shape in shapes:
        if shape is target:
            continue
        # A slide's title and subtitle sit above everything and are close
        # enough to the first block to look like its caption. They are the
        # page's heading, not any figure's name: « Adjusted EBITDA bridge »
        # over « FY2025A reported EBITDA of $41.2mm » would make the
        # reported figure claim to be the adjusted one. They reach the
        # linker as section context instead, where they can support a
        # decision without being able to carry one.
        if shape.top < HEADER_BAND:
            continue
        bottom = shape.top + shape.height
        if bottom > target.top:
            continue
        if target.top - bottom > TILE_GAP:
            continue
        if abs(shape.left - target.left) > TILE_DRIFT:
            continue
        if best is None or shape.top > best.top:
            best = shape

    if best is None:
        return ""

    # A tile is three shapes stacked: caption, value, subtext. The subtext
    # « 11.8% year-on-year » finds the *value* above it — « $228.9mm » —
    # which is a number, not a name. A caption that is itself only a figure
    # names nothing, so walk up again to the one that does.
    text = best.text.strip()
    if _is_only_figures(text):
        return _label_above([s for s in shapes if s is not best], best)
    return text


def _is_only_figures(text: str) -> bool:
    """True when a line is nothing but numbers — a value, not a caption."""
    stripped = text.strip()
    if not stripped:
        return False
    found = figures_in(stripped)
    return len(found) == 1 and found[0].printed == stripped


def read_deck(path: str) -> Extraction:
    """Every figure in the deck, with its label."""
    presentation = Presentation(path)
    extraction = Extraction()

    for index, slide in enumerate(presentation.slides, start=1):
        texts: list[TextShape] = []
        for shape in slide.shapes:
            if shape.has_text_frame and shape.text_frame.text.strip():
                texts.append(
                    TextShape(
                        text=shape.text_frame.text,
                        top=shape.top or 0,
                        left=shape.left or 0,
                        height=shape.height or 0,
                    )
                )

        section = " ".join(
            text.text.strip().replace("\n", " ")
            for text in sorted(texts, key=lambda t: t.top)
            if text.top < HEADER_BAND
        )

        for shape in slide.shapes:
            if shape.has_table:
                _read_table(extraction, shape, index, section)
            elif shape.has_chart:
                _read_chart(extraction, shape, index, section)
            elif shape.has_text_frame and shape.text_frame.text.strip():
                _read_text(extraction, shape, index, texts, section)

    return extraction


def _anchor(shape: Any, kind: str, **where: Any) -> dict[str, Any]:
    """Coordinates a host application can act on.

    `shape_id` is PowerPoint's own identifier for the shape and survives
    the file being moved, renamed or re-saved — it is what Office.js takes
    to select something. `shape_name` rides along because a deck built by
    a template often names its shapes, and a name a human recognises is
    worth having when an id no longer resolves.

    Everything else varies by shape and is passed through as given: a row
    and a column for a table, a series and a point for a chart, a
    paragraph and character offsets for a sentence. Offsets are into the
    *stripped* paragraph text, which is what the reader matched against.
    """
    anchor: dict[str, Any] = {"kind": kind}
    identifier = getattr(shape, "shape_id", None)
    if identifier is not None:
        anchor["shape_id"] = int(identifier)
    name = getattr(shape, "name", None)
    if name:
        anchor["shape_name"] = str(name)
    anchor.update({key: value for key, value in where.items() if value is not None})
    return anchor


def _read_text(
    extraction: Extraction,
    shape: Any,
    slide: int,
    texts: list[TextShape],
    section: str,
) -> None:
    frame = shape.text_frame

    this = TextShape(
        text=frame.text,
        top=shape.top or 0,
        left=shape.left or 0,
        height=shape.height or 0,
    )
    caption = _label_above(texts, this)
    is_tile = _is_only_figures(frame.text.strip()) or _is_tile_subtext(frame, caption)

    for index, paragraph in enumerate(frame.paragraphs):
        line = paragraph.text.strip()
        if not line:
            continue
        found = figures_in(line)
        if not found:
            continue

        for position, item in enumerate(found):
            opens = found[position - 1].end if position else 0
            before = line[opens : item.start]
            after = (
                line[item.end : found[position + 1].start]
                if position + 1 < len(found)
                else line[item.end :]
            )

            # The words immediately before this figure name it, back as
            # far as the nearest clause boundary and no further. « Five-
            # year management plan, 9.8% WACC, 2.5% terminal growth »
            # puts the word WACC *after* the figure it names, so the
            # words before 2.5% are the tail of its neighbour's name; a
            # label built from them says 2.5% is the WACC, which it is
            # not, and the WACC is 9.8%, which the deck got right.
            #
            # A tile's value has nothing before it and nothing after — its
            # caption is the whole name — and a tile's subtext « 11.8%
            # year-on-year » is named by what follows. So fall through to
            # the words after only when the words before say nothing.
            head = _last_clause(before)
            clause = head if _has_words(head) else _first_clause(after)
            label = f"{caption} {clause}".strip() if caption else clause

            joined_before = position > 0 and RANGE_JOIN.match(before) is not None
            joined_after = (
                position + 1 < len(found) and RANGE_JOIN.match(after) is not None
            )

            extraction.figures.append(
                Figure(
                    printed=item.printed,
                    value=item.value,
                    decimals=item.decimals,
                    kind=item.kind,
                    parenthesised=item.parenthesised,
                    slide=slide,
                    label=label,
                    location=f"slide {slide}",
                    context=line,
                    section=section,
                    range_endpoint=joined_before or joined_after,
                    structured=is_tile,
                    anchor=_anchor(
                        shape,
                        "text",
                        paragraph=index,
                        start=item.start,
                        end=item.end,
                    ),
                )
            )


def _is_tile_subtext(frame: Any, caption: str) -> bool:
    """A short single line under a captioned tile — « 21.4% margin »."""
    if not caption:
        return False
    text = frame.text.strip()
    return "\n" not in text and len(text) <= 40


def _has_words(text: str) -> bool:
    """True when a fragment carries something other than punctuation."""
    return any(character.isalpha() for character in text)


def _last_clause(text: str) -> str:
    """What is left of a fragment after the last clause break in it."""
    return CLAUSE_BREAK.split(text)[-1].strip()


def _first_clause(text: str) -> str:
    """What is left of a fragment before the first clause break in it."""
    return CLAUSE_BREAK.split(text)[0].strip()


def _read_chart(extraction: Extraction, shape: Any, slide: int, section: str) -> None:
    """Every point of every series, named by its series and its category.

    Chart values are data, not printed text, so there is no printed
    precision to hold them to — the precision is whatever the number
    carries. They are read as plain numbers and left to the linker's
    magnitude gate, which means a series of fractions (a margin plotted as
    0.2) links to nothing. That is a miss and it is the safe direction.
    """
    try:
        plots = list(shape.chart.plots)
    except Exception:
        # A chart whose embedded workbook is missing or unreadable. The
        # deck is no worse off than before charts were read at all.
        return

    for plot in plots:
        try:
            categories = [str(category) for category in plot.categories]
        except Exception:
            continue
        for series in plot.series:
            name = str(series.name or "").strip()
            for position, value in enumerate(series.values):
                if value is None:
                    continue
                category = (
                    categories[position].replace("\n", " ").strip()
                    if position < len(categories)
                    else ""
                )
                label = " ".join(part for part in (name, category) if part)
                if not label:
                    continue
                # Not `normalize()`: it turns 43.0 into 4.3E+1, whose
                # exponent says zero decimals, and the finding then reads
                # « 43 should be 40 » about a model that says 39.6. The
                # trailing zero is the precision the chart carries.
                number = Decimal(repr(float(value)))
                exponent = number.as_tuple().exponent
                # A NaN or infinity has a symbolic exponent rather than an
                # integer one. Neither belongs in a deck, and neither
                # should stop the rest of the chart being read.
                if not isinstance(exponent, int):
                    continue
                places = max(-exponent, 0)
                extraction.figures.append(
                    Figure(
                        printed=f"{number:f}",
                        value=number,
                        decimals=places,
                        kind="plain",
                        slide=slide,
                        label=label,
                        location=(
                            f"slide {slide}, chart series « {name} »"
                            + (f", category « {category} »" if category else "")
                        ),
                        context=f"{label} = {number:f}",
                        section=section,
                        structured=True,
                        subject=name,
                        anchor=_anchor(shape, "chart", series=name, point=position),
                    )
                )


def _read_table(extraction: Extraction, shape: Any, slide: int, section: str) -> None:
    table = shape.table
    rows = list(table.rows)
    if not rows:
        return

    headers = [cell.text.strip() for cell in rows[0].cells]
    #: The last row label that named a line item rather than a derivation
    #: of one, so that « % margin » can be read as « margin of that ».
    subject_row = ""

    for row_index, row in enumerate(rows):
        cells = list(row.cells)
        if not cells:
            continue
        row_label = cells[0].text.strip()

        if row_label and not DERIVED_ROW.match(row_label):
            subject_row = row_label
        elif row_label and subject_row:
            row_label = f"{subject_row} {row_label}"

        for column_index, cell in enumerate(cells):
            if row_index == 0 or column_index == 0:
                continue
            text = cell.text.strip()
            if not text:
                continue
            found = figures_in(text)
            if not found:
                continue

            column = headers[column_index] if column_index < len(headers) else ""
            if column.lower() in GENERIC_HEADERS:
                column = ""
            label = " ".join(part for part in (row_label, column) if part)

            for item in found:
                extraction.figures.append(
                    Figure(
                        printed=item.printed,
                        value=item.value,
                        decimals=item.decimals,
                        kind=item.kind,
                        parenthesised=item.parenthesised,
                        slide=slide,
                        label=label,
                        location=(
                            f"slide {slide}, row « {row_label} »"
                            + (f", column « {column} »" if column else "")
                        ),
                        context=text,
                        section=section,
                        structured=True,
                        subject=row_label,
                        anchor=_anchor(
                            shape,
                            "table",
                            row=row_index,
                            column=column_index,
                            start=item.start,
                            end=item.end,
                        ),
                    )
                )


__all__ = ["GENERIC_HEADERS", "HEADER_BAND", "TILE_DRIFT", "TILE_GAP", "read_deck"]
