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


#: A run of capitals is a name, not a word: `TO`, `SO`, `RAV`, `CDE`.
CAPITALS = re.compile(r"\b[A-Z]{2,}\b")

#: Above this many words, capitals are a shout rather than a name — a
#: heading such as `NOTES TO THE FINANCIAL STATEMENTS` is set in capitals
#: throughout, and protecting every word of it would put `the` and `to`
#: back into the vocabulary for the whole document.
SHOUTING = 4


def acronyms(text: str) -> set[str]:
    """The words in `text` that are written as capitals rather than prose.

    **This exists because an entire licence entity was invisible.** Ofgem's
    price control model keeps the transmission owner on a sheet called
    `NGET TO` and the system operator on `NGET SO`, and the direction
    document that feeds it heads one table *National Grid Electricity
    Transmission TO* and the next one *…SO*. `to` is an English stopword.
    So `NGET TO` tokenised to `['nget']` while `NGET SO` kept `['nget',
    'so']` — making the TO sheet a strict subset of the SO sheet, unable
    to win any match against it, and sending every transmission-owner
    figure in the document to a system-operator cell. Seven false
    contradictions on the first real model this was measured against.

    Stopwords are a device for prose. `TO` here is not the preposition; it
    is the name of a licensed business. Capitals are how the document says
    so, and reading past the case throws that away.
    """
    if not any(one.isalpha() for one in text):
        return set()
    if len(text.split()) > SHOUTING and text == text.upper():
        return set()
    return {one.lower() for one in CAPITALS.findall(text)}


def tokens(text: str) -> list[str]:
    """Content words, normalised, in order and with duplicates dropped."""
    named = acronyms(text)
    flattened = re.sub(r"[^a-z0-9]+", " ", text.lower())
    for phrase, word in PHRASES.items():
        flattened = flattened.replace(phrase, word)
    raw = re.findall(r"[a-z][a-z0-9]*", flattened)
    seen: dict[str, None] = {}
    for word in raw:
        # An acronym keeps its own spelling: it is not a plural to strip
        # and not a stopword to drop. `COGS` is not `cog`.
        if word in named:
            seen.setdefault(word, None)
            continue
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


