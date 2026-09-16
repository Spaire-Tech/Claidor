# 06 — Design Rubric (`design-caisra-agent`)

Executable craft Yodo runs **before every CreateAgent**. Skill: `skills/design-caisra-agent.SKILL.md`.

## When to run

- First-run / onboarding staffing
- New Caisra Agent request
- Reshape of an existing agent
- Before any CreateAgent call
- Before seating a strong from the catalog (confirm job / anti-jobs / tools still fit)

## Intake questions (dense)

1. **Outcome** — What done looks like in one sentence?
2. **Owner** — Does this need a specialist, or does Yodo do it?
3. **Catalog** — Does a strong in `12-strongs-catalog.md` already own this lane?
4. **Boundaries** — What must this agent never touch? (anti-jobs)
5. **Voice** — How should it sound when it speaks?
6. **Tools** — Minimum connectors/tools to finish the job?
7. **Lane** — Coding or non-coding?
8. **Proof** — How do we verify success on first task?

Stop intake when answers are enough to write the brief. Bias to act.

## Job / anti-job / voice / tools

| Element | Rule |
| --- | --- |
| **Job** | One sentence. Verb + object + success signal |
| **Anti-jobs** | Explicit bullets. Refuse leftover scope |
| **Voice** | Short contract; craft agents may be tighter than Yodo |
| **Tools** | Only what the job needs — no leftovers |

## Coding bar

Must clear **poteto-mode**:

| Principle | Meaning |
| --- | --- |
| Laziness | Smallest working change |
| Subtract Before Add | Cut before grow |
| Experience First | Walk the path; no ritual |
| Prove It Works | Run, test, show |
| Unslopped prose | No filler |
| Deliberate subagents | Parallel only when earned |
| Simple code | Clarity over cleverness |
| **pstack** | Include when coding lane is staffed |

## Non-coding bar

- One job + anti-jobs present
- Voice fit to domain
- Tools lean
- Clear handoff back to Yodo front door
- No silent irreversible actions without policy
- Draft by default; never send/post/spend without yes

## When to CreateAgent

| Create | Hold |
| --- | --- |
| Rubric complete; job sharp | Soft / multi-job request — sharpen first |
| Tools identified | Secrets needed in chat — use secret-request, never chat |
| First task ready | Bass must pick among options — choice card first |
| Anti-jobs written | Duplicate of an existing specialist — reshape instead |
| Strong matched or custom justified | Dumping catalog seats without work-type fit |

## Output artifact

Produce the staffing brief (see playbook), then CreateAgent / seat strong. Do not skip anti-jobs.

## Templates vs live agents

- Prefer live, job-fit Caisra Agents (strongs first when matched).
- Do not default to shareable templates.
- If staging a public template: full live `profile.description` → template description.

---

*Caisra · Yodo anatomy — confidential (Bass).*
