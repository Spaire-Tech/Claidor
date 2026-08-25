"""The denylist prescan (B2) — what a free engine must not pretend to compute.

Before any recalculation, every formula in the file is scanned for
constructs LibreOffice cannot honestly reproduce. A hit does not fail
the file — it **routes** it, per the toolbox: to the arbiter (real
Excel through the Graph connector) when real Excel could settle it, or
to a refusal in words when nothing we run could. The gate never
compares a cell it had no right to compute; « we did not check this »
is an allowed answer and a silent wrong number is not.

The categories, from `ambre-toolbox.md` §2 and `swens-plan.md` B2:

- **LAMBDA** — LibreOffice has none (its one named gap). The lambda
  helpers (MAKEARRAY, BYROW, BYCOL, MAP, REDUCE, SCAN) take a LAMBDA
  as an argument, so they travel with it. Real Excel computes them:
  arbiter.
- **CUBE*** — OLAP connections a headless engine does not have.
  Arbiter, where the workbook's data model is live in the cloud copy.
- **RTD** — real-time feeds; the value is gone the moment the file is
  saved. Nothing can recompute it: refusal.
- **UDFs** — VBA / add-in functions (`_xludf.` stubs, macro-style
  `Module.Function` names, and any function the catalogue below does
  not know). The code is not in the cells: refusal. The catalogue is
  curated and errs the right way — an unrecognized genuine function
  refuses honestly instead of passing silently.
- **External links** — `[1]Sheet!A1` and `'[Other.xlsx]Sheet'!A1`
  reach outside the file being gated: refusal, naming the reference.

Detection is by openpyxl's tokenizer (Microsoft's own published
grammar, already the engine's choice), not regex over raw text — a
sheet named `'RTD data'` or a label containing `LAMBDA` must not trip
it.
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum

from openpyxl.formula.tokenizer import Token, Tokenizer


class Route(StrEnum):
    """Where a hit sends the file."""

    ARBITER = "arbiter"
    REFUSE = "refuse"


class Category(StrEnum):
    LAMBDA = "lambda"
    CUBE = "cube"
    RTD = "rtd"
    UDF = "udf"
    EXTERNAL = "external-link"


#: The routing policy. Data, not code, so the lead can move a category
#: without touching logic.
ROUTES: dict[Category, Route] = {
    Category.LAMBDA: Route.ARBITER,
    Category.CUBE: Route.ARBITER,
    Category.RTD: Route.REFUSE,
    Category.UDF: Route.REFUSE,
    Category.EXTERNAL: Route.REFUSE,
}

#: Functions that imply a LAMBDA even when the word LAMBDA never
#: appears — they take one as an argument.
LAMBDA_FAMILY = frozenset(
    {"LAMBDA", "MAKEARRAY", "BYROW", "BYCOL", "MAP", "REDUCE", "SCAN", "ISOMITTED"}
)

RTD_FUNCTIONS = frozenset({"RTD"})

#: `[1]Sheet1!A1` — a workbook-index external reference — or an
#: explicit `[Other.xlsx]` book name inside an operand.
EXTERNAL_REF = re.compile(r"\[(\d+|[^\]]*\.xl\w*)\]", re.IGNORECASE)


def _canonical(name: str) -> str:
    """Uppercase, stripped of the future-function prefix Excel stores."""
    name = name.rstrip("(").strip()
    upper = name.upper()
    if upper.startswith("_XLFN."):
        return upper[len("_XLFN.") :]
    return upper


@dataclass(frozen=True)
class DenylistHit:
    """One construct, in one cell, and where it routes the file."""

    ref: str
    category: Category
    #: The function or reference that tripped the scan, as written.
    target: str

    @property
    def route(self) -> Route:
        return ROUTES[self.category]


def scan_formula(ref: str, formula: str) -> list[DenylistHit]:
    """Every denylist hit in one formula. Tokenized, never substring-matched."""
    hits: list[DenylistHit] = []
    try:
        tokens = Tokenizer(formula).items
    except Exception:
        # A formula the tokenizer cannot read cannot be certified either.
        return [DenylistHit(ref=ref, category=Category.UDF, target=formula[:80])]
    for token in tokens:
        if token.type == Token.FUNC and token.subtype == Token.OPEN:
            name = _canonical(token.value)
            if name in LAMBDA_FAMILY:
                hits.append(DenylistHit(ref=ref, category=Category.LAMBDA, target=name))
            elif name.startswith("CUBE"):
                hits.append(DenylistHit(ref=ref, category=Category.CUBE, target=name))
            elif name in RTD_FUNCTIONS:
                hits.append(DenylistHit(ref=ref, category=Category.RTD, target=name))
            elif name.startswith("_XLUDF.") or name not in KNOWN_FUNCTIONS:
                hits.append(DenylistHit(ref=ref, category=Category.UDF, target=name))
        elif token.type == Token.OPERAND and token.subtype == Token.RANGE:
            if EXTERNAL_REF.search(token.value):
                hits.append(
                    DenylistHit(ref=ref, category=Category.EXTERNAL, target=token.value)
                )
    return hits


def prescan(cells: Mapping[str, object]) -> list[DenylistHit]:
    """Scan a whole file's formulas — the frozen reader surface in, hits out."""
    hits: list[DenylistHit] = []
    for ref, cell in cells.items():
        formula = getattr(cell, "formula", None)
        if formula:
            hits.extend(scan_formula(ref, formula))
    return hits