def _same_period(label: set[str], output: set[str]) -> bool:
    """Whether two sets of period words can be talking about one period.

    **A year with no marker is still that year.** `FY2025A` is the actual,
    `FY2025E` the estimate, and those two are genuinely different figures —
    telling them apart is most of what this gate is for. But `FY2025`, bare,
    asserts nothing about which basis it is on, and refusing to match it
    against `FY2025A` rejects the right cell for saying less rather than
    for saying something else.

    Found on the Cascade accounts the moment a sheet called *FY2025 balance
    sheet* started contributing to a cell's basis: `Total debt outstanding
    at 31 December FY2025A` stopped reaching `Assumptions!B24`, whose sheet
    said `FY2025` and whose value was the right one.
    """
    if label & output:
        return True
    for one in label:
        for other in output:
            first, second = FISCAL_YEAR.match(one), FISCAL_YEAR.match(other)
            if first is None or second is None:
                continue
            if first.group(1) != second.group(1):
                continue
            # Same year. Compatible unless both name a basis and disagree.
            if not first.group(2) or not second.group(2):
                return True
    return False


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
        #: word -> indices of the outputs using it. The block a figure
        #: scores against is the union of its own words' postings — a
        #: candidate sharing *no* word can only ever score zero (covered
        #: stays empty, so recall is zero), so skipping it changes no
        #: outcome, only the bill: 1,234 figures against 137,852 cells
        #: was twenty minutes of scoring zeros.
        self.postings: dict[str, list[int]] = {}
        for index, (name, basis) in enumerate(zip(self.names, self.bases, strict=True)):
            for word in set(name) | set(basis):
                document_frequency[word] = document_frequency.get(word, 0) + 1
                self.postings.setdefault(word, []).append(index)

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

    def block(self, said: set[str]) -> list[int]:
        """The candidates worth scoring for a figure that said these words."""
        found: set[int] = set()
        for word in said:
            found.update(self.postings.get(word, ()))
        return sorted(found)


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
            # An *unmatched* period must not dilute the words that carry
            # meaning: « Equity beta » against « FY2027 Equity Beta »
            # scored 0.45 — under the 0.50 line — purely because the cell
            # said which year it was, which the document label was never
            # going to repeat, and `_same_period` has already refused any
            # real contradiction. A *matched* period stays: « % margin
            # FY2025A » agreeing with the cell's own year is genuine
            # corroboration, and cutting it demoted a tie the margin gate
            # was rightly refusing into a no-fit. Asymmetric coverage,
            # asymmetrically applied.
            if (
                (FISCAL_YEAR.match(word) is not None or word in PERIOD_WORDS)
                and word not in label
                and word not in context
            ):
                continue
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
    elif abs(output.value) <= FRACTION_CEILING and (
        figure.value is None or abs(figure.value) > FRACTION_CEILING
    ):
        # A plain figure above the ceiling cannot be claiming a fraction —
        # this is what stops « gross profit 87.4 » reconciling against a
        # gross margin of 0.3818. But a plain figure that *is* a fraction
        # (an equity beta of 0.83, printed bare) is exactly the size of
        # the cells it means, and refusing every fraction-sized cell left
        # it unlinkable however perfect the name.
        return False

    if figure.kind == "multiple" and RATIO_NAME.search(output.name) is None:
        return False

    name = tokens(output.name)
    basis = tokens(output.basis)

    label_period = _period(label)
    output_period = _period(name) | _period(basis)
    if label_period and output_period and not _same_period(label_period, output_period):
        return False

    label_basis = _basis(label)
    output_basis = _basis(name) | _basis(basis)
    if label_basis and output_basis and not (label_basis & output_basis):
        return False

    if figure.subject and not _accounted_for(label, set(name) | set(basis)):
        return False

    return True


def link(
    figures: list[Figure], outputs: list[Output], year: int | None = None
) -> tuple[list[Link], list[Unlinked]]:
    """Match each figure to the output row it claims to be, or to nothing.

    `year` is the year the *document* speaks from, when it says (a
    price-control decision published December 2025 speaks from 2025).
    It powers exactly one thing: the era tiebreak on mixed-value ties,
    below. Without it that tiebreak simply does not run.
    """
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

        block = vocabulary.block(label_set | context)
        scored = [
            (
                _score(vocabulary, index, label_set, context)
                if _admissible(figure, outputs[index], label)
                else 0.0,
                index,
            )
            for index in block
        ]
        scored.sort(reverse=True)

        if not scored:
            unlinked.append(Unlinked(figure, "no output fits the label (best 0.00)"))
            continue
        best, best_index = scored[0]
        runner_up = scored[1][0] if len(scored) > 1 else 0.0

        if best < THRESHOLD:
            unlinked.append(
                Unlinked(figure, f"no output fits the label (best {best:.2f})")
            )
            continue
        if _derivative(figure) and not _agrees(figure, outputs[best_index]):
            # « plus or minus the baseline return on equity », « penalty
            # thresholds are 8% » — prose naming a *derivative* of a
            # quantity: a sensitivity band, a threshold, a cap. The words
            # match the quantity's cell and the number never will, and
            # both false drifts the round-1 re-test produced were this
            # shape. A derivative may corroborate; it may not contradict.
            unlinked.append(
                Unlinked(
                    figure,
                    "states a threshold or sensitivity, not the quantity",
                )
            )
            continue
        if _uncorroborated(label_set | context, outputs[best_index]) and not _agrees(
            figure, outputs[best_index]
        ):
            # A single shared word may corroborate; it may never
            # contradict. The first regulator-scale crosscheck proposed
            # twelve links and every one was a licensee acronym
            # (« NGET ») matched against a dropdown integer in a row
            # named with the same acronym — score 0.54, runner-up 0.00,
            # £13,359.4m reported as disagreeing with 8. Cascade's own
            # « WACC of 9.8% » against the output named `WACC` is the
            # same thinness *agreeing*, and refusing it would cost real
            # coverage — so the line is drawn at the claim: a drift
            # asserted on one word is noise by construction, and the
            # price is that a thin match against a wrong cell that
            # happens to agree slips through silently. That trade is
            # taken with eyes open: the expensive answer this product
            # can give is the false disagreement.
            unlinked.append(
                Unlinked(figure, "a single shared word cannot carry a disagreement")
            )
            continue
        if best - runner_up < MARGIN:
            tied = [
                index for score, index in scored if score > 0 and best - score < MARGIN
            ]
            era = _era_pick(outputs, tied, label, label_set | context, year)
            if era is not None:
                tied = era
                best_index = tied[0]
                best = next(score for score, i in scored if i == best_index)
            if _one_answer(outputs, tied):
                # The « ambiguity » is one flat parameter repeated across
                # the model's year columns — « FY2027 Risk-free rate »
                # 0.023, « FY2028 Risk-free rate » 0.023. A document
                # quoting the parameter without a year is not ambiguous
                # about which quantity it means, and every refusal in the
                # first regulator-scale run of this linker was exactly
                # this shape. Same value, same name once the period words
                # are removed: one answer, kept.
                links.append(
                    Link(
                        figure=figure,
                        output=outputs[best_index],
                        score=best,
                        runner_up=runner_up,
                    )
                )
                continue
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


