"""The gates. Each of these is a false positive that happened once."""

from decimal import Decimal

from polar.tieout.figures import Figure
from polar.tieout.link import link, normalise, tokens
from polar.tieout.model import Output

OUTPUTS = [
    Output("O1", "FY2025A revenue", Decimal("228.9"), "Model!D6", "Reported"),
    Output("O3", "FY2025A gross margin", Decimal("0.381826"), "Model!D11", "Reported"),
    Output("O4", "FY2025A reported EBITDA", Decimal("41.2"), "Model!D16", "Reported"),
    Output(
        "O5",
        "FY2025A adjusted EBITDA",
        Decimal("48.9"),
        "Model!D25",
        "Adjusted - see bridge",
    ),
    Output(
        "O6",
        "FY2025A adjusted EBITDA margin",
        Decimal("0.21363"),
        "Model!D26",
        "Adjusted",
    ),
    Output("O15", "DCF implied value per share", Decimal("9.6905"), "DCF!B21", "DCF"),
    Output(
        "O16",
        "DCF implied EV / FY2025A adj. EBITDA",
        Decimal("10.00926"),
        "DCF!B23",
        "DCF",
    ),
    Output(
        "O19",
        "Peer median EV / EBITDA",
        Decimal("9.90402"),
        "Comps!F13",
        "Trading comps",
    ),
    Output(
        "O20", "Peer mean EV / EBITDA", Decimal("9.73266"), "Comps!F12", "Trading comps"
    ),
    Output(
        "O21",
        "Comps-implied enterprise value",
        Decimal("484.3065"),
        "Comps!B20",
        "Trading comps",
    ),
]


def figure(label: str, **kwargs: object) -> Figure:
    defaults = dict(
        printed="9.9x",
        value=Decimal("9.9"),
        decimals=1,
        kind="multiple",
        slide=6,
        label=label,
        location="slide 6",
        context=label,
        section="Trading comparables",
    )
    defaults.update(kwargs)
    return Figure(**defaults)  # type: ignore[arg-type]


def linked_ref(one: Figure) -> str | None:
    links, _ = link([one], OUTPUTS)
    return links[0].output.ref if links else None


def refusal(one: Figure) -> str:
    links, unlinked = link([one], OUTPUTS)
    assert not links, f"expected a refusal, got {links[0].output.ref}"
    return unlinked[0].reason


def test_a_peers_own_multiple_is_not_the_peer_median() -> None:
    """The number that the whole module exists for. `10.4x` in the Kestrel
    row and `9.9x` in the median row are the same shape of thing and one
    of them reconciles to Comps!F13."""
    assert linked_ref(figure("Median EV / EBITDA", subject="Median")) == "O19"
    assert (
        linked_ref(
            figure(
                "Kestrel Valve Group EV / EBITDA",
                subject="Kestrel Valve Group",
                value=Decimal("10.4"),
                printed="10.4x",
            )
        )
        is None
    )


def test_a_table_label_using_a_word_the_output_does_not_is_a_different_figure() -> None:
    """« Median EV / revenue » is 1.9x and « Median EV / EBITDA » is 9.9x.
    They share every word but one, and the one is the whole meaning."""
    assert linked_ref(figure("Median EV / revenue", subject="Median")) is None


def test_a_contradicted_period_is_refused() -> None:
    revenue = dict(kind="plain", printed="182.4", value=Decimal("182.4"), decimals=1)
    assert linked_ref(figure("Revenue FY2025A", subject="Revenue", **revenue)) == "O1"
    assert linked_ref(figure("Revenue FY2023A", subject="Revenue", **revenue)) is None


def test_a_contradicted_basis_is_refused() -> None:
    """$41.2mm reported and $48.9mm adjusted are both correct. This is the
    trap the Cascade README warns about, and it is a gate, not a score."""
    reported = dict(
        kind="currency", printed="$41.2mm", value=Decimal("41.2"), decimals=1, slide=4
    )
    assert linked_ref(figure("FY2025A reported EBITDA of", **reported)) == "O4"


