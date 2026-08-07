"""Deterministic deadline computation — code counts the days, not the model.

Two production answers computed the art. 170 AUPSRVE contestation deadline
one day short while quoting the very precedent that shows the correct
count. Language models are unreliable at stepwise date arithmetic, and
deadlines are the single most malpractice-prone output in this domain — so
the count is done here, by the CCJA's own method, and the model is required
to use the returned value.

The method (CCJA n° 030/2010, 29 avril 2010, quoted in the corpus):

    « lorsqu'un délai est exprimé en mois, il expire le jour du dernier
    mois qui porte le même quantième que le jour de l'acte […] qui fait
    courir ce délai ; le délai franc est celui dans le décompte duquel
    sont exclus le dies a quo et le dies ad quem »

Worked example from that arrêt: dénonciation 21 décembre → expiration
23 janvier. Exclude the dies a quo (count from 22 December), land on the
same quantième next month (22 January), exclude the dies ad quem
(23 January). Applied to a dénonciation of 12 January 2024:
13 January → 13 February → **14 February 2024**.

Weekends are prorogued to the next working day (AUPSRVE art. 335 rule as
cited by the CCJA). Public holidays vary by OHADA member state and are NOT
applied here; the derivation says so explicitly rather than pretending.
"""

import re
from dataclasses import dataclass
from datetime import date, timedelta


@dataclass(frozen=True)
class DelayRule:
    """One delay the corpus states, with the article that states it.

    Which delay a dated question is about decides the arithmetic, so the
    choice is made here rather than left to the model: a one-month
    computation injected into a question about the fifteen-day appeal delay
    is a wrong date presented as authoritative.
    """

    kind: str
    months: int | None
    days: int | None
    #: The event the delay runs from, named in the derivation.
    event: str
    source: str


#: The delays this module is willing to compute. Anything outside the list
#: gets no computation at all — prescription periods run in years and vary
#: by matter, and a confident wrong date is worse than no date.
CONTESTATION = DelayRule(
    kind="contestation",
    months=1,
    days=None,
    event="dénonciation de la saisie",
    source="art. 170 AUPSRVE",
)
APPEL = DelayRule(
    kind="appel",
    months=None,
    days=15,
    event="notification de la décision",
    source="art. 172 AUPSRVE",
)

_APPEL_PATTERN = re.compile(r"\bappel\b|\bappeler\b|interjeter", re.IGNORECASE)
_CONTESTATION_PATTERN = re.compile(
    r"contest|forclusion|opposition|irrecevab", re.IGNORECASE
)


def identify_delay(question: str) -> DelayRule | None:
    """Which delay the question is about, or None when it is not clear.

    Order matters: « délai d'appel contre la décision tranchant la
    contestation » mentions both, and it is the appeal delay that is asked
    about.
    """
    if _APPEL_PATTERN.search(question):
        return APPEL
    if _CONTESTATION_PATTERN.search(question):
        return CONTESTATION
    return None


@dataclass(frozen=True)
class ComputedDeadline:
    start: date
    months: int
    deadline: date
    #: Human-readable derivation, one step per line, in French.
    derivation: list[str]
    rule: DelayRule = CONTESTATION


def _add_months(day: date, months: int) -> date:
    """Same quantième `months` later; clamped to month end when absent."""
    month_index = day.month - 1 + months
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    quantieme = day.day
    while True:
        try:
            return date(year, month, quantieme)
        except ValueError:
            quantieme -= 1


def _prorogue(deadline: date) -> tuple[date, list[str]]:
    """Push a weekend deadline to the next working day."""
    steps: list[str] = []
    while deadline.weekday() >= 5:
        deadline += timedelta(days=1)
        steps.append(
            f"Ce jour tombe un samedi ou dimanche — prorogation au "
            f"{deadline.strftime('%d/%m/%Y')}."
        )
    return deadline, steps


