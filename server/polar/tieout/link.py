"""Deciding which output row a printed figure is claiming to be.

Everything about the tie-out turns on this module, and the reason is one
number on slide 6 of the Cascade deck. The peer table prints `10.4x` in
the Kestrel Valve Group row and `9.9x` in the median row. A checker that
matches on values reconciles the first against the peer median and reports
a drift of half a turn on a deck that is correct. So the link is made on
*words*, never on values, and the value is only ever used afterwards to
say whether the linked pair agrees.

**The asymmetry that sets every threshold here.** A missed link is a
figure nobody checked — the deck is no worse off than before. A wrong link
is a banker told that a correct figure is wrong, and the second time that
happens the checker is closed and not reopened. So an unmatched figure is
never a finding, and everything below is tuned to refuse rather than to
guess.

Five gates, in the order they are cheapest to apply:

1. **The figure must be named at all.** « adjusts to $48.9mm » names
   nothing. No label, no link.
2. **It must not be a range endpoint.** « $455mm to $528mm » is a claim
   about a spread; no single cell is behind it.
3. **The period must not contradict.** A deck label saying FY2024A cannot
   be an output saying FY2025A. A label saying nothing about period may be
   any period — an unqualified « Gross margin » on a page about FY2025A is
   the FY2025A gross margin, and decks are written that way.
4. **The basis must not contradict.** « Reported EBITDA » is not the
   adjusted row, whatever the words around it score.
5. **The magnitude must be of the right sort.** A figure printed as a
   percentage is a fraction in the model; 87.4 is not 0.3818 rounded
   badly, it is a different quantity.

What survives is scored on how much of the output's *name* the label
accounts for, weighted so that rare words count and « EBITDA » barely
does, and rejected again unless it beats the runner-up by a clear margin.
Two outputs that fit equally well mean the deck has not said which one it
means, and the honest answer is to stay quiet.
"""

import math
import re
from dataclasses import dataclass
from decimal import Decimal

from .figures import Figure
from .model import Output

#: Words that carry no meaning to match on.
STOPWORDS = frozenset(
    """
    a an and are as at be been by for from has have in is it its of on or
    our per that the this to was were with we you
    less plus add sum subtotal
    """.split()
)

#: Fixed phrases that are one word in a model's vocabulary and three on a
#: slide. « Discounted cash flow » is what a slide calls the tab a model
#: calls « DCF », and the two have to reach the linker as the same token
#: or the DCF page cannot be told apart from the comps page.
PHRASES = {
    "discounted cash flow": "dcf",
    "free cash flow": "fcf",
    "year on year": "growth",
    "compound annual growth rate": "cagr",
    "present value": "pv",
}
# « Enterprise value » is deliberately *not* folded into « EV ». They mean
# the same thing, and mapping them together still costs more than it buys:
# five of the twenty-three Cascade outputs use one form or the other, so
# merging them makes the merged word common enough to stop telling the DCF
# enterprise value apart from the comps-implied one. The separation those
# two need comes from « discounted cash flow » → « dcf » instead, which
# distinguishes the pages rather than blurring the names.

#: Bankers' shorthand, in both directions. Not a general thesaurus — every
#: entry here is a pair that means the same thing on a page of a pitchbook,
#: and a wrong entry costs precision directly.
SYNONYMS = {
    "comparables": "comps",
    "comparable": "comps",
    "comp": "comps",
    "implies": "implied",
    "implying": "implied",
    "imply": "implied",
    "multiples": "multiple",
    "turnover": "revenue",
    "sales": "revenue",
    "adj": "adjusted",
    "adjustment": "adjustments",
    "normalised": "adjusted",
    "normalized": "adjusted",
}

#: FY25A, FY2025A, FY26E. Two-digit years are expanded so that the deck's
#: « FY25A-FY30E » and the model's « FY2025A-FY2030E » are the same words.
FISCAL_YEAR = re.compile(r"^fy(\d{2}|\d{4})([aep])?$", re.IGNORECASE)

