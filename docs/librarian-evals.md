# Librarian — behavior evidence log

Manual eval runs of `scripts/librarian_prototype.py` against the loaded
saisie-attribution slice (24 source documents: 18+6 articles of both AUPSRVE
versions, 8 CCJA decisions with verified graph edges). Model:
claude-sonnet-4-6, strict-grounding French system prompt.

## 2026-08-05 — three core behaviors

1. **Grounded answer with citations** — "Dans quel délai le débiteur
   peut-il contester une saisie-attribution, et devant quel juge ?"
   → One-month deadline (art. 170/1998 cited), délais francs (art. 335),
   venue (art. 169) + enforcement judge (art. 49), art. 172 primacy over
   art. 49 for appeal deadlines flagged as jurisprudence constante, with
   the 2005 foundational pair named via 001/2013. 12 citations, each
   mapped to a source row. Closed with "Autorité : jurisprudence
   constante — 4 décisions CCJA". PASS.

2. **Dual-version temporal reasoning** — seizure practiced January 2024:
   which act applies? → Correctly held the 1998 act governs (procedure
   engaged before 2024-02-16), then gave the 1998 regime's deadline with
   the CCJA's délais-francs computation example (025/2010) and the
   erroneous-date-voids-denunciation rule. PASS.

3. **Refusal outside the corpus** — commercial lease renewal (AUDCG
   matter) → declined to answer, explained the corpus covers only
   AUPSRVE/saisie-attribution, named the right instrument (AUDCG,
   art. 101 et s.), zero citations, zero fabrication. PASS.

Cost: ~45k input tokens/question pre-caching (~cents); output ~250–1300
tokens. Prompt caching on the corpus block is the first optimization for
the real service.
