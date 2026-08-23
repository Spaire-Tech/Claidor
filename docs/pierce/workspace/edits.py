"""The edits, each named for what it fixes and why it exists.

Every function takes the build and the real audit, and raises if it
cannot find what it was written to change. Order matters only where
noted.
"""

import json

MATERIAL, SIGNIFICANT, OBSERVATION = "Material", "Significant", "Observation"
#: The engine's tiers map to the design's three words, one to one.
BY_TIER = {1: MATERIAL, 2: SIGNIFICANT, 3: OBSERVATION}

#: Which of the design's groups a rule belongs to. Groups with no
#: findings simply do not appear — an absent group is information.
BY_RULE = {
    "skipped-cell": "Probable formula defects",
    "inconsistent-row": "Probable formula defects",
    "gapped-test": "Probable formula defects",
    "inconsistent-anchoring": "Probable formula defects",
    "selector-drift": "Probable formula defects",
    "typed-over-formula": "Structural exceptions",
    "error-value": "Errors showing",
    "circular": "Structural exceptions",
    "hardcode-in-formula": "Embedded hardcodes",
    "typed-island": "Embedded hardcodes",
    "broken-name": "Auditability risks",
    "external-link": "Auditability risks",
    "hidden-sheet": "Auditability risks",
    "long-formula": "Auditability risks",
    "volatile": "Auditability risks",
}

GROUP_ORDER = [
    "Probable formula defects",
    "Structural exceptions",
    "Errors showing",
    "Embedded hardcodes",
    "Auditability risks",
]


def money(text: str) -> str:
    """Group a bare number the way the rest of the product writes it."""
    try:
        return f"{int(float(text)):,}"
    except (TypeError, ValueError):
        return text


def sentence(finding: dict) -> str:
    """One plain line carrying the specific fact — the design's rule.

    The row's own label does the naming, because that is what the
    reviewer recognises: « Total Senior Debt Service » says more than
    « a total ». Nothing here is invented; every part comes from the
    engine's own detail sentence or the label it read off the sheet.
    """
    rule, detail = finding["rule"], finding["detail"]
    label = (finding.get("name") or "").strip()
    figure = (finding.get("figure") or "").strip()

    if rule == "skipped-cell":
        worth = f", worth {figure}" if figure else ""
        return f"{label} leaves out the row above it{worth}"

    if rule == "inconsistent-row":
        #: Which cell is right is not ours to assert — the honest
        #: sentence says the row disagrees with itself and lets the
        #: evidence show where.
        if "pinned reference out of step" in detail:
            return f"{label} reads one place in its first year and another in the rest"
        if "operator changed" in detail:
            return f"{label} changes an operator its siblings share"
        return f"{label} breaks the pattern its row keeps"

    if rule == "gapped-test":
        span = detail.split("never reads ")[1].split(",")[0] if "never reads " in detail else ""
        hiding = ""
        if "live cells a failure could hide in" in detail:
            hiding = detail.split("it never reads ")[-1].split(" live cells")[0].split(", ")[-1]
        tail = f" — {hiding} periods a failure could hide in" if hiding else ""
        return f"The check on {label} steps through its cells and skips {span}{tail}"

    if rule == "hardcode-in-formula":
        return f"{label} uses a typed {money(figure)}, buried in the formula"

    if rule == "broken-name":
        count = detail.split(" defined names")[0]
        if "other workbooks" in detail:
            return f"{count} names point into workbooks that are not here"
        return f"{count} names point at cells that were deleted"

    if rule == "long-formula":
        chars = detail.split(" characters")[0]
        return f"{label} runs to {chars} characters"

    if rule == "hidden-sheet":
        return f"{label} is hidden, empty and unread"

    if rule == "external-link":
        return f"{label} reads a file nobody sent"

    if rule == "typed-over-formula":
        return f"{label} was typed over, where the row calculates"

    if rule == "error-value":
        return detail.split(" — ")[0]

    return f"{label}: {detail.split(' — ')[0]}"[:90]


def where_of(finding: dict) -> str:
    """The sheet, which is what a reviewer scans by. Workbook-level
    findings say so rather than pretending to a sheet."""
    sheet = finding.get("sheet") or ""
    return sheet if sheet else "Workbook"


def shaped(audit: dict) -> list[dict]:
    """The engine's findings in the design's row shape."""
    rows = []
    for f in audit["findings"]:
        rows.append(
            {
                "g": BY_RULE.get(f["rule"], "Auditability risks"),
                "what": sentence(f),
                "sev": BY_TIER.get(f["tier"], OBSERVATION),
                "where": where_of(f),
                "ref": f["ref"],
                "why": f["detail"],
                "basis": f["basis"],
                "source": f["source"],
                "figure": f.get("figure") or "",
                "cells": f.get("cells") or "",
            }
        )
    return rows


def counts(rows: list[dict]) -> dict:
    out = {MATERIAL: 0, SIGNIFICANT: 0, OBSERVATION: 0}
    for r in rows:
        out[r["sev"]] += 1
    return out


#: --- the edits ---------------------------------------------------