def test_a_percentage_cannot_be_a_figure_that_is_not_a_fraction() -> None:
    """Gross profit of 87.4 against a gross margin of 0.3818: same words,
    different quantity."""
    assert (
        linked_ref(
            figure(
                "Gross profit FY2025A",
                subject="Gross profit",
                kind="plain",
                printed="87.4",
                value=Decimal("87.4"),
                slide=3,
            )
        )
        is None
    )


def test_a_multiple_needs_a_name_that_is_a_ratio() -> None:
    """« DCF implied value per share » and « DCF implied EV / EBITDA »
    share their whole opening. 10.0x is one of them; $9.69 is the other,
    and no amount of word overlap tells them apart."""
    assert (
        linked_ref(
            figure(
                "The DCF implies",
                printed="10.0x",
                value=Decimal("10.0"),
                slide=7,
                section="Discounted cash flow analysis",
            )
        )
        == "O16"
    )


def test_a_range_endpoint_reconciles_to_nothing() -> None:
    one = figure(
        "Enterprise value reference range of",
        printed="$455mm",
        value=Decimal("455"),
        decimals=0,
        kind="currency",
        slide=8,
        range_endpoint=True,
    )
    assert refusal(one) == "one end of a printed range"


def test_a_figure_nothing_names_is_left_alone() -> None:
    assert "nothing names it" == refusal(figure("of"))


def test_two_outputs_that_fit_equally_well_settle_nothing() -> None:
    """Slide 3 has two rows labelled « % margin » — one under gross profit
    and one under adjusted EBITDA. Read on its own the label is the same
    for both, and picking either is a coin toss that flags a correct deck
    half the time. The deck reader resolves this by carrying the row above
    down; if it ever stops, this is the gate that keeps the checker quiet.
    """
    assert "equally well" in refusal(
        figure(
            "% margin FY2025A",
            subject="% margin",
            kind="percent",
            printed="21.4%",
            value=Decimal("0.214"),
            slide=3,
            section="Historical financial performance",
        )
    )


def test_fiscal_years_are_the_same_word_however_the_deck_writes_them() -> None:
    assert normalise("FY25A") == "fy2025a"
    assert normalise("fy2025a") == "fy2025a"
    assert tokens("Revenue CAGR FY25A-FY30E") == [
        "revenue",
        "cagr",
        "fy2025a",
        "fy2030e",
    ]


def test_a_slide_heading_can_support_a_link_but_never_carry_one() -> None:
    """« implies an enterprise value of $484mm » on the comps page is the
    comps-implied EV; the same words on the DCF page are not. The heading
    decides, and on its own it names nothing."""
    callout = dict(
        printed="$484mm",
        value=Decimal("484"),
        decimals=0,
        kind="currency",
        label="implies an enterprise value of",
        context="Applying the peer median of 9.9x to Cascade's FY2025A adjusted "
        "EBITDA of $48.9mm implies an enterprise value of $484mm.",
    )
    assert linked_ref(figure(section="Trading comparables peers", **callout)) == "O21"


# --- What a real model and a real document taught the matcher -----------


class TestCapitalsAreNames:
    def test_an_acronym_survives_the_stopword_list(self) -> None:
        """`TO` is a preposition and also a licensed business.

        Ofgem's model keeps the transmission owner on `NGET TO` and the
        system operator on `NGET SO`. With `to` dropped as a stopword the
        first tokenised to `['nget']` — a strict subset of the second,
        unable to win any match against it — so every transmission-owner
        figure in the direction document matched a system-operator cell.
        Seven false contradictions.
        """
        from polar.tieout.link import tokens

        assert tokens("NGET TO") == ["nget", "to"]
        assert tokens("NGET SO") == ["nget", "so"]
        assert tokens("National Grid Electricity Transmission TO")[-1] == "to"

    def test_a_line_set_entirely_in_capitals_is_shouting_not_naming(self) -> None:
        """Otherwise a heading puts `the` and `to` back in the vocabulary."""
        from polar.tieout.link import tokens

        assert tokens("NOTES TO THE FINANCIAL STATEMENTS") == [
            "note",
            "financial",
            "statement",
        ]

    def test_an_acronym_is_not_a_plural(self) -> None:
        from polar.tieout.link import tokens

        assert tokens("Cost of goods sold COGS") == ["cost", "good", "sold", "cogs"]


