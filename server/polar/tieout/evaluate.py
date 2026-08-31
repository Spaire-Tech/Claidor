"""The one-step evaluator: what a formula would say, from cached values.

Registered in `docs/pierce/analytical-checks-protocol.md` (17 August)
before any result was shown. The whole trick is that no recomputation
is ever needed: every cell the model has already carries the value
Excel last computed for it, so evaluating a formula is one substitution
— replace each reference with its stored value and do the arithmetic.
Exact for everything inside the whitelist, and an abstention (`None`)
for everything outside it: any unknown function, any text arithmetic,
any reference to a cell whose cached value is unknown.

Proof lives in `scripts/evaluator_grading.py`: every formula cell in
the corpus is a test case with the answer written in it.
"""

import re

from openpyxl.formula.tokenizer import Token, Tokenizer
from openpyxl.utils import column_index_from_string, get_column_letter

from .workbook import Workbook

#: The functions the evaluator understands. Everything else abstains.
FUNCTIONS = frozenset({"SUM", "IF", "MIN", "MAX", "ABS", "ROUND", "AVERAGE"})

_REF = re.compile(
    r"^(?:'(?P<qsheet>[^']+)'!|(?P<sheet>[A-Za-z_][\w .]*)!)?"
    r"\$?(?P<col>[A-Z]{1,3})\$?(?P<row>\d+)"
    r"(?::\$?(?P<col2>[A-Z]{1,3})\$?(?P<row2>\d+))?$"
)


class _Abstain(Exception):
    """Not an error — the honest « I don't know »."""


def _tokens(formula: str) -> list[Token]:
    try:
        return [
            token for token in Tokenizer(formula).items if token.type != Token.WSPACE
        ]
    except Exception as error:
        raise _Abstain from error


def _value_of(book: Workbook, sheet: str, coordinate: str) -> float:
    cell = book.cells.get(f"{sheet}!{coordinate}")
    if cell is None:
        #: No stored numeric cell there — Excel's empty-cell convention.
        return 0.0
    if cell.value is None:
        raise _Abstain
    return float(cell.value)


def _range_values(book: Workbook, sheet: str, match: "re.Match[str]") -> list[float]:
    top = min(int(match.group("row")), int(match.group("row2")))
    bottom = max(int(match.group("row")), int(match.group("row2")))
    left = column_index_from_string(match.group("col"))
    right = column_index_from_string(match.group("col2"))
    if left > right:
        left, right = right, left
    if (bottom - top + 1) * (right - left + 1) > 4096:
        raise _Abstain
    values: list[float] = []
    for row in range(top, bottom + 1):
        for column in range(left, right + 1):
            cell = book.cells.get(f"{sheet}!{get_column_letter(column)}{row}")
            if cell is None:
                continue  # empty — aggregates skip it, as Excel does
            if cell.value is None:
                raise _Abstain
            values.append(float(cell.value))
    return values


