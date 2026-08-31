"""What the model says about itself, before anyone diffs it.

Every comparability rule this lane has tried — size, then cadence —
groups transitions by something the *diff* produces or the clock
records, and both fail the same way: the group is not made of
updates alike in kind. This module reads the one thing that is an
**input** to the update rather than an output of it: the version the
model declares, in its own cells or its own filename.

The step between two declarations (`none`, `patch`, `minor`,
`major`, `family`, `unknown`) is then a statement the author made
before the change existed. It carries no threshold and no constant,
and where a model declares nothing the reader says so — « this model
does not declare a version » is a fact about the model, not a
failure of the reader.

Registered in `docs/pierce/logs/prism.md` (« The declared-version
round ») before this existed.
"""

import re
from dataclasses import dataclass

#: A label that promises a version somewhere on its row or column.
_LABEL = re.compile(r"\b(version|release|build)\b", re.IGNORECASE)

#: …and one that promises a *date* instead. « Release Date » declares
#: when, not what. The corpus caught this and the tests did not: ten
#: of hickeng's sixteen workbooks came back declaring « 42036 », an
#: Excel date serial sitting under `Release Date`, and the steps
#: computed from it were fiction.
_NOT_A_VERSION = re.compile(r"\b(date|updated|modified|printed)\b", re.IGNORECASE)

#: Version-shaped text: « v0.1.6-b », « 0.1.6 », « v2 ». A bare
#: integer is **not** version-shaped — a number in a cell whose label
#: mentions a release is a number, and reading it as a version is how
#: this reader first mistook a date serial for `v42036`. Either a
#: `v` prefix or a dot; nothing else counts.
_VERSION = re.compile(
    r"(?:^|[\s:=])(v\d+(?:\.\d+)*(?:-[0-9A-Za-z.]+)?)\s*$|"
    r"(?:^|[\s:=])(v?\d+(?:\.\d+)+(?:-[0-9A-Za-z.]+)?)\b",
    re.IGNORECASE,
)

#: In a filename: « v2_2023-07-14.xlsx » -> « v2 ».
_IN_NAME = re.compile(r"(?:^|[_\-])(v\d+(?:\.\d+)*)", re.IGNORECASE)

NONE = "none"
PATCH = "patch"
MINOR = "minor"
MAJOR = "major"
FAMILY = "family"
UNKNOWN = "unknown"
UNDECLARED = "undeclared"


@dataclass(frozen=True)
class Declaration:
    """What the model says its version is, and where it said it."""

    version: str
    #: « Summary!C3 », « filename », or "" when nothing declares one.
    where: str

    @property
    def declared(self) -> bool:
        return bool(self.version)


def _version_in(text: str) -> str:
    found = _VERSION.search(text.strip())
    if not found:
        return ""
    return (found.group(1) or found.group(2) or "").strip()


def declared_version(cells: object, filename: str = "") -> Declaration:
    """The model's own version: a labelled cell first, the filename
    second, a refusal third.

    `cells` is the engine's cell map — read-only, as always.
    """
    items = getattr(cells, "items", None)
    if items is not None:
        for ref, cell in sorted(items()):
            labels = (
                f"{getattr(cell, 'row_label', '')} {getattr(cell, 'column_label', '')}"
            )
            if not _LABEL.search(labels) or _NOT_A_VERSION.search(labels):
                continue
            value = getattr(cell, "value", None)
            for text in (str(value or ""), labels):
                version = _version_in(text)
                if version:
                    return Declaration(version, ref)
    found = _IN_NAME.search(filename)
    if found:
        return Declaration(found.group(1), "filename")
    return Declaration("", "")


def _numerals(version: str) -> list[int] | None:
    body = version.lstrip("vV").split("-", 1)[0]
    if not body or not all(part.isdigit() for part in body.split(".")):
        return None
    return [int(part) for part in body.split(".")]


def step(before: Declaration, after: Declaration) -> str:
    """The kind of step the author declared between two versions.

    No threshold, no constant: the answer is read off the two
    declarations or refused.
    """
    if not before.declared or not after.declared:
        return UNDECLARED
    if before.version == after.version:
        return NONE
    left, right = _numerals(before.version), _numerals(after.version)
    if left is None or right is None or len(left) != len(right):
        return UNKNOWN
    if len(left) == 1:
        #: « v2 → v3 »: a family, which is the only step such a
        #: scheme can express.
        return FAMILY if left != right else NONE
    for index, (a, b) in enumerate(zip(left, right, strict=True)):
        if a != b:
            return (MAJOR, MINOR, PATCH)[min(index, 2)]
    #: The numerals agree and the strings do not — « 0.1.6 » against
    #: « 0.1.6-b ». A build suffix is the smallest step there is.
    return PATCH
