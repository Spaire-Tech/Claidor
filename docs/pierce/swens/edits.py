"""The edits, each named for what it fixes and why it exists.

Every function takes the build and raises if it cannot find what it
was written to change — a silent no-op would leave the design saying
something we think we changed.

The standing rule: the design is the founder's. These edits wire
controls that had nothing behind them and add branches that were
missing. None of them removes anything drawn; `build.py` prints a
removal report so that claim is checkable rather than promised.
"""

import screens

#: The block every finding-row edit is scoped to.
FINDINGS = '<sc-if value="{{ pjTabFindings }}"'


#: --- the chat -----------------------------------------------------


def the_chat_answers(build) -> None:
    """The Ask panel accepts a question and never answers it.

    The founder designed nine exchanges and all nine are in
    `REV_ASKS` already — « Should I run the Model Review Workflow, or
    work through this model from scratch? », the Version Comparison,
    the Targeted Check, and the rest. Those render, through `isAsk`.

    What has no branch is the other half. A question matching no
    workflow falls to `AS_ANSWERS`, becomes a message with
    `role:'answer'`, and the message list has no case for that role:
    the question posts, the working line runs, and the reply is
    replaced by markup that does not exist. Verified by asking
    « Where does the 4.1% come from? » and watching five seconds of
    nothing.

    Every prop the answer needs is already computed. Only `hasChain`
    was missing, and the markup.
    """
    build.swap(
        "          hasChips: !!(m.chips && m.chips.length) && settled,",
        "          hasChain: !!(m.chain && m.chain.length) && settled,\n"
        "          hasChips: !!(m.chips && m.chips.length) && settled,",
        why="an answer carrying a chain of evidence can say so",
    )
    build.swap(
        '                <sc-if value="{{ m.isAsk }}" hint-placeholder-val="{{ false }}">',
        screens.ANSWER
        + '                <sc-if value="{{ m.isAsk }}" hint-placeholder-val="{{ false }}">',
        why="and an answer has somewhere to render",
    )


#: --- the project page ---------------------------------------------


def recheck_actually_rechecks(build) -> None:
    """`reCheck: () => {}` — the most prominent button on the project
    page did nothing at all.

    The founder's design already owns a run: `beginRun(n)` walks a
    step every 950ms and `RUN(s).steps` names them. That machinery
    drove the check view, which the new dock no longer reaches, so
    the work is pointing the button at it rather than writing a
    second one.

    While it runs the button says so and the verdict chip carries the
    live step, because a re-check that changes nothing on screen is
    indistinguishable from a re-check that did nothing.
    """
    build.swap(
        "      reCheck: () => {},",
        "      reCheck: () => {\n"
        "        if (s.pjRun) return;\n"
        "        const steps = RUN({ ...s, cPhase: 'running' }).steps;\n"
        "        this.stopRun();\n"
        "        this.setState({ pjRun: true, pjStep: 0 });\n"
        "        for (let i = 1; i < steps.length; i += 1) {\n"
        "          this.runTimers.push(setTimeout(() => this.setState({ pjStep: i }), i * 950));\n"
        "        }\n"
        "        this.runTimers.push(setTimeout(\n"
        "          () => this.setState({ pjRun: false, pjStep: 0, pjChecked: 'just now' }),\n"
        "          steps.length * 950));\n"
        "      },\n"
        "      pjRun: !!s.pjRun,\n"
        "      reCheckLabel: s.pjRun ? 'Checking' : 'Re-check',\n"
        "      //: While the run is on, the verdict is not yet a verdict — the\n"
        "      //: chip carries the step instead, and goes back afterwards.\n"
        "      pjVerdict: s.pjRun\n"
        "        ? (RUN({ ...s, cPhase: 'running' }).steps[s.pjStep || 0] || {}).label\n"
        "        : (s.deal && s.deal.state) || 'Not ready to send',\n"
        "      pjVerdictFg: s.pjRun ? '#6b7280' : '#c8790a',",
        why="Re-check runs the design's own check and says so while it does",
    )
    build.swap(
        '<span style="flex:0 0 auto; color:#c8790a; font-size:13px; font-weight:500; '
        'white-space:nowrap">Not ready to send</span>',
        '<span style="flex:0 0 auto; color:{{ pjVerdictFg }}; font-size:13px; '
        'font-weight:500; white-space:nowrap">{{ pjVerdict }}</span>',
        why="the verdict chip shows the live step while a check is running",
    )
    build.sub(
        r'(sc-camel-on-click="\{\{ reCheck \}\}".{0,900}?)Re-check</span>',
        r"\1{{ reCheckLabel }}</span>",
        why="the button says what it is doing",
        flags=16,
    )


