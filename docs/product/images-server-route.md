# Images: the server route I built, and why it is not in the tree

20 September 2026. The Server agent's working note. This file used to describe
four image routes on the app's door, under `/desktop/api/media/images/*`. **They
were built, they passed their tests, and they are gone.** This is the record of
why, because the reasoning is worth more than the code was.

---

## 1. What happened

`docs/product/images-state.md` measured that `GET /desktop/api/media/images/models`
answered **404** and that `server/polar/` served no `/api/media` route. I built
one: four synchronous routes shaped like the task API the app expected, plus
`IMAGE_MODEL`, `IMAGE_USD_PER_IMAGE` and `credits_for_image` in `pricing.py`.

While that sat in PR #125, **PR #133 merged into `main`** and added
`server/polar/desktop/capabilities.py`, which serves
`POST /api/proxy/v1/images/generations`. Two image routes on one server, and
`pricing.py` auto-merged into **two** `IMAGE_MODEL_ID` definitions with no
conflict marker between them.

I dropped mine. Three checkable reasons, in the order they matter:

**Theirs meters from OpenAI's real usage object; mine guessed.** My pricing
multiplied a per-image dollar figure I had not read off a price page — I said so
at the time, with a ⚠️, and that warning is exactly the argument against keeping
it once a metered alternative exists.

**Theirs handles drawing *from* a picture; mine refused it by name.**
`capabilities.py:321` parses `reference_images` and sends the call to
`/v1/images/edits` instead of `/v1/images/generations` when any are present
(lines 397, 415, 428). Mine returned an error saying that was a different
endpoint.

**The app already calls theirs.** `desktop/source/shared/node/cursor-backend/claidor-generate-image.ts`
names `server/polar/desktop/capabilities.py` in its own header comment and posts
`{prompt, size, quality, reference_images}` to `images/generations`. Nothing in
the tree calls the routes I wrote.

## 2. The one argument of mine that did not survive contact, and should be said

My note argued at length that image generation is an **app** call and therefore
belongs on `/api/*` behind the `{code, data}` envelope, not on `/api/proxy/v1/*`
which is the engine's door. That reasoning was sound **about the tree I read it
in** — `desktop/src/main/main.ts`, whose `handleMediaGenerationCallback` was an
app-side handler.

That tree no longer exists. `desktop/src/` on `main` holds one file
(`desktop/src/app/package.json`); the app was restructured into
`desktop/source/`. In the new one the caller is the **agent's tool**
(`desktop/source/packages/agent/tools/core/generate-image.ts` →
`generate-image-service.ts` → `claidor-generate-image.ts`), which is an engine
call. So the door #133 chose is the right one for the app that exists, and the
door I chose was right for an app that was replaced underneath me.

**The lesson is this file's own headline rule, failed once more:** I reasoned
about the app from the copy of it I had read, over four days, without re-checking
that the copy was still current.

## 3. The `data:` URL leak: gone, and not by my hand

PR #125 originally also fixed six sites in `handleMediaGenerationCallback`
(`desktop/src/main/main.ts:6657` and `:6674` among them) that interpolated the
result URL into the agent's tool-result text when persistence had saved nothing.
Harmless with a short `https://` link; with a base64 `data:` URL it puts 1–2 MB
of base64 per picture straight into the model's context.

**That fix is not in the PR any more, because the file is not in the repository
any more.** What I searched, so nobody has to take this on trust:

- `git ls-tree -r --name-only origin/main -- desktop/src` → one file,
  `desktop/src/app/package.json`.
- `grep -rn 'handleMediaGenerationCallback' desktop/source/` → nothing.
- `grep -rln 'mediaAssetPersistence' desktop/source/` → one file,
  `host/extensions/attachments/attachments-service.ts`, unrelated (link
  previews).

**The bug pattern is absent from the replacement, and I checked rather than
assumed.** In the new tree `generate-image-service.ts` *throws*
`SandGenerateImagePersistError` when persistence saves nothing — there is no
fallback branch that reaches for a URL. And on the success path the base64 never
enters the model's text: `generate-image.ts:682` hands it to `createImageResult`
as a resized image block, while the text comes from `resultToString` (line 479),
which names the file path and nothing else.

So: **nothing to port.** Not "fixed" — replaced, by someone who never saw the
bug. Worth one line of vigilance if that path is ever rewritten again.

## 4. What is left for somebody to check

- **`IMAGE_MODEL_ID = "gpt-image-1"` in `capabilities.py` was not read off a
  live catalogue**, and neither was mine. Same ⚠️ as
  `SPEECH_USD_PER_MILLION_CHARACTERS`. #133's metering comes from OpenAI's usage
  object, which is the important half, but the id itself still wants one look at
  a real model list.
- **`docs/product/images-state.md` is now out of date** in its headline — the 404
  it measured is answered. It is not my file to edit; the Chief of Staff should
  assign that line.
