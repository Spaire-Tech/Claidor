# Images: the server route, built

18 September 2026. The Server agent's working note. Measured, not recalled.

`docs/product/images-state.md` ends with "it has not been started." It is
started, and this says what was built, what was run, what was **not** run, and
the one thing left in `desktop/`, which I do not own and did not touch.

---

## 1. The decision, and why it is not the one that was recommended

`images-state.md` offered two shapes and recommended the first:

1. a synchronous `/api/proxy/v1/images/generations`, OpenAI's own shape,
   mirroring the speech route — then change the app's media handler;
2. implement the task API the app already expects — more server code, but no
   app change.

**I built the second.** Three readings of `desktop/src/main/main.ts` moved the
trade-off, and all three are checkable:

**The task shape does not require a task.** `main.ts:6679` registers background
polling only when the status that came back is *not* terminal:

```ts
if (status !== 'succeeded' && status !== 'failed' && status !== 'cancelled') {
```

A `generate` that answers `status: "succeeded"` with the pictures already in it
goes straight to `persistGeneratedImages` at `main.ts:6648` and nothing is ever
polled. So the polling machinery that made option 2 look expensive — a task
table, a job, a lease — is not needed to satisfy a caller that expects it.
Option 2 costs three small synchronous routes.

**Nothing needs hosting.** `desktop/src/main/libs/mediaAssetPersistence.ts:296`
decodes a base64 `data:` URL inline and only reaches for the network on an
`http` one; it then sniffs the bytes for the real format. So OpenAI's
`b64_json` goes back as a data URL and is written into the session's folder
without Claidor storing a byte of it, and without an S3 bucket, a presign, or a
lifecycle rule.

**This is not a wire we otherwise avoid; it is the one we already speak.** The
split on this server is by *caller*, not by taste. `/api/proxy/v1/*` is the
**engine's** door and talks a provider's own language. Everything under
`/api/*` is the **app's** door and talks the app's `{code, data}` envelope —
which is why `_ok` and `_fail` sit at the top of `endpoints.py` and why
`/api/models/available`, `/api/client-banners/*`, memory and the skill store all
look the way they do. Image generation is an app call
(`handleMediaGenerationCallback`), not an engine call. Option 1 would have put
an app-called route on the engine's door and then required the app to learn a
second convention.

**What my choice costs, said plainly.** We now serve a `taskId` that is not a
task, and a `tasks/{id}` route that can only answer "there was nothing to poll".
The day an image model is genuinely asynchronous, that route grows a store.
I think that is the right debt: it is one honest sentence, and it is paid only
if that day comes.

## 2. What was built

All of it in `server/polar/desktop/`. No file outside `server/` was changed.

| Route | Answers |
|---|---|
| `GET /desktop/api/media/images/models` | one model; `[]` when no OpenAI key |
| `POST /desktop/api/media/images/generate` | `status: "succeeded"` with data URLs |
| `GET /desktop/api/media/images/tasks/{id}` | a sentence saying there is no task |
| `GET /desktop/api/media/videos/models` | `[]`, so "no" is legible |

Plus a pricing entry in `pricing.py`: `IMAGE_MODEL`, `IMAGE_USD_PER_IMAGE`,
`credits_for_image`. Metered through `record_usage` and `credits_for`, on the
same account and into the same table as every other call.

Three decisions inside it worth knowing:

- **The model asked for is ignored.** There is one model, it is Claidor's, and a
  caller naming another gets a picture plus an explanation in
  `modelSelectionReason` — a field the app already prints (`main.ts:6642`) —
  rather than a refusal it has to recover from. The founder, 16 September: *"my
  users should never put a key. everything happens under the hood. not a
  setting."*
- **Quota answers `40204`, not `QUOTA_EXHAUSTED_CODE` (40200).** The app's media
  handler knows `40203` and `40204` on this path and nothing else
  (`main.ts:6569`, `main.ts:6577`). A `40200` here falls through to its generic
  branch and the person reads "Media generation request failed" instead of being
  told their month ran out. The code the reader understands wins.
- **Drawing *from* a picture is refused by name.** That is `/v1/images/edits`, a
  multipart endpoint with its own price, and it is not served. Refused rather
  than quietly ignored, because an ignored reference image makes a picture that
  is wrong in a way the agent cannot see.

## 3. What I ran, and what I did not

**Ran, and passed:**

- `ruff format --check .` and `ruff check .` across `server/`. 21 errors, none in
  any file I touched — **identical 21 with my work stashed**, so pre-existing.
- `mypy polar/desktop/` — **0 errors in `polar/desktop/`**. The 27 it reports are
  all in other modules and are pre-existing.
- `pytest --noconftest tests/desktop/test_image_pricing.py test_speech_pricing.py
  test_pricing.py` → **50 passed**.
- `pytest tests/desktop/test_endpoints.py -k Image` → **20 passed**.
- Whole file: **70 passed, 6 failed**. The same 6 fail with my work stashed, so
  they are pre-existing in this container (no provider keys are configured, so
  `offered_models()` is empty and the catalogue tests have nothing to find).

**Did NOT run, and nobody should read this as verified:**

- **No call has ever been made to OpenAI's image API from this code.** Every
  test mocks the provider with `respx`. This container holds no OpenAI key —
  `GET https://api.openai.com/v1/models` answers **401**, checked. So the request
  body I send is written from the API's documented shape, not from a successful
  round trip.
