# Vaquill — research

Supplied 2026-08-09, with independent verification of the documentation
set (30+ pages plus the API reference) on the same day.

A legal **data** company. 4.8M+ sections of US primary law across 52
jurisdictions, sold through a credit-priced REST API and an MCP server,
with the scrapers open-sourced and the corpus itself as the moat.

Filed here because it is a business-model reference, not a build input.
Two things in it change what we do; the rest is context for decisions that
come after the clone.

## What it changes

**1. The playbook model — adopted.** Three layers per clause rule, and the
rule that makes it usable:

| Layer | Fields |
|---|---|
| Language | preferred position, acceptable range, link to a vetted clause |
| Guardrails | fallback ladder, walk-away floor, escalation triggers, numeric limits |
| Governance | priority, rationale, approval level, risk weight |

> *"Only the preferred position is required. A playbook with nothing but
> preferred wording still works."*

That last line is the design. Everything else is optional depth, so the
feature is usable on day one instead of abandoned at a setup screen. Our
Playbooks build follows this shape.

**2. Two verification checks we do not have.** Their answer verification
runs four ways: exact match for quotes, citation resolution, semantic
support, and a reasoning check. Ours does the first and recomputes
arithmetic. Citation resolution and the reasoning check are additions
worth making to `polar/redline/judgement.py`.

## Parked, with a decision point

If we ever need US statutes or regulations — Phase 3 at the earliest,
since every check we have today is internal to the document — this is a
supplier rather than a build. The corpus is also published free as Parquet
on Hugging Face (scripts Apache 2.0, data CC BY 4.0), so self-hosting is a
third option.

Nothing in the current roadmap needs it.

## Coverage gap, recorded as fact

Statutes, regulations, constitutions, executive orders, agency guidance,
court rules. **No case law, no judicial opinions, no clause treatment** —
their own FAQ answers "do you cover case law?", which means it is asked.
