"""The four named analyses, computed from the corpus — never asserted.

Each of these answers a question a lawyer asks every week, and each one is
arithmetic over verified data rather than a model's impression:

- **autorité** — how many *distinct* decisions hold this, over how many
  years, counted on one named article so the denominator is checkable;
- **historique** — which version governs on a date, from the versions'
  own in-force dates, plus the recorded concordance;
- **comparer** — the two texts aligned alinéa by alinéa (see diff.py);
- **citations** — who cites this article, and which provisions travel
  with it, from co-occurrence on the same decision.

Two rules run through all of it. Only *verified* links count — a proposed
link is a machine's guess and never reaches a figure on screen. And when
something is unknown (no equivalence recorded, no date supplied), the
result says so instead of implying the reassuring answer.
"""

from datetime import date
from uuid import UUID

from polar.corpus.repository import CorpusRepository
from polar.kit.db.postgres import AsyncReadSession
from polar.models import CourtDecision, DecisionArticleTreatment, LegalArticle

from .diff import ChangeKind, compare_articles
from .schemas import (
    AnalysisSubject,
    AnalysisSuggestions,
    AnalysisTarget,
    AuthorityAnalysis,
    AuthorityRow,
    ChangeRow,
    CitationRow,
    CitationsAnalysis,
    CoCitedArticle,
    CompareAnalysis,
    ComparePane,
    HistoryAnalysis,
    VersionRow,
)

#: Kept out of « what should I analyse » — not out of the corpus. The
#: Treaty's jurisdictional articles are recited by nearly every arrêt
#: (art. 13 in 1,036 of 1,264), so by raw citation count they outrank every
#: substantive provision in OHADA law while telling a lawyer nothing.
#: Analysing them on purpose stays perfectly possible.
SUGGESTION_EXCLUDED_ACTS = ("TRAITE",)

#: A line of cases, not a lucky pair: repeated holdings across several
#: years. Kept as constants because the threshold is a claim about the law
#: we make on screen, and it should be visible and arguable.
CONSTANT_MIN_DECISIONS = 4
CONSTANT_MIN_YEARS = 3

QUOTE_LIMIT = 160

#: Which provision a decision's authority is measured on, when it cites
#: several. The question « is this solution constant » is about the
#: provision the court *applied*, not one it mentioned in passing — so
#: applies outranks interprets outranks distinguishes outranks cites, and
#: the article number breaks any tie so the anchor never moves between
#: runs. The choice is disclosed on screen, and the lawyer can re-run the
#: analysis on any other cited article.
_TREATMENT_RANK = {
    DecisionArticleTreatment.applies: 0,
    DecisionArticleTreatment.interprets: 1,
    DecisionArticleTreatment.distinguishes: 2,
    DecisionArticleTreatment.cites: 3,
}


def _article_label(article: LegalArticle) -> str:
    version = article.act_version
    act = version.act
    return f"art. {article.number} ({act.short_code} {version.label})"


def _decision_reference(decision: CourtDecision) -> str:
    return f"{decision.court} {decision.number}"


def _clip(text: str | None) -> str | None:
    if not text:
        return None
    text = " ".join(text.split())
    if len(text) <= QUOTE_LIMIT:
        return text
    return text[:QUOTE_LIMIT].rsplit(" ", 1)[0] + "…"


