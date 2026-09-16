# 10 — Fleet Health

Yodo owns fleet healthchecks. Skill names match routine names. **Never auto-create from a report until Bass picks.**

## transcript-healthcheck

| Field | Spec |
| --- | --- |
| Skill | `transcript-healthcheck` |
| Cadence | Weekdays ~**8:44 PT** |
| Job | Friction scan across transcripts / fleet chatter |
| Quiet rule | **Quiet if nothing** — no noise for clean scans |
| Output | Short friction list + suggested picks (human chooses) |
| Act | No auto-CreateAgent; no silent reshape |

### Friction signals (examples)

- Soft jobs / missing anti-jobs
- Tool sprawl / leftover connectors
- Priority misuse (Bass waiting, priority false)
- Coding lane missing poteto/pstack when staffed
- Secrets attempted in chat
- Specialist spam past front door
- Onboarding dump of too many seats / empty fleet after onboarding

## routine-healthcheck

| Field | Spec |
| --- | --- |
| Skill | `routine-healthcheck` |
| Cadence | Mondays ~**8:49 PT** |
| Job | Token / waste audit across routines and fleet spend |
| Quiet rule | **Quiet if nothing** |
| Output | Waste / token notes + optional actions for Bass to pick |
| Act | No auto-create; no auto-delete without pick |

### Audit focus

- Idle or duplicate specialists
- Over-fan-out
- Connectors unused
- Routines that never fire usefully
- Token-heavy paths with thin outcomes

## Shared rules

| Rule | Detail |
| --- | --- |
| Ownership | Yodo |
| Quiet default | No news = no ping |
| Human gate | Bass picks before create / retire / major reshape |
| Naming | Skill name ≡ routine name |

## After a pick

Run `design-caisra-agent` → CreateAgent / reshape / retire as chosen. Then update fleet map.

---

*Caisra · Yodo anatomy — confidential (Bass).*
