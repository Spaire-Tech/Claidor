# Going back to Caisra on the desktop

> **Carried out, 18 September 2026.** This was written as a brief for whoever
> picked the work up. They did. `rakazo/` is deleted, `desktop/` is restored and
> byte-identical to `b41c9364` (`git diff b41c9364 HEAD -- desktop/` is empty),
> and `server/` was left alone as instructed. Read it as the record of a decision
> that was executed, not as a to-do list. Two of its "live state" items were
> checked again on 18 September and one of them was wrong; see that section.

---

## The decision

Caisra goes back to being a Mac app. The Rakazo foundation is abandoned as a
base, kept only as a reference to learn from.

The founder, 18 September 2026:

> "i just wanna go back. this is not working. i prefer the idea of just being an
> app. i dont like how they built at rakazo. tho the tech is there. we can
> inspire ourselves."

This reverses the decision of 17 September that made Rakazo the foundation. It
is not a failure of that decision being explored — it is the result of
exploring it.

## Where to go back to

**Commit `b41c9364a90176a3b00b5e627260fbd9514c080e`** — the merge of PR #116,
17 September 2026, 04:23. The last state before Rakazo was vendored.

Verified, not assumed:

- No `rakazo/` directory. It did not exist yet.
- `desktop/src` holds 1,570 files.
- 102 of them mention Yodo or Caisra: the agent, the brief, the 23 strongs, the
  roster card, Chief of Staff, onboarding, the Messages design, the OpenUI
  cards and artifacts, whisper speech recognition, the Mac tasks, the
  connections catalogue.

This is the build the founder judged "miles and miles better" than what Rakazo
gave. That judgement came from using both.

## The part that makes this cheap

**There is nothing to unlink.** The desktop build's backend is Claidor, on
Render, and it was never touched. Checked live on 18 September:

```
https://api.claidor.com/desktop/api/proxy/v1/models  →  401
```

401, not 404 — the route exists and is asking who you are. Browser login,
tokens, the metered model proxy, memory sync, the maty job queue and the cloud
runner are all still served under `/desktop` and all still running.

Rakazo was never wired into that. It is a separate deployment on a separate
machine, standing beside it. Turning it off changes nothing about the desktop
app's backend.

## What changed in `server/` since that commit, and why none of it breaks you

Four files, all additive:

| File | What was added | Effect on the desktop app |
|---|---|---|
| `polar/auth/scope.py` | `Scope.model_proxy` | None. A new scope nothing else reads. |
| `polar/desktop/auth.py` | `get_proxy_caller` | **None, and check this yourself.** It accepts a desktop access token *first*, exactly as before, and falls through to a personal access token only when the bearer is not a desktop token. The desktop path is untouched and takes priority. |
| `polar/desktop/endpoints.py` | `GET /api/proxy/v1/models` | None. A new route. |
| `polar/desktop/pricing.py` | `reachable_on`, `openai_models_list` | None. New helpers. |

Plus a token-minting button in the Claidor dashboard
(`ConnectAppSettings.tsx`), which mints a `model_proxy` token. Harmless, and
probably not needed once the desktop app is the client again — the desktop app
uses session tokens.

So: **keep `main`'s `server/`. Restore `desktop/` from `b41c9364`.** Do not
revert the server.

## What to do with `rakazo/`

Delete it from the working tree. It is Apache-2.0 vendored source, it is in
git history, and the founder wants it kept as something to learn from, not to
build on. Record where it lives (subtree merge `34325164`; the Caisra-on-Rakazo
attempt is archived at `4118ac0f`) and take it out.

## Live state to be aware of before you start

Two things were changed during the Rakazo attempt and both need a decision:

**~~`app.claidor.com` now points at the Hetzner server, not Vercel.~~ Wrong —
measured 18 September.** The hostname is on Vercel and serving the Claidor
dashboard:

```
app.claidor.com  →  CNAME cname.vercel-dns.com  →  76.76.21.164
GET https://app.claidor.com/  →  307 → /signup,  server: Vercel,  x-claidor-* headers
```

Whether the repoint ever happened or was reverted is not established. Either way
there is nothing to do, and nobody should spend an afternoon "pointing it back".
`docs/product/app-claidor-com-facts.md` is the inventory of everything that names
this hostname — note that it, too, measured Vercel on the same day, which is the
first sign this bullet was never true.

**A Hetzner server was running the Rakazo stack.** It costs money and serves
nothing now. Cancel it, or keep it briefly if anyone wants to go on reading
Rakazo's behaviour rather than its source. **Not verified from here** — this
container has no Hetzner credentials and the host is not named in the
repository, so whether it is still billing is the founder's to check.

## The cost of going back, stated plainly

The desktop build runs the engine on the person's Mac. **Close the laptop and
nothing runs.** Hosted execution was the entire reason for the Rakazo move
(decision 2 of 17 September: "this is what makes a routine fire with the laptop
shut").

There is a partial cloud path already built for the desktop architecture — the
maty job queue under `server/polar/maty/` and the `claidor-maty-runner` service
in `render.yaml`, both live. ~~How complete it is has not been established.~~
**Established 18 September:** the queue answers, the runner is built and tested,
and **nothing creates a job** — there is no maty client in `desktop/src` at all.
A finished pipe with no input. The decision that followed is in
`docs/product/box-substrate-read.md`: keep the queue, change the executor to a
box.

## Two things worth taking from the Rakazo attempt

Not the code. These:

1. **Their eval harness.** `rakazo/docs/agent-verification.md` runs the real
   agent loop against a local model fixture, offline, with no keys, plus 16
   eval cases graded on actual effects over three trials. Its stated rule is
   the founder's own: missing live credentials mean *not run*, never a passing
   evaluation. Every argument in this repository about whether a brief rule
   works has been reasoning. That harness measures. It is the single most
   valuable thing in the fork.

2. **The finding that cost a day.** Rakazo treats an OpenAI-compatible model as
   text-only unless its id is named in `RAKAZO_OPENAI_COMPATIBLE_VISION_MODELS`.
   Ours were not, so the agent had no screenshot tools, never used graphical
   tools, and the desktop never started. It read as a stupid agent and was a
   blind one. Whatever the desktop build does about vision capability, make it
   impossible to configure a model that silently cannot see.

## What was learned about the comparison itself

The agent the founder judged "dumb" was **stock Rakazo with no brief of ours at
all**. Searched and confirmed at the time: no Yodo, no Caisra brief, no
`CHIEF_OF_STAFF_RULES` **in the Rakazo tree**. Two corrections, 18 September:

- That sentence said "anywhere in the live tree". The live tree is `desktop/`
  again, and `CHIEF_OF_STAFF_RULES` is in it, at
  `desktop/src/shared/agent/chiefOfStaff.ts`. The writing was never lost; it was
  never carried across.
- There is **no task 83**. `docs/product/review.md` ends at item 81. The number
  was invented. The work it named — rewriting the Chief of Staff rules for the
  Rakazo topology — is moot, since that topology is gone.

That does not make the founder's judgement wrong. It does mean the measured gap
between the two builds is larger than the real one, and nobody should conclude
from this episode that the writing cannot survive a change of engine. It was
never tried.
