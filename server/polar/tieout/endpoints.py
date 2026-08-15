"""The routes behind the deal page, the panel, and everything between.

Written against ``docs/pierce/ui-work-order.md``, which fixed every shape
here before any of them existed so the screens could be built in parallel.
Where a route and that document disagree the route is wrong.

**Membership, on every route, without exception.** A deal is closed by
default and organization membership grants nothing, so a banker outside
the deal gets 404 rather than 403 — they do not learn that it exists. The
scope on the dependency says what kind of caller this is; it never says
which deals they are on, and conflating the two is how a workspace leaks.

Ingestion runs inline. A Cascade model reads in under a second and the
slowest workbook in the 1,577-file corpus took forty. The moment that
stops being true this moves behind the worker, which is why an artifact
carries a `processing` status and the screen polls it: the shape is
already right for the day the work moves.
"""

from datetime import timedelta
from uuid import UUID

from fastapi import Depends, File, HTTPException, Query, UploadFile

from polar.auth.dependencies import WebUserWrite
from polar.auth.scope import Scope
from polar.dossier.agent.service import AgentNotConfigured
from polar.dossier.agent.service import build_client as agent_client
from polar.exceptions import ClaidorRequestValidationError, ResourceNotFound
from polar.kit.db.postgres import AsyncReadSession, AsyncSession
from polar.models import (
    Artifact,
    ArtifactKind,
    CheckKind,
    CheckRun,
    Correction,
    CorrectionState,
    Dossier,
    Figure,
    FigureLink,
    Finding,
    FindingKind,
    FindingState,
    HouseRules,
    LinkState,
    ModelCell,
    OneOffCheck,
    User,
)
from polar.openapi import APITag
from polar.postgres import get_db_read_session, get_db_session
from polar.routing import APIRouter
from polar.user.repository import UserRepository

from . import auth
from .agent import service as agent
from .audit import RULE_NAMES
from .ingest import Unreadable, kind_for
from .repository import TieOutRepository
from .schemas import (
    AgainstModel,
    ArtifactPage,
    ArtifactRead,
    Ask,
    Asked,
    AskedStep,
    AuditRuleRead,
    CellRead,
    ChainRead,
    ChainStep,
    CheckRunRead,
    CorrectionDecision,
    CorrectionRead,
    Coverage,
    DealListItem,
    DealPage,
    DecisionRead,
    FigureMap,
    FigureRead,
    FindingCounts,
    FindingRead,
    FindingSource,
    FindingUpdate,
    FindingWhere,
    HiddenFinding,
    HiddenReport,
    HouseRulesRead,
    HouseRulesUpdate,
    Identified,
    Identify,
    LinkAlternative,
    LinkCell,
    LinkDecision,
    LinkFigure,
    LinkRead,
    ModelDiff,
    ModelGrid,
    OneOffDefect,
    OneOffDrift,
    OneOffResult,
    PanelToken,
    RecentCheck,
    SlideFigures,
    SoloFindingRead,
    TeamMember,
    TeamRead,
    Uploader,
    VersionRead,
)
from .service import tieout
from .storage import FileNotKept, download_url, fetch
from .writing import NotCorrectable, writing

router = APIRouter(prefix="/tieout", tags=["tieout", APITag.private])

NOT_FOUND = "Deal not found."

#: Well past the largest model in the corpus. A bank's LBO with twelve
#: years of monthly detail is a few megabytes; much larger than this is a
#: mistake worth catching before it reaches a parser.
MAX_UPLOAD_BYTES = 64 * 1024 * 1024

#: How many models, decks and memos the deal page carries. A deal with
#: more than this many *documents* — not files — is not a deal any more,
#: and the data room's own route is how you would look at them.
MAX_DOCUMENTS = 200

#: One page of the data room. Enough that scrolling is rare and small
#: enough that the payload stays flat as the room fills.
PAGE = 100
MAX_PAGE = 500

#: How long the panel's token lasts. Thirty days is long enough that a
#: banker is not signing in every morning — which is the fastest way to
#: make a panel go unused — and short enough that one left on a shared
#: machine stops working without anybody having to notice.
PANEL_TOKEN_LIFE = timedelta(days=30)


# --- access --------------------------------------------------------------


async def _deal(
    session: AsyncSession | AsyncReadSession, dossier_id: UUID, user_id: UUID
) -> Dossier:
    """The deal, if the caller is on it. Otherwise 404, not 403."""
    from polar.dossier.repository import DossierRepository

    deal = await DossierRepository.from_session(session).get_for_user(
        dossier_id, user_id
    )
    if deal is None:
        raise ResourceNotFound(NOT_FOUND)
    return deal


async def _artifact_in_deal(
    session: AsyncSession | AsyncReadSession, artifact_id: UUID, user_id: UUID
) -> Artifact:
    repository = TieOutRepository.from_session(session)
    artifact = await repository.get_artifact(artifact_id)
    if artifact is None:
        raise ResourceNotFound("File not found.")
    await _deal(session, artifact.dossier_id, user_id)
    return artifact


# --- rendering -----------------------------------------------------------


def _uploader(user: User | None) -> Uploader | None:
    if user is None:
        return None
    return Uploader(id=user.id, name=user.public_name, avatar_url=user.avatar_url)


def _artifact(artifact: Artifact, uploader: User | None) -> ArtifactRead:
    return ArtifactRead(
        id=artifact.id,
        kind=artifact.kind,
        filename=artifact.filename,
        version=artifact.version,
        lineage_id=artifact.lineage_id,
        status=artifact.status,
        error=artifact.error,
        counts=artifact.counts or {},
        uploaded_by=_uploader(uploader),
        uploaded_at=artifact.created_at,
    )


def _run(run: CheckRun | None) -> CheckRunRead | None:
    if run is None:
        return None
    return CheckRunRead(
        id=run.id,
        kind=run.kind,
        status=run.status,
        summary=run.summary or {},
        error=run.error,
        started_at=run.started_at,
        finished_at=run.finished_at,
    )


async def _decisions(
    repository: TieOutRepository, dossier_id: UUID
) -> list[DecisionRead]:
    """What the team decided — derived, never authored.

    Assembled from corrections that were decided and findings that were
    dismissed, so the log can never disagree with the records it
    describes. Only judgements about numbers belong here: connecting a
    folder or uploading a file is plumbing, and one plumbing entry is how
    a decision log turns into an activity feed and drowns.

    The sentence is the server's, factual and short; the person's own
    note is carried beside it and beats it on screen when present.
    """
    corrections = [
        one
        for one in await repository.corrections_of(dossier_id)
        if one.decided_at is not None
        and one.state
        in (
            CorrectionState.applied,
            CorrectionState.rejected,
            CorrectionState.reversed,
        )
    ]
    dismissed = [
        one
        for one in await repository.findings_of(
            dossier_id, state=FindingState.dismissed
        )
        if one.dismissed_at is not None
    ]
    people = await repository.uploaders(
        [one.decided_by_id for one in corrections if one.decided_by_id]
        + [one.dismissed_by_id for one in dismissed if one.dismissed_by_id]
    )

    entries: list[DecisionRead] = []
    for one in corrections:
        where = one.location or f"page {one.page}"
        if one.state is CorrectionState.applied:
            action = "accepted"
            text = f"Accepted {one.after} over {one.before} — {where}."
        elif one.state is CorrectionState.rejected:
            action = "kept"
            text = f"Kept the document's {one.before} — {where}."
        else:
            action = "reversed"
            text = f"Took back {one.after} — {where}. The document reads as it did."
        entries.append(
            DecisionRead(
                id=one.id,
                who=_uploader(
                    people.get(one.decided_by_id) if one.decided_by_id else None
                ),
                at=one.decided_at,  # type: ignore[arg-type]
                action=action,
                text=text,
            )
        )
    for finding in dismissed:
        entries.append(
            DecisionRead(
                id=finding.id,
                who=_uploader(
                    people.get(finding.dismissed_by_id)
                    if finding.dismissed_by_id
                    else None
                ),
                at=finding.dismissed_at,  # type: ignore[arg-type]
                action="dismissed",
                text=f"Dismissed « {finding.title} » — {finding.location}.",
                note=finding.note,
            )
        )

    entries.sort(key=lambda one: one.at, reverse=True)
    return entries


