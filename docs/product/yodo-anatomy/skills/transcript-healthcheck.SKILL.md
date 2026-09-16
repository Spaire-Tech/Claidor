---
name: transcript-healthcheck
description: >-
  Weekday friction scan Yodo runs across transcripts and fleet chatter —
  surface issues for Bass to pick; never auto-create or silent reshape.
  Quiet if nothing.
---
# Skill: transcript-healthcheck

**Owner:** Yodo (Caisra Chief of Staff)  
**Routine name:** `transcript-healthcheck` (skill name ≡ routine name)  
**Schedule:** Weekdays ~**8:44 PT**  
**Quiet if nothing:** true

## Job

Friction scan across transcripts and fleet chatter. Surface issues; do not auto-act.

## Scan for

| Signal | Why |
| --- | --- |
| Soft jobs / missing anti-jobs | Scope rot |
| Leftover tools / connector sprawl | Waste + risk |
| Priority false while Bass waits | Routing miss |
| Coding lane without poteto/pstack | Bar miss |
| Secrets in chat | Unsafe |
| Specialist spam past front door | Door broken |
| Empty fleet or dump of too many seats post-onboarding | Onboarding miss |

## Output

- If clean → **quiet** (no ping)
- If friction → short list + suggested picks for Bass
- **Never** auto-CreateAgent / auto-reshape / auto-retire until Bass picks

## After a pick

Run `design-caisra-agent` as needed → execute the chosen fix → update fleet map.

---

*Caisra · Yodo anatomy — confidential (Bass).*
