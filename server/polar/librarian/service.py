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
import re
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from datetime import date
from typing import TYPE_CHECKING, Any, cast

import structlog

from polar.config import settings
from polar.corpus.repository import CorpusRepository
from polar.corpus.slice import SLICE_ARTICLES_1998, TRANSITIONAL_RULE_1998
from polar.kit.db.postgres import AsyncReadSession
from polar.librarian.deadline import month_franc_deadline, steering_block

if TYPE_CHECKING:
    from polar.models import DossierDocument

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
- Réponds en français, comme à un confrère avocat pressé.

Forme de la réponse — impérative :
- PREMIÈRE LIGNE : la réponse directe à la question, en une phrase. Pas de
  titre avant, pas de préambule. Celui qui ne lit qu'une ligne doit repartir
  avec la réponse.
- Ensuite, la justification en quelques paragraphes courts : version
  applicable, texte, jurisprudence, points de vigilance. Prose et tirets.
- PAS de titres (##), PAS de lignes horizontales (---), PAS de tableaux.
  Des titres uniquement si la question a réellement plusieurs branches
  distinctes — jamais pour une question à réponse unique.
- Gras (**…**) avec parcimonie : la conclusion et les dates limites.

Rigueur :
- Chaque affirmation est soit ancrée par une citation, soit signalée comme
  non sourcée. N'insère JAMAIS une assertion de pratique (« en pratique,
  … ») sans source au milieu d'un raisonnement sourcé.
- « En l'espèce » désigne l'affaire de la décision citée, jamais la
  situation de l'utilisateur. Pour la situation de l'utilisateur, écris
  « dans votre cas » ou « appliqué à votre date ».
- Calculs de délais : si un bloc [CALCUL DE DÉLAI VÉRIFIÉ PAR CODE] figure
  dans la question, sa date et sa dérivation FONT FOI — reprends-les telles
  quelles, ne recalcule jamais. Sans ce bloc, cite la règle, suis
  EXACTEMENT la méthode de la décision citée, et en cas de doute donne la
  date la plus prudente en le disant.
- N'écris JAMAIS de ligne « Autorité : … » — ce signal est calculé par le
  système à partir des liens vérifiés du corpus et ajouté après ta réponse."""


@dataclass(frozen=True)
class SourceRef:
    """Metadata for one document block, index-aligned with the request."""

    kind: str  # "article" | "decision" | "document"
    id: str
    title: str
    # Full text of the block, kept for "document" sources so a quote
    # attributed to a case file can be verified against it before it is
    # ever shown as a fact.
    text: str | None = None


def normalize_quote(text: str) -> str:
    """Match-tolerant form: unify apostrophes/quotes, drop all whitespace.

    Uploaded files carry curly apostrophes and PDF spacing artifacts; the
    model reproduces clean typography. Removing whitespace and unifying
    punctuation lets a genuine quote match through both, while a quote that
    is not in the document still fails.
    """
    text = text.lower()
    for ch in "’‘`´":
        text = text.replace(ch, "'")
    for ch in "«»“”":
        text = text.replace(ch, '"')
    return re.sub(r"\s+", "", text)


DOSSIER_PROMPT_SUFFIX = """

Ce dossier contient des pièces du client (contrats, PV, relevés,
conclusions). Elles te sont fournies comme documents, préfixés « PIÈCE ».

Règles supplémentaires, absolues :
- Les PIÈCES établissent les FAITS de l'affaire ; les articles et arrêts
  établissent le DROIT. Ne confonds jamais les deux : cite une pièce pour
  un fait, un article ou un arrêt pour une règle.
- N'invente aucun fait. Si une date, une somme, une juridiction ou une
  qualité te manque pour répondre, dis lequel manque et indique ce qu'il
  faudrait produire — ne suppose pas.
