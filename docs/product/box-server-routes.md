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

## 14. 26 September, 22:30: two of main's desktop commits assert server behaviour, and both assertions hold

`833908b9..3c805f93` is five commits (#204–#208). **Not one file under
`server/` or `runner/` changed** — `git diff --name-only 833908b9..3c805f93 |
grep -E '^(server|runner)/'` returns nothing, and after merging,
`git diff ffbacb78 HEAD -- server/ runner/` is empty. So nothing in my
territory moved and the measured baseline at `ffbacb78` still describes this
tree.

That is exactly the situation this note has been wrong about before. "No
conflict" does not mean "still correct": two of those commits change what the
app puts on the wire to routes I own, and one of them states, in its commit
message, what my server does. I checked all three crossings against the code
rather than against the message.

**#208 sends `prompt_cache_key` in the proxy body, and my proxy passes it
through.** The executor now adds a `prompt_cache_key` field to the JSON it
POSTs to `/api/proxy/v1/responses`. Searched: `grep -rn prompt_cache_key
server/polar server/tests` → no match, so the server never names the field.
What decides it is `_openai_responses_body` (`endpoints.py:791`), which returns
`raw` — the request body verbatim. Even the wires that do change something
(`_openai_body`, `_gemini_body`) rebuild with `json.dumps({**payload,
**changes})`, which preserves every key they do not name. There is no
allowlist: `grep -n 'allowed_keys\|ALLOWED_\|pop(\|del payload'
polar/desktop/endpoints.py` returns nothing. So the key reaches OpenAI and
#208 works through us unchanged.

This one was worth checking rather than assuming, because of how the app
degrades: `withPromptCacheKey` disables the key for the process only if the
*response text* names `prompt_cache_key`. A proxy that silently stripped the
field would have produced no error, no log line and no cache hit — a
permanent, invisible zero. It does not strip it.

**#206 removes the Mac's five-minute credential rewrite loop, and the three
things that now depend on my server are all true.**

1. *"The credential is minted once per box (the server revokes the previous one
   on each mint)."* True: `issue_box_credential` (`service.py:499`) walks
   `list_box_credentials_of(parent.id)` and sets `revoked_at` on each live one
   before minting, skipping the local-exec daemon's own child row.
2. *The box can renew for as long as it lives.* The credential row's
   `refresh_expires_at` is `now + DESKTOP_REFRESH_TOKEN_TTL` = **30 days**
   (`config.py:189`), and the trade at `POST /sand-box/inference-credential`
   (`app_sign_in.py:346`) returns only `{accessToken, expiresAtMs}` — it does
   **not** rotate the credential. So a once-per-box mint stays good, which is
   what makes dropping the rewrite loop safe.
3. *The app's hourly refresh does not kill the box.* `refresh` re-parents each
   live child by setting `child.box_of_session_id = issued[0].id`
   (`service.py:470`); the credential row and its hash are untouched. With the
   rewrite loop gone the Mac has no way to deliver a new credential mid-box, so
   a re-parent that minted a fresh one would have killed every box after one
   hour. It does not.

**What I ran:** the greps and file reads above; `PYTHONPATH=. uv run alembic
heads` → one head (`desktop_boxes_0918`); `grep -c '"/api/proxy/box/'` → 10,
first at 1450, catch-all `/api/proxy/{path:path}` at 1786; `grep -c
hourly_exhausted` → 1; `ruff check` over `polar/desktop/`,
`polar/models/desktop.py` and my migration → clean.

**What I did not run:** the pytest suite. The tested tree is byte-identical to
`ffbacb78` (empty diff over `server/`), which measured 468 passed / 14 failed
six hours earlier, so re-running it could only reproduce that. If anyone wants
the number re-measured rather than inherited, it has not been.

Still never run, unchanged since this branch began: nothing has contacted E2B,
no sandbox has been started, and no command has run in a box.

## 15. 27 September, 02:30: a correction to §14, and the server is now the only brake on a first-run turn

