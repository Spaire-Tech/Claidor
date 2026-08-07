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

from dataclasses import dataclass
from datetime import date, timedelta


@dataclass(frozen=True)
class ComputedDeadline:
    start: date
    months: int
    deadline: date
    #: Human-readable derivation, one step per line, in French.
    derivation: list[str]


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


def month_franc_deadline(start: date, months: int = 1) -> ComputedDeadline:
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
    while deadline.weekday() >= 5:
        deadline += timedelta(days=1)
        derivation.append(
            f"Ce jour tombe un samedi ou dimanche — prorogation au "
            f"{deadline.strftime('%d/%m/%Y')}."
        )
    derivation.append(
        "Jours fériés nationaux non pris en compte (ils varient selon "
        "l'État membre) — à vérifier localement."
    )
    return ComputedDeadline(
        start=start, months=months, deadline=deadline, derivation=derivation
    )


def steering_block(computed: ComputedDeadline) -> str:
    """The instruction injected into the prompt alongside a computed date."""
    steps = " ".join(computed.derivation)
    return (
        f"\n\n[CALCUL DE DÉLAI VÉRIFIÉ PAR CODE — méthode CCJA "
        f"(arrêt n° 030/2010) : pour un délai d'un mois franc courant de la "
        f"dénonciation du {computed.start.strftime('%d/%m/%Y')}, le dernier "
        f"jour pour agir est le {computed.deadline.strftime('%d/%m/%Y')}. "
        f"Dérivation : {steps} Si ta réponse énonce ce délai, utilise "
        f"EXACTEMENT cette date et cette dérivation — ne recalcule pas. "
        f"Si la question porte sur un délai d'une autre durée ou d'une "
        f"autre nature, dis explicitement que le calcul précis reste à "
        f"vérifier.]"
    )