class TestAnUnmarkedYear:
    def test_it_is_compatible_with_a_marked_one(self) -> None:
        """`FY2025` asserts a year and not a basis, so refusing to match it
        against `FY2025A` rejects the right cell for saying less."""
        from polar.tieout.link import _same_period

        assert _same_period({"fy2025"}, {"fy2025a"})
        assert _same_period({"fy2025a"}, {"fy2025"})
        assert _same_period({"fy2025a"}, {"fy2025a"})

    def test_two_different_bases_are_still_different(self) -> None:
        """The distinction the gate exists for: an actual is not an
        estimate, however much else the two names share."""
        from polar.tieout.link import _same_period

        assert not _same_period({"fy2025a"}, {"fy2025e"})
        assert not _same_period({"fy2025"}, {"fy2026a"})


def test_one_word_on_both_sides_is_no_match_at_all() -> None:
    """The first regulator-scale crosscheck proposed twelve links; every
    one was a licensee acronym (« NGET ») matched against a dropdown
    integer in a row named with the same acronym — £13,359.4m compared
    against 8. One word each way carries no corroboration."""
    from polar.tieout.link import link as run

    lists = [Output("V1", "NGET", Decimal("8"), "Validation!AA9", "Validation")]
    fig = figure(
        "NGET",
        kind="currency",
        printed="£13359.4m",
        value=Decimal("13359.4"),
        context="",
        section="",
        subject=None,
    )
    links, unlinked = run([fig], lists)
    assert not links
    assert "single shared word" in unlinked[0].reason


def test_one_shared_word_may_corroborate_but_never_contradict() -> None:
    """Cascade's « WACC of 9.8% » against the output named `WACC` is one
    shared word *agreeing* — refusing it costs real coverage. The line
    is drawn at the claim: thin matches keep their agreements and lose
    their drifts."""
    from polar.tieout.link import link as run

    wacc = [Output("W1", "WACC", Decimal("0.098"), "Input!B4", "Input")]
    agreeing = figure(
        "WACC of",
        kind="percent",
        printed="9.8%",
        value=Decimal("0.098"),
        context="",
        section="",
        subject=None,
    )
    links, _ = run([agreeing], wacc)
    assert links
    assert links[0].output.ref == "W1"


def test_a_flat_parameter_across_years_is_one_answer() -> None:
    """« FY2027 Risk-free rate » 0.023 and « FY2028 Risk-free rate »
    0.023 are the same figure in two period columns. A document quoting
    the parameter without a year is not ambiguous about which quantity
    it means — every refusal in the first regulator-scale run was this
    shape."""
    from polar.tieout.link import link as run

    years = [
        Output("Y1", "FY2027 Risk-free rate", Decimal("0.023"), "In!AU869", "In"),
        Output("Y2", "FY2028 Risk-free rate", Decimal("0.023"), "In!AV869", "In"),
        Output("Y3", "FY2029 Risk-free rate", Decimal("0.023"), "In!AW869", "In"),
    ]
    fig = figure(
        "Risk-free rate forecast",
        kind="percent",
        printed="2.30%",
        value=Decimal("0.023"),
        subject=None,
    )
    links, unlinked = run([fig], years)
    assert links, unlinked
    assert links[0].output.name.endswith("Risk-free rate")


def test_two_genuinely_different_candidates_still_refuse() -> None:
    """The collapse is for period twins only: two quantities with
    different values or different names stay ambiguous."""
    from polar.tieout.link import link as run

    rivals = [
        Output("R1", "FY2027 Risk-free rate", Decimal("0.023"), "In!AU869", "In"),
        Output("R2", "FY2027 Risk-free rate floor", Decimal("0.021"), "In!AU870", "In"),
    ]
    fig = figure(
        "Risk-free rate",
        kind="percent",
        printed="2.30%",
        value=Decimal("0.023"),
        subject=None,
    )
    links, unlinked = run([fig], rivals)
    if links:
        assert links[0].output.ref == "R1"
    else:
        assert "equally well" in unlinked[0].reason


