"""The librarian: grounded, cited answers over the legal corpus.

Design (proven by scripts/librarian_prototype.py):
- One citations-enabled document block per source row (article or decision),
  in a STABLE order so the prompt prefix is cacheable across questions.
- Strict-grounding French system prompt encoding the dual-regime
  transitional rule and the authority-signal requirement.
- Streaming: emits SSE-ready events (text deltas, citations resolved to
  source metadata, final usage).
"""

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import date
from typing import Any, cast

import structlog

from polar.config import settings
from polar.corpus.repository import CorpusRepository
from polar.corpus.slice import SLICE_ARTICLES_1998, TRANSITIONAL_RULE_1998
from polar.kit.db.postgres import AsyncReadSession

log = structlog.get_logger()

ANSWER_MODEL = "claude-sonnet-4-6"
CLASSIFIER_MODEL = "claude-haiku-4-5"
MAX_ANSWER_TOKENS = 1500
VERSION_CUTOFF = date(2024, 2, 16)

CLARIFICATION_MESSAGE = (
    "À quelle date la procédure (ou la mesure d'exécution) a-t-elle été "
    "engagée ? L'acte applicable dépend de cette date : l'AUPSRVE révisé "
    "s'applique aux procédures engagées à compter du 16 février 2024, "
    "l'acte de 1998 aux procédures antérieures. Vous pouvez aussi demander "
    "une réponse sous les deux régimes."
)

SYSTEM_PROMPT = f"""Tu es Claidor, l'assistant de recherche juridique sur le droit OHADA.

Règles absolues :
- Tu réponds UNIQUEMENT à partir des documents fournis (articles des Actes
  uniformes et décisions de la CCJA). Si les documents ne permettent pas de
  répondre, dis-le clairement — ne complète jamais avec des connaissances
  générales.
- Deux versions de l'AUPSRVE coexistent : {TRANSITIONAL_RULE_1998}
  Si la réponse dépend de la version applicable, indique d'abord la règle
  pour chaque régime, et précise que la version applicable dépend de la date
  d'engagement de la procédure. Si la question ne précise pas cette date et
  qu'elle est déterminante, demande-la ou traite les deux régimes.
- Cite toujours l'article précis (et sa version : 1998 ou 2023) et les
  décisions CCJA pertinentes. Utilise les citations pour ancrer chaque
  affirmation juridique.
- Réponds en français, de manière concise et structurée, comme à un confrère
  avocat pressé.
- N'écris JAMAIS de ligne « Autorité : … » — ce signal est calculé par le
  système à partir des liens vérifiés du corpus et ajouté après ta réponse."""


@dataclass(frozen=True)
class SourceRef:
    """Metadata for one document block, index-aligned with the request."""

    kind: str  # "article" | "decision"
    id: str
    title: str


