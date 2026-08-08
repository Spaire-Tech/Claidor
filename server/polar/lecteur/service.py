"""Checking a document's citations against the corpus.

The Lecteur answers one question per reference: does this hold up? Every
verdict here is computed — an article number is either in the act or it is
not, a decision number is either in the collection or it is not — and the
note attached to each one says which check was run and against what.
Nothing is asserted that a reader could not confirm by opening the text.

Three verdicts, and the middle one carries the weight:

- **Vérifiée** — the reference resolves, exactly as written.
- **À vérifier** — something is missing from the reference itself (no
  rédaction named for an act that has two, no CCJA number we hold), so it
  cannot be confirmed or refuted from here.
- **Point faible** — the reference is wrong on its face: the article is not
  in the act, or not in the rédaction the document claims.

Absence from our collection is never a « point faible ». The corpus is
large but not complete, and calling someone's citation false because we do
not hold it would be the one failure a lawyer could not forgive.
"""

import re
from dataclasses import dataclass
from datetime import date
from difflib import SequenceMatcher
from uuid import UUID

from polar.analysis.diff import fold
from polar.corpus.repository import CorpusRepository
from polar.kit.db.postgres import AsyncReadSession
from polar.models import CourtDecision, DecisionKind, LegalArticle

from .citations import Citation, Finding, extract

#: PDF extraction leaves « l' étendue » where the text reads « l'étendue ».
#: Comparing two rédactions has to see through that or every article looks
#: rewritten.
_SPACED_APOSTROPHE = re.compile(r"(['’])\s+")

#: A national court named beside the number: the decision is real, it is
#: simply not in a CCJA collection, and saying « introuvable » would be a
#: statement about their citation rather than about our holdings.
_NATIONAL_COURT = re.compile(
    r"cour\s+d[''’]appel|cour\s+supr[êe]me|tribunal|conseil\s+d[''’][ée]tat"
    r"|cour\s+de\s+cassation",
    re.IGNORECASE,
)
COURT_REACH = 80

_MONTHS = (
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
)


def french_date(day: date) -> str:
    return f"{day.day} {_MONTHS[day.month - 1]} {day.year}"


#: Below this, one rédaction replaced the other rather than reworded it.
#: Above it the provision survived its revision — art. 170 AUPSRVE reads
#: 0.90 across 1998/2023 and says the same thing in different words, while
#: art. 49 reads 0.03 and is a different provision under the same number.
MATERIAL_REWRITE = 0.9


def _normalise(text: str) -> str:
    return _SPACED_APOSTROPHE.sub(r"\1", " ".join(fold(text).split()))


def _same_wording(left: str, right: str) -> bool:
    """Are these two rédactions the same text?

    Compared through the source artifacts — typographic apostrophes,
    unaccented capitals, lost line breaks — because those differ between a
    1998 PDF and a 2023 Akoma Ntoso file for every single article, and a
    reader told « le texte a changé » about all 335 of them learns nothing.
    """
    return _normalise(left) == _normalise(right)


def _rewritten(left: str, right: str) -> bool:
    """Was the provision replaced, rather than reworded?"""
    return (
        SequenceMatcher(None, _normalise(left), _normalise(right)).ratio()
        < MATERIAL_REWRITE
    )


def _join(labels: list[str]) -> str:
    if len(labels) <= 1:
        return "".join(labels)
    return f"{', '.join(labels[:-1])} et {labels[-1]}"


#: Named individually up to here; past it the tail is counted.
MOVED_SHOWN = 3


def _moved_phrase(key: tuple[str, str, str], numbers: list[str], verb: str) -> str:
    """« les articles 153 et 156 de l'AUPSRVE, lus en 1998, réécrits en 2023 »."""
    act, read, since = key
    shown = numbers[:MOVED_SHOWN]
    rest = len(numbers) - len(shown)
    listed = (
        f"{', '.join(shown)} et {rest} autre{'s' if rest > 1 else ''}"
        if rest
        else _join(shown)
    )
    if len(numbers) == 1:
        return (
            f"l'article {listed} de l'{act}, lu dans la rédaction {read}, "
            f"a été {verb} en {since}"
        )
    return (
        f"les articles {listed} de l'{act}, lus dans la rédaction {read}, "
        f"ont été {verb}s en {since}"
    )