def project_tab_returns_to_the_list(build) -> None:
    """Once inside a project, the dock's « Project » button did
    nothing: `go()` clears `deal` but not `project`, and the project
    view is driven by `project`.

    The breadcrumb goes back, so there was a way out — but a nav tab
    that is inert on the screen you are looking at reads as broken.
    A tab lands on its own top level; that is what a tab is.
    """
    build.swap(
        "this.setState({ view: v, deal: null, doc: null, finding: null, "
        "fail: null, sec: null, chat: null, chatMsgs: [], asked: 0, prompt: '' });",
        "this.setState({ view: v, project: null, deal: null, doc: null, finding: null, "
        "fail: null, sec: null, chat: null, chatMsgs: [], asked: 0, prompt: '' });",
        why="the Project tab lands on the project list, from anywhere",
    )


#: --- the three actions on a finding --------------------------------


def a_finding_can_be_ruled_on(build) -> None:
    """« Apply the fix », « Open the cell » and « Not a finding » had
    no handler at all — not a stub, no binding. They are the core
    interaction of the product: the three things a reviewer does to a
    finding, and all three were inert.

    What each does follows the Swens document rather than my taste.

    **Apply the fix** does not write anything. §3f: a proposed
    correction is « reversible, held in Swens's custody, and released
    only when a person accepts it ». So the first press prepares it
    and says so; a second, separate press accepts it. Two states, and
    the sentence between them is the promise the product is making.

    **Not a finding** cannot be silent. §7: « checks are never
    switched off silently; the record shows what was disabled and by
    whom », and the server refuses a ruling without one — *a ruling
    needs its reason, one sentence, so the decision survives you
    moving on*. So it opens a reason field and will not save without
    it. The design already had that rule as `canSaveNote`, at three
    characters; this reuses the threshold rather than inventing one.

    **Open the cell** opens the workbook at that cell in the real
    product. There is no workbook behind a mock, so it copies the
    reference — genuinely useful, since that is what you paste into
    Excel's name box — and says which reference it copied rather than
    flashing something vague.
    """
    build.swap(
        "            cellRef: gr.ref,",
        "            cellRef: gr.ref,\n"
        "            //: A ruling is keyed by the finding's own sentence, which is\n"
        "            //: already unique — it is the key GRIDS is looked up by.\n"
        "            ...(() => {\n"
        "              const ruling = (s.rulings || {})[id] || null;\n"
        "              const asking = s.rulingFor === id;\n"
        "              const note = s.rulingNote || '';\n"
        "              const rule = (patch) => this.setState(st => ({\n"
        "                rulings: { ...(st.rulings || {}), [id]: patch },\n"
        "                rulingFor: null, rulingNote: '' }));\n"
        "              return {\n"
        "                unruled: !ruling && !asking,\n"
        "                ruled: !!ruling,\n"
        "                asking,\n"
        "                ruleLine: ruling ? ruling.line : '',\n"
        "                ruleFg: ruling && ruling.kind === 'accepted' ? '#1f8a4c' : '#6b7280',\n"
        "                showAccept: !!ruling && ruling.kind === 'prepared',\n"
        "                applyFix: () => rule({ kind:'prepared',\n"
        "                  line:'Fix prepared. Nothing is written to your file until you accept it.' }),\n"
        "                acceptFix: () => rule({ kind:'accepted',\n"
        "                  line:'Accepted. It lands in the next version, and can be undone.' }),\n"
        "                undoRule: () => this.setState(st => { const next = { ...(st.rulings || {}) };\n"
        "                  delete next[id]; return { rulings: next, rulingFor: null, rulingNote: '' }; }),\n"
        "                notAFinding: () => this.setState({ rulingFor: id, rulingNote: '' }),\n"
        "                cancelRule: () => this.setState({ rulingFor: null, rulingNote: '' }),\n"
        "                noteText: asking ? note : '',\n"
        "                typeNote: (e) => this.setState({ rulingNote: e.target.value }),\n"
        "                canSave: note.trim().length > 2,\n"
        "                saveBg: note.trim().length > 2 ? '#0060d0' : '#c9d6e8',\n"
        "                saveRule: () => { if (note.trim().length <= 2) return;\n"
        "                  rule({ kind:'dismissed', line:'Not a finding — ' + note.trim() }); },\n"
        "                copyRef: () => { const ref = gr.ref || '';\n"
        "                  if (!ref) return;\n"
        "                  const done = () => this.setState({ copiedRef: id },\n"
        "                    () => setTimeout(() => this.setState(st =>\n"
        "                      st.copiedRef === id ? { copiedRef: null } : null), 1800));\n"
        "                  if (navigator.clipboard) navigator.clipboard.writeText(ref).then(done, done);\n"
        "                  else done(); },\n"
        "                copyLabel: s.copiedRef === id\n"
        "                  ? 'Copied ' + (gr.ref || '') : 'Open the cell',\n"
        "              };\n"
        "            })(),",
        why="a finding can be fixed, dismissed with a reason, or copied",
    )
    #: The three buttons keep their markup and gain a handler each.
    #: All three clusters in the file are drawn identically, so each
    #: edit is scoped to the Findings tab rather than the first match.
    build.swap_after(
        FINDINGS,
        '<button style="border:0; background:#1f2937; color:#fff; border-radius:10px; '
        'height:38px; padding:0 16px; font:inherit; font-size:14px; font-weight:500; '
        'cursor:pointer" style-hover="background:#2f3b4c">{{ f.actionLabel }}</button>',
        '<button sc-camel-on-click="{{ f.applyFix }}" style="border:0; background:#1f2937; '
        "color:#fff; border-radius:10px; height:38px; padding:0 16px; font:inherit; "
        'font-size:14px; font-weight:500; cursor:pointer" '
        'style-hover="background:#2f3b4c">{{ f.actionLabel }}</button>',
        why="Apply the fix prepares one",
    )
    build.swap_after(
        FINDINGS,
        '<button style="border:1px solid rgba(16,22,35,.08); background:#fff; '
        "color:#1c1f23; border-radius:999px; height:38px; padding:0 16px; font:inherit; "
        'font-size:14px; cursor:pointer" style-hover="background:#fbfbfa">Open the cell</button>',
        '<button sc-camel-on-click="{{ f.copyRef }}" style="border:1px solid '
        "rgba(16,22,35,.08); background:#fff; color:#1c1f23; border-radius:999px; "
        "height:38px; padding:0 16px; font:inherit; font-size:14px; cursor:pointer\" "
        'style-hover="background:#fbfbfa">{{ f.copyLabel }}</button>',
        why="Open the cell copies the reference and says which",
    )
    build.swap_after(
        FINDINGS,
        '<button style="border:0; background:transparent; color:#0060d0; '
        "border-radius:999px; height:38px; padding:0 12px; font:inherit; font-size:14px; "
        'cursor:pointer" style-hover="background:#f3f3f1">Not a finding</button>',
        '<button sc-camel-on-click="{{ f.notAFinding }}" style="border:0; '
        "background:transparent; color:#0060d0; border-radius:999px; height:38px; "
        'padding:0 12px; font:inherit; font-size:14px; cursor:pointer" '
        'style-hover="background:#f3f3f1">Not a finding</button>',
        why="Not a finding asks for the reason",
    )
    #: The cluster itself is untouched — it is wrapped, and the two new
    #: states sit beside it as siblings.
    build.swap_after(
        FINDINGS,
        '<div style="display:flex; flex-wrap:wrap; align-items:center; gap:9px">\n'
        '                                <button sc-camel-on-click="{{ f.applyFix }}"',
        '<sc-if value="{{ f.unruled }}" hint-placeholder-val="{{ true }}">\n'
        '                                <div style="display:flex; flex-wrap:wrap; '
        'align-items:center; gap:9px">\n'
        '                                <button sc-camel-on-click="{{ f.applyFix }}"',
        why="the three buttons show while the finding is unruled",
    )
    build.swap_after(
        FINDINGS,
        'style-hover="background:#f3f3f1">Not a finding</button>\n'
        "                                </div>",
        'style-hover="background:#f3f3f1">Not a finding</button>\n'
        "                                </div>\n"
        "                                </sc-if>" + screens.RULING,
        why="and the ruling replaces them once it is made",
    )


