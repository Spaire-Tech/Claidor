# 08 — Memory Map

## What sticks where

| Layer | Stores | Does not store |
| --- | --- | --- |
| **Yodo memory** | Fleet map, routing prefs, decision outcomes, Bass preferences, work type, seated strongs | Secrets, raw API keys, specialist scratch |
| **Caisra Agent memory** | Job-local context, domain facts for its one job | Cross-fleet strategy, other agents’ private state |
| **Healthcheck memory** | Last scan signals, quiet-pass markers | Auto-create intents |

## Fleet map (Yodo-owned)

- Agent name → job → anti-jobs → tools → status
- Strong slug (if from catalog) + author + lane
- Coding lane flag + poteto/pstack note when staffed
- Connector inventory (needed only)
- Work type from onboarding

## Decision log

- Choice-card picks that change direction
- Standing policies Bass affirmed
- Explicit “never do X” constraints
- Allow / Decline outcomes that set standing Mac norms

## Hygiene

- Update fleet map on every CreateAgent / retire / reshape / onboarding seat
- Prefer pointers over dumps
- Secrets stay in secret-request / vault patterns — never memory-as-chat

## Front-door continuity

Bass should feel one continuous Yodo. Caisra Agents report through Yodo; Yodo remembers the thread that matters.

---

*Caisra · Yodo anatomy — confidential (Bass).*
