"""Tier 1's boundary, decided without the solver.

The tier-1 registration (`docs/pierce/logs/prism.md`, « C4 tier 1 —
the Z3 fragment ») names a grammar precisely and a refusal list
beside it. Deciding which side of that line a formula falls on is
pure syntax: no solver, no dependency, no evaluation. This module is
that decision, and it exists while `z3-solver` is still absent so
that the registration's own requirement — « the coverage denominator
reported beside every catch number » — can be measured rather than
argued about.

What it does **not** do: decide equivalence. A pair both of whose
formulas are eligible is a pair tier 1 *could* judge; whether they
are the same function is the solver's answer, and this module never
guesses it.
"""

from dataclasses import dataclass

from openpyxl.formula.tokenizer import Token, Tokenizer

#: Functions the fragment reaches, per the registration — which lists
#: « comparisons and `AND OR NOT`, boolean-valued » alongside the
#: arithmetic ones. The first draft omitted the three booleans and the
#: corpus run caught it: 100 cells came back `unlisted_function: AND`,
#: refused against a grammar that names them. Recorded in the lane
#: log rather than fixed silently.
FRAGMENT_FUNCTIONS = frozenset(
    {"IF", "MIN", "MAX", "ABS", "SUM", "SUMPRODUCT", "AND", "OR", "NOT"}
)

#: The named refusal families, in the registration's own words. The
#: order matters: the first family a formula trips is the one
#: reported, so « INDEX(...) & TEXT(...) » is refused as a lookup.
_FAMILIES: tuple[tuple[str, frozenset[str]], ...] = (
    (
        "lookup_or_selection",
        frozenset(
            {
                "INDEX",
                "MATCH",
                "VLOOKUP",
                "HLOOKUP",
                "XLOOKUP",
                "LOOKUP",
                "CHOOSE",
                "OFFSET",
                "INDIRECT",
                "FILTER",
                "SORT",
                "UNIQUE",
            }
        ),
    ),
    (
        "volatile_or_environment",
        frozenset({"TODAY", "NOW", "RAND", "RANDBETWEEN", "CELL", "INFO"}),
    ),
    (
        "text_or_date",
        frozenset(
            {
                "TEXT",
                "CONCATENATE",
                "CONCAT",
                "LEFT",
                "RIGHT",
                "MID",
                "LEN",
                "TRIM",
                "SUBSTITUTE",
                "REPLACE",
                "UPPER",
                "LOWER",
                "PROPER",
                "FIND",
                "SEARCH",
                "VALUE",
                "DATE",
                "YEAR",
                "MONTH",
                "DAY",
                "EDATE",
                "EOMONTH",
                "DATEDIF",
                "TEXTJOIN",
                "DAYS",
                "WEEKDAY",
            }
        ),
    ),
    (
        "conditional_aggregate",
        frozenset(
            {
                "SUMIF",
                "SUMIFS",
                "AVERAGEIF",
                "AVERAGEIFS",
                "COUNTIF",
                "COUNTIFS",
                "MAXIFS",
                "MINIFS",
            }
        ),
    ),
    (
        "error_handling",
        frozenset({"IFERROR", "IFNA", "ISERROR", "ISNA", "ISBLANK", "ISNUMBER"}),
    ),
)

#: A range with no row numbers on either side — « 'Sheet'!$M:$M ».
#: The registration refuses these by name: their extent is not
#: concretely known and may differ between the versions, which is
#: precisely the LIA* wall the SQLSolver reading said does not
#: transfer to money.
WHOLE_COLUMN = "whole_column_range"

UNPARSEABLE = "unparseable"
UNLISTED_FUNCTION = "unlisted_function"
ARRAY_FORMULA = "array_formula"


@dataclass(frozen=True)
class Eligibility:
    """Is this formula inside tier 1's fragment, and if not, why not."""

    eligible: bool
    #: The named construct that put it outside, or "" when eligible.
    construct: str = ""
    #: The specific token, for a reader: « INDEX », « $M:$M ».
    detail: str = ""


def _function_names(formula: str) -> list[str]:
    names = []
    for token in Tokenizer(formula).items:
        if token.type == Token.FUNC and token.subtype == Token.OPEN:
            name = token.value.rstrip("(").upper()
            names.append(name.removeprefix("_XLFN.").lstrip("@"))
    return names


def _whole_column(formula: str) -> str:
    """The first whole-column reference, or empty."""
    for token in Tokenizer(formula).items:
        if token.type != Token.OPERAND or token.subtype != Token.RANGE:
            continue
        piece = token.value.split("!")[-1]
        if ":" not in piece:
            continue
        left, right = piece.split(":", 1)
        if not any(character.isdigit() for character in left + right):
            return token.value
    return ""


def classify(formula: str | None) -> Eligibility:
    """One formula against the registered grammar.

    A literal (no formula) is eligible: it is a constant, which the
    fragment reaches trivially.
    """
    if formula is None:
        return Eligibility(True)
    body = formula[1:] if formula.startswith("=") else formula
    if body.startswith("{") or body.endswith("}"):
        return Eligibility(False, ARRAY_FORMULA, body[:60])
    #: openpyxl's tokenizer only tokenizes a *formula*: without the
    #: leading « = » it returns the whole string as one LITERAL and
    #: every function name goes unseen. The first draft stripped the
    #: sign and called INDEX(...) eligible; the constructed tests
    #: caught it before any corpus number was read.
    text = body if body.startswith("=") else f"={body}"
    try:
        names = _function_names(text)
    except Exception:
        return Eligibility(False, UNPARSEABLE, text[:60])
    #: Family order decides, not order of appearance: « MID(CELL(…)) »
    #: is an *environment* formula that happens to slice text, and
    #: calling it text would hide the reason it can never be proved.
    for family, members in _FAMILIES:
        for name in names:
            if name in members:
                return Eligibility(False, family, name)
    unlisted = [name for name in names if name not in FRAGMENT_FUNCTIONS]
    if unlisted:
        return Eligibility(False, UNLISTED_FUNCTION, unlisted[0])
    column = _whole_column(text)
    if column:
        return Eligibility(False, WHOLE_COLUMN, column)
    return Eligibility(True)


def eligible_pair(old: str | None, new: str | None) -> Eligibility:
    """Both sides, since tier 1 judges a *pair*. The first side that
    falls outside is the one reported — a pair is only as eligible as
    its worse half."""
    for formula in (old, new):
        verdict = classify(formula)
        if not verdict.eligible:
            return verdict
    return Eligibility(True)
