"""What is normal for *this* model, so a count can be read.

The founder's research round over real git history measured the
finding this module exists for: splitting one equity model's seventy
transitions by intent, « formulas replaced by hardcodes » ran at a
median of **83** in a quarterly reforecast and **0** in a routine
commit. The separation is near-total — and it means a fixed
threshold on that count is wrong in both directions at once: it
cries wolf every quarter and stays silent on the Tuesday that
matters.

So this module is deliberately **not** a threshold, and not a
classifier of intent either — intent is not inferable from a diff
and this lane will not pretend otherwise. It is a **denominator**:
the median count of each delta class across the model's own previous
transitions, reported *beside* the count and never instead of it.

Three rules, registered in `docs/pierce/logs/prism.md` before this
existed:

1. **Per model.** Nothing is learned across models; a distribution
   network and a private-equity model share nothing but a file
   format.
2. **Size-matched.** The comparison uses the priors nearest this
   transition in changed cells, because the founder's own table is a
   size effect as much as an intent effect (1,169 changed cells
   against 93).
3. **It refuses below three priors**, in words. A median of one is
   not a profile.
"""

from dataclasses import dataclass, field
from statistics import median

#: Fewer priors than this and there is no profile to speak of.
MINIMUM_PRIORS = 3

#: How many size-nearest priors a comparison uses, when more exist.
NEIGHBOURS = 5

#: A prior is *comparable* only within this factor of the transition
#: being read. Declared, not derived — and moving it is a written
#: round. Without it « the five nearest » drags a 1,169-cell
#: reforecast into a 95-cell update's profile, which is the mixing
#: this module exists to prevent.
COMPARABLE_FACTOR = 2.0


@dataclass(frozen=True)
class Transition:
    """One adjacent version step of a model's own history."""

    old: str
    new: str
    changed_cells: int
    counts: dict[str, int] = field(default_factory=dict)
    #: The step the model itself declared across this transition —
    #: `none`, `patch`, `minor`, `major`, `family`, `undeclared`. An
    #: input to the update, which is why it can group without a band.
    declaration: str = ""


@dataclass(frozen=True)
class Profile:
    """What this model's history says is normal, per class."""

    medians: dict[str, float]
    #: How many *comparable* prior transitions the medians came from.
    priors: int
    #: The size band the priors were drawn from, for the reader.
    band: tuple[int, int]
    #: How many priors the model has at all, comparable or not — so a
    #: refusal can say which kind of refusal it is.
    history: int = 0
    #: True when the medians came from priors *outside* the
    #: comparable band, because too few comparable ones existed. The
    #: answer is then a qualified one and every line it produces says
    #: so — silence would be safer to write and less use to read.
    qualified: bool = False
    #: The size ratios of the priors used, when qualified: (nearest,
    #: farthest) as multiples of this transition's size.
    ratios: tuple[float, float] = (1.0, 1.0)

    @property
    def usable(self) -> bool:
        return self.priors >= MINIMUM_PRIORS


def profile_of(priors: list[Transition], size: int) -> Profile:
    """The medians from the comparable priors nearest `size`.

    Nearest in changed cells, not most recent: a model's last three
    updates may all be routine while the one being read is a
    reforecast, and recency would compare it to the wrong thing.
    Comparable means within `COMPARABLE_FACTOR` — a transition an
    order of magnitude away is not a comparison, it is a different
    kind of event.
    """
    #: A model with almost no history gets silence; that refusal is
    #: about the history and cannot be argued away.
    if len(priors) < MINIMUM_PRIORS:
        return Profile({}, 0, (0, 0), history=len(priors))

    low = size / COMPARABLE_FACTOR
    high = size * COMPARABLE_FACTOR
    comparable = [item for item in priors if low <= item.changed_cells <= high]
    by_distance = sorted(priors, key=lambda item: abs(item.changed_cells - size))
    qualified = len(comparable) < MINIMUM_PRIORS
    if qualified:
        #: History of the wrong size is not the same as no history.
        #: Answer with the nearest priors and put the size ratio in
        #: the line, where a reviewer can discount it.
        chosen = by_distance[:MINIMUM_PRIORS]
    else:
        nearest = sorted(comparable, key=lambda item: abs(item.changed_cells - size))
        chosen = nearest[:NEIGHBOURS]
    kinds = {kind for item in chosen for kind in item.counts}
    medians = {
        kind: float(median([item.counts.get(kind, 0) for item in chosen]))
        for kind in kinds
    }
    sizes = [item.changed_cells for item in chosen]
    spans = sorted(max(item, size) / max(min(item, size), 1) for item in sizes)
    return Profile(
        medians,
        len(chosen),
        (min(sizes), max(sizes)),
        history=len(priors),
        qualified=qualified,
        ratios=(spans[0], spans[-1]),
    )