def settings_connections_work(build) -> None:
    """Four buttons in Connections had no handler at all: Disconnect,
    Change, Install and Copy link.

    Two of them had somewhere to go and were simply not pointed at
    it. Two are for a thing a web page cannot do, and say so.

    **Disconnect** had nowhere to land — the card is drawn connected
    only, so pressing it could not have changed anything. The other
    half of the card goes in beside it, and Connect returns.

    **Change** opens the folder browser the design already contains:
    `openNew` builds it, and until now nothing in Settings reached it.

    **Install** hands over the manifest and says where it goes,
    because a web page cannot reach inside Office to install an
    add-in. The shipped web app makes the same choice for the same
    reason, and its comment is worth quoting: *an Install button that
    installs a broken add-in is worse than none*.

    **Copy link** copies the manifest URL — `/panel/manifest.xml` off
    this origin, which is the path the shipped app serves it from. In
    a file:// mock that URL is not useful; in a deployment it is the
    right one, and this is the line that makes it so.
    """
    build.swap(
        '<button style="flex:0 0 auto; border:0; background:transparent; font:inherit; '
        'font-size:14px; color:#e0322d; cursor:pointer; padding:4px 6px">Disconnect</button>',
        '<button sc-camel-on-click="{{ msDisconnect }}" style="flex:0 0 auto; border:0; '
        "background:transparent; font:inherit; font-size:14px; color:#e0322d; "
        'cursor:pointer; padding:4px 6px">Disconnect</button>',
        why="Disconnect disconnects",
    )
    #: The connected row is wrapped, not replaced, and the
    #: disconnected row is added beside it.
    build.swap(
        '<div style="display:flex; align-items:center; gap:14px; padding:18px 22px">\n'
        '                <img src="e8a6d21c-d924-4c3a-a0a3-14d500b2042e"',
        '<sc-if value="{{ msOn }}" hint-placeholder-val="{{ true }}">\n'
        '                <div style="display:flex; align-items:center; gap:14px; '
        'padding:18px 22px">\n'
        '                <img src="e8a6d21c-d924-4c3a-a0a3-14d500b2042e"',
        why="the connected row is one of two states",
    )
    build.swap_after(
        "{{ sConn }}",
        'cursor:pointer; padding:4px 6px">Disconnect</button>\n'
        "              </div>",
        'cursor:pointer; padding:4px 6px">Disconnect</button>\n'
        "              </div>\n              </sc-if>" + screens.DISCONNECTED,
        why="and the disconnected state exists",
    )
    build.swap_after(
        "Folders Swens watches",
        '<button style="flex:0 0 auto; border:0; background:transparent; font:inherit; '
        'font-size:14px; color:#2b6cf5; cursor:pointer; padding:4px 6px">Change</button>',
        '<button sc-camel-on-click="{{ openNew }}" style="flex:0 0 auto; border:0; '
        "background:transparent; font:inherit; font-size:14px; color:#2b6cf5; "
        'cursor:pointer; padding:4px 6px">Change</button>',
        why="Change opens the folder browser the design already has",
    )
    build.swap(
        '<button style="flex:0 0 auto; border:0; background:#1f2937; color:#fff; '
        "border-radius:10px; height:38px; padding:0 18px; font:inherit; font-size:14px; "
        'font-weight:500; cursor:pointer" style-hover="background:#2f3b4c">Install</button>',
        '<button sc-camel-on-click="{{ openAddinSteps }}" style="flex:0 0 auto; border:0; '
        "background:#1f2937; color:#fff; border-radius:10px; height:38px; padding:0 18px; "
        'font:inherit; font-size:14px; font-weight:500; cursor:pointer" '
        'style-hover="background:#2f3b4c">Install</button>',
        why="Install says how the panel reaches Excel",
    )
    build.swap(
        '<button style="flex:0 0 auto; border:0; background:transparent; font:inherit; '
        'font-size:14px; color:#2b6cf5; cursor:pointer; padding:4px 6px">Copy link</button>',
        '<button sc-camel-on-click="{{ copyManifest }}" style="flex:0 0 auto; border:0; '
        "background:transparent; font:inherit; font-size:14px; color:#2b6cf5; "
        'cursor:pointer; padding:4px 6px">{{ copyManifestLabel }}</button>',
        why="Copy link copies the manifest URL",
    )
    build.swap(
        "      openNew: () => this.setState({",
        "      msOn: !s.msGone,\n"
        "      msOff: !!s.msGone,\n"
        "      msDisconnect: () => this.setState({ msGone: true }),\n"
        "      msConnect: () => this.setState({ msGone: false }),\n"
        "      addinSteps: !!s.addinSteps,\n"
        "      openAddinSteps: () => this.setState({ addinSteps: true }),\n"
        "      closeAddinSteps: () => this.setState({ addinSteps: false }),\n"
        "      copyManifestLabel: s.manifestCopied ? \'Link copied\' : \'Copy link\',\n"
        "      copyManifest: () => {\n"
        "        //: The path the shipped web app serves the manifest from.\n"
        "        const url = new URL(\'/panel/manifest.xml\', location.href).href;\n"
        "        const done = () => this.setState({ manifestCopied: true },\n"
        "          () => setTimeout(() => this.setState({ manifestCopied: false }), 1800));\n"
        "        if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, done);\n"
        "        else done();\n"
        "      },\n"
        "      openNew: () => this.setState({",
        why="the connection card knows its two states, and the add-in its steps",
    )
    build.swap_after(
        "A manifest link for IT to push through Microsoft 365 admin",
        'cursor:pointer; padding:4px 6px">{{ copyManifestLabel }}</button>\n'
        "              </div>",
        'cursor:pointer; padding:4px 6px">{{ copyManifestLabel }}</button>\n'
        "              </div>" + screens.INSTALL_STEPS,
        why="the install steps have somewhere to appear",
    )