def close_the_overview_block(build, audit) -> None:
    """The Findings tab renders nothing, and this is why.

    The Overview conditional opened and never closed, so the Findings
    block sits *inside* it: Findings can only paint while Overview is
    also painting, which never happens. One closing tag, and the
    product's central screen exists again.
    """
    build.swap(
        '        </div>\n        \n\n        <sc-if value="{{ pjTabFindings }}"',
        '        </div>\n        </div>\n        </sc-if>\n\n'
        '        <sc-if value="{{ pjTabFindings }}"',
        why="Overview closes its own div and block before Findings begins",
    )
    #: …and the close that used to end Overview, after the Findings
    #: block, is surplus once Overview closes early. Leaving it would
    #: close the project shell instead, which is how Documents fell
    #: out of scope the first time this was tried.
    build.swap(
        '        </div>\n        </sc-if>\n        </div>\n        </sc-if>\n\n'
        '        <sc-if value="{{ pjTabOther }}"',
        '        </div>\n        </sc-if>\n\n        <sc-if value="{{ pjTabOther }}"',
        why="removed the surplus close that swallowed the tabs after Findings",
    )


def four_tabs(build, audit) -> None:
    """Six tabs, three of them stubs, is a promise the product does
    not keep. Deliverables folds into Documents (papers in and out
    are one subject); Record folds into Overview's activity and the
    version history it belongs to."""
    build.swap(
        "['Overview','Versions','Findings','Sources','Deliverables','Record']",
        "['Overview','Findings','Versions','Documents']",
        why="six project tabs become four",
    )
    build.swap(
        "pjTabSources: s.pjTab === 'Sources',",
        "pjTabSources: s.pjTab === 'Documents',",
        why="Sources becomes Documents",
    )
    build.swap(
        "pjTabOther: !!s.pjTab && ['Overview','Sources','Findings'].indexOf(s.pjTab) === -1,",
        "pjTabOther: false,",
        why="no tab falls through to « next up » any more",
    )


def real_findings(build, audit) -> None:
    """Replace the invented findings with the engine's own output.

    Every row below came from a real run over a real workbook, so the
    counts, the cells, the sentences and the evidence all agree with
    each other because they all describe the same audit.
    """
    rows = shaped(audit)
    groups: dict[str, list[dict]] = {}
    for r in rows:
        groups.setdefault(r["g"], []).append(r)
    ordered = [(g, groups[g]) for g in GROUP_ORDER if g in groups]

    js_groups = ",\n          ".join(
        "{ name:%s, items:[%s] }"
        % (
            json.dumps(name),
            ",".join(
                "[%s,%s,%s]"
                % (json.dumps(i["what"]), json.dumps(i["sev"]), json.dumps(i["where"]))
                for i in items
            ),
        )
        for name, items in ordered
    )
    start = build.page.index("        const G = [\n          { name:'Probable formula defects'")
    end = build.page.index("        const GRIDS = {")
    build.page = (
        build.page[:start]
        + "        const G = [\n          "
        + js_groups
        + "\n        ];\n"
        + build.page[end:]
    )
    build.log.append(f"findings replaced with {len(rows)} real ones from the engine")

    #: The evidence for each row: the engine's own sentence, the cell
    #: it names, and the standard it cites. No invented spreadsheets.
    grids = {}
    for r in rows:
        grids[r["what"]] = {
            "why": r["why"],
            "ref": r["ref"] or "Workbook",
            "basis": r["basis"],
            "source": r["source"],
            "cells": r["cells"],
        }
    gstart = build.page.index("        const GRIDS = {")
    gend = build.page.index("\n", build.page.index("};", gstart))
    build.page = (
        build.page[:gstart]
        + "        const GRIDS = "
        + json.dumps(grids, ensure_ascii=False)
        + ";"
        + build.page[gend:]
    )
    build.log.append("evidence rebuilt from the engine's own sentences")


def real_counts(build, audit) -> None:
    """The chips count what the list holds — because both are now
    derived from one audit."""
    n = counts(shaped(audit))
    total = sum(n.values())
    build.sub(
        r"\{ label:'All', n:14, key:'all', badge:'#2f333b' \},\s*"
        r"\{ label:'Material', n:5, key:'err', badge:'#e0322d' \},\s*"
        r"\{ label:'Significant', n:5, key:'warn', badge:'#e8a300' \},\s*"
        r"\{ label:'Observation', n:4, key:'sug', badge:'#2b6cf5' \}",
        "{ label:'All', n:%d, key:'all', badge:'#2f333b' },\n"
        "        { label:'Material', n:%d, key:'err', badge:'#e0322d' },\n"
        "        { label:'Significant', n:%d, key:'warn', badge:'#e8a300' },\n"
        "        { label:'Observation', n:%d, key:'sug', badge:'#2b6cf5' }"
        % (total, n[MATERIAL], n[SIGNIFICANT], n[OBSERVATION]),
        why="chips now count the findings that are actually listed",
    )


ALL = [
    close_the_overview_block,
    four_tabs,
    real_findings,
    real_counts,
]
