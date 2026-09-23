# How the agents' faces move: an audit of the mechanism (23 September 2026)

Read off `desktop/frontend/src/recovered/` (the byte-evidenced
reconstruction of the pinned 0.18.0 renderer) and `desktop/source/host/`.
Written so a redesign of the faces can keep every animation. No file here
was changed; nothing was run.

## 1. One component draws every face

`features/onboarding/signed-in/character.tsx`, `OnboardingCharacter`. It
draws one inline SVG (`viewBox="-15 -15 259 259"`, centre 114.27): a
`<path>` for the body, filled with a two-stop linear gradient of the
agent's colour (light stop top left, dark stop bottom right), two
`<ellipse>` eyes in the surface colour, and, in three states only
(`excited`, `happy`, `celebrate`), a stroked `<path>` smile. That is the
whole face. There are no image assets, no sprite sheets, no Lottie, no
motion library: every place that shows an agent renders this component.

- **Shapes**: eight, generated from numbers at module load
  (`ARTIFACT_SHAPE_PATHS`): `blob` (a fixed path), `pebble`, `squircle`,
  `tablet`, `wedge`, `hex`, `cloud`, `teardrop`. Each is normalised to the
  same box (`normalizeArtifactPath`).
- **Colours**: eleven (`COLORS`), each a light/dark pair: black, brown,
  red, orange, yellow, green, cyan, blue, violet, magenta, gray.
- **Defaults**: an agent with no persisted colour or shape gets one by
  hashing its id (`resolvePersonaColor`, `resolvePersonaShape`), with Grok
  Bot's exact hash functions, so the same agent always gets the same face.

Where it is drawn:

| surface | file | how |
| --- | --- | --- |
| sidebar rows, chat header | `conversation/workspace/agent-avatar.tsx` → `PersonaMark` | wrapped in `<span class="sand-agent-avatar sand-grok-bot-mark" data-avatar-color data-avatar-shape data-size>`; sizes xs 16, sm 22, md 28, lg 36, xl 72 px |
| group chats | same file, `GroupAvatar` | 2–4 member faces tiled in one frame, static |
| shared rooms | same file, `SharedRoomAvatar` | a globe icon, no face |
| a photo avatar | same file | an `<img>`; the face is not drawn at all |
| avatar editor ("change avatar") | `agent-info/avatar-editor/view.tsx` | the face at 64 px, paused; eight shape cells at 36 px, paused; a colour row of swatches |
| onboarding | `onboarding/signed-in/view.tsx` `SceneCast` | four characters placed by `scene.ts`, 80 px |
| onboarding suggestion cards | same file, `SuggestionRail` | a 40 px face per card, `idle` |
| onboarding "create" preview | same file | a 64 px face, `happy` |

## 2. The animation is one requestAnimationFrame loop per face

Inside `OnboardingCharacter`, one `useEffect` starts a `requestAnimationFrame`
loop and on every frame sets two SVG `transform` attributes:

```
face:  translate(0, -bob - bounce)  rotate(tilt + spin, centre)
eyes:  translate(gaze.x * 4, gaze.y * 3)  scale(1, eyeOpenness)
```

where, per frame, with `elapsed` in ms since mount:

- `bob = sin(elapsed / period × 2π) × amplitude` (a vertical sine bob),
- `tilt` is a fixed angle,
- `eyeOpenness` is a fixed vertical scale of the eyes,
- `bounce` (only after `bounce()` is called) decays from 8 px over 700 ms,
- `spin` (only after `spin()` or a new `spinSignal`) turns 360° per second,
- `gaze` is where the pointer is, in the range −1…1 of the face's box.

Everything the face "does" is a **state**, and a state is nothing but four
numbers, `MOTION[state] = { amplitude, period, tilt, eye }`, plus the
smile flag above. Forty states exist (`OnboardingCharacterState` in
`scene.ts`): sleeping, waking, idle, listening, thinking, searching,
working, loading, excited, surprised, suspicious, angry, drowsy, happy,
curious, confused, bored, proud, shy, sad, laughing, scared, playful,
celebrate, orbit, radar, progress, spawning, humming, dictating, writing,
sending, receiving, uploading, notifying, alerting, dragging, bouncing,
powering-down. Examples of the numbers:

