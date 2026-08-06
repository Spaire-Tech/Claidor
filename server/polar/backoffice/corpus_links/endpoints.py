from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request
from pydantic import UUID4
from tagflow import tag, text

from polar.corpus.repository import CorpusRepository
from polar.models import (
    DecisionArticleLink,
    DecisionArticleTreatment,
    TreatmentStatus,
)
from polar.postgres import AsyncSession, get_db_read_session, get_db_session

from ..components import Tab, button, input, tab_nav
from ..layout import layout
from ..toast import add_toast

router = APIRouter()

TREATMENT_LABELS: dict[DecisionArticleTreatment, str] = {
    DecisionArticleTreatment.applies: "applique",
    DecisionArticleTreatment.interprets: "interprète",
    DecisionArticleTreatment.distinguishes: "distingue",
    DecisionArticleTreatment.cites: "mentionne",
}

STATUS_LABELS: dict[TreatmentStatus, str] = {
    TreatmentStatus.proposed: "Proposés",
    TreatmentStatus.accepted: "Acceptés",
    TreatmentStatus.corrected: "Corrigés",
    TreatmentStatus.rejected: "Rejetés",
    TreatmentStatus.unverified: "Non vérifiés",
}

STATUS_BADGE_CLASSES: dict[TreatmentStatus, str] = {
    TreatmentStatus.proposed: "badge-info",
    TreatmentStatus.accepted: "badge-success",
    TreatmentStatus.corrected: "badge-warning",
    TreatmentStatus.rejected: "badge-error",
    TreatmentStatus.unverified: "badge-ghost",
}

QUOTE_TRUNCATE_LENGTH = 120


def _render_stats(counts: dict[TreatmentStatus, int], *, oob: bool = False) -> None:
    accepted = counts.get(TreatmentStatus.accepted, 0)
    corrected = counts.get(TreatmentStatus.corrected, 0)
    rejected = counts.get(TreatmentStatus.rejected, 0)
    reviewed = accepted + corrected + rejected

    with tag.div(
        id="corpus-links-stats",
        classes="stats stats-vertical sm:stats-horizontal shadow",
        **({"hx_swap_oob": "outerHTML"} if oob else {}),
    ):
        for status in (
            TreatmentStatus.proposed,
            TreatmentStatus.accepted,
            TreatmentStatus.corrected,
            TreatmentStatus.rejected,
            TreatmentStatus.unverified,
        ):
            with tag.div(classes="stat"):
                with tag.div(classes="stat-title"):
                    text(STATUS_LABELS[status])
                with tag.div(classes="stat-value text-2xl"):
                    text(str(counts.get(status, 0)))
        with tag.div(classes="stat"):
            with tag.div(classes="stat-title"):
                text("Taux d'accord")
            with tag.div(classes="stat-value text-2xl"):
                if reviewed > 0:
                    text(f"{accepted / reviewed * 100:.1f} %")
                else:
                    text("—")
            with tag.div(classes="stat-desc"):
                text(f"{accepted} acceptés / {reviewed} revus")


def _render_quote(quote: str | None) -> None:
    if not quote:
        with tag.span(classes="opacity-50"):
            text("—")
    elif len(quote) <= QUOTE_TRUNCATE_LENGTH:
        with tag.span(classes="italic"):
            text(f"« {quote} »")
    else:
        with tag.details():
            with tag.summary(classes="italic cursor-pointer"):
                text(f"« {quote[:QUOTE_TRUNCATE_LENGTH].rstrip()}… »")
            with tag.p(classes="italic whitespace-pre-line mt-2"):
                text(f"« {quote} »")


def _render_actions(request: Request, link: DecisionArticleLink) -> None:
    with tag.div(classes="flex items-center gap-2"):
        if link.treatment_status == TreatmentStatus.proposed:
            with button(
                size="xs",
                variant="success",
                outline=True,
                hx_post=str(request.url_for("corpus_links:accept", id=link.id)),
                hx_target="closest tr",
                hx_swap="outerHTML",
            ):
                text("Accepter")
        if link.treatment_status in (
            TreatmentStatus.proposed,
            TreatmentStatus.corrected,
        ):
            with button(
                size="xs",
                variant="error",
                outline=True,
                hx_post=str(request.url_for("corpus_links:reject", id=link.id)),
                hx_target="closest tr",
                hx_swap="outerHTML",
            ):
                text("Rejeter")
            with tag.details(classes="dropdown dropdown-end"):
                with tag.summary(classes="btn btn-xs btn-outline"):
                    text("Corriger")
                with tag.div(
                    classes="dropdown-content z-10 bg-base-100 rounded-box shadow-lg p-3 w-56"
                ):
                    with tag.form(
                        classes="flex flex-col gap-2",
                        hx_post=str(
                            request.url_for("corpus_links:correct", id=link.id)
                        ),
                        hx_target="closest tr",
                        hx_swap="outerHTML",
                    ):
                        with input.select(
                            [
                                (label, treatment.value)
                                for treatment, label in TREATMENT_LABELS.items()
                            ],
                            link.treatment.value,
                            name="treatment",
                            classes="select-sm w-full",
                        ):
                            pass
                        with button(type="submit", size="xs", variant="primary"):
                            text("Confirmer")
        else:
            with tag.span(classes="opacity-50"):
                text("—")


