# Claidor v2 — plan

v1 proved the hard part: a corpus nobody else holds (11 uniform acts + the
Treaty in 17 temporal versions, 1,268 CCJA decisions, 4,187 machine-verified
citation links) and an assistant that cites exactly where it read something,
refuses traps, and knows which version of the law governs a given file.

v2 turns that into the product a practitioner opens every morning. Nine
capabilities, most of them cheap **because the expensive parts are done** —
the corpus, the citation graph, the version model and the dossier layer are
built and tested.

## What is already in place (and what each new feature rides on)

| Foundation | Built in v1 | Feeds |
|---|---|---|
| Corpus: 5,094 articles, 17 versions, act registry with entry-into-force dates | ✅ | Search, Version compare, History |
| Citation graph: 4,187 verified decision↔article links | ✅ | Authority, Similar, Citation map, Document reader |
| Version model + old↔new equivalence map (slice) | ✅ | History, Version compare, Document reader |
| Computed authority signal (fixed thresholds, from verified links) | ✅ | Vérifier l'autorité |
| Librarian: grounded answers, version gate, fabrication guards | ✅ | Chatbot, Document reader |
| Dossiers: upload → extract → answer, facts labelled apart from law | ✅ | Document reader |
| Graded eval (35 fixtures, 3 scores, hard-fail on fabrication) | ✅ | Everything — the regression net |

## The nine

### 1. Search — *foundation, build first*
Look something up on purpose. Citation-shaped queries land on the document
("article 170 AUPSRVE" → the article; "CCJA 090/2018" → the decision);
everything else is full-text with filters (act, version, date range, chamber).

- **Effort**: 1–2 days. No model calls, no accuracy risk.
- **How**: Postgres full-text (French config) + trigram for near-miss
  citations; a query parser that recognises how lawyers actually type.
- **Why first**: it is also the retriever the chatbot needs to widen beyond
  one chapter. Everything downstream gets better once this exists.

### 2. Chatbot across the whole library
Works today, but draws sources from the saisie-attribution slice. Widening it
means retrieval (from #1) rather than a hand-picked article list.

- **Effort**: 3–4 days. **Depends on**: #1.
- **Guards to keep**: the version gate stays code-side; the eval must be
  extended with fixtures for the other acts before this ships.

### 3. Alerts (the watchdog)
Watch an article, an act or a topic; get an email when something new touches
it.

- **Effort**: 3–4 days. **Depends on**: a refresh pipeline (re-crawl → diff →
  notify). The crawler exists and the loader is idempotent, so the diff is the
  new part.
- **Honest limit, to be stated in the product**: we can only alert on what the
  public sources publish, and Juricaf indexes CCJA decisions weeks to months
  after they are handed down. The promise is "the morning it appears", never
  "the morning it is ruled".

### 4. Document reader — *the differentiator, build last*
Drop in opposing counsel's submission (or your own draft). Claidor extracts
every article and decision cited, resolves each against the corpus, and flags
what does not hold:
- **wrong version**: they argue on the 1998 text, the procedure began in June
  2024 (nearly free — we hold both versions with their dates and the map);
- **displaced provision**: they cite article 49 where the CCJA has held since
  2005 that 172 governs (needs treatment labels);
- **unverifiable citation**: the article or decision does not say what the
  brief says it says.

- **Effort**: ~1 week. **Depends on**: #1 (resolution), treatment labels
  (review pass), version model.
- **Highest-stakes output in the product.** Every flag must carry the decision
  or article that supports it; a flag we cannot source is not shown. Same
  discipline as the fact guard in Dossiers.

### 5. Summaries
Three lines per decision: what was argued, what was held, which articles.

- **Effort**: 1 day (a batch pass over 1,268 decisions, stored per decision).
- **Guard**: the summary records which articles it claims the court applied,
  and those are checked against the verified citation graph — a summary cannot
  quietly invent a holding.

### 6. Similar decisions
Open a decision, see the ones built on the same provisions.

- **Effort**: 1–2 days. Mostly a query over the existing graph (shared
  verified links, ranked by overlap), no model call — which makes it more
  defensible than text similarity: it rests on what the courts actually cited.

### 7. Version comparison
Two versions of an article side by side, word for word.

- **Effort**: 1–2 days. Both texts and the concordance already exist; the
  screen is a word-level diff plus the line we already compute — which version
  governs your file.
- **Extension**: the equivalence map currently covers the slice; widening it
  across the AUPSRVE is a script run, and to other acts as prior versions land.

### 8. Analyses — named questions, run from where you are
The recurring questions, answered in the shape each deserves. **Mostly
packaging of machinery that already exists**, which is why it is cheap and why
it should ship early — it is the clearest expression of what Claidor is.

| Analysis | What it shows | Rests on |
|---|---|---|
| **Vérifier l'autorité** | Is this settled or a one-off — with the decisions listed, oldest to newest | `compute_authority`, already computed from verified links with fixed thresholds |
| **Retracer l'historique** | The versions of a text and which governs on the date of the facts | act registry + `in_force_from` + transitional rule |
| **Comparer les versions** | The two texts word for word, with what moved | #7 + equivalence map |
| **Cartographier les citations** | An article's life in the courts: who cites it, which provisions travel with it | citation graph + co-citation query |

- **Effort**: 3–4 days for all four, given #6 and #7 exist.
- **Two design rules that make it feel like one tool, not four**:
  1. **They run from where you are.** On a decision, *Vérifier l'autorité*
     runs on that decision; on an article, *Retracer l'historique* runs on that
     article. No pickers, no re-entry.
  2. **Every result offers the next move.** Each analysis ends with the
     analyses that follow from it, so one question leads to the next and the
     reasoning stays in one place.
- **Why it matters commercially**: the thorough version of a recurring
  analysis becomes the quick one. A junior arriving on a matter runs the same
  rigour, in the same shape, as the partner who taught it.

### 9. Product completion (carried from v1)
Upload UI for dossier pieces, member invites, Claidor's own onboarding
replacing inherited screens, question history, deployment on free tiers.

- **Effort**: ~1 week, spread.

## Sequence

```
Week 1   Search ──────────────┬─→ Summaries + Similar decisions
                              └─→ Version comparison
Week 2   Analyses (all four)  ──→ Alerts (needs refresh pipeline)
Week 3   Chatbot widening     ──→ Document reader
         Product completion (threaded throughout)
```

Rationale: search unlocks retrieval; summaries/similar/version-compare are
cheap and make the library feel alive; Analyses packages them into the thing
a lawyer recognises; alerts bring people back weekly; the document reader
lands last because it draws on all of the above.

## Non-negotiables carried from v1

Every feature inherits the same discipline, or it does not ship:

1. **Nothing is claimed that cannot be sourced.** Quotes are verified against
   the document they are credited to; a claim without a checkable source is
   dropped, not softened.
2. **Trust lives in code, not in prompts.** Authority thresholds, version
   targeting, fact/law separation and citation verification are all
   deterministic, auditable, and testable.
3. **Gaps are visible.** An unreadable scan, a missing prior version, a
   decision older than any loaded text — each says so rather than silently
   contributing nothing.
4. **The eval gates releases.** Any fabricated citation is a hard failure of
   the run, and new capabilities arrive with fixtures before they arrive in
   the product.