| state | amplitude px | period ms | tilt ° | eye |
| --- | --- | --- | --- | --- |
| idle | 1.5 | 9000 | 0 | 1 |
| thinking | 1 | 2000 | 3 | .75 |
| searching | 2 | 1000 | −4 | .9 |
| working | 2 | 1800 | −3 | 1 |
| excited | 5 | 1100 | 0 | 1.08 |
| celebrate | 7 | 1400 | 0 | 1.12 |
| sleeping | 0 | 6000 | 0 | .12 (eye height also drops from 7 to 2) |

So a state change never "plays a clip": the loop just reads a different
row on its next frame. The transition between states is instantaneous on
the face itself; smoothness comes only from the sine being continuous.

The loop stops (and the face freezes at its resting transform) when
`paused` is true, when `isStatic` is true, or when the OS asks for reduced
motion (`prefers-reduced-motion: reduce`, read on mount; also written to
`data-reduced-motion` on the svg). The editor and the group tiles pass
`paused`.

Attributes on the svg, for CSS or overlays: `data-grok-state`,
`data-paused`, `data-emphasis`, `data-source-id`, `data-pointer-shown`.
`emphasis` adds a drop shadow on the wrapper; nothing in the chat surfaces
sets it, nor `spinSignal`, nor gaze (`isFollowingPointer` / `followTarget`
are used by onboarding only). In the chat the face is state-driven and
nothing else.

## 3. Where the state comes from in the chat

`agent-avatar.tsx`, `personaStateFromAgent`, mirroring the shipped gate:

1. `awaitingUserResponse != null` → `idle` (a question is pending).
2. else the current activity, if any (table below).
3. else `isComposingMessage` → `thinking`.
4. else `isRunning` → `working`, otherwise `idle`.

The activity is minted by the host, per agent, from the same updates that
feed the transcript (`source/host/sand-activity.ts`
`deriveActivityFromUpdate`, applied in
`extensions/transcript/run-lifecycle.ts` `withRunStates` and sent with the
roster): a thinking or text delta → `{kind:"thinking"}`; a tool call
starting → `{kind:"tool", tool, detail?, target?}` with the tool name
normalised (`WebSearch`, `WebFetch`, `GenerateImage`, `Computer`, `Task`,
the shell and read tools, MCP…); a SendMessage or the turn ending → clear.
The renderer maps it (`activityState`):

| activity | state |
| --- | --- |
| thinking | thinking |
| WebSearch, WebFetch, `browser_*` | searching |
| GenerateImage | loading |
| SendToAgent, UpdateAgent | sending |
| Task, Await, CheckSubagent | orbit |
| any other tool | working |
| a `verb` field (thinking, searching, browsing, reading, connecting, writing, coding, generating, running-commands, on-its-computer, on-your-computer, working, messaging, waiting, sending) | the matching state |

The sidebar (`sidebar.tsx`) and the chat header (`chat-header.tsx`) pass
`currentActivity`, `isComposingMessage`, `isRunning`, `awaitingUserResponse`
straight through. The face therefore moves in the sidebar while a turn
runs and settles to `idle` when the reply lands, with no code of its own:
it is the roster's state, drawn.

Separately, the sidebar row has a small **status dot** (`.sand-agent-item__corner-dot`,
`view.css`), a CSS-only appearance animation of .13 s. It is not part of
the face.

## 4. Onboarding: the same faces, moved by CSS transitions and a scene table

`onboarding/signed-in/scene.ts` `scenePlacements()` is a pure function
from the scene's inputs (step, three beat counters, the demo cursor, the
avatar's landing target, the draft colour/shape) to four placements, one
per character: `hero` (black blob) and three teammates (`invoice-chaser`
red, `weekly-standup` cyan, `sales-forecast` blue). A placement is
`{ x, y, scale, opacity, state, transition, isGazing, bob }`.

`view.tsx` `SceneCast` renders each as an absolutely positioned `div` in
`.sand-onboarding__cast` (anchored at the viewport centre) with inline
`transform: translate(x,y) scale(s)` and `opacity`, and **CSS transitions**
on those two properties whose duration and easing come from the placement's
`transition` name:

