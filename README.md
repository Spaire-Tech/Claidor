# Claidor

**Ask a question about OHADA law. Get the answer, the article, and the case.**

Seventeen African countries share one body of business law. Claidor is its
definitive record — every uniform act down to the article, every amendment
resolved, every CCJA decision linked to the provisions it interprets — and the
fastest way to get an answer from it: ask in French, get a sourced answer with
the precise article and the case law behind it, one click from the source text.

- **The record**: OHADA uniform acts, versioned (the 2023 AUPSRVE and the 1998
  act it replaced are both in active legal life — Claidor knows which applies).
- **The librarian**: answers grounded strictly in the corpus, with citations
  that open the source text beside the answer, and an authority signal —
  *jurisprudence constante* or *décision unique* — on every answer.
- **The graph**: from any article, the decisions that applied it, the articles
  cited alongside it, and what changed in each revision.

Project documents: [`docs/claidor-stack-audit.md`](docs/claidor-stack-audit.md)
(why this codebase), [`docs/claidor-v1-plan.md`](docs/claidor-v1-plan.md)
(the phase plan).

## Status

Phase 0 (chassis). This codebase is a pruned and rebranded fork of the Spaire
platform (itself built on [Polar](https://github.com/polarsource/polar),
Apache 2.0): the SaaS chassis — auth, organizations, seats, billing, email,
files, background jobs, admin backoffice — is operational; the legal corpus
modules arrive in Phase 1.

## Development

```bash
# Backend (http://127.0.0.1:8000)
cd server
docker compose up -d          # PostgreSQL, Redis, Minio
uv sync && uv run task api    # install deps & start API

# Frontend (http://127.0.0.1:3000)
cd clients
pnpm install && pnpm dev

# Tests
cd server && uv run task test # backend
cd clients && pnpm test       # frontend
```

Environment variables use the `CLAIDOR_` prefix; the environment selector is
`CLAIDOR_ENV`. Note: the backend's internal Python package retains the name
`polar` (imports read `from polar. ...`) — a deliberate carry-over from the
upstream codebase; renaming it is mechanical churn with no user-visible value
and is deferred indefinitely.

## License

Apache 2.0 — see [LICENSE](LICENSE). Derived from Polar (Polar Software Inc.)
via the Spaire platform.
