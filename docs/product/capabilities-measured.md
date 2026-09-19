# The four capability tools, measured (19 September 2026)

The brief's Phase 4 is four advertised tools that are not a model turn:
web search, web fetch, image generation, audio transcription. Until today
all four were Connect RPC calls on `aiserver.v1.AiService`
(`RunWebSearch`, `RunWebFetch`, `RunGenerateImage`, `TranscribeAudio`).
Claidor never served that service. Measured from this container against
the live API host, each of those routes is 404. The tools themselves
were already in the host — `packages/agent/tools/core/web-search.ts`,
`web-fetch.ts`, `generate-image.ts`, and the dictation edge in
`electron-main/main-edge.ts`. They had nowhere to send the work.

## What the server now serves

`server/polar/desktop/capabilities.py`, mounted under `/desktop` next to
the model proxy. Three doors, each on OpenAI with Claidor's key, each
metered in the same unit as a model turn:

| Door | Path | What it does |
|---|---|---|
| Search | `POST /desktop/api/proxy/v1/web/search` | OpenAI hosted `web_search` on the cheap model; `{ answer, documents }` out |
| Pictures | `POST /desktop/api/proxy/v1/images/generations` | `gpt-image-1`; generations, or edits when reference images are given |
| Dictation | `POST /desktop/api/proxy/v1/audio/transcriptions` | OpenAI's multipart shape in; `{ text, seconds }` out |

Fetch is not a door. A public page needs no key and no meter, and going
through one would tell that middleman every address the person's agent
reads. The page is fetched on the machine the agent runs on
(`desktop/source/shared/node/web-fetch.ts`).

The model proxy itself lives at the same prefix. Phase 2's executor
built `api/proxy/v1` off `SAND_BACKEND_URL`, which the API host answers
with 404 (`POST https://api.claidor.com/api/proxy/v1/models` → 404;
`/desktop/api/proxy/v1/models` → 401). Every Claidor caller now builds
its address in `claidor-api.ts`.

## What the app now calls

The tools are unchanged. The services behind the four seams the host
already had are ours:

- `createWebSearch` / `createWebFetch` in
  `host/extensions/inference/production.ts` →
  `createClaidorWebSearchService` / `createLocalWebFetchService`
- `createSandGenerateImageService` and the avatar picker →
  `createClaidorGenerateImageService`
- `SandTranscriptionManager` → the transcriptions door, still answering
  `{ text, transcriptionTimeMs }` so the renderer and the edge do not
  move

## What this test covers, and what it does not

`desktop/tests/claidor-capabilities.test.mjs` drives each service
against a stubbed `fetch` and asserts the URL, the bearer, the body
shape, and the tool-facing result. The fetch test also runs real
HTML-to-text and the refusals (not a URL, not http(s), not text, 404).
Empty audio never leaves the machine.

Not run against a live model, a live search, or a live picture — no
signed-in account and no OpenAI key in this container. The server tests
in `server/tests/desktop/test_capabilities.py` cover the doors
themselves the same way: stubbed upstream, real routing and metering.
A Mac with `SAND_CLAIDOR_FULL_AGENT=1` is still the run that proves a
turn that searches, fetches, draws and listens, end to end.