def _timeless(output: Output) -> list[str]:
    """An output's name with the period words removed.

    The basis — the sheet — is deliberately left out. A model parameter
    is echoed per licensee sheet as well as per year column (GD-BPFM
    holds « Risk-free rate » 0.023 on InputSummary *and* on every
    network's own sheet), and with the sheet in the comparison the
    re-test still refused four of five present targets as ambiguous.
    Same name, same value, different sheet is one answer for the same
    reason two year columns are: whichever copy is chosen, what the
    document is told about its figure is identical.
    """
    return [
        word
        for word in tokens(output.name)
        if FISCAL_YEAR.match(word) is None and word not in PERIOD_WORDS
    ]


#: Prose that marks a derivative of a quantity rather than the quantity:
#: bands, limits, and stress ranges. Both round-1 false drifts on the
#: regulator pair were one of these.
DERIVATIVE_WORDS = frozenset(
    {"threshold", "sensitivity", "cap", "collar", "floor", "tolerance", "deadband"}
)
DERIVATIVE_PHRASES = ("plus or minus", "+/-", "±")


def _derivative(figure: Figure) -> bool:
    """True when the figure's own words say it is a band or a limit."""
    words = set(tokens(figure.label)) | set(tokens(figure.context))
    if words & DERIVATIVE_WORDS:
        return True
    raw = f"{figure.label} {figure.context}".lower()
    return any(phrase in raw for phrase in DERIVATIVE_PHRASES)


def _uncorroborated(said: set[str], output: Output) -> bool:
    """True when the match rests on one shared content word and nothing
    else.

    What counts is what the two sides *share*, not how many words each
    brings — the candidate always brings its sheet name as a basis, and
    « Validation » padding the candidate side is not corroboration. A
    shared period is: « Revenue FY2025A » against « FY2025A revenue » is
    anchored by the year even though revenue is the only content word in
    common. « NGET » against « NGET » shares one word and no period, and
    that is the twelve-false-links shape exactly.
    """
    theirs = set(tokens(output.name)) | set(tokens(output.basis))
    shared = said & theirs
    content = {
        word
        for word in shared
        if FISCAL_YEAR.match(word) is None and word not in PERIOD_WORDS
    }
    if len(content) < 2 and len(shared) == len(content):
        return True
    # Short acronym tokens name *who*, never *what*: « SGN-SC » against
    # « ...re-opener (SGN_Sc) » shares two words — sgn, sc — and told a
    # £459.3m figure it disagreed with a £6.2m cyber re-opener line. A
    # claim resting entirely on entity-shaped tokens has named no
    # quantity at all.
    return all(len(word) <= 3 for word in content)