class AnalysisService:
    # --- where to start ---------------------------------------------------

    async def suggestions(self, session: AsyncReadSession) -> AnalysisSuggestions:
        """What is worth analysing, according to the corpus itself.

        The Analyses screen used to open on four hand-picked examples.
        Fine as a drawing, wrong as a product: a lawyer clicking one got a
        demonstration rather than their own library. Everything here is
        ranked out of the collection, so the screen cannot drift from what
        is loaded behind it — and an empty corpus honestly offers nothing
        rather than four dead links.
        """
        repository = CorpusRepository.from_session(session)
        cited = await repository.list_most_cited_articles(
            limit=3, exclude_acts=SUGGESTION_EXCLUDED_ACTS
        )
        # History and compare both need a provision that exists in more
        # than one rédaction; offering either on a single-version article
        # opens a screen with nothing on it.
        comparable = await repository.list_most_cited_articles(
            limit=3, with_equivalence=True, exclude_acts=SUGGESTION_EXCLUDED_ACTS
        )
        decisions = await repository.list_most_linked_decisions(limit=3)

        def article_target(article: LegalArticle) -> AnalysisTarget:
            return AnalysisTarget(
                kind="article", id=article.id, label=_article_label(article)
            )

        versioned = [article_target(article) for article, _ in comparable]
        return AnalysisSuggestions(
            authority=[
                AnalysisTarget(
                    kind="decision",
                    id=decision.id,
                    label=_decision_reference(decision),
                )
                for decision, _ in decisions
            ],
            history=versioned,
            compare=versioned,
            citations=[article_target(article) for article, _ in cited],
        )

    # --- vérifier l'autorité ---------------------------------------------

    async def authority(
        self,
        session: AsyncReadSession,
        *,
        article_id: UUID | None = None,
        decision_id: UUID | None = None,
    ) -> AuthorityAnalysis | None:
        """Run on a decision or on an article; both anchor to one article.

        « Is this solution constant » is really « has this provision been
        read this way repeatedly », and that can only be counted against
        one article at a time. From a decision, the anchor is the provision
        the court applied (see _TREATMENT_RANK) — never the one with the
        most decisions behind it, which would be choosing the anchor to
        flatter the number. The same rule every run is what keeps the
        figure from moving between sessions.
        """
        repository = CorpusRepository.from_session(session)
        also_cited: list[str] = []
        anchor: LegalArticle | None = None

        if decision_id is not None:
            decision = await repository.get_decision_by_id(decision_id)
            if decision is None:
                return None
            subject = AnalysisSubject(
                kind="decision", id=decision.id, label=_decision_reference(decision)
            )
            links = sorted(
                await repository.list_verified_links_for_decision(decision.id),
                key=lambda link: (
                    _TREATMENT_RANK.get(link.treatment, len(_TREATMENT_RANK)),
                    link.article.sort_key,
                ),
            )
            if links:
                anchor = links[0].article
                also_cited = [_article_label(link.article) for link in links[1:]]
        else:
            assert article_id is not None
            anchor = await repository.get_article_by_id(article_id)
            if anchor is None:
                return None
            subject = AnalysisSubject(
                kind="article", id=anchor.id, label=_article_label(anchor)
            )

        if anchor is None:
            # A decision in the corpus whose citations are not yet verified.
            # Saying so is the honest answer; inventing a line is not.
            return AuthorityAnalysis(
                subject=subject,
                anchor_article_id=None,
                anchor_label=None,
                also_cited=[],
                level="aucune",
                decision_count=0,
                year_span=0,
                label="Aucune citation vérifiée pour cette décision dans le corpus chargé",
                rows=[],
            )

        # Judgments only: « ligne jurisprudentielle » is a claim about
        # cases decided, and an avis decided none.
        links = await repository.list_verified_links_for_article(
            anchor.id, judgments_only=True
        )
        by_decision: dict[UUID, AuthorityRow] = {}
        for link in links:
            decision = link.decision
            if decision.id in by_decision:
                continue
            by_decision[decision.id] = AuthorityRow(
                decision_id=decision.id,
                reference=_decision_reference(decision),
                decided_on=decision.decided_on,
                quote=_clip(link.treatment_quote) or _clip(decision.summary),
            )
        rows = sorted(by_decision.values(), key=lambda r: r.decided_on, reverse=True)
        years = {row.decided_on.year for row in rows}
        count = len(rows)

        if count == 0:
            level = "aucune"
        elif count == 1:
            level = "isolee"
        elif count >= CONSTANT_MIN_DECISIONS and len(years) >= CONSTANT_MIN_YEARS:
            level = "constante"
        else:
            level = "limitee"

        anchor_label = _article_label(anchor)
        decisions_word = "décisions" if count > 1 else "décision"
        headline = {
            "constante": "Ligne jurisprudentielle constante",
            "limitee": "Autorité limitée",
            "isolee": "Décision isolée",
            "aucune": "Aucune décision vérifiée",
        }[level]
        label = (
            f"{headline} · {count} {decisions_word} sur l'{anchor_label} "
            "dans le corpus chargé"
            if count
            else f"{headline} sur l'{anchor_label} dans le corpus chargé"
        )

        return AuthorityAnalysis(
            subject=subject,
            anchor_article_id=anchor.id,
            anchor_label=anchor_label,
            also_cited=also_cited,
            level=level,
            decision_count=count,
            year_span=len(years),
            label=label,
            rows=rows,
        )

    # --- retracer l'historique -------------------------------------------

    async def history(
        self,
        session: AsyncReadSession,
        *,
        article_id: UUID,
        on: date | None = None,
    ) -> HistoryAnalysis | None:
        repository = CorpusRepository.from_session(session)
        article = await repository.get_article_by_id(article_id)
        if article is None:
            return None

        act = article.act_version.act
        versions = await repository.list_versions_for_act(act.id)
        equivalences = await repository.list_equivalences_for_article(article.id)

        # Where this article lands in each version: itself in its own, and
        # whatever the recorded concordance says elsewhere.
        counterpart: dict[UUID, tuple[LegalArticle, str, str | None]] = {}
        for equivalence in equivalences:
            for side, other in (
                (equivalence.old_article, equivalence.new_article),
                (equivalence.new_article, equivalence.old_article),
            ):
                if side is None or other is None or side.id != article.id:
                    continue
                counterpart[other.act_version_id] = (
                    other,
                    str(equivalence.relation),
                    equivalence.note,
                )

        rows: list[VersionRow] = []
        governing_label: str | None = None
        for version in versions:
            governs = False
            if on is not None:
                starts = version.in_force_from
                ends = version.in_force_to
                governs = (starts is None or starts <= on) and (
                    ends is None or on <= ends
                )
                if governs:
                    governing_label = version.label
            if version.id == article.act_version_id:
                number, other_id, relation, note = (
                    article.number,
                    article.id,
                    None,
                    None,
                )
            elif version.id in counterpart:
                other, relation, note = counterpart[version.id]
                number, other_id = other.number, other.id
            else:
                number, other_id, relation, note = None, None, None, None
            rows.append(
                VersionRow(
                    version_id=version.id,
                    label=version.label,
                    in_force_from=version.in_force_from,
                    in_force_to=version.in_force_to,
                    governs=governs,
                    article_number=number,
                    article_id=other_id,
                    relation=relation,
                    note=note,
                )
            )

        # « Ce qui a changé » is only truthful against a known counterpart.
        changes: list[ChangeRow] = []
        other_article = next(iter(counterpart.values()), None)
        if other_article is not None:
            target = other_article[0]
            older, newer = (
                (article, target)
                if article.act_version.label <= target.act_version.label
                else (target, article)
            )
            changes = _change_rows(older.text, newer.text)

        return HistoryAnalysis(
            subject=AnalysisSubject(
                kind="article", id=article.id, label=_article_label(article)
            ),
            act_short_code=act.short_code,
            versions=rows,
            governing_label=governing_label,
            changes=changes,
            changes_unavailable=other_article is None,
        )

    # --- comparer les versions -------------------------------------------

    async def compare(
        self,
        session: AsyncReadSession,
        *,
        article_id: UUID,
        with_article_id: UUID | None = None,
    ) -> CompareAnalysis | None:
        repository = CorpusRepository.from_session(session)
        article = await repository.get_article_by_id(article_id)
        if article is None:
            return None

        other: LegalArticle | None = None
        if with_article_id is not None:
            other = await repository.get_article_by_id(with_article_id)
        else:
            for equivalence in await repository.list_equivalences_for_article(
                article.id
            ):
                candidate = (
                    equivalence.new_article
                    if equivalence.old_article_id == article.id
                    else equivalence.old_article
                )
                if candidate is not None and candidate.id != article.id:
                    other = await repository.get_article_by_id(candidate.id)
                    break
        if other is None:
            return None

        older, newer = (
            (article, other)
            if article.act_version.label <= other.act_version.label
            else (other, article)
        )
        comparison = compare_articles(older.text, newer.text)

        left_alineas = [p.old_text for p in comparison.pairs if p.old_index]
        right_alineas = [p.new_text for p in comparison.pairs if p.new_index]
        # Highlight on the newer side only: the reader is asking what the
        # current text gained, and marking both sides paints the screen.
        highlighted = [
            p.new_index
            for p in comparison.pairs
            if p.new_index and p.kind in (ChangeKind.added, ChangeKind.modified)
        ]

        return CompareAnalysis(
            subject=AnalysisSubject(
                kind="article", id=article.id, label=_article_label(article)
            ),
            left=ComparePane(
                title=f"Art. {older.number} ({older.act_version.label})",
                version_label=older.act_version.label,
                alineas=left_alineas,
                highlighted=[],
            ),
            right=ComparePane(
                title=f"Art. {newer.number} ({newer.act_version.label})",
                version_label=newer.act_version.label,
                alineas=right_alineas,
                highlighted=[i for i in highlighted if i is not None],
            ),
            changes=_change_rows(older.text, newer.text),
            identical=comparison.identical,
        )

    # --- cartographier les citations -------------------------------------

    async def citations(
        self, session: AsyncReadSession, *, article_id: UUID, limit: int = 12
    ) -> CitationsAnalysis | None:
        repository = CorpusRepository.from_session(session)
        article = await repository.get_article_by_id(article_id)
        if article is None:
            return None

        count = await repository.count_verified_decisions_for_article(article.id)
        co_cited = await repository.list_co_cited_articles(article.id)
        links = await repository.list_verified_links_for_article(article.id)

        seen: set[UUID] = set()
        rows: list[CitationRow] = []
        for link in sorted(links, key=lambda x: x.decision.decided_on, reverse=True):
            decision = link.decision
            if decision.id in seen:
                continue
            seen.add(decision.id)
            rows.append(
                CitationRow(
                    decision_id=decision.id,
                    reference=_decision_reference(decision),
                    decided_on=decision.decided_on,
                )
            )
            if len(rows) >= limit:
                break

        return CitationsAnalysis(
            subject=AnalysisSubject(
                kind="article", id=article.id, label=_article_label(article)
            ),
            decision_count=count,
            cited_with=[
                CoCitedArticle(
                    article_id=other.id, label=_article_label(other), count=n
                )
                for other, n in co_cited
            ],
            rows=rows,
        )


def _change_rows(older_text: str, newer_text: str) -> list[ChangeRow]:
    comparison = compare_articles(older_text, newer_text)
    labels = {
        ChangeKind.added: "alinéa {n} ajouté",
        ChangeKind.removed: "alinéa {n} supprimé",
        ChangeKind.modified: "alinéa {n} modifié",
    }
    return [
        ChangeRow(
            sign=change.sign,
            kind=str(change.kind),
            alinea=change.alinea,
            text=labels[change.kind].format(n=change.alinea)
            + (f" : {change.excerpt}" if change.excerpt else ""),
        )
        for change in comparison.changes
    ]


analysis_service = AnalysisService()
