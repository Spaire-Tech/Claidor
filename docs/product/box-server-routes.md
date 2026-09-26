# The box routes, built

19 September 2026. The Server agent's working note, and the other half of
`docs/product/agent-computer-plan.md` §9 — the half that lives in `server/`.

The Box agent wrote the plugin and said what the server owed. This is what was
built against that, what was run, and what was **not**.

---

## 1. What is served

All ten routes of §9, at `/api/proxy/box/…` on the desktop router.

| Method | Path | Answers |
| --- | --- | --- |
| POST | `/box/sandboxes` | ensure a box for `(account, scopeKey)` |
| GET | `/box/sandboxes/{boxId}` | the same shape |
| DELETE | `/box/sandboxes/{boxId}` | 204, and really kills the machine |
| POST | `/box/sandboxes/{boxId}/shell` | `{stdoutBase64, stderrBase64, exitCode}` |
| POST | `/box/sandboxes/{boxId}/exec` | streamed NDJSON |
| PUT | `/box/sandboxes/{boxId}/file` | 200 |
| GET | `/box/sandboxes/{boxId}/file?path=` | `{contentBase64}` |
| POST | `/box/sandboxes/{boxId}/update` | the new box |
| POST | `/box/sandboxes/{boxId}/reset` | the new box |
| GET | `/box/machines` | `{machines: […]}` |

Plus a `desktop_boxes` table, a migration, and awake-seconds pricing that meters
into `desktop_usage` beside the models.

## 2. Three things worth knowing before reading the code

**The routes are declared above the `/api/proxy/{path:path}` catch-all, and that
is load-bearing.** FastAPI takes the first route that matches. Declared below
it, every single box call answers `{"error": {"message": "/box/… is not
proxied."}}` — a 404 to a plugin that is asking correctly. The Composio block
in the same file already carries this warning; the box routes now do too, and
there is a test (`test_ensure_is_not_eaten_by_the_proxy_catch_all`) whose only
job is to fail if somebody moves them.

**`boxId` is this server's row id, not E2B's sandbox id.** §9 says the sandbox
credential must never leave the server; I took the same rule one step further,
because a sandbox id plus the key is the whole of the authority over somebody's
computer, and there is no reason the app needs one. A test asserts that no
answer from any box route contains either.

**These answer plain JSON, not the app's `{code, data}` envelope.** Every other
route under `/api/` uses the envelope because its caller is the app. This
caller is the engine's plugin, and `brokerClient.json` reads `response.ok` and
then the body's own fields. Two conventions on one server is a cost; a client
that cannot parse the answer is worse.

## 3. Why the `e2b` SDK, and not httpx like everything else

This server calls Anthropic, OpenAI and Composio with `httpx` directly, and
that was the first instinct here too. It is wrong for this one.

E2B's **control plane** is ordinary REST — I read its OpenAPI document
(`github.com/e2b-dev/infra`, `spec/openapi.yml`) rather than working from
memory, which is how I know `POST /v2/sandboxes/{id}/connect` is the modern
"resume if paused, no-op if running" and that `/resume` is deprecated. But
**running a command and reading a file do not go there.** They go to `envd`
inside the sandbox, over Connect-RPC with protobuf framing. Hand-rolling that
would mean inventing a wire I have no way to test — there is no E2B key in this
environment — and that is exactly the class of guess that has cost this
repository days before. So the SDK does the data plane, and the lifecycle calls
go through it as well rather than splitting the module in half.

The cost is one dependency: `e2b==2.51.0`, which brings `connectrpc`,
`protobuf-py`, `pyqwest` and `wcmatch`. It is imported **inside** the methods
that use it, so a provider SDK failing to import cannot stop the server booting.

## 4. The money, which is what makes a box different

Every other thing this server sells costs nothing until somebody sends a
message. **A box bills for existing.** Three things follow, and they are the
design rather than details:

