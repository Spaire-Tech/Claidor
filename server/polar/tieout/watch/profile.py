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
    low = size / COMPARABLE_FACTOR
    high = size * COMPARABLE_FACTOR
    comparable = [item for item in priors if low <= item.changed_cells <= high]
    if len(comparable) < MINIMUM_PRIORS:
        return Profile({}, len(comparable), (0, 0), history=len(priors))
    nearest = sorted(comparable, key=lambda item: abs(item.changed_cells - size))
    chosen = nearest[:NEIGHBOURS]
    kinds = {kind for item in chosen for kind in item.counts}
    medians = {
        kind: float(median([item.counts.get(kind, 0) for item in chosen]))
        for kind in kinds
    }
    sizes = [item.changed_cells for item in chosen]
    return Profile(medians, len(chosen), (min(sizes), max(sizes)), history=len(priors))


def describe(kind: str, count: int, profile: Profile) -> str:
    """The line a reviewer reads. The count always comes first; the
    profile is context and never a verdict."""
    if not profile.usable:
        #: Two different refusals, and the difference matters: a model
        #: with no history at all, and a model with plenty of history
        #: none of which is a comparable size.
        if profile.history < MINIMUM_PRIORS:
            return (
                f"{count} {kind} (no profile for this model — "
                f"{profile.history} prior transitions, {MINIMUM_PRIORS} needed)"
            )
        return (
            f"{count} {kind} (no profile for a transition this size — "
            f"{profile.history} priors, {profile.priors} of comparable size)"
        )
    normal = profile.medians.get(kind)
    if normal is None:
        return (
            f"{count} {kind} (this model's comparable updates show none, "
            f"{profile.priors} priors)"
        )
    return f"{count} {kind} (this model's median for updates this size: {normal:g})"


def unusual(kind: str, count: int, profile: Profile) -> bool:
    """Is this count away from the model's own habit?

    Deliberately coarse and deliberately not a score: `True` when the
    count is at least double the median, or when the median is zero
    and the count is not. It exists so a report can *order* its lines,
    never so it can label a transition. A reader who wants the number
    reads `describe`.
    """
    if not profile.usable:
        return False
    normal = profile.medians.get(kind, 0.0)
    if normal == 0:
        return count > 0
    return count >= 2 * normal
