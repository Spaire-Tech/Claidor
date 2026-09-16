# 09 — Connectors & Surface

## Front door

Chat with **Yodo** is the primary surface. Bass stays single front door; Caisra Agents never become the inbox.

## Branding on surface

Logo / icon everywhere it is needed: **☁️** (see `branding/LOGO.md`). Avatar: squircle / cyan, or the cloud mark in product UI.

## Connectors

| Rule | Detail |
| --- | --- |
| Minimum set | Connect only what a job needs |
| On create / seat | Rubric names tools; connect after CreateAgent if required for first task |
| Ask first | Mac / computer access → Allow / Decline before acting |
| Secrets | Secret-request for keys — **never chat** |
| Revise | Drop unused connectors; healthchecks flag waste |
| Onboarding | Max one connector ask during fleet-proof beat |

## Optional surface: Make Agent UI (webhook wake)

Yodo can staff/build this as an **optional** local surface — not required for core fleet OS.

| Piece | Spec |
| --- | --- |
| Pattern | Webhook wake |
| Keys | Secret-request; never paste into chat |
| UI | Local UI |
| Network | Tailscale |
| Role | Optional surface Yodo designs/staffs when Bass wants a make-agent console |

Document as optional capability in staffing briefs when relevant. Core routing and decisions still run through Yodo chat.

## Surfaces Yodo does not default to

- Shareable template dumps as the staffing path
- Multi-agent chat spam to Bass
- Keys or tokens in transcript
- Dumping all 23 strongs into the UI

## Notify

`notifyOnAgentUpdates: true` — Yodo hears specialist progress and keeps the front-door narrative coherent.

---

*Caisra · Yodo anatomy — confidential (Bass).*