def _correction(correction: Correction, decider: User | None = None) -> CorrectionRead:
    return CorrectionRead(
        id=correction.id,
        fingerprint=correction.fingerprint,
        state=correction.state,
        where=correction.where,
        before=correction.before,
        after=correction.after,
        source=correction.source,
        page=correction.page,
        location=correction.location,
        artifact_id=correction.artifact_id,
        wrote_artifact_id=correction.wrote_artifact_id,
        error=correction.error,
        decided_by=_uploader(decider),
        decided_at=correction.decided_at,
        created_at=correction.created_at,
    )


def _finding(
    finding: Finding,
    filenames: dict[UUID, str],
    corrections: dict[str, Correction] | None = None,
) -> FindingRead:
    evidence = finding.evidence or {}
    model_id = evidence.get("model_artifact_id")
    correction = (corrections or {}).get(finding.fingerprint)
    return FindingRead(
        correction=_correction(correction) if correction else None,
        id=finding.id,
        kind=finding.kind,
        severity=finding.severity,
        state=finding.state,
        confidence=evidence.get("confidence"),
        one_tick=finding.one_tick,
        page=finding.page,
        printed=finding.printed,
        expected=finding.expected,
        title=finding.title,
        where=FindingWhere(
            artifact_id=finding.artifact_id,
            filename=filenames.get(finding.artifact_id)
            if finding.artifact_id
            else None,
            label=f"slide {finding.page}" if finding.page else finding.location,
            detail=finding.location,
            anchor=finding.anchor or {},
        ),
        source=FindingSource(
            ref=evidence.get("source") or evidence.get("ref"),
            name=evidence.get("name"),
            basis=evidence.get("basis"),
            artifact_id=UUID(str(model_id)) if model_id else None,
        ),
        context=finding.detail,
        standard=finding.standard or None,
        rule=finding.rule or None,
        created_at=finding.created_at,
        note=finding.note,
    )


def _value(cell: ModelCell) -> str | None:
    return None if cell.value is None else f"{cell.value.normalize():f}"


def _link(
    link: FigureLink,
    figures: dict[UUID, Figure],
    cells: dict[UUID, ModelCell],
    confirmer: User | None = None,
) -> LinkRead:
    figure = figures.get(link.figure_id)
    cell = cells.get(link.cell_id)
    return LinkRead(
        id=link.id,
        state=link.state,
        confidence=float(link.confidence),
        transformation=link.transformation,
        figure=LinkFigure(
            id=figure.id,
            printed=figure.printed,
            label=figure.label or link.figure_label,
            location=figure.location,
            page=figure.page,
            artifact_id=figure.artifact_id,
        )
        if figure
        else None,
        cell=LinkCell(
            id=cell.id,
            ref=cell.ref,
            name=cell.name or link.cell_name,
            value=_value(cell),
            basis=link.basis or None,
            artifact_id=cell.artifact_id,
        )
        if cell
        else None,
        confirmed_by=_uploader(confirmer),
        confirmed_at=link.confirmed_at,
    )


# --- the deal page -------------------------------------------------------