def _render_row(request: Request, link: DecisionArticleLink) -> None:
    with tag.tr(id=f"corpus-link-{link.id}"):
        with tag.td():
            with tag.div(classes="font-medium whitespace-nowrap"):
                text(f"{link.decision.court} {link.decision.number}")
            with tag.div(classes="text-xs opacity-60"):
                text(link.decision.decided_on.strftime("%d/%m/%Y"))
        with tag.td():
            with tag.div(classes="font-medium whitespace-nowrap"):
                text(f"Art. {link.article.number}")
            with tag.div(classes="text-xs opacity-60 whitespace-nowrap"):
                text(
                    f"{link.article.act_version.act.short_code} "
                    f"{link.article.act_version.label}"
                )
        with tag.td():
            with tag.div(classes="flex flex-col items-start gap-1"):
                with tag.div(classes="badge badge-outline"):
                    text(TREATMENT_LABELS[link.treatment])
                with tag.div(
                    classes=f"badge badge-sm {STATUS_BADGE_CLASSES[link.treatment_status]}"
                ):
                    text(link.treatment_status.value)
        with tag.td(classes="max-w-md"):
            _render_quote(link.treatment_quote)
        with tag.td():
            _render_actions(request, link)


@router.get("/", name="corpus_links:list")
async def list(
    request: Request,
    status: TreatmentStatus = Query(TreatmentStatus.proposed),
    session: AsyncSession = Depends(get_db_read_session),
) -> None:
    repository = CorpusRepository.from_session(session)
    links = await repository.list_links_by_treatment_status(status)
    counts = await repository.count_links_by_treatment_status()

    list_url = request.url_for("corpus_links:list")
    with layout(
        request,
        [
            ("Corpus Links", str(list_url)),
        ],
        "corpus_links:list",
    ):
        with tag.div(classes="flex flex-col gap-4"):
            with tag.h1(classes="text-4xl"):
                text("Corpus Links")
            _render_stats(counts)
            with tab_nav(
                [
                    Tab(
                        STATUS_LABELS[tab_status],
                        url=f"{list_url}?status={tab_status.value}",
                        active=tab_status == status,
                        count=counts.get(tab_status, 0),
                    )
                    for tab_status in (
                        TreatmentStatus.proposed,
                        TreatmentStatus.accepted,
                        TreatmentStatus.corrected,
                        TreatmentStatus.rejected,
                        TreatmentStatus.unverified,
                    )
                ]
            ):
                pass
            with tag.div(classes="overflow-x-auto"):
                with tag.table(classes="table"):
                    with tag.thead():
                        with tag.tr():
                            for column in (
                                "Décision",
                                "Article",
                                "Traitement",
                                "Citation",
                                "Actions",
                            ):
                                with tag.th():
                                    text(column)
                    with tag.tbody():
                        if not links:
                            with tag.tr():
                                with tag.td(
                                    colspan=5, classes="text-center opacity-60 py-8"
                                ):
                                    text(
                                        f"Aucun lien avec le statut « {status.value} »."
                                    )
                        for link in links:
                            _render_row(request, link)


async def _get_link(repository: CorpusRepository, id: UUID4) -> DecisionArticleLink:
    link = await repository.get_link_by_id(id)
    if link is None:
        raise HTTPException(status_code=404)
    return link


async def _finish_action(request: Request, repository: CorpusRepository) -> None:
    counts = await repository.count_links_by_treatment_status()
    _render_stats(counts, oob=True)


@router.post("/{id}/accept", name="corpus_links:accept")
async def accept(
    request: Request,
    id: UUID4,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    repository = CorpusRepository.from_session(session)
    link = await _get_link(repository, id)
    if link.treatment_status != TreatmentStatus.proposed:
        raise HTTPException(
            status_code=400, detail="Only a proposed label can be accepted."
        )

    await repository.set_link_treatment_review(
        link, treatment_status=TreatmentStatus.accepted
    )
    await add_toast(request, "Libellé accepté.", "success")
    _render_row(request, link)
    await _finish_action(request, repository)


@router.post("/{id}/reject", name="corpus_links:reject")
async def reject(
    request: Request,
    id: UUID4,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    repository = CorpusRepository.from_session(session)
    link = await _get_link(repository, id)
    if link.treatment_status not in (
        TreatmentStatus.proposed,
        TreatmentStatus.corrected,
    ):
        raise HTTPException(
            status_code=400,
            detail="Only a proposed or corrected label can be rejected.",
        )

    await repository.set_link_treatment_review(
        link, treatment_status=TreatmentStatus.rejected
    )
    await add_toast(request, "Libellé rejeté.", "success")
    _render_row(request, link)
    await _finish_action(request, repository)


@router.post("/{id}/correct", name="corpus_links:correct")
async def correct(
    request: Request,
    id: UUID4,
    treatment: Annotated[DecisionArticleTreatment, Form()],
    session: AsyncSession = Depends(get_db_session),
) -> None:
    repository = CorpusRepository.from_session(session)
    link = await _get_link(repository, id)
    if link.treatment_status not in (
        TreatmentStatus.proposed,
        TreatmentStatus.corrected,
    ):
        raise HTTPException(
            status_code=400,
            detail="Only a proposed or corrected label can be corrected.",
        )

    await repository.set_link_treatment_review(
        link, treatment=treatment, treatment_status=TreatmentStatus.corrected
    )
    await add_toast(
        request, f"Libellé corrigé en « {TREATMENT_LABELS[treatment]} ».", "success"
    )
    _render_row(request, link)
    await _finish_action(request, repository)
