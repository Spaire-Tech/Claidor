# Overnight log — 7→8 August 2026

Every item verified before push: typecheck, production build, and the
headless parity sweep (all nine views + deep interactions diffed against
the designed original — identical every time, zero page errors).

1. **Plan of record** committed: docs/claidor-plan.md.
2. **Native port (C2) — done.** The design's template converted to real
   JSX by dev/design_port/convert.py; its logic runs as maintained code
   (components/ClaidorDesign/logic.tsx); its stylesheet travels scoped;
   the dashboard root renders the native port. The framed original stays
   in public/design/ as the fidelity reference.
3. **Assistant wired (C3-1).** Live librarian streaming — verified
   citations with quotes, computed authority on the constante/limitée
   signal, version-gate clarification — the scripted demo remains the
   empty-library fallback.
4. **Recherche wired (C3-2).** Real corpus search behind the same pixels:
   exact citation landings, French full-text, year → decided_from,
   chamber chips from the real corpus, matière chips mapped to governing
   acts. Results open live side panels (article alinéas + linked
   decisions; decision extracts + cited articles), cached per id. The
   assistant's live citations open the same panels.
5. **Dossiers wired (C3-4).** Real matters list, detail with pièces
   (category, readable state, date, size), team initials, journalized
   record. Per-matter ask hits the real endpoint; answers carry the
   fact/law split and open live panels; record entries replay their
   answered exchange.

6. **Analyses wired (C3-6, three of four).** Autorité, Historique and
   Citations run on any live article from its detail — authority level
   computed with the librarian's own thresholds, rows opening live
   decision panels, analyses chaining as designed. Comparer stays
   scripted until the diff engine exists.

## Where the next session picks up

- **Historique**: needs small backend persistence for general (non-dossier)
  questions; dossier questions already journalize.
- **Comparer**: the word-level diff engine (task #15).
- **Panel extras**: résumés + décisions similaires (task #14).
- **Veilles**, **Lecteur**: new backends (plan C3-8/9).
- **Corpus load into production** — still the single blocking step for
  live answers; waiting on the Render external connection string.

The scripted demo remains exactly as designed everywhere until each
screen's real data arrives — and the moment the corpus loads, Assistant,
Recherche and Dossiers switch to the real thing without a deploy.
