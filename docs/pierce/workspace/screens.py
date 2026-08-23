"""New markup, written in the founder's own styles.

Nothing here invents a visual language: every value — the 23px/600
title, the gradient section heading, the 5px blue bullet, the 999px
chip, the .5px #f0eff1 rule, the 14px/#86868b secondary line — is
lifted from the build being extended. What is new is only which
blocks exist, and they exist because the Ambre document says the
report must carry them.
"""

#: The gradient section heading the design uses for « Summary of the
#: check ». Reused so a new section cannot look like a bolt-on.
HEADING = (
    'font-size:16.5px; font-weight:600; letter-spacing:-.014em; '
    "padding:30px 0 11px; background:linear-gradient(96deg,#0060d0 0%,#3b6ee0 42%,"
    "#5b52e0 100%); -webkit-background-clip:text; background-clip:text; "
    "-webkit-text-fill-color:transparent"
)
ROW = "display:grid; grid-template-columns:1fr auto; gap:16px; align-items:center; padding:13px 2px"
RULE = "border-top:.5px solid #f0eff1"
SECOND = "font-size:13px; color:#8f96a0; letter-spacing:-.006em"
BODY = "font-size:14.5px; color:#1d1d1f; letter-spacing:-.01em; line-height:1.5"
PILL = (
    "display:inline-flex; align-items:center; gap:7px; border:1px solid rgba(16,22,35,.06); "
    "background:#fff; border-radius:999px; padding:7px 14px; font-size:13px; color:#3d4048; "
    "white-space:nowrap; cursor:pointer"
)


def coverage_line(meta: dict) -> str:
    """« What was checked, and what was not » — the sentence the
    Ambre document calls non-negotiable, on the face of the report
    rather than buried in an export dialog."""
    return f"""
          <div style="display:flex; align-items:baseline; gap:10px; flex-wrap:wrap">
            <span style="{SECOND}">{meta['ran']} check families ran over {meta['cells']} cells in {meta['seconds']}. {meta['notrun']} could not run.</span>
            <span sc-camel-on-click="{{{{ openCoverage }}}}" style="font-size:13px; color:#0060d0; cursor:pointer">What was not checked</span>
          </div>"""


def needs_you(items: list[dict]) -> str:
    """The only part of Overview with buttons: one line per thing a
    person must actually do."""
    rows = "".join(
        f"""
            <div style="{ROW}; {RULE if i else 'border-top:0'}">
              <div style="min-width:0">
                <div style="{BODY}">{it['what']}</div>
                <div style="{SECOND}; margin-top:3px">{it['where']}</div>
              </div>
              <span sc-camel-on-click="{{{{ {it['go']} }}}}" style="{PILL}">{it['action']}</span>
            </div>"""
        for i, it in enumerate(items)
    )
    return f"""
          <div>
            <div style="{HEADING}">What needs you</div>
            <div>{rows}
            </div>
          </div>"""


def top_findings(items: list[dict]) -> str:
    """The three or four a partner would be embarrassed by, with the
    door through to the rest."""
    rows = "".join(
        f"""
            <div sc-camel-on-click="{{{{ goFindings }}}}" style="{ROW}; {RULE if i else 'border-top:0'}; cursor:pointer">
              <div style="min-width:0; display:flex; align-items:baseline; gap:11px">
                <span style="flex:0 0 auto; width:5px; height:5px; border-radius:50%; background:{it['dot']}"></span>
                <span style="{BODY}">{it['what']}</span>
              </div>
              <span style="{SECOND}">{it['where']}</span>
            </div>"""
        for i, it in enumerate(items)
    )
    return f"""
          <div>
            <div style="{HEADING}">Worth looking at first</div>
            <div>{rows}
            </div>
            <div sc-camel-on-click="{{{{ goFindings }}}}" style="font-size:13px; color:#0060d0; cursor:pointer; padding-top:13px">All findings</div>
          </div>"""