#: --- the two downloads --------------------------------------------


def download_pdf_downloads(build) -> None:
    """« Download PDF » was bound to `closeFullRep`. It said Download
    and it closed the report — worse than a stub, because it looks
    like it worked.

    A rendered report is printed, not fetched: the sheet already
    exists on screen, and every browser prints to PDF. So the button
    opens the sheet alone in a print window, which is both the real
    mechanism and the one that keeps the app's chrome out of the
    page. The sheet is tagged so it can be found; nothing else about
    it changes.
    """
    #: The report is three stacked pages, not one — the build refused
    #: the first attempt at this anchor for exactly that reason. All
    #: three are tagged and all three print.
    build.swap(
        '<div style="width:100%; max-width:780px; background:#fff; border-radius:6px;',
        '<div data-report="sheet" style="width:100%; max-width:780px; background:#fff; '
        "border-radius:6px;",
        times=3,
        why="all three report pages are findable",
    )
    build.swap(
        "      closeFullRep: () => this.setState({ fullRep: false }),",
        "      closeFullRep: () => this.setState({ fullRep: false }),\n"
        "      //: Print the sheet on its own. Printing the page itself would\n"
        "      //: carry the dock and the modal's scrim onto the paper.\n"
        "      printReport: () => {\n"
        "        const sheets = [...document.querySelectorAll('[data-report=\"sheet\"]')];\n"
        "        if (!sheets.length) return;\n"
        "        const w = window.open('', '_blank', 'width=900,height=1200');\n"
        "        if (!w) return;\n"
        "        w.document.write('<!doctype html><meta charset=\"utf-8\">'\n"
        "          + '<title>' + document.title + '</title>'\n"
        "          + '<style>body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif}'\n"
        "          + '[data-report=\"sheet\"]{box-shadow:none!important;border-radius:0!important;"
        "max-width:none!important;break-after:page}'\n"
        "          + '@page{margin:16mm}</style>'\n"
        "          + '<body>' + sheets.map(s => s.outerHTML).join('') + '</body>');\n"
        "        w.document.close();\n"
        "        w.focus();\n"
        "        setTimeout(() => w.print(), 250);\n"
        "      },",
        why="the report can be printed to PDF",
    )
    build.swap(
        '<button sc-camel-on-click="{{ closeFullRep }}" style="flex:0 0 auto; '
        "display:flex; align-items:center; gap:9px; border:0; background:#0060d0; "
        "border-radius:999px; height:38px;",
        '<button sc-camel-on-click="{{ printReport }}" style="flex:0 0 auto; '
        "display:flex; align-items:center; gap:9px; border:0; background:#0060d0; "
        "border-radius:999px; height:38px;",
        why="Download PDF downloads instead of closing the report",
    )


