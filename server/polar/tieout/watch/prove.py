"""Tier 1 — the proof that two formulas are the same function.

Registered in `docs/pierce/logs/prism.md` (« C4 tier 1 — the Z3
fragment ») before any of this existed, and gated there: **zero
false proofs**. The `z3-solver` dependency the registration held for
the lead's approval was approved by the founder on 2 September 2026
(« implement it all »), and this module is the first to import it.

What it decides. Given the old and new formula of one matched cell,
both inside the registered fragment — literals, `+ - * / ^` with a
literal integer exponent, comparisons and `AND OR NOT`, `IF`, `MIN
MAX ABS`, `SUM` and `SUMPRODUCT` over concretely known ranges of
identical extent, cell references — it asks the solver whether any
assignment of real numbers to the referenced cells makes the two
formulas differ. `unsat` is a proof: *the same function of the same
inputs, under exact real arithmetic.* `sat` is a refutation with the
assignment printed. Anything else is UNKNOWN, and a timeout is a
timeout, never a proof.

What it declares. Division is partial: every `/` adds the side
condition « that divisor is not zero », and a proof discharged under
such conditions carries them in words. The arithmetic is exact
reals, so a positive verdict says nothing about rounding; tier 2 is
the only tier that speaks about floats.

What it refuses. Everything outside the fragment, by the name of the
construct that put it outside (`fragment.classify`), before the
solver is asked. And, from the founder's research round: **never ask
the solver to optimise a ratio.** Over nonlinear reals its optimiser
can return a wrong optimum. Any future use that needs a bound
multiplies the inequality through and binary-searches the threshold
with plain satisfiability checks, each of which is a real proof.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from openpyxl.formula.tokenizer import Token, Tokenizer
from openpyxl.utils import get_column_letter, range_boundaries

from .fragment import Eligibility, eligible_pair

EQ = "proved_equivalent"
NEQ = "refuted"
UNKNOWN = "unknown"
TIMEOUT = "timeout"
REFUSED = "refused"

#: Seconds the solver may spend on one pair — the registered budget.
PROOF_TIMEOUT_SECONDS = 10.0


@dataclass(frozen=True)
class ProofVerdict:
    """One pair's answer, in the registration's vocabulary."""

    verdict: str
    #: For REFUSED and UNKNOWN: the construct or reason, in words.
    reason: str = ""
    #: For NEQ: one assignment that separates the two, ref → value.
    counterexample: dict[str, float] = field(default_factory=dict)
    #: For EQ: the side conditions the proof was discharged under.
    conditions: tuple[str, ...] = ()
    #: The referenced cells both sides read, sorted.
    variables: tuple[str, ...] = ()


class _Unsupported(Exception):
    """A construct the fragment does not reach — named."""


_REF = re.compile(
    r"^(?:(?P<sheet>'[^']+'|[^'!]+)!)?\$?(?P<col>[A-Z]{1,3})\$?(?P<row>\d+)$"
)
_RANGE = re.compile(
    r"^(?:(?P<sheet>'[^']+'|[^'!]+)!)?\$?(?P<c1>[A-Z]{1,3})\$?(?P<r1>\d+):\$?(?P<c2>[A-Z]{1,3})\$?(?P<r2>\d+)$"
)


def _sheet_of(text: str | None, default: str) -> str:
    if not text:
        return default
    return text.strip("'")


def _cells_of(operand: str, sheet: str) -> list[str]:
    """A cell or a concretely bounded range, as canonical refs."""
    #: Only the cell part is case-folded; a sheet name keeps its case,
    #: because « Control Panel!C51 » and « CONTROL PANEL!C51 » must be
    #: the same variable as the reader names it.
    sheet_part, bang, cell_part = operand.rpartition("!")
    clean = (f"{sheet_part}{bang}" if bang else "") + cell_part.upper().replace("$", "")
    m = _REF.match(clean)
    if m:
        return [
            f"{_sheet_of(m.group('sheet'), sheet)}!{m.group('col')}{m.group('row')}"
        ]
    m = _RANGE.match(clean)
    if m:
        name = _sheet_of(m.group("sheet"), sheet)
        c1, r1, c2, r2 = range_boundaries(
            f"{m.group('c1')}{m.group('r1')}:{m.group('c2')}{m.group('r2')}"
        )
        if not (c1 and r1 and c2 and r2):
            raise _Unsupported(f"range {operand}")
        out = []
        for r in range(r1, r2 + 1):
            for c in range(c1, c2 + 1):
                out.append(f"{name}!{get_column_letter(c)}{r}")
        return out
    raise _Unsupported(f"reference {operand}")


# --- a small Pratt parser over openpyxl's tokens ----------------------------

_PRECEDENCE = {
    "=": 1,
    "<>": 1,
    "<": 1,
    "<=": 1,
    ">": 1,
    ">=": 1,
    "+": 3,
    "-": 3,
    "*": 4,
    "/": 4,
    "^": 6,
}


@dataclass
class _Node:
    kind: str  # "num" | "bool" | "ref" | "range" | "op" | "neg" | "call"
    value: Any = None
    args: list[_Node] = field(default_factory=list)


class _Parser:
    def __init__(self, formula: str, sheet: str) -> None:
        text = formula if formula.startswith("=") else f"={formula}"
        self.tokens = [
            t
            for t in Tokenizer(text).items
            if t.type not in ("WHITE-SPACE", "WHITESPACE")
        ]
        self.pos = 0
        self.sheet = sheet

    def peek(self) -> Token | None:
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def take(self) -> Token:
        token = self.tokens[self.pos]
        self.pos += 1
        return token

    def parse(self) -> _Node:
        node = self.expression(0)
        trailing = self.peek()
        if trailing is not None:
            raise _Unsupported(f"trailing token {trailing.value!r}")
        return node

    def expression(self, floor: int) -> _Node:
        left = self.unary()
        while True:
            token = self.peek()
            if token is None or token.type != Token.OP_IN:
                break
            op = token.value
            if op == "&":
                raise _Unsupported("text concatenation &")
            prec = _PRECEDENCE.get(op)
            if prec is None:
                raise _Unsupported(f"operator {op}")
            if prec < floor:
                break
            self.take()
            #: `^` binds right; everything else left.
            right = self.expression(prec if op == "^" else prec + 1)
            left = _Node("op", op, [left, right])
        return left

    def unary(self) -> _Node:
        token = self.peek()
        if token is not None and token.type == Token.OP_PRE:
            self.take()
            operand = self.unary()
            if token.value == "-":
                return _Node("neg", None, [operand])
            if token.value == "+":
                return operand
            raise _Unsupported(f"prefix {token.value}")
        node = self.primary()
        token = self.peek()
        if token is not None and token.type == Token.OP_POST:
            self.take()
            if token.value == "%":
                return _Node("op", "/", [node, _Node("num", 100.0)])
            raise _Unsupported(f"postfix {token.value}")
        return node

    def primary(self) -> _Node:
        token = self.take()
        if token.type == Token.OPERAND:
            if token.subtype == Token.NUMBER:
                return _Node("num", float(token.value))
            if token.subtype == Token.LOGICAL:
                return _Node("bool", token.value.upper() == "TRUE")
            if token.subtype == Token.RANGE:
                cells = _cells_of(token.value, self.sheet)
                if len(cells) == 1 and ":" not in token.value:
                    return _Node("ref", cells[0])
                return _Node("range", cells)
            raise _Unsupported(f"operand {token.value!r}")
        if token.type == Token.PAREN and token.subtype == Token.OPEN:
            inner = self.expression(0)
            closing = self.take()
            if closing.type != Token.PAREN:
                raise _Unsupported("unbalanced parenthesis")
            return inner
        if token.type == Token.FUNC and token.subtype == Token.OPEN:
            name = token.value.rstrip("(").upper().removeprefix("_XLFN.").lstrip("@")
            args: list[_Node] = []
            while True:
                nxt = self.peek()
                if nxt is None:
                    raise _Unsupported("unterminated function")
                if nxt.type == Token.FUNC and nxt.subtype == Token.CLOSE:
                    self.take()
                    break
                if nxt.type == Token.SEP:
                    self.take()
                    continue
                args.append(self.expression(0))
            return _Node("call", name, args)
        raise _Unsupported(f"token {token.value!r}")


# --- the encoding ------------------------------------------------------------


class _Encoder:
    def __init__(self, z3: Any) -> None:
        self.z3 = z3
        self.variables: dict[str, Any] = {}
        self.conditions: list[Any] = []
        self.condition_words: list[str] = []

    def var(self, ref: str) -> Any:
        if ref not in self.variables:
            self.variables[ref] = self.z3.Real(ref)
        return self.variables[ref]

    def real(self, node: _Node) -> Any:
        z3 = self.z3
        if node.kind == "num":
            return z3.RealVal(node.value)
        if node.kind == "bool":
            return z3.RealVal(1 if node.value else 0)
        if node.kind == "ref":
            return self.var(node.value)
        if node.kind == "range":
            raise _Unsupported("a range outside SUM or SUMPRODUCT")
        if node.kind == "neg":
            return -self.real(node.args[0])
        if node.kind == "op":
            op = node.value
            if op in ("=", "<>", "<", "<=", ">", ">="):
                return z3.If(self.boolean(node), z3.RealVal(1), z3.RealVal(0))
            a, b = self.real(node.args[0]), self.real(node.args[1])
            if op == "+":
                return a + b
            if op == "-":
                return a - b
            if op == "*":
                return a * b
            if op == "/":
                self.conditions.append(b != 0)
                self.condition_words.append(f"{_words(node.args[1])} is not zero")
                return a / b
            if op == "^":
                exponent = node.args[1]
                if exponent.kind != "num" or float(exponent.value) != int(
                    exponent.value
                ):
                    raise _Unsupported("a non-literal or non-integer exponent")
                power = int(exponent.value)
                if power < 0:
                    self.conditions.append(a != 0)
                    self.condition_words.append(f"{_words(node.args[0])} is not zero")
                    result = z3.RealVal(1)
                    for _ in range(-power):
                        result = result / a
                    return result
                result = z3.RealVal(1)
                for _ in range(power):
                    result = result * a
                return result
            raise _Unsupported(f"operator {op}")
        if node.kind == "call":
            return self.call(node)
        raise _Unsupported(node.kind)

    def boolean(self, node: _Node) -> Any:
        z3 = self.z3
        if node.kind == "op" and node.value in ("=", "<>", "<", "<=", ">", ">="):
            a, b = self.real(node.args[0]), self.real(node.args[1])
            return {
                "=": a == b,
                "<>": a != b,
                "<": a < b,
                "<=": a <= b,
                ">": a > b,
                ">=": a >= b,
            }[node.value]
        if node.kind == "bool":
            return z3.BoolVal(node.value)
        if node.kind == "call" and node.value in ("AND", "OR", "NOT"):
            parts = [self.boolean(arg) for arg in node.args]
            if node.value == "AND":
                return z3.And(*parts)
            if node.value == "OR":
                return z3.Or(*parts)
            if len(parts) != 1:
                raise _Unsupported("NOT with more than one argument")
            return z3.Not(parts[0])
        #: Excel treats any nonzero number as TRUE in a condition.
        return self.real(node) != 0

    def flat(self, node: _Node) -> list[Any]:
        if node.kind == "range":
            return [self.var(ref) for ref in node.value]
        return [self.real(node)]

    def call(self, node: _Node) -> Any:
        z3 = self.z3
        name = node.value
        if name == "IF":
            if len(node.args) not in (2, 3):
                raise _Unsupported("IF with an unexpected number of arguments")
            otherwise = (
                self.real(node.args[2]) if len(node.args) == 3 else z3.RealVal(0)
            )
            return z3.If(self.boolean(node.args[0]), self.real(node.args[1]), otherwise)
        if name == "ABS":
            (arg,) = node.args
            value = self.real(arg)
            return z3.If(value < 0, -value, value)
        if name in ("MIN", "MAX"):
            values = [v for arg in node.args for v in self.flat(arg)]
            if not values:
                raise _Unsupported(f"{name} with no arguments")
            result = values[0]
            for value in values[1:]:
                result = (
                    z3.If(value < result, value, result)
                    if name == "MIN"
                    else z3.If(value > result, value, result)
                )
            return result
        if name == "SUM":
            values = [v for arg in node.args for v in self.flat(arg)]
            return z3.Sum(values) if values else z3.RealVal(0)
        if name == "SUMPRODUCT":
            columns = [self.flat(arg) for arg in node.args]
            if not columns or any(len(c) != len(columns[0]) for c in columns):
                raise _Unsupported("SUMPRODUCT over ranges of different extent")
            terms = []
            for i in range(len(columns[0])):
                term = columns[0][i]
                for c in columns[1:]:
                    term = term * c[i]
                terms.append(term)
            return z3.Sum(terms) if terms else z3.RealVal(0)
        if name in ("AND", "OR", "NOT"):
            return z3.If(self.boolean(node), z3.RealVal(1), z3.RealVal(0))
        raise _Unsupported(f"function {name}")


def _words(node: _Node) -> str:
    if node.kind == "ref":
        return str(node.value)
    if node.kind == "num":
        return f"{node.value:g}"
    return "the divisor"


# --- the prover ---------------------------------------------------------------


def prove(
    old: str | None,
    new: str | None,
    *,
    sheet: str = "Sheet",
    timeout_seconds: float = PROOF_TIMEOUT_SECONDS,
) -> ProofVerdict:
    """Are `old` and `new` the same function of the same cells?

    Both formulas are read on `sheet`, so unqualified references
    resolve there; the same cell is the same variable on both sides.
    A literal (no formula) is the constant it holds.
    """
    eligibility: Eligibility = eligible_pair(old, new)
    if not eligibility.eligible:
        return ProofVerdict(REFUSED, f"{eligibility.construct}: {eligibility.detail}")
    try:
        import z3
    except ImportError:  # pragma: no cover — dependency
        return ProofVerdict(UNKNOWN, "z3-solver is not installed")

    encoder = _Encoder(z3)
    try:
        left = encoder.real(_Parser(old or "=0", sheet).parse())
        right = encoder.real(_Parser(new or "=0", sheet).parse())
    except _Unsupported as problem:
        return ProofVerdict(REFUSED, str(problem))
    except Exception as problem:
        return ProofVerdict(UNKNOWN, f"could not read a formula: {str(problem)[:120]}")

    solver = z3.Solver()
    solver.set("timeout", int(timeout_seconds * 1000))
    for condition in encoder.conditions:
        solver.add(condition)
    solver.add(left != right)
    variables = tuple(sorted(encoder.variables))
    conditions = tuple(dict.fromkeys(encoder.condition_words))
    outcome = solver.check()
    if outcome == z3.unsat:
        return ProofVerdict(EQ, variables=variables, conditions=conditions)
    if outcome == z3.sat:
        model = solver.model()
        example: dict[str, float] = {}
        for ref, variable in encoder.variables.items():
            value = model.eval(variable, model_completion=True)
            try:
                example[ref] = float(value.as_fraction())
            except Exception:
                example[ref] = float(str(value.approx(6)).replace("?", ""))
        return ProofVerdict(
            NEQ, counterexample=example, variables=variables, conditions=conditions
        )
    reason = solver.reason_unknown()
    if "timeout" in str(reason).lower() or "canceled" in str(reason).lower():
        return ProofVerdict(TIMEOUT, str(reason), variables=variables)
    return ProofVerdict(UNKNOWN, str(reason), variables=variables)


Prover = Callable[[str | None, str | None], ProofVerdict]