def papers_band(sources: str, deliverables: str) -> str:
    """Documents in, model, deliverables out — the shape of the deal
    in one line that survives thirty documents."""
    return f"""
          <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding:2px 0">
            <span sc-camel-on-click="{{{{ goDocuments }}}}" style="{PILL}">{sources}</span>
            <span style="{SECOND}">→</span>
            <span style="{PILL}; border-color:rgba(16,22,35,.1)">{{{{ mdFile }}}}</span>
            <span style="{SECOND}">→</span>
            <span sc-camel-on-click="{{{{ goDocuments }}}}" style="{PILL}">{deliverables}</span>
          </div>"""


def activity(items: list[dict]) -> str:
    rows = "".join(
        f"""
            <div style="{ROW}; {RULE if i else 'border-top:0'}">
              <span style="{BODY}">{it['what']}</span>
              <span style="{SECOND}">{it['when']}</span>
            </div>"""
        for i, it in enumerate(items)
    )
    return f"""
          <div>
            <div style="{HEADING}">Lately</div>
            <div>{rows}
            </div>
          </div>"""


def versions_tab(rows: list[dict], delta: dict) -> str:
    """The Watch: what changed between two versions, and what it did
    to the findings. The tab that was « next up »."""
    entries = "".join(
        f"""
            <div style="{ROW}; {RULE if i else 'border-top:0'}">
              <div style="min-width:0">
                <div style="{BODY}">{v['tag']} — {v['what']}</div>
                <div style="{SECOND}; margin-top:3px">{v['when']} · {v['findings']}</div>
              </div>
              <span style="{SECOND}">{v['change']}</span>
            </div>"""
        for i, v in enumerate(rows)
    )
    news = "".join(
        f"""<div style="{ROW}; {RULE if i else 'border-top:0'}">
              <div style="min-width:0; display:flex; align-items:baseline; gap:11px">
                <span style="flex:0 0 auto; width:5px; height:5px; border-radius:50%; background:{d['dot']}"></span>
                <span style="{BODY}">{d['what']}</span>
              </div><span style="{SECOND}">{d['where']}</span>
            </div>"""
        for i, d in enumerate(delta["rows"])
    )
    return f"""
        <sc-if value="{{{{ pjTabVersions }}}}" hint-placeholder-val="{{{{ false }}}}">
        <div style="width:100%; max-width:1040px; display:flex; flex-direction:column; gap:44px; padding-bottom:44px">
          <div>
            <div style="display:flex; align-items:center; gap:14px">
              <span style="flex:0 0 auto; font-size:23px; font-weight:600; letter-spacing:-.022em; line-height:1.2">What changed</span>
              <span style="flex:0 0 auto; color:#c8790a; font-size:13px; font-weight:500; white-space:nowrap">{delta['headline']}</span>
            </div>
            <div style="font-size:14px; color:#86868b; line-height:1.55; margin-top:8px; max-width:82ch; text-wrap:pretty">{delta['sentence']}</div>
          </div>
          <div>
            <div style="{HEADING}">Since the last version</div>
            <div>{news}
            </div>
          </div>
          <div>
            <div style="{HEADING}">Every version</div>
            <div>{entries}
            </div>
          </div>
        </div>
        </sc-if>
"""


def empty(headline: str, why: str, link: str = "", go: str = "") -> str:
    """An honest empty state: what is not here, and what would put it
    here. Never a spinner, never a fake row."""
    door = (
        f"""
              <div sc-camel-on-click="{{{{ {go} }}}}" style="font-size:13px; color:#0060d0; cursor:pointer; padding-top:12px">{link}</div>"""
        if link
        else ""
    )
    return f"""
            <div style="border:.5px solid #f0eff1; border-radius:12px; padding:20px 22px 22px; background:#fbfbfc">
              <div style="{BODY}">{headline}</div>
              <div style="{SECOND}; margin-top:6px; max-width:72ch; line-height:1.55">{why}</div>{door}
            </div>"""