def the_marked_up_model_downloads(build) -> None:
    """« Download the marked-up model » was `dlMarkup: () => {}`.

    The real thing is the workbook back with its problem cells filled
    and noted, which needs the server: the write path exists and is
    proven byte-identical on 27 files, but the fill-and-note pass is
    not built. A mock cannot produce that file, and a button that
    reports « Ready » over nothing is the kind of lie this product
    cannot afford.

    So it downloads what the mock genuinely holds — the findings
    register, straight off the rows on screen, as a file Excel opens.
    The card's second line says which, and says the workbook is
    coming. When the server pass lands, this handler points at it and
    the copy loses one clause.
    """
    #: A class property rather than a closure, because two surfaces
    #: hand over this same file: the card here, and the Excel file
    #: card an answer offers in the Ask panel.
    build.swap(
        "  asRef = React.createRef();",
        "  asRef = React.createRef();\n"
        "  //: The findings register, straight off the rows on screen.\n"
        "  //: Built from `fnGroups` — the same array the Findings table\n"
        "  //: renders — so the file can never disagree with the list it\n"
        "  //: came from. Severity first, because that is the column a\n"
        "  //: reviewer sorts on before anything else.\n"
        "  takeRegister = (as) => {\n"
        "    const vals = this.renderVals();\n"
        "    const esc = (v) => '\"' + String(v == null ? '' : v).replace(/\"/g, '\"\"') + '\"';\n"
        "    const lines = [['Severity','Finding','Where','Cell','Group','Status','Note']\n"
        "      .map(esc).join(',')];\n"
        "    (vals.fnGroups || []).forEach(g => (g.items || []).forEach(r => lines.push(\n"
        "      [r.sev, r.what, (r.wheres || []).map(w => w.label).join(' \\u00b7 '),\n"
        "       r.cellRef, g.name, '', ''].map(esc).join(','))));\n"
        "    if (lines.length === 1) return;\n"
        "    const name = String(as || vals.mdFile || 'model')\n"
        "      .replace(/\\.[a-z]+$/i, '') + (as ? '.csv' : ' findings.csv');\n"
        "    const url = URL.createObjectURL(\n"
        "      new Blob(['\\ufeff' + lines.join('\\r\\n')], { type: 'text/csv;charset=utf-8' }));\n"
        "    const a = document.createElement('a');\n"
        "    a.href = url; a.setAttribute('download', name);\n"
        "    document.body.appendChild(a); a.click();\n"
        "    a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);\n"
        "  };",
        why="the findings register is one generator, not two",
    )
    build.swap(
        "      dlMarkup: () => {},",
        "      dlMarkup: () => this.takeRegister(),",
        why="the marked-up card downloads the findings register it can actually produce",
    )
    build.swap(
        "Your model back, with every problem marked in place.",
        "The findings register, ready to work through. The marked-up workbook "
        "follows when the write pass ships.",
        why="the card promises the file it hands you",
    )


#: --- the last three on the Ask screen -----------------------------