| name | what it is |
| --- | --- |
| standard | a spring (mass 1, stiffness 175, damping 26), rendered to a CSS `linear(...)` easing of 49 samples, duration from the spring's settle time |
| slow | spring 100 / 20 |
| bounce | spring 175 / 18.5 (underdamped: overshoots) |
| exit | 300 ms `cubic-bezier(0.4, 0, 1, 1)` |
| none | 0 ms |

So the movement across the screen between steps is a browser transition
of `transform`/`opacity`, with spring curves baked into `linear()`; the
face inside keeps running its own rAF bob at the same time.

The steps and beats (`model.ts`): meet (a beat every 35 ms types the
sentence, 20 beats of delay first; the hero appears with `bounce` and is
`idle` then `listening`, gazing at the pointer), computer-demo (a beat
every 900 ms steps through `COMPUTER_DEMO_FRAMES`; the hero rides the
fake cursor at scale .55, `thinking` then `working`, on a light surface),
jobs (a beat every 800 ms, limit 2; hero `excited` then `happy`, teammates
bounce in `excited` then `happy` at fixed job positions, then the hero
exits at scale 1.2 with `celebrate`), tools (teammates park in the corners
at small scales, `idle`, with a slow CSS `sand-onboarding-cast-bob`
keyframe bob of 3–5 px over 5.2–7.3 s each), create (sales-forecast takes
the draft's colour and shape, flies to the avatar slot measured with
`getBoundingClientRect` → `avatarTargetFromRect`, and on the `transform`
transition's end (`isAvatarLandingTransition`) the in-form preview fades
in over .12 s while the flying one goes to opacity 0), hand-off (the app
icon, no faces). Step panels themselves fade with the
`sand-onboarding-step-enter/exit` keyframes; suggestion cards slide up
70 ms apart. All of it is disabled under `prefers-reduced-motion` (beats
jump to their limit, durations 0).

## 5. What a redesign must keep, concretely

The animation system does not care what the face looks like. It cares
about five things, and a new drawing keeps every animation if it keeps
these:

1. **One SVG with two groups**: an outer `<g>` (the "face", gets
   `translate + rotate`) and an inner `<g>` (the "eyes", gets
   `translate + scale(1, eye)`). Whatever you draw, the parts that should
   bob and tilt go in the outer group; the parts that should follow the
   pointer and squint go in the inner one. The refs `faceRef`/`eyesRef` and
   the `CENTER` used for the rotation origin are the contract.
2. **The `MOTION` table** stays as the definition of the states, or is
   extended with the same four numbers per state. The three smile states
   are the only per-state geometry; a redesign may add more such
   conditional parts, keyed on `state`.
3. **The colour contract**: `resolvePersonaColor` → a key of `COLORS`,
   rendered as a light/dark gradient. A new palette replaces the pairs;
   the keys and the hash defaults should stay so existing agents keep
   their colour.
4. **The shape contract**: `resolvePersonaShape` → a key of
   `ARTIFACT_SHAPE_PATHS`. New bodies are new paths under the same eight
   keys (or more keys, with `CHARACTER_SHAPES` / `AVATAR_SHAPES` in the
   onboarding and editor models updated to match), normalised to the
   259-box so the eyes and smile land where they expect.
5. **The wrapper and its data attributes** (`sand-grok-bot-mark`,
   `data-avatar-color`, `data-avatar-shape`, `data-grok-state`,
   `data-paused`, `data-source-id`): the earlier DiceBear attempt failed
   by painting *over* these marks from a preload script and keying on
   attributes the shipped page does not always carry
   (`faces-slice-measured.md`). A redesign belongs inside
   `OnboardingCharacter`, not on top of it.

Nothing in the onboarding scene, the activity mapping, the editor or the
sidebar needs to change for a new look: they all pass `color`, `shape`,
`state`, `sizePx` and let the component draw.

## 6. What was not measured

The pinned renderer's bytes are not in this container (`src/app/dist` is
fetched by `npm run bootstrap`); this audit reads the reconstruction,
which carries byte-offset evidence anchors into those bytes. Not measured:
frame rate under many sidebar faces (each mounts its own rAF loop, so
forty visible agents means forty loops), and whether the shipped page
ever sets `emphasis` or `spinSignal` from a path the reconstruction does
not cover.