def documents_tab(files: list[dict], typed: dict) -> str:
    """Papers in, the model, papers out — the tab that replaced the
    seven-document diagram.

    The diagram drew a project with seven documents around it. This
    project has none: two versions of one workbook and nothing else.
    Drawing the diagram anyway would be drawing documents that do not
    exist, so the tab says what is true and names what attaching one
    would buy.
    """
    rows = "".join(
        f"""
            <div style="{ROW}; {RULE if i else 'border-top:0'}">
              <div style="min-width:0">
                <div style="{BODY}">{f['name']}</div>
                <div style="{SECOND}; margin-top:3px">{f['facts']}</div>
              </div>
              <span style="{SECOND}">{f['tag']}</span>
            </div>"""
        for i, f in enumerate(files)
    )
    return f"""
        <sc-if value="{{{{ pjTabSources }}}}" hint-placeholder-val="{{{{ false }}}}">
        <div style="width:100%; max-width:1040px; display:flex; flex-direction:column; gap:44px; padding-bottom:44px">
          <div>
            <div style="display:flex; align-items:center; gap:14px">
              <span style="flex:0 0 auto; font-size:23px; font-weight:600; letter-spacing:-.022em; line-height:1.2">Papers</span>
              <span style="flex:0 0 auto; color:#c8790a; font-size:13px; font-weight:500; white-space:nowrap">Nothing attached</span>
            </div>
            <div style="font-size:14px; color:#86868b; line-height:1.55; margin-top:8px; max-width:82ch; text-wrap:pretty">{typed['sentence']}</div>
          </div>
          <div>
            <div style="{HEADING}">The model</div>
            <div>{rows}
            </div>
          </div>
          <div>
            <div style="{HEADING}">Papers in</div>
            {empty(
                "Nothing is attached to this project.",
                "Attach the determination, the licence, the RAB roll-forward — whatever a "
                "typed number is supposed to come from. Until one is here, a number typed "
                "into a formula can be reported but not checked against anything.",
                typed["link"],
                "goFindings",
            )}
          </div>
          <div>
            <div style="{HEADING}">Papers out</div>
            {empty(
                "Nothing has been checked against this model.",
                "A deck or a memo reads figures out of the model and goes stale the moment "
                "the model moves. Checking one against the workbook is not built yet, so "
                "nothing here is being watched — this section stays empty rather than "
                "pretending otherwise.",
            )}
          </div>
        </div>
        </sc-if>
"""


def compare_result(diff: dict) -> str:
    """The output the Compare tab never had.

    « Find differences » navigated to the chat. This is the screen it
    should have gone to, and every number on it comes from reading
    the two workbooks: what changed, how, and where. What it will not
    do is claim a change *caused* a movement — that needs a
    recalculation, and the refusal is on the screen rather than in a
    footnote.
    """
    kinds = "".join(
        f"""
            <div style="{ROW}; {RULE if i else 'border-top:0'}">
              <span style="{BODY}">{k['what']}</span>
              <span style="font-family:'JetBrains Mono',ui-monospace,monospace; font-size:12.5px; letter-spacing:0; color:#6b7280">{k['n']}</span>
            </div>"""
        for i, k in enumerate(diff["kinds"])
    )
    sheets = "".join(
        f"""
            <div style="{ROW}; {RULE if i else 'border-top:0'}">
              <span style="{BODY}">{s['sheet']}</span>
              <span style="{SECOND}">{s['what']}</span>
            </div>"""
        for i, s in enumerate(diff["sheets"])
    )
    return f"""
          <sc-if value="{{{{ cmpDone }}}}" hint-placeholder-val="{{{{ false }}}}">
          <div style="width:100%; max-width:1040px; margin:0 auto; display:flex; flex-direction:column; gap:44px; padding-bottom:44px">
            <div>
              <div style="display:flex; align-items:center; gap:14px">
                <span style="flex:0 0 auto; font-size:23px; font-weight:600; letter-spacing:-.022em; line-height:1.2">{diff['headline']}</span>
                <span style="flex:0 0 auto; color:#c8790a; font-size:13px; font-weight:500; white-space:nowrap">{diff['chip']}</span>
              </div>
              <div style="font-size:14px; color:#86868b; line-height:1.55; margin-top:8px; max-width:82ch; text-wrap:pretty">{diff['sentence']}</div>
            </div>
            <div>
              <div style="{HEADING}">How they changed</div>
              <div>{kinds}
              </div>
            </div>
            <div>
              <div style="{HEADING}">Where</div>
              <div>{sheets}
              </div>
              <div style="{SECOND}; padding-top:13px">{diff['rest']}</div>
            </div>
            <div>
              <div style="{HEADING}">What this does not tell you</div>
              {empty(diff['refusal'], diff['refusalWhy'])}
            </div>
            <div>
              <span sc-camel-on-click="{{{{ cmpClear }}}}" style="{PILL}">Compare two other workbooks</span>
            </div>
          </div>
          </sc-if>
"""


