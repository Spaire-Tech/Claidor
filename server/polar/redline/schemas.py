from polar.kit.schemas import Schema


class RedlineFinding(Schema):
    """One defect, and everything the add-in needs to show and locate it."""

    defect: str
    severity: str
    certainty: str
    term: str
    #: One sentence a reader can check against the span.
    note: str
    #: The document's own words around the defect.
    context: str
    #: Character offsets into the text that was submitted.
    start: int
    end: int
    #: Exactly as written at this span — for a case mismatch, the point.
    literal: str
    #: Which hit this is when Word searches the document for ``literal``.
    #: Office.js locates text by searching and returns every match; this
    #: says which one the finding meant.
    occurrence: int


class RedlineReview(Schema):
    """The Check panel's contents for one document."""

    findings: list[RedlineFinding]
    #: Totals by severity, so the panel can show « Critical (2) » without
    #: counting client-side and disagreeing with the list.
    critical_count: int
    warning_count: int
    to_review_count: int
    #: Length of the text that was checked. The panel says what was read,
    #: so a truncated or empty selection is visible rather than silent.
    characters: int


class RedlineRequest(Schema):
    """Document text, as Office.js read it out of Word."""

    text: str