@dataclass(frozen=True)
class ReviewFinding:
    """One reference, and what the corpus says about it."""

    kind: str  # "article" | "decision"
    #: The reference as the screen shows it: « Art. 170, AUPSRVE (2023) ».
    cite: str
    status: Finding
    note: str
    #: Where the panel should open, when the reference resolved.
    article_id: UUID | None
    decision_id: UUID | None
    #: The document's own words around the reference — quotable back.
    context: str


@dataclass(frozen=True)
class Review:
    document_name: str
    page_count: int | None
    findings: list[ReviewFinding]
    verified_count: int
    unverified_count: int
    weak_count: int

    @property
    def meta(self) -> str:
        """The line under the filename, counted rather than claimed."""
        parts: list[str] = []
        if self.page_count:
            parts.append(f"{self.page_count} pages")
        total = len(self.findings)
        parts.append(
            "aucune référence détectée"
            if total == 0
            else f"{total} référence{'s' if total > 1 else ''} détectée"
            f"{'s' if total > 1 else ''}"
        )
        if self.weak_count:
            parts.append(
                f"{self.weak_count} point{'s' if self.weak_count > 1 else ''} faible"
                f"{'s' if self.weak_count > 1 else ''}"
            )
        if self.unverified_count:
            parts.append(f"{self.unverified_count} à vérifier")
        if total and not self.weak_count and not self.unverified_count:
            parts.append("toutes vérifiées")
        return " · ".join(parts)


#: Worst first — a lawyer opening this screen reads the top of it.
_ORDER = {Finding.weak: 0, Finding.unverified: 1, Finding.verified: 2}