- **The model id `gpt-image-1` is not verified.** It was not read off a live
  model list, for the same reason. It is one constant.
- **The three prices in `IMAGE_USD_PER_IMAGE` were not read off a price page.**
  They carry the same ⚠️ as `SPEECH_USD_PER_MILLION_CHARACTERS`, which is still
  the only other unchecked number in that file. A test bounds them so a fat
  finger cannot make one call cost dollars, but a bound is not a price. **Nobody
  should be charged against them until somebody has looked.**
- **The app has never called these routes.** Not once, in any form. The whole
  end-to-end path is unproven.
- **The test suite could not be run the way CI runs it.** `server/CLAUDE.md`
  requires Python 3.14 *final*; this container has **3.14.0rc2** and `uv python
  list --all-versions` offers no final build. Pydantic 2.12 dies on an rc. To
  execute the conftest suite at all I ran it under a local `sitecustomize.py`
  that drops the one `prefer_fwd_module` keyword, plus a local Postgres, a local
  Redis, and **moto** standing in for Minio. **None of that is committed and none
  of it is in the diff.** It changes how a forward reference resolves its module,
  so those 20 passes are real but were not obtained on a clean interpreter. CI
  reads the version from `pyproject.toml` and gets a real release, so CI is the
  first honest run — except that, per `CLAUDE.md`, **GitHub Actions currently
  dispatches no jobs in this repository**, so CI will confirm nothing either.

## 4. What `desktop/` must change

I do not own `desktop/` and changed nothing in it. Two items, one blocking and
one a defect this change would expose.

### 4.1 Blocking, and already written — the gate must reach `main`

**`images-state.md` says the app-side gate "has already been removed". On `main`
it has not.** I checked every ref. The removal lives only on
`origin/claude/caisra-mac-app-ouliez`.

- **File:** `desktop/src/main/mediaGenerationPolicy.ts`, `resolveMediaGenerationGate`
- **Current behaviour on `main` (line 47):** with no `selection`, returns
  `allowed: false` with *"No media generation model has been selected by the
  user. Do not retry."* Nothing under `renderer/design/` ever sets a selection,
  so it never opens.
- **Required behaviour:** return `allowed: true` — which is exactly what the
  mac-app branch already does.
- **Action:** no new work. **Merge that branch.** Until it lands, my routes are
  live and unreachable.

I also checked the other thing in that path, `preflightLobsterImageGeneration`
(`desktop/src/main/skins/skinMediaBridge.ts:102`): it returns `null` unless the
session is in a SkinPack workflow *and* a selection exists, so it does **not**
block ordinary image generation. It is not a second gate.

### 4.2 A real defect my change exposes — a data URL can land in the transcript

This one is new work and it matters.

- **File:** `desktop/src/main/main.ts`, `handleMediaGenerationCallback`
- **Lines:** `6657` (the image branch, when persistence saved nothing) and
  `6674` (the generic branch, reached when `sessionId` is `null`). `6670` is
  the same shape on the video path and will matter the day video is served.
- **Current behaviour:** when `persistGeneratedImages` saves nothing — the
  session has no `cwd` (`main.ts:7046` warns and returns `null`), or `sessionId`
  is `null` so the branch at `6647` is skipped entirely — the code falls back to
  putting **the raw URL** into the agent's tool-result text:

  ```ts
  resultLines = resultUrls.map((url, index) => `  - ![Generated image ${index + 1}](${url})`);
  ```

  With the old NetEase server that was a short `https://…` link. With this
  server it is a `data:image/png;base64,…` string of roughly **1–2 MB per
  picture**, which goes straight into the model's context.
- **Required behaviour:** never interpolate a `data:` URL into message text. The
  safe pattern is already in this same file — the background poller at
  `main.ts:6908` writes `` `  - Generated image ${index + 1}` `` with no URL at
  all. Do that on both image fallbacks, and say the picture could not be saved.
- **Why it cannot be fixed on the server:** the alternative is for Claidor to
  host the bytes (S3, a presigned URL, a lifecycle rule). That is a real build
  and a real cost, and it should be a decision rather than something I take
  unilaterally to dodge a three-line guard.

### 4.3 Not blocking — one name to reconcile

`desktop/src/shared/mediaModelAliases.ts` defines
`GPT_IMAGE_2_MODEL_ID = 'gpt-image-2'` and aliases NetEase's `canvas-20` to it.
That is the **upstream's** name for the model their server served, not a reading
of OpenAI's catalogue, so I did not treat it as evidence and used `gpt-image-1`.
Unknown ids pass through `canonicalizeMediaModelId` unchanged, so nothing breaks
either way. Whoever first holds a real OpenAI key should settle which id is
right and make the two agree.

## 5. The first thing to do when somebody has a key

In this order, because each answers the next one's question:

1. Set `OPENAI_API_KEY` on Render and `GET /desktop/api/media/images/models`.
   Empty list means the key is not set; one row means the route is live.
2. `POST /desktop/api/media/images/generate` with `{"prompt": "a red door"}`. If
   it fails, **read `desktop.proxy.upstream_refused` in the log before
   proposing a cause** — it carries OpenAI's own sentence, and that log line is
   what ended two hours of guessing on 13 September. If the model id is wrong,
   that is where it will say so.
3. Only then correct `IMAGE_MODEL_ID` and `IMAGE_USD_PER_IMAGE` against the real
   catalogue and the real price page, and delete the ⚠️ from `pricing.py`.
