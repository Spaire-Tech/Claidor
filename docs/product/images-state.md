# Images: what is unblocked, and the one thing still missing

18 September 2026. Measured, not recalled.

**Corrected 19 September 2026.** The missing server endpoint this page
names is now built: `POST /desktop/api/proxy/v1/images/generations`
(`server/polar/desktop/capabilities.py`), and the app's generate-image
tool and avatar picker call it
(`desktop/source/shared/node/cursor-backend/claidor-generate-image.ts`).
The NetEase `/api/media/images/...` paths below are still 404 and still
unused by the host tool. See `docs/product/capabilities-measured.md`.

---

## The short version

Four image paths existed. Three were switched off and the fourth was never
verified. **Three of the four blocks are now removed. One remains, and it is on
the server, not in the app: there is no image endpoint.**

So: **images do not work yet.** Everything in the app is ready for them.

## What was blocking them

**1. A hard gate in the app — removed.**
`main/mediaGenerationPolicy.ts` refused every `caisra_image_generate` call with:

> "Tool unavailable: This media generation tool is not available in this
> session. No media generation model has been selected by the user. Do not
> retry."

That gate read `mediaSelection`, which is set only by `MediaModelPicker.tsx` on
the **upstream cowork screens**. `App.tsx` mounts the Caisra shell instead, and
nothing under `renderer/design/` ever sets it — so the gate could never open.
Images were structurally impossible, not broken.

It is also the wrong shape for this product. The founder, 16 September: *"my
users should never put a key. everything happens under the hood. not a
setting."* Choosing an image model before asking for an image is a setting.

**2. The agent was told the tools did not exist — fixed.**
`buildMediaGenerationTurnInstruction` returned `''`, or literally
`[Caisra media generation tools - NOT AVAILABLE]`, whenever no model was
selected — which, per (1), was always. It now tells the agent it can make
images and when a picture is worth making.

**3. `seedream` / `seedance` were off — and stay off, deliberately.**
They are Volcengine (ByteDance) skills that read an `ARK_API_KEY` from the
environment and ship Chinese documentation. Both break the founder's rule that a
person never supplies a key, so they are not the answer. They were briefly
enabled during this change and turned back off.

**4. Image *lookup* depended on the browser.** The old card brief told the agent
to search the web for image URLs. `web_search` is denied
(`MANAGED_TOOL_DENY`), the `web-search` skill drives Playwright, and nobody has
run the browser in this tree. With the cards gone this path matters less: a
document's pictures can be generated.

## The one thing still missing

```
GET https://api.claidor.com/desktop/api/media/images/models   →  404
```

Measured from the build container, 18 September. The app's media handler
(`main.ts`, `handleMediaGenerationCallback`) posts to
`${serverBaseUrl}/api/media/images/models`, `/api/media/images/...` and
`/api/media/images/tasks/{id}`. **`server/polar/` serves none of them** — a grep
for `api/media` across `server/polar/` returns nothing.

`supportsImage: True` in `polar/desktop/pricing.py` means a model accepts images
as *input* (vision). It has nothing to do with making one.

## What it would take

The server already proxies and meters OpenAI for text
(`/api/proxy/v1/responses`) and for speech (`/api/proxy/v1/audio/speech`,
`endpoints.py:1046`). Speech is the pattern to copy: one route, the provider
call, a usage record, a price in `pricing.py`.

Two shapes to choose between, and it is a real decision:

1. **Add an image route to the proxy** — `/api/proxy/v1/images/generations`,
   synchronous, OpenAI's own shape, mirroring the speech route. Then change the
   app's media handler to call it instead of the three NetEase-shaped
   task endpoints. Simplest, and it matches how every other model call in this
   product works.
2. **Implement the task API the app already expects** — `models`, `generate`,
   `tasks/{id}` with polling. More server code, and it emulates an upstream API
   we otherwise do not use, but the app needs no change.

**(1) is the recommendation**, because the polling shape exists only because
Volcengine's API is asynchronous, and OpenAI's is not.

Either way it is a build on `server/polar/desktop/`, plus a pricing entry, and
it has not been started.
