# Registry — archived 2026-08-09

Paused, not abandoned, and not deleted. Everything below works and is
committed; nothing is half-finished in a way that would need unpicking.

## Why

The decision was to build the Vesence clone first and get a working product
to look at, then work out how to sell it. The registry is the
differentiator, and a differentiator matters at customer five, not customer
one — Vesence's own first customer was won by being known to the firm, not
by anything in the product.

That is a better reason to defer it than the safety concern raised earlier,
which does not hold up: an entry that carries the case, the court and the
quote is the *most* checkable form of AI legal output, not the least.

## What exists, and works

| | |
|---|---|
| **419** Texas express-negligence opinions harvested, with provenance | `polar/registry/harvest.py` |
| **74** with full text, SHA-256 verified, zero mismatches | `polar/registry/fetch.py` |
| **74** screened — 46 on point, 24 not, 2 uncertain (64% yield) | `polar/registry/screen.py` |
| Bulk loader (fallback route, right at scale) | `polar/registry/bulk.py` |
| 58 tests, fixtures from real API responses | `tests/registry/` |
| Two migrations, upgrade and downgrade both clean | `migrations/versions/…registry_harvest…` |

Reasoning, measurements and mistakes: `worklog.md`.
Plan and quality gates: `plan.md`.
Brief for hiring the gold-set reader: `gold-set-brief.md`.

## What was never done

**The gate was never measured.** The question the whole thing turns on —
*when two models agree, how often are they right?* — is unanswered, because
it needs 100 cases marked by a human and no human was hired.

So the 64% yield is an observation, not a validated number. It has not been
checked against anything, and it should not be quoted as if it had.

## To restart

1. `uv run task registry_fetch tx-express-negligence` — drains the
   remaining 345, resumable, stops cleanly at the rate ceiling
2. `uv run task registry_screen tx-express-negligence`
3. Hire the gold-set reader (see `gold-set-brief.md`), then measure
4. Step 3, extraction, is unbuilt

## Cost of the pause

Near zero. The court data does not expire, the code does not rot, and the
API token stays valid. What is lost is calendar time on a moat that
compounds from the day it starts — which is an argument about when to
resume, not about whether the work survives.