- **Awake time is settled in slices**, on every route that touches a box, not
  once when it stops. A box awake for a week must not arrive as one surprise,
  and a server that restarts must not lose the week.
- **`BOX_MAX_SECONDS_PER_SETTLEMENT` caps one settlement at 25 hours.** This is
  the only price in `pricing.py` multiplied by wall-clock time rather than by
  something a provider reported, so it is the only one a clock jump, a restored
  backup or an unset `billed_through` could turn into a bill for a decade of
  computer. A capped settlement logs loudly, because a truncation nobody sees is
  a bug nobody finds.
- **The allowance is checked on `ensure` and on no other box route.** Pausing,
  describing or killing a box must keep working when the month has run out —
  refusing to kill an exhausted account's box would leave it running and
  billing, which is precisely backwards.

The rate comes from `agent-computer-plan.md`'s quoted E2B figures and is
expressed as **two** constants (per vCPU-hour, per GiB-hour) rather than one
blended hourly number, so a bigger box re-prices itself without anybody
remembering to. ⚠️ **I did not read those figures off a price page** — see §6.

## 5. Two bugs this work found, both worth repeating

### The one a test caught

The first version had a plain unique constraint on `(user_id, scope_key)` and
soft deletion. Those two do not compose: a deleted box's row keeps holding the
pair forever, so **the next `ensure` after somebody deleted their computer was
refused by the database** — and deleting and starting again is the obvious
thing to do after a reset that went badly.

It was found by writing the test first and watching it fail with
`duplicate key value violates unique constraint`, not by reasoning about it. The
fix is a partial unique index, `WHERE deleted_at IS NULL`: unique among live
rows, history kept.

### The one no test could have caught

`/exec` originally did its database work — find the box, settle the awake time,
mark it running — *inside* the streaming generator.

**That would have lost every exec's metering in production, silently.** A
streaming handler hands back its `StreamingResponse` immediately, and
`polar.postgres.get_db_session` commits the request's session at that moment,
before the body has been streamed. A write from inside the generator lands in a
fresh transaction that nothing ever commits. The box runs, the person is charged
nothing, and **no error appears anywhere**.

Every exec test passed anyway, because the test client shares one session and
holds it open. The bug is invisible to the suite by construction — which is
exactly why it is worth writing down rather than quietly fixing.

It was found by reading the comment the model proxy already carries in the same
file — *"The request's own session is committed when the handler returns, before
a stream has ended"* — and asking whether it applied here too. It did.

The fix is `BoxService.prepare_exec`: every database touch happens in the
handler, and `exec_frames` is handed a sandbox and **no session**, so it has
nothing to write with. There is a test asserting that signature, because a
structural guard is the only kind of test that can defend this.

**The general lesson, which is not about boxes: in this codebase a streaming
route may not write to the request's session.** The model proxy solves it with a
second session; this solves it by doing the writes first. Either is fine. Doing
neither also looks fine, and that is the whole problem.

## 6. What I ran, and what I did not

**Ran, and passing:**

Re-run on 20 September, after merging `main` (which brought PR #133 in and
took the image half of this work out):

- `ruff format --check` and `ruff check` over `polar/desktop`,
  `polar/models/desktop.py`, `tests/desktop` and the migration → **clean**.
  The findings elsewhere in `server/` are pre-existing and identical with this
  work stashed.
- `mypy polar/desktop/ polar/models/desktop.py` → **0 errors** in those files.
  The 27 it reports elsewhere are pre-existing.
- `pytest tests/desktop/test_boxes.py` → **44 passed**.
- `test_boxes.py` and `test_capabilities.py` together → **62 passed**, so the
  box half and #133's image half do not tread on each other.
- Whole `tests/desktop/` → **249 passed, 6 failed**. The same 6 fail with this
  work stashed: this container has no provider keys, so `offered_models()` is
  empty and the catalogue tests find nothing.
- **The migration was applied to a real PostgreSQL 16**, forward and back, and
  the resulting table inspected — that is where the partial index was confirmed
  to exist with its predicate.