def profile_by_declaration(priors: list[Transition], declared: str) -> Profile:
    """The medians from the priors the model itself calls the same
    kind of update.

    Grouping is **exact**: a `patch` is compared with patches, a
    `family` step with family steps. There is no band, because there
    is no scale — the author declared a category, not a magnitude,
    and that is the whole reason this axis exists. Size and cadence
    both needed a tolerance and both broke on it.

    `priors` must carry their own declared step in `declaration`.
    A transition whose step is `undeclared` gets no profile: « this
    model did not declare a version then » is a statement about the
    model and a good answer.
    """
    if declared in ("", "undeclared"):
        return Profile({}, 0, (0, 0), history=len(priors))
    peers = [item for item in priors if item.declaration == declared]
    if len(peers) < MINIMUM_PRIORS:
        return Profile({}, 0, (0, 0), history=len(priors))
    kinds = {kind for item in peers for kind in item.counts}
    medians = {
        kind: float(median([item.counts.get(kind, 0) for item in peers]))
        for kind in kinds
    }
    sizes = [item.changed_cells for item in peers]
    return Profile(medians, len(peers), (min(sizes), max(sizes)), history=len(priors))


def describe(kind: str, count: int, profile: Profile) -> str:
    """The line a reviewer reads. The count always comes first; the
    profile is context and never a verdict."""
    if not profile.usable:
        return (
            f"{count} {kind} (no profile for this model — "
            f"{profile.history} prior transitions, {MINIMUM_PRIORS} needed)"
        )
    #: The qualification travels in the line, never in a footnote.
    caveat = (
        ""
        if not profile.qualified
        else (
            f", but its nearest updates are "
            f"{profile.ratios[0]:.1f}–{profile.ratios[1]:.1f}× a different size"
        )
    )
    normal = profile.medians.get(kind)
    if normal is None:
        return (
            f"{count} {kind} (this model's comparable updates show none, "
            f"{profile.priors} priors{caveat})"
        )
    return (
        f"{count} {kind} (this model's median for updates this size: "
        f"{normal:g}{caveat})"
    )


def unusual(kind: str, count: int, profile: Profile) -> bool:
    """Is this count away from the model's own habit?

    Deliberately coarse and deliberately not a score: `True` when the
    count is at least double the median, or when the median is zero
    and the count is not. It exists so a report can *order* its lines,
    never so it can label a transition. A reader who wants the number
    reads `describe`.

    **A qualified profile never flags anything.** It was measured on
    the ED2 chain doing exactly the wrong thing: the two quietest
    transitions in the whole history — two moved assumptions apiece —
    came back flagged, because their nearest priors by size were
    version-family steps rather than other quiet updates. A
    disclosed comparison is weak by construction; turning it into a
    boolean is the over-claim this module exists to avoid. The
    sentence `describe` returns still says everything it knows.
    """
    if not profile.usable or profile.qualified:
        return False
    normal = profile.medians.get(kind, 0.0)
    if normal == 0:
        return count > 0
    return count >= 2 * normal