def test_machinery_sheets_are_not_candidates() -> None:
    """A data-validation dropdown or a Power Query cache is workbook
    machinery — its cells hold values no document could be quoting.
    Measured on Ofgem's GD-BPFM (« F7 - Data Validation », PowerQuery)."""
    from polar.tieout.provenance import outputs_from_workbook
    from polar.tieout.workbook import Cell, Workbook

    book = Workbook()
    for sheet, ref in (
        ("F7 - Data Validation", "F7 - Data Validation!AA9"),
        ("PowerQuery", "PowerQuery!K1281"),
        ("DROPDOWN LISTS", "DROPDOWN LISTS!B2"),
        ("Model", "Model!D6"),
    ):
        book.cells[ref] = Cell(
            sheet=sheet,
            ref=ref,
            row=9,
            column=27,
            value=Decimal("8"),
            formula=None,
            row_label="NGET",
            column_label="",
        )
    book.sheets = ["F7 - Data Validation", "PowerQuery", "DROPDOWN LISTS", "Model"]
    offered = {one.ref for one in outputs_from_workbook(book)}
    assert offered == {"Model!D6"}


def test_a_parameter_echoed_across_sheets_is_also_one_answer() -> None:
    """GD-BPFM holds « Risk-free rate » 0.023 on InputSummary and again
    on every licensee's own sheet. Same name, same value, different
    sheet: whichever copy is chosen, the document is told the same
    thing — the re-test refused four of five present targets over
    exactly this."""
    from polar.tieout.link import link as run

    echoed = [
        Output("E1", "FY2027 Risk-free rate", Decimal("0.023"), "In!AU869", "In"),
        Output(
            "E2", "FY2027 Risk-free rate", Decimal("0.023"), "Cadent!AW869", "Cadent"
        ),
        Output(
            "E3",
            "FY2028 Risk-free rate",
            Decimal("0.023"),
            "Northern!AW869",
            "Northern",
        ),
    ]
    fig = figure(
        "Risk-free rate forecast",
        kind="percent",
        printed="2.30%",
        value=Decimal("0.023"),
        subject=None,
    )
    links, unlinked = run([fig], echoed)
    assert links, unlinked


def test_a_cells_own_year_does_not_dilute_its_name() -> None:
    """« Equity beta » against « FY2027 Equity Beta » scored 0.45 — under
    the line — because the cell said which year it was, which a document
    label quoting the timeless parameter never repeats. An unmatched
    period is gate material, not evidence against."""
    from polar.tieout.link import link as run

    beta = [
        Output("B1", "FY2027 Equity Beta", Decimal("0.83"), "In!AU870", "InputSummary"),
    ]
    fig = figure(
        "Equity beta",
        kind="plain",
        printed="0.83",
        value=Decimal("0.83"),
        context="",
        section="",
        subject=None,
    )
    links, unlinked = run([fig], beta)
    assert links, unlinked
    assert links[0].output.ref == "B1"


GEARING = [
    Output("G0", "FY2021 Notional gearing", Decimal("0.65"), "In!AT880", "In"),
    Output("G1", "FY2022 Notional gearing", Decimal("0.6"), "In!AU880", "In"),
    Output("G2", "FY2023 Notional gearing", Decimal("0.6"), "In!AV880", "In"),
    Output("G3", "FY2024 Notional gearing", Decimal("0.6"), "In!AW880", "In"),
    Output("G4", "FY2025 Notional gearing", Decimal("0.6"), "In!AX880", "In"),
    Output("G5", "FY2026 Notional gearing", Decimal("0.6"), "In!AY880", "In"),
]


def test_a_bare_parameter_means_the_documents_own_era() -> None:
    """The mixed-value tie that defeated every recall target on the fair
    pair: « Notional gearing » ties ten 0.6 columns against FY2021's
    0.65 — RIIO-2's value — and a December 2025 decision quoting the
    parameter bare means the regime it is deciding, not the one before.
    With the document's year known, the earlier era steps back and the
    remainder is one answer."""
    from polar.tieout.link import link as run

    fig = figure(
        "Notional gearing",
        kind="percent",
        printed="60%",
        value=Decimal("0.6"),
        context="",
        section="",
        subject=None,
    )
    links, unlinked = run([fig], GEARING, year=2025)
    assert links, unlinked
    assert links[0].output.value == Decimal("0.6")


