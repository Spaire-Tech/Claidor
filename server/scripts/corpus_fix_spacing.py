"""Repair PDF-extraction word breaks in stored article text (idempotent).

Usage: ``uv run python -m scripts.corpus_fix_spacing``

PDF extraction leaves spaces inside words — « po rtées », « contest ation »,
« lit ige » — and those artifacts are in the corpus itself, quoted verbatim
into answers. A lawyer reading a statute with broken words concludes the
whole product is sloppy, so this pass repairs them.

Method — corpus-derived dictionary, no external wordlist:
- The vocabulary is built from the CLEAN articles (AKN/HTML sources, no
  PDF anywhere in their lineage) — real legal French, same register.
- A candidate pair of adjacent tokens is joined when the concatenation is
  in the vocabulary AND at least one of the two parts is not — so
  « po rtées » → « portées » (po ∉ vocab) and « lit ige » → « litige »
  (ige ∉ vocab), while « délai franc » (both ∈ vocab) is never touched.
- Repeated to fixpoint per text, then written back. The tsvector column is
  generated, so search reindexes itself.

Only articles whose provenance says ``pdf-extraction`` are touched; the
clean sources are the reference and stay byte-identical.
"""

import asyncio
import re

import structlog
from sqlalchemy import select

from polar.kit.db.postgres import create_async_sessionmaker
from polar.models import LegalArticle
from polar.postgres import create_async_engine

log = structlog.get_logger()

WORD = re.compile(r"[a-zà-ÿœæ'’-]+", re.IGNORECASE)

#: Words and everything between them, preserved verbatim.
TOKEN = re.compile(r"[a-zà-ÿœæ]+|[^a-zà-ÿœæ]+", re.IGNORECASE)

#: The only single letters that stand alone in French. Everything else on
#: its own — « peu t », « pou r », « a u » — is a broken word, on whichever
#: side of the space it fell.
STANDALONE_LETTERS = frozenset({"a", "y", "à"})


def is_orphan_letter(token: str) -> bool:
    return len(token) == 1 and token.lower() not in STANDALONE_LETTERS


def is_pdf_extracted(provenance: object) -> bool:
    if not isinstance(provenance, dict):
        return False
    if provenance.get("kind") == "pdf-extraction":
        return True
    return "pdf" in str(provenance.get("extraction", "")).lower()


def build_vocab(texts: list[str]) -> set[str]:
    vocab: set[str] = set()
    for text in texts:
        for token in WORD.findall(text.lower()):
            # A stray « t » in a clean source is that source's own artifact,
            # and admitting it as a word is what let « peu t » survive: both
            # halves looked known, so the pair looked like two words.
            if is_orphan_letter(token):
                continue
            vocab.add(token)
    return vocab


def repair(text: str, vocab: set[str]) -> tuple[str, list[str]]:
    """Join broken word pairs; returns (fixed_text, examples).

    A token walk, not a regex substitution: regex pairs consume the stream
    left to right without overlap, so « sont po rtées » tries (sont, po),
    eats « po », and never considers the real pair (po, rtées).
    """
    examples: list[str] = []
    tokens = TOKEN.findall(text)
    i = 0
    while i + 2 < len(tokens):
        left, sep, right = tokens[i], tokens[i + 1], tokens[i + 2]
        if left[0].isalpha() and sep in (" ", "\u00a0") and right[0].isalpha():
            joined = (left + right).lower()
            # \u00ab de s'inscrire \u00bb: the apostrophe means \u00ab s \u00bb is an elision,
            # a whole word already, so the pair is not a broken one \u2014 even
            # though \u00ab des \u00bb is in the vocabulary.
            elided = i + 3 < len(tokens) and tokens[i + 3][:1] in ("'", "\u2019")
            if elided:
                i += 1
                continue
            # « l a saisie » is out of reach of the rule below: both « l »
            # and « a » occur in the corpus, so neither side is unknown. But
            # an isolated single letter is never a French word — except
            # « a » (verb), « y » and « à » — so a lone letter glued onto a
            # word that does exist is a break, not two words. The break
            # falls on either side: « l a saisie » and « peu t » alike.
            orphan_letter = is_orphan_letter(left) or is_orphan_letter(right)
            if joined in vocab and (
                orphan_letter or left.lower() not in vocab or right.lower() not in vocab
            ):
                examples.append(f"{left} {right} -> {left + right}")
                tokens[i : i + 3] = [left + right]
                # Stay put: « con tes tation » may need a second join here.
                continue
        i += 1
    return "".join(tokens), examples


async def main() -> None:
    engine = create_async_engine("script")
    sessionmaker = create_async_sessionmaker(engine)
    async with sessionmaker() as session:
        articles = (await session.execute(select(LegalArticle))).scalars().all()
        clean_texts = [a.text for a in articles if not is_pdf_extracted(a.provenance)]
        vocab = build_vocab(clean_texts)
        log.info(
            "corpus.fix_spacing.vocab",
            clean_articles=len(clean_texts),
            words=len(vocab),
        )

        fixed = 0
        joins = 0
        samples: list[str] = []
        for article in articles:
            if not is_pdf_extracted(article.provenance):
                continue
            new_text, examples = repair(article.text, vocab)
            if new_text != article.text:
                article.text = new_text
                session.add(article)
                fixed += 1
                joins += len(examples)
                if len(samples) < 12:
                    samples.extend(examples[:2])
            if fixed and fixed % 100 == 0:
                await session.flush()

        await session.commit()
        log.info(
            "corpus.fix_spacing.done",
            articles_fixed=fixed,
            words_rejoined=joins,
        )
        for sample in samples:
            log.info("corpus.fix_spacing.example", join=sample)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
