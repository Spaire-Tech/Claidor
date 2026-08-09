"""The doctrines the registry covers, and how to find the cases.

A doctrine lives in code rather than in a table. It is a set of search
queries, a court list, and prose explaining the rule — none of which is
row-shaped, all of which belongs under review in version control where a
change to recall shows up as a diff.

Chosen for one property: the rule is clear enough to test against the text
of a draft. That is what lets a finding be assertive — *Texas will not
enforce this* — rather than merely suggestive.

No network here. Building queries and reading responses are separate from
performing them, the same split as :mod:`polar.corpus.juricaf`, so every
decision about coverage is testable without a server.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Doctrine:
    """One clause failure mode, and the search that finds its case law."""

    slug: str
    name: str
    #: Governing law the doctrine belongs to. The same clause is treated
    #: differently in different places, so registries are per-jurisdiction
    #: on a shared structure — never one universal table.
    jurisdiction: str
    #: What the rule is, in the words a finding will eventually use.
    rule: str
    #: The decisions that state the rule. Read them before any entry relies
    #: on them; they are here as landmarks, not as authority in themselves.
    landmarks: tuple[str, ...]

    #: Phrase queries, run separately rather than OR'd together.
    #:
    #: Separately, because recall per phrasing is a number we need: if one
    #: phrasing contributes nothing, that is worth knowing, and if one
    #: contributes everything, the others are false comfort. The candidate
    #: row records which query found it.
    queries: tuple[str, ...]

    #: CourtListener court identifiers. Parent courts roll up their
    #: children — "texapp" covers all seventeen Texas courts of appeals —
    #: which was verified against the bulk court table rather than assumed.
    courts: tuple[str, ...]

    #: Coverage this doctrine knowingly does not have. Written down because
    #: an unstated gap becomes an assumed absence.
    known_gaps: tuple[str, ...] = field(default_factory=tuple)


#: Texas express negligence — the first doctrine, and the most checkable.
#:
#: Two prongs, both testable from a draft: the indemnity must say
#: "negligence" expressly, and it must be conspicuous. Conspicuousness is
#: why this product belongs inside Word — Office.js exposes font weight,
#: colour, size and case on the live range, so the second prong is
#: mechanically checkable in the document itself.
TX_EXPRESS_NEGLIGENCE = Doctrine(
    slug="tx-express-negligence",
    name="Indemnity for the indemnitee's own negligence (Texas)",
    jurisdiction="US-TX",
    rule=(
        "An indemnity that covers the indemnitee's own negligence is "
        "unenforceable unless it says so expressly and is conspicuous."
    ),
    landmarks=(
        "Ethyl Corp. v. Daniel Construction Co., 725 S.W.2d 705 (Tex. 1987)",
        "Dresser Industries, Inc. v. Page Petroleum, Inc., 853 S.W.2d 505 (Tex. 1993)",
    ),
    queries=(
        '"express negligence"',
        '"express negligence doctrine"',
        '"fair notice" "conspicuous" indemnity',
        '"indemnify" "its own negligence" conspicuous',
    ),
    courts=(
        "tex",  # Texas Supreme Court
        "texapp",  # all 17 courts of appeals, via parent roll-up
        "texbizct",  # Texas Business Court — new, commercial
        "ca5",  # Fifth Circuit, applying Texas law
        "txnd",
        "txsd",
        "txed",
        "txwd",
    ),
    known_gaps=(
        "Texas trial-court rulings that were never appealed are not "
        "published and cannot be reached.",
        "Federal courts applying Texas law are included, but a federal "
        "court's reading of Texas law is a prediction, not a holding of "
        "the Texas courts.",
    ),
)


#: Registered doctrines, by slug. Two more follow once the first clears the
#: pipeline's quality gate: UCC 2-316 warranty-disclaimer conspicuousness,
#: and New York consequential-damages exclusions that omit lost profits.
DOCTRINES: dict[str, Doctrine] = {
    TX_EXPRESS_NEGLIGENCE.slug: TX_EXPRESS_NEGLIGENCE,
}


def get_doctrine(slug: str) -> Doctrine:
    """The doctrine, or a loud failure.

    Deliberately not forgiving: a typo in a slug that silently harvested
    nothing would look exactly like a doctrine with no case law.
    """
    try:
        return DOCTRINES[slug]
    except KeyError:
        known = ", ".join(sorted(DOCTRINES)) or "none registered"
        raise KeyError(f"Unknown doctrine {slug!r}. Known: {known}") from None
