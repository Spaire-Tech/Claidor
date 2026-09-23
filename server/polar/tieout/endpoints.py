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

import asyncio
import json
from collections.abc import AsyncGenerator, Sequence
from dataclasses import asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote
from uuid import UUID

from fastapi import Depends, File, HTTPException, Query, Response, UploadFile
from fastapi.responses import StreamingResponse

from polar.agent import AGENT_MODEL, Outcome, Step
from polar.agent import run as agent_run
from polar.auth.dependencies import WebUserWrite
from polar.auth.scope import Scope
from polar.dossier.agent.service import AgentNotConfigured
from polar.dossier.agent.service import build_client as agent_client
from polar.exceptions import ClaidorRequestValidationError, ResourceNotFound
from polar.kit.db.postgres import AsyncReadSession, AsyncSession, AsyncSessionMaker
from polar.models import (
    Artifact,
    ArtifactKind,
    CheckKind,
    CheckRun,
    CheckStatus,
    Correction,
    CorrectionState,
    Dossier,
    Figure,
    FigureLink,
    Finding,
    FindingKind,
    FindingSeverity,
    FindingState,
    HouseRules,
    LinkState,
    ModelCell,
    OneOffCheck,
    User,
)
from polar.openapi import APITag
from polar.postgres import get_db_read_session, get_db_session, get_db_sessionmaker
from polar.routing import APIRouter
from polar.user.repository import UserRepository

from . import auth
from .agent import gate
from .agent import service as agent
from .agent.model_tools import MODEL_TOOLSET
from .agent.picture import as_prompt
from .agent.service import ASSISTANT_EFFORT
from .agent.status import stage as run_stage
from .analytics import ANALYTIC_PASS_NAMES, ANALYTIC_RULE_NAMES
from .audit import RULE_NAMES
from .checks import checks_of
from .ingest import SUFFIXES, Unreadable, kind_for
from .markup import MarkupFinding, MarkupRefused, marked_up_copy, marked_up_name
from .repository import TieOutRepository
from .schemas import (
    AcceptCheck,
    AgainstModel,
    ArtifactPage,
    ArtifactRead,
    Ask,
    Asked,
    AskedClarify,
    AskedRow,
    AskedStage,
    AskedStep,
    AuditRuleRead,
    CellRead,
    ChainRead,
    ChainStep,
    CheckRead,
    CheckRunRead,
    CorrectionDecision,
    CorrectionRead,
    Coverage,
    DealListItem,
    DealPage,
    DecisionRead,
    DeckDeltaItemRead,
    DeckDeltaRead,
    DeltaItemRead,
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
    RecalcMarkRead,
    RecentCheck,
    SlideFigures,
    SoloFindingRead,
    TeamMember,
    TeamRead,
    Uploader,
    VersionAudit,
    VersionAuditSummary,
    VersionDeltaRead,
    VersionRead,
)
from .service import models_of, subject_model, tieout
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


def _run(
    run: CheckRun | None, open_by_rule: dict[str, int] | None = None
) -> CheckRunRead | None:
    if run is None:
        return None
    checks: list[CheckRead] = []
    if run.kind is CheckKind.audit and run.status is CheckStatus.done:
        checks = [
            CheckRead(**asdict(one))
            for one in checks_of(run.summary or {}, open_by_rule or {})
        ]
    return CheckRunRead(
        id=run.id,
        kind=run.kind,
        status=run.status,
        summary=run.summary or {},
        error=run.error,
        started_at=run.started_at,
        finished_at=run.finished_at,
        checks=checks,
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
            #: Where this is, in the shortest true words. A finding
            #: about the *workbook* rather than a cell — the defined
            #: names pointing into other files, say — carries no
            #: location at all, and the screens drew an empty pill
            #: beside a real finding on a real model. It is not
            #: nowhere: the engine names what it is about, and saying
            #: « defined names » is both shorter and truer than a
            #: blank.
            label=(
                f"slide {finding.page}"
                if finding.page
                else finding.location or str(evidence.get("name") or "")
            ),
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
        figure=str(evidence.get("figure") or ""),
        figure_unit=str(evidence.get("figure_unit") or ""),
        formula=str(evidence.get("formula") or ""),
        against=str(evidence.get("against") or ""),
        period=str(evidence.get("period") or ""),
        standard_sentence=str(evidence.get("standard_sentence") or ""),
        flow=str(evidence.get("flow") or ""),
        fix=str(evidence.get("fix") or ""),
        headline=str(evidence.get("headline") or ""),
        plain=str(evidence.get("plain") or ""),
        tier=int(evidence.get("tier") or 0),
        weight=float(evidence.get("weight") or 0.0),
        basis=str(evidence.get("basis") or ""),
        cells=str(evidence.get("cells") or ""),
        fix_before=str(evidence.get("fix_before") or ""),
        grid=evidence.get("grid") or None,
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
        comment="Simeon panel (Office add-in)",
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
        #: The last check of **any** kind that actually completed —
        #: which is what the column says and what a reader means by it.
        #: Two corrections in one line. Taking the tie-out alone made a
        #: model-only deal (no deck to reconcile against, which is most
        #: of the real corpus) read « Not checked yet » beside its own
        #: eight findings, and left it permanently un-stale however many
        #: versions arrived after its audit. And a *failed* run is not a
        #: check: it carries a finishing time but checked nothing, so it
        #: must not date the row. Where the newest run of a kind failed
        #: over an older one that succeeded this under-claims rather
        #: than over-claims, which is the right direction to be wrong.
        audit_run = await repository.latest_run(deal.id, CheckKind.audit)
        values_only = bool(
            audit_run is not None
            and audit_run.status is CheckStatus.done
            and (audit_run.summary or {}).get("values_only")
        )
        dated: list[tuple[datetime, CheckRun]] = []
        for candidate in (
            await repository.latest_run(deal.id, CheckKind.tieout),
            audit_run,
        ):
            if (
                candidate is not None
                and candidate.status is CheckStatus.done
                and candidate.finished_at is not None
            ):
                dated.append((candidate.finished_at, candidate))
        run = max(dated, key=lambda pair: pair[0])[1] if dated else None
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
        open_findings = await repository.findings_of(deal.id, state=FindingState.open)
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

        # The row's model column: the deal's subject model, by name and
        # version. Null when there is none — the screen says so. A deal
        # carrying two models names the newest, the same one every other
        # deal-scoped answer takes.
        model = subject_model(current)

        # The row's dot: the worst attention tier among what is open.
        # Audit findings carry their tier in evidence; anything stored
        # before the elevation layer falls back on severity.
        def tier_of(finding: Finding) -> int:
            carried = int((finding.evidence or {}).get("tier") or 0)
            if carried:
                return carried
            return 1 if finding.severity is FindingSeverity.error else 3

        worst_tier = min((tier_of(one) for one in open_findings), default=0)

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
                values_only=values_only,
                stale=stale_at is not None,
                stale_kind=stale_kind,
                stale_at=stale_at,
                visited_at=visited_at,
                arrived_since_visit=arrived_since,
                findings_since_visit=findings_since,
                model_name=model.filename if model else None,
                model_version=model.version if model else None,
                worst_tier=worst_tier,
            )
        )
    return items