- Quand un fait du dossier détermine la règle applicable (notamment la
  date d'engagement de la procédure), énonce ce fait et la pièce dont il
  vient AVANT d'appliquer la règle."""


class LibrarianService:
    def is_configured(self) -> bool:
        return bool(settings.ANTHROPIC_API_KEY)

    async def build_documents(
        self,
        session: AsyncReadSession,
        *,
        case_documents: Sequence["DossierDocument"] = (),
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

        # Cache the stable corpus prefix: system prompt + corpus documents
        # are identical across questions AND across matters, so the cache
        # breakpoint goes at the end of the corpus — case documents, which
        # differ per dossier, come after it and never break the shared
        # prefix.
        if documents:
            documents[-1]["cache_control"] = {"type": "ephemeral"}

        for doc in case_documents:
            text = doc.extracted_text or ""
            if not text.strip():
                continue
            piece = (
                f"PIÈCE n° {doc.piece_number} — {doc.title}"
                if doc.piece_number is not None
                else f"PIÈCE — {doc.title}"
            )
            documents.append(
                {
                    "type": "document",
                    "source": {
                        "type": "text",
                        "media_type": "text/plain",
                        "data": text[:200_000],
                    },
                    "title": piece,
                    "citations": {"enabled": True},
                }
            )
            refs.append(
                SourceRef(kind="document", id=str(doc.id), title=piece, text=text)
            )
        return documents, refs

    async def find_anchor_in_file(
        self, case_documents: Sequence["DossierDocument"]
    ) -> dict[str, Any] | None:
        """Read the date of commencement off the case file, or return None.

        This is what a dossier is for: the rule turns on when the procedure
        was commenced, and that date is in the pièces — so it is read, not
        asked for. Two guards keep it honest:
        - the model must return the literal sentence it read the date from,
          and that sentence must appear in that document, or the finding is
          discarded;
        - anything short of an explicit date is discarded too, which sends
          the question back to the clarification gate.
        """
        import anthropic

        readable = [d for d in case_documents if (d.extracted_text or "").strip()]
        if not readable:
            return None

        catalogue = "\n\n".join(
            f"[{index}] PIÈCE n° {doc.piece_number} — {doc.title}\n"
            f"{(doc.extracted_text or '')[:20_000]}"
            for index, doc in enumerate(readable)
        )
        instruction = (
            "Voici les pièces d'un dossier. Détermine à quelle date la "
            "procédure ou la mesure d'exécution litigieuse a été ENGAGÉE "
            "(par exemple la date de l'acte de saisie, non la date de "
            "dénonciation ni celle du jugement servant de titre).\n\n"
            "Réponds UNIQUEMENT en JSON :\n"
            '{"found": bool, "date": "YYYY-MM-DD" ou null, '
            '"document_index": entier ou null, '
            '"quote": "la phrase EXACTE de la pièce qui porte cette date"}\n'
            "Si aucune pièce n'établit explicitement cette date, réponds "
            '{"found": false, "date": null, "document_index": null, '
            '"quote": ""}.\n\n' + catalogue
        )
        try:
            client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            response = await client.messages.create(
                model=CLASSIFIER_MODEL,
                max_tokens=400,
                messages=[{"role": "user", "content": instruction}],
            )
            text = "".join(b.text for b in response.content if b.type == "text").strip()
            payload = json.loads(text[text.find("{") : text.rfind("}") + 1])
        except Exception as e:
            log.warning("librarian.anchor.failed", error=str(e)[:160])
            return None

        if not payload.get("found"):
            return None
        try:
            anchor = date.fromisoformat(str(payload.get("date")))
        except (TypeError, ValueError):
            return None
        index = payload.get("document_index")
        quote = str(payload.get("quote") or "").strip()
        if not isinstance(index, int) or not (0 <= index < len(readable)) or not quote:
            return None
        document = readable[index]
        if normalize_quote(quote) not in normalize_quote(document.extracted_text or ""):
            log.warning("librarian.anchor.unverifiable", document=str(document.id))
            return None
        piece = (
            f"PIÈCE n° {document.piece_number} — {document.title}"
            if document.piece_number is not None
            else f"PIÈCE — {document.title}"
        )
        return {
            "date": anchor,
            "quote": quote[:400],
            "document_id": str(document.id),
            "title": piece,
        }

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
        case_documents: Sequence["DossierDocument"] = (),
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield SSE events: clarification / text / citation / authority / done / error.

        With ``case_documents``, the answer is grounded in the matter's file
        as well as the corpus, and every citation carries its ``nature``:
        ``fact`` (from a pièce) or ``law`` (from an article or a decision).
        """
        import anthropic

        documents, refs = await self.build_documents(
            session, case_documents=case_documents
        )
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
            # The question did not carry the date — but the file may. A
            # dossier holds the facts the law needs, so read before asking.
            anchor_fact: dict[str, Any] | None = None
            if anchor is None and case_documents:
                anchor_fact = await self.find_anchor_in_file(case_documents)
                if anchor_fact is not None:
                    anchor = anchor_fact["date"]
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
            # Deadlines are counted by code, never by the model: two
            # production answers computed the art. 170 délai one day short
            # while quoting the precedent that shows the correct count.
            deadline_steering = ""
            if re.search(
                r"délai|delai|contest|forclusion|opposition|prescri|expir",
                question,
                re.IGNORECASE,
            ):
                computed = month_franc_deadline(anchor)
                deadline_steering = steering_block(computed)
            if anchor_fact is not None:
                # The date came from the file: surface it as a fact, with the
                # pièce it was read from, before any rule is applied.
                yield {
                    "type": "citation",
                    "nature": "fact",
                    "title": anchor_fact["title"],
                    "quote": anchor_fact["quote"],
                    "source_kind": "document",
                    "source_id": anchor_fact["document_id"],
                }
                steering = (
                    f"\n\n[Instruction système : il ressort du dossier "
                    f"({anchor_fact['title']}) que la procédure a été "
                    f"engagée le {anchor.isoformat()}. Énonce ce fait et la "
                    f"pièce dont il vient, puis applique l'AUPSRVE "
                    f"{applicable} ; ne mentionne l'acte de {other} qu'à "
                    f"titre de contexte.]"
                ) + deadline_steering
            else:
                steering = (
                    f"\n\n[Instruction système, déterminée par le droit "
                    f"transitoire : la procédure a été engagée le "
                    f"{anchor.isoformat()}, donc l'AUPSRVE {applicable} "
                    f"s'applique. Réponds sous ce régime ; ne mentionne l'acte "
                    f"de {other} qu'à titre de contexte.]"
                ) + deadline_steering
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
                        "text": SYSTEM_PROMPT
                        + (DOSSIER_PROMPT_SUFFIX if case_documents else ""),
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
                            quote = (getattr(c, "cited_text", "") or "")[:400]
                            # Fabrication guard for facts: a quote credited
                            # to a pièce must appear literally in that
                            # document. If it does not, the citation is
                            # dropped rather than shown — a fact nobody can
                            # check is worse than no fact.
                            if (
                                ref is not None
                                and ref.kind == "document"
                                and normalize_quote(quote)
                                not in normalize_quote(ref.text or "")
                            ):
                                log.warning(
                                    "librarian.fact.unverifiable",
                                    document=ref.title,
                                )
                                continue
                            yield {
                                "type": "citation",
                                "nature": (
                                    "fact"
                                    if ref is not None and ref.kind == "document"
                                    else "law"
                                ),
                                "title": getattr(c, "document_title", None)
                                or (ref.title if ref else "?"),
                                "quote": quote,
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
