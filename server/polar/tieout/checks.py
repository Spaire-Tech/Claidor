"""Every check a run knew about, in one of four states.

The Overview used to say « Four checks could not run: A; B; and more. »
and, on a run whose abstention list happened to be empty, « Every check
that applies to this model ran to the end » — the second sentence was
printed for runs recorded before the abstention field existed, when
nothing at all was known. Nowhere on the page could a reader see which
checks ran and passed. The founder's own rule for the summary is « show
coverage: what was checked, what was not, and why », and this is that
list, computed once here from what a run recorded and what the findings
table holds, so a screen never invents a state.

Four states, and every rule in both catalogues is in exactly one:

- `off` — the firm switched it off in the house rules;
- `abstained` — the check declined, with its own sentence saying why;
- `found` — it ran and there are open findings under it;
- `clean` — it ran and found nothing. Where the check counted what it
  walked (the statement checks do), the count rides along so « clean »
  can say « 20 of 20 years ».

A rule the run recorded nothing about and that has no findings reads as
`clean` only when the run is known to have executed the rule — a run
saved before this list existed still recorded `abstentions`, `tallies`
and `rules_off`, so the same derivation holds for it. What is never done
here is printing « ran to the end » from an empty list.
"""

from dataclasses import dataclass
from typing import Any

from .analytics import ANALYTIC_PASS_NAMES, ANALYTIC_RULE_NAMES
from .audit import RULE_NAMES


@dataclass(frozen=True)
class Check:
    key: str
    #: The rule as the settings screen names it.
    label: str
    #: The sentence for the pass row, where the label names the failure.
    pass_label: str
    analytical: bool
    state: str  # off | abstained | found | clean
    #: The check's own sentence when it abstained; empty otherwise.
    why: str = ""
    #: What it walked and how much was clean, when it counted.
    total: int = 0
    clean: int = 0
    #: Open findings under the rule.
    findings: int = 0


def checks_of(summary: dict[str, Any], open_by_rule: dict[str, int]) -> list[Check]:
    """The list, from a run's summary and the open findings per rule."""
    off = set(summary.get("rules_off") or [])
    tallies = summary.get("tallies") or {}
    whys: dict[str, list[str]] = {}
    for one in summary.get("abstentions") or []:
        rule = str(one.get("rule", ""))
        why = str(one.get("why", "")).strip()
        if rule and why and why not in whys.setdefault(rule, []):
            whys[rule].append(why)

    out: list[Check] = []
    catalogue = [(key, label, False) for key, label in RULE_NAMES.items()] + [
        (key, label, True) for key, label in ANALYTIC_RULE_NAMES.items()
    ]
    for key, label, analytical in catalogue:
        tally = tallies.get(key) or {}
        total = int(tally.get("total", 0) or 0)
        clean = int(tally.get("clean", 0) or 0)
        found = int(open_by_rule.get(key, 0) or 0)
        if key in off:
            state, why = "off", ""
        elif found > 0:
            state, why = "found", ""
        elif key in whys:
            state, why = "abstained", " ".join(whys[key])
        else:
            state, why = "clean", ""
        out.append(
            Check(
                key=key,
                label=label,
                pass_label=ANALYTIC_PASS_NAMES.get(key, ""),
                analytical=analytical,
                state=state,
                why=why,
                total=total,
                clean=clean,
                findings=found,
            )
        )
    return out


__all__ = ["Check", "checks_of"]