def month_franc_deadline(
    start: date, months: int = 1, *, rule: DelayRule = CONTESTATION
) -> ComputedDeadline:
    """Last day to act, for a délai franc of ``months`` months.

    ``start`` is the event date (dénonciation, signification…) — the dies
    a quo, excluded from the count.
    """
    derivation: list[str] = []
    day_after = start + timedelta(days=1)
    derivation.append(
        f"Dies a quo ({start.strftime('%d/%m/%Y')}) exclu — "
        f"le délai court à compter du {day_after.strftime('%d/%m/%Y')}."
    )
    quantieme_end = _add_months(day_after, months)
    derivation.append(
        f"Délai de {months} mois : même quantième — "
        f"{quantieme_end.strftime('%d/%m/%Y')}."
    )
    deadline = quantieme_end + timedelta(days=1)
    derivation.append(
        f"Dies ad quem exclu (délai franc) — dernier jour pour agir : "
        f"{deadline.strftime('%d/%m/%Y')}."
    )
    deadline, weekend_steps = _prorogue(deadline)
    derivation.extend(weekend_steps)
    derivation.append(
        "Jours fériés nationaux non pris en compte (ils varient selon "
        "l'État membre) — à vérifier localement."
    )
    return ComputedDeadline(
        start=start,
        months=months,
        deadline=deadline,
        derivation=derivation,
        rule=rule,
    )


def day_franc_deadline(start: date, rule: DelayRule) -> ComputedDeadline:
    """Last day to act, for a délai franc expressed in days.

    Same exclusion rule as the month version — dies a quo and dies ad quem
    both excluded — applied to a day count.
    """
    assert rule.days is not None
    derivation: list[str] = []
    day_after = start + timedelta(days=1)
    derivation.append(
        f"Dies a quo ({start.strftime('%d/%m/%Y')}) exclu — "
        f"le délai court à compter du {day_after.strftime('%d/%m/%Y')}."
    )
    last_counted = start + timedelta(days=rule.days)
    derivation.append(
        f"Délai de {rule.days} jours : dernier jour compté — "
        f"{last_counted.strftime('%d/%m/%Y')}."
    )
    deadline = last_counted + timedelta(days=1)
    derivation.append(
        f"Dies ad quem exclu (délai franc) — dernier jour pour agir : "
        f"{deadline.strftime('%d/%m/%Y')}."
    )
    deadline, weekend_steps = _prorogue(deadline)
    derivation.extend(weekend_steps)
    derivation.append(
        "Jours fériés nationaux non pris en compte (ils varient selon "
        "l'État membre) — à vérifier localement."
    )
    return ComputedDeadline(
        start=start, months=0, deadline=deadline, derivation=derivation, rule=rule
    )


def deadline_for(start: date, rule: DelayRule) -> ComputedDeadline:
    """Compute whichever delay the question was about."""
    if rule.months is not None:
        return month_franc_deadline(start, rule.months, rule=rule)
    return day_franc_deadline(start, rule)


def steering_block(computed: ComputedDeadline) -> str:
    """The instruction injected into the prompt alongside a computed date."""
    steps = " ".join(computed.derivation)
    rule = computed.rule
    duration = (
        f"{rule.months} mois" if rule.months is not None else f"{rule.days} jours"
    )
    return (
        f"\n\n[CALCUL DE DÉLAI VÉRIFIÉ PAR CODE — méthode CCJA "
        f"(arrêt n° 030/2010) : pour un délai de {duration} francs courant "
        f"de la {rule.event} du {computed.start.strftime('%d/%m/%Y')} "
        f"({rule.source}), le dernier jour pour agir est le "
        f"{computed.deadline.strftime('%d/%m/%Y')}. "
        f"Dérivation : {steps} Si ta réponse énonce ce délai, utilise "
        f"EXACTEMENT cette date et cette dérivation — ne recalcule pas. "
        f"Si la question porte sur un délai d'une autre durée ou d'une "
        f"autre nature, dis explicitement que le calcul précis reste à "
        f"vérifier.]"
    )