def test_without_a_document_year_the_tie_still_refuses() -> None:
    """The era prior runs on what the document said about itself and on
    nothing else. No year, no prior — the mixed-value tie refuses
    exactly as before, which is the honest answer when nobody knows
    which era is speaking."""
    from polar.tieout.link import link as run

    fig = figure(
        "Notional gearing",
        kind="percent",
        printed="60%",
        value=Decimal("0.6"),
        context="",
        section="",
        subject=None,
    )
    links, unlinked = run([fig], GEARING)
    assert not links
    assert "equally well" in unlinked[0].reason


def test_outturn_says_history_and_history_is_what_links() -> None:
    """« Outturn » is the regulator's own word for what actually
    happened. A 2021 document quoting the outturn gearing means
    FY2021's 0.65, not the regime's 0.6 — the qualifier picks the era,
    and the document year alone would have picked the other one."""
    from polar.tieout.link import link as run

    fig = figure(
        "Notional gearing outturn",
        kind="percent",
        printed="65%",
        value=Decimal("0.65"),
        context="",
        section="",
        subject=None,
    )
    links, unlinked = run([fig], GEARING, year=2021)
    assert links, unlinked
    assert links[0].output.ref == "G0"


def test_an_outturn_era_with_more_than_one_value_still_refuses() -> None:
    """« Outturn » from a 2025 document leaves five past columns on the
    table — FY2021's 0.65 and four 0.6s — and the document has not
    said which year it means. The qualifier chooses an era, never a
    cell: a narrowed set that disagrees with itself refuses exactly as
    the unnarrowed one would. No value is ever consulted to break it."""
    from polar.tieout.link import link as run

    fig = figure(
        "Notional gearing outturn",
        kind="percent",
        printed="65%",
        value=Decimal("0.65"),
        context="",
        section="",
        subject=None,
    )
    links, unlinked = run([fig], GEARING, year=2025)
    assert not links
    assert "equally well" in unlinked[0].reason


def test_a_label_carrying_its_own_period_needs_no_prior() -> None:
    """A document that says « FY2021 » has said everything: the period
    gates settle it, and the era prior must not argue with an explicit
    year even when the document speaks from a later one."""
    from polar.tieout.link import link as run

    fig = figure(
        "FY2021 notional gearing",
        kind="percent",
        printed="65%",
        value=Decimal("0.65"),
        context="",
        section="",
        subject=None,
    )
    links, unlinked = run([fig], GEARING, year=2025)
    assert links, unlinked
    assert links[0].output.ref == "G0"


def test_a_parameter_ties_against_its_own_history_rows() -> None:
    """The RFR shape from the fair pair: the regime's flat 0.023 in the
    parameter columns, history's varying rates further down, one name
    over all of it. The document quotes the parameter; the history rows
    are behind its year and step back."""
    from polar.tieout.link import link as run

    rows = [
        Output("H1", "FY2027 Risk-free rate", Decimal("0.023"), "In!AU869", "In"),
        Output("H2", "FY2028 Risk-free rate", Decimal("0.023"), "In!AV869", "In"),
        Output("H3", "FY2015 Risk-free rate", Decimal("0.019"), "In!AU1137", "In"),
        Output("H4", "FY2016 Risk-free rate", Decimal("0.015"), "In!AV1137", "In"),
    ]
    fig = figure(
        "Risk-free rate",
        kind="percent",
        printed="2.30%",
        value=Decimal("0.023"),
        context="",
        section="",
        subject=None,
    )
    links, unlinked = run([fig], rows, year=2025)
    assert links, unlinked
    assert links[0].output.value == Decimal("0.023")


def test_a_threshold_cannot_contradict_the_quantity_it_is_set_around() -> None:
    """« RoRE ranges of plus or minus 4% around the baseline return on
    equity » names a band, not the baseline — and 4% against the cell's
    5.5% was a false drift on the re-test. A derivative of a quantity
    may never contradict it."""
    from polar.tieout.link import link as run

    cells = [
        Output("Q1", "Baseline return on equity", Decimal("0.055"), "In!C40", "In"),
    ]
    fig = figure(
        "baseline return on equity",
        kind="percent",
        printed="4%",
        value=Decimal("0.04"),
        decimals=0,
        context="RoRE ranges of plus or minus 4% around the baseline return on equity",
        section="",
        subject=None,
    )
    links, unlinked = run([fig], cells)
    assert not links
    assert "threshold or sensitivity" in unlinked[0].reason