#: Periods that are not fiscal years but still scope a figure. A peer's
#: LTM EBITDA is not the company's FY2025A EBITDA, and the two share every
#: other word in their names.
PERIOD_WORDS = frozenset({"ltm", "ntm", "lqa", "cy"})

#: Bases that cannot be each other. « Reported » and « adjusted » are the
#: whole reason the Outputs tab has a basis column.
BASIS_GROUPS = (
    frozenset({"reported", "statutory", "audited"}),
    frozenset({"adjusted", "proforma", "underlying", "runrate"}),
)

#: An output whose name is a ratio. A figure printed with an « x » is a
#: multiple of something by something, and the model names it that way:
#: « DCF implied EV / FY2025A adj. EBITDA ». « DCF implied value per
#: share » shares every word of that name's opening and is not a multiple,
#: and $9.69 against 10.0x is the kind of near-miss a label alone cannot
#: settle.
RATIO_NAME = re.compile(r"/|\bmultiple\b|\bratio\b|\bturns?\b", re.IGNORECASE)

#: A figure printed as a percentage is a fraction in the model. Anything
#: above this is not a fraction, so a percentage cannot be claiming it.
#: The converse holds too, which is what stops « gross profit 87.4 » from
#: reconciling against a gross margin of 0.3818.
FRACTION_CEILING = Decimal("1.5")

#: How much a word found in the surrounding page counts, against the same
#: word found in the label itself. Section headings say which methodology
#: a page is about — « Trading comparables » is why the implied enterprise
#: value on slide 6 is the comps one and not the DCF's — but they name no
#: figure, so they may support a link and never carry one.
CONTEXT_WEIGHT = 0.35

#: The basis column is prose about a figure, not its name. It helps decide
#: between two candidates; it should not be most of why one was chosen.
BASIS_WEIGHT = 0.5

#: Recall of the output's name matters more than precision of the label,
#: because labels are surrounded by connective words that name nothing
#: (« Applying the peer median of ») while a name the label fails to
#: account for is a name it is probably not claiming.
BETA = 2.0

#: How well a label must account for an output's name before the two are
#: treated as the same figure.
#:
#: **This number is a backstop, not a tuned parameter, and the difference
#: matters.** Swept from 0.00 to 0.54 against the clean Cascade deck, it
#: changes nothing: the same 34 figures link and no false positive appears
#: at any setting, because everything that would have been wrong was
#: already refused by a gate — a contradicted period, a contradicted
#: basis, a percentage against a figure that is not a fraction, a multiple
#: against a name that is not a ratio, a table label using a word the
#: output does not.
#:
#: That is the right shape for this to have. A gate can be explained to a
#: banker who asks why their figure was skipped; a threshold can only be
#: apologised for. It also means this value is *untested* by the Cascade
#: pair — the first deck that exercises it will be the first evidence
#: about where it belongs.
THRESHOLD = 0.50

#: How far ahead of the runner-up the winner must be. Two outputs fitting
#: equally well means the deck has not said which it means: « % margin »
#: on slide 3 could be the gross margin row or the adjusted EBITDA margin
#: row, and picking one at random is how a correct deck gets flagged.
#:
#: This one does bite. Swept against the clean deck it moves the link
#: count — 35 links at 0.00, 34 from 0.08, 32 at 0.20 — without ever
#: producing a false positive, so what it is trading is recall against
#: caution rather than precision against noise. Kept above the point where
#: the count settles.
MARGIN = 0.10


@dataclass(frozen=True)
class Link:
    """A printed figure and the output row it is claiming to be."""

    figure: Figure
    output: Output
    score: float
    #: The best score among the outputs that were *not* chosen. Kept so a
    #: reader can see how close the decision was.
    runner_up: float


@dataclass(frozen=True)
class Unlinked:
    """A figure deliberately not reconciled, and why.

    Never a finding, always worth counting: a reason that fires more often
    than expected is the first sign the linker has stopped working.
    """

    figure: Figure
    reason: str