@router.get("/deals/{dossier_id}", response_model=DealPage)
async def get_deal(
    dossier_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> DealPage:
    """Everything the deal page needs, in one request.

    The coverage line is not decoration. « 102 of 128 figures reconciled ·
    26 not checked » is the product being honest about its own reach, and
    the 26 lead through to the reasons. An engine that hides its misses is
    an engine nobody can calibrate against.
    """
    deal = await _deal(session, dossier_id, auth_subject.subject.id)
    repository = TieOutRepository.from_session(session)

    # The documents the deal is built on — the current model, deck and
    # memo — rather than the data room. A deal holds tens of these and
    # thousands of the other, and every screen was paying for the one that
    # browses files.
    documents, _ = await repository.page_artifacts(
        dossier_id,
        kinds=[
            ArtifactKind.model,
            ArtifactKind.deck,
            ArtifactKind.memo,
            ArtifactKind.message,
            ArtifactKind.source,
        ],
        limit=MAX_DOCUMENTS,
    )
    by_id = await repository.uploaders([one.uploaded_by_id for one in documents])
    files, lineages = await repository.count_artifacts(dossier_id)

    counts = await repository.count_findings(dossier_id)

    # **Stale is the same fact the deals list serves**: a current document
    # that arrived after the last tie-out finished. The banner's second
    # line counts what that run actually read — its own artifacts, their
    # own figure counts — so the sentence is a sum, not an estimate.
    run = await repository.latest_run(dossier_id, CheckKind.tieout)
    stale_kind: str | None = None
    stale_at = None
    stale_documents = 0
    stale_figures = 0
    if run is not None and run.finished_at is not None:
        for artifact in documents:
            if artifact.created_at > run.finished_at and (
                stale_at is None or artifact.created_at > stale_at
            ):
                stale_kind = artifact.kind.value
                stale_at = artifact.created_at
        if stale_at is not None:
            # JSONB holds the ids as strings; compare in one spelling.
            read_ids = {str(one) for one in (run.artifact_ids or [])}
            for artifact in documents:
                if (
                    str(artifact.id) in read_ids
                    and artifact.kind is not ArtifactKind.model
                ):
                    stale_documents += 1
                    stale_figures += int((artifact.counts or {}).get("figures", 0))

    return DealPage(
        stale=stale_at is not None,
        stale_kind=stale_kind,
        stale_at=stale_at,
        stale_documents=stale_documents,
        stale_figures=stale_figures,
        decisions=await _decisions(repository, dossier_id),
        id=deal.id,
        name=deal.name,
        client=deal.client_name,
        organization_id=deal.organization_id,
        coverage=Coverage(**await tieout.coverage_of(session, dossier_id=dossier_id)),
        documents=[_artifact(one, by_id.get(one.uploaded_by_id)) for one in documents],
        files=files,
        lineages=lineages,
        findings=FindingCounts(
            open=counts.get("open", 0),
            accepted=counts.get("accepted", 0),
            dismissed=counts.get("dismissed", 0),
            fixed=counts.get("fixed", 0),
        ),
        last_tieout=_run(await repository.latest_run(dossier_id, CheckKind.tieout)),
        last_audit=_run(await repository.latest_run(dossier_id, CheckKind.audit)),
    )


# --- the panel -----------------------------------------------------------


@router.post("/panel/token", response_model=PanelToken, status_code=201)
async def panel_token(
    auth_subject: WebUserWrite,
    session: AsyncSession = Depends(get_db_session),
) -> PanelToken:
    """Mint the credential the panel holds, from a browser session.

    The panel runs in an iframe on its own origin inside Office, where a
    `SameSite=Lax` session cookie is never sent and Safari and Edge block
    third-party cookies outright. So it holds a bearer token, and this is
    where one comes from: the sign-in dialog is a real top-level window,
    the cookie works *there*, and the token is what crosses back.

    **A web session only, and that is the whole security property.** A
    token must never be able to mint a token, or a narrowly-scoped one is
    one request away from a wide one and revoking the first would not
    revoke what it had already issued. `WebUserWrite` requires a reserved
    scope, which no token can hold or request — so reaching this route
    means « a person, freshly signed in through a browser ».

    Two scopes, fixed, never taken from the request. The panel reads
    figures and confirms links; it has no business creating organizations,
    and a caller that could name its own scopes would make this endpoint a
    way to widen any session into anything.
    """
    from polar.personal_access_token.service import (
        personal_access_token as tokens,
    )

    scopes = {Scope.tieout_read, Scope.tieout_write}
    _, token = await tokens.create(
        session,
        auth_subject,
        comment="Claidor panel (Office add-in)",
        scopes=scopes,
        # Long enough that a banker is not signing in every morning, short
        # enough that a token left on a shared machine stops working. The
        # panel watches the expiry and asks again rather than letting the
        # first 401 of the day be the notification.
        expires_in=PANEL_TOKEN_LIFE,
    )
    return PanelToken(
        token=token,
        expires_in=int(PANEL_TOKEN_LIFE.total_seconds()),
        scopes=sorted(scope.value for scope in scopes),
    )


@router.get("/deals", response_model=list[DealListItem])
async def list_deals(
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[DealListItem]:
    """Every deal this person is on — the panel's picker, and Projects.

    The panel asks once per document and then never again, because the
    answer is written into the document itself. Projects asks every time it
    is opened, because « which of my deals has something wrong with it » is
    the question it exists to answer.

    Each row carries when it was last checked, so that a deal nobody has
    run can say « not run » instead of showing the same empty findings
    count as a deal that was checked this morning.
    """
    repository = TieOutRepository.from_session(session)
    deals = await repository.deals_for(auth_subject.subject.id)
    visits = await repository.visits_for(auth_subject.subject.id)
    items: list[DealListItem] = []
    for deal in deals:
        counts = await repository.count_findings(deal.id)
        run = await repository.latest_run(deal.id, CheckKind.tieout)
        current = await repository.current_artifacts(deal.id)

        # **Stale is a fact about timestamps, not a judgement.** A current
        # document that arrived after the run finished was never read by
        # it, so everything the run said — including this row's findings
        # count — describes a deal that no longer exists. The latest such
        # arrival names the row's sentence.
        stale_kind: str | None = None
        stale_at = None
        if run is not None and run.finished_at is not None:
            for artifact in current:
                arrived = artifact.created_at
                if arrived > run.finished_at and (
                    stale_at is None or arrived > stale_at
                ):
                    stale_kind = artifact.kind.value
                    stale_at = arrived

        # « Since you looked » — derived from this person's last visit
        # against the records, never stored as its own claim. The watch
        # re-syncs and re-checks in the background, which clears *stale*
        # without anyone looking; these two numbers are what keep that
        # from being silent. A person who has never opened the deal gets
        # zeros, not « everything is new »: the row's own counts already
        # tell a first-time reader everything.
        visited_at = visits.get(deal.id)
        arrived_since = 0
        findings_since = 0
        open_findings = await repository.findings_of(
            deal.id, state=FindingState.open
        )
        if visited_at is not None:
            arrived_since = sum(
                1 for artifact in current if artifact.created_at > visited_at
            )
            findings_since = sum(
                1 for finding in open_findings if finding.created_at > visited_at
            )

        # « 6 checks fail », not « 41 findings »: the row states how many
        # *checks* the model does not pass, and one check can produce many
        # findings. Distinct rules among the open findings — the tie-out
        # findings carry no rule and so collapse into one check between
        # them, which is right: they are all the same check failing.
        failing_checks = len({finding.rule for finding in open_findings})

        items.append(
            DealListItem(
                id=deal.id,
                name=deal.name,
                client=deal.client_name,
                artifacts=len(current),
                open_findings=counts.get("open", 0),
                failing_checks=failing_checks,
                # The run's own finishing time, not the row's: a run that
                # was started and never finished has not checked anything.
                checked_at=run.finished_at if run else None,
                stale=stale_at is not None,
                stale_kind=stale_kind,
                stale_at=stale_at,
                visited_at=visited_at,
                arrived_since_visit=arrived_since,
                findings_since_visit=findings_since,
            )
        )
    return items


@router.post("/deals/{dossier_id}/visit", status_code=204)
async def visit_deal(
    dossier_id: UUID,
    auth_subject: auth.TieOutWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """This person looked at this deal — the workspace fires it on open.

    Its own POST rather than a side effect of the page GET, because a
    read that writes breaks read replicas and surprises caches. What it
    buys: « since you looked » on the deals list resets the moment the
    deal is actually opened, and only for the person who opened it.
    """
    await _deal(session, dossier_id, auth_subject.subject.id)
    repository = TieOutRepository.from_session(session)
    await repository.mark_visited(dossier_id, auth_subject.subject.id)


@router.post("/identify", response_model=Identified)
async def identify(
    body: Identify,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> Identified:
    """Work out which artifact the open document is.

    The panel's first call, and the thing every other panel screen waits
    on. Three ways to answer it, tried in this order:

    1. **The stamp.** The panel writes the lineage id into the document's
       own settings the first time a person picks a deal for it. It
       travels inside the file, survives Save As and a rename, and is the
       only answer that is not a guess.
    2. **The filename, inside a deal the user has already chosen.** Good
       enough for « the model » and wrong precisely when two deals hold a
       file of the same name — which is why it is never used across deals.
    3. **Nothing.** The honest answer, and the panel asks.

    `matched_by` says which happened, so a screen can offer « is this the
    right deal? » on a guess and stay quiet on a stamp. A panel that
    silently attaches the wrong deck to the wrong deal reports drift
    against a model that has nothing to do with it, which is the most
    expensive wrong answer this product could give.
    """
    repository = TieOutRepository.from_session(session)
    user_id = auth_subject.subject.id

    artifact: Artifact | None = None
    matched_by = "none"

    if body.lineage_id is not None:
        artifact = await repository.latest_of_lineage(body.lineage_id)
        if artifact is not None:
            try:
                await _deal(session, artifact.dossier_id, user_id)
            except ResourceNotFound:
                # The stamp is real and this person is not on the deal. It
                # does not exist for them, and it is not a hint either.
                artifact = None
            else:
                matched_by = "stamp"

    if artifact is None and body.dossier_id and body.filename:
        await _deal(session, body.dossier_id, user_id)
        lineage = await repository.find_lineage(body.dossier_id, body.filename)
        if lineage is not None:
            artifact = await repository.latest_of_lineage(lineage)
            matched_by = "filename" if artifact else "none"

    if artifact is None:
        return Identified(
            matched_by="none",
            dossier_id=None,
            dossier_name=None,
            artifact=None,
        )

    deal = await _deal(session, artifact.dossier_id, user_id)
    uploader = await repository.uploaders([artifact.uploaded_by_id])
    return Identified(
        matched_by=matched_by,
        dossier_id=deal.id,
        dossier_name=deal.name,
        artifact=_artifact(artifact, uploader.get(artifact.uploaded_by_id)),
        # Only worth stamping when it was not already stamped.
        stamp_lineage_id=artifact.lineage_id if matched_by == "filename" else None,
    )


# --- files ---------------------------------------------------------------


@router.post("/deals/{dossier_id}/artifacts", response_model=ArtifactRead)
async def upload_artifact(
    dossier_id: UUID,
    auth_subject: auth.TieOutWrite,
    upload: UploadFile = File(..., alias="file"),
    kind: ArtifactKind | None = Query(
        default=None,
        description="Left out, it is taken from the file's extension.",
    ),
    session: AsyncSession = Depends(get_db_session),
) -> ArtifactRead:
    """Drop a file into the deal and read it into rows.

    A file that cannot be read is **kept**, with the reason on it. The deal
    page has to be able to say « this one did not work, and here is what to
    do about it », which is impossible if the row is thrown away — and the
    reason is always something a person can act on, never « extraction
    failed ».

    Re-uploading a file with the same name makes a new version of the same
    document rather than a second document, which is what a banker means
    by « the model ».
    """
    user = auth_subject.subject
    await _deal(session, dossier_id, user.id)

    payload = await upload.read()
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="That file is too large to read.")

    filename = upload.filename or "upload"
    resolved = kind or kind_for(filename)
    if resolved is None:
        raise HTTPException(
            status_code=415,
            detail=(
                f"{filename} is not a file this can read — models are "
                ".xlsx or .xls, decks are .pptx, memos are .docx, and a "
                "source document is a .pdf"
            ),
        )

    artifact = await tieout.ingest(
        session,
        dossier_id=dossier_id,
        kind=resolved,
        filename=filename,
        payload=payload,
        user_id=user.id,
    )
    return _artifact(artifact, user)


@router.get("/deals/{dossier_id}/artifacts", response_model=ArtifactPage)
async def list_deal_artifacts(
    dossier_id: UUID,
    auth_subject: auth.TieOutRead,
    q: str = Query("", description="Words from the filename."),
    kind: ArtifactKind | None = Query(None),
    limit: int = Query(PAGE, ge=1, le=MAX_PAGE),
    offset: int = Query(0, ge=0),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> ArtifactPage:
    """The data room, a page at a time.

    One row per document rather than per upload: re-uploading the deck six
    times is one deck. `version` on a row says how many there have been,
    and the older ones are reachable from the document's own page.

    `total` comes back with the page, because « showing 100 of 3,003 » is
    a line this screen has to be able to write. A list that quietly draws
    the first hundred reads as « that is all of them ».
    """
    await _deal(session, dossier_id, auth_subject.subject.id)
    repository = TieOutRepository.from_session(session)
    rows, total = await repository.page_artifacts(
        dossier_id,
        query=q.strip(),
        kinds=[kind] if kind else None,
        limit=limit,
        offset=offset,
    )
    by_id = await repository.uploaders([one.uploaded_by_id for one in rows])
    return ArtifactPage(
        items=[_artifact(one, by_id.get(one.uploaded_by_id)) for one in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/artifacts/{artifact_id}", response_model=ArtifactRead)
async def get_artifact(
    artifact_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> ArtifactRead:
    """One file's state. What the upload component polls while it reads."""
    artifact = await _artifact_in_deal(session, artifact_id, auth_subject.subject.id)
    uploader = await UserRepository.from_session(session).get_by_id(
        artifact.uploaded_by_id
    )
    return _artifact(artifact, uploader)


@router.get("/artifacts/{artifact_id}/versions", response_model=list[VersionRead])
async def list_versions(
    artifact_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[VersionRead]:
    """Every upload of this document, newest first.

    Versions share the artifact's lineage: `v3` is the same document as
    `v1`, uploaded again. Each row carries its own counts, so a screen
    can say what a version brought without a diff engine behind it.
    """
    artifact = await _artifact_in_deal(session, artifact_id, auth_subject.subject.id)
    repository = TieOutRepository.from_session(session)
    versions = [
        one
        for one in await repository.list_artifacts(artifact.dossier_id)
        if one.lineage_id == artifact.lineage_id
    ]
    versions.sort(key=lambda one: one.version, reverse=True)
    people = await repository.uploaders([one.uploaded_by_id for one in versions])
    return [
        VersionRead(
            id=one.id,
            version=one.version,
            uploaded_by=_uploader(people.get(one.uploaded_by_id)),
            uploaded_at=one.created_at,
            counts=one.counts or {},
        )
        for one in versions
    ]


@router.get("/artifacts/{artifact_id}/metadata", response_model=HiddenReport)
async def get_metadata(
    artifact_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> HiddenReport:
    """What travels with this file that is not on its screen.

    The metadata checker — speaker notes, hidden slides, very hidden
    sheets, cropped images, external folder paths — run on the stored
    bytes, on request. Computed rather than persisted: it is a second's
    work, it is always about the current version, and a stored copy is
    one more thing that can silently disagree with the file.

    A file the checker does not read — a PDF, a legacy .doc, a password-
    protected workbook — comes back with `refused` holding the checker's
    own sentence. That is an answer about the file, not an error.
    """
    from .metadata import NotAnOfficeFile, read_metadata_bytes

    artifact = await _artifact_in_deal(session, artifact_id, auth_subject.subject.id)
    try:
        payload = fetch(artifact)
    except FileNotKept as problem:
        # The storage sentence talks about correcting; this route is
        # about reading. Same fact, this route's own words.
        raise HTTPException(
            status_code=409,
            detail=(
                f"{artifact.filename} is not stored here any more, so what "
                "travels with it cannot be read. Upload it again."
            ),
        ) from problem

    try:
        report = read_metadata_bytes(payload)
    except NotAnOfficeFile as problem:
        return HiddenReport(kind="", parts=0, findings=[], refused=str(problem))

    return HiddenReport(
        kind=report.kind,
        parts=report.parts,
        findings=[
            HiddenFinding(
                rule=one.rule,
                severity=one.severity,
                where=one.where,
                detail=one.detail,
                evidence=one.evidence,
            )
            for one in report.findings
        ],
    )


@router.delete("/artifacts/{artifact_id}", status_code=204)
async def delete_artifact(
    artifact_id: UUID,
    auth_subject: auth.TieOutWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Take a file out of the deal.

    Soft, and its figures and cells go with it — but the findings do not.
    A finding somebody dismissed has to stay dismissed even after the file
    it came from leaves and comes back.
    """
    artifact = await _artifact_in_deal(session, artifact_id, auth_subject.subject.id)
    artifact.set_deleted_at()
    session.add(artifact)
    await session.flush()


@router.get("/artifacts/{artifact_id}/figures", response_model=FigureMap)
async def get_figure_map(
    artifact_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> FigureMap:
    """Every number in the deck, slide by slide, and what became of it.

    The unlinked ones matter most. They are what the tool did *not* check,
    and showing them with the reason attached is the difference between
    honest and impressive.
    """
    artifact = await _artifact_in_deal(session, artifact_id, auth_subject.subject.id)
    slides = await tieout.figure_map(
        session, dossier_id=artifact.dossier_id, artifact_id=artifact_id
    )
    return FigureMap(
        artifact_id=artifact.id,
        filename=artifact.filename,
        slides=[
            SlideFigures(page=page, figures=[FigureRead(**one) for one in figures])
            for page, figures in slides
        ],
    )


@router.get("/artifacts/{artifact_id}/cells", response_model=list[CellRead])
async def search_cells(
    artifact_id: UUID,
    auth_subject: auth.TieOutRead,
    q: str = Query(min_length=2, description="Words from the cell's label."),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[CellRead]:
    """Find a cell by name, for « point it somewhere else »."""
    await _artifact_in_deal(session, artifact_id, auth_subject.subject.id)
    repository = TieOutRepository.from_session(session)
    return [
        CellRead(
            id=cell.id,
            ref=cell.ref,
            sheet=cell.sheet,
            name=cell.name,
            value=_value(cell),
            formula=cell.formula,
        )
        for cell in await repository.search_cells(artifact_id, q)
    ]


@router.get("/artifacts/{artifact_id}/grid", response_model=ModelGrid)
async def get_model_grid(
    artifact_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> ModelGrid:
    """The model as a person reads it: sheets, rows down, periods across.

    Every cell that carries a label, with `linked` marking the ones a
    deliverable is standing on. Capped per sheet, and each sheet says how
    many rows it really has — a screen that quietly drew the first two
    hundred would be claiming the model is smaller than it is.
    """
    artifact = await _artifact_in_deal(session, artifact_id, auth_subject.subject.id)
    grid = await tieout.model_grid(
        session, dossier_id=artifact.dossier_id, artifact_id=artifact_id
    )
    if grid is None:
        raise ResourceNotFound(NOT_FOUND)
    return ModelGrid(**grid)


@router.get("/artifacts/{artifact_id}/diff", response_model=ModelDiff | None)
async def get_model_diff(
    artifact_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> ModelDiff | None:
    """What moved since the version before, and what went stale with it.

    `null` when this is the first version: there is nothing to compare
    against, which is not an error.
    """
    artifact = await _artifact_in_deal(session, artifact_id, auth_subject.subject.id)
    diff = await tieout.model_diff(
        session, dossier_id=artifact.dossier_id, artifact_id=artifact_id
    )
    return ModelDiff(**diff) if diff else None


# --- checks --------------------------------------------------------------


@router.post("/deals/{dossier_id}/check", response_model=list[CheckRunRead])
async def run_checks(
    dossier_id: UUID,
    auth_subject: auth.TieOutWrite,
    session: AsyncSession = Depends(get_db_session),
) -> list[CheckRunRead]:
    """Every check this deal can answer, in one press.

    Three now, because they answer three different questions and a banker
    asking « is this deck right » means all of them: does the deck agree
    with the model, does the model agree with itself, and does the model
    agree with the documents its inputs came out of. Reads rows only: no
    file is opened, which is what makes a confirmed link re-checkable
    forever.

    A run that could not happen — no model in the deal yet, no source
    document to ground anything in — comes back `failed` with a sentence
    rather than an HTTP error. It is a state of the deal, not a bad
    request, and « this deal has no source document » is a fact worth
    putting on screen rather than an error worth hiding.
    """
    await _deal(session, dossier_id, auth_subject.subject.id)
    user_id = auth_subject.subject.id
    runs = [
        await tieout.run_tieout(session, dossier_id=dossier_id, user_id=user_id),
        await tieout.run_audit(session, dossier_id=dossier_id, user_id=user_id),
    ]
    # The firm's call, from the house rules. A pass switched off simply
    # does not run — no failed row, no error: the runs list says what
    # ran, and two entries is the honest answer.
    if await tieout.grounding_on(session, dossier_id=dossier_id):
        runs.append(
            await tieout.run_crosscheck(session, dossier_id=dossier_id, user_id=user_id)
        )
    return [one for one in (_run(run) for run in runs) if one is not None]


@router.get("/deals/{dossier_id}/runs", response_model=list[CheckRunRead])
async def list_runs(
    dossier_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[CheckRunRead]:
    """The last run of each checker — when each of these was last true."""
    await _deal(session, dossier_id, auth_subject.subject.id)
    repository = TieOutRepository.from_session(session)
    runs = [
        await repository.latest_run(dossier_id, CheckKind.tieout),
        await repository.latest_run(dossier_id, CheckKind.audit),
        await repository.latest_run(dossier_id, CheckKind.crosscheck),
    ]
    return [one for one in (_run(run) for run in runs) if one is not None]


# --- settings ------------------------------------------------------------


async def _in_organization(
    session: AsyncSession | AsyncReadSession, organization_id: UUID, user_id: UUID
) -> None:
    """Organization membership, 404 on the outside — same posture as a
    deal: a stranger does not learn the organization exists."""
    repository = TieOutRepository.from_session(session)
    if not await repository.is_in_organization(organization_id, user_id):
        raise ResourceNotFound("Organization not found.")


def _house_rules(rules: HouseRules | None) -> HouseRulesRead:
    off = set(rules.audit_rules_off) if rules else set()
    return HouseRulesRead(
        rounding="separate" if rules and rules.rounding == "separate" else "together",
        writing=dict(rules.writing) if rules else {},
        grounding=rules.grounding if rules else True,
        rules=[
            AuditRuleRead(key=key, label=label, on=key not in off)
            for key, label in RULE_NAMES.items()
        ],
    )


@router.get("/house-rules", response_model=HouseRulesRead)
async def get_house_rules(
    auth_subject: auth.TieOutRead,
    organization_id: UUID = Query(),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> HouseRulesRead:
    """How this firm wants Pierce to behave. No row yet means defaults."""
    await _in_organization(session, organization_id, auth_subject.subject.id)
    repository = TieOutRepository.from_session(session)
    return _house_rules(await repository.house_rules_for(organization_id))


@router.put("/house-rules", response_model=HouseRulesRead)
async def put_house_rules(
    update: HouseRulesUpdate,
    auth_subject: auth.TieOutWrite,
    organization_id: UUID = Query(),
    session: AsyncSession = Depends(get_db_session),
) -> HouseRulesRead:
    """Change the firm's rules. Only what is sent changes.

    An unknown rule key is refused whole rather than stored and
    ignored — a switch that does nothing is worse than an error.
    """
    await _in_organization(session, organization_id, auth_subject.subject.id)
    if update.audit_rules_off is not None:
        unknown = [key for key in update.audit_rules_off if key not in RULE_NAMES]
        if unknown:
            raise ClaidorRequestValidationError(
                [
                    {
                        "loc": ("body", "audit_rules_off"),
                        "msg": f"{', '.join(unknown)} is not a rule the audit runs",
                        "type": "value_error",
                        "input": unknown,
                    }
                ]
            )
    repository = TieOutRepository.from_session(session)
    rules = await repository.house_rules_for(organization_id) or HouseRules(
        organization_id=organization_id
    )
    if update.rounding is not None:
        rules.rounding = update.rounding
    if update.writing is not None:
        rules.writing = dict(update.writing)
    if update.grounding is not None:
        rules.grounding = update.grounding
    if update.audit_rules_off is not None:
        rules.audit_rules_off = sorted(set(update.audit_rules_off))
    return _house_rules(await repository.save_house_rules(rules))


@router.get("/team", response_model=TeamRead)
async def get_team(
    auth_subject: auth.TieOutRead,
    organization_id: UUID = Query(),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> TeamRead:
    """Who's on the team, and which of this organization's deals each is on."""
    await _in_organization(session, organization_id, auth_subject.subject.id)
    repository = TieOutRepository.from_session(session)
    people = await repository.team_of(organization_id)
    return TeamRead(
        members=[
            TeamMember(
                id=person.id,
                name=person.public_name,
                email=person.email,
                avatar_url=person.avatar_url,
                you=person.id == auth_subject.subject.id,
                deals=deals,
            )
            for person, deals in people
        ],
        total_deals=await repository.organization_deals(organization_id),
    )


# --- one-off checks ------------------------------------------------------


def _one_off(row: OneOffCheck) -> OneOffResult:
    stored = row.result or {}
    return OneOffResult(
        id=row.id,
        filename=row.filename,
        kind=row.kind.value,
        checked_at=row.created_at,
        against=row.against,
        dossier_id=row.dossier_id,
        models=[AgainstModel(**one) for one in stored.get("models", [])],
        counts=row.counts or {},
        disagreements=[
            SoloFindingRead(**one) for one in stored.get("disagreements", [])
        ],
        drifts=[OneOffDrift(**one) for one in stored.get("drifts", [])],
        defects=[OneOffDefect(**one) for one in stored.get("defects", [])],
    )


@router.post("/check-file", response_model=OneOffResult, status_code=201)
async def check_file(
    auth_subject: auth.TieOutWrite,
    upload: UploadFile = File(..., alias="file"),
    dossier_id: UUID | None = Query(
        default=None,
        description="A deal to check the file against. Left out, the file "
        "is checked on its own.",
    ),
    session: AsyncSession = Depends(get_db_session),
) -> OneOffResult:
    """Check a loose file, without putting it in any deal.

    The Check-a-file screen. The file is read, checked and dropped in one
    request — nothing lands in a data room — and the answer is kept as a
    row of « Recent one-off checks ».

    A deck or a memo is checked against itself; with a deal picked it is
    also reconciled against that deal's current models. A model is
    audited — a workbook checked by itself *is* the model audit — and a
    deal picked alongside one is deliberately ignored: model-against-deal
    is the grounding, which needs the deal's source documents and is not
    a one-off, so the result honestly says « on its own ».

    A file that cannot be read is a 422 with the reason in words a person
    can act on, exactly as an upload would have reported it. Nothing is
    stored for it: there is no answer to keep.
    """
    user = auth_subject.subject
    deal = await _deal(session, dossier_id, user.id) if dossier_id is not None else None

    payload = await upload.read()
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="That file is too large to read.")

    filename = upload.filename or "upload"
    kind = kind_for(filename)
    if kind is ArtifactKind.source:
        raise HTTPException(
            status_code=415,
            detail=(
                "a PDF is a source — it is what other files are checked "
                "against. A one-off check reads a deck, a model or a memo."
            ),
        )
    if kind is None:
        raise HTTPException(
            status_code=415,
            detail=(
                f"{filename} is not a file this can check — a deck is "
                ".pptx, a model is .xlsx or .xls, a memo is .docx"
            ),
        )

    try:
        row = await tieout.check_file(
            session,
            user_id=user.id,
            kind=kind,
            filename=filename,
            payload=payload,
            dossier=deal,
        )
    except Unreadable as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return _one_off(row)


@router.get("/check-file/recents", response_model=list[RecentCheck])
async def recent_checks(
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[RecentCheck]:
    """The caller's own recent one-off checks, newest first.

    Personal, not the team's: a loose file checked before it is anybody's
    deal is not yet anybody else's business.
    """
    repository = TieOutRepository.from_session(session)
    rows = await repository.recent_checks(auth_subject.subject.id)
    return [
        RecentCheck(
            id=one.id,
            filename=one.filename,
            kind=one.kind.value,
            against=one.against,
            checked_at=one.created_at,
            counts=one.counts or {},
        )
        for one in rows
    ]


@router.get("/check-file/{check_id}", response_model=OneOffResult)
async def get_one_off_check(
    check_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> OneOffResult:
    """A stored one-off check, replayed exactly as it was answered.

    Nothing re-runs: the file is gone, and a silent re-check against a
    deal that has since moved would show a different answer under an old
    date. Only the owner can open it — anyone else gets 404, not 403.
    """
    repository = TieOutRepository.from_session(session)
    row = await repository.get_one_off(check_id, auth_subject.subject.id)
    if row is None:
        raise ResourceNotFound("Check not found.")
    return _one_off(row)


# --- findings ------------------------------------------------------------


@router.get("/deals/{dossier_id}/findings", response_model=list[FindingRead])
async def list_findings(
    dossier_id: UUID,
    auth_subject: auth.TieOutRead,
    artifact_id: UUID | None = Query(
        default=None,
        description="Only this document's findings — what the panel asks for.",
    ),
    kind: FindingKind | None = Query(default=None),
    state: FindingState | None = Query(default=None),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[FindingRead]:
    """The findings, ordered so the list does not open on eight non-problems.

    A one-tick difference — 18.6% against a mean of 18.655% — is almost
    always a rounding convention, so it is shown and ranked last rather
    than hidden or promoted.
    """
    await _deal(session, dossier_id, auth_subject.subject.id)
    repository = TieOutRepository.from_session(session)
    findings = await repository.findings_of(
        dossier_id, artifact_id=artifact_id, kind=kind, state=state
    )
    filenames = {
        one.id: one.filename for one in await repository.list_artifacts(dossier_id)
    }
    corrections = await repository.corrections_by_fingerprint(dossier_id)
    return [_finding(one, filenames, corrections) for one in findings]


@router.patch("/findings/{finding_id}", response_model=FindingRead)
async def update_finding(
    finding_id: UUID,
    update: FindingUpdate,
    auth_subject: auth.TieOutWrite,
    session: AsyncSession = Depends(get_db_session),
) -> FindingRead:
    """Accept it, dismiss it, mark it fixed, or put it back.

    A dismissal survives every later run, matched by fingerprint on the
    document's lineage rather than its id — so re-uploading the deck does
    not resurrect something somebody already ruled on.
    """
    repository = TieOutRepository.from_session(session)
    finding = await repository.get_finding(finding_id)
    if finding is None:
        raise ResourceNotFound("Finding not found.")
    await _deal(session, finding.dossier_id, auth_subject.subject.id)

    # **A dismissal needs a reason, and only a dismissal.** Dismissing
    # says the check is wrong about this one — the decision somebody
    # questions three weeks later with the author on holiday. No other
    # state asks, because a box everyone must type past collects « ok ».
    if update.state is FindingState.dismissed and not update.note.strip():
        raise ClaidorRequestValidationError(
            [
                {
                    "loc": ("body", "note"),
                    "msg": (
                        "Dismissing says the check is wrong about this one — "
                        "say why, so the decision survives you moving on."
                    ),
                    "type": "value_error",
                    "input": update.note,
                }
            ]
        )

    await repository.set_finding_state(
        finding,
        state=update.state,
        user_id=auth_subject.subject.id,
        note=update.note.strip(),
    )
    filenames = {
        one.id: one.filename
        for one in await repository.list_artifacts(finding.dossier_id)
    }
    corrections = await repository.corrections_by_fingerprint(finding.dossier_id)
    return _finding(finding, filenames, corrections)


@router.get("/artifacts/{artifact_id}/chain", response_model=list[ChainStep])
async def get_cell_chain(
    artifact_id: UUID,
    auth_subject: auth.TieOutRead,
    ref: str = Query(description="A cell in this model — « Model!D26 »."),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[ChainStep]:
    """Where one cell's number comes from, without a finding to ask through.

    « Trace this figure » on a cell nobody has reported anything about.
    The chain a finding carries starts from a problem; this starts from a
    question, which is the more common one — a banker reads a number in a
    model and wants to know what is behind it before it reaches a deck.

    A typed input ends with the document it was read out of, when a source
    document in this deal has been matched to it.
    """
    artifact = await _artifact_in_deal(session, artifact_id, auth_subject.subject.id)
    steps = await tieout.chain_for(
        session,
        artifact_id=artifact.id,
        ref=ref,
        dossier_id=artifact.dossier_id,
    )
    if not steps:
        raise ResourceNotFound(f"{ref} is not a cell in this model.")
    return [ChainStep(**one) for one in steps]


@router.get("/findings/{finding_id}/chain", response_model=ChainRead)
async def get_chain(
    finding_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> ChainRead:
    """Slide 2 says $49.6mm · the model says 48.9 at Model!D26 · which is
    reported EBITDA 41.2 plus adjustments 7.7.

    One sentence, read down the steps. A chain ends at a typed input —
    that is the edge of the model and the beginning of the next question,
    *where did that number come from*.
    """
    repository = TieOutRepository.from_session(session)
    finding = await repository.get_finding(finding_id)
    if finding is None:
        raise ResourceNotFound("Finding not found.")
    await _deal(session, finding.dossier_id, auth_subject.subject.id)
    return ChainRead(**await tieout.chain_of_finding(session, finding=finding))


# --- links ---------------------------------------------------------------


@router.get("/deals/{dossier_id}/links", response_model=list[LinkRead])
async def list_links(
    dossier_id: UUID,
    auth_subject: auth.TieOutRead,
    state: LinkState | None = Query(default=None),
    superseded: bool = Query(
        False,
        description="Include links on documents a newer version has replaced.",
    ),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[LinkRead]:
    """The confirmation queue: what the engine thinks each figure refers to.

    The engine proposes, a banker confirms, and from then on re-checking
    that figure is arithmetic that cannot come out differently. This queue
    is the whole reason a fallible linker can back a promise that holds
    every time, and it has to be fast to move through — forty in a sitting,
    on a keyboard.

    Alternatives are left off here on purpose: they cost a re-score against
    the model and belong on the one link being looked at.

    **Scoped to the documents in force**, because a figure on a deck a
    newer version replaced is not a published figure and confirming a link
    to one is wasted work. The server decides that rather than the client:
    working out what is superseded needs every artifact in the deal, and
    handing a screen three thousand rows so it can filter a hundred is the
    payload problem this route used to have.
    """
    await _deal(session, dossier_id, auth_subject.subject.id)
    repository = TieOutRepository.from_session(session)
    links = await repository.links_of(dossier_id, state=state)
    if not superseded:
        in_force = {one.id for one in await repository.current_artifacts(dossier_id)}
        figures_now = await repository.figures_by_id([one.figure_id for one in links])
        links = [
            one
            for one in links
            if one.figure_id not in figures_now
            or figures_now[one.figure_id].artifact_id in in_force
        ]
    figures = await repository.figures_by_id([one.figure_id for one in links])
    cells = await repository.cells_by_id([one.cell_id for one in links])
    return [_link(one, figures, cells) for one in links]


@router.get("/links/{link_id}", response_model=LinkRead)
async def get_link(
    link_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> LinkRead:
    """One link, with what else the figure could have been.

    The alternatives are what the linker scored and did not pick. The
    figures it refused because « two outputs fit equally well » are exactly
    the cases a banker settles in a second and the engine never can.
    """
    repository = TieOutRepository.from_session(session)
    link = await repository.get_link(link_id)
    if link is None:
        raise ResourceNotFound("Link not found.")
    await _deal(session, link.dossier_id, auth_subject.subject.id)

    figures = await repository.figures_by_id([link.figure_id])
    cells = await repository.cells_by_id([link.cell_id])
    confirmer = (
        await UserRepository.from_session(session).get_by_id(link.confirmed_by_id)
        if link.confirmed_by_id
        else None
    )
    rendered = _link(link, figures, cells, confirmer)
    rendered.alternatives = [
        LinkAlternative(**one)
        for one in await tieout.alternatives_for(
            session, dossier_id=link.dossier_id, figure_id=link.figure_id
        )
        if one["cell_id"] != link.cell_id
    ]
    return rendered


@router.patch("/links/{link_id}", response_model=LinkRead)
async def decide_link(
    link_id: UUID,
    decision: LinkDecision,
    auth_subject: auth.TieOutWrite,
    session: AsyncSession = Depends(get_db_session),
) -> LinkRead:
    """Confirm, reject, or point it somewhere else.

    Confirming is the moment a guess becomes data: the pair is recorded as
    decided, and no later run proposes over it, undoes it, or resurrects a
    rejection. Passing `cell_id` re-points the link first, which turns a
    wrong guess into a right fact instead of throwing it away.
    """
    repository = TieOutRepository.from_session(session)
    link = await repository.get_link(link_id)
    if link is None:
        raise ResourceNotFound("Link not found.")
    user = auth_subject.subject
    await _deal(session, link.dossier_id, user.id)

    if decision.cell_id is not None and decision.cell_id != link.cell_id:
        cell = await repository.get_cell(decision.cell_id)
        if cell is None:
            raise ResourceNotFound("Cell not found.")
        artifact = await repository.get_artifact(cell.artifact_id)
        if artifact is None or artifact.dossier_id != link.dossier_id:
            raise HTTPException(
                status_code=422, detail="That cell is not in this deal's model."
            )
        link.cell_id = cell.id
        link.cell_name = cell.name
        # A person chose this one. It stops being a score.
        link.confidence = 1.0

    await repository.decide_link(link, state=decision.state, user_id=user.id)
    figures = await repository.figures_by_id([link.figure_id])
    cells = await repository.cells_by_id([link.cell_id])
    return _link(link, figures, cells, user if link.confirmed_by_id else None)


# --- corrections ---------------------------------------------------------


@router.get("/deals/{dossier_id}/corrections", response_model=list[CorrectionRead])
async def list_corrections(
    dossier_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[CorrectionRead]:
    """Every change proposed on this deal, and what became of it.

    The record of what this product *did* to the documents, as opposed to
    what it found in them. A correction outlives the finding it came from:
    once it has been applied the drift is gone, so the finding is gone, and
    this is the only thing left that says the deck used to read $49.6mm.
    """
    await _deal(session, dossier_id, auth_subject.subject.id)
    repository = TieOutRepository.from_session(session)
    rows = await repository.corrections_of(dossier_id)
    deciders = await repository.uploaders(
        [one.decided_by_id for one in rows if one.decided_by_id]
    )
    return [
        _correction(one, deciders.get(one.decided_by_id) if one.decided_by_id else None)
        for one in rows
    ]


@router.post(
    "/findings/{finding_id}/correction",
    response_model=CorrectionRead,
    status_code=201,
)
async def propose_correction(
    finding_id: UUID,
    auth_subject: auth.TieOutWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CorrectionRead:
    """« The deck should read $48.9mm » — written down, not applied.

    Idempotent: asking twice gives the proposal that already exists. A
    finding nothing can be written for — an audit defect in a model, whose
    fix is a decision about a formula — comes back 422 with the sentence
    saying why, because « this cannot be corrected » is an answer a screen
    should show rather than a state it should have to infer.
    """
    repository = TieOutRepository.from_session(session)
    finding = await repository.get_finding(finding_id)
    if finding is None:
        raise ResourceNotFound("Finding not found.")
    await _deal(session, finding.dossier_id, auth_subject.subject.id)

    try:
        correction = await writing.propose(
            session, finding=finding, user_id=auth_subject.subject.id
        )
    except NotCorrectable as problem:
        raise HTTPException(status_code=422, detail=str(problem)) from problem
    return _correction(correction, auth_subject.subject)


@router.post("/corrections/{correction_id}", response_model=CorrectionRead)
async def decide_correction(
    correction_id: UUID,
    decision: CorrectionDecision,
    auth_subject: auth.TieOutWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CorrectionRead:
    """Accept it, keep the deck as it is, undo it, or report it was written.

    **A write that fails comes back 200 with `state: failed`.** It is not a
    bad request — the request was fine and the document had moved — and a
    banker who pressed Accept has to be able to see afterwards whether the
    deck changed. An HTTP error leaves nothing on the record to look at.
    """
    repository = TieOutRepository.from_session(session)
    correction = await repository.get_correction(correction_id)
    if correction is None:
        raise ResourceNotFound("Correction not found.")
    user = auth_subject.subject
    await _deal(session, correction.dossier_id, user.id)

    try:
        if decision.action == "accept":
            settled = await writing.apply(
                session, correction=correction, user_id=user.id
            )
        elif decision.action == "reject":
            settled = await writing.reject(
                session, correction=correction, user_id=user.id
            )
        elif decision.action == "reverse":
            settled = await writing.reverse(
                session, correction=correction, user_id=user.id
            )
        elif decision.action == "propose":
            settled = await writing.reopen(
                session, correction=correction, user_id=user.id
            )
        else:
            settled = await writing.record_in_document(
                session, correction=correction, user_id=user.id
            )
    except NotCorrectable as problem:
        raise HTTPException(status_code=422, detail=str(problem)) from problem
    return _correction(settled, user)


@router.get("/artifacts/{artifact_id}/download", response_model=None)
async def download_artifact(
    artifact_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> dict[str, str]:
    """A link to the file itself — the corrected deck, in particular.

    A correction that cannot leave the building is not a correction. This
    is how the deck a banker sends out gets the accepted figure in it.
    """
    artifact = await _artifact_in_deal(session, artifact_id, auth_subject.subject.id)
    try:
        return {"url": download_url(artifact), "filename": artifact.filename}
    except FileNotKept as problem:
        raise HTTPException(status_code=404, detail=str(problem)) from problem


__all__ = ["router"]


# --- the agent -----------------------------------------------------------


@router.post("/deals/{dossier_id}/ask", response_model=Asked, status_code=201)
async def ask(
    dossier_id: UUID,
    body: Ask,
    auth_subject: auth.TieOutWrite,
    session: AsyncSession = Depends(get_db_session),
) -> Asked:
    """Ask a question about this deal, and get the working with the answer.

    `POST` rather than `GET` because it costs money and leaves a record,
    and `TieOutWrite` for the same reason: reading a deal is one thing and
    spending on it is another.

    **The trace comes back with the answer.** It is not logging — it is
    most of why an answer reads as looked up rather than composed, and the
    only way a reader can tell which it was.

    A run that ran out of steps, or failed, says so in `stopped`. Nothing
    is invented to fill the gap: an agent that stops after twenty-four
    tools and answers as though it had finished is claiming a completeness
    it does not have.
    """
    deal = await _deal(session, dossier_id, auth_subject.subject.id)
    try:
        client = agent_client()
    except AgentNotConfigured as problem:
        raise HTTPException(status_code=503, detail=str(problem)) from problem

    finding: Finding | None = None
    if body.finding_id is not None:
        repository = TieOutRepository.from_session(session)
        finding = await repository.get_finding(body.finding_id)
        if finding is None or finding.dossier_id != deal.id:
            raise ResourceNotFound("Finding not found.")

    task, outcome = await agent.ask(
        session,
        dossier_id=deal.id,
        user_id=auth_subject.subject.id,
        prompt=_conversation(body, finding),
        client=client,
        name=deal.name,
    )
    return Asked(
        id=task.id,
        prompt=task.prompt,
        answer=task.answer,
        stopped=task.stopped,
        error=task.error,
        steps=[
            AskedStep(
                ordinal=step.ordinal,
                tool=step.tool,
                ok=step.ok,
                summary=step.summary,
                milliseconds=step.milliseconds,
            )
            for step in outcome.steps
        ],
    )


#: How much of a conversation is replayed to the agent. The last few
#: exchanges are context; a whole afternoon of chat is a second corpus,
#: and the tools — not the transcript — are where answers come from.
MOST_TURNS = 6


def _conversation(body: Ask, finding: Finding | None) -> str:
    """One prompt for the loop, carrying the chat's context.

    The loop takes a single prompt, so the finding the chat was opened
    from and the last few exchanges are folded in, labelled — the
    banker's own words and the agent's earlier answers, never anything
    invented between them. The tools still bound every figure in the
    reply.
    """
    parts: list[str] = []
    if finding is not None:
        about = (
            f"This conversation is about one finding: « {finding.title} » — "
            f"{finding.location}."
        )
        if finding.printed and finding.expected:
            about += (
                f" The document prints {finding.printed}; the model says "
                f"{finding.expected}."
            )
        parts.append(about)
    for turn in body.history[-MOST_TURNS:]:
        speaker = "The banker said" if turn.who == "you" else "You answered"
        parts.append(f"{speaker}: {turn.text}")
    if parts:
        parts.append(f"The banker now asks: {body.prompt}")
        return "\n\n".join(parts)
    return body.prompt


@router.post(
    "/check-file/{check_id}/ask", response_model=Asked, status_code=201
)
async def ask_about_check(
    check_id: UUID,
    body: Ask,
    auth_subject: auth.TieOutWrite,
    session: AsyncSession = Depends(get_db_session),
) -> Asked:
    """Ask about one stored one-off check — and only about it.

    The agent here holds the check's stored answer and two tools over
    it, nothing else: no deal, no model history, no decisions. A deal
    question gets the boundary sentence, which is a correct answer and
    not a failure — the deal's own page is where those are answered.

    Nothing is persisted: recorded agent tasks are a deal's record, and
    a one-off check has no deal. The trace still comes back with the
    answer, which is where it matters.
    """
    from uuid import uuid4

    from polar.agent import run as run_agent

    from .agent.file_tools import FILE_TOOLSET, FileRoom

    repository = TieOutRepository.from_session(session)
    row = await repository.get_one_off(check_id, auth_subject.subject.id)
    if row is None:
        raise ResourceNotFound("Check not found.")
    try:
        client = agent_client()
    except AgentNotConfigured as problem:
        raise HTTPException(status_code=503, detail=str(problem)) from problem

    room = FileRoom(
        filename=row.filename,
        kind=row.kind.value,
        against=row.against,
        counts=row.counts or {},
        result=row.result or {},
    )
    outcome = await run_agent(
        client, FILE_TOOLSET, room, _conversation(body, None)
    )
    return Asked(
        id=uuid4(),
        prompt=body.prompt,
        answer=outcome.answer,
        stopped=outcome.stopped,
        error=outcome.error,
        steps=[
            AskedStep(
                ordinal=step.ordinal,
                tool=step.tool,
                ok=step.ok,
                summary=step.summary,
                milliseconds=step.milliseconds,
            )
            for step in outcome.steps
        ],
    )