def searching_the_chat_history(build) -> None:
    """« Search chats » had no field behind it.

    It is the first control in the sidebar and it carried a ⌘K chip,
    which is a promise. Behind it sit nine real conversations — two
    pinned, seven across Today and Previous 7 days — already filtered
    by the Project/All scope the founder drew above them. Searching
    them is a filter over data that is right there.

    The row becomes a field in place, so the sidebar does not jump:
    same height, same magnifier, same padding; only the ⌘K chip gives
    way to a clear button, the shortcut having done its work by then.
    The scope switch keeps applying, so a search inside « Project »
    searches this project — and when that finds nothing, the empty
    state says so rather than implying the chat does not exist.
    """
    build.swap(
        "  asRef = React.createRef();",
        "  asRef = React.createRef();\n  histRef = React.createRef();",
        why="the search field can be focused when it opens",
    )
    #: The chip says ⌘K, so ⌘K has to work. Bound on the document
    #: rather than the field, because the point of the shortcut is
    #: reaching a field that is not on screen yet.
    build.swap(
        "  componentDidMount() {\n"
        "    this.pjRO = new ResizeObserver(() => this.pjMeasure());",
        "  componentDidMount() {\n"
        "    document.addEventListener('keydown', this.histHotkey);\n"
        "    this.pjRO = new ResizeObserver(() => this.pjMeasure());",
        why="⌘K reaches the field",
    )
    build.swap(
        "  componentDidUpdate() {",
        "  histHotkey = (e) => {\n"
        "    if (e.key !== 'k' || !(e.metaKey || e.ctrlKey)) return;\n"
        "    if (this.state.view !== 'assist') return;\n"
        "    e.preventDefault();\n"
        "    //: The rail may be shut, in which case the shortcut opens it\n"
        "    //: too — otherwise ⌘K would focus a field nobody can see.\n"
        "    this.setState({ histOpen: true, histFind: true },\n"
        "      () => this.histRef.current && this.histRef.current.focus());\n"
        "  };\n"
        "  componentDidUpdate() {",
        why="and knows to open the rail first if it is shut",
    )
    build.swap(
        "  renderVals() {\n    const s = this.state;",
        "  renderVals() {\n    const s = this.state;\n"
        "    //: Title and scope both, because « Northbank · v21 » is how\n"
        "    //: someone looks for the conversation about version 21.\n"
        "    //: The counter is how the empty state knows: both lists are\n"
        "    //: built inline inside the props object and cannot be read\n"
        "    //: back, so the predicate counts its own hits as it runs.\n"
        "    const HQ = String(s.histQ || '').trim().toLowerCase();\n"
        "    let HHITS = 0;\n"
        "    const HHIT = (c) => {\n"
        "      const ok = !HQ\n"
        "        || (String(c.title) + ' ' + String(c.scope)).toLowerCase().indexOf(HQ) !== -1;\n"
        "      if (ok) HHITS++;\n"
        "      return ok;\n"
        "    };",
        why="the history knows what a search matches",
    )
    #: Both appended to the end of an existing chain, so the founder's
    #: own expression is still the thing producing the list.
    build.swap(
        "      ].map(p => ({ ...p, open: () => this.setState({ histOpen: false }) })),",
        "      ].filter(HHIT)"
        ".map(p => ({ ...p, open: () => this.setState({ histOpen: false }) })),",
        why="a search narrows the pinned chats",
    )
    build.swap(
        "items: g.items.filter(i => !projectOnly || i.proj)",
        "items: g.items.filter(i => !projectOnly || i.proj).filter(HHIT)",
        why="and the dated ones",
    )
    #: A dated group hides itself when a search empties it — the
    #: design's own `.filter(g => g.items.length)`. Pinned had no
    #: such filter because until now it could not be emptied.
    build.swap(
        '<span style="font-size:13px; color:#a2a29c; padding:26px 10px 6px">Pinned</span>',
        '<sc-if value="{{ histHasPinned }}" hint-placeholder-val="{{ true }}">'
        '<span style="font-size:13px; color:#a2a29c; padding:26px 10px 6px">Pinned</span>'
        "</sc-if>",
        why="the Pinned heading goes with its chats",
    )
    #: Placed at `histGroups`, the key straight after the pinned
    #: array: at this point the counter has seen the pinned chats and
    #: nothing else, so it is exactly their hit count.
    build.swap(
        "      histGroups: (() => {",
        "      histHasPinned: !HQ || HHITS > 0,\n"
        "      histGroups: (() => {",
        why="and knows whether any pinned chat matched",
    )
    build.swap(
        "      histPinned: [",
        "      histQ: s.histQ || '',\n"
        "      histTyping: !!s.histFind,\n"
        "      histAsk: !s.histFind,\n"
        "      histRef: this.histRef,\n"
        "      openHistSearch: () => this.setState({ histFind: true },\n"
        "        () => this.histRef.current && this.histRef.current.focus()),\n"
        "      closeHistSearch: () => this.setState({ histFind: false, histQ: '' }),\n"
        "      setHistQ: (e) => this.setState({ histQ: e.target.value }),\n"
        "      histKey: (e) => { if (e.key === 'Escape') "
        "this.setState({ histFind: false, histQ: '' }); },\n"
        "      histPinned: [",
        why="the field opens, types, clears and closes",
    )
    #: Placed at `chatGreeting`, the first key after `histGroups`: an
    #: object literal evaluates in order, so by here both lists have
    #: run their filters and the counter is final.
    build.swap(
        "      chatGreeting:",
        "      histNone: !!HQ && HHITS === 0,\n"
        "      histNoneWhy: (s.histScope || 'project') === 'project'\n"
        "        ? 'Only this project\\u2019s chats are being searched. "
        "Switch to All to look across every project.'\n"
        "        : 'Nothing in any project matches.',\n"
        "      chatGreeting:",
        why="a search that finds nothing says which shelf it looked on",
    )
    build.swap(
        '<button style="flex:0 0 auto; display:flex; align-items:center; gap:13px; '
        "width:100%; text-align:left; border:0; background:transparent; "
        "border-radius:10px; font:inherit; font-size:15px; letter-spacing:-.008em; "
        'color:#9aa1ab; cursor:pointer; padding:11px 10px; margin-bottom:8px"',
        '<sc-if value="{{ histAsk }}" hint-placeholder-val="{{ true }}">\n'
        '            <button sc-camel-on-click="{{ openHistSearch }}" '
        'style="flex:0 0 auto; display:flex; align-items:center; gap:13px; '
        "width:100%; text-align:left; border:0; background:transparent; "
        "border-radius:10px; font:inherit; font-size:15px; letter-spacing:-.008em; "
        'color:#9aa1ab; cursor:pointer; padding:11px 10px; margin-bottom:8px"',
        why="Search chats opens a field",
    )
    build.swap(
        'border-radius:5px; padding:2px 5px">⌘K</span>\n'
        "            </button>",
        'border-radius:5px; padding:2px 5px">⌘K</span>\n'
        "            </button>\n            </sc-if>" + screens.SEARCH_FIELD,
        why="and the field is the same box, in its typing state",
    )
    build.swap(
        "              </sc-for>\n            </div>\n          </div>\n        </div>\n\n"
        '      <div style="position:relative; flex:1; min-width:0; display:flex; '
        'flex-direction:column">',
        "              </sc-for>" + screens.SEARCH_EMPTY + "            </div>\n"
        "          </div>\n        </div>\n\n"
        '      <div style="position:relative; flex:1; min-width:0; display:flex; '
        'flex-direction:column">',
        why="and a search that matches nothing says so",
    )