**NOT run, and none of this should be read as verified:**

- **Nothing here has ever contacted E2B.** There is no E2B key in this
  environment. Every test replaces `e2b.AsyncSandbox` with a fake. The tests
  prove the routes exist where the plugin looks, answer in the shapes it parses,
  scope correctly by account, meter, and obey the NDJSON rules — **they cannot
  prove the E2B calls themselves are right.**
- **No sandbox has ever been started, no command has ever run in a box, and no
  file has ever crossed.** The Box agent's §8 says the same of the plugin side.
  So the first real attempt is the first time either half meets the other, and
  it should be expected to fail somewhere in this contract.
- **The E2B rates were not read off a price page.** They come from
  `agent-computer-plan.md`, which cites them as E2B's for April–June 2026. Same
  ⚠️ as `SPEECH_USD_PER_MILLION_CHARACTERS`. Nobody
  should be charged against them until somebody has looked.
- **`E2B_TEMPLATE_ID` defaults to `"base"` and that is a guess about E2B's stock
  template name.** It is one setting; if box creation fails, this is the first
  thing to check.
- **The suite could not be run the way CI runs it.** `server/CLAUDE.md` requires
  Python 3.14 *final*; this container has 3.14.0rc2 and no final build is
  available, so pydantic will not import. The conftest runs above used a local,
  uncommitted `sitecustomize.py` dropping one `prefer_fwd_module` keyword, plus
  a local Postgres, Redis and moto standing in for Minio. None of that is in the
  diff.

## 7. Things in the contract I did not fully honour, said out loud

**`/shell` ignores `stdinBase64`.** The field is in the contract and the client
sends it; the SDK's non-background `run` has no one-shot stdin. It is logged as
a warning when one arrives rather than dropped silently, because a script that
expected input and got none fails in a way nobody can explain. The filesystem
bridge's operations do not appear to use it — `putFile` sends content in the
JSON body, not on stdin — so this is very likely unreached, but "very likely
unreached" is not "handled".

**`/exec` ignores `stdinBase64` too**, for the same reason and with the same
caveat. §6 already establishes that a command cannot be fed after it starts on
this road, so the only thing lost is stdin supplied up front.

**Update does not lose installed software.** `brokerClient.ts` documents Update
as *"installed software does NOT survive"*. It does survive here: an E2B
snapshot is the whole filesystem, so anything installed into it comes back. Every
primitive that would drop the software would drop the person's files too, and
the files are the point. What is built is the useful half — a fresh machine with
the person's data and logins. **Somebody will read that comment and expect the
other behaviour**, so it is flagged here rather than left to be discovered.

**There is no machine registry.** `/box/machines` returns the account's boxes
and nothing else. That is a decision and not a gap: `CLAUDE.md` — *Maties runs on
the machine, so there is no "which computer", only this computer.* The `kind`
field is already in the answer for the day that changes.

## 8. What to do first when the E2B key is in Render

In this order, because each answers the next one's question:

1. Set `CLAIDOR_E2B_API_KEY` and `POST /desktop/api/proxy/box/sandboxes` with
   `{"scopeKey":"shared"}`. A 503 means the key is not being read; a body with a
   `boxId` means a real sandbox started.
2. If it fails, **read `desktop.box.upstream_refused` in the log before
   proposing a cause.** It carries E2B's own sentence. If `E2B_TEMPLATE_ID` is
   wrong, that is where it will say so.
3. Then `/shell` with `{"script":"echo","args":["hi"]}`. That exercises the
   envd path, which is the half the control-plane spec could not tell me about.
4. Then `/exec` with something slow (`for i in $(seq 5); do echo $i; sleep 1;
   done`) and watch whether frames arrive **as they happen**. Requirement 1 is
   the one a fake cannot really test: my test proves frames are emitted in
   order, not that they are flushed rather than buffered by something between
   here and the bridge.