class LecteurService:
    async def review(
        self,
        session: AsyncReadSession,
        text: str,
        *,
        document_name: str,
        page_count: int | None = None,
    ) -> Review:
        repository = CorpusRepository.from_session(session)
        findings: list[ReviewFinding] = []
        for citation in extract(text):
            if citation.kind == "article":
                findings.append(await self._article(repository, citation))
            else:
                findings.append(await self._decision(repository, citation, text))
        ordered = sorted(
            enumerate(findings), key=lambda pair: (_ORDER[pair[1].status], pair[0])
        )
        result = [finding for _, finding in ordered]
        return Review(
            document_name=document_name,
            page_count=page_count,
            findings=result,
            verified_count=sum(1 for f in result if f.status is Finding.verified),
            unverified_count=sum(1 for f in result if f.status is Finding.unverified),
            weak_count=sum(1 for f in result if f.status is Finding.weak),
        )

    # --- articles ---------------------------------------------------------

    async def _article(
        self, repository: CorpusRepository, citation: Citation
    ) -> ReviewFinding:
        number = citation.number
        cite = f"Art. {number}"
        if citation.act:
            cite += f", {citation.act}"
        if citation.version:
            cite += f" ({citation.version})"

        def finding(
            status: Finding, note: str, article: LegalArticle | None = None
        ) -> ReviewFinding:
            return ReviewFinding(
                kind="article",
                cite=cite,
                status=status,
                note=note,
                article_id=article.id if article else None,
                decision_id=None,
                context=citation.context,
            )

        if citation.act is None:
            return finding(
                Finding.unverified,
                "Acte non nommé — la référence ne dit pas de quel acte uniforme "
                "il s'agit ; le texte n'a pas pu être vérifié.",
            )

        act = await repository.get_act_by_short_code(citation.act)
        if act is None:
            return finding(
                Finding.unverified,
                f"{citation.act} absent du fonds chargé — la vérification du "
                "texte n'est pas possible ici.",
            )

        labels = sorted(version.label for version in act.versions)
        articles = list(
            await repository.list_articles_by_number_for_act(act.id, number)
        )
        if not articles:
            return finding(
                Finding.weak,
                f"Introuvable — aucun article {number} dans l'{act.short_code} "
                f"(rédaction{'s' if len(labels) > 1 else ''} "
                f"{_join(labels)} chargée{'s' if len(labels) > 1 else ''}).",
            )

        present = {article.act_version.label: article for article in articles}

        if citation.version:
            claimed = citation.version
            if claimed not in labels:
                return finding(
                    Finding.unverified,
                    f"Rédaction {claimed} inconnue — l'{act.short_code} est "
                    f"chargé dans les rédactions {_join(labels)}.",
                    articles[-1],
                )
            if claimed not in present:
                return finding(
                    Finding.weak,
                    f"Version inexacte — l'article {number} ne figure pas dans "
                    f"la rédaction {claimed} de l'{act.short_code} ; il figure "
                    f"dans la rédaction {_join(sorted(present))}.",
                    articles[-1],
                )
            article = present[claimed]
            return finding(
                Finding.verified,
                f"Vérifié — art. {number} {act.short_code}, rédaction {claimed}."
                + await self._authority_suffix(repository, articles),
                article,
            )

        newest = articles[-1]
        if len(labels) == 1:
            return finding(
                Finding.verified,
                f"Vérifié — art. {number} {act.short_code} "
                f"(rédaction {labels[0]})."
                + await self._authority_suffix(repository, articles),
                newest,
            )
        if len(present) == 1:
            only = next(iter(present))
            missing = [label for label in labels if label not in present]
            return finding(
                Finding.unverified,
                f"Une seule rédaction — l'article {number} figure dans la "
                f"rédaction {only} de l'{act.short_code}, pas dans "
                f"{_join(missing)} ; la rédaction applicable dépend de la date "
                "des faits.",
                newest,
            )
        first = articles[0]
        if all(_same_wording(first.text, other.text) for other in articles[1:]):
            return finding(
                Finding.verified,
                f"Vérifié — art. {number} {act.short_code}, texte identique dans "
                f"les rédactions {_join(sorted(present))}."
                + await self._authority_suffix(repository, articles),
                newest,
            )
        return finding(
            Finding.unverified,
            f"Rédaction non précisée — le texte de l'article {number} diffère "
            f"entre les rédactions {_join(sorted(present))} de "
            f"l'{act.short_code} ; la rédaction applicable dépend de la date "
            "des faits.",
            newest,
        )

    async def _authority_suffix(
        self, repository: CorpusRepository, articles: list[LegalArticle]
    ) -> str:
        """« N décisions vérifiées », counted across every rédaction.

        Case law attaches to the wording the court read, so all of it sits
        on the 1998 row and none on the 2023 one. Counting only the row
        cited would report zero decisions on the most litigated provisions
        in the corpus.
        """
        count = await repository.count_verified_decisions_for_article_set(
            [article.id for article in articles]
        )
        if count == 0:
            return " Aucune décision vérifiée sur cet article dans le fonds chargé."
        plural = "s" if count > 1 else ""
        across = " (toutes rédactions confondues)" if len(articles) > 1 else ""
        return f" {count} décision{plural} vérifiée{plural}{across}."

    # --- decisions --------------------------------------------------------

    async def _decision(
        self, repository: CorpusRepository, citation: Citation, text: str
    ) -> ReviewFinding:
        cite = f"CCJA {citation.number}"

        def finding(
            status: Finding, note: str, decision: CourtDecision | None = None
        ) -> ReviewFinding:
            return ReviewFinding(
                kind="decision",
                cite=cite,
                status=status,
                note=note,
                article_id=None,
                decision_id=decision.id if decision else None,
                context=citation.context,
            )

        # A tight window, not the whole context: « la Cour d'appel a jugé …
        # ; que la CCJA, arrêt n° 250/2031 » must not brand the CCJA
        # reference as a national one because a court of appeal is quoted
        # two lines above.
        beside = text[max(0, citation.start - COURT_REACH) : citation.end + COURT_REACH]
        if "ccja" not in beside.lower() and _NATIONAL_COURT.search(beside):
            return ReviewFinding(
                kind="decision",
                cite=f"Décision {citation.number}",
                status=Finding.unverified,
                note="Juridiction nationale — la référence désigne une "
                "juridiction d'un État partie, hors du fonds CCJA chargé ; "
                "elle n'a pas pu être vérifiée ici.",
                article_id=None,
                decision_id=None,
                context=citation.context,
            )

        decision = await repository.get_decision_by_number(citation.number)
        if decision is None:
            counts = await repository.count_decisions_by_kind()
            arrets = f"{counts.get(DecisionKind.arret, 0):,}".replace(",", " ")
            avis = counts.get(DecisionKind.avis, 0)
            return finding(
                Finding.unverified,
                f"Introuvable — aucune décision n° {citation.number} dans le "
                f"fonds CCJA chargé ({arrets} arrêts, {avis} avis). Vérifiez la "
                "référence.",
            )

        when = french_date(decision.decided_on)
        # Compared by value: the column is a plain string, so a row read
        # back from Postgres is « avis », not the enum member.
        if decision.kind == DecisionKind.avis:
            return finding(
                Finding.unverified,
                f"Avis consultatif du {when} — rendu sur question posée, il ne "
                "tranche aucun litige entre parties et ne s'invoque pas comme "
                "précédent.",
                decision,
            )

        links = await repository.list_verified_links_for_decision(decision.id)
        if not links:
            return finding(
                Finding.verified,
                f"Vérifiée — CCJA n° {citation.number} du {when}. Aucun lien "
                "d'article vérifié n'est enregistré pour cette décision.",
                decision,
            )

        articles = [link.article for link in links]
        provisions = _join(
            [
                f"art. {article.number} {article.act_version.act.short_code}"
                for article in articles[:3]
            ]
        )

        historical, rewritten = await self._historical(repository, decision, articles)
        # Every CCJA decision in the collection predates the 2023 revision,
        # so « rendue sous la rédaction antérieure » is true of all of them
        # and warns about nothing. It becomes a warning only where the
        # provision was replaced rather than reworded; elsewhere it is a
        # fact worth stating beside a verified citation.
        if historical and rewritten:
            return finding(Finding.unverified, historical, decision)

        isolated = await self._isolated(repository, articles)
        if isolated:
            return finding(
                Finding.unverified,
                f"Autorité limitée — CCJA n° {citation.number} du {when} est la "
                f"seule décision vérifiée sur {isolated} dans le fonds chargé.",
                decision,
            )

        note = f"Vérifiée — CCJA n° {citation.number} du {when}, sur {provisions}."
        if historical:
            note += f" {historical}"
        return finding(Finding.verified, note, decision)

    async def _historical(
        self,
        repository: CorpusRepository,
        decision: CourtDecision,
        articles: list[LegalArticle],
    ) -> tuple[str | None, bool]:
        """Was it decided under a wording that has since changed?

        Not a defect in the citation — a fact about it. A 2014 arrêt read
        the 1998 text, and if that provision has since moved the reader has
        to know before treating it as current law. The second element says
        whether the provision was *replaced* (a warning) or merely reworded
        (a note beside a verified citation).
        """
        # (act, rédaction read, rédaction since) → the article numbers.
        rewritten: dict[tuple[str, str, str], list[str]] = {}
        reworded: dict[tuple[str, str, str], list[str]] = {}
        for article in articles:
            act = article.act_version.act
            versions = await repository.list_versions_for_act(act.id)
            newer = [
                version
                for version in versions
                if version.in_force_from and version.in_force_from > decision.decided_on
            ]
            if not newer:
                continue
            siblings = await repository.list_articles_by_number_for_act(
                act.id, article.number
            )
            replacement = next(
                (
                    other
                    for other in siblings
                    if other.act_version_id in {version.id for version in newer}
                ),
                None,
            )
            if replacement is None or _same_wording(article.text, replacement.text):
                continue
            key = (
                act.short_code,
                article.act_version.label,
                replacement.act_version.label,
            )
            bucket = (
                rewritten if _rewritten(article.text, replacement.text) else reworded
            )
            bucket.setdefault(key, []).append(article.number)

        when = french_date(decision.decided_on)
        if rewritten:
            return (
                f"Interprétation historique — rendue le {when} ; "
                + " ; ".join(
                    _moved_phrase(key, numbers, "réécrit")
                    for key, numbers in rewritten.items()
                )
                + ".",
                True,
            )
        if reworded:
            return (
                f"Rendue le {when} ; "
                + " ; ".join(
                    _moved_phrase(key, numbers, "reformulé")
                    for key, numbers in reworded.items()
                )
                + " sans changement de fond apparent.",
                False,
            )
        return None, False

    async def _isolated(
        self, repository: CorpusRepository, articles: list[LegalArticle]
    ) -> str | None:
        """Is this the only decision we hold on every provision it turns on?"""
        for article in articles:
            count = await repository.count_verified_decisions_for_article(article.id)
            if count > 1:
                return None
        if not articles:
            return None
        article = articles[0]
        return f"l'art. {article.number} {article.act_version.act.short_code}"


lecteur_service = LecteurService()