def share_copies_a_link(build) -> None:
    """The Share icon beside the history toggle had no handler.

    Sharing a conversation is a link, and a link is the one part of
    it a mock can genuinely hand over: the URL of this chat. It goes
    to the clipboard, the same way Settings' « Copy link » does.

    An icon button has no label to change, so the acknowledgement
    sits beside it — the only reason this needs markup at all.
    """
    build.swap(
        '<button title="Share" style="flex:0 0 auto; pointer-events:auto;',
        '<button sc-camel-on-click="{{ shareChat }}" title="Share" '
        'style="flex:0 0 auto; pointer-events:auto;',
        why="Share copies a link to the conversation",
    )
    build.swap(
        "      toggleHist: () => this.setState(st => ({ histOpen: !st.histOpen })),",
        "      toggleHist: () => this.setState(st => ({ histOpen: !st.histOpen })),\n"
        "      shareCopied: !!s.shareCopied,\n"
        "      shareChat: () => {\n"
        "        //: One conversation, addressed. Off a file:// mock this is\n"
        "        //: the file's own URL; deployed it is the chat's.\n"
        "        const url = location.href.split('#')[0]\n"
        "          + '#chat=' + encodeURIComponent(this.state.chat ? this.state.chat.id\n"
        "            || this.state.chat.title : 'new');\n"
        "        const done = () => this.setState({ shareCopied: true },\n"
        "          () => setTimeout(() => this.setState({ shareCopied: false }), 1800));\n"
        "        if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, done);\n"
        "        else done();\n"
        "      },",
        why="and says so, since the icon carries no label",
    )
    build.swap(
        '<span style="flex:1; min-width:0"></span>\n'
        '          <button sc-camel-on-click="{{ shareChat }}" title="Share"',
        '<span style="flex:1; min-width:0"></span>' + screens.SHARE_COPIED
        + '          <button sc-camel-on-click="{{ shareChat }}" title="Share"',
        why="the acknowledgement sits beside the icon",
    )