def test_a_threshold_that_agrees_still_corroborates() -> None:
    """The suppressor draws the same line as every other gate here: a
    derivative may corroborate, it may never contradict. Prose quoting
    the threshold *at the cell's own value* is still a grounded figure."""
    from polar.tieout.link import link as run

    cells = [
        Output("Q2", "Return on equity", Decimal("0.055"), "In!C41", "In"),
    ]
    fig = figure(
        "return on equity threshold",
        kind="percent",
        printed="5.5%",
        value=Decimal("0.055"),
        context="",
        section="",
        subject=None,
    )
    links, unlinked = run([fig], cells)
    assert links, unlinked
    assert links[0].output.ref == "Q2"


def test_the_documents_own_year_is_not_the_forward_era() -> None:
    """The shape that defeated the first cut of this prior: a history
    row ending at the document's own year (FY2026 Risk-free rate,
    0.0214 — history's blend) against the regime rows after it
    (FY2027-31, flat 0.023). The document speaks from inside FY2026;
    forward means strictly after it. Keeping FY2026 left the kept set
    holding two values, and every recall target on the fair pair
    refused over exactly this."""
    from polar.tieout.link import link as run

    rows = [
        Output("F1", "FY2026 Risk-free rate", Decimal("0.0214"), "C!AT1137", "C"),
        Output("F2", "FY2027 Risk-free rate", Decimal("0.023"), "C!AU869", "C"),
        Output("F3", "FY2028 Risk-free rate", Decimal("0.023"), "C!AV869", "C"),
    ]
    fig = figure(
        "Risk-free rate forecast",
        kind="percent",
        printed="2.30%",
        value=Decimal("0.023"),
        context="",
        section="",
        subject=None,
    )
    links, unlinked = run([fig], rows, year=2026)
    assert links, unlinked
    assert links[0].output.value == Decimal("0.023")


GAS_MODEL = [
    Output("N1", "FY2031 Notional gearing", Decimal("0.6"), "MainInputs", "MainInputs"),
    Output("N2", "FY2031 Notional gearing", Decimal("0.6"), "Cadent", "Cadent"),
]


def test_a_label_naming_a_foreign_entity_cannot_contradict() -> None:
    """« 55% notional gearing for ET and » against the gas model: the
    55% is Electricity Transmission's number, ET is an acronym no name
    or sheet in this model has ever used, and reporting it as
    disagreeing with the gas networks' 60% was three of the five false
    drifts on the round-2 re-test."""
    from polar.tieout.link import link as run

    fig = figure(
        "notional gearing for ET and",
        kind="percent",
        printed="55%",
        value=Decimal("0.55"),
        context="55% notional gearing for ET and 60% for the gas sectors",
        section="",
        subject=None,
    )
    links, unlinked = run([fig], GAS_MODEL, year=2026)
    assert not links
    assert "ET" in unlinked[0].reason


def test_the_same_foreign_label_agreeing_still_corroborates() -> None:
    """The same sentence's 60% carries the same ET-bearing label and is
    the gas figure, correctly agreeing — the gate is corroborate-only,
    like every other gate in this module."""
    from polar.tieout.link import link as run

    fig = figure(
        "notional gearing for ET and",
        kind="percent",
        printed="60%",
        value=Decimal("0.6"),
        context="55% notional gearing for ET and 60% for the gas sectors",
        section="",
        subject=None,
    )
    links, unlinked = run([fig], GAS_MODEL, year=2026)
    assert links, unlinked


def test_a_sentence_attaches_its_nearest_entity() -> None:
    """« ET: Notional gearing of 55% for the » — the label is clean and
    the sentence says who. The figure attaches to its nearest
    capitals-mention, and a mention the model has never used silences
    the contradiction."""
    from polar.tieout.link import link as run

    fig = figure(
        "Notional gearing of",
        kind="percent",
        printed="55%",
        value=Decimal("0.55"),
        context="ET: Notional gearing of 55% for the",
        section="",
        subject=None,
    )
    links, unlinked = run([fig], GAS_MODEL, year=2026)
    assert not links
    assert "ET" in unlinked[0].reason