@router.delete("/deals/{dossier_id}", status_code=204)
async def delete_deal(
    dossier_id: UUID,
    auth_subject: auth.TieOutWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Remove a deal from Ances — soft, like every delete here.

    The route that did not exist, found the day the panel's picker was
    still listing every test deal from before the product pivoted and
    there was no way anywhere to be rid of them. Membership is the
    whole permission, matching the rest of the module: a person on the
    deal can remove it, and a person not on it gets the same 404 as
    everywhere else. Soft deletion keeps the rows — findings, notes,
    decisions — so nothing a team wrote is destroyed by a cleanup.
    """
    deal = await _deal(session, dossier_id, auth_subject.subject.id)
    deal.set_deleted_at()


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


#: Excel ships more formats than this reads, and a person who has one
#: needs the way out rather than the list.
#:
#: **`.xlsb` was the first entry here and is no longer refused** (28
#: Aug): `polar.tieout.binary` converts it through LibreOffice and the
#: reader takes it like anything else. It was the format the corpus
#: actually arrived in — two of eleven eligible models, found by the
#: corpus rather than by a customer (`population-proof.md`) — so the
#: refusal it used to get was the most-earned one on this list.
UNREADABLE_EXCEL = {
    ".csv": (
        "a .csv carries values with no formulas, and the checks read "
        "formulas. Upload the workbook it came from"
    ),
    ".numbers": (
        "a .numbers file is Apple's format. Export it as .xlsx and upload that"
    ),
}


def _unreadable_format(filename: str) -> str:
    """Why this file was not taken, and what to do — read off `SUFFIXES`.

    The list is derived rather than written out, because the sentence
    that names the formats has to be the formats: it said « models are
    .xlsx or .xls » while the reader had been taking `.xlsm` all along,
    which is the format most project-finance models actually arrive in.
    """
    suffix = Path(filename).suffix.lower()
    said = "; ".join(
        f"{kind.value}s are {', '.join(suffixes[:-1])} or {suffixes[-1]}"
        if len(suffixes) > 1
        else f"a {kind.value} is {suffixes[0]}"
        for kind, suffixes in SUFFIXES.items()
    )
    known = UNREADABLE_EXCEL.get(suffix)
    if known is not None:
        return f"{filename} was not taken — {known}. What this reads: {said}."
    return f"{filename} is not a file this can read. {said[0].upper()}{said[1:]}."


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
        raise HTTPException(status_code=415, detail=_unreadable_format(filename))

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


@router.get("/artifacts/{artifact_id}/audit", response_model=VersionAudit)
async def version_audit(
    artifact_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> VersionAudit:
    """The audit, re-run on this stored version and persisted nowhere.

    The version dropdown's re-scoping: pick an older upload and the
    page shows what the audit says about *that* one — computed on
    request from the cells stored at its ingest, house rules applied
    exactly as a real run applies them. Nothing lands in the findings
    table: rulings, corrections and the report belong to the current
    version, so these findings carry no durable identity and the
    response's own docstring-on-the-screen is « checked just now ».
    """
    artifact = await _artifact_in_deal(session, artifact_id, auth_subject.subject.id)
    result = await tieout.audit_of_version(
        session, dossier_id=artifact.dossier_id, artifact_id=artifact_id
    )
    if result is None:
        raise ResourceNotFound("This version has no model audit to show.")

    uploader = await UserRepository.from_session(session).get_by_id(
        artifact.uploaded_by_id
    )
    filenames = {artifact.id: artifact.filename}
    summary = result["summary"]
    return VersionAudit(
        artifact_id=artifact.id,
        version=artifact.version,
        filename=artifact.filename,
        uploaded_by=_uploader(uploader),
        uploaded_at=artifact.created_at,
        checked_at=result["checked_at"],
        summary=VersionAuditSummary(
            errors=summary["errors"],
            smells=summary["smells"],
            tiers=summary["tiers"],
            cells=summary["cells"],
            rules_off=summary["rules_off"],
            values_only=summary["values_only"],
            abstentions=summary["abstentions"],
        ),
        findings=[_finding(one, filenames) for one in result["findings"]],
    )


@router.get("/artifacts/{artifact_id}/deck-delta", response_model=DeckDeltaRead | None)
async def deck_delta(
    artifact_id: UUID,
    auth_subject: auth.TieOutRead,
    against: UUID | None = Query(
        default=None,
        description="The older version to compare against. Left out, the "
        "version before this one.",
    ),
    deck: UUID | None = Query(
        default=None,
        description="Which deliverable to re-tie. Left out, the deal's current deck.",
    ),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> DeckDeltaRead | None:
    """What this model revision did to the deliverables.

    The failure this product exists for: not one typo, but a model
    revision the deck never caught up with — because nobody knows
    which of its hundred printed figures the revision touched. The
    same deck is tied out against both versions and the difference
    read in review language: what the revision **broke**, what it
    **repaired**, what was **already drifting** against both (never
    this revision's account), and what became reconcilable against
    only one version, which is « I lost sight of it » and not « it
    broke ».

    Each break carries the model change underneath it in the Watch's
    own words — or nothing, where it could not be attributed. The
    nearest change is not a cause.

    `null` when there is no earlier version or the deal holds no deck:
    both are absences rather than errors. A file whose bytes were
    dropped under « keep the chain, drop the documents » is a 404
    carrying the storage sentence; an `against` outside this model's
    own lineage reads as not found, the same gate the version delta
    uses.
    """
    artifact = await _artifact_in_deal(session, artifact_id, auth_subject.subject.id)
    try:
        result = await tieout.deck_delta(
            session,
            dossier_id=artifact.dossier_id,
            artifact_id=artifact_id,
            deck_id=deck,
            against_id=against,
        )
    except FileNotKept as problem:
        # The storage sentence talks about correcting a file; this route
        # compares three. Same fact, this route's own words — and it
        # names which of the three is missing, because « upload it
        # again » is useless without that.
        missing = str(problem).split(" is not stored", 1)[0]
        raise HTTPException(
            status_code=404,
            detail=(
                f"{missing} is not stored here any more, so this revision "
                "cannot be re-tied against the deck. Upload it again."
            ),
        ) from problem
    if result is None:
        if against is not None or artifact.kind is not ArtifactKind.model:
            raise ResourceNotFound("Nothing to compare against.")
        return None

    old, new, deck_artifact = result["old"], result["new"], result["deck"]
    report = result["report"]

    def items(rows: list[Any]) -> list[DeckDeltaItemRead]:
        return [
            DeckDeltaItemRead(
                slide=one.slide,
                printed=one.printed,
                location=one.location,
                old_ref=one.old_ref,
                expected=one.expected,
                name=one.name,
                one_tick=one.one_tick,
                cause=one.cause,
            )
            for one in rows
        ]

    return DeckDeltaRead(
        old_artifact_id=old.id,
        old_version=old.version,
        new_artifact_id=new.id,
        new_version=new.version,
        deck_artifact_id=deck_artifact.id,
        deck_filename=deck_artifact.filename,
        computed_at=result["computed_at"],
        checked_old=report.checked_old,
        checked_new=report.checked_new,
        broken=items(report.broken),
        repaired=items(report.repaired),
        still_drifting=items(report.still_drifting),
        coverage_changed=items(report.coverage_changed),
    )


@router.get("/artifacts/{artifact_id}/delta", response_model=VersionDeltaRead | None)
async def version_delta(
    artifact_id: UUID,
    auth_subject: auth.TieOutRead,
    against: UUID | None = Query(
        default=None,
        description="The older version to compare against. Left out, the "
        "version before this one.",
    ),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> VersionDeltaRead | None:
    """What this revision did, in review language — the Watch, served.

    The Versions screen's report: what broke, what changed class, where
    the method moved, which assumptions moved, which outputs moved
    materially, the structure, then the repairs — ranked by the engine,
    computed on request from the two versions' stored bytes, persisted
    nowhere.

    `null` when this is the first version: there is no revision to
    report, which is not an error — the same sentence as the raw diff.
    A version whose bytes were dropped under « keep the chain, drop the
    documents » is a 404 carrying the storage sentence (upload it
    again); an `against` outside this model's own lineage reads as not
    found.
    """
    artifact = await _artifact_in_deal(session, artifact_id, auth_subject.subject.id)
    try:
        result = await tieout.version_delta(
            session,
            dossier_id=artifact.dossier_id,
            artifact_id=artifact_id,
            against_id=against,
        )
    except FileNotKept as problem:
        raise HTTPException(status_code=404, detail=str(problem)) from problem
    if result is None:
        if against is not None or artifact.kind is not ArtifactKind.model:
            raise ResourceNotFound("Nothing to compare against.")
        return None

    users = UserRepository.from_session(session)
    old, new = result["old"], result["new"]
    report = result["report"]
    return VersionDeltaRead(
        old_artifact_id=old.id,
        old_version=old.version,
        old_uploaded_at=old.created_at,
        old_uploaded_by=_uploader(await users.get_by_id(old.uploaded_by_id)),
        new_artifact_id=new.id,
        new_version=new.version,
        new_uploaded_at=new.created_at,
        new_uploaded_by=_uploader(await users.get_by_id(new.uploaded_by_id)),
        computed_at=result["computed_at"],
        new_defects=report.new_defects,
        repaired_defects=report.repaired_defects,
        persistent_defects=report.persistent_defects,
        unmatched_old=report.unmatched_old,
        unmatched_new=report.unmatched_new,
        sheets_added=list(report.sheets_added),
        sheets_removed=list(report.sheets_removed),
        items=[
            DeltaItemRead(
                kind=item.kind,
                sheet=item.sheet,
                first_row=item.first_row,
                last_row=item.last_row,
                columns=list(item.columns),
                detail=item.detail,
                weight=item.weight,
                findings=list(item.findings),
            )
            for item in report.items
        ],
    )


@router.get("/artifacts/{artifact_id}/page/{page}", response_model=None)
async def source_page(
    artifact_id: UUID,
    page: int,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> Response:
    """One page of a stored source PDF, rendered — the viewer's ground.

    The Chain's facts cite pages and boxes in the PDF's own points;
    this serves the pixels those citations sit on, rendered fresh from
    the stored bytes and cached nowhere. A non-PDF answers the same 404
    as an artifact outside the caller's deals; a page outside the
    document answers with the honest range; dropped bytes answer the
    storage sentence.
    """
    artifact = await _artifact_in_deal(session, artifact_id, auth_subject.subject.id)
    try:
        image = await tieout.page_image(
            session,
            dossier_id=artifact.dossier_id,
            artifact_id=artifact_id,
            page=page,
        )
    except FileNotKept as problem:
        raise HTTPException(status_code=404, detail=str(problem)) from problem
    except ValueError as problem:
        raise HTTPException(status_code=404, detail=str(problem)) from problem
    if image is None:
        raise ResourceNotFound("This document has no pages to render.")
    return Response(
        content=image,
        media_type="image/png",
        # Same bytes for the same version forever, so the browser may
        # keep them for the session; a new upload is a new artifact id.
        headers={"cache-control": "private, max-age=3600"},
    )


@router.post("/artifacts/{artifact_id}/recalculate", response_model=RecalcMarkRead)
async def recalculate_artifact(
    artifact_id: UUID,
    auth_subject: auth.TieOutWrite,
    session: AsyncSession = Depends(get_db_session),
) -> RecalcMarkRead:
    """Run the fidelity gate on this version and keep its mark.

    Deliberate, and heavy: the file's formulas are prescanned for
    constructs no engine of ours may honestly compute, and a clean file
    is then recalculated whole through LibreOffice and compared cell by
    cell against the values Excel left in it. The resulting mark —
    validated, failed with the differing cells named, refused in words,
    or nothing to compare — is stored on this version and served with
    the artifact from then on. A machine without an adequate engine
    answers 503 with the sentence saying so; it never stores a guess.
    """
    from .recalc import CalculatorError

    artifact = await _artifact_in_deal(session, artifact_id, auth_subject.subject.id)
    if artifact.kind is not ArtifactKind.model:
        raise ResourceNotFound("Only a model can be recalculated.")
    try:
        mark = await tieout.recalculate(
            session,
            dossier_id=artifact.dossier_id,
            artifact_id=artifact_id,
        )
    except FileNotKept as problem:
        raise HTTPException(status_code=404, detail=str(problem)) from problem
    except CalculatorError as problem:
        raise HTTPException(status_code=503, detail=str(problem)) from problem
    if mark is None:
        raise ResourceNotFound("Only a ready model can be recalculated.")
    return RecalcMarkRead(**mark)


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
    by_rule = await TieOutRepository.from_session(session).open_findings_by_rule(
        dossier_id
    )
    return [one for one in (_run(run, by_rule) for run in runs) if one is not None]


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
    by_rule = await repository.open_findings_by_rule(dossier_id)
    return [one for one in (_run(run, by_rule) for run in runs) if one is not None]


@router.get("/deals/{dossier_id}/runs/history", response_model=list[CheckRunRead])
async def run_history(
    dossier_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[CheckRunRead]:
    """Every finished audit run, oldest first — what the trend is drawn from."""
    await _deal(session, dossier_id, auth_subject.subject.id)
    repository = TieOutRepository.from_session(session)
    runs = await repository.finished_runs(dossier_id, CheckKind.audit)
    out: list[CheckRunRead] = []
    for run in runs:
        read = _run(run)
        if read is None:
            continue
        versions = []
        for raw in run.artifact_ids or []:
            try:
                artifact = await repository.get_artifact(UUID(str(raw)))
            except ValueError:
                artifact = None
            if artifact is not None and artifact.kind is ArtifactKind.model:
                versions.append(int(artifact.version))
        read.version = max(versions) if versions else None
        out.append(read)
    return out


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
    #: One catalogue, both families: the construction rules first, then
    #: the statement checks, each marked so the screens can group them
    #: without ever inventing a list of their own.
    return HouseRulesRead(
        rounding="separate" if rules and rules.rounding == "separate" else "together",
        writing=dict(rules.writing) if rules else {},
        grounding=rules.grounding if rules else True,
        materiality=rules.materiality if rules else None,
        rules=[
            AuditRuleRead(key=key, label=label, on=key not in off)
            for key, label in RULE_NAMES.items()
        ]
        + [
            AuditRuleRead(
                key=key,
                label=label,
                on=key not in off,
                analytical=True,
                pass_label=ANALYTIC_PASS_NAMES.get(key, ""),
            )
            for key, label in ANALYTIC_RULE_NAMES.items()
        ],
    )


@router.get("/house-rules", response_model=HouseRulesRead)
async def get_house_rules(
    auth_subject: auth.TieOutRead,
    organization_id: UUID | None = Query(
        default=None,
        description="Whose rules. Left out, the caller's own organization "
        "answers — the panel's token cannot ask the organizations API "
        "which firm that is, so this endpoint resolves it itself.",
    ),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> HouseRulesRead:
    """How this firm wants Pierce to behave. No row yet means defaults."""
    repository = TieOutRepository.from_session(session)
    if organization_id is None:
        organization_id = await repository.first_organization_for(
            auth_subject.subject.id
        )
        if organization_id is None:
            #: A person in no organization gets the defaults — every
            #: rule on. That is what their audit actually ran.
            return _house_rules(None)
    else:
        await _in_organization(session, organization_id, auth_subject.subject.id)
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
        unknown = [
            key
            for key in update.audit_rules_off
            if key not in RULE_NAMES and key not in ANALYTIC_RULE_NAMES
        ]
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
    if update.materiality is not None:
        rules.materiality = update.materiality if update.materiality > 0 else None
    if update.audit_rules_off is not None:
        rules.audit_rules_off = sorted(set(update.audit_rules_off))
    return _house_rules(await repository.save_house_rules(rules))


@router.get("/team", response_model=TeamRead)
async def get_team(
    auth_subject: auth.TieOutRead,
    organization_id: UUID = Query(),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> TeamRead:
    """Who's on the team, and how many deals each is on — never which.

    Deal names left this response by the founder's decision (26
    August): a colleague's deals are the deal's business, not the
    organization's, and the count is the most this screen may say.
    The names never leave the server — the repository still knows
    them; this route reduces to a number before anything is sent.
    """
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
                deal_count=len(deals),
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
        values_only=bool(stored.get("values_only", False)),
        abstentions=stored.get("abstentions", []),
        tallies=stored.get("tallies", {}),
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


@router.post("/check-file/{check_id}/accept", response_model=OneOffResult)
async def accept_check_rule(
    check_id: UUID,
    body: AcceptCheck,
    auth_subject: auth.TieOutWrite,
    session: AsyncSession = Depends(get_db_session),
) -> OneOffResult:
    """« Accept with a note » on a stored one-off check.

    The bench wears the model page's report face, and the report's
    ruling works here too: every place the named rule fails is accepted
    together under one note, written into the stored answer, so the
    check replays from « Recents » with the ruling standing. Owner only
    — anyone else gets 404, not 403. A rule the answer does not carry,
    or a note with nothing in it, is refused with the reason in words.
    """
    repository = TieOutRepository.from_session(session)
    row = await repository.get_one_off(check_id, auth_subject.subject.id)
    if row is None:
        raise ResourceNotFound("Check not found.")
    try:
        row = await tieout.accept_check_rule(
            session, row, rule=body.rule, note=body.note
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
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

    # **A ruling needs a reason.** Dismissing says the check is wrong
    # about this one; accepting says it is right and lived with — both
    # are the decision somebody questions three weeks later with the
    # author on holiday. Reopening asks nothing: a box everyone must
    # type past collects « ok ».
    if (
        update.state in (FindingState.dismissed, FindingState.accepted)
        and not update.note.strip()
    ):
        raise ClaidorRequestValidationError(
            [
                {
                    "loc": ("body", "note"),
                    "msg": (
                        "A ruling needs its reason — one sentence, so the "
                        "decision survives you moving on."
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


@router.get("/artifacts/{artifact_id}/open", response_model=None)
async def open_artifact(
    artifact_id: UUID,
    auth_subject: auth.TieOutRead,
    ref: str = Query(default="", description="A cell to land on — « Opex!G6 »."),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """Where « Open the cell » sends the browser: the real document.

    A model synced from SharePoint opens as the actual workbook on the
    site — the same file the deal reads — with a best-effort cell
    landing in the URL. A model uploaded by hand has no live document
    anywhere; the stored bytes are the truth, so the answer is a
    download of the exact version that was checked, and the screen says
    which it got. A write session, because reaching SharePoint may
    refresh the connection's token.
    """
    artifact = await _artifact_in_deal(session, artifact_id, auth_subject.subject.id)

    if artifact.external_id:
        from polar.connector.graph import GraphError
        from polar.connector.repository import ConnectorRepository
        from polar.connector.service import ConnectorError, connector

        repository = ConnectorRepository.from_session(session)
        folder = await repository.folder_of(artifact.dossier_id)
        connection = (
            await repository.get(folder.connection_id) if folder is not None else None
        )
        if folder is not None and connection is not None:
            try:
                graph = await connector.client_for(session, connection=connection)
                item = await graph.item(folder.drive_id, artifact.external_id)
            except (ConnectorError, GraphError):
                #: The site is unreachable or the connection is dead —
                #: the stored copy below is still openable, and honest.
                item = None
            if item is not None and item.web_url:
                url = item.web_url
                if ref and "!" in ref:
                    #: Best-effort: Excel on the web reads `activeCell`
                    #: from the query on SharePoint document links. The
                    #: file opens either way; the landing needs the real
                    #: tenant to confirm — the local stub cannot.
                    sheet, coordinate = ref.rsplit("!", 1)
                    url += ("&" if "?" in url else "?") + (
                        f"activeCell='{quote(sheet)}'!{coordinate}"
                    )
                return {"kind": "sharepoint", "url": url}

    try:
        return {
            "kind": "download",
            "url": download_url(artifact),
            "filename": artifact.filename,
        }
    except FileNotKept as problem:
        raise HTTPException(status_code=404, detail=str(problem)) from problem


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


@router.get("/deals/{dossier_id}/markup", response_model=None)
async def marked_up_model(
    dossier_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> Response:
    """The model back, with every problem marked in place.

    The founder's § 4 file: a first sheet listing the open findings so
    they can be sorted and ticked off, and the model itself — unchanged,
    not one formula, not one number — with the problem cells coloured by
    severity and the finding's own sentence stuck on each as a note.

    Generated fresh from the stored model and the open findings on it,
    and never persisted: it is colour and notes on the caller's own
    file, verified unaltered before it is released, with a different
    filename so the original is never at risk.
    """
    deal = await _deal(session, dossier_id, auth_subject.subject.id)
    repository = TieOutRepository.from_session(session)
    current = await repository.current_artifacts(deal.id)
    model = subject_model(current)
    if model is None:
        raise HTTPException(status_code=404, detail="this deal has no model yet")

    marks: list[MarkupFinding] = []
    for finding in await repository.findings_of(deal.id, state=FindingState.open):
        anchor = finding.anchor or {}
        if anchor.get("kind") != "cell" or finding.artifact_id != model.id:
            continue
        sheet = str(anchor.get("sheet") or "")
        ref = str(anchor.get("ref") or "").rsplit("!", 1)[-1]
        if not sheet or not ref:
            continue
        marks.append(
            MarkupFinding(
                severity=finding.severity.value,
                sheet=sheet,
                ref=ref,
                text=finding.title or finding.detail,
            )
        )
    if not marks:
        raise HTTPException(
            status_code=404,
            detail="no open findings sit on the model — nothing to mark up",
        )
    try:
        payload = fetch(model)
    except FileNotKept as problem:
        raise HTTPException(status_code=404, detail=str(problem)) from problem
    try:
        copy = marked_up_copy(payload, marks)
    except MarkupRefused as problem:
        raise HTTPException(status_code=422, detail=str(problem)) from problem

    filename = marked_up_name(model.filename or "model.xlsx")
    return Response(
        content=copy,
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={
            "content-disposition": f"attachment; filename*=UTF-8''{quote(filename)}"
        },
    )


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


def _scope_line(model: Artifact, others: Sequence[Artifact]) -> str:
    """Which model the assistant is reading, when the deal holds more.

    The tools only ever see one model, so without this the assistant
    cannot know it is on a deal with others and will answer « that line
    is not in this model » about a line sitting in the file next to it.
    Named rather than counted: a reader has to be able to tell whether
    the one that was read is the one they meant.
    """
    if not others:
        return ""
    named = ", ".join(f"{one.filename} (v{one.version})" for one in others)
    return (
        f"You are reading {model.filename} (version {model.version}), the "
        f"most recently uploaded model on this deal. The deal also holds "
        f"{named}, which you cannot see. Say which model you read when it "
        f"could matter, and never answer about the others."
    )


def _conversation(body: Ask, finding: Finding | None, scope: str = "") -> str:
    """One prompt for the loop, carrying the chat's context.

    The loop takes a single prompt, so the finding the chat was opened
    from and the last few exchanges are folded in, labelled — the
    banker's own words and the agent's earlier answers, never anything
    invented between them. The tools still bound every figure in the
    reply.
    """
    parts: list[str] = []
    if scope:
        parts.append(scope)
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


def _answer_rows(outcome: Outcome) -> tuple[list[AskedRow], str]:
    """The cells behind the answer — the last tool that returned any.

    Verbatim from the tool's own payload; nothing here passes through
    the language model, which is what keeps a listed figure a looked-up
    figure.

    The second half of the return is **what those cells are**, in the
    tool's own words: « 308 typed inputs across 13 sheets (no size
    filter applied) ». Without it a screen has a table and no name for
    it, and a table with no name under a paragraph about something else
    is a dump — which is exactly what the founder saw when they asked a
    question about the model in general and got twelve cells under the
    answer with nothing saying why.
    """
    rows: list[AskedRow] = []
    label = ""
    for step in outcome.steps:
        step_rows = step.data.get("rows") if step.ok else None
        if step_rows:
            rows = [
                AskedRow(
                    ref=str(one.get("ref", "")),
                    what=str(one.get("what", "")),
                    value=str(one.get("value", "")),
                )
                for one in step_rows
            ]
            label = step.summary
    return rows, label


def _answer_clarify(outcome: Outcome) -> AskedClarify | None:
    """Did the assistant stop to ask something?

    Read off the tool call rather than the prose, and **the last one
    wins**: a turn that asked, was answered and asked again is showing
    its latest question, not its first.
    """
    clarify: AskedClarify | None = None
    for step in outcome.steps:
        if not step.ok or not step.data.get("await_person"):
            continue
        card = step.data.get("card") or {}
        options = [str(o) for o in (step.data.get("options") or [])]
        if len(options) < 2:
            #: The tool refuses this itself; if one ever reaches here,
            #: drawing a card with nothing to choose would be worse
            #: than drawing no card at all.
            continue
        clarify = AskedClarify(
            question=str(step.data.get("question", "")),
            title=str(card.get("title", "")),
            blurb=str(card.get("blurb", "")),
            options=options,
        )
    return clarify


def _asked(
    task: Any,
    outcome: Outcome,
    subject: Artifact | None,
    others: Sequence[Artifact],
) -> Asked:
    """One answer on the wire, however it was asked for.

    Both assist routes build their payload here, deliberately: the
    streaming one and the plain one differ in *when* a screen learns
    what happened, never in what happened. Two constructions would
    eventually disagree about that, and the disagreement would be
    invisible until somebody compared two screens.
    """
    rows, rows_label = _answer_rows(outcome)
    return Asked(
        clarify=_answer_clarify(outcome),
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
        stages=[
            _stage(
                step,
                subject.filename if subject is not None else "",
                subject.version if subject is not None else None,
            )
            for step in outcome.steps
        ],
        rows=rows,
        rows_label=rows_label,
        model=subject.filename if subject is not None else None,
        model_version=subject.version if subject is not None else None,
        other_models=[f"{one.filename} (v{one.version})" for one in others],
    )


def _stage(step: Step, model: str, version: int | None) -> AskedStage:
    """One tool call in the shape the run screen draws it."""
    one = run_stage(step, model=model, version=version)
    return AskedStage(
        ordinal=one.ordinal,
        tool=one.tool,
        ok=one.ok,
        kind=one.kind,
        title=one.title,
        sub=one.sub,
        summary=one.summary,
        art=one.art,
    )


@router.post("/deals/{dossier_id}/assist", response_model=Asked, status_code=201)
async def assist(
    dossier_id: UUID,
    body: Ask,
    auth_subject: auth.TieOutWrite,
    session: AsyncSession = Depends(get_db_session),
) -> Asked:
    """The assistant: one question about one model, answered from its
    stored graph.

    A different job from `/ask`. That chat defends findings; this one
    answers « what is this model » for someone who did not build it —
    where a number comes from, what moves if it changes, what is typed,
    how the sheets are laid out, what changed between versions. Every
    figure in the reply came out of a tool over the stored cells, and
    the rows come back verbatim from the last tool that produced any —
    they never pass through the language model.
    """
    deal = await _deal(session, dossier_id, auth_subject.subject.id)
    try:
        client = agent_client()
    except AgentNotConfigured as problem:
        raise HTTPException(status_code=503, detail=str(problem)) from problem

    #: Which model the answer will be about, resolved here so the reply
    #: can state it off the artifacts rather than off the prose. The
    #: loader narrows to the same one through the same helper, so the
    #: two cannot disagree.
    repository = TieOutRepository.from_session(session)
    models = models_of(await repository.current_artifacts(deal.id))
    subject, others = (models[0], models[1:]) if models else (None, [])

    try:
        task, outcome = await agent.ask_model(
            session,
            dossier_id=deal.id,
            user_id=auth_subject.subject.id,
            prompt=_conversation(
                body,
                None,
                _scope_line(subject, others) if subject is not None else "",
            ),
            client=client,
            name=deal.name,
        )
    except ValueError as problem:
        raise HTTPException(status_code=409, detail=str(problem)) from problem

    return _asked(task, outcome, subject, others)


@router.post("/deals/{dossier_id}/assist/stream")
async def assist_stream(
    dossier_id: UUID,
    body: Ask,
    auth_subject: auth.TieOutWrite,
    session: AsyncSession = Depends(get_db_session),
    sessionmaker: AsyncSessionMaker = Depends(get_db_sessionmaker),
) -> StreamingResponse:
    """The same answer as `/assist`, but while it is being worked out.

    A model question is slow — it is a model call with tool calls inside
    it, and a real workbook question runs several. The founder's design
    does not draw a spinner over that: it draws the run, one live step
    at a time, each line naming the real object it is reading. That is
    only possible if the steps leave the server *as they happen*, which
    is what this route is for.

    **Newline-delimited JSON, not SSE.** One object per line, each with
    a `kind`: `stage` while the run goes on, then exactly one `done`
    carrying the whole `Asked` payload — the same object `/assist`
    returns, built by the same function, so the two routes cannot come
    to disagree about what took place. A run that breaks sends `error`
    with the server's own sentence and no `done`.

    The plain route stays. A caller that cannot stream — the Office
    panel behind a proxy that buffers, a test, anything holding an
    `Asked` and nothing else — asks there and gets the identical answer
    in one piece, `stages` and all.
    """
    deal = await _deal(session, dossier_id, auth_subject.subject.id)
    try:
        client = agent_client()
    except AgentNotConfigured as problem:
        raise HTTPException(status_code=503, detail=str(problem)) from problem

    repository = TieOutRepository.from_session(session)
    models = models_of(await repository.current_artifacts(deal.id))
    subject, others = (models[0], models[1:]) if models else (None, [])
    prompt = _conversation(
        body, None, _scope_line(subject, others) if subject is not None else ""
    )

    #: Loaded here rather than inside the stream, and on purpose: this
    #: is the one slow thing that can fail in a way the caller should
    #: hear as an HTTP status. « This deal holds no model » is a 409
    #: before a byte of the body is written, not an `error` line half
    #: way down a stream nobody is checking.
    workspace = await agent.load_model_workspace(session, deal.id, deal.name)
    if workspace is None:
        raise HTTPException(
            status_code=409, detail="this deal holds no model to ask about"
        )

    user_id = auth_subject.subject.id
    named = subject.filename if subject is not None else ""
    version = subject.version if subject is not None else None

    async def lines() -> AsyncGenerator[str, None]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

        #: Runs synchronously inside the loop, so it does one thing
        #: and returns. Anything slower here would hold the run at the
        #: speed of the screen watching it.
        #:
        #: **Only steps go down this queue.** The model's prose used to
        #: as well, and it was shown as the status line — but it writes
        #: paragraphs, not status lines, so the line grew and ran
        #: together. The status line is the step's own short phrase now.
        def did(step: Step) -> None:
            queue.put_nowait(
                {"kind": "stage", **_stage(step, named, version).model_dump()}
            )

        runner = asyncio.ensure_future(
            agent_run(
                client,
                MODEL_TOOLSET,
                workspace,
                prompt,
                effort=ASSISTANT_EFFORT,
                #: The one picture, resolved from the file before the
                #: question was asked. Every answer about this model
                #: reads from it, which is what stops two of them
                #: describing different files.
                known=as_prompt(workspace.picture) if workspace.picture else "",
                on_step=did,
            )
        )

        async for event in _as_they_happen(runner, queue):
            yield _ndjson(event)

        try:
            outcome = await runner
        except Exception as problem:  # pragma: no cover — the loop catches its own
            yield _ndjson({"kind": "error", "detail": str(problem)})
            return

        #: The house style, before anybody reads it. This is why the
        #: answer is not streamed: prose that may be sent back to be
        #: written again must not be on screen while it is judged.
        checked = await gate.written(client, outcome.answer, model=AGENT_MODEL)
        outcome.answer = checked.answer

        #: A session of this route's own. The request's is committed
        #: when its dependency unwinds, and that happens before this
        #: body is written — so the one write this route makes opens,
        #: commits and closes here, where it can be seen to.
        async with sessionmaker() as writing:
            task = await agent.record(
                writing,
                dossier_id=deal.id,
                user_id=user_id,
                prompt=prompt,
                outcome=outcome,
            )
            answer = _asked(task, outcome, subject, others)
            await writing.commit()
        yield _ndjson({"kind": "done", **answer.model_dump(mode="json")})

    return StreamingResponse(
        lines(),
        media_type="application/x-ndjson",
        #: Nginx buffers a proxied response by default, which would hold
        #: every line back until the run ended and turn this route into
        #: the plain one with extra steps.
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-store"},
    )


#: One thing the streaming route watched happen and passed on — a
#: piece of prose as it was written, or a finished tool call. Named
#: so the queue between the loop and the response says what it
#: carries rather than « dict ».
type Watched = dict[str, Any]


def _ndjson(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, default=str) + "\n"


async def _as_they_happen(
    runner: "asyncio.Future[Outcome]",
    queue: "asyncio.Queue[Watched]",
) -> AsyncGenerator[Watched, None]:
    """Each event the moment it is put down, then the ones left over.

    The whole point of the streaming route is in these few lines, and
    they are here rather than inside the endpoint so they can be driven
    on their own. Two things have to hold and neither is obvious.

    **An event leaves before the run ends.** Waiting on the queue *and*
    on the run together is what makes that true; waiting on the run
    first would send every line at the end, which is the plain route
    with more machinery.

    **An event queued as the run finished is still sent.** The last
    words of the answer and the run's return land within milliseconds of
    each other, so the race is the normal case rather than the edge one
    — and an event dropped there would leave the screen showing an
    answer with its last sentence missing.
    """
    while True:
        waiting = asyncio.ensure_future(queue.get())
        #: The two futures answer different questions — « is there a
        #: step » and « is the run over » — so the set is annotated
        #: rather than inferred down to their only common ancestor.
        racing: set[asyncio.Future[Any]] = {waiting, runner}
        done, _ = await asyncio.wait(racing, return_when=asyncio.FIRST_COMPLETED)
        if waiting in done:
            yield waiting.result()
            continue
        waiting.cancel()
        break
    while not queue.empty():
        yield queue.get_nowait()


@router.post("/check-file/{check_id}/ask", response_model=Asked, status_code=201)
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
    outcome = await run_agent(client, FILE_TOOLSET, room, _conversation(body, None))
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