def route_for(hits: list[DenylistHit]) -> Route | None:
    """The file's route: refusal outranks the arbiter; no hits, no route."""
    if any(hit.route is Route.REFUSE for hit in hits):
        return Route.REFUSE
    if hits:
        return Route.ARBITER
    return None


#: The function catalogue: names the scan recognizes as computable by
#: an engine we run. Curated from Excel's published function list up
#: to the dynamic-array generation, minus what is denylisted above.
#: Incomplete by design — an absent name refuses honestly, and gets
#: added here (through this lane's log) when it first appears in a
#: real corpus file.
KNOWN_FUNCTIONS = frozenset(
    {
        # Math and trigonometry
        "ABS",
        "ACOS",
        "ACOSH",
        "ACOT",
        "ACOTH",
        "AGGREGATE",
        "ARABIC",
        "ASIN",
        "ASINH",
        "ATAN",
        "ATAN2",
        "ATANH",
        "BASE",
        "CEILING",
        "CEILING.MATH",
        "CEILING.PRECISE",
        "COMBIN",
        "COMBINA",
        "COS",
        "COSH",
        "COT",
        "COTH",
        "CSC",
        "CSCH",
        "DECIMAL",
        "DEGREES",
        "EVEN",
        "EXP",
        "FACT",
        "FACTDOUBLE",
        "FLOOR",
        "FLOOR.MATH",
        "FLOOR.PRECISE",
        "GCD",
        "INT",
        "ISO.CEILING",
        "LCM",
        "LN",
        "LOG",
        "LOG10",
        "MDETERM",
        "MINVERSE",
        "MMULT",
        "MOD",
        "MROUND",
        "MULTINOMIAL",
        "MUNIT",
        "ODD",
        "PI",
        "POWER",
        "PRODUCT",
        "QUOTIENT",
        "RADIANS",
        "RAND",
        "RANDARRAY",
        "RANDBETWEEN",
        "ROMAN",
        "ROUND",
        "ROUNDDOWN",
        "ROUNDUP",
        "SEC",
        "SECH",
        "SEQUENCE",
        "SERIESSUM",
        "SIGN",
        "SIN",
        "SINH",
        "SQRT",
        "SQRTPI",
        "SUBTOTAL",
        "SUM",
        "SUMIF",
        "SUMIFS",
        "SUMPRODUCT",
        "SUMSQ",
        "SUMX2MY2",
        "SUMX2PY2",
        "SUMXMY2",
        "TAN",
        "TANH",
        "TRUNC",
        # Logical
        "AND",
        "FALSE",
        "IF",
        "IFERROR",
        "IFNA",
        "IFS",
        "NOT",
        "OR",
        "SWITCH",
        "TRUE",
        "XOR",
        "LET",
        # Lookup and reference
        "ADDRESS",
        "AREAS",
        "CHOOSE",
        "CHOOSECOLS",
        "CHOOSEROWS",
        "COLUMN",
        "COLUMNS",
        "DROP",
        "EXPAND",
        "FILTER",
        "FORMULATEXT",
        "GETPIVOTDATA",
        "HLOOKUP",
        "HSTACK",
        "HYPERLINK",
        "INDEX",
        "INDIRECT",
        "LOOKUP",
        "MATCH",
        "OFFSET",
        "ROW",
        "ROWS",
        "SORT",
        "SORTBY",
        "TAKE",
        "TOCOL",
        "TOROW",
        "TRANSPOSE",
        "UNIQUE",
        "VLOOKUP",
        "VSTACK",
        "WRAPCOLS",
        "WRAPROWS",
        "XLOOKUP",
        "XMATCH",
        # Date and time
        "DATE",
        "DATEDIF",
        "DATEVALUE",
        "DAY",
        "DAYS",
        "DAYS360",
        "EDATE",
        "EOMONTH",
        "HOUR",
        "ISOWEEKNUM",
        "MINUTE",
        "MONTH",
        "NETWORKDAYS",
        "NETWORKDAYS.INTL",
        "NOW",
        "SECOND",
        "TIME",
        "TIMEVALUE",
        "TODAY",
        "WEEKDAY",
        "WEEKNUM",
        "WORKDAY",
        "WORKDAY.INTL",
        "YEAR",
        "YEARFRAC",
        # Text
        "ASC",
        "BAHTTEXT",
        "CHAR",
        "CLEAN",
        "CODE",
        "CONCAT",
        "CONCATENATE",
        "DOLLAR",
        "EXACT",
        "FIND",
        "FINDB",
        "FIXED",
        "LEFT",
        "LEFTB",
        "LEN",
        "LENB",
        "LOWER",
        "MID",
        "MIDB",
        "NUMBERVALUE",
        "PHONETIC",
        "PROPER",
        "REPLACE",
        "REPLACEB",
        "REPT",
        "RIGHT",
        "RIGHTB",
        "SEARCH",
        "SEARCHB",
        "SUBSTITUTE",
        "T",
        "TEXT",
        "TEXTAFTER",
        "TEXTBEFORE",
        "TEXTJOIN",
        "TEXTSPLIT",
        "TRIM",
        "UNICHAR",
        "UNICODE",
        "UPPER",
        "VALUE",
        "VALUETOTEXT",
        "ARRAYTOTEXT",
        # Statistical
        "AVEDEV",
        "AVERAGE",
        "AVERAGEA",
        "AVERAGEIF",
        "AVERAGEIFS",
        "BETA.DIST",
        "BETA.INV",
        "BETADIST",
        "BETAINV",
        "BINOM.DIST",
        "BINOM.DIST.RANGE",
        "BINOM.INV",
        "BINOMDIST",
        "CHIDIST",
        "CHIINV",
        "CHISQ.DIST",
        "CHISQ.DIST.RT",
        "CHISQ.INV",
        "CHISQ.INV.RT",
        "CHISQ.TEST",
        "CHITEST",
        "CONFIDENCE",
        "CONFIDENCE.NORM",
        "CONFIDENCE.T",
        "CORREL",
        "COUNT",
        "COUNTA",
        "COUNTBLANK",
        "COUNTIF",
        "COUNTIFS",
        "COVAR",
        "COVARIANCE.P",
        "COVARIANCE.S",
        "CRITBINOM",
        "DEVSQ",
        "EXPON.DIST",
        "EXPONDIST",
        "F.DIST",
        "F.DIST.RT",
        "F.INV",
        "F.INV.RT",
        "F.TEST",
        "FDIST",
        "FINV",
        "FISHER",
        "FISHERINV",
        "FORECAST",
        "FORECAST.ETS",
        "FORECAST.ETS.CONFINT",
        "FORECAST.ETS.SEASONALITY",
        "FORECAST.ETS.STAT",
        "FORECAST.LINEAR",
        "FREQUENCY",
        "FTEST",
        "GAMMA",
        "GAMMA.DIST",
        "GAMMA.INV",
        "GAMMADIST",
        "GAMMAINV",
        "GAMMALN",
        "GAMMALN.PRECISE",
        "GAUSS",
        "GEOMEAN",
        "GROWTH",
        "HARMEAN",
        "HYPGEOM.DIST",
        "HYPGEOMDIST",
        "INTERCEPT",
        "KURT",
        "LARGE",
        "LINEST",
        "LOGEST",
        "LOGINV",
        "LOGNORM.DIST",
        "LOGNORM.INV",
        "LOGNORMDIST",
        "MAX",
        "MAXA",
        "MAXIFS",
        "MEDIAN",
        "MIN",
        "MINA",
        "MINIFS",
        "MODE",
        "MODE.MULT",
        "MODE.SNGL",
        "NEGBINOM.DIST",
        "NEGBINOMDIST",
        "NORM.DIST",
        "NORM.INV",
        "NORM.S.DIST",
        "NORM.S.INV",
        "NORMDIST",
        "NORMINV",
        "NORMSDIST",
        "NORMSINV",
        "PEARSON",
        "PERCENTILE",
        "PERCENTILE.EXC",
        "PERCENTILE.INC",
        "PERCENTRANK",
        "PERCENTRANK.EXC",
        "PERCENTRANK.INC",
        "PERMUT",
        "PERMUTATIONA",
        "PHI",
        "POISSON",
        "POISSON.DIST",
        "PROB",
        "QUARTILE",
        "QUARTILE.EXC",
        "QUARTILE.INC",
        "RANK",
        "RANK.AVG",
        "RANK.EQ",
        "RSQ",
        "SKEW",
        "SKEW.P",
        "SLOPE",
        "SMALL",
        "STANDARDIZE",
        "STDEV",
        "STDEV.P",
        "STDEV.S",
        "STDEVA",
        "STDEVP",
        "STDEVPA",
        "STEYX",
        "T.DIST",
        "T.DIST.2T",
        "T.DIST.RT",
        "T.INV",
        "T.INV.2T",
        "T.TEST",
        "TDIST",
        "TINV",
        "TREND",
        "TRIMMEAN",
        "TTEST",
        "VAR",
        "VAR.P",
        "VAR.S",
        "VARA",
        "VARP",
        "VARPA",
        "WEIBULL",
        "WEIBULL.DIST",
        "ZTEST",
        "Z.TEST",
        # Financial
        "ACCRINT",
        "ACCRINTM",
        "AMORDEGRC",
        "AMORLINC",
        "COUPDAYBS",
        "COUPDAYS",
        "COUPDAYSNC",
        "COUPNCD",
        "COUPNUM",
        "COUPPCD",
        "CUMIPMT",
        "CUMPRINC",
        "DB",
        "DDB",
        "DISC",
        "DOLLARDE",
        "DOLLARFR",
        "DURATION",
        "EFFECT",
        "FV",
        "FVSCHEDULE",
        "INTRATE",
        "IPMT",
        "IRR",
        "ISPMT",
        "MDURATION",
        "MIRR",
        "NOMINAL",
        "NPER",
        "NPV",
        "ODDFPRICE",
        "ODDFYIELD",
        "ODDLPRICE",
        "ODDLYIELD",
        "PDURATION",
        "PMT",
        "PPMT",
        "PRICE",
        "PRICEDISC",
        "PRICEMAT",
        "PV",
        "RATE",
        "RECEIVED",
        "RRI",
        "SLN",
        "SYD",
        "TBILLEQ",
        "TBILLPRICE",
        "TBILLYIELD",
        "VDB",
        "XIRR",
        "XNPV",
        "YIELD",
        "YIELDDISC",
        "YIELDMAT",
        # Information
        "CELL",
        "ERROR.TYPE",
        "INFO",
        "ISBLANK",
        "ISERR",
        "ISERROR",
        "ISEVEN",
        "ISFORMULA",
        "ISLOGICAL",
        "ISNA",
        "ISNONTEXT",
        "ISNUMBER",
        "ISODD",
        "ISREF",
        "ISTEXT",
        "N",
        "NA",
        "SHEET",
        "SHEETS",
        "TYPE",
        # Engineering
        "BESSELI",
        "BESSELJ",
        "BESSELK",
        "BESSELY",
        "BIN2DEC",
        "BIN2HEX",
        "BIN2OCT",
        "BITAND",
        "BITLSHIFT",
        "BITOR",
        "BITRSHIFT",
        "BITXOR",
        "COMPLEX",
        "CONVERT",
        "DEC2BIN",
        "DEC2HEX",
        "DEC2OCT",
        "DELTA",
        "ERF",
        "ERF.PRECISE",
        "ERFC",
        "ERFC.PRECISE",
        "GESTEP",
        "HEX2BIN",
        "HEX2DEC",
        "HEX2OCT",
        "IMABS",
        "IMAGINARY",
        "IMARGUMENT",
        "IMCONJUGATE",
        "IMCOS",
        "IMCOSH",
        "IMCOT",
        "IMCSC",
        "IMCSCH",
        "IMDIV",
        "IMEXP",
        "IMLN",
        "IMLOG10",
        "IMLOG2",
        "IMPOWER",
        "IMPRODUCT",
        "IMREAL",
        "IMSEC",
        "IMSECH",
        "IMSIN",
        "IMSINH",
        "IMSQRT",
        "IMSUB",
        "IMSUM",
        "IMTAN",
        "OCT2BIN",
        "OCT2DEC",
        "OCT2HEX",
        # Database
        "DAVERAGE",
        "DCOUNT",
        "DCOUNTA",
        "DGET",
        "DMAX",
        "DMIN",
        "DPRODUCT",
        "DSTDEV",
        "DSTDEVP",
        "DSUM",
        "DVAR",
        "DVARP",
    }
)