def refused(file: str, reason: str, others: list[dict]) -> str:
    """« The engine refused this file, and why » — drawn.

    Every sentence on this screen came out of the shipped reader when
    it was handed the file in question. A refusal screen that invents
    its own wording would be describing a product that does not
    exist; this one quotes the one that does.
    """
    rows = "".join(
        f"""
              <div style="{ROW}; {RULE if i else 'border-top:0'}">
                <div style="min-width:0">
                  <div style="{BODY}">{o['case'][0].upper() + o['case'][1:]}</div>
                  <div style="{SECOND}; margin-top:3px; max-width:74ch; line-height:1.5">{o['reason']}</div>
                </div>
              </div>"""
        for i, o in enumerate(others)
    )
    return f"""
        <sc-if value="{{{{ cRefused }}}}" hint-placeholder-val="{{{{ false }}}}">
        <div style="flex:1; min-height:0; overflow:auto; padding:28px 40px 40px; display:flex; justify-content:center; align-items:flex-start">
          <div style="width:100%; max-width:1040px; display:flex; flex-direction:column; gap:44px; padding-bottom:44px">
            <div>
              <div style="display:flex; align-items:center; gap:14px">
                <span style="flex:0 0 auto; font-size:23px; font-weight:600; letter-spacing:-.022em; line-height:1.2">This file could not be read</span>
                <span style="flex:0 0 auto; color:#c9302c; font-size:13px; font-weight:500; white-space:nowrap">Nothing was checked</span>
              </div>
              <div style="font-size:14px; color:#86868b; line-height:1.55; margin-top:8px; max-width:82ch; text-wrap:pretty">Nothing ran, so there is no result and no coverage — not a clean model, not an empty one. {file} is where it stopped.</div>
            </div>
            <div>
              <div style="{HEADING}">What the reader said</div>
              <div style="border:.5px solid #f0eff1; border-radius:12px; padding:20px 22px; background:#fbfbfc">
                <div style="{BODY}">{reason}</div>
              </div>
            </div>
            <div>
              <div style="{HEADING}">The other ways a file comes back refused</div>
              <div>{rows}
              </div>
            </div>
            <div>
              <span sc-camel-on-click="{{{{ chkBack }}}}" style="{PILL}">Choose another file</span>
            </div>
          </div>
        </div>
        </sc-if>
"""


def nothing_here(headline: str, why: str) -> str:
    """A centred empty state for a panel that has no rows — the chat
    history before anything has been asked."""
    return f"""
              <div style="display:flex; flex-direction:column; gap:7px; padding:22px 4px">
                <span style="font-size:14px; color:#4a4f57; letter-spacing:-.01em">{headline}</span>
                <span style="font-size:13px; color:#a2a29c; line-height:1.5; text-wrap:pretty">{why}</span>
              </div>"""