def an_answers_files_open(build) -> None:
    """Every answer offers its files, and none of them opened.

    Nine of the founder's ten exchanges end in one or two file cards
    — « Northbank hardcode register », « Northbank Model Review Memo
    », « Northbank v13 → v14 change log ». They are drawn as buttons
    and none carried a handler.

    Which file it is decides what opening it means, and for two of
    the three kinds the founder already decided:

    - the **Word** card is the written report, « a report of the
      summary, the written version of what's going on » — and that
      report is drawn, three pages of it. So it opens;
    - the **register** is the technical one, « the excel is the
      technical report, with all the findings » — so it downloads,
      from the same generator as « Download the marked-up model »,
      under the name on the card.

    The third kind is every other Excel card, and it is the reason
    this edit took two passes. « Northbank Bid Model — proposed v23 »
    is the workbook with the fixes in it; « v13 → v14 change log » is
    a diff of two files; « DSCR trace » is an evidence chain. The
    first build handed all of them the findings CSV, which downloaded
    cleanly under a name that was not what was inside it — the exact
    failure « Download PDF » had before this build touched it. They
    open a sheet naming the file instead.

    The card's kind is not recoverable at render time: `IC()` resolves
    `icons/excel.webp` to an opaque asset id, and by the time the
    mapper sees it the path is gone. So the kind is stamped where the
    path still exists, beside the icon, without disturbing it.
    """
    build.sub(
        r"icon:IC\('icons/(\w+)\.webp'\),name:",
        r"kind:'\1',icon:IC('icons/\1.webp'),name:",
        why="each file card carries which kind of file it is",
    )
    build.swap(
        "          outputs: A(m).outputs || [],",
        "          outputs: (A(m).outputs || []).map(o => ({ ...o,\n"
        "            //: A register is a list of findings, and findings are what\n"
        "            //: this mock holds. Everything else is a file only a real\n"
        "            //: run produces.\n"
        "            take: () => (o.kind === 'word'\n"
        "              ? this.setState({ fullRep: true })\n"
        "              : /register$/i.test(o.name)\n"
        "                ? this.takeRegister(o.name)\n"
        "                : this.setState({ fileSoon: o.name })) })),",
        why="an answer's files open",
    )
    build.swap(
        "      closeFullRep: () => this.setState({ fullRep: false }),",
        "      closeFullRep: () => this.setState({ fullRep: false }),\n"
        "      fileSoon: !!s.fileSoon,\n"
        "      fileSoonName: s.fileSoon || '',\n"
        "      fileSoonWhat: /proposed/i.test(s.fileSoon || '')\n"
        "        ? 'Your workbook back with the accepted fixes written in, and every "
        "other finding noted in place. It is built from your file, so there is nothing "
        "to hand over until a check has run against one.'\n"
        "        : /change log|diff/i.test(s.fileSoon || '')\n"
        "          ? 'Every cell that changed between the two versions, with the ones "
        "that change a number separated from the ones that do not. It needs both "
        "workbooks.'\n"
        "          : 'Built from the check that produced this answer, against your own "
        "model.',\n"
        "      closeFileSoon: () => this.setState({ fileSoon: null }),",
        why="and the ones a mock cannot hold say what they are",
    )
    build.swap(
        '<sc-if value="{{ fullRep }}" hint-placeholder-val="{{ false }}">',
        screens.FILE_NOT_YET.strip("\n")
        + '\n\n  <sc-if value="{{ fullRep }}" hint-placeholder-val="{{ false }}">',
        why="the sheet hangs off the root, like the report",
    )
    build.swap(
        "                              <button style=\"display:flex; align-items:center; "
        "gap:12px; background:#fff; border:0; border-radius:14px;",
        '                              <button sc-camel-on-click="{{ o.take }}" '
        'style="display:flex; align-items:center; gap:12px; background:#fff; '
        "border:0; border-radius:14px;",
        why="the card is the button that opens it",
    )


def the_answer_lands_on_its_findings(build) -> None:
    """« Open the 4 material ones » opened a file-drop screen.

    Every answer ends with a named action — « Open the 4 material
    ones », « Open the changed cells », « Review 3 corrections » —
    and all of them are bound to `openFindings`, which sets
    `view: 'check'`. That is the private bench, the drag-a-model-here
    screen the founder took off the dock. So the most specific
    promise on the screen led to an empty drop zone.

    It goes where it says: the project, its Findings tab. Both exist
    — `pjProjects[].open` sets `project`, and `goFindings` sets the
    tab — and until now nothing joined them up.

    Which project comes from the answer's own file, « Northbank
    hardcode register » → « Northbank », because that is the only
    place in a mock where the subject is written down. A real answer
    would carry the project it was asked about.

    This is also the last thing that could reach `vCheck`, so from
    here the bench is off the dock and off every path — which is
    what the founder asked for when they cut it.
    """
    build.swap(
        "          openFindings: () => this.setState({ view: 'check' }),",
        "          openFindings: () => this.setState({ view: 'deals', pjTab: 'Findings',\n"
        "            project: String((A(m).outputs || [{}])[0].name || 'Northbank')\n"
        "              .split(' ')[0] }),",
        why="an answer's action opens the findings it named",
    )


#: Order matters only in that the chat edit inserts before an anchor
#: the later edits do not touch.
ALL = [
    the_chat_answers,
    a_finding_can_be_ruled_on,
    recheck_actually_rechecks,
    project_tab_returns_to_the_list,
    settings_connections_work,
    download_pdf_downloads,
    the_marked_up_model_downloads,
    searching_the_chat_history,
    share_copies_a_link,
    an_answers_files_open,
    the_answer_lands_on_its_findings,
]
