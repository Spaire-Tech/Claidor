"""What a cell is *meant to look like*, from the format the workbook carries.

A model cell holds `0.1222587719`. The workbook says it is meant to read
`12.2%`, and it says so precisely — Excel stores a format code on every
cell and the whole file format is built on that separation of value from
presentation.

Getting this right matters more here than in an ordinary spreadsheet
viewer, because the argument this product makes is that **a printed figure
is a claim at the precision it was printed to**. A deck that says `9.9x`
has claimed one decimal. A screen of ours that answers `0.1222587719`
where the model shows `12.2%` is contradicting that argument on its own
page — it is showing a precision nobody chose and no document carries.

**This reads a subset, on purpose.** Excel's format language covers
conditions, colours, four sections, locale codes and text sections; a full
implementation is a project. What is here is the shape of every code a
financial model actually uses — a prefix, thousands, a number of decimals,
a suffix, and a negative convention — and everything it does not
understand falls back to the plain value rather than guessing. A wrong
number would be worse than an unformatted one.
"""

import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

#: Excel writes up to four sections separated by semicolons — positive,
#: negative, zero, text. Only the first two are read: the third is almost
#: always a dash for a blank row, and the fourth cannot apply to a number.
SECTIONS = 4

#: Everything inside quotes, and everything escaped with a backslash, is a
#: literal. `"$"#,##0.0` and `\$#,##0.0` are the same code written twice.
LITERAL = re.compile(r'"([^"]*)"|\\(.)')

#: The numeric core of a section: hashes, zeros, commas and one point.
CORE = re.compile(r"[#0][#0,]*(?:\.[#0]+)?")

#: Codes that are about a date and not about a number. A cell formatted as
#: a date holds a serial number, and « 45,678.0 » is a worse answer than
#: the serial itself.
DATE = re.compile(r"(?<!\\)(?:\[\$-[^\]]*\])?[ymdhs]{1,4}", re.IGNORECASE)


class Format:
    """One workbook format code, read far enough to render a number."""

    __slots__ = (
        "decimals",
        "grouped",
        "known",
        "parens",
        "percent",
        "prefix",
        "suffix",
    )

    def __init__(self, code: str | None) -> None:
        self.prefix = ""
        self.suffix = ""
        self.decimals: int | None = None
        self.grouped = False
        self.percent = False
        self.parens = False
        self.known = False

        if not code:
            return
        text = code.strip()
        if not text or text.lower() == "general":
            return
        # A date format is not a number format. Saying « unknown » sends
        # the caller back to the raw serial, which is at least true.
        if DATE.search(LITERAL.sub("", text.split(";")[0])):
            return

        parts = text.split(";")[:SECTIONS]
        positive = parts[0]
        # « (1,234.5) » rather than « -1,234.5 »: the accounting
        # convention, and the one every banker's model is written in.
        self.parens = len(parts) > 1 and "(" in parts[1]

        core = CORE.search(LITERAL.sub("", positive))
        if core is None:
            return

        body = core.group(0)
        self.grouped = "," in body
        self.decimals = len(body.split(".")[1]) if "." in body else 0

        before, after = positive.split(body, 1) if body in positive else ("", "")
        self.prefix = _literals(before)
        self.suffix = _literals(after)
        self.percent = "%" in positive
        if self.percent and "%" not in self.suffix:
            self.suffix += "%"
        self.known = True


#: Symbols a model writes bare, outside quotes: `$#,##0.0`, `#,##0.0x`.
BARE = "$£€¥xX"


def _literals(part: str) -> str:
    """The text a person actually sees, out of a chunk of format code.

    Quoted and escaped runs are taken whole; everything between them
    contributes only its bare symbols. Walking it once rather than
    scanning twice, because a scan for quoted text plus a scan for bare
    symbols counts a quoted `"$"` — or the `"x"` on a multiple — twice
    over, which is how `$1,235` first came out as `$$1,235`.
    """
    out: list[str] = []
    at = 0
    for match in LITERAL.finditer(part):
        out.extend(c for c in part[at : match.start()] if c in BARE)
        out.append(match.group(1) if match.group(1) is not None else match.group(2))
        at = match.end()
    out.extend(c for c in part[at:] if c in BARE)
    return "".join(out)


def show(value: Decimal | None, code: str | None) -> str | None:
    """The cell as the workbook would draw it, or `None` when it cannot say.

    `None` rather than a fallback string, so the caller decides what to do
    without having to guess whether it was formatted — a screen that cannot
    tell the difference is a screen that will quietly print a serial number
    as a currency one day.
    """
    if value is None:
        return None
    form = Format(code)
    if not form.known or form.decimals is None:
        return None

    try:
        scaled = value * 100 if form.percent else value
        quantum = Decimal(1).scaleb(-form.decimals)
        rounded = scaled.quantize(quantum, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        return None

    negative = rounded < 0
    digits = f"{abs(rounded):,f}" if form.grouped else f"{abs(rounded):f}"
    body = f"{form.prefix}{digits}{form.suffix}"
    if not negative:
        return body
    return f"({body})" if form.parens else f"-{body}"