#: The answer block for the Ask panel.
#:
#: Every prop below is already computed by the design's own message
#: map — `shown` (which carries the typing animation), `findings`,
#: `chain`, `rows`, `chips`, `work`. What was missing was the markup:
#: the list renders `user`, `working`, `ask`, `run` and `verdict`, and
#: nothing at all for `answer`, so any question that did not trigger a
#: workflow was accepted and silently swallowed. The frame here is the
#: one the `ask` message already uses — the serif mark, the 18px gap,
#: the single column — so a plain answer sits in the same conversation
#: as a workflow answer rather than looking like a second product.
ANSWER = """
                <sc-if value="{{ m.isAnswer }}" hint-placeholder-val="{{ false }}">
                  <div style="display:flex; gap:18px; align-items:flex-start; animation:pcIn .3s ease both">
                    <span style="flex:0 0 18px; width:18px; font-family:'Bodoni Moda',Didot,Georgia,serif; font-size:16px; line-height:1; color:#15171b; margin-top:6px">A</span>
                    <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:20px">
                      <span style="font-size:16px; line-height:1.7; letter-spacing:-.006em; color:#22252b; max-width:64ch; text-wrap:pretty">{{ m.shown }}</span>

                      <sc-if value="{{ m.hasFindings }}" hint-placeholder-val="{{ false }}">
                        <div style="display:flex; flex-direction:column">
                          <sc-for list="{{ m.findings }}" as="f" hint-placeholder-count="3">
                            <div style="display:flex; align-items:flex-start; gap:13px; border-top:{{ f.rule }}; padding:13px 2px">
                              <span style="flex:0 0 auto; display:inline-flex; align-items:center; height:20px; padding:0 9px; border-radius:999px; background:{{ f.sevBg }}; color:{{ f.sevFg }}; font-size:12px; letter-spacing:-.004em">{{ f.sev }}</span>
                              <span style="flex:1; min-width:0; display:flex; flex-direction:column; gap:3px">
                                <span style="font-size:14.5px; color:#1d1d1f; letter-spacing:-.01em; line-height:1.45; text-wrap:pretty">{{ f.t }}</span>
                                <span style="font-size:13px; color:#8f96a0; line-height:1.5; text-wrap:pretty">{{ f.d }}</span>
                              </span>
                              <span style="flex:0 0 auto; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:11.5px; letter-spacing:0; color:#9aa1ab; white-space:nowrap">{{ f.ref }}</span>
                            </div>
                          </sc-for>
                        </div>
                      </sc-if>

                      <sc-if value="{{ m.hasChain }}" hint-placeholder-val="{{ false }}">
                        <div style="background:#fbfbfc; border-radius:12px; box-shadow:0 0 0 .5px rgba(16,22,35,.07); overflow:hidden">
                          <sc-for list="{{ m.chain }}" as="c" hint-placeholder-count="3">
                            <div style="display:flex; align-items:baseline; gap:12px; border-top:{{ c.rule }}; padding:11px 15px">
                              <span style="flex:0 0 auto; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:11.5px; letter-spacing:0; color:#aeaeb2">{{ c.step }}</span>
                              <span style="flex:1; min-width:0; font-size:13.5px; color:#3d4048; line-height:1.5; text-wrap:pretty">{{ c.what }}</span>
                              <span style="flex:0 0 auto; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:12px; letter-spacing:0; color:#6b7280; white-space:nowrap">{{ c.value }}</span>
                            </div>
                          </sc-for>
                        </div>
                      </sc-if>

                      <sc-if value="{{ m.hasRows }}" hint-placeholder-val="{{ false }}">
                        <div style="display:flex; flex-direction:column">
                          <sc-for list="{{ m.rows }}" as="r" hint-placeholder-count="3">
                            <div style="display:grid; grid-template-columns:1fr auto; gap:16px; align-items:baseline; border-top:{{ r.rule }}; padding:11px 2px">
                              <span style="min-width:0; font-size:14px; color:#3d4048; letter-spacing:-.008em">{{ r.what }}</span>
                              <span style="font-family:'JetBrains Mono',ui-monospace,monospace; font-size:12.5px; letter-spacing:0; color:#6b7280; white-space:nowrap">{{ r.value }}</span>
                            </div>
                          </sc-for>
                        </div>
                      </sc-if>

                      <sc-if value="{{ m.hasText2 }}" hint-placeholder-val="{{ false }}">
                        <span style="font-size:15px; line-height:1.65; color:#4a4f57; max-width:64ch; text-wrap:pretty">{{ m.text2 }}</span>
                      </sc-if>

                      <sc-if value="{{ m.hasWork }}" hint-placeholder-val="{{ false }}">
                        <div style="display:flex; flex-direction:column; gap:10px">
                          <button sc-camel-on-click="{{ m.toggleWork }}" style="align-self:flex-start; display:flex; align-items:center; gap:7px; border:0; background:transparent; padding:0; font:inherit; font-size:13px; color:#8f96a0; cursor:pointer">
                            <svg width="11" height="11" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="transform:{{ m.workRot }}; transition:transform .16s ease"><polyline points="9,5 16,12 9,19"></polyline></svg>
                            <span>{{ m.workLabel }}</span>
                          </button>
                          <sc-if value="{{ m.workOpen }}" hint-placeholder-val="{{ false }}">
                            <div style="display:flex; flex-direction:column; gap:8px; border-left:2px solid #eceaec; padding:2px 0 2px 14px">
                              <sc-for list="{{ m.work }}" as="w" hint-placeholder-count="3">
                                <span style="font-size:13px; color:#8f96a0; line-height:1.55; text-wrap:pretty">{{ w.t }}</span>
                              </sc-for>
                            </div>
                          </sc-if>
                        </div>
                      </sc-if>

                      <sc-if value="{{ m.hasChips }}" hint-placeholder-val="{{ false }}">
                        <div style="display:flex; flex-wrap:wrap; gap:9px">
                          <sc-for list="{{ m.chips }}" as="c" hint-placeholder-count="3">
                            <button sc-camel-on-click="{{ c.ask }}" style="border:1px solid rgba(16,22,35,.08); background:#fff; border-radius:999px; padding:8px 14px; font:inherit; font-size:13px; color:#3d4048; cursor:pointer; text-align:left" style-hover="background:#fbfbfa">{{ c.t }}</button>
                          </sc-for>
                        </div>
                      </sc-if>
                    </div>
                  </div>
                </sc-if>
"""


