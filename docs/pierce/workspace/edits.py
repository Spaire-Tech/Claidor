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


WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight",
         "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
         "sixteen", "seventeen", "eighteen", "nineteen", "twenty"]


def money(text: str) -> str:
    """Write a figure the way the rest of the product writes one.

    The engine may hand back several figures from one formula; a row
    that says « uses a typed 1751, 88 » reads like a typo, so several
    become « two typed numbers » and the evidence carries the rest.
    """
    parts = [p.strip() for p in str(text or "").split(",") if p.strip()]
    if len(parts) > 1:
        n = len(parts)
        return f"{WORDS[n] if n < len(WORDS) else n} typed numbers"
    if not parts:
        return ""
    try:
        value = float(parts[0])
    except ValueError:
        return parts[0]
    if value != int(value):
        return f"{value:,.4g}".replace("-", "\u2212")
    return f"{int(value):,}".replace("-", "\u2212")


def sentence(finding: dict) -> str:
    """One plain line carrying the specific fact — the design's rule.

    The row's own label does the naming, because that is what the
    reviewer recognises: « Total Senior Debt Service » says more than
    « a total ». Nothing here is invented; every part comes from the
    engine's own detail sentence or the label it read off the sheet.
    """
    rule = finding["rule"]
    detail = finding.get("detail") or finding.get("what") or ""
    label = (finding.get("name") or "").strip()
    figure = (finding.get("figure") or "").strip()

    if rule == "skipped-cell":
        #: The figure is real, but this run does not carry the unit
        #: with it, and « worth 0.9182 » on the face of a row invites
        #: the reader to dismiss what is nine hundred thousand pounds
        #: in a model denominated in millions. The amount stays in the
        #: detail, where the engine's own words carry it; the row says
        #: what happened. It can come back to the row the day the
        #: finding carries its unit.
        return f"{label} leaves out the row above it"

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
        written = money(figure)
        if written.endswith("typed numbers"):
            return f"{label} carries {written}, buried in the formula"
        return f"{label} uses a typed {written}, buried in the formula"

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
                "ref": f.get("ref", ""),
                "why": f.get("detail") or f.get("what", ""),
                "basis": f.get("basis", ""),
                "source": f.get("source", ""),
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
    also painting, which never happens.

    The count matters as much as the fix. Every tab block belongs at
    one depth — inside the scrolling column that also holds the tab
    bar. Overview arrives at Findings two closers short (its own div,
    then its own block), so exactly two go in here and exactly the
    two that used to end Overview after Findings come out. One closer
    too many and the scrolling column ends early: the later tabs
    still paint, which is what makes it look fixed, but they hang
    outside the scroller and their content can no longer scroll.
    """
    build.swap(
        '        </div>\n        \n\n        <sc-if value="{{ pjTabFindings }}"',
        '        </div>\n        </sc-if>\n\n'
        '        <sc-if value="{{ pjTabFindings }}"',
        why="Overview closes its own div and block before Findings begins",
    )
    build.swap(
        '        </div>\n        </sc-if>\n        </div>\n        </sc-if>\n\n'
        '        <sc-if value="{{ pjTabOther }}"',
        '        </div>\n        </sc-if>\n\n        <sc-if value="{{ pjTabOther }}"',
        why="removed the surplus close that used to end Overview after Findings",
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





#: --- the H7 project: one real model, two real versions ------------

import screens  # noqa: E402


def h7(tag: str = "v2.11") -> dict:
    """The engine's own run over the CAA's published model."""
    both = json.loads(
        (__import__("pathlib").Path(__file__).parent / "real-h7.json").read_text()
    )
    return both[tag]


def project_is_a_real_model(build, audit) -> None:
    """The project shows a model that exists: the CAA's own published
    price control model, v2.11, read in full. Its findings, counts,
    coverage and version history are one audit, so they agree."""
    d = h7()
    rows = shaped(d)
    n = counts(rows)
    meta = d["meta"]
    build.swap(
        "projectName: s.project || 'Northbank',",
        "projectName: s.project || 'CAA H7 price control',",
        why="the project names the model it actually holds",
    )
    build.sub(
        r"\{ name:'Northbank', model:'Northbank Bid Model', ver:'v22', checked:'Today 11:40', findings:'3 errors, 5 warnings', dot:'#e0322d' \}",
        "{ name:'CAA H7 price control', model:'h7_pcm_v2-11_final_determination.xlsm', "
        "ver:'v2.11', checked:'Read in 65s', findings:'%d material, %d significant', dot:'#e0322d' }"
        % (n[MATERIAL], n[SIGNIFICANT]),
        why="the project row carries the model's real name and counts",
    )
    build.sub(
        r"'Northbank Bid Model'(?!s)", "'H7 Price Control Model'", why="model title"
    )
    words = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
             "Nine", "Ten", "Eleven", "Twelve"]
    def spell(k: int) -> str:
        return words[k] if k < len(words) else str(k)
    verdict = (
        f"{spell(n[MATERIAL])} material, {spell(n[SIGNIFICANT]).lower()} significant, "
        f"{spell(n[OBSERVATION]).lower()} observations. Material findings should clear "
        f"before the model leaves the deal team."
    )
    build.sub(
        r"Five material, five significant, one observation\. Material findings should clear before the model leaves the deal team\.",
        verdict, why="the verdict counts the findings that exist")


def real_summary(build, audit) -> None:
    """Three sentences that are true of this audit."""
    d = h7()
    rows = shaped(d)
    n = counts(rows)
    sheets = {}
    for r in rows:
        sheets[r["where"]] = sheets.get(r["where"], 0) + 1
    worst = sorted(sheets.items(), key=lambda kv: -kv[1])[:2]
    new_count = 2  #: measured against v2.10, below
    build.sub(
        r"\{ text:'Five findings are material\. Four of those sit in the debt schedule and the statements, where a wrong number changes the price\.' \}",
        "{ text:'%d findings are material. The heaviest concentration is %s, with %d of them.' }"
        % (n[MATERIAL], worst[0][0], worst[0][1]),
        why="summary sentence one, from the audit")
    build.sub(
        r"\{ text:'Two arrived with version 22, saved on Tuesday\. Nothing has been cleared since version 19\.' \}",
        "{ text:'Two arrived with v2.11 and two cleared, so the count held at %d across the revision.' }" % len(rows),
        why="summary sentence two, from the version delta")
    build.sub(
        r"\{ text:'Five checks could not run: two VBA modules Ances does not read, and judgement on 308 assumption inputs\.' \}",
        "{ text:'Nineteen check families ran over 340,489 cells in 65 seconds. Four could not run, and each says why.' }",
        why="summary sentence three, the coverage statement")


def findings_from_h7(build, audit) -> None:
    """Swap the twelve-finding example for the real H7 set."""
    real_findings(build, h7())
    real_counts(build, h7())




def _delta() -> dict:
    """What v2.11 changed against v2.10 — computed, not asserted."""
    now, before = h7("v2.11"), h7("v2.10")
    key = lambda f: (f["rule"], f["ref"], (f.get("detail") or "")[:60])
    old = {key(f) for f in before["findings"]}
    fresh = [f for f in now["findings"] if key(f) not in old]
    cleared = [f for f in before["findings"] if key(f) not in {key(g) for g in now["findings"]}]
    dots = {MATERIAL: "#e0322d", SIGNIFICANT: "#e8a300", OBSERVATION: "#2b6cf5"}
    rows = []
    for f in fresh:
        r = shaped({"findings": [f]})[0]
        rows.append({"what": "New — " + r["what"], "where": r["where"], "dot": dots[r["sev"]]})
    for f in cleared:
        r = shaped({"findings": [f]})[0]
        rows.append({"what": "Cleared — " + r["what"], "where": r["where"], "dot": "#1f8a4c"})
    return {
        "headline": f"{len(fresh)} new, {len(cleared)} cleared",
        "sentence": (
            "Both changes sit on the same two cells. The hardcode on I_Series!AI282 did not "
            "go away — it was edited, so it reads as one finding cleared and one arriving. "
            "A version comparison is the only thing that shows that."
        ),
        "rows": rows,
    }


def _versions() -> list[dict]:
    now, before = h7("v2.11"), h7("v2.10")
    return [
        #: The dates are the workbooks' own last-saved stamps, read out
        #: of docProps — not a publication date we would be guessing at.
        {"tag": "v2.11", "what": "Final determination", "when": "Saved 7 March 2023",
         "findings": f"{len(now['findings'])} findings", "change": "2 new, 2 cleared"},
        {"tag": "v2.10", "what": "Final proposals", "when": "Saved 29 June 2022",
         "findings": f"{len(before['findings'])} findings", "change": "first version read"},
    ]


def _coverage() -> list[dict]:
    """Honest refusals: what the engine did not judge, and why."""
    return [
        {"label": "Behaviour under changed inputs", "count": "not run",
         "why": "The recalculation engine has not been validated against this workbook's own "
                "stored values, and an engine that cannot reproduce the base case is not "
                "allowed to judge a changed one."},
        {"label": "What each number measures", "count": "244,864 formulas",
         "why": "Unit checking — monthly against annual, thousands against millions — is not "
                "shipped. It ships when its accuracy is measured, not before."},
        {"label": "Whether the inputs are right", "count": "95,625 typed cells",
         "why": "No source documents are attached to this project, so nothing was traced back "
                "to a page. Add the determination documents and the typed inputs can be checked."},
        #: The rest of the product speaks plainly and never refers to
        #: itself in the third person; this line used to.
        {"label": "Macros", "count": "0 modules",
         "why": "Only formulas are read here, never macro code. This workbook carries none, "
                "so nothing was missed by it."},
    ]


def _needs_you() -> list[dict]:
    now = h7("v2.11")
    n = counts(shaped(now))
    return [
        {"what": f"{n[MATERIAL]} material findings are open", "where": "None accepted or explained yet",
         "action": "Review", "go": "goFindings"},
        {"what": "Two findings arrived with v2.11", "where": "One of them replaced a finding that cleared",
         "action": "See what changed", "go": "goVersions"},
        {"what": "No documents are attached to this project", "where": "Typed inputs cannot be traced without them",
         "action": "Add documents", "go": "goDocuments"},
    ]


def _top() -> list[dict]:
    rows = [r for r in shaped(h7("v2.11")) if r["sev"] == MATERIAL][:4]
    return [{"what": r["what"], "where": r["where"], "dot": "#e0322d"} for r in rows]


def fill_overview(build, audit) -> None:
    """Overview stops being a chart with three sentences.

    What needs you, what to look at first, the papers band, and what
    was not checked — the blocks the Ambre document says a report
    must carry, in the styles this design already uses.
    """
    blocks = (
        screens.coverage_line({
            "ran": "Nineteen", "cells": "340,489", "seconds": "80 seconds", "notrun": "Four",
        })
        + screens.needs_you(_needs_you())
        + screens.top_findings(_top())
        + screens.papers_band("No documents yet", "No deliverables yet")
        + screens.activity([
            {"what": "v2.11 read in full — 29 findings", "when": "80 seconds"},
            {"what": "v2.10 read for comparison", "when": "83 seconds"},
        ])
    )
    #: The trend chart is the last thing in the Overview block; the
    #: new sections follow it, before the block closes.
    build.swap(
        '        </div>\n        </sc-if>\n\n        <sc-if value="{{ pjTabFindings }}"',
        blocks + "\n        </div>\n        </sc-if>\n\n"
        '        <sc-if value="{{ pjTabFindings }}"',
        why="Overview carries needs-you, top findings, the papers band and coverage",
    )


def build_versions_tab(build, audit) -> None:
    """« Versions — next up » becomes the Watch."""
    build.swap(
        '        <sc-if value="{{ pjTabOther }}"',
        screens.versions_tab(_versions(), _delta()) + '\n        <sc-if value="{{ pjTabOther }}"',
        why="the Versions tab is built: what changed, and what it did to the findings",
    )
    build.swap(
        "      pjTabOther: false,",
        "      pjTabOther: false,\n      pjTabVersions: s.pjTab === 'Versions',",
        why="Versions gets its own condition",
    )


def coverage_and_wiring(build, audit) -> None:
    """The coverage sheet, and the props the new blocks call."""
    #: A modal has to hang off the root. Put inside the dock — which
    #: carries a backdrop-filter — `position:fixed` stops meaning the
    #: viewport: the filter makes the dock the containing block, and
    #: the sheet gets pinned to the bottom bar with half of it off
    #: screen. This anchor is where the design's own modals live.
    build.swap(
        '  <sc-if value="{{ reportOpen }}" hint-placeholder-val="{{ false }}">',
        screens.coverage_sheet(_coverage())
        + '  <sc-if value="{{ reportOpen }}" hint-placeholder-val="{{ false }}">',
        why="the coverage sheet exists and opens, at the root where modals belong",
    )
    build.swap(
        "      goFindings: () => this.setState({ pjTab: 'Findings' }),",
        "      goFindings: () => this.setState({ pjTab: 'Findings' }),\n"
        "      goVersions: () => this.setState({ pjTab: 'Versions' }),\n"
        "      goDocuments: () => this.setState({ pjTab: 'Documents' }),\n"
        "      coverageOpen: !!s.coverageOpen,\n"
        "      openCoverage: () => this.setState({ coverageOpen: true }),\n"
        "      closeCoverage: () => this.setState({ coverageOpen: false }),",
        why="the new blocks' buttons are wired",
    )




def honest_header(build, audit) -> None:
    """The title names the file that was read, and the version chip
    names the version that was read."""
    build.sub(
        r'line-height:1\.2">Northbank Bid Model</span>',
        'line-height:1.2">H7 Price Control Model</span>',
        why="the page title names the model that was read",
    )
    build.swap("<span>Version 22</span>", "<span>v2.11 · final determination</span>",
               why="the version chip names the version that was read")
    build.sub(r'white-space:nowrap">Northbank Bid Model</span>',
              'white-space:nowrap">H7 Price Control Model</span>', why="panel title")
    build.sub(r"Northbank Bid Model, version 22 · 11 open findings",
              "H7 Price Control Model, v2.11 · 29 open findings", why="chat subtitle")


def honest_trend(build, audit) -> None:
    """Two real versions, not five invented ones.

    The chart is the design's, unchanged; what changes is that its
    points are the finding counts the engine actually produced for
    the two versions that exist.
    """
    now, before = h7("v2.11"), h7("v2.10")
    def per(tier: int, d: dict) -> int:
        return sum(1 for f in d["findings"] if f["tier"] == tier)
    build.swap(
        "      ovTicks: ['v14','v16','v18','v20','v22'].map(label => ({ label })),",
        "      ovTicks: ['v2.10','v2.11'].map(label => ({ label })),",
        why="the trend's axis names the versions that exist",
    )
    build.sub(
        r"\{ key:'err', stroke:'#e0322d', fill:'url\(#gErr\)', pts:\[[^\]]*\], delay:'0s' \}",
        "{ key:'err', stroke:'#e0322d', fill:'url(#gErr)', pts:[%d,%d], delay:'0s' }"
        % (per(1, before), per(1, now)), why="material series, measured")
    build.sub(
        r"\{ key:'warn', stroke:'#e8a300', fill:'url\(#gWarn\)', pts:\[[^\]]*\], delay:'\.12s' \}",
        "{ key:'warn', stroke:'#e8a300', fill:'url(#gWarn)', pts:[%d,%d], delay:'.12s' }"
        % (per(2, before), per(2, now)), why="significant series, measured")
    build.sub(
        r"\{ key:'sug', stroke:'#2b6cf5', fill:'url\(#gSug\)', pts:\[[^\]]*\], delay:'\.24s' \}",
        "{ key:'sug', stroke:'#2b6cf5', fill:'url(#gSug)', pts:[%d,%d], delay:'.24s' }"
        % (per(3, before), per(3, now)), why="observation series, measured")
    #: With two points the curve's max must not be the invented 9.
    build.swap("const x0 = 30, x1 = 980, base = 220, top = 30, max = 9;",
               "const x0 = 30, x1 = 980, base = 220, top = 30, max = 16;",
               why="the chart's scale fits the real counts")


def accurate_summary(build, audit) -> None:
    """Two sentences in the summary said more than the audit knows."""
    rows = [r for r in shaped(h7("v2.11")) if r["sev"] == MATERIAL]
    where: dict[str, int] = {}
    for r in rows:
        where[r["where"]] = where.get(r["where"], 0) + 1
    worst, worst_n = sorted(where.items(), key=lambda kv: -kv[1])[0]
    spread = len(where)
    build.sub(
        r"\{ text:'\d+ findings are material\.[^']*' \}",
        "{ text:'Ten findings are material, spread across %d sheets. %s carries %d of them.' }"
        % (spread, worst, worst_n),
        why="the concentration sentence counts material findings only")
    build.sub(
        r"Nineteen check families ran over 340,489 cells in 65 seconds\. Four could not run, and each says why\.",
        "Both versions were read in full — 340,489 cells and 244,864 formulas, in 80 seconds.",
        why="the third bullet states the read; coverage gets its own line")
    build.sub(r"Ten material, 14 significant, five observations\.",
              "Ten material, fourteen significant, five observations.",
              why="the verdict spells its numbers like the rest of the copy")




def version_comparison_card(build, audit) -> None:
    """Two readings cannot draw a five-point curve, so the card shows
    the comparison it actually has."""
    now, before = h7("v2.11"), h7("v2.10")
    def per(tier: int, d: dict) -> int:
        return sum(1 for f in d["findings"] if f["tier"] == tier)
    top = max(per(t, now) for t in (1, 2, 3)) or 1
    rows = [
        {"label": MATERIAL, "dot": "#e0322d", "before": per(1, before), "after": per(1, now),
         "pct": round(100 * per(1, now) / top)},
        {"label": SIGNIFICANT, "dot": "#e8a300", "before": per(2, before), "after": per(2, now),
         "pct": round(100 * per(2, now) / top)},
        {"label": OBSERVATION, "dot": "#2b6cf5", "before": per(3, before), "after": per(3, now),
         "pct": round(100 * per(3, now) / top)},
    ]
    note = ("v2.10 → v2.11. Two findings arrived and two cleared, so the total held at 29. "
            "The Versions tab says which.")
    build.sub(
        r'<svg sc-camel-view-box="0 0 1000 280".*?</svg>',
        screens.version_strip(rows, note),
        why="the trend card becomes a comparison of the two versions that exist",
        flags=__import__("re").S,
    )
    build.sub(
        r'<div style="display:flex; align-items:center; gap:10px; padding:8px 2px 0">.*?</span>\s*</div>',
        "", why="the invented version axis goes", flags=__import__("re").S,
    )




def _files() -> list[dict]:
    """Both workbooks, as read — no rounding, no invention."""
    out = []
    for tag in ("v2.11", "v2.10"):
        m = h7(tag)["meta"]
        out.append(
            {
                "name": m["file"],
                "facts": f"{m['sheets']} sheets · {m['cells']:,} cells · {m['formulas']:,} formulas",
                "tag": f"{tag} · read in {round(m['seconds'])}s",
            }
        )
    return out


def _typed() -> dict:
    """The one thing a document would settle, counted from the run."""
    rows = h7()["findings"]
    typed = [f for f in rows if f["rule"] in ("hardcode-in-formula", "typed-over-formula")]
    n = len(typed)
    word = WORDS[n].capitalize() if n < len(WORDS) else str(n)
    return {
        "sentence": (
            f"{word} findings are numbers typed straight into the model with nothing "
            "standing behind them — a 0.5 inside the WACC uplift, an opex bonus of "
            "0.2960127, a 5% equity issuance cost. A document would settle each of "
            "them. None is attached."
        ),
        "link": f"The {WORDS[n] if n < len(WORDS) else n} typed numbers",
    }


def build_documents_tab(build, audit) -> None:
    """The Links diagram drew one model with seven documents around
    it. There are no documents: two versions of one workbook, and
    nothing else. A diagram of files that do not exist is the purest
    kind of placeholder, so it goes, and the tab says what is true."""
    head = '        <sc-if value="{{ pjTabSources }}" hint-placeholder-val="{{ false }}">'
    tail = "        </sc-if>\n        </div>\n        </div>\n      </div>"
    start = build.page.index(head)
    #: The tail's own `</sc-if>` closed the block being removed. The
    #: replacement brings its own pair, so this one has to go with it
    #: — leaving it behind closes an outer container early and the tab
    #: renders outside the scrolling column.
    end = build.page.index(tail, start) + len("        </sc-if>\n")
    build.page = (
        build.page[:start]
        + screens.documents_tab(_files(), _typed())
        + build.page[end:]
    )
    build.log.append(
        f"Documents replaces the seven-document diagram ({end - start:,} chars cut)"
    )


#: --- the rest of the app -----------------------------------------
#:
#: Everything above rebuilds one project. The screens around it still
#: carried an invented firm — four deals, three colleagues, a week of
#: chat history, a comparison of versions nobody ran. One workbook has
#: actually been read here, twice. These edits make every screen say
#: so, and give the emptiness that follows a proper state instead of
#: filler.


def one_real_project(build, audit) -> None:
    """Four projects become the one that exists.

    Three of the four rows were invented, and they carried a second
    severity vocabulary with them — « 1 error, 2 warnings » beside
    « 10 material, 14 significant ». Removing them settles both at
    once: one project, one vocabulary.
    """
    now = h7("v2.11")
    n = counts(shaped(now))
    build.sub(
        r"      pjProjects: \[\n.*?\n      \]\.map",
        "      pjProjects: [\n"
        "        { name:'CAA H7 price control', model:'h7_pcm_v2-11_final_determination.xlsm', "
        f"ver:'v2.11', checked:'Read in 80s', findings:'{n[MATERIAL]} material, "
        f"{n[SIGNIFICANT]} significant, {n[OBSERVATION]} observations', dot:'#e0322d' }}\n"
        "      ].map",
        why="the project list holds the one project that has been read",
        flags=16,  # re.DOTALL
    )


def ask_knows_where_it_is(build, audit) -> None:
    """The chat's scope chip said « Northbank », and its history held
    a week of conversations nobody had.

    An empty history is the truthful state and it is also one of the
    states the design never drew, so it is drawn here: what the chat
    can answer, and the fact that nothing has been asked yet.
    """
    build.swap(
        "asProject: s.asProject || 'Northbank',",
        "asProject: s.asProject || 'CAA H7 price control',",
        why="the chat says which project it is answering from",
    )
    build.sub(
        r"'Northbank', 'Calder Rail Concession', 'Sefton Water AMP8', 'Thameshead Logistics'",
        "'CAA H7 price control'",
        why="the project chooser offers the project that exists",
    )
    build.sub(
        r"\(s\.asProject \|\| 'Northbank'\)",
        "(s.asProject || 'CAA H7 price control')",
        why="the chooser marks the current project as current",
    )
    build.sub(
        r"      histPinned: \[\n.*?\n      \]\.map\(p => \(\{ \.\.\.p, open: \(\) => this\.setState\(\{ histOpen: false \}\) \}\)\),",
        "      histPinned: [].map(p => p),",
        why="nothing is pinned, because nothing has been asked",
        flags=16,
    )
    build.sub(
        r"      histGroups: \(\(\) => \{\n        const all = \[\n.*?\n        \];\n",
        "      histGroups: (() => {\n        const all = [];\n",
        why="the chat history is empty",
        flags=16,
    )
    #: Both flags follow the two empty lists above. Wiring real
    #: conversations means deriving them from the lists rather than
    #: leaving these as they are.
    build.swap(
        "      histPinned: [].map(p => p),",
        "      histPinned: [],\n      hasPinned: false,\n      histNone: true,",
        why="the sidebar knows it has nothing to show",
    )
    build.swap(
        '              <span style="font-size:13px; color:#a2a29c; padding:26px 10px 6px">Pinned</span>',
        '              <sc-if value="{{ hasPinned }}" hint-placeholder-val="{{ false }}">\n'
        '              <span style="font-size:13px; color:#a2a29c; padding:26px 10px 6px">Pinned</span>',
        why="no « Pinned » heading over nothing pinned",
    )
    build.swap(
        '              </sc-for>\n\n              <div style="display:flex; align-items:center; '
        'gap:16px; margin:26px 10px 0">',
        "              </sc-for>\n              </sc-if>\n\n"
        '              <div style="display:flex; align-items:center; gap:16px; margin:26px 10px 0">',
        why="the pinned block closes",
    )
    build.swap(
        "              </sc-for>\n            </div>\n          </div>\n        </div>\n\n"
        '      <div style="position:relative; flex:1; min-width:0; display:flex; '
        'flex-direction:column">',
        "              </sc-for>\n"
        '              <sc-if value="{{ histNone }}" hint-placeholder-val="{{ false }}">'
        + screens.nothing_here(
            "No chats yet.",
            "Ask about a finding, a cell, a figure, or what changed between two "
            "versions. What you ask stays with the project it was asked in.",
        )
        + "\n              </sc-if>\n            </div>\n          </div>\n        </div>\n\n"
        '      <div style="position:relative; flex:1; min-width:0; display:flex; '
        'flex-direction:column">',
        why="an empty history says it is empty, and what the chat is for",
    )


def check_a_model_is_what_was_run(build, audit) -> None:
    """« Checked before » listed four runs, three of them invented,
    and the one real row reported a time the engine never took.

    Two runs are real: this project's workbook, and the small debt
    indexation file from the same price control. The second one is
    worth keeping for a reason beyond honesty — it is the only shape
    of result the design never showed, a model with nothing material
    in it. The engine has never returned a wholly clean regulator
    model, so the screen says « nothing material », which is what was
    actually found, rather than « clean », which was never true.
    """
    build.sub(
        r"      chkHist: \[\n.*?\n      \]\.map",
        "      chkHist: [\n"
        "        { name:'h7_pcm_v2-11_final_determination.xlsm', when:'Read in 80s', "
        "state:'29 findings', fg:'#c8790a' },\n"
        "        { name:'h7_new_debt_indexation_fp.xlsx', when:'Read in 1.1s', "
        "state:'Nothing material', fg:'#1f8a4c', clean:true }\n"
        "      ].map",
        why="the check history holds the runs that happened",
        flags=16,
    )
    build.swap(
        "const names = ['H7 Price Control Model', 'Northbank sensitivity pack', "
        "'Calder Rail Concession', 'Sefton Water AMP8'];",
        "const names = ['H7 Price Control Model', 'H7 new debt indexation'];",
        why="the run header names the file that was read",
    )
    #: The second file carries no version number of its own, and the
    #: chip renders « Version {n} ». Rather than borrow a number from
    #: somewhere, the chip becomes a whole label and says so.
    build.swap("const vers = ['22', '3', '9', '4'];",
               "const vers = ['2.11', ''];",
               why="version labels come off the files, or are absent")
    build.swap(
        "          chkName: names[i], chkVerNum: vers[i],",
        "          chkName: names[i], chkVerNum: vers[i],\n"
        "          chkVerLabel: vers[i] ? 'Version ' + vers[i] : 'No version number',",
        why="a file without a version says so instead of showing a blank",
    )
    build.swap("<span>Version {{ chkVerNum }}</span>", "<span>{{ chkVerLabel }}</span>",
               why="the version chip reads the label")
    build.swap(
        "const files = ['Northbank_Bid_Model_v22.xlsx', 'Northbank_sensitivity_pack_v3.xlsx', "
        "'Calder_Rail_Model_v9.xlsx', 'Sefton_Water_AMP8_v4.xlsx'];",
        "const files = ['h7_pcm_v2-11_final_determination.xlsm', "
        "'h7_new_debt_indexation_fp.xlsx'];",
        why="the file name is the file that was read",
    )
    build.swap(
        "const subs = ['31 sheets · 214,061 formulas · read in 3m 41s', "
        "'6 sheets · 18,402 formulas · read in 22s', "
        "'19 sheets · 96,400 formulas · read in 1m 58s', "
        "'26 sheets · 180,220 formulas · read in 3m 04s'];",
        "const subs = ['62 sheets · 244,864 formulas · read in 80s', "
        "'3 sheets · 6,750 cells · read in 1.1s'];",
        why="the facts under the file name are measured, not claimed",
    )
    build.swap("const passN = [41, 38, 41, 40];", "const passN = [19, 19];",
               why="nineteen check families ran, on both")
    build.swap(
        "chkVerdict: cl ? 'Nothing wrong found' : 'Eleven errors found',",
        "chkVerdict: cl ? 'Nothing material found' : 'Twenty-nine findings',",
        why="the verdict is the count that came back",
    )
    build.swap(
        "chkSub: cl\n"
        "            ? 'Forty-one checks ran against the FAST and ICAEW standards. "
        "None of them disagrees with the model.'\n"
        "            : 'Eleven checks do not pass, five of them material. Material findings "
        "should clear before the model leaves the deal team.',",
        "chkSub: cl\n"
        "            ? 'Nineteen check families ran over 6,750 cells. Two findings came back, "
        "neither material — both are numbers typed inside a formula.'\n"
        "            : 'Twenty-nine findings, ten of them material. Material findings should "
        "clear before the model leaves the deal team.',",
        why="the verdict sentence carries the run's own numbers",
    )
    build.sub(
        r"          chkSummary: cl\n            \? \[.*?\]\n            : \[.*?\]\n",
        "          chkSummary: cl\n"
        "            ? [{ text: 'Two numbers are typed inside formulas: three years written "
        "into an averaging calculation, and a 0.5 repeated across fifteen formulas on the "
        "same sheet.' },\n"
        "               { text: 'Nothing in this file skips a cell, breaks a row pattern or "
        "shows an error value.' },\n"
        "               { text: 'Nothing material is not the same as nothing wrong. Whether "
        "the inputs are right is not something a formula reader can tell you.' }]\n"
        "            : [{ text: 'Ten findings are material, spread across 9 sheets. C_Ratios "
        "carries 2 of them.' },\n"
        "               { text: 'Two arrived with v2.11 and two cleared, so the count held at "
        "29 across the revision.' },\n"
        "               { text: 'Both versions were read in full — 340,489 cells and 244,864 "
        "formulas, in 80 seconds.' }]\n",
        why="the run summary is the audit's own summary",
        flags=16,
    )


def _diff() -> dict:
    """The comparison of the two H7 versions, as measured."""
    raw = json.loads(
        (__import__("pathlib").Path(__file__).parent / "real-diff.json").read_text()
    )
    names = {
        "formula rewritten": "A formula was rewritten",
        "typed value changed": "A typed value changed",
        "added": "A cell that was empty now holds something",
        "removed": "A cell that held something is now empty",
        "formula replaced by a typed value": "A formula was replaced by a typed value",
        "typed value replaced by a formula": "A typed value was replaced by a formula",
    }
    order = sorted(raw["by_kind"].items(), key=lambda kv: -kv[1])
    top = sorted(raw["per_sheet"].items(), key=lambda kv: -kv[1]["changed"])[:6]
    touched = len(raw["per_sheet"])
    return {
        "headline": "What changed",
        "chip": f"{raw['changed']:,} cells",
        "sentence": (
            f"{raw['changed']:,} cells changed between the two versions, and {raw['moved']:,} "
            "numbers came back different. More numbers moved than cells changed, because one "
            f"rewritten formula moves every cell that reads it. Both files were read in full "
            f"— {raw['compared']:,} cells across {raw['sheets']} sheets, in "
            f"{raw['seconds']:.0f} seconds."
        ),
        "kinds": [{"what": names.get(k, k), "n": f"{v:,}"} for k, v in order],
        "sheets": [
            {
                "sheet": name,
                "what": f"{counts['changed']:,} changed · {counts['moved']:,} moved",
            }
            for name, counts in top
        ],
        "rest": (
            f"{touched} of {raw['sheets']} sheets changed. The other "
            f"{raw['sheets'] - touched} are identical."
        ),
        "refusal": "Which change moved which number.",
        "refusalWhy": (
            "Both columns above are read straight off the files: what each cell says, and "
            "the value Excel last saved in it. Tying a movement back to the change that "
            "caused it means recalculating the workbook, and the recalculation engine has "
            "not been validated against this model. Nor can a file comparison tell you "
            "which of these changes was intended — that reading is yours."
        ),
    }


def compare_has_a_result(build, audit) -> None:
    """« Find differences » navigated to the chat. A top-level tab
    with no output is a promise the product does not keep, so the
    comparison that was actually run gets a screen — and the two
    workbooks on offer are the two that exist.

    The hint under the button also claimed « Both workbooks read
    locally. Nothing leaves the file. » The files are uploaded, so
    the first half was untrue and the second half meant nothing.
    """
    build.swap(
        "cmpAPick: () => this.setState({ cmpA: { name:'Northbank_Bid_Model_v19.xlsx', "
        "meta:'31 sheets · saved 22 July' } }),",
        "cmpAPick: () => this.setState({ cmpA: { name:'h7_pcm_v2-10_final_proposals.xlsm', "
        "meta:'62 sheets · saved 29 June 2022' } }),",
        why="the original workbook is one that exists",
    )
    build.swap(
        "cmpBPick: () => this.setState({ cmpB: { name:'Northbank_Bid_Model_v22.xlsx', "
        "meta:'31 sheets · saved 09:12 today' } }),",
        "cmpBPick: () => this.setState({ cmpB: { name:"
        "'h7_pcm_v2-11_final_determination.xlsm', meta:'62 sheets · saved 7 March 2023' } }),",
        why="the updated workbook is one that exists",
    )
    build.sub(
        r"      cmpRecent: \[\n.*?\n      \],",
        "      cmpRecent: [\n"
        "        { t:'v2.10 → v2.11', sub:'28,805 cells · read in 33s' }\n"
        "      ],",
        why="the recent comparisons list holds the comparison that was run",
        flags=16,
    )
    build.swap(
        "cmpRun: () => { if (s.cmpA && s.cmpB) this.go('assist')(); },",
        "cmpRun: () => { if (s.cmpA && s.cmpB) this.setState({ cmpDone: true }); },\n"
        "      cmpDone: !!s.cmpDone,\n"
        "      cmpIdle: !s.cmpDone,",
        why="Find differences produces the differences",
    )
    build.swap(
        "cmpClear: () => this.setState({ cmpA: null, cmpB: null }),",
        "cmpClear: () => this.setState({ cmpA: null, cmpB: null, cmpDone: false }),",
        why="starting again clears the result too",
    )
    build.swap(
        "cmpHint: s.cmpA && s.cmpB ? 'Both workbooks read locally. Nothing leaves the file.' "
        ": 'Add both workbooks to run the comparison.',",
        "cmpHint: s.cmpA && s.cmpB ? 'Both workbooks are read in full. Neither file is "
        "written to.' : 'Add both workbooks to run the comparison.',",
        why="the hint under the button stops claiming something untrue",
    )
    build.swap(
        '          <div style="margin:auto; width:100%; max-width:900px; display:flex; '
        'flex-direction:column; align-items:center">\n'
        '            <span style="font-family:Newsreader,Georgia,serif; font-size:32px; '
        "font-weight:400; line-height:1.2; letter-spacing:-.012em; color:#1c1f23; "
        'text-align:center; text-wrap:balance">What changed between these two?</span>',
        '          <sc-if value="{{ cmpIdle }}" hint-placeholder-val="{{ true }}">\n'
        '          <div style="margin:auto; width:100%; max-width:900px; display:flex; '
        'flex-direction:column; align-items:center">\n'
        '            <span style="font-family:Newsreader,Georgia,serif; font-size:32px; '
        "font-weight:400; line-height:1.2; letter-spacing:-.012em; color:#1c1f23; "
        'text-align:center; text-wrap:balance">What changed between these two?</span>',
        why="the picker is what you see before the run",
    )
    build.swap(
        '            <span style="font-size:13px; color:#a2a29c; margin-top:16px; '
        'text-align:center; text-wrap:pretty">{{ cmpHint }}</span>\n          </div>',
        '            <span style="font-size:13px; color:#a2a29c; margin-top:16px; '
        'text-align:center; text-wrap:pretty">{{ cmpHint }}</span>\n          </div>\n'
        "          </sc-if>\n" + screens.compare_result(_diff()),
        why="and the result is what you see after it",
    )


def _refusals() -> list[dict]:
    """What the shipped reader says when it will not read a file."""
    return json.loads(
        (__import__("pathlib").Path(__file__).parent / "real-refusals.json").read_text()
    )


def the_engine_can_refuse(build, audit) -> None:
    """« Engine refused this workbook, and why » was on the list of
    states nobody had drawn, and it is the one that matters most: a
    refusal that looks like a pass is the worst screen a checking
    product can show.

    The wording is not written here. Each sentence is what the
    shipped reader actually returned when handed that file, recorded
    in real-refusals.json by running it.
    """
    cases = _refusals()
    shown = next(c for c in cases if c["file"].endswith(".csv"))
    others = [c for c in cases if c is not shown and "(" not in c["reason"]]
    build.swap(
        "        { name:'h7_new_debt_indexation_fp.xlsx', when:'Read in 1.1s', "
        "state:'Nothing material', fg:'#1f8a4c', clean:true }\n",
        "        { name:'h7_new_debt_indexation_fp.xlsx', when:'Read in 1.1s', "
        "state:'Nothing material', fg:'#1f8a4c', clean:true },\n"
        "        { name:'assumptions.csv', when:'Refused', state:'Could not be read', "
        "fg:'#c9302c', refused:true }\n",
        why="a refused file is in the history, because refusals happen",
    )
    build.swap(
        "open: () => this.setState({ chkSel: i, cPhase: 'done' }) })),",
        "open: () => this.setState({ chkSel: i, cPhase: h.refused ? 'refused' : 'done' }) })),",
        why="opening a refused file shows the refusal, not a result",
    )
    build.swap(
        "      cRunning: s.cPhase === 'running',",
        "      cRunning: s.cPhase === 'running',\n      cRefused: s.cPhase === 'refused',",
        why="the refusal is a state of its own",
    )
    #: The dot beside a refused row must not read as a severity. Red
    #: here means « no answer », which is why the row says so in words.
    build.swap(
        "dot: h.clean ? '#dcdbdd' : '#e0322d',",
        "dot: h.refused ? '#c9302c' : (h.clean ? '#dcdbdd' : '#e0322d'),",
        why="the refused row carries its own mark",
    )
    build.swap(
        '        </sc-if>\n        </div>\n        </div>\n      </div>\n      </sc-if>\n\n'
        '      <sc-if value="{{ vCompare }}"',
        "        </sc-if>\n"
        + screens.refused(shown["file"], shown["reason"], others)
        + '        </div>\n        </div>\n      </div>\n      </sc-if>\n\n'
        '      <sc-if value="{{ vCompare }}"',
        why="and the refusal has a screen",
    )


def the_browser_lists_real_files(build, audit) -> None:
    """« New project » opened a folder browser onto an invented firm:
    SharePoint › Investment Banking › Deals › Falcon, Meridian,
    Ashgrove — eight files here, eleven there, none of them real.

    There is a real answer available. The engine has read 27 workbooks
    from three price control corpora, and every folder, file name,
    sheet count and finding count below is taken from that reading.
    The root crumb stops saying « SharePoint », because these files
    are published regulator models, not anybody's tenant.
    """
    corpus = json.loads(
        (__import__("pathlib").Path(__file__).parent / "real-corpus.json").read_text()
    )
    leaves = {path.split("/")[1]: (path.split("/")[0], files)
              for path, files in corpus.items()}
    parents: dict[str, list[str]] = {}
    for leaf, (parent, _files) in leaves.items():
        parents.setdefault(parent, []).append(leaf)

    def js(value) -> str:
        return json.dumps(value, ensure_ascii=False)

    tree = ["const SP = {", "  '': [" + ", ".join(
        "{ name:" + js(p) + " }" for p in parents) + "],"]
    for parent, kids in parents.items():
        tree.append(f"  {js(parent)}: ["
                    + ", ".join("{ name:" + js(k) + " }" for k in kids) + "],")
    tree.append("};")

    info = ["const FOLDER_INFO = {"]
    files_js = ["const FILES = {"]
    for leaf, (_parent, files) in leaves.items():
        found = sum(f["findings"] or 0 for f in files)
        info.append(
            f"  {js(leaf)}: {{ files:{len(files)}, findings:{found}, models:"
            + js([f["name"] for f in files])
            + " },"
        )
        files_js.append(f"  {js(leaf)}: [")
        for f in files:
            sub = (
                f"{f['sheets']} sheets · {f['cells']:,} cells · "
                f"{f['findings']} findings"
                if f["findings"] is not None
                else "not read yet"
            )
            files_js.append(
                "    { name:" + js(f["name"]) + ", kind:'xls', sub:" + js(sub) + " },"
            )
        files_js.append("  ],")
    info.append("};")
    files_js.append("};")
    at = "const FOLDER_AT = " + js({k: v[0] for k, v in leaves.items()}) + ";"

    build.sub(r"const SP = \{\n.*?\n\};", "\n".join(tree),
              why="the folder tree is the corpus that was actually read", flags=16)
    build.sub(r"const FOLDER_INFO = \{\n.*?\n\};", "\n".join(info),
              why="folder counts come from the reading", flags=16)
    build.sub(r"const FILES = \{\n  Falcon: \[\n.*?\n\};", "\n".join(files_js),
              why="the files are files that exist", flags=16)
    build.swap(
        "Object.keys(FILES).forEach(k => { SP['Investment Banking/Deals/' + k] = FILES[k]; });",
        at + "\nObject.keys(FILES).forEach(k => { SP[FOLDER_AT[k] + '/' + k] = FILES[k]; });",
        why="each folder's files hang under the folder they are in",
    )
    build.sub(
        r"  i\.sub = plural\(i\.files, 'file', 'files'\).*?\n.*?\n"
        r"  i\.short = .*?\n",
        "  i.sub = plural(i.files, 'file', 'files') + ' · '\n"
        "    + plural(i.findings, 'finding', 'findings') + ' when last read';\n"
        "  i.short = plural(i.files, 'file', 'files');\n",
        why="a folder's subtitle counts files and findings, not decks it has none of",
        flags=16,
    )
    build.swap(
        "openNew: () => this.setState({ newOpen: true, ndStep: 'browse', "
        "ndPath: ['Investment Banking', 'Deals'], ndPicks: [], ndMeta: {}, ndStep2: 0 }),",
        "openNew: () => this.setState({ newOpen: true, ndStep: 'browse', "
        "ndPath: [], ndPicks: [], ndMeta: {}, ndStep2: 0 }),",
        why="the browser opens at the top of what it can see",
    )
    build.swap("ndCrumbs: ['SharePoint'].concat(s.ndPath)",
               "ndCrumbs: ['Files'].concat(s.ndPath)",
               why="the root crumb stops naming a tenant these files are not in")


def the_run_counts_the_run(build, audit) -> None:
    """The progress steps counted a model that was never read — 31
    sheets, 214,061 cells, « 41 pass, 6 fail ». The run they now
    describe is the one whose result the next screen shows.

    « Pass » is also the wrong word for what the engine does. It runs
    check families; a family either returns findings or does not, and
    four families could not run at all. The tally says that instead.
    """
    build.sub(
        r"const RUN_SOLO = \{\n.*?\n\};",
        "const RUN_SOLO = {\n"
        "  steps: [\n"
        "    { label:'Opening the workbook', note:'62 sheets' },\n"
        "    { label:'Mapping the formula grid', note:'340,489 cells' },\n"
        "    { label:'Running the checks', note:'19 families' },\n"
        "    { label:'Tracing each finding to its cell', note:'29 findings' }\n"
        "  ],\n"
        "  tally: [\n"
        "    { value:'12', label:'families found nothing', fg:'#1d1d1f' },\n"
        "    { value:'7', label:'families found something', fg:'#c8790a' },\n"
        "    { value:'4', label:'could not run', fg:'#aeaeb2' }\n"
        "  ],\n"
        "  findings: []\n"
        "};",
        why="the progress steps count the run that actually happened",
        flags=16,
    )


def the_last_stale_numbers(build, audit) -> None:
    """Four places still described a 31-sheet, 214,061-formula model
    that was never read: the header above the progress bar, the chat's
    line about the model it is answering from, the model panel's
    subtitle, and the front hall's speed claim.

    The speed claim is the one that mattered most. « 3m 41s to read a
    31-sheet, 214,000-formula model » was a number nobody had taken.
    The real one is faster, and it is a number that can be repeated.
    """
    build.swap(
        ">31 sheets · 214,061 formulas</span>",
        ">62 sheets · 244,864 formulas</span>",
        why="the run header counts the workbook being read",
    )
    build.swap(
        "'H7 Price Control Model': '31 sheets · 214,061 cells · 308 typed inputs · "
        "read 09:12 today',",
        "'H7 Price Control Model': '62 sheets · 340,489 cells · 95,625 typed cells · "
        "read in 80s',",
        why="the chat's line about the model matches the model",
    )
    build.swap(
        "'31 sheets · 214,061 formulas · saved Tuesday 11:40'",
        "'62 sheets · 244,864 formulas · saved 7 March 2023'",
        why="the model panel's subtitle matches the file",
    )
    #: The papers band on Overview renders `mdFile`, and outside a
    #: deal it fell through to a default naming a workbook that does
    #: not exist — the one invented name still on the main screen.
    build.swap(
        "mdFile: s.deal ? s.deal.file : 'Northbank_Bid_Model_v22.xlsx',",
        "mdFile: s.deal ? s.deal.file : 'h7_pcm_v2-11_final_determination.xlsm',",
        why="Overview's papers band names the workbook it holds",
    )
    build.swap(
        "'Falcon Management Presentation'",
        "'h7_pcm_v2-11_final_determination.xlsm'",
        why="the docked chat's title names the file it is open on",
    )
    build.swap(
        "{ value:'3m 41s', label:'to read a 31-sheet, 214,000-formula model' },",
        "{ value:'80s', label:'to read a 62-sheet, 245,000-formula model' },",
        why="the speed claim is a time that was measured",
    )


def one_model_everywhere_else(build, audit) -> None:
    """`DEALS` is the spine the older screens hang off — the chat's
    model picker, the invite dialog's project list, the model page.
    Five entries, four of them invented, and the first one carrying
    the right name over the wrong file and a version 22 that does not
    exist. One entry, and it is the workbook that was read.
    """
    build.sub(
        r"const DEALS = \[\n.*?\n\];",
        "const DEALS = [\n"
        "  { name:'H7 Price Control Model', client:'Civil Aviation Authority · v2.11',\n"
        "    file:'h7_pcm_v2-11_final_determination.xlsm', findings:true,\n"
        "    state:'29 findings', dot:'#e0322d', stateFg:'#c8790a', checked:'Read in 80s',\n"
        "    since:'v2.10 was read as well. Two findings arrived with v2.11 and two "
        "cleared, so the count held at 29.',\n"
        "    line:'19 check families ran · 29 findings · four families could not run',\n"
        "    pass:12, notRun:4, ver:'v2.11', docs:0, locker:0, failCount:29, main:true }\n"
        "];",
        why="one model, and it is the one that was read",
        flags=16,
    )
    build.swap(
        "{ k:'Version', v: s.deal.ver.replace('v', '') + ', saved Tuesday 11:40' },",
        "{ k:'Version', v: s.deal.ver.replace('v', '') + ', saved 7 March 2023' },",
        why="the version fact carries the file's own save date",
    )
    build.swap(
        "s.deal.checked.replace('Checked ', '').replace('Last checked ', '') + ', in 41 seconds' }",
        "s.deal.checked.replace('Checked ', '').replace('Last checked ', '') + ', in full' }",
        why="the read fact stops quoting a time nobody took",
    )


def _answers() -> str:
    """The chat's answers, written from the run.

    Each one is a real finding, a real cell, a real count. The
    « work » lines under each answer say what the answer rests on and
    where it stops — a chat that speaks about a model has to be able
    to say what it does not know, or the confident half is worthless.
    """
    rows = shaped(h7("v2.11"))
    material = [r for r in rows if r["sev"] == MATERIAL]

    def finding(row: dict, sev: str) -> str:
        #: The engine's detail sentence is built from clauses joined by
        #: « — ». Cutting on a character count leaves a half-written
        #: cell reference on screen, which reads like a bug; cutting on
        #: the clause keeps every line a finished sentence.
        clauses = [c.strip() for c in row["why"].split("—") if c.strip()]
        detail, out = "", []
        for clause in clauses:
            if len(detail) + len(clause) > 140 and out:
                break
            out.append(clause)
            detail = " — ".join(out)
        return "{ sev:'%s', t:'%s', ref:'%s', d:'%s' }" % (
            sev,
            row["what"].replace("'", "\\'"),
            row["ref"],
            detail.replace("'", "\\'").replace("—", "-"),
        )

    top = ",\n      ".join(finding(r, "Material") for r in material[:4])
    return f"""const AS_ANSWERS = [
  {{ cat:'Triage', match:/fix first|before sending|what should i|care about|look at first|priorit|material/i,
    working:'Ranking twenty-nine findings by what they touch',
    text:'Ten of the twenty-nine findings are material. Four of those are sums that leave out the row directly above them — the kind of gap that survives a review because the total still looks like a total. Here are the four I would open first.',
    findings:[
      {top}
    ],
    text2:'Which of these is a defect and which is a deliberate layout is not something I can tell you from the formulas alone. I can show you the cells; the reading is yours.',
    work:[
      'Ranked on the engine\\'s severity tiers, which are about what a wrong cell does to the sheet, not about money — no output value is attached to these cells.',
      'I explain what the engine found. I do not change the model.',
      'Four check families could not run over this workbook, so this is not a complete opinion.'
    ],
    chips:['Where does the 0.296 in I_Series come from?','What changed between v2.10 and v2.11?','What could not be checked?'] }},

  {{ cat:'Provenance', match:/where does|come from|trace|source of|0\\.296|AI282/i,
    working:'Following the cell back',
    text:'It does not come from anywhere. I_Series!AI282 — the FY2023 opex bonus — is the formula =0.2960127. The number is the formula, so there is nothing upstream of it to follow.',
    chain:CH([
      {{ what:'I_Series!AI282, FY2023 Opex bonus (+ve) / penalty (-ve)', value:'=0.2960127' }},
      {{ what:'The same cell in v2.10', value:'two typed numbers' }},
      {{ what:'A document that would settle it', value:'none attached' }}
    ]),
    text2:'It also changed between the two versions, which is why it reads as one finding cleared and one arriving rather than as an edit.',
    work:[
      'Read from the formula itself, not from a cached value.',
      'No source documents are attached to this project, so I cannot check the number against anything — only report that nothing stands behind it.'
    ],
    chips:['What else is typed into a formula?','What changed between v2.10 and v2.11?'] }},

  {{ cat:'Versions', match:/what changed|differen|since|v2\\.10|version/i,
    working:'Comparing the two versions cell by cell',
    text:'28,805 cells changed between v2.10 and v2.11, and 52,189 numbers came back different — more numbers moved than cells changed, because one rewritten formula moves every cell that reads it. On findings it was much quieter: two arrived, two cleared, and the total held at 29.',
    rows:[
      {{ what:'C_Revenue', value:'15,461 changed' }},
      {{ what:'O_FinStats - Vals', value:'2,831 changed' }},
      {{ what:'Scen 2', value:'2,600 changed' }},
      {{ what:'Scen 1', value:'2,513 changed' }},
      {{ what:'The other 44 sheets that changed', value:'5,400 changed' }}
    ],
    text2:'Fourteen of the 62 sheets are identical between the versions.',
    work:[
      'Both files were read in full: what each cell says, and the value Excel last saved in it.',
      'I cannot tell you which change caused which movement — that needs a recalculation, and the recalculation engine has not been validated against this workbook.'
    ],
    chips:['Which findings arrived with v2.11?','What could not be checked?'] }},

  {{ cat:'Hardcodes', match:/hardcode|typed|input|buried/i,
    working:'Collecting the numbers typed inside formulas',
    text:'Sixteen findings are numbers typed straight into the model with nothing standing behind them — a 0.5 inside the WACC uplift on C_TRS, an opex bonus of 0.2960127, a 5% equity issuance cost, and pairs of figures added together inside single formulas on I_Actuals.',
    text2:'None of them is material on its own. They matter together: each one is a number a reviewer cannot check without asking the author what it was meant to be.',
    work:[
      'Counted from the last read of v2.11 — fourteen numbers inside formulas, two typed over a calculated row.',
      'Whether each figure is right is not a question a formula reader can answer. Attach the documents and they become checkable.'
    ],
    chips:['Where does the 0.296 in I_Series come from?','What should I look at first?'] }},

  {{ cat:'Coverage', match:/could not|not checked|coverage|limits|cannot/i,
    working:'Listing what did not run',
    text:'Nineteen check families ran over 340,489 cells. Four could not run: behaviour under changed inputs, what each number measures, whether the inputs are right, and macros — this workbook carries none, so the last one is moot.',
    text2:'A number with no denominator is not a professional statement, which is why the report carries this on its face rather than in an export dialog.',
    work:[
      'The recalculation engine has not been validated against this workbook\\'s own stored values, and an engine that cannot reproduce the base case is not allowed to judge a changed one.',
      'Unit checking — monthly against annual, thousands against millions — is not shipped. It ships when its accuracy is measured.'
    ],
    chips:['What should I look at first?','What changed between v2.10 and v2.11?'] }}
];

