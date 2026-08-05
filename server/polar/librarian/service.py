"""The librarian: grounded, cited answers over the legal corpus.

Design (proven by scripts/librarian_prototype.py):
- One citations-enabled document block per source row (article or decision),
  in a STABLE order so the prompt prefix is cacheable across questions.
- Strict-grounding French system prompt encoding the dual-regime
  transitional rule and the authority-signal requirement.
- Streaming: emits SSE-ready events (text deltas, citations resolved to
  source metadata, final usage).
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, cast

import structlog

from polar.config import settings
from polar.corpus.repository import CorpusRepository
from polar.corpus.slice import SLICE_ARTICLES_1998, TRANSITIONAL_RULE_1998
from polar.kit.db.postgres import AsyncReadSession

log = structlog.get_logger()

ANSWER_MODEL = "claude-sonnet-4-6"
MAX_ANSWER_TOKENS = 1500

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
- Termine par une ligne « Autorité : … » qualifiant l'assise
  jurisprudentielle (p. ex. « jurisprudence constante — N décisions » ou
  « décision unique » ou « texte seul, pas de jurisprudence fournie »)."""


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
        arts_2023 = await repository.list_articles_matching(
            version_2023.id, "saisie-attribution"
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

        for d in await repository.list_decisions_with_verified_links():
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

    async def answer_stream(
        self,
        session: AsyncReadSession,
        question: str,
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield SSE-ready events: text / citation / done / error."""
        import anthropic

        documents, refs = await self.build_documents(session)
        if not documents:
            yield {"type": "error", "message": "corpus_empty"}
            return
        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

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
                            Any, [*documents, {"type": "text", "text": question}]
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
                            yield {
                                "type": "citation",
                                "title": getattr(c, "document_title", None)
                                or (ref.title if ref else "?"),
                                "quote": (getattr(c, "cited_text", "") or "")[:400],
                                "source_kind": ref.kind if ref else None,
                                "source_id": ref.id if ref else None,
                            }
                final = await stream.get_final_message()
                yield {
                    "type": "done",
                    "input_tokens": final.usage.input_tokens,
                    "output_tokens": final.usage.output_tokens,
                }
        except anthropic.AnthropicError as e:
            log.warning("librarian.answer.error", error=str(e))
            yield {"type": "error", "message": "answer_failed"}


librarian = LibrarianService()