class _Parser:
    """Recursive descent over openpyxl's own token stream."""

    def __init__(self, book: Workbook, sheet: str, tokens: list[Token]):
        self.book = book
        self.sheet = sheet
        self.tokens = tokens
        self.at = 0

    def peek(self) -> Token | None:
        return self.tokens[self.at] if self.at < len(self.tokens) else None

    def take(self) -> Token:
        token = self.peek()
        if token is None:
            raise _Abstain
        self.at += 1
        return token

    # comparison < addition < multiplication < power < unary < atom
    def expression(self) -> float:
        left = self.additive()
        token = self.peek()
        while (
            token
            and token.type == Token.OP_IN
            and token.value
            in (
                "=",
                "<>",
                "<",
                "<=",
                ">",
                ">=",
            )
        ):
            op = self.take().value
            right = self.additive()
            result = {
                "=": left == right,
                "<>": left != right,
                "<": left < right,
                "<=": left <= right,
                ">": left > right,
                ">=": left >= right,
            }[op]
            left = 1.0 if result else 0.0
            token = self.peek()
        return left

    def additive(self) -> float:
        left = self.multiplicative()
        token = self.peek()
        while token and token.type == Token.OP_IN and token.value in "+-":
            op = self.take().value
            right = self.multiplicative()
            left = left + right if op == "+" else left - right
            token = self.peek()
        return left

    def multiplicative(self) -> float:
        left = self.power()
        token = self.peek()
        while token and token.type == Token.OP_IN and token.value in "*/":
            op = self.take().value
            right = self.power()
            if op == "/":
                if right == 0:
                    raise _Abstain  # #DIV/0! is Excel's answer, not ours
                left = left / right
            else:
                left = left * right
            token = self.peek()
        return left

    def power(self) -> float:
        left = self.unary()
        token = self.peek()
        while token and token.type == Token.OP_IN and token.value == "^":
            self.take()
            right = self.unary()
            try:
                left = left**right
            except (OverflowError, ValueError) as error:
                raise _Abstain from error
        return left

    def unary(self) -> float:
        token = self.peek()
        if token and token.type == Token.OP_PRE and token.value in "+-":
            op = self.take().value
            value = self.unary()
            return -value if op == "-" else value
        value = self.atom()
        token = self.peek()
        while token and token.type == Token.OP_POST and token.value == "%":
            self.take()
            value = value / 100.0
            token = self.peek()
        return value

    def atom(self) -> float:
        token = self.take()
        if token.type == Token.OPERAND and token.subtype == Token.NUMBER:
            return float(token.value)
        if token.type == Token.OPERAND and token.subtype == Token.RANGE:
            match = _REF.match(token.value.strip())
            if match is None:
                raise _Abstain  # a defined name — outside the whitelist
            sheet = (
                match.group("qsheet") or match.group("sheet") or self.sheet
            ).strip()
            if match.group("col2"):
                values = _range_values(self.book, sheet, match)
                #: A bare range outside an aggregate has no one value.
                if len(values) != 1:
                    raise _Abstain
                return values[0]
            return _value_of(
                self.book, sheet, f"{match.group('col')}{match.group('row')}"
            )
        if token.type == Token.PAREN and token.subtype == Token.OPEN:
            value = self.expression()
            closing = self.take()
            if closing.type != Token.PAREN:
                raise _Abstain
            return value
        if token.type == Token.FUNC and token.subtype == Token.OPEN:
            return self.function(token.value[:-1].upper())
        raise _Abstain

    def _skip_argument(self) -> None:
        """Consume one argument without evaluating — IF's untaken branch,
        which may hold text or functions outside the whitelist."""
        depth = 0
        while True:
            token = self.peek()
            if token is None:
                raise _Abstain
            if token.subtype == Token.OPEN:
                depth += 1
            elif token.subtype == Token.CLOSE:
                if depth == 0:
                    return
                depth -= 1
            elif token.type == Token.SEP and depth == 0:
                return
            self.take()

    def function(self, name: str) -> float:
        if name not in FUNCTIONS:
            raise _Abstain

        if name == "IF":
            condition = self.expression()
            token = self.take()
            if token.type != Token.SEP:
                raise _Abstain
            if condition != 0:
                value = self.expression()
                token = self.peek()
                if token and token.type == Token.SEP:
                    self.take()
                    self._skip_argument()
            else:
                self._skip_argument()
                token = self.peek()
                if token and token.type == Token.SEP:
                    self.take()
                    value = self.expression()
                else:
                    value = 0.0  # IF with no else-branch is FALSE → 0
            closing = self.take()
            if closing.subtype != Token.CLOSE:
                raise _Abstain
            return value

        #: The aggregates: arguments are scalars or ranges, flattened.
        values: list[float] = []
        while True:
            token = self.peek()
            if token is None:
                raise _Abstain
            if (
                token.type == Token.OPERAND
                and token.subtype == Token.RANGE
                and (match := _REF.match(token.value.strip())) is not None
                and match.group("col2")
            ):
                self.take()
                sheet = (
                    match.group("qsheet") or match.group("sheet") or self.sheet
                ).strip()
                values.extend(_range_values(self.book, sheet, match))
            else:
                values.append(self.expression())
            token = self.take()
            if token.type == Token.SEP:
                continue
            if token.subtype == Token.CLOSE:
                break
            raise _Abstain

        if name == "SUM":
            return sum(values)
        if name == "MIN":
            if not values:
                raise _Abstain
            return min(values)
        if name == "MAX":
            if not values:
                raise _Abstain
            return max(values)
        if name == "AVERAGE":
            if not values:
                raise _Abstain
            return sum(values) / len(values)
        if name == "ABS":
            if len(values) != 1:
                raise _Abstain
            return abs(values[0])
        # ROUND
        if len(values) != 2:
            raise _Abstain
        return round(values[0], int(values[1]))


def evaluate(book: Workbook, sheet: str, formula: str) -> float | None:
    """One-step evaluation, or None — never a guess."""
    if not formula.startswith("="):
        return None
    try:
        #: The tokenizer wants the leading `=` — without it the whole
        #: formula comes back as one LITERAL.
        parser = _Parser(book, sheet, _tokens(formula))
        value = parser.expression()
        if parser.peek() is not None:
            return None  # trailing tokens — something unparsed
        return value
    except _Abstain:
        return None
    except Exception:
        return None


_SHIFT = re.compile(r"('[^']+'!|\b[A-Za-z_][\w.]*!)?(\$?)([A-Z]{1,3})(\$?)(\d+)")


def shifted(formula: str, columns: int) -> str:
    """The row's formula, moved sideways — `=M44*(1+M42)` one column
    right becomes `=N44*(1+N42)`. Absolute columns stay put, exactly as
    Excel's own fill does."""

    def move(match: "re.Match[str]") -> str:
        prefix = match.group(1) or ""
        if match.group(2) == "$":
            return match.group(0)
        at = column_index_from_string(match.group(3)) + columns
        if at < 1:
            return match.group(0)
        return f"{prefix}{get_column_letter(at)}{match.group(4)}{match.group(5)}"

    return _SHIFT.sub(move, formula)