const AS_FALLBACK = {{
  working:'Checking what I can answer from this project',
  text:'I answer from what the engine found in this project — 29 findings across 62 sheets of the H7 price control model, and a cell-by-cell comparison of v2.10 against v2.11. Ask about a finding, a cell, a number, or what changed between the versions.',
  chips:['What should I look at first?','Where does the 0.296 in I_Series come from?','What changed between v2.10 and v2.11?','What could not be checked?'],
  work:[
    'Grounded in the last read of this project. Anything outside it is not visible to me.',
    'I explain and investigate; I do not change the model.',
    'Four check families could not run, so I can be wrong by omission.'
  ]
}};"""


def the_chat_answers(build, audit) -> None:
    """The Ask panel accepts a question and never answers it.

    The message list renders `user`, `working`, `ask`, `run` and
    `verdict`. There is no branch for `answer` at all, so every
    question that does not happen to match a workflow trigger is
    swallowed: the question posts, the « working » line runs, and then
    the message is replaced by markup that does not exist. This was in
    the design as exported, not introduced here.

    Two things go in. The markup, in the frame the `ask` message
    already uses. And answers about this project rather than the
    invented one — each written off the engine's own output, each
    carrying what it does not know.
    """
    build.sub(
        r"const AS_ANSWERS = \[\n.*?\nconst AS_FALLBACK = \{\n.*?\n\};",
        _answers(),
        why="the chat answers about the model that was read",
        flags=16,
    )
    build.swap(
        "          hasChips: !!(m.chips && m.chips.length) && settled,",
        "          hasChain: !!(m.chain && m.chain.length) && settled,\n"
        "          hasChips: !!(m.chips && m.chips.length) && settled,",
        why="an answer with a chain of evidence can say so",
    )
    build.swap(
        '                <sc-if value="{{ m.isAsk }}" hint-placeholder-val="{{ false }}">\n'
        '                  <div style="display:flex; gap:18px; align-items:flex-start; '
        'animation:pcIn .3s ease both">',
        screens.ANSWER
        + '\n                <sc-if value="{{ m.isAsk }}" hint-placeholder-val="{{ false }}">\n'
        '                  <div style="display:flex; gap:18px; align-items:flex-start; '
        'animation:pcIn .3s ease both">',
        why="and an answer has somewhere to render",
    )


#: Every button with nothing behind it, and where it now goes. Four
#: of the six are for things that are not built; a sentence saying so
#: is a better answer than a click that does nothing. Two had a real
#: destination in the design already and simply were not wired to it.
NOT_YET = {
    "search": (
        "Nothing to search yet",
        "No chats have been had in this project, so there is nothing to search. "
        "Ask something and it becomes searchable from here.",
    ),
    "share": (
        "Sharing a chat is not built yet",
        "When it is, a shared chat will carry the findings it cites so the person "
        "reading it can check them against the cells. It will not carry the workbook.",
    ),
    "install": (
        "The Excel panel does not install from here yet",
        "The panel itself is built and runs against a real workbook, but the install "
        "path through Microsoft 365 is not wired into this screen. Today it is "
        "sideloaded from the runbook in the repository.",
    ),
    "mailbox": (
        "Choosing a mailbox is not built yet",
        "Reading a mailbox is how a forwarded document — a term sheet from counsel, a "
        "determination from the regulator — would reach a project without anyone saving "
        "it by hand. Nothing reads mail today, so choosing one would change nothing.",
    ),
    "manifest": (
        "There is no manifest link to copy yet",
        "An administrator pushes the panel to a team from a hosted manifest URL. The "
        "manifest exists; it is not hosted anywhere an admin could point at, so this "
        "would copy nothing.",
    ),
}


def no_button_does_nothing(build, audit) -> None:
    """Six buttons did nothing on click: Search chats, Share,
    Disconnect, Change, Install and Copy link.

    Two of them had a destination the design had already built and
    were simply not wired to it — Disconnect to the not-connected
    state, Change to the folder browser. The other four are for
    things that do not exist yet, and each now says which and why.
    """
    build.swap(
        '      <sc-if value="{{ coverageOpen }}"',
        screens.not_yet_sheet() + '      <sc-if value="{{ coverageOpen }}"',
        why="one sheet for the things that are not built",
    )
    openers = "\n".join(
        f"      soon{key.capitalize()}: () => this.setState({{ soonOpen: true, "
        f"soonTitle: {title!r}, soonWhy: {why!r} }}),".replace("'", "'")
        for key, (title, why) in NOT_YET.items()
    )
    build.swap(
        "      coverageOpen: !!s.coverageOpen,",
        "      soonOpen: !!s.soonOpen,\n"
        "      soonTitle: s.soonTitle,\n"
        "      soonWhy: s.soonWhy,\n"
        "      closeSoon: () => this.setState({ soonOpen: false }),\n"
        + openers
        + "\n      coverageOpen: !!s.coverageOpen,",
        why="each not-built button knows what it would have done",
    )
    #: Disconnect needs somewhere to land. The design's `conn` state
    #: drove only the first-run screen, so flipping it left this card
    #: still saying « Connected 14 July » — a button that appears to
    #: do nothing. The card now has both halves, and reconnecting
    #: brings it back.
    build.swap(
        '                <img src="92b9423e-60a0-4c08-9603-8aa94c951020" alt="" '
        'style="flex:0 0 20px; width:20px; height:20px; object-fit:contain">\n'
        '                <span style="flex:1; min-width:0">\n'
        '                  <span style="display:block; font-size:16.5px; font-weight:400; '
        'letter-spacing:-.012em">e.whitmore@harbourline.com</span>\n'
        '                  <span style="display:block; font-size:14px; color:#8f96a0; '
        'margin-top:2px">Connected 14 July</span>\n'
        "                </span>\n"
        '                <button style="flex:0 0 auto; border:0; background:transparent; '
        "font:inherit; font-size:14px; color:#e0322d; cursor:pointer; padding:4px 6px\">"
        "Disconnect</button>",
        '                <img src="92b9423e-60a0-4c08-9603-8aa94c951020" alt="" '
        'style="flex:0 0 20px; width:20px; height:20px; object-fit:contain">\n'
        '                <sc-if value="{{ msOn }}" hint-placeholder-val="{{ true }}">\n'
        '                <span style="flex:1; min-width:0">\n'
        '                  <span style="display:block; font-size:16.5px; font-weight:400; '
        'letter-spacing:-.012em">e.whitmore@harbourline.com</span>\n'
        '                  <span style="display:block; font-size:14px; color:#8f96a0; '
        'margin-top:2px">Connected 14 July</span>\n'
        "                </span>\n"
        '                <button sc-camel-on-click="{{ disconnectMs }}" style="flex:0 0 auto; '
        "border:0; background:transparent; font:inherit; font-size:14px; color:#e0322d; "
        'cursor:pointer; padding:4px 6px">Disconnect</button>\n'
        "                </sc-if>\n"
        '                <sc-if value="{{ msOff }}" hint-placeholder-val="{{ false }}">\n'
        '                <span style="flex:1; min-width:0">\n'
        '                  <span style="display:block; font-size:16.5px; font-weight:400; '
        'letter-spacing:-.012em; color:#8f96a0">No account connected</span>\n'
        '                  <span style="display:block; font-size:14px; color:#8f96a0; '
        'margin-top:2px">No folder is watched and nothing syncs. Files can still be '
        "dropped in by hand.</span>\n"
        "                </span>\n"
        '                <button sc-camel-on-click="{{ connectMs }}" style="flex:0 0 auto; '
        "border:0; background:transparent; font:inherit; font-size:14px; color:#0060d0; "
        'cursor:pointer; padding:4px 6px">Connect</button>\n'
        "                </sc-if>",
        why="Disconnect leaves the card disconnected, and Connect brings it back",
    )
    build.swap(
        "      soonOpen: !!s.soonOpen,",
        "      msOn: !s.msGone,\n"
        "      msOff: !!s.msGone,\n"
        "      disconnectMs: () => this.setState({ msGone: true }),\n"
        "      connectMs: () => this.setState({ msGone: false }),\n"
        "      soonOpen: !!s.soonOpen,",
        why="the connection card knows whether it is connected",
    )
    #: Two leftovers in the opening state: a folder path into the
    #: invented firm's SharePoint, and an invitation pre-ticked for a
    #: project that does not exist.
    build.swap(
        "ndPath: ['Investment Banking', 'Deals'], ndPicks: []",
        "ndPath: [], ndPicks: []",
        why="the browser's opening path is the top of what can be seen",
    )
    build.swap(
        "invitePicks: ['Project Falcon']",
        "invitePicks: []",
        why="an invitation starts with nothing ticked",
    )
    #: There are two identical « Change » buttons; the anchor carries
    #: the label above it so the right one is wired.
    build.swap(
        'Folders Ances watches</span>\n                '
        '<button style="flex:0 0 auto; border:0; background:transparent; font:inherit; '
        'font-size:14px; color:#2b6cf5; cursor:pointer; padding:4px 6px">Change</button>',
        'Folders Ances watches</span>\n                '
        '<button sc-camel-on-click="{{ openNew }}" style="flex:0 0 auto; border:0; '
        "background:transparent; font:inherit; font-size:14px; color:#2b6cf5; "
        'cursor:pointer; padding:4px 6px">Change</button>',
        why="Change opens the folder browser it is asking about",
    )
    build.swap(
        'Mailbox Ances can read</span>\n                '
        '<button style="flex:0 0 auto; border:0; background:transparent; font:inherit; '
        'font-size:14px; color:#2b6cf5; cursor:pointer; padding:4px 6px">Change</button>',
        'Mailbox Ances can read</span>\n                '
        '<button sc-camel-on-click="{{ soonMailbox }}" style="flex:0 0 auto; border:0; '
        "background:transparent; font:inherit; font-size:14px; color:#2b6cf5; "
        'cursor:pointer; padding:4px 6px">Change</button>',
        why="the mailbox Change says nothing reads mail yet",
    )
    build.swap(
        '<button style="flex:0 0 auto; border:0; background:#1f2937; color:#fff; '
        "border-radius:10px; height:38px; padding:0 18px; font:inherit; font-size:14px; "
        'font-weight:500; cursor:pointer" style-hover="background:#2f3b4c">Install</button>',
        '<button sc-camel-on-click="{{ soonInstall }}" style="flex:0 0 auto; border:0; '
        "background:#1f2937; color:#fff; border-radius:10px; height:38px; padding:0 18px; "
        'font:inherit; font-size:14px; font-weight:500; cursor:pointer" '
        'style-hover="background:#2f3b4c">Install</button>',
        why="Install says why it cannot",
    )
    build.swap(
        '<button style="flex:0 0 auto; border:0; background:transparent; font:inherit; '
        'font-size:14px; color:#2b6cf5; cursor:pointer; padding:4px 6px">Copy link</button>',
        '<button sc-camel-on-click="{{ soonManifest }}" style="flex:0 0 auto; border:0; '
        "background:transparent; font:inherit; font-size:14px; color:#2b6cf5; "
        'cursor:pointer; padding:4px 6px">Copy link</button>',
        why="Copy link says there is nothing to copy",
    )
    build.swap(
        '<button title="Share" style="flex:0 0 auto; pointer-events:auto;',
        '<button sc-camel-on-click="{{ soonShare }}" title="Share" '
        'style="flex:0 0 auto; pointer-events:auto;',
        why="Share says it is not built",
    )
    build.swap(
        '            <button style="flex:0 0 auto; display:flex; align-items:center; '
        "gap:13px; width:100%; text-align:left; border:0; background:transparent; "
        "border-radius:10px; font:inherit; font-size:15px; letter-spacing:-.008em; "
        'color:#9aa1ab; cursor:pointer; padding:11px 10px; margin-bottom:8px"',
        '            <button sc-camel-on-click="{{ soonSearch }}" '
        'style="flex:0 0 auto; display:flex; align-items:center; '
        "gap:13px; width:100%; text-align:left; border:0; background:transparent; "
        "border-radius:10px; font:inherit; font-size:15px; letter-spacing:-.008em; "
        'color:#9aa1ab; cursor:pointer; padding:11px 10px; margin-bottom:8px"',
        why="Search chats says there is nothing to search",
    )

    #: There is nothing to change about folders and mailboxes while
    #: no account is connected, so those two rows go with it.
    folders = (
        '              <div style="border-top:.5px solid #f4f3f5; display:flex; '
        'align-items:center; gap:14px; padding:18px 22px">\n'
        '                <span style="flex:1; min-width:0; font-size:16.5px; '
        'font-weight:400; letter-spacing:-.012em">Folders Ances watches</span>'
    )
    mailbox_end = (
        '                <button sc-camel-on-click="{{ soonMailbox }}" style="flex:0 0 auto; '
        "border:0; background:transparent; font:inherit; font-size:14px; color:#2b6cf5; "
        'cursor:pointer; padding:4px 6px">Change</button>\n              </div>'
    )
    build.swap(
        folders,
        '              <sc-if value="{{ msOn }}" hint-placeholder-val="{{ true }}">\n' + folders,
        why="the folder and mailbox rows belong to a connected account",
    )
    build.swap(mailbox_end, mailbox_end + "\n              </sc-if>",
               why="and close with it")


def team_of_one(build, audit) -> None:
    """Three colleagues who do not exist, each assigned to models
    that do not exist. One workspace, one person in it."""
    build.sub(
        r"      team: \[\n.*?\n      \]\.map",
        "      team: [\n"
        "        { name:'Elena Whitmore', initials:'EW', role:'You', "
        "models:'CAA H7 price control', bg:'linear-gradient(150deg,#d8e6ff,#b9cdf5)', "
        "fg:'#2c4a80' }\n"
        "      ].map",
        why="the team is the one account using this workspace",
        flags=16,
    )
    #: A list of one needs a line saying it is a list of one, or it
    #: reads as a page that failed to load.
    build.swap(
        '            <div style="font-size:13px; color:#a2a29c; padding:0 2px 14px">'
        "Who's on the team</div>",
        '            <div style="font-size:13px; color:#a2a29c; padding:0 2px 6px">'
        "Who's on the team</div>\n"
        '            <div style="font-size:13px; color:#a2a29c; padding:0 2px 14px; '
        'max-width:60ch; line-height:1.5">Just you, for now. Anyone you invite sees the '
        "projects you name in the invitation, and nothing else.</div>",
        why="a team of one says so, rather than looking like a page that failed to load",
    )
    build.sub(
        r"'Six models kept ready\. Northbank has six checks failing\.'",
        "'One model kept ready. Ten material findings open.'",
        why="the workspace summary counts what is in the workspace",
    )


def _cut_between(page: str, head: str, tail: str) -> tuple[str, int]:
    """Cut from `head` up to (not including) `tail`, on exact anchors."""
    start = page.index(head)
    end = page.index(tail, start)
    return page[:start] + page[end:], end - start


def overview_stops_repeating_findings(build, audit) -> None:
    """Overview already carried the whole findings table below its
    chart — the same table the Findings tab exists to hold. Two
    copies of one list is how a reader loses the thread, so Overview
    keeps the summary and the shortlist, and the table stays where it
    belongs."""
    head = (
        '\n          <div>\n            <div style="padding:40px 2px 16px">\n'
        '              <span style="font-size:13px; color:#a2a29c">Findings</span>'
    )
    tail = "\n\n        </div>\n        \n"
    build.page, cut = _cut_between(build.page, head, tail)
    build.log.append(f"Overview no longer repeats the findings table ({cut:,} chars)")




#: Order matters: the Overview cut runs against the design's original
#: anchors, before anything else rewrites that region.
ALL = [
    overview_stops_repeating_findings,
    close_the_overview_block,
    four_tabs,
    findings_from_h7,
    project_is_a_real_model,
    real_summary,
    fill_overview,
    build_versions_tab,
    build_documents_tab,
    coverage_and_wiring,
    honest_header,
    honest_trend,
    accurate_summary,
    version_comparison_card,
    one_real_project,
    ask_knows_where_it_is,
    check_a_model_is_what_was_run,
    the_engine_can_refuse,
    the_browser_lists_real_files,
    the_run_counts_the_run,
    the_last_stale_numbers,
    one_model_everywhere_else,
    the_chat_answers,
    no_button_does_nothing,
    compare_has_a_result,
    team_of_one,
]