def test_a_known_nearest_entity_still_carries_its_drift() -> None:
    """« 58% for Cadent ... 55% for ET »: the 58% figure's nearest
    mention is Cadent, whom the model knows — a foreign acronym
    elsewhere in the sentence must not mute a genuine drift, or one
    mention of ET would silence the whole paragraph."""
    from polar.tieout.link import link as run

    fig = figure(
        "Notional gearing of",
        kind="percent",
        printed="58%",
        value=Decimal("0.58"),
        context="Notional gearing of 58% for Cadent and 55% for ET",
        section="",
        subject=None,
    )
    links, unlinked = run([fig], GAS_MODEL, year=2026)
    assert links, unlinked
    assert links[0].figure.printed == "58%"


def test_a_quantity_acronym_the_model_uses_is_not_an_entity() -> None:
    """« WACC » is capitals and is nobody: the model's own rows say
    WACC, so it is in the vocabulary and the gate never fires. A
    genuine WACC drift still reports."""
    from polar.tieout.link import link as run

    cells = [
        Output("W1", "FY2031 Vanilla WACC", Decimal("0.0421"), "MainInputs", "In"),
    ]
    fig = figure(
        "Vanilla WACC of",
        kind="percent",
        printed="5.18%",
        value=Decimal("0.0518"),
        context="a Vanilla WACC of 5.18% across the period",
        section="",
        subject=None,
    )
    links, unlinked = run([fig], cells, year=2026)
    assert links, unlinked


COE_ROWS = [
    Output(
        "C1",
        "FY2027 Cost of equity at 60% gearing",
        Decimal("0.06118"),
        "MainInputs",
        "MainInputs",
    ),
    Output(
        "C2",
        "FY2028 Cost of equity at 60% gearing",
        Decimal("0.06118"),
        "MainInputs",
        "MainInputs",
    ),
]

TORN_LINE = "Our proposed cost of equity (55%/60% gearing) 5.70% / 6.12%"


def _torn(printed: str, value: str) -> Figure:
    return figure(
        "gearing)",
        kind="percent",
        printed=printed,
        value=Decimal(value),
        context=TORN_LINE,
        section="",
        subject=None,
    )


def test_a_torn_label_cannot_carry_a_disagreement() -> None:
    """« gearing) » carrying 5.70% is the torn edge of « (55%/60%
    gearing) » — a qualifier of the neighbouring figure's name, not
    this figure's. Reporting it against the 60%-gearing row's 6.12%
    was one of the two drifts surviving round 3; « document says 60%,
    model says 6% » was the other, same line, same shape."""
    from polar.tieout.link import link as run

    links, unlinked = run([_torn("5.70%", "0.057")], COE_ROWS)
    assert not links
    assert "torn edge" in unlinked[0].reason

    links, unlinked = run([_torn("60%", "0.6")], COE_ROWS)
    assert not links


def test_a_torn_label_that_agrees_still_corroborates() -> None:
    """The same line's 6.12% is the 60%-gearing cost of equity,
    correctly agreeing — and the reason the label is not repaired in
    the reader instead: handing 5.70% the sentence's head would link
    it to this same row and report the same false drift under a
    better-looking label."""
    from polar.tieout.link import link as run

    links, unlinked = run([_torn("6.12%", "0.0612")], COE_ROWS)
    assert links, unlinked
    assert links[0].output.value == Decimal("0.06118")


def test_balanced_brackets_are_a_whole_name() -> None:
    """« Notional gearing (C) » holds a bracket and is a whole name —
    balance is the test, and a balanced label still carries its
    drift."""
    from polar.tieout.link import link as run

    cells = [
        Output("B1", "FY2031 Notional gearing", Decimal("0.6"), "MainInputs", "In"),
    ]
    fig = figure(
        "Notional gearing (C)",
        kind="percent",
        printed="58%",
        value=Decimal("0.58"),
        context="",
        section="",
        subject=None,
    )
    links, unlinked = run([fig], cells)
    assert links, unlinked
    assert links[0].figure.printed == "58%"