class LibrarianService:
    def is_configured(self) -> bool:
        return bool(settings.ANTHROPIC_API_KEY)

    async def build_documents(
        self, session: AsyncReadSession
    ) -> tuple[list[dict[str, Any]], list[SourceRef]]:
        repository = CorpusRepository.from_session(session)
        version_1998 = await repository.get_version_by_label("1998")
        version_2023 = await repository.get_version_by_label("2023")
        if version_1998 is None or version_2023 is None:
            return [], []

        documents: list[dict[str, Any]] = []
        refs: list[SourceRef] = []

        arts_1998 = await repository.list_articles_by_numbers(
            version_1998.id, SLICE_ARTICLES_1998
        )
        # The 2023 side comes from the equivalence map — the mechanical
        # 1998→2023 correspondence — not from keyword matching, which missed
        # most of the renumber-free 2023 chapter.
        arts_2023 = await repository.list_equivalent_new_articles(
            [a.id for a in arts_1998]
        )
        for art, label in [
            *[(a, "1998") for a in arts_1998],
            *[(a, "2023") for a in arts_2023],
        ]:
            title = f"AUPSRVE ({label}) — Article {art.number}"
            documents.append(
                {
                    "type": "document",
                    "source": {
                        "type": "text",
                        "media_type": "text/plain",
                        "data": art.text,
                    },
                    "title": title,
                    "citations": {"enabled": True},
                }
            )
            refs.append(SourceRef(kind="article", id=str(art.id), title=title))

        # Decisions tied to the slice, most-linked first, capped: with the
        # full CCJA collection loaded, "every decision with a verified link"
        # no longer fits in one prompt. A decision citing four slice
        # articles is worth more grounding than one citing a single article
        # in passing. The authority line is unaffected — it is computed
        # from the database, not from what the prompt happens to hold.
        slice_article_ids = [a.id for a in arts_1998] + [a.id for a in arts_2023]
        for d in await repository.list_top_decisions_for_articles(
            slice_article_ids, limit=30
        ):
            title = f"CCJA, arrêt n° {d.number} du {d.decided_on:%d/%m/%Y}"
            documents.append(
                {
                    "type": "document",
                    "source": {
                        "type": "text",
                        "media_type": "text/plain",
                        "data": (d.full_text or "")[:60_000],
                    },
                    "title": title,
                    "citations": {"enabled": True},
                }
            )
            refs.append(SourceRef(kind="decision", id=str(d.id), title=title))

        # Cache the stable corpus prefix: system prompt + documents are
        # identical across questions, so mark the last document block.
        if documents:
            documents[-1]["cache_control"] = {"type": "ephemeral"}
        return documents, refs

    async def classify_question(self, question: str) -> dict[str, Any]:
        """Version-gate classifier — strict JSON, cheap model.

        Returns {"version_dependent": bool, "date_present": bool,
        "anchor_date": "YYYY-MM-DD" | None}. Fails safe: on any parsing or
        API problem, treats the question as NOT version-dependent (the
        answer prompt still explains both regimes when relevant).
        """
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        instruction = (
            "Analyse cette question de droit OHADA (AUPSRVE). Réponds "
            "UNIQUEMENT avec un objet JSON, sans autre texte :\n"
            '{"version_dependent": bool, "date_present": bool, '
            '"anchor_date": "YYYY-MM-DD" ou null}\n'
            "- version_dependent : vrai dès que la question porte sur une "
            "procédure ou mesure d'exécution concrète régie par l'AUPSRVE "
            "(saisie, contestation, délais, mainlevée, paiement du tiers "
            "saisi, etc.) — car le régime applicable dépend de la date "
            "d'engagement (bascule au 16 février 2024). "
            "Faux SEULEMENT si la question désigne explicitement une "
            "version précise (« sous l'acte de 1998 », « selon le texte "
            "révisé ») ou porte sur l'histoire/comparaison des textes "
            "eux-mêmes.\n"
            "- date_present : vrai si la question indique quand la "
            "procédure a été engagée (date, mois/année, ou repère clair "
            "comme 'la semaine dernière').\n"
            "- anchor_date : la date d'engagement au format ISO si "
            "déterminable, sinon null (approximer au premier jour du mois "
            "si seul le mois est donné).\n\n"
            f"Question : {question}"
        )
        try:
            response = await client.messages.create(
                model=CLASSIFIER_MODEL,
                max_tokens=200,
                messages=[{"role": "user", "content": instruction}],
            )
            text = "".join(b.text for b in response.content if b.type == "text").strip()
            start, end = text.find("{"), text.rfind("}")
            payload = json.loads(text[start : end + 1])
            return {
                "version_dependent": bool(payload.get("version_dependent")),
                "date_present": bool(payload.get("date_present")),
                "anchor_date": payload.get("anchor_date"),
            }
        except Exception as e:
            log.warning("librarian.classify.failed", error=str(e))
            return {
                "version_dependent": False,
                "date_present": False,
                "anchor_date": None,
            }

    async def compute_authority(
        self,
        session: AsyncReadSession,
        cited_article_ids: list[str],
    ) -> dict[str, Any]:
        """Authority signal computed from verified links — never by the model.

        Fixed thresholds; copy names its own scope (« dans le corpus
        chargé ») so the label can never claim more than the data holds.
        """
        repository = CorpusRepository.from_session(session)
        decisions = (
            await repository.list_verified_decisions_for_articles(cited_article_ids)
            if cited_article_ids
            else []
        )
        count = len(decisions)
        years = {d.decided_on.year for d in decisions}
        if count == 0:
            label = "texte seul — aucune décision dans le corpus chargé"
        elif count == 1:
            label = "autorité limitée — décision unique dans le corpus chargé"
        elif count >= 4 and len(years) >= 3:
            label = (
                f"ligne jurisprudentielle constante — {count} décisions "
                "dans le corpus chargé"
            )
        else:
            label = f"plusieurs décisions ({count}) dans le corpus chargé"
        return {
            "type": "authority",
            "label": label,
            "count": count,
            "decisions": [
                {
                    "id": str(d.id),
                    "number": d.number,
                    "decided_on": d.decided_on.isoformat(),
                }
                for d in decisions
            ],
        }

    async def answer_stream(
        self,
        session: AsyncReadSession,
        question: str,
        *,
        answer_both_versions: bool = False,
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield SSE events: clarification / text / citation / authority / done / error."""
        import anthropic

        documents, refs = await self.build_documents(session)
        if not documents:
            yield {"type": "error", "message": "corpus_empty"}
            return

        # Version gate — enforced in code, not in the prompt.
        classification = await self.classify_question(question)
        versions_used: list[str]
        steering = ""
        if classification["version_dependent"] and not answer_both_versions:
            anchor_raw = classification.get("anchor_date")
            anchor: date | None = None
            if classification["date_present"] and anchor_raw:
                try:
                    anchor = date.fromisoformat(str(anchor_raw))
                except ValueError:
                    anchor = None
            if anchor is None:
                yield {
                    "type": "clarification",
                    "message": CLARIFICATION_MESSAGE,
                    "cutoff": VERSION_CUTOFF.isoformat(),
                }
                return
            applicable = "2023" if anchor >= VERSION_CUTOFF else "1998"
            other = "1998" if applicable == "2023" else "2023"
            versions_used = [applicable]
            steering = (
                f"\n\n[Instruction système, déterminée par le droit "
                f"transitoire : la procédure a été engagée le "
                f"{anchor.isoformat()}, donc l'AUPSRVE {applicable} "
                f"s'applique. Réponds sous ce régime ; ne mentionne l'acte "
                f"de {other} qu'à titre de contexte.]"
            )
        elif classification["version_dependent"] and answer_both_versions:
            versions_used = ["1998", "2023"]
            steering = (
                "\n\n[Instruction système : la date d'engagement n'est pas "
                "fournie ; présente la réponse sous les DEUX régimes, "
                "clairement étiquetés « AUPSRVE 1998 » et « AUPSRVE 2023 », "
                "côte à côte.]"
            )
        else:
            versions_used = []

        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

        cited_article_ids: list[str] = []
        try:
            async with client.messages.stream(
                model=ANSWER_MODEL,
                max_tokens=MAX_ANSWER_TOKENS,
                system=[
                    {
                        "type": "text",
                        "text": SYSTEM_PROMPT,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                messages=[
                    {
                        "role": "user",
                        "content": cast(
                            Any,
                            [*documents, {"type": "text", "text": question + steering}],
                        ),
                    }
                ],
            ) as stream:
                async for event in stream:
                    if event.type == "content_block_delta":
                        delta = event.delta
                        if delta.type == "text_delta":
                            yield {"type": "text", "delta": delta.text}
                        elif delta.type == "citations_delta":
                            c = delta.citation
                            index = getattr(c, "document_index", None)
                            ref = (
                                refs[index]
                                if index is not None and 0 <= index < len(refs)
                                else None
                            )
                            if ref is not None and ref.kind == "article":
                                cited_article_ids.append(ref.id)
                            yield {
                                "type": "citation",
                                "title": getattr(c, "document_title", None)
                                or (ref.title if ref else "?"),
                                "quote": (getattr(c, "cited_text", "") or "")[:400],
                                "source_kind": ref.kind if ref else None,
                                "source_id": ref.id if ref else None,
                            }
                final = await stream.get_final_message()
                yield await self.compute_authority(
                    session, list(dict.fromkeys(cited_article_ids))
                )
                yield {
                    "type": "done",
                    "versions_used": versions_used,
                    "input_tokens": final.usage.input_tokens,
                    "output_tokens": final.usage.output_tokens,
                }
        except anthropic.AnthropicError as e:
            log.warning("librarian.answer.error", error=str(e))
            yield {"type": "error", "message": "answer_failed"}


librarian = LibrarianService()
