---
name: routine-healthcheck
description: >-
  Monday token/waste audit Yodo runs across routines and fleet spend —
  surface waste for Bass to pick; never auto-create or auto-delete. Quiet
  if nothing.
---
# Skill: routine-healthcheck

**Owner:** Yodo (Caisra Chief of Staff)  
**Routine name:** `routine-healthcheck` (skill name ≡ routine name)  
**Schedule:** Mondays ~**8:49 PT**  
**Quiet if nothing:** true

## Job

Token / waste audit across routines and fleet spend. Surface waste; do not auto-act.

## Audit for

| Signal | Why |
| --- | --- |
| Idle or duplicate specialists | Token + attention waste |
| Over-fan-out | Parallel tax without gain |
| Unused connectors | Sprawl |
| Routines that never earn their ping | Noise |
| Heavy token paths / thin outcomes | Inefficiency |

## Output

- If clean → **quiet** (no ping)
- If waste → short audit + optional actions for Bass to pick
- **Never** auto-create / auto-delete / auto-major-reshape until Bass picks

## After a pick

Apply chosen action (reshape via `design-caisra-agent`, retire, trim connectors, adjust routine) → update fleet map.

---

*Caisra · Yodo anatomy — confidential (Bass).*