5. Then measure the round-trip from a Mac, which is the measurement
   `agent-computer-plan.md` §7 says is the cheapest useful thing anybody can do
   next and which no amount of server code substitutes for.

---

## 9. For the Chief of Staff: one decision, and three things I do not own

Added 20 September, after merging `main` into this branch. Everything below is
measured, and I say where.

### The decision, which is not mine

**Do these ten REST routes land, or be re-fitted to Connect RPC?**
`docs/product/cards-plan.md` describes the re-founded app's box contract as
Connect RPC — `ensureSandBox`, `recreateSandBox`, `forceRecreateSandBox` — which
is a different shape from what is built here.

What a re-fit would cost, split honestly:

- **`BoxService`, the `desktop_boxes` table, the migration, the repository and
  the awake-seconds metering are shape-independent.** They are about custody of
  the key, scoping by account, and billing for a machine that exists. All of it
  survives either answer.
- **The route layer does not.** Ten handlers and their tests would be rewritten
  against a different wire.

I am not merging this, closing it, or starting that re-fit without an answer.

### Three things in `desktop/` that I found and did not touch

I own `server/**` and `runner/**`. These are written down instead of changed.

**1. `docs/product/images-state.md` is out of date in its headline.** It measures
`GET /desktop/api/media/images/models` answering **404** and `server/polar/`
serving no image route. PR #133 landed `server/polar/desktop/capabilities.py`,
which serves `POST /api/proxy/v1/images/generations`, and
`desktop/source/shared/node/cursor-backend/claidor-generate-image.ts` calls it
and names that file in its own header comment. The 404 is answered. Somebody who
owns that document should correct the headline.

**2. `IMAGE_MODEL_ID = "gpt-image-1"` has still never been read off a live
catalogue.** #133 meters from OpenAI's real usage object, which is the half that
matters, but the model id itself is the same unchecked constant mine was. One
look at a real model list settles it. (`polar/desktop/capabilities.py` is
server-side and *is* mine to change — I am flagging it rather than changing it
only because I have no key here to check it against, and a guess replacing a
guess is not progress.)

**3. A defect I reported in `desktop/` no longer exists, and I am saying so
because I reported it.** I told PR #125 that `desktop/package.json` paired
`vite ^5.1.4` with `vitest ^4.1.0`, which cannot run together, and that it wanted
fixing by whoever owns that build. After the merge, `desktop/package.json` carries
`vite 8.2.1`, **no `vitest` at any version**, and `npm test` is
`node --test tests/*.test.mjs`. The restructure removed it. Nothing to assign.

### What CI proves about this work: nothing

Measured on this branch's head and on `main`. The gate job `Detect changes`
fails in two seconds with `runner_id: 0`, an empty `runner_name`, `started_at`
equal to `created_at`, and a log that answers **404** because none was ever
written. Every downstream job — tests, linters, migration check — is `skipped`,
not failed. It is identical on `main`, including on #133's own merge commit
`55714d5d`.

So **no CI has executed a line of this diff, in either direction.** That is
consistent with an Actions spending limit, and `CLAUDE.md` already says the same.
It remains **inference and not a log**: nobody has read the repository's Actions
billing page, and I cannot from this container. Until somebody does, §6's list of
what I ran locally is the only evidence this work has.

---

## 10. §9 landed on main, and it sharpened the question rather than answering it

23 September 2026. `main` `24edb785` brought `docs/product/agent-computer-plan.md`
into the tree — 599 lines, including the §9 this note's §1 was written against.

**The good news, checked rather than assumed.** §9 is headed *"For the Server
agent. I do not touch `server/`"* and its table specifies exactly the ten REST
routes under `/api/proxy/box/…` that PR #125 serves. I compared the table to
`endpoints.py` method by method: all ten match, paths and verbs. I also checked
the two obligations I was least confident I had met:

- **§9 requirement 3 — kill the command in the box when the client
  disconnects**, because "an abandoned command runs on, billing". Implemented:
  `boxes.py:632` carries that exact rationale, and the `finally` at 713 calls
  `handle.kill()` at 719.