def coverage_sheet(items: list[dict]) -> str:
    """What could not be checked, and why — each refusal naming what
    would resolve it, per the Ambre document."""
    rows = "".join(
        f"""
              <div style="{ROW}; {RULE if i else 'border-top:0'}">
                <div style="min-width:0">
                  <div style="{BODY}">{c['label']}</div>
                  <div style="{SECOND}; margin-top:3px; max-width:70ch; line-height:1.5">{c['why']}</div>
                </div>
                <span style="{SECOND}">{c['count']}</span>
              </div>"""
        for i, c in enumerate(items)
    )
    return f"""
      <sc-if value="{{{{ coverageOpen }}}}" hint-placeholder-val="{{{{ false }}}}">
      <div sc-camel-on-click="{{{{ closeCoverage }}}}" style="position:fixed; inset:0; z-index:70; display:flex; align-items:center; justify-content:center; background:rgba(16,20,28,.3); backdrop-filter:blur(3px); -webkit-backdrop-filter:blur(3px)">
        <div style="width:min(680px,92vw); max-height:80vh; overflow:auto; background:#fff; border-radius:24px; box-shadow:0 1px 2px rgba(16,22,35,.05), 0 24px 60px rgba(16,22,35,.18); padding:30px 34px 34px">
          <div style="font-size:17.5px; font-weight:600; letter-spacing:-.014em">What could not be checked</div>
          <div style="font-size:14px; color:#86868b; line-height:1.55; margin-top:8px; text-wrap:pretty">Every check that did not run, and what would let it. A number with no denominator is not a professional statement.</div>
          <div style="margin-top:20px">{rows}
          </div>
        </div>
      </div>
      </sc-if>
"""


def version_strip(rows: list[dict], note: str) -> str:
    """Two versions is not a trend — it is a comparison.

    A five-point curve drawn from two readings would be an invention,
    so the card keeps its shape and shows what is actually known:
    each severity, before and after, and what moved.
    """
    lines = "".join(
        f"""
                <div style="display:grid; grid-template-columns:150px 1fr auto; gap:16px; align-items:center; padding:14px 4px; {'border-top:.5px solid #f0eff1' if i else ''}">
                  <div style="display:flex; align-items:center; gap:9px">
                    <span style="width:7px; height:7px; border-radius:50%; background:{r['dot']}"></span>
                    <span style="font-size:14px; color:#3d4048">{r['label']}</span>
                  </div>
                  <div style="height:6px; background:#f4f5f7; border-radius:999px; overflow:hidden">
                    <div style="width:{r['pct']}%; height:100%; background:{r['dot']}; opacity:.55; border-radius:999px"></div>
                  </div>
                  <div style="font-family:'JetBrains Mono',ui-monospace,monospace; font-size:12.5px; letter-spacing:0; color:#6b7280; white-space:nowrap">{r['before']} → {r['after']}</div>
                </div>"""
        for i, r in enumerate(rows)
    )
    return f"""<div style="padding:6px 2px 2px">{lines}
              </div>
              <div style="font-size:13px; color:#8f96a0; padding:14px 6px 2px; letter-spacing:-.006em">{note}</div>"""
