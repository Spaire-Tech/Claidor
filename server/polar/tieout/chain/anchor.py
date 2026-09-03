"""Confirm once, arithmetic forever — the re-anchoring, and nothing else.

Track D4. A person confirms that a model cell comes from a document
figure; from then on, finding that pair again in any later version is
**exact-key lookup**, and saying whether it still holds is arithmetic.
No matcher runs after confirmation, and no language model is involved
anywhere in this package.

The contract this implements is the one proposed in the Scribe log and
**not yet approved**, so there is deliberately no table, no migration
and no repository here — only the pure functions the registered
measurement needs. Persistence is a thin layer over this the day the
lead says so.

**Anchor by labels, never coordinates.** A cell ref (« Model!D26 ») and
a page number are *locations*: somebody inserts a row and they are
wrong while the thing they pointed at has not moved at all. So the
anchors are the engine's own `Cell.name` on the model side and the
printed line on the document side, and both are re-found by name.

**Values locate nothing; they only report.** This asymmetry is the
whole design. A revised term sheet whose figure changed must still
re-anchor — and then say « the source moved, 3,741,000 → 3,905,000 ».
Anchoring on the number instead would report exactly that case as
« not found », losing the finding the product exists for.

**Ambiguity is never resolved by guessing.** Two cells with the same
name, or two lines with the same labels, come back as `Ambiguous` for
a person to settle. A silently re-pointed link is worse than a broken
one, because nobody goes looking for it.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from .propose import label_tokens

#: The verdicts a re-check can return, exactly as registered.
AGREES = "agrees"
MODEL_MOVED = "the model moved"
SOURCE_MOVED = "the source moved"
BOTH_MOVED = "both moved"

#: The named deterministic functions a person may state when they
#: confirm a link or bind a term — the schema's `transformation`
#: column, given its meaning at last (founder-approved 31 Aug, from
#: terms round 2: three of fifteen real rows print credits in
#: parentheses that scale alone cannot express). « identity » is the
#: default; « negate » is the credit convention — the document prints
#: this figure as a credit, the model holds its magnitude. Applied to
#: the document's value before the stated scale, at re-check only:
#: nothing here is ever inferred, and which-side-moved is still judged
#: on the raw values the document and the model actually state.
TRANSFORMS: dict[str, Callable[[float], float]] = {
    "identity": lambda value: value,
    "negate": lambda value: -value,
}


@dataclass(frozen=True)
class ModelAnchor:
    """The model side of a confirmed link, as it stood at confirmation."""

    #: « Model!D26 » — recorded for the citation, never used to re-find.
    ref: str
    #: « FY2025A Adjusted EBITDA », the engine's own `Cell.name`. THE anchor.
    cell_name: str
    #: What the cell held when a person vouched for it. Without this the
    #: re-check cannot say *which side* moved — the measurement found
    #: that gap in the proposed schema, and the log records the
    #: amendment.
    value: Decimal | float


@dataclass(frozen=True)
class DocumentAnchor:
    """The document side of a confirmed link, as it stood at confirmation."""

    #: Recorded for the citation. A page number is a coordinate.
    page: int
    #: The token exactly as printed — also the precision the re-check
    #: compares at, since a document states what it states.
    printed_text: str
    value: float
    #: The printed line the figure sat in. THE anchor.
    anchor_line: str
    #: Which number within that line (1st, 2nd…): the tiebreak when a
    #: line carries several.
    ordinal_in_line: int


@dataclass(frozen=True)
class Anchored:
    """Re-found. `key` is the ref or fact key in the new version."""

    key: str
    value: Decimal | float
    #: How it was re-found: « name » or « position-resolved ».
    how: str
    #: True when the thing was found somewhere new — a ref that moved,
    #: a page that shifted. Worth showing; never worth acting on alone.
    relocated: bool


@dataclass(frozen=True)
class Broken:
    """Not in this version, and the sentence says which side and why."""

    reason: str


@dataclass(frozen=True)
class Ambiguous:
    """Several candidates the anchor cannot separate. A person decides."""

    reason: str
    candidates: tuple[str, ...]


Outcome = Anchored | Broken | Ambiguous


def with_ordinals(numbers: Sequence[Any]) -> list[tuple[str, str, int, float, str]]:
    """Number a page's facts within their own printed lines.

    Takes what `extract_pdf` returns and yields
    ``(key, line, ordinal_in_line, value, text)``. The ordinal is
    assigned in reading order, which is the order the extractor
    produces, so the same rule numbers a fact at confirmation and at
    re-anchoring — the tiebreak is only sound if both sides count the
    same way.

    Counting restarts at every new **physical** line, not at every new
    line *text*: a boilerplate line that repeats on forty pages is
    forty lines, and its figure is the first number of each of them.
    Counting by text instead would number them 1…40 and the tiebreak
    would then separate identical lines by an accident of how far into
    the document they sat.
    """
    out = []
    where: tuple[int, str] | None = None
    ordinal = 0
    for index, number in enumerate(numbers):
        here = (number.page, number.line)
        ordinal = ordinal + 1 if here == where else 1
        where = here
        out.append(
            (
                f"p{number.page}|{index}",
                number.line,
                ordinal,
                number.value,
                number.text,
            )
        )
    return out


def reanchor_model(
    anchor: ModelAnchor, cells: Sequence[tuple[str, str, Decimal | float]]
) -> Outcome:
    """Re-find a confirmed cell in a model version by its name.

    ``cells`` are ``(ref, name, value)`` for the version being checked.
    The engine's own precedent: `FigureLink.cell_name` re-finds a cell
    after somebody inserts a row above it, and this is that rule made
    reusable.
    """
    matches = [(ref, value) for ref, name, value in cells if name == anchor.cell_name]
    if not matches:
        return Broken(
            reason=(
                f"No cell in this version is called « {anchor.cell_name} », so "
                f"the link confirmed at {anchor.ref} has nothing to point at. "
                "The row was deleted or renamed; a person decides which."
            )
        )
    if len(matches) > 1:
        return Ambiguous(
            reason=(
                f"{len(matches)} cells in this version are called "
                f"« {anchor.cell_name} ». The name cannot tell them apart and "
                "this link will not guess between them."
            ),
            candidates=tuple(ref for ref, _ in matches),
        )
    ref, value = matches[0]
    return Anchored(key=ref, value=value, how="name", relocated=ref != anchor.ref)


def reanchor_document(
    anchor: DocumentAnchor,
    facts: Sequence[tuple[str, str, int, float, str]],
) -> Outcome:
    """Re-find a confirmed figure in a document version by its line.

    ``facts`` are ``(key, line, ordinal_in_line, value, text)``, as
    :func:`with_ordinals` produces them. Candidate lines are matched on
    their **label tokens** using the matcher's own tokenizer, so purely
    numeric tokens drop out and the figure's value plays no part in
    locating it.
    """
    wanted = label_tokens(anchor.anchor_line)
    candidates = [fact for fact in facts if label_tokens(fact[1]) == wanted]
    if not candidates:
        return Broken(
            reason=(
                "The line this figure rested on — "
                f"« {anchor.anchor_line[:60]} » — is not in this version of "
                "the document. It was rewritten or removed; a person decides "
                "which."
            )
        )
    if len(candidates) == 1:
        key, _, _, value, _ = candidates[0]
        return Anchored(
            key=key,
            value=value,
            how="name",
            relocated=not key.startswith(_page_key(anchor)),
        )

    placed = [fact for fact in candidates if fact[2] == anchor.ordinal_in_line]
    if len(placed) == 1:
        key, _, _, value, _ = placed[0]
        return Anchored(
            key=key,
            value=value,
            how="position-resolved",
            relocated=not key.startswith(_page_key(anchor)),
        )
    finalists = placed or candidates
    return Ambiguous(
        reason=(
            f"{len(finalists)} figures in this version sit in lines with the "
            "same labels, and being the "
            f"{anchor.ordinal_in_line}{_suffix(anchor.ordinal_in_line)} number "
            "in the line does not separate them either. A person decides."
        ),
        candidates=tuple(fact[0] for fact in finalists),
    )


def recheck(
    anchor_model: ModelAnchor,
    anchor_document: DocumentAnchor,
    model_now: Decimal | float,
    document_now: float,
    scale: float = 1.0,
    transformation: str = "identity",
) -> tuple[str, bool]:
    """Which side moved, and whether the pair still ties out.

    Returns the registered verdict and `ties_out_now`. Both are wanted:
    « both moved » with the pair still agreeing is a deal team that
    updated everything, and « both moved » with it not agreeing is a
    deal team that updated one thing and something else drifted, and
    those read very differently to a reviewer.

    Comparison is at the document's own printed precision, under the
    scale and the named transformation the person stated at
    confirmation (:data:`TRANSFORMS`) — never anything this code
    inferred. Which side moved is judged on the raw stated values;
    the transformation bears only on whether the pair ties out. An
    unnamed transformation is refused in words, never treated as
    identity — the write routes validate, so reaching this is a
    defect worth the noise.
    """
    if transformation not in TRANSFORMS:
        raise ValueError(
            f"« {transformation} » is not a named transformation; they "
            f"are: {', '.join(sorted(TRANSFORMS))}. Refusing to guess "
            "what it means."
        )
    places = _printed_decimals(anchor_document.printed_text)
    model_moved = not _same(float(anchor_model.value), float(model_now), places)
    source_moved = not _same(anchor_document.value, document_now, places)
    ties_out = _same(
        TRANSFORMS[transformation](float(document_now)) * scale,
        float(model_now),
        places,
    )

    if model_moved and source_moved:
        return BOTH_MOVED, ties_out
    if model_moved:
        return MODEL_MOVED, ties_out
    if source_moved:
        return SOURCE_MOVED, ties_out
    return AGREES, ties_out


def _page_key(anchor: DocumentAnchor) -> str:
    return f"p{anchor.page}|"


def _suffix(number: int) -> str:
    return {1: "st", 2: "nd", 3: "rd"}.get(number if number < 20 else 0, "th")


def _printed_decimals(text: str) -> int:
    """How precisely the document printed it — the comparison's floor."""
    digits = text.replace(",", "")
    if "." not in digits:
        return 0
    return len(digits.rsplit(".", 1)[1].rstrip("%blnkm"))


def _same(left: float, right: float, places: int) -> bool:
    return round(left, places) == round(right, places)