- **"Keep the box alive while it is in use."** `set_timeout` at `boxes.py:207`
  and 734.

**The bad news, and it is the important half.** It would be easy to read §9
landing as the decision this note's §9 has been waiting for. It is not, because
**the plugin §9 was written for is not in this tree.**

What I searched, so nobody takes it on trust:

- `ls desktop/openclaw-extensions/box/` → no such directory.
- `find desktop -name 'brokerClient*' -not -path '*/node_modules/*'` → nothing.
- `grep -rn 'api/proxy/box' desktop --include=*.ts --include=*.mjs`, excluding
  `node_modules` → nothing.

What the tree *does* have is a different wire for the same capability:
`desktop/source/electron-main/box/box-host-connector.ts` declares
`BrokerClient.ensureSandBox` / `recreateSandBox` / `forceRecreateSandBox`
against `GrokBotService` over Connect RPC, reached through
`createSandCursorBackendClient`. And `desktop/source/shared/box-runtime.ts` sets
`DEFAULT_SAND_BOX_RUNTIME = "local-docker"` — the default box is not remote at
all.

One of the commits in this merge is titled *"Keep the box measurement, which
only exists on a branch that cannot merge"*, which is consistent with the
measurements and the plan landing while the plugin did not. I have not read that
branch and am not asserting what is on it.

**So `main` now carries two contradictory contracts for one capability**: a plan
document that specifies REST and is addressed to me, and app code that speaks
Connect RPC. Both are on `main` today. That is a sharper statement of the open
question, not an answer to it, and it is not mine to settle.

**What would settle it,** in one line each: does the box plugin that speaks REST
come back into `desktop/`, or does the Connect RPC broker in
`box-host-connector.ts` become the box's real path? The first makes PR #125
mergeable as written. The second makes `BoxService`, `desktop_boxes`, the
migration and the awake-seconds metering the salvage, and the ten handlers the
rewrite — exactly the split §9 of this note already costed.

I am still not merging, closing, or starting the re-fit without that answer.

## 11. 25 September: the app now calls our server for the box, and the question narrowed

`main` moved a long way overnight (`029f9cd5..7e390349`, 195 files). Three of
those commits are about the box, so I read them rather than the titles.