#: Words a document uses to say it means the current regime's number
#: rather than history's — and the reverse. Ofgem's own vocabulary
#: (« allowance », « outturn »); the Bank of England's forecast
#: methodology draws the same line in the same words.
FORWARD_WORDS = frozenset(
    {"forecast", "projected", "allowance", "allowed", "estimate", "assumption"}
)
BACKWARD_WORDS = frozenset(
    {"actual", "outturn", "historical", "historic", "realized", "realised"}
)


def _era_pick(
    outputs: list[Output],
    tied: list[int],
    label: list[str],
    said: set[str],
    year: int | None,
) -> list[int] | None:
    """The tied candidates from the era the document means, or None.

    The mixed-value tie that defeated every recall target on the fair
    pair: a parameter and its own history under one name. « Notional
    gearing » ties ten 0.6 cells (FY2022-31) against FY2021's 0.65 —
    RIIO-2's value — and a December 2025 decision quoting the parameter
    bare means the regime it is deciding, not the one before.

    Three rules, in order of how much the document actually said:

    - A label that carries its own period gets no help — the period
      gates have it.
    - A qualifier word picks a side: « outturn » means history,
      « allowance » means the regime. The words are the regulator's
      own, and they are features, not oracles — the pick still has to
      survive `_one_answer` before anything links.
    - Bare, with a known document year: the document speaks from its
      own era, so candidates whose column-year is at or behind it step
      back. **At**, not just behind: the Finance Annex speaks from
      inside FY2026, and FY2026 is the year being lived — its cells
      hold history's blend (RFR 0.0214 against the regime's flat
      0.023), and keeping it in the set left every recall target
      refusing as « two values ». Forward means strictly after the
      document's own year. The risk taken knowingly: a document
      quoting the *current* year's number in forward-tone prose would
      step that year back and could land on the regime's cell — a
      wrong link the `_one_answer` value test only catches when the
      eras genuinely differ. The other direction of the same
      off-by-one merely refuses, which is the cheap error here.

    Never a value in sight, and the narrowed set must still agree with
    itself — this chooses which *era* to consider, not which cell wins.
    """
    if _period(label):
        return None
    tone = None
    if said & BACKWARD_WORDS:
        tone = "past"
    elif said & FORWARD_WORDS or year is not None:
        tone = "present"
    if tone is None or year is None:
        return None

    def era_of(index: int) -> str:
        years = [
            int(match.group(1)) + (2000 if len(match.group(1)) == 2 else 0)
            for word in tokens(outputs[index].name)
            if (match := FISCAL_YEAR.match(word)) is not None
        ]
        if not years:
            return "either"
        return "past" if max(years) <= year else "present"

    kept = [index for index in tied if era_of(index) in (tone, "either")]
    if kept and len(kept) < len(tied):
        return kept
    return None


def _agrees(figure: Figure, output: Output) -> bool:
    """`compare`'s own arithmetic: equal at the precision the figure
    printed, with the bridge-parenthesis rule applied."""
    printed = figure.printed_value_at_precision()
    expected = figure.as_printed_precision(output.value)
    if figure.parenthesised:
        printed, expected = abs(printed), abs(expected)
    return printed == expected


def _one_answer(outputs: list[Output], tied: list[int]) -> bool:
    """True when picking any tied candidate tells the document the same
    thing.

    First written as « same value, same period-stripped name » — the
    parameter across its year columns. The GD-BPFM broke that spelling:
    « Notional gearing » on MainInputs and « Model Version Notional
    gearing » on Scenarios tie within the margin, both 0.6, and the
    name test refused what was one answer. Value equality alone is the
    honest test — not because value picks a winner, but because when
    every tied candidate holds the same value, agree-or-drift comes out
    identical whichever is chosen. The choice can be cosmetically wrong
    about *which cell* is named; it cannot change what the checker
    says. Two genuinely different quantities that tie still differ in
    value and still refuse.
    """
    first = outputs[tied[0]]
    return all(outputs[index].value == first.value for index in tied[1:])


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