def normalise(token: str) -> str:
    match = FISCAL_YEAR.match(token)
    if match is not None:
        year, marker = match.groups()
        if len(year) == 2:
            year = f"20{year}"
        return f"fy{year}{marker or ''}".lower()
    token = token.lower()
    token = SYNONYMS.get(token, token)
    # A crude plural strip, applied after the synonym table so that a
    # deliberate plural there survives. « adjustments » is a word in this
    # vocabulary; « peers » and « peer » are not two words.
    if (
        len(token) > 3
        and token.endswith("s")
        and not token.endswith(("ss", "us", "is"))
    ):
        token = token[:-1]
    return SYNONYMS.get(token, token)


def tokens(text: str) -> list[str]:
    """Content words, normalised, in order and with duplicates dropped."""
    flattened = re.sub(r"[^a-z0-9]+", " ", text.lower())
    for phrase, word in PHRASES.items():
        flattened = flattened.replace(phrase, word)
    raw = re.findall(r"[a-z][a-z0-9]*", flattened)
    seen: dict[str, None] = {}
    for word in raw:
        word = normalise(word)
        if word in STOPWORDS or len(word) < 2:
            continue
        seen.setdefault(word, None)
    return list(seen)


def _period(words: list[str]) -> set[str]:
    return {
        word
        for word in words
        if FISCAL_YEAR.match(word) is not None or word in PERIOD_WORDS
    }


def _basis(words: list[str]) -> set[int]:
    found = set()
    for index, group in enumerate(BASIS_GROUPS):
        if group & set(words):
            found.add(index)
    return found


class Vocabulary:
    """What the model's names are made of, and how rare each word is.

    « EBITDA » appears in nine of the twenty-three Cascade outputs and
    « median » in one. Treating them as equally informative is what makes
    a peer's own multiple look like the peer median, so every word is
    weighted by how few outputs use it.
    """

    def __init__(self, outputs: list[Output]) -> None:
        self.outputs = outputs
        self.names = [tokens(output.name) for output in outputs]
        self.bases = [tokens(output.basis) for output in outputs]

        document_frequency: dict[str, int] = {}
        for name, basis in zip(self.names, self.bases, strict=True):
            for word in set(name) | set(basis):
                document_frequency[word] = document_frequency.get(word, 0) + 1

        total = max(len(outputs), 1)
        self.weight = {
            word: math.log(total / count) + 1.0
            for word, count in document_frequency.items()
        }
        #: A word the model has never used. Given the weight it would have
        #: if it appeared in half an output — more than any real word, so
        #: that an unknown word in a label counts against every candidate.
        self.unknown = math.log(total / 0.5) + 1.0
        self.known = frozenset(document_frequency)

    def weight_of(self, word: str) -> float:
        return self.weight.get(word, self.unknown)


def _score(
    vocabulary: Vocabulary,
    index: int,
    label: set[str],
    context: set[str],
) -> float:
    name = vocabulary.names[index]
    basis = vocabulary.bases[index]

    covered = 0.0
    total = 0.0
    for words, share in ((name, 1.0), (basis, BASIS_WEIGHT)):
        for word in words:
            weight = vocabulary.weight_of(word) * share
            total += weight
            if word in label:
                covered += weight
            elif word in context:
                covered += weight * CONTEXT_WEIGHT
    recall = covered / total if total else 0.0

    published = set(name) | set(basis)
    explained = 0.0
    claimed = 0.0
    for word in label:
        weight = vocabulary.weight_of(word)
        claimed += weight
        if word in published:
            explained += weight
    precision = explained / claimed if claimed else 0.0

    if recall <= 0 or precision <= 0:
        return 0.0
    return (1 + BETA**2) * precision * recall / (BETA**2 * precision + recall)


def _accounted_for(label: list[str], published: set[str]) -> bool:
    """Every word of a complete name is a word the output uses.

    Applied only to table cells, where the label is not prose but two
    header cells joined — a whole name, generated by the table's own
    structure. If a word of it is a word the output does not use, the
    label is naming something else: `Median EV / revenue` is not the
    median EV / EBITDA however many words the two share, and
    `Meridian Flow Systems Enterprise value` is not the comps-implied
    enterprise value however much of that name it happens to cover.

    Periods are exempt, because a table says the period once in a column
    header and the output row says it inside its name, and the period gate
    has already checked they agree.
    """
    return all(
        word in published or FISCAL_YEAR.match(word) is not None or word in PERIOD_WORDS
        for word in label
    )