**The app speaks REST to Claidor about the box now, and I did not write it.**
`6bb4570a` ("The box outlives the app for routines, and renews its own model
credential") is the first change to
`desktop/source/electron-main/box/box-host-connector.ts` since `ce9fc2d8`, the
re-founding. It adds `issueBoxRenewalCredential()`, a plain `fetch` to
`POST /desktop/api/box/renewal-credential`, and the same commit adds that route
to `server/polar/desktop/endpoints.py` along with `app_sign_in.py`'s
`POST /sand-box/inference-credential`, a migration, `service.py`,
`repository.py`, `tokens.py` and `models/desktop.py`.

So the premise behind §10's "two contradictory contracts" needs narrowing. It
is not that the app refuses REST to our server — it does REST to our server, by
`fetch`, for box credentials, today. What the app does over Connect RPC is the
box's **gateway** wire. Those are different things and I had them blurred.

**What has still not happened, checked not assumed:**

- `grep -rn "api/proxy/box\|/box/sandboxes" --include=*.ts --include=*.tsx
  --include=*.mjs --include=*.js desktop clients` returns **nothing**. No caller
  of the ten routes in this PR.
- `DEFAULT_SAND_BOX_RUNTIME` in `desktop/source/shared/box-runtime.ts` is still
  `"local-docker"`.
- The `"remote"` runtime has nothing behind it. `main-edge.ts:118` is the whole
  of it: choosing a mode that is not `local-docker` calls `stopLocalDockerBox()`
  and restarts the recovery coordinator. `grep -rn '"remote"'` under
  `electron-main/box` and `host/box` returns **no hits**. Nothing brokers a
  sandbox.

**So the direction of travel is the opposite of this PR's**, and that is the
thing worth saying plainly: `6bb4570a` and the `local-docker-host-connector.ts`
change next to it invest in making the **local Docker container on the Mac**
outlive the app, so a routine fires while the Mac is awake. This PR brokers a
cloud sandbox on E2B so a routine can fire while the Mac is **shut**. Both are
real answers to "the laptop is closed"; they are not the same answer, and only
one of them has a caller.

That is a sharper version of the same open question, and still not mine to
settle. It now reads: **is the box a container on the person's Mac that we keep
alive, or a sandbox we broker in the cloud?** If the first, this PR is dead
code and should be closed rather than merged, and I would rather be told to
close it than have it sit. If the second, it is the missing half of the
`"remote"` runtime and wants a caller.

**One coordination note, not a complaint.** `polar/desktop/` is listed as mine
exclusively, and another agent wrote 555 lines across seven files in it on
`main`. The work is sound and its tests pass here. It did fork the migration
chain — `desktop_box_credential_0925` and my `desktop_boxes_0918` both declared
`down_revision = "maty_job_times_0912"`, so `alembic heads` reported two heads
and `alembic upgrade head` refuses to run with two. Mine is the one that is not
on `main`, so I re-pointed mine onto theirs and proved the whole chain applies
and reverses against a scratch database. Worth knowing that nothing in CI would
have caught this: the suite builds its schema from `Model.metadata.create_all`,
not from migrations, and the `Server: Migration Check 📚` job has never been
given a runner.

## 12. 25 September, evening: the decision was answered by code, and this PR is superseded

`main` `a66f628e` carries `server/polar/sand/` — 24 new modules, ~14,000 lines
under `server/`, with 128 tests that pass. Among them: `box_service.py`,
`box_broker.py`, `box_hosts.py`, `box_proxy.py`, `box_repository.py`,
`models/sand_box.py` and a `sand_boxes` migration.

**That is the cloud box broker.** Not a REST API — `aiserver.v1.GrokBotService`
over Connect RPC, answering `EnsureSandBox`, `RecreateSandBox`,
`ForceRecreateSandBox`, `WatchSandBoxMigration` and `GetSandBoxRunState` in the
shapes the app's generated `sand_box_pb.ts` already reads, plus a reverse proxy
for the box's four ports at `/sand-box/{box_id}/p/{port}/…`.

So §11's question — *is the box a container on the person's Mac that we keep
alive, or a sandbox we broker in the cloud?* — **has been answered, and the
answer is both**: the local Docker box keeps running after the app quits, and
`setBoxRuntime("remote")` now has a broker behind it. It was not answered by
anyone replying to me. It was answered by code landing on `main`, which is a
perfectly good way to answer it and is the reason I check the diff rather than
the inbox.

**What that makes of this PR, stated plainly rather than defended.** The ten
REST routes under `/api/proxy/box/` have no caller and never will: the app
speaks Connect RPC for this and always did. `desktop_boxes`, `BoxService` in
`polar/desktop/boxes.py`, and the ten handlers are the branch that lost. This
is the "rewrite" half of the split I costed in §9 and it should be **closed,
not merged**. I have said so on the PR and I am not closing it myself, because
that is not my call to make unasked.

**Two things of mine are not superseded, and one of them is a gap in what
landed.**

1. **The `e2b` host provider.** `box_hosts.py` chooses a host by
   `CLAIDOR_BOX_HOST_PROVIDER`; `docker` is implemented against a remote Docker
   Engine, and **`e2b` is a stub**. Its own docstring says why: "the `e2b`
   package is not in `uv.lock` (checked 25 September 2026:
   `grep -n 'name = "e2b"' server/uv.lock` finds nothing)". That is true of
   `main`. It is not true of this branch — the dependency, the lockfile entry
   and a working E2B client are here. The note also names a real obstacle I had
   not hit: E2B publishes per-port hostnames as `<port>-<id>.e2b.app`, which is
   not the `<label>-<port>` shape the app's tunnel derivation reads. That is an
   argument about URL shape, not about whether E2B can host a box, and
   `box_proxy.py` already exists to stand in front of exactly that problem.

2. **Metering.** `grep` over `main`'s `polar/desktop/pricing.py` for
   `box|BOX|vcpu|awake` returns **nothing**, and nothing in `polar/sand/`
   charges for box time. So the broker that landed can start a container that
   bills by the second and has no meter and no spend guard on it. This branch
   has `credits_for_box`, `E2B_USD_PER_VCPU_HOUR`, `BOX_MODEL_ID` and the
   hourly-budget refusal wired into `box_ensure`. **I am not asserting this is
   a bug in their work** — a first cut of a broker can reasonably land without
   billing — but it is worth someone deciding on deliberately rather than
   discovering later, and it is the thing I would carry across.

So the salvage is not the ten handlers. It is: the `e2b` dependency and client,
and the box metering. Both would land in `polar/sand/`, beside the broker, not
in `polar/desktop/`. I am not starting that without being told to; another agent
is plainly working in that directory right now and two of us writing there
unasked is how the migration chain got forked twice in one day.

**The chain forked again, third time today.** `main` added five migrations
chaining `desktop_box_credential_0925 → sand_listeners_0925 →
desktop_share_rooms_0925 → sand_cloud_agents_0925 → sand_boxes_0925 →
sand_plugins_0925`. Mine was still pointing at `desktop_box_credential_0925`,
so `alembic heads` reported two again. Re-pointed onto `sand_plugins_0925` and
re-proved the whole chain upgrades to `desktop_boxes_0918`.

## 13. 26 September, 01:30: main's own suite is red, and it is not this branch

Merging `main` `930a0f46` took my run from 8 failures to 14. Six new, all in
`tests/desktop/test_endpoints.py`, all proxy tests.

**They are main's, established rather than assumed.** I put `origin/main`
`930a0f46` in a worktree with none of my code present and ran
`tests/desktop/test_endpoints.py`: **12 failed, 50 passed** — the same twelve.
Then I bisected the four commits in the range with `TestTwoProviders`:

```
6fb7a9e7  11 passed
de40f11d  11 passed
60644cfc  11 passed
930a0f46   5 failed, 6 passed
```

So `930a0f46` ("Ledger batch 6: models and spend, speech and media, web and
search", #200) turned them red, and `main`'s head is red on its own suite
right now.

**The product change behind it is coherent; the tests are stale.** #200 added
to `_proxy`:

```python
if model is None or model.role is None:
```

with the comment that a priced row carrying no role is in the catalogue so an
old usage row still means something, "not so a bearer can name it and be served
at that price (F-122)". I checked whether that switched off a model people can
actually reach, because that would be a different and worse thing: it does not.
`offered_models()` in `service.py:154` already filtered on exactly the same
condition and its docstring already named the same rows — "Opus, Haiku and
Astra". Measured: the rows with no role are `claude-opus-5`,
`claude-haiku-4-5-20251001`, `gpt-6-astra`, `gemini-2.5-pro`. So the gate makes
the proxy serve what it offers, which is what the comment claims. The failing
tests are the ones that still post one of those four and expect an upstream
call; `respx` reports the route was never called, because the proxy now refuses
before it.

**One thing to check that I have not:** CLAUDE.md says "Escalation to Astra
comes after, on the rule `pricing.py` already states." If escalation ever means
the app naming `gpt-6-astra` on the proxy, it now gets
"This model is not offered by the desktop app." Whether escalation was ever
meant to work that way is not established, and it is not mine to decide.

**I have not fixed the six tests.** They are in my territory
(`server/tests/desktop/`), and the fix is small — point them at a model that
carries a role. But #200's author is landing ledger batches in sequence and may
already be on it, and a fix inside this PR does nothing for `main`, which is
where the red is. Say the word and I will do it on a branch of its own.