`3c805f93..684b83da` is eight commits (#209–#216). Two files under `server/`
changed, both in `polar/sand/`, and both in one commit (#216):
`CAISRA_CLAUDE_CODE: "0"` is gone from the box's environment
(`box_hosts.py:126`) and with it the assertion in
`tests/sand/test_box_hosts.py:199` — a matched pair, consistent with the Claude
Code / OpenRouter router having been removed (F-128). Searched for orphan
readers: `grep -rn CAISRA_CLAUDE_CODE` over `server/`, `runner/`,
`desktop/source`, `desktop/tests` and `render.yaml` → no match, so nothing is
left reading a variable that is no longer set. #216 is a Caisra→Simeon rename
pass, so I also checked it against the safe-rename rule: `git diff
3c805f93..684b83da | grep -E '^[+-].*CLAIDOR_'` returns **nothing**, so no
`CLAIDOR_*` env key was added, removed or renamed.

**The `e2b` provider was touched and not filled.** The one-line change above is
the whole of it; `box_hosts.py`'s `e2b` host is still the stub, and nothing in
`polar/sand/` meters box time. Both salvage items from §12 are still open.

### A correction to §14

§14 ends "the key reaches OpenAI and #208 works through us unchanged." The
first half is what I measured and it stands. The second half was more than I
had measured, and #211 says why: **the `prompt_cache_key` from #208 never went
out at all.** The executor imported `conversationIdKey` from
`packages/chat-inference-proto/client.ts`, a look-alike symbol the loop never
sets, while the loop sets the one in `packages/agent/utils/request-id.ts`. I
checked that against the diff rather than the message: `git show 2fed1842`
moves the import from the first path to the second, in the executor and in the
test fixture, and adds two assertions pinning it there.

So at the moment I verified the pass-through, the app was sending no key for my
proxy to pass through. Nothing about the server changes — an unknown body key
still reaches OpenAI verbatim, which is exactly what makes #211's fix work
without a server deploy — but "#208 works" was a claim about a path I had only
checked one half of. The half I checked is the half I own.

### #215 moves the brake on an unattended first run to our side

#215 puts the first message and routines back on Grok Bot's 5,000-call budget;
the 40-call hidden budget now covers only reply nudges, post-sign-in wake-ups
and memory extraction. That is a deliberate product decision and not mine. What
it means for this server is that the app-side cap which would have stopped the
23 September incident (481 model calls in fifty minutes, $5.82) no longer
applies to a first-run turn, so the proxy's hourly brake is the remaining one.

Measured, not assumed, because the number matters: a credit is one input token
on the middle model at `CREDIT_USD_PER_MILLION_INPUT = 3.00`
(`pricing.py:38`), and `DESKTOP_HOURLY_CREDITS` is 200,000 (`config.py:201`).
So the brake is **$0.60 an hour per person**, on a sliding hour
(`credits_used_last_hour`), checked by `budget_refusal` on every model call in
`_proxy` — hidden turn or asked turn alike, since nothing in that path knows
which it is. The 23 September incident spent nearly ten hours' worth of that
allowance in fifty minutes, so the proxy would have refused it long before the
end. The backstop is real and it is much tighter than the monthly figure
suggests.

**What I ran**, at merge commit `490acb8a`: `pytest tests/desktop tests/maty
tests/sand` → **468 passed, 14 failed**, the same fourteen as the baseline (12
desktop, 2 maty); `alembic heads` → one head (`desktop_boxes_0918`);
`grep -c '"/api/proxy/box/'` → 10, first at 1450, catch-all at 1786;
`grep -c hourly_exhausted` → 1; `ruff check` → clean. The suite was actually
run this time, not inherited, because `server/` did change.

**What I did not run:** anything against a real E2B account, a real box, or CI.

**Addendum, 27 September 07:30.** `684b83da..2c503f5b` is three commits
(#217–#219): two chat-bubble colour changes and `npm run demo`. Nothing under
`server/` or `runner/`, no `CLAIDOR_` key touched, so the tested tree is
unchanged from `490acb8a` and the suite is inherited, not re-run.

One thing there was worth measuring, because someone will ask it later: **the
demo spends nothing on our proxy.** `desktop/demo/backend.ts` answers every
call from a scripted scenario, and `grep -rnE '\bfetch\(|https?\.request|
node-fetch|axios|XMLHttpRequest|net\.connect' desktop/demo/` returns nothing —
no outbound call of any kind. The two `https://` strings in that folder
(`gmailmcp.googleapis.com`, `mcp.notion.com`) are display data in a fake list
of connected MCP rows, never dialled, and the only `simeonlabs.com` occurrences
are a fake e-mail address. So a demo run bills no credits and reaches no route
of mine.

**Addendum, 28 September 06:00.** `806177a5..f7ecdd7d` is 23 commits, almost all
the simeonlabs.com website (238 files under `sites/`) plus the dashboard's logo
and a memory-sync test fix. **One file under `server/` changed**, and it is one
I own: `polar/config.py` (#223 `796b9d68`, #224 `189c0fa8`) repoints two
settings under its `# Discord` heading —

```
FAVICON_URL, THUMBNAIL_URL:
  raw.githubusercontent.com/polarsource/polar/<pinned sha>/…
→ raw.githubusercontent.com/Spaire-Tech/Claidor/main/clients/apps/web/public/apple-touch-icon.png
```

Checked rather than assumed, because a raw URL on a private repository answers
404 and the embed would silently lose its artwork: **the URL resolves, HTTP 200,
5750 bytes**, and after merging the file is in the tree at exactly 5750 bytes.
Who reads these two: `polar/webhook/slack.py:28` (`image_url`) and
`polar/integrations/discord/webhook.py:71,74` (`icon_url`, thumbnail `url`) —
Slack and Discord embed artwork. Nothing on the desktop path, no route of mine,
no auth or spend setting.

**One thing worth knowing rather than changing:** the old values pinned a commit
SHA; the new ones track `main`. So the icon follows whatever that path holds,
and a rename or delete of `apple-touch-icon.png` empties the embed icon with no
error anywhere. That is a deliberate-looking trade (the icon stays current
without a code change) and not mine to reverse; it is written down here so the
next person reading a blank Discord embed has somewhere to start.

**What I ran**, at merge `e7381b87`, actually run because `server/` changed:
`pytest tests/desktop tests/maty tests/sand` → **468 passed, 14 failed**, the
same fourteen; `alembic heads` → one head; ten `/api/proxy/box/*` paths, first
at 1450, catch-all at 1786; `hourly_exhausted` → 1; `ruff check` over
`polar/desktop/`, `polar/models/desktop.py`, `polar/config.py` and my migration
→ clean. And because `config.py` is the file that holds the numbers §14/§15
cite, I re-read them: `DESKTOP_ACCESS_TOKEN_TTL` 1 hour (188),
`DESKTOP_REFRESH_TOKEN_TTL` 30 days (189), `DESKTOP_REFRESH_GRACE` 5 min (194),
`DESKTOP_MONTHLY_CREDITS` 3,000,000 (196), `DESKTOP_HOURLY_CREDITS` 200,000
(201) — all unchanged, so the $0.60/hour brake and the box credential's 30-day
window still hold as written.

## 16. 28 September, 06:07: Vercel is rate-limited for the account, and the fix is in `clients/`

Two Vercel commit statuses went red on `615481d1` with
`Resource is limited - try again in 24 hours (more than 100, code:
"api-deployments-free-per-day")`. Not a fault in any code, not clearable by a
push, and it blocks preview deployments for everyone on the account for a day.
Commented once on #125 (`5864447766`); do not re-report it.

Measured, so the next person does not correct the wrong thing:

- This branch's diff against `main` touches **only `docs/` (3) and `server/`
  (12)** — no `clients/`, no `sites/`. Every Vercel build my pushes trigger is
  for code this branch never changes.
- `sites/simeonlabs.com/vercel.json` already guards itself with
  `"ignoreCommand": "git diff --quiet HEAD^ HEAD -- ."`.
- `clients/apps/web/vercel.json` has **no** `ignoreCommand` — `grep -c
  ignoreCommand clients/apps/web/vercel.json` → 0. The `claidor` and `simeon`
  projects are both rooted there, so every push to any branch costs two builds
  whatever it touched.
- Share: in 24 hours `main` took ~20 commits and merges (mostly the
  simeonlabs.com website) against **2 pushes from this branch** — roughly 6 of
  the >100 deployments are mine. The website work is the bulk; my pushes are a
  small real part.

**What must change, and where — not by me.** `clients/` is outside what I
touch, so this is written down rather than done: add an `ignoreCommand` to
`clients/apps/web/vercel.json` in the shape the sites project uses. The path
list needs deciding rather than copying, because the build is
`cd ../.. && turbo run build --filter=web` and so consumes more than
`clients/apps/web` (at least `clients/packages/*` and the root lockfile). Too
narrow an ignore skips a deploy that was needed, which is worse than a wasted
one — that call belongs to whoever owns `clients/`.

On my side: no separate push for a docs-only note when a merge push is due
anyway.

The two `Detect changes` failures on the same head are the known dead-runner
signature, verified again here rather than assumed: `runner_id: 0`, empty
`runner_name`, `created_at == started_at` (06:06:57), dead in 2–3 s, `Client`
and `Server`. Nothing re-run: a re-run cannot clear a daily quota.

**Correction to §16, same morning.** I wrote that the fix was an `ignoreCommand`
on `clients/apps/web/vercel.json`. On the next push `simeon-website` was
rate-limited too, **despite already having one**. That does not prove the
ignore step fails to help — once the account is over quota every deployment is
refused before the ignore command can run, so the observation cannot separate
the two cases — but it does mean I have **not** established that an ignored
build avoids counting against `api-deployments-free-per-day`. Vercel's
git-settings page does not say; I stopped looking rather than spend more on a
fix I do not own.

So the accurate claim is narrower than the one I first made: the missing
`ignoreCommand` certainly means those two projects *build* on every push
whatever changed, which is wasteful; whether that is what exhausted the daily
*deployment* count is unverified, and whoever picks it up should confirm
against Vercel's limits documentation before treating it as the remedy. The
PR comment (`5864447766`) carries the same correction, edited in place rather
than posted twice.

*(I first held this paragraph back from its own push, to avoid three more
refused deployment attempts. The repository's stop hook refuses an unpushed
commit — an ephemeral container makes that the right rule — so it went out on
its own after all. The batching preference yields to the hook, and the note
stands corrected rather than clever.)*

---

## §17 — `test_skill_registry` is red about a quarter of the time on `main`, and the cause is a gzip timestamp (28 September 2026, evening)

`main` moved `55d886ca` → `7bd7c208` (ten commits, the apps/connectors work).
Unlike the last several moves it **does** touch `server/`: `polar/desktop/apps.py`
(new, 480 lines), `polar/integrations/google/service.py`, and five added lines
each in `polar/desktop/endpoints.py` and `service.py`. So this round the suite
was measured, not inherited.

Merged as `b1fefcad`, no conflicts. The standing structural checks after the
merge: one Alembic head (`desktop_boxes_0918` — run with `alembic heads`, not
with the hand-rolled parser I tried first, which reported sixteen heads
including 2024 revisions and was simply wrong); ten `/api/proxy/box/*` routes
at 1451–1650, `main`'s new `apps_router` include at 1769, the
`/api/proxy/{path:path}` catch-all last at 1791, so nothing of mine is
shadowed and the apps routes (`/api/apps/*`, `/apps/*`) do not overlap it;
`hourly_exhausted` count still 1. Ruff on the ten files this branch touches
reports three findings and one unformatted file (`polar/config.py`) — **all
four are identical on a clean `origin/main` worktree**, checked file by file,
so they are `main`'s own.

### The failure, and the claim I had to withdraw

The merged tree ran `tests/desktop tests/maty tests/sand tests/integrations/google`
at **15 failed / 479 passed**. Fourteen are the known set (twelve desktop
proxy tests wanting provider keys, two maty). The fifteenth was new to me:

```
tests/sand/test_skill_registry.py::TestPublishToMyOwnAccount::
  test_a_publish_lands_in_the_listing_with_the_confirmable_sha
```

Clean `main` in the same scope came back **14 failed / 428 passed** — without
it. On that single pair of observations I wrote that the extra failure was
"associated with my branch". **That was wrong, and one run each way was never
enough to say it.**

What the assertion actually compares (`test_skill_registry.py:166`):

```python
assert stored["Body"].read() == plugin_tar_gz()
```

— the tarball fetched back from S3 against a **freshly built** one. `plugin_tar_gz()`
opens `tarfile.open(mode="w:gz")`. Every `TarInfo` it writes has the default
`mtime` of 0, so the tar stream is deterministic, but the **gzip wrapper** is
not: Python stamps the current time into the header's four-byte MTIME field.
Built two tarballs 1.1 s apart and diffed them byte by byte:

```
same length: True 262
differing byte offsets: [4]
gzip MTIME a: 53dbba6a   b: 54dbba6a
equal ignoring offsets 4-7: True
```

One byte, and it is the low byte of the timestamp. So the test fails whenever
the publish call and the assertion land either side of a second boundary —
which, with a `GetMe` round trip, a repository read and an S3 fetch between
them, is a real fraction of runs.

Measured rather than estimated: the single test run **25 times in a clean
`origin/main` worktree, with none of my code present — 7 failures**. About
28%. It is `main`'s, it is twelve hours old at most, and my branch's only
relationship to it is that adding 52 tests changed which runs happened to
straddle a second.

**Not fixed.** The fix is one line — give the gzip a fixed `mtime`, or compare
the decompressed tar rather than the compressed bytes — but this branch is
box-only and frozen pending the open decision, and this is not box. Same
disposition as the two maty failures in
`docs/product/maty-test-failures-measured.md`: written down, offered, not
landed. Say the word and it goes on its own branch.

**Worth saying plainly:** nothing would have caught this. The repository's own
workflows still get no runner, so no CI run has ever executed this test, and a
test that is red 28% of the time reads to whoever meets it as *their* change
having broken something. It read that way to me for about twenty minutes.

### What is still not run

Unchanged, and it is the whole of the risk in this branch: **nothing here has
ever contacted E2B, no sandbox has been started, no command has run in a box,
and CI has never executed a line of this diff.** The suite above ran against a
locally started PostgreSQL 16 and Redis with `moto_server` standing in for
Minio, on Python 3.14.0rc2 through a local uncommitted `sitecustomize.py`
shim, against the 3.14-final that `server/CLAUDE.md` requires — none of which
is in the diff, and none of which is how CI would run it.

---

## §18 — main built the cloud box's lifecycle and gave it no meter (29 September 2026)

`main` moved `7bd7c208` → `9650f49e`, nine commits, and this one lands in
`server/` harder than any move since this branch opened: eleven files under
`polar/`, a new migration, four test files. Merged as `3a0137e8`, no conflicts.

### The two heads, third time

`main`'s new `sand_box_sleep_0928` declares `down_revision =
"sand_plugins_0925"` — the parent this branch's `desktop_boxes_0918` was given
on 25 September. So `alembic heads` printed **two heads**, and `upgrade head`
refuses to run with two. Re-pointed onto `sand_box_sleep_0928` (`62f33a83`);
the migration's own docstring now records all three re-pointings.

Measured, not assumed: the whole chain applied forward to a real PostgreSQL 16
through `main`'s migration into this one, `desktop_boxes` created with its
partial unique index `ix_desktop_boxes_live_scope` on `(user_id, scope_key)
WHERE deleted_at IS NULL` — the index that makes `POST /box/sandboxes` mean
*ensure* — then `downgrade -1` and `to_regclass('desktop_boxes')` came back
empty.

**Nothing warns about this and nothing will.** The suite builds its schema from
`Model.metadata.create_all`, so all 517 tests pass with two heads, and
`Server: Migration Check` has never been given a runner. `alembic heads` by
hand after every merge of `main` is the only thing that catches it.

### Models moved under this branch again

`main` put the agent on GPT-6 Sol (primary) and GPT-6 Luna (cheap) and added a
new role, `ModelRole.retired`, for GPT-5.6 Terra and Luna: a model that keeps a
role so the proxy still answers a request naming it, but is never offered. That
is **consistent with** this branch's `_proxy` role gate rather than in conflict
with it — the gate refuses `role is None`, and a retired model has a role.
Read off the merged tree rather than the diff:

```
primary:  ['gpt-6-sol']          cheap:    ['gpt-6-luna']
retired:  ['gpt-5.6-terra', 'gpt-5.6-luna']
roleless: ['claude-opus-5', 'claude-haiku-4-5-20251001', 'gpt-6-astra', 'gemini-2.5-pro']
caisra-box in MODELS: False
```

The box's own row is built on the fly by `box_model()` and is not in `MODELS`,
so the role gate refuses `caisra-box` like any unknown id and the box is
metered only through this branch's own settlement path. That is the behaviour
it always had; it is worth writing down because the gate is new-ish and the box
row is roleless by design.

### The finding that bears on the open decision

`main`'s cloud box grew a real lifecycle this move: hibernate-when-idle on a
cron every minute, wake on `notify.publish` (a routine's fire, a listener
event, a shared room), a size and a capacity, key-only SSH to the host, a CA
that Python's strict TLS accepts, the host bundle uploaded where Docker can
reach it, and `last_active_at` / `hibernated_at` on `sand_boxes`.

**It does not bill anybody.** Searched, so this is not an impression:

```
grep -rnE "credits_for|desktop_usage|DesktopUsage|record_usage|billed_through" polar/sand/
  → no matches
```

So the repository now holds the cloud box's *lifecycle* on `main`, with no
meter, and the box *meter* on this branch, attached to the wrong substrate
(E2B) and the wrong wire (ten REST routes where the app speaks
`EnsureSandBox` / `RecreateSandBox` / `ForceRecreateSandBox` over Connect RPC).

That sharpens the open question and — I should say plainly — it argues the
opposite of what I recommended on 20 September. I said then that the box half's
route layer was the rewrite and the metering the salvage. The metering is now
the part **nobody else has built**, and `main`'s box is the one being taken to
production. Hibernation makes the awake-seconds model cheaper rather than
redundant: a box that sleeps has fewer awake seconds to charge for, and
`last_active_at` / `hibernated_at` are exactly the anchors `_settle` wants in
place of `running_since` / `billed_through`.

What would port, unchanged in shape: settlement in slices on every call that
touches a box, the `BOX_MAX_SECONDS_PER_SETTLEMENT` clock guard (25 hours),
never-zero for a box that was actually awake, and one `desktop_usage` row per
slice under a roleless model id. What would not: the ten handlers, the E2B
client, the `desktop_boxes` table.

**Not started.** Wiring a meter into `polar/sand/box_service.py` is a real
change to someone else's live module and it is not mine to begin unasked.

### One precision about this branch's own code, found on the way

`grep -rn "credits_for_box" --include=*.py .` shows **no production caller**:
`_settle` charges through `desktop.record_usage(model=box_model(...),
usage=Usage(input_tokens=charged))`, and `credits_for_box` is referenced only
by `tests/desktop/test_box_pricing.py` and by `test_boxes.py:608`, where it is
the oracle the production path is checked against. That is deliberate and its
docstring says so ("one piece of arithmetic cannot disagree with itself" — it
routes through the same `credits_for`), so the test checks the wiring rather
than re-deriving the arithmetic. Worth stating because "the metering model" has
been described in this PR as though `credits_for_box` were on the hot path. It
is not; `box_model`'s `cost_multiplier` is.

### What ran, and what did not

`pytest tests/desktop tests/maty tests/sand tests/integrations/google` on the
merged tree: **14 failed / 503 passed** (517 collected, up from 494 —
`main` brought `test_box_sleep.py`). The fourteen are the known set; the
`skill_registry` gzip flake of §17 did not trip this run, which is what a 28%
flake does.

Ruff on the ten files this branch touches: 3 findings and `polar/config.py`
unformatted. `main`'s own copies of the same files, extracted and linted with
the same config, carry **5** findings and the same unformatted `config.py` —
the three of mine plus `polar/config.py:1` and `polar/models/desktop.py:28`,
both of which this branch's edits happen to fix. So every finding on my touched
files is `main`'s, and this branch adds none.

Unchanged, and still the whole of the risk here: **nothing has ever contacted
E2B, no sandbox has been started, no command has run in a box, and CI has never
executed a line of this diff.**

---

## §19 — §17's flake is fixed on `main`, by someone who found it independently (29 September 2026, morning)

`main` moved `9650f49e` → `2e8672f5`, eight commits, all cloud box. Merged as
the head below, no conflicts, **no new migration** — so `alembic heads` printed
one without anything to re-point, the first merge in four that did not collide.

**§17 is closed, and not by me.** `main`'s `9eaec6d8` carries the same
diagnosis and the same fix I wrote up and offered:

```python
-    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
+    with gzip.GzipFile(fileobj=buffer, mode="wb", mtime=0) as zipped:
+        with tarfile.open(fileobj=zipped, mode="w") as archive:
```

with the comment "gzip writes the current second into its header, so two builds
that straddle a second differ … A fixed mtime makes the bytes deterministic."
Arrived at independently — I never pushed my fix, only the measurement in §17.
One difference worth keeping straight rather than smoothing over: their comment
says the flake was "about 1 run in 10", and I measured **7 failures in 25** on a
clean `main` worktree. Both are estimates of the same thing from different
sample sizes and neither is worth re-running; mine is the one that was counted.

So the 15th failure of §18 will not come back, and the expected result for this
scope is the known fourteen and nothing else.

**One change read because it sits under my routes, and does not touch them.**
`polar/auth/middlewares.py` now returns an anonymous subject for
`/sand-box/{box_id}/p/{port}` and everything under it, because the cloud box's
proxy forwards the app's request with the box gateway's own bearer, which
belongs to no person, and reading it answered every proxied call with an OAuth2
401 before the proxy ran. The regex requires a 36-character UUID and a numeric
port, the proxy checks the network token and the gateway checks the bearer.
It is `main`'s, it is deliberate, and it has a test
(`tests/sand/test_box_proxy_auth.py`). **It does not reach this branch's
routes**: mine are `/api/proxy/box/*` on the desktop router, a different prefix
entirely.

Also on `main`: the cloud box's image is now pinned by digest to the 16
September build, because the 28 September build's supervisor starts
`/opt/sand/sand-host/host-main.cjs` instead of `/home/box/sand-host/host-main.cjs`
and so runs the image's own host whatever is mounted over it. Not mine, recorded
because it is the kind of thing that explains a later "the box ignores our
bundle" report.

### Measured this round

`pytest tests/desktop tests/maty tests/sand tests/integrations/google`:
**14 failed / 509 passed**, 523 collected (up from 517). The fourteen are the
known set — twelve `test_endpoints.py` proxy tests wanting provider keys, two in
`tests/maty/test_service.py`.

Structural, after the merge: ten `/api/proxy/box/*` routes at 1451, the
`/api/proxy/{path:path}` catch-all last at 1791, `hourly_exhausted` once, no
duplicate top-level names in `pricing.py` / `endpoints.py` / `boxes.py`, the box
pricing symbols all present, one Alembic head.

Ruff: **both trees now format clean** — `polar/config.py` had been the one
unformatted file on either side for days, and `main`'s own edit to it this round
fixed that. Findings: mine 3, `main`'s own copies of the same files 5, mine
still a strict subset (`endpoints.py` I001, `models/__init__.py` I001 +
RUF022; `main` also carries `config.py:1` and `models/desktop.py:28`).

Unchanged: **nothing here has ever contacted E2B, no sandbox has been started,
no command has run in a box, and CI has never executed a line of this diff.**
The four things offered in §18 and in comment `5882313175` — the meter into
`main`'s `box_service`, the E2B salvage, the #200 stale proxy tests, the
skill_registry fix (now moot) — remain offered and unstarted.

---

## §20 — the cloud box is now every person's computer, and it still bills nobody (29 September 2026, midday)

`main` moved `2e8672f5` → `822d3850`, eight commits, cloud box again. Merged,
no conflicts, **no new migration**, so one Alembic head with nothing to
re-point — two merges running.

### The fact that changes §18 from architecture to urgency

`195f61ae` sets `DEFAULT_SAND_BOX_RUNTIME = "remote"` in
`desktop/source/shared/box-runtime.ts`. Read rather than inferred from the
title: the Docker box is now an internal test path selected only by
`SAND_BOX_RUNTIME=local-docker`, a `"local-docker"` previously saved in
settings is deliberately **not** read, `setBoxRuntime` refuses to switch, and
the Settings switch is removed from the window patch. So every person's
computer is the cloud box.

And §18's finding still holds — re-run on this merged tree rather than carried
forward on trust:

```
grep -rnE "credits_for|desktop_usage|DesktopUsage|record_usage|billed_through" polar/sand/
  → no matches
```

`main` spent this move making that box fleet-ready — one box per person across
several servers with capacity accounting (`afb1dede`), the host bundle
published in Grok Bot's layout and followed live (`3f922dbf`), the proxy no
longer holding a database connection while it streams (`86e6224e`; a few dozen
waiting streams emptied the pool), and the box migration stream moved out of
one worker's memory into Redis so the API can run several workers
(`b3cd94ef`). That last commit's word "migration" is the box's
`WatchSandBoxMigration` stream, **not** Alembic — a name collision worth not
tripping on.

None of that adds a meter. The cloud computer is now the default for everyone,
it sleeps when idle, it has a size and a capacity, and nothing charges for it.
That is the single most decision-relevant thing in this note, and it is
someone else's module to change: **not started**, offered in §18 and in PR
comment `5882313175`, which has been edited to carry this fact.

### Measured this round

`pytest tests/desktop tests/maty tests/sand tests/integrations/google`:
**14 failed / 528 passed / 1 skipped**. The fourteen are the known set. The
skip is new and was chased rather than waved through: `main`'s
`tests/sand/test_box_fleet_docker.py:97`, "set SIMEON_E2E_DOCKER_HOSTS to run
against real engines" — a deliberate end-to-end gate, not a silent loss.

`server/tests/fixtures/base.py` changed, which is the shared fixture this
branch's tests use too; the addition is a `dependency_overrides` entry for
`polar.sand.box_proxy.lookup_sessions` only, so it does not reach them.

Structural after the merge: ten `/api/proxy/box/*` routes at 1451, catch-all
last at 1791, `hourly_exhausted` once, no duplicate top-level names, box
pricing symbols present, one Alembic head. Ruff: mine 3 findings, `main`'s own
copies of the same files 5, mine a strict subset, both trees format clean.

Unchanged: **nothing here has ever contacted E2B, no sandbox has been started,
no command has run in a box, and CI has never executed a line of this diff.**

---

## §21 — the server package is `simeon` now, and this branch moved with it (1 October 2026)

`main` moved `822d3850` → `8cc44299`: **56 commits**, the largest move since this
PR opened, after thirty-six hours of quiet. Among them `ebd0d418`, *"Rename the
server package from polar to simeon"*. Every path named in §1–§20 above has
changed; those sections are the record of what was measured, not a current map.

### What the rename actually did

- `server/simeon/` holds the code. `server/polar/` is **five files** — a
  deliberate shim whose own docstring says why: Render keeps each service's
  start command in its own settings, so `uvicorn polar.app:app` and
  `dramatiq … polar.worker.run` would stop starting after the rename; the shim
  forwards them and goes once every service on Render starts `simeon.*`.
- **`server/polar/desktop/` does not exist on `main`** — the home of every line
  of this branch's code.
- The env contract was migrated rather than broken, which is what CLAUDE.md's
  safe-rename rule demanded: `SIMEON_` is the prefix, `CLAIDOR_` is read as a
  legacy fallback, first match wins (`LEGACY_ENV_PREFIX`, and an explicit
  `AliasChoices` where a name needed one). So nothing on Render breaks on the
  old keys. Checked in `simeon/config.py`, not assumed.

### The re-fit, and the one conflict that would have been silently wrong

git carried most renames across by itself (`endpoints.py`, `pricing.py`,
`models/__init__.py` auto-merged into `simeon/`, and it moved `boxes.py` to the
right path and labelled it a *file location* conflict). Four content conflicts
needed deciding; one of them mattered more than the others:

**`simeon/models/desktop.py`.** Both sides added a new class at the same place —
this branch's `DesktopBoxState` + `DesktopBox`, main's `DesktopVoiceCall` — and
git split them into **two** conflict regions either side of a `user_id` block
both classes share. Resolving region-by-region, mine-then-theirs, would have
produced two classes with each other's fields. Rebuilt instead from main's file
whole plus this branch's two classes whole, adding the three imports main's copy
lacks (`StrEnum`, `Index`, `text`). All seven classes present afterwards.

The others: `config.py` kept the eight E2B settings with their paths repointed;
`repository.py` restored `RepositorySoftDeletionMixin`, which main's import had
dropped and this branch's repository subclasses — checked it is still exported
from `simeon/kit/repository/__init__.py`, which is a **package** now, not a
module, so "the file does not exist" would have been the wrong conclusion;
`uv.lock` had one conflict whose main side was *empty*, because the project's own
entry sorts under `simeon` rather than `polar` — dropped this branch's block and
ran `uv lock --offline`, which put `e2b` back into main's entry (247 packages).

### The migration collided for the fourth time

`main`'s `desktop_voice_calls_0930` declares `down_revision =
"sand_box_sleep_0928"` — the parent this branch's migration was given on 29
September. `alembic heads` printed two. Re-pointed onto main's tip; the
docstring now records all four re-pointings and the one cause.

Measured, not carried forward: the chain applied to a real PostgreSQL 16 through
main's voice-calls migration into this one, `desktop_boxes` created with
`ix_desktop_boxes_live_scope` on `(user_id, scope_key) WHERE deleted_at IS
NULL`, `downgrade -1`, `to_regclass('desktop_boxes')` empty.

### Two local things the rename broke, worth writing down for the next round

The container's test setup is keyed to the old names and silently stops working:

- **The Postgres role.** `POSTGRES_USER`/`PWD`/`DATABASE` now default to
  `simeon`, not `claidor`. `CREATE ROLE simeon LOGIN SUPERUSER PASSWORD
  'simeon'` and `CREATE DATABASE simeon OWNER simeon`.
- **The dev JWKS.** `CURRENT_JWK_KID` is `simeon_dev`; a `.jwks.json` holding
  `claidor_dev` makes every test fail at import with `ValueError: Key not
  found`, from `simeon/oauth2/constants.py` — nothing about the key in the
  message. `python -m simeon.kit.jwk simeon_dev > ./.jwks.json`.

### Measured after the re-fit

`pytest tests/desktop tests/maty tests/sand tests/integrations/google`:
**14 failed / 559 passed / 1 skipped** (574 collected). The fourteen are the
known set; the skip is main's Docker end-to-end gate. This branch's own tests
run alone: **52 passed**. Ten `/api/proxy/box/*` routes at 1469, catch-all last
at 1814, `hourly_exhausted` once, no duplicate top-level names. Ruff: **one**
finding on my files (`models/__init__.py` RUF022), against **five** on main's
own copies of the same files including that one — still a strict subset, and the
re-fit incidentally sorted three import blocks main leaves unsorted. Both trees
format clean.

### What this means for the PR, plainly

This is the **second** time the ground under #125 has moved wholesale — the 19
September re-founding of `desktop/`, and now the package rename — while the
decision it waits on has gone unanswered for twelve days. The box half is still
E2B on ten REST routes; main's cloud box is still every person's computer and
still meters nothing (§20, re-checked there). The re-fit was worth doing because
a branch pointing at a deleted package is not a branch, but it is maintenance on
a question nobody has answered, and that is worth saying rather than quietly
repeating.

Unchanged: **nothing here has ever contacted E2B, no sandbox has been started,
no command has run in a box, and CI has never executed a line of this diff.**

---

## §22 — main added a name check in CI; it has never run, and this branch failed it (1 October 2026, evening)

A check named **`check`**, from a workflow named **`Names`**, appeared on this
branch's head and failed. I had not seen it before, so I read the job instead of
assuming it was the dead runner again — and it *is* the dead runner (`runner_id:
0`, empty `runner_name`, `created_at == started_at` at 18:17:03, dead in 2 s).
So CI has told nobody anything, as usual.

But the check itself is real, it is `main`'s standard since the rename, and
**this branch failed it with 80 findings**: `.github/workflows/names.yml` runs
`python3 scripts/check_names.py --summary`, which fails when an earlier product
name appears anywhere outside `scripts/kept_names.json`.

Fifteen were in `server/simeon/`. Checked each against `kept_names.json` rather
than assuming an exemption covered it — **none did**. All fifteen are fixed
(`9296af4d`); `server/` now returns clean.

### Two of them were data, not prose, and the reason they are safe to rename is the one this PR keeps reporting

- `"claidor_user"` / `"claidor_scope"` are **E2B sandbox metadata keys** — a
  contract with a service we do not build, which is normally exactly what
  `kept_names.json` protects. They are safe to rename only because **no sandbox
  has ever been created**, so none carries them. Now `simeon_user` /
  `simeon_scope`.
- `BOX_MODEL_ID` is **written into `desktop_usage.model`**. Renaming a stored
  value normally orphans history. Safe here only because **no box has ever been
  metered**, so there is no history. Now `simeon-box`. Nothing asserts the
  literal; the tests use the symbol, and 52 of them still pass.

If either of those had ever run, the right answer would have been a
`kept_names.json` rule, not a rename.

### Three were stale maps, which matters more than the naming rule

`boxes.py` and `endpoints.py` carried comments citing
`desktop/src/main/libs/openclawTokenProxy.ts` and
`openclaw-extensions/box/brokerClient.ts` — files deleted with the 18 September
re-founding of `desktop/`. A comment pointing at a file that does not exist is
worse than one using an old name, so those now say what is true: the client
these ten routes were shaped against is gone, the app asks for a box over
Connect RPC, and whether this half lands is still open.

### The 65 left are in these three notes, and I have not touched them

56 in this file, 6 in `maty-test-failures-measured.md`, 3 in
`images-server-route.md` — every one a path that **was correct when it was
measured** (`server/polar/desktop/capabilities.py`, `polar/maty/repository.py:46`,
and §21's own account of the rename, which has to name both sides to mean
anything).

Rewriting them would make the record less true, and `kept_names.json`'s own
vocabulary has the right shape for this already: *"record = a statement of
origin that must name it"*, which is what it grants `docs/kept-names.md` and
`desktop/NOTICE.md`.

**So the fix is a one-rule addition, and I have not made it**, because
`scripts/kept_names.json` is `main`'s enforcement file landed the same day and
granting myself an exemption in someone else's check is not mine to do. The rule
would be:

```json
{ "kind": "record",
  "names": ["polar", "claidor", "caisra"],
  "paths": ["docs/product/box-server-routes.md",
            "docs/product/images-server-route.md",
            "docs/product/maty-test-failures-measured.md"],
  "reason": "Measurements taken before the renames; the paths named are the ones that existed when they were read." }
```

Nothing is blocked today — the workflow has never had a runner. Whoever owns the
name check should decide between that rule and rewriting the notes; I would
rather be told than assume.

### A correction to the dead-runner signature itself

On the next head (`16e2b790`) the `Names` job took **38 seconds**, not the 2–4 s
every dead job on this PR has taken. Long enough to have checked out, installed
Python and run the script — so I checked instead of assuming, and it had still
never run: `runner_id: 0`, empty `runner_name`, and `GET .../logs` answers
**404**, no log ever written.

So **duration is not part of the signature** and I should stop treating it as
though it were. The three fields that mean it are `runner_id: 0`, the empty
`runner_name`, and the 404 on the logs. `started_at == created_at` and a
two-second death are common but not required; a job can sit for half a minute
and still never be given a machine.

Unchanged: **nothing here has ever contacted E2B, no sandbox has been started,
no command has run in a box, and CI has never executed a line of this diff** —
which is, this time, also what made two of the renames safe.

---

## §23 — 2 October: main added flight search; the merge was clean, and the box is still unmetered

Main moved 28 commits, `8cc44299` → `80f36e1b`: 47 files under `desktop/`, six
under `server/`, one under `docs/`. **This merge had no conflicts and no
Alembic collision** — the first of the four where I had to re-point nothing.

### What main put in `server/`

`git diff --name-status 8cc44299..origin/main -- server/ runner/` — six files,
nothing under `runner/`:

- **`simeon/desktop/flights.py`, new, 1028 lines** — flight search through
  Duffel, one route: `@router.post("/api/flights/search")`.
- `simeon/desktop/endpoints.py` — **two lines**: the `flights_router` import and
  its `include_router`, both in the include block around 1384.
- `simeon/config.py` — three settings after `ELEVENLABS_*`:
  `DUFFEL_ACCESS_TOKEN`, `DUFFEL_BASE_URL`, `FLIGHT_SEARCHES_PER_HOUR = 30`.
- `simeon/desktop/apps.py` (+80/-23), and the tests
  `tests/desktop/test_flights.py` (new, 534 lines) and `tests/desktop/test_apps.py`.

### Why none of it touched my routes, checked rather than assumed

The flights route is `/api/flights/search` — **outside `/api/proxy/`**, so it
can neither shadow my ten `/api/proxy/box/*` routes nor be swallowed by
`/api/proxy/{path:path}`. The two `endpoints.py` lines land at the include block
near 1384, far above my region. Re-measured after the merge: the ten box routes
declared 1470–1669, the catch-all at **1816** — still ten above it.

`b09c2063` ("make the box write files") reads like mine and is not: all ten files
are under `desktop/` — the Mac app's `box-exec-daemon`, which was answering
`BOX_EXEC_UNSUPPORTED` to file writes. Nothing server-side.

### Measured on the merged tree

| Check | Result |
|---|---|
| `alembic heads` | **one**: `desktop_boxes_0918` (main added no migration) |
| Scoped suite | **14 failed / 576 passed / 1 skipped**, 591 collected |
| The fourteen | the same twelve `test_endpoints.py` proxy + two `tests/maty/test_service.py` |
| Main's new tests | `test_flights.py` + `test_apps.py` → **27 passed** |
| My own two files | **52 passed** |
| `hourly_exhausted` in `endpoints.py` | 1 |
| AST duplicate top-level names | none in `pricing/endpoints/boxes/models.desktop` |
| `ruff check` / `format` on my files | **0 findings**, 4 files already formatted |
| Migration up/down on a scratch db | chain ran to head, `ix_desktop_boxes_live_scope` present, `downgrade -1`, `to_regclass('desktop_boxes')` → null |

Passed rose 559 → 576. The +17 is main's own new tests, not mine; I chased the
changed count rather than assuming, and ran those two files on their own.

**The one ruff overlap is not mine.** `simeon/models/__init__.py` is in my diff
and does carry `RUF022 __all__ is not sorted` — but main's own copy, pulled with
`git show origin/main:server/simeon/models/__init__.py` and linted against the
same `pyproject.toml`, carries the identical finding at line 137 where mine is at
139. The two lines of difference are my own `"DesktopBox"` and `"DesktopBoxState"`,
both in correct alphabetical position. Across the whole tree ruff reports 53
errors and 5 files to reformat; **none of the five, and none of the other 52, is
among my twelve changed files.**

### The `Names` check, and the count going up

`python3 scripts/check_names.py --summary` exits **1** with **71 findings**. All
71 are in my three working notes — 62 in this file, 6 in
`maty-test-failures-measured.md`, 3 in `images-server-route.md`. **Zero in
`server/`, zero in `runner/`, zero anywhere else.**

The count rose 65 → 71 because §21 and §22 quote `polar` in order to *describe*
the rename — and **72 once this section is in the file**, since the paragraph
above quotes it once more. Writing the history of an earlier name is what trips
the check, so the number climbs every time I record a rename honestly. The fix is
still the one `record` rule in `scripts/kept_names.json` set out in §22, and it
is still main's enforcement file and still not mine to edit.

### Main capped a paid upstream per person per hour — and it is a cap, not a meter

Worth recording precisely, because it is close to what I have been proposing and
is not the same thing. `flights.py:859` does a Redis `INCR` on a per-person key
with a 3600-second expiry and refuses past `FLIGHT_SEARCHES_PER_HOUR`, with the
reason given in the file's own docstring: *"past Duffel's free allowance each one
is billed, and a looping agent must not run that up."*

So main now accepts that a billed upstream needs a per-person hourly ceiling. But
it is a **rate cap with no usage row** — no `record_usage`, no credits charged. It
supports the "cap" half of what the box needs and says nothing about the "bill"
half.

And the search that matters is unchanged. `grep -rnE
"credits_for|desktop_usage|DesktopUsage|record_usage|billed_through" simeon/sand/`
→ **no matches**, re-run on this tree rather than carried forward. Five weeks on,
every person's cloud computer is still metered by nothing at all, and this round
main spent its server work on flight search. Comment `5882313175` stands as
written.

Unchanged, and still the honest headline: **nothing here has ever contacted E2B,
no sandbox has been started, no command has run in a box, and CI has never
executed a line of this diff.**

### CI on `2175c6e9`: still never run — and the `Names` check is the job called `check`

Nine check runs on this head. Three report `failure`, which looked like a change
from every previous round, so I read the jobs rather than the conclusions:

| Job | `runner_id` | `runner_name` | `GET .../logs` |
|---|---|---|---|
| `Detect changes` (workflow `Server`, 110967765973) | **0** | empty | **404** |
| `check` (workflow **`Names`**, 110967765313) | **0** | empty | **404** |

Both carry the full dead-runner signature from the §22 correction, so neither ran.
The `failure` conclusions are not a result: `Detect changes` is the gate job, and
because it was never given a machine, `Server: Tests 🐍`, `Server: Linters 📝`,
`Server: Migration Check 📚`, `Server: Tinybird Schema 🐦` and `Client: Tests 🎨`
all report **`skipped`**. `Vercel Preview Comments` is the only `success`.

**A correction to carry forward.** I had been looking for a check named `Names`
and §22 reports it by that name. There is no check run called `Names` — the
workflow is `Names` and its job is called **`check`**. That is the 38-second job
in §22, and anyone scanning the check list for the word "Names" will conclude the
check is absent when it is sitting there under a generic name. Match on
`workflow_name`, not the check-run name.

Consequence for the 72 findings: `Server: Migration Check 📚` skipped again, so
`alembic heads` by hand remains the only thing that has ever caught a collision
here, and the `Names` check has still never evaluated this branch — the 72
findings remain theoretical rather than blocking. Per the standing rule the
dead runner gets no further re-run and no further comment; the one re-run was
spent and stood down on earlier.