def _admissible(figure: Figure, output: Output, label: list[str]) -> bool:
    """The gates that no amount of word overlap can talk its way past."""
    if figure.kind == "percent":
        if abs(output.value) > FRACTION_CEILING:
            return False
    elif abs(output.value) <= FRACTION_CEILING:
        return False

    if figure.kind == "multiple" and RATIO_NAME.search(output.name) is None:
        return False

    name = tokens(output.name)
    basis = tokens(output.basis)

    label_period = _period(label)
    output_period = _period(name) | _period(basis)
    if label_period and output_period and not (label_period & output_period):
        return False

    label_basis = _basis(label)
    output_basis = _basis(name) | _basis(basis)
    if label_basis and output_basis and not (label_basis & output_basis):
        return False

    if figure.subject and not _accounted_for(label, set(name) | set(basis)):
        return False

    return True


def link(
    figures: list[Figure], outputs: list[Output]
) -> tuple[list[Link], list[Unlinked]]:
    """Match each figure to the output row it claims to be, or to nothing."""
    vocabulary = Vocabulary(outputs)
    links: list[Link] = []
    unlinked: list[Unlinked] = []

    for figure in figures:
        if figure.range_endpoint:
            unlinked.append(Unlinked(figure, "one end of a printed range"))
            continue
        label = tokens(figure.label)
        if not label:
            unlinked.append(Unlinked(figure, "nothing names it"))
            continue
        context = set(tokens(figure.section)) | set(tokens(figure.context))
        label_set = set(label)
        context -= label_set

        scored = [
            (
                _score(vocabulary, index, label_set, context)
                if _admissible(figure, output, label)
                else 0.0,
                index,
            )
            for index, output in enumerate(outputs)
        ]
        scored.sort(reverse=True)

        best, best_index = scored[0]
        runner_up = scored[1][0] if len(scored) > 1 else 0.0

        if best < THRESHOLD:
            unlinked.append(
                Unlinked(figure, f"no output fits the label (best {best:.2f})")
            )
            continue
        if best - runner_up < MARGIN:
            unlinked.append(
                Unlinked(
                    figure,
                    f"two outputs fit equally well "
                    f"({outputs[best_index].ref} {best:.2f}, "
                    f"{outputs[scored[1][1]].ref} {runner_up:.2f})",
                )
            )
            continue

        links.append(
            Link(
                figure=figure,
                output=outputs[best_index],
                score=best,
                runner_up=runner_up,
            )
        )

    return links, unlinked


def rank(
    figure: Figure, outputs: list[Output], limit: int = 5
) -> list[tuple[Output, float]]:
    """The outputs this figure could be, best first.

    :func:`link` throws away everything but the winner, which is right for
    a check and wrong for a person. The confirmation queue has to show
    *« or did you mean this one »*, and the two figures the linker refused
    because « two outputs fit equally well » are exactly the cases where a
    banker settles it in a second and the engine never can.

    Same scoring, same admissibility. An inadmissible output scores zero
    and never appears — a percentage is not a multiple whichever way a
    person is asked about it.
    """
    label = tokens(figure.label)
    if not label:
        return []
    vocabulary = Vocabulary(outputs)
    context = (set(tokens(figure.section)) | set(tokens(figure.context))) - set(label)
    scored = [
        (
            _score(vocabulary, index, set(label), context)
            if _admissible(figure, output, label)
            else 0.0,
            index,
        )
        for index, output in enumerate(outputs)
    ]
    scored.sort(reverse=True)
    return [(outputs[index], score) for score, index in scored[:limit] if score > 0]


__all__ = [
    "BASIS_GROUPS",
    "BETA",
    "CONTEXT_WEIGHT",
    "FRACTION_CEILING",
    "MARGIN",
    "STOPWORDS",
    "SYNONYMS",
    "THRESHOLD",
    "Link",
    "Unlinked",
    "Vocabulary",
    "link",
    "normalise",
    "rank",
    "tokens",
]
