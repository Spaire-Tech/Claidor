# Caisra Agents — Anatomies ☁️

**Confidential for Bass.** Index of reconstructed `agent.md` anatomies for every specialist in the public **Caisra Agents** catalog (`gbt-bots.json` → 23 slugs).

**Mark:** ☁️ · **Product:** Caisra · **Chief of Staff:** Yodo

## Provenance

- **Source of truth per agent:** public agent listing text (prior reconstruction under prior anatomies + raw extracts), plus catalog metadata (slug / name / author).
- **Method:** rewrite a full anatomy (`agent.md`) under Caisra branding from listing-supported facts only. Where the public listing is silent, docs mark **Unknown (not in public listing)** — nothing is invented.
- **Not** an imported live agent dump, runtime prompt export, or private skill tree.
- **Reconstruction / rebrand date:** 2026-09-15 (PT).

## Layout

| Path | Contents |
|------|----------|
| `agents/<slug>/agent.md` | Full anatomy for that Caisra Agent |
| `branding/LOGO.md` | ☁️ mark + naming rules |
| Catalog (`gbt-bots.json` at workspace root) | All 23 slugs / names / authors |

Each anatomy follows sections **0–13**: Provenance · Identity · Mission / Job boundary · Voice & delivery · Operating model · Skills / workflows · Routines / schedules · Data model / working state · Connectors & inputs · Guardrails & privacy · First-run / getting started · Sibling / handoff (Caisra Agents / Yodo) · CreateAgent description sketch · Open gaps.

Footer on every doc: *Caisra Agent anatomy — confidential (Bass). Reconstructed from public listing.*

## Catalog (all 23) ☁️

| # | Slug | Official name | Author | Mark | Anatomy |
|---|------|---------------|--------|------|---------|
| 1 | `dr-eggbot-v2` | dr eggbot | Lauren Tan | ☁️ | [agents/dr-eggbot-v2/agent.md](agents/dr-eggbot-v2/agent.md) |
| 2 | `projects-manager` | Projects Manager | Eric Zakariasson | ☁️ | [agents/projects-manager/agent.md](agents/projects-manager/agent.md) |
| 3 | `pg` | Outbound Prospecting | Krista Letz | ☁️ | [agents/pg/agent.md](agents/pg/agent.md) |
| 4 | `seo-aeo-desk` | SEO & AEO Desk | Adam Tanguay | ☁️ | [agents/seo-aeo-desk/agent.md](agents/seo-aeo-desk/agent.md) |
| 5 | `haggle-bot` | Haggle Bot | Daniel Gartshein | ☁️ | [agents/haggle-bot/agent.md](agents/haggle-bot/agent.md) |
| 6 | `mr-toms` | Recruiting Coordinator | Tommy Hansen | ☁️ | [agents/mr-toms/agent.md](agents/mr-toms/agent.md) |
| 7 | `image-gen-bot` | Stills & Clips Desk | Matt Palmer | ☁️ | [agents/image-gen-bot/agent.md](agents/image-gen-bot/agent.md) |
| 8 | `figma-bro` | figma bro | John Bai | ☁️ | [agents/figma-bro/agent.md](agents/figma-bro/agent.md) |
| 9 | `follow-through-agent` | GTM Loop Closer | Jon Grigull | ☁️ | [agents/follow-through-agent/agent.md](agents/follow-through-agent/agent.md) |
| 10 | `sales-call-coach` | Sales Call Coach | Daniel Brill | ☁️ | [agents/sales-call-coach/agent.md](agents/sales-call-coach/agent.md) |
| 11 | `echo` | Meeting Recap Deck | Krista Letz | ☁️ | [agents/echo/agent.md](agents/echo/agent.md) |
| 12 | `ai-search-visibility` | AI Search Visibility | Adam Tanguay | ☁️ | [agents/ai-search-visibility/agent.md](agents/ai-search-visibility/agent.md) |
| 13 | `engineer-bot` | Lingxi's Engineer Bot | Lingxi Li | ☁️ | [agents/engineer-bot/agent.md](agents/engineer-bot/agent.md) |
| 14 | `tinkabot` | tinkabot | Lauren Tan | ☁️ | [agents/tinkabot/agent.md](agents/tinkabot/agent.md) |
| 15 | `critiquito` | Critiquito: Design Critique | Manuel Muñoz Solera | ☁️ | [agents/critiquito/agent.md](agents/critiquito/agent.md) |
| 16 | `sherlock` | Talent Discovery | Tommy Hansen | ☁️ | [agents/sherlock/agent.md](agents/sherlock/agent.md) |
| 17 | `cooper` | Cooper | Tommy Hansen | ☁️ | [agents/cooper/agent.md](agents/cooper/agent.md) |
| 18 | `stalk-bot` | Stalk Bot | Shub Gaur | ☁️ | [agents/stalk-bot/agent.md](agents/stalk-bot/agent.md) |
| 19 | `office-ops-desk` | Office Ops Desk | Erika Cabrera | ☁️ | [agents/office-ops-desk/agent.md](agents/office-ops-desk/agent.md) |
| 20 | `event-request-desk` | Event Request Desk | Emma Weyrauch | ☁️ | [agents/event-request-desk/agent.md](agents/event-request-desk/agent.md) |
| 21 | `call-follow-ups` | Call Follow-Ups | Daniel Brill | ☁️ | [agents/call-follow-ups/agent.md](agents/call-follow-ups/agent.md) |
| 22 | `skippy` | skippy | Matt Palmer | ☁️ | [agents/skippy/agent.md](agents/skippy/agent.md) |
| 23 | `customer-call-coach` | Customer Call Coach & Assistant | Anoop Baliga | ☁️ | [agents/customer-call-coach/agent.md](agents/customer-call-coach/agent.md) |

## Authors (rollup)

| Author | Agents |
|--------|--------|
| Tommy Hansen | Recruiting Coordinator, Talent Discovery, Cooper |
| Adam Tanguay | SEO & AEO Desk, AI Search Visibility |
| Daniel Brill | Sales Call Coach, Call Follow-Ups |
| Krista Letz | Outbound Prospecting, Meeting Recap Deck |
| Lauren Tan | dr eggbot, tinkabot |
| Matt Palmer | Stills & Clips Desk, skippy |
| Anoop Baliga | Customer Call Coach & Assistant |
| Daniel Gartshein | Haggle Bot |
| Emma Weyrauch | Event Request Desk |
| Eric Zakariasson | Projects Manager |
| Erika Cabrera | Office Ops Desk |
| John Bai | figma bro |
| Jon Grigull | GTM Loop Closer |
| Lingxi Li | Lingxi's Engineer Bot |
| Manuel Muñoz Solera | Critiquito: Design Critique |
| Shub Gaur | Stalk Bot |

## Fleet notes

- Specialists are **Caisra Agents**; out-of-scope work routes through **Yodo** (Chief of Staff) or the right sibling agent.
- Skill / routine names from public listings are preserved (including historical skill slugs).
- Display names and authors are unchanged from the catalog.

*Caisra Agents anatomies — confidential (Bass). Reconstructed from public listings.*
