# How the agents' faces move — audited on the shipped renderer (23 September 2026)

**This replaces the same-day audit that read `frontend/src/recovered/`.** That
tree is a partial redraw the app does not ship; everything below is read off
the pinned 0.18.0 renderer the `.app` actually runs,
`src/app/dist/renderer/assets/index-UbX-y3il.js`
(SHA256 `ef4e9831b65d3963…`, the exact file the reconstruction's evidence
anchors name) and its stylesheet `index-lCyB53CO.css` (`5a25f934b7d3b7a5…`),
sent from the founder's Mac. Byte offsets are into that file. Minified names
are quoted so a patch can find them. Nothing was run in the app.

## 0. The one sentence

There is **one live animator per agent**, hidden in a fixed 8×8 px box at the
top left of the window, and every face you see in the sidebar, the chat header
and the chat's typing mark is a live SVG **mirror** of it (`<use href>`); the
onboarding cast, the avatar editor and a few static tiles draw their own. The
animator is an SVG with a body path, two eye paths, and about twenty hidden
overlay elements, driven by a requestAnimationFrame loop of damped springs
whose targets are set per state by a forty-case table. Nothing is a video, a
sprite, a Lottie or a CSS keyframe except three small things named in §6.

## 1. The engine container and the mirrors (the part the reconstruction missed)

- `mln` (byte 2306870, mounted once at the app root, 5568936) renders a
  `div` styled `position:fixed; top:0; left:0; width:8px; height:8px;
  overflow:hidden; pointer-events:none` (classes `sand-ixxii4 sand-13vifvy
  sand-u96u03 sand-1xc55vz sand-dk7pt sand-b3r6kr sand-47corl`) and inside it
  one `dln` per **single** agent of the roster (`hln`: not a photo, not a
  group, not a shared room). Each `dln` draws `sd` at `sizeCss:"100%"` with
  `sourceId = "sand-agent-mark-source-" + agentId` (`kct`), which becomes the
  **`id` of the animator's `<svg>`**. It also provides a context (`tIe`) with
  `stagedAgentIds` and four commands: `holdMarkFacts(agentId, facts)`,
  `releaseMarkFacts`, `setMarkEmphasis(agentId, bool)`, `tryPokeMark(agentId,
  "spin"|"bounce"|"burst")`, the last through a map of the animators' refs.
- The engine's state is `mct({rosterAgent, surfaceFacts: heldFacts ?? agent})`
  (§4); when the chat's typing mark holds facts for the agent (below), those
  win over the roster's.
- `Nlt` (byte 2168633) is the mirror: `<span class="sand-grok-bot-mark
  sand-grok-bot-mark--mirror" data-grok-state style="--fg:…;--bg:…">` around
  `<svg viewBox="-15 -15 259 259"><use href="#sand-agent-mark-source-<id>"
  x=-15 y=-15 width=259 height=259/></svg>`. A `<use>` is a live clone of the
  referenced DOM, so every attribute the engine sets each frame shows in every
  mirror at once, at whatever size the mirror is.
- Who mirrors: `Iee` (byte 2308740, the avatar dispatcher) when `wct(agentId)`
  finds the agent staged **and** `isStatic` is false; the chat's typing /
  working mark (byte 5245000, `Nlt` when `Se && G != null`); the sidebar rows
  and the chat header go through `Iee`. `Iee`'s order is: photo (`au`, an
  `<img>`) → mirror → own `sd`. `isStatic` defaults to **true**, so a caller
  must ask for motion.
- Who draws its own `sd` (an animator of its own): the onboarding cast and
  every onboarding tile, the avatar editor's shape cells (`paused`), the
  "create your first Bot" sidebar preview (`paused`), the landing page's
  black mark, the box-blocked screen's violet mark, the chat typing mark for an
  agent that is not staged, and every `Iee` call with `isStatic`.

Sizes: `Jj = {xs:16, sm:22, md:28, lg:36, xl:72}`; onboarding cast `bPe = 80`;
chat typing mark 36; editor cell `Imt`; create-step header 20, shape radios
22, preview 64; landing 64.

## 2. The wrapper, `sd` (byte 2166900)

`<span class="sand-grok-bot-mark" data-grok-state data-paused
style="--fg: light-dark(<color light>, <color dark>); --bg: <eyeColor or
--sand-bg-base>; width; height">` (`Slt.root` = `position:relative;
display:inline-flex; flex-shrink:0`). Props: `color`, `shape` (default
`blob`), `state` (default `idle`), `paused`, `emphasis`, `spinSignal`,
`isFollowingPointer`, `followTarget`, `eyeColor`, `ink` (a flat colour or a
gradient, used by the onboarding cast on the light demo surface and by the
chat mark: `--sand-activity-mark-ink*`), `badgeColor`, `sizePx` or
`sizeCss`, `sourceId`, `children` (badges, sentinels). Gaze: on
`isFollowingPointer` it listens to `pointermove` on `window` and maps the
pointer into the box (`_Fe`: a damped polar offset, max ±0.6 of the width,
`JFe=.6`), or takes a fixed `followTarget`; the result is passed to the
animator as `gazeTarget`. It renders `$_t` with fixed tuning: `eyeTopology:
true`, `pose = {turn:17, tilt:-14, roll:29, scale: $de(shape)*259/229}`,
`poseHome = {turn:33, tilt:-19, roll:38}`, `faceTune = {size:.86, gap:1.18,
height:1, eyeWidth:.96, eyeHeight:.92}`, `uniformEyes: true`, `eyeScale =
.92/ont[shape]` (`ont` = per-shape eye scale: blob .92, pebble .96, squircle
.84, tablet 1, wedge .94, hex .94, cloud 1, teardrop 1).

## 3. The animator, `$_t` (byte 907760 → 946500)

### 3.1 The SVG it renders

`<svg id=sourceId data-state viewBox="-15 -15 259 259" overflow=visible>`
(the viewBox is re-set every frame to zoom for overlays, §3.6):

```
defs:  clipPath#N  ← the body path (ref Y)          | linearGradient#N-ink (only with ink gradient)
g (ref I)          back particle layer
path ×2 (ee)       thinking-dot bodies, hidden
circle ×7 (Z)      rings (stroke var(--fg)), hidden
circle ×7 (j)      parts (fill var(--fg)), hidden
path ×3 (ne)       glyphs: pencil, pencil trail, bang, hidden
g (ref A)  ← THE FACE GROUP: translate/rotate/scale every frame
  path (ref G)     the body, fill var(--fg) or url(#N-ink)
  g clip-path=url(#N)
    path (U[0]), path (U[1])   the two eyes, fill var(--bg), each set d + transform every frame
  circle (te)      the notify badge, stroke var(--bg) w6, hidden
g (ref P)          front particle layer
```

`--fg` is the agent colour, `--bg` the surface colour; the eyes are "holes"
of surface colour clipped to the body. Colours: `snt` (byte 1108024), eleven
`light/dark` pairs (black `#000/#FFF`, brown `#A27952/#855C36`, red
`#FF3E51/#E02135`, orange `#FF781C/#FF6700`, yellow `#FFAF38/#FF9800`,
green `#00C972/#009957`, cyan `#1CC3B0/#00A592`, blue `#2A92FE/#0E74E0`,
violet `#A97EFE/#804EE0`, magenta `#FF5EB1/#E02A88`, gray `#959595/#777777`)
through CSS `light-dark()`; ink gradients `G_t` (byte 1106961) per colour.
The picker's swatches are `PQ` (byte 946300); defaults for an agent without a
saved colour/shape are the id hashes `sle` / `u4e`.

### 3.2 Shapes, `Jo` (byte 893800)

Nineteen, built from numbers at load by `Po(label, path, extras)`: blob (the
fixed `HJt` path), pebble, bean, egg, squircle, tablet, capsule, cylinder,
hex, gem, crystal, wedge, shield, dome, arch, cloud, teardrop, leaf. `Po`
normalises the path into the 228.44 box (`p_t`), samples it (`$Be`), and
derives for each shape: `radius`, `beltRadius`, `tiltScale` (how much a tilt
shows), `face` (`c_t`: the best eye placement `{x,y,sx,sy,eye}` found by a
grid search of the largest inscribed ellipse), `spanAt(y)` (the body's
left/right edge at a height, used to keep the eyes inside), `ring` (96
samples around the outline, for morphing), `top`/`bottom`, and `turnAt(θ)`
for shapes with a 3D `solid` (bean, tablet, cloud) or `sides` (hex, wedge)
so a spin looks like a turning body. The shipped picker exposes eight of them
(`Ij` / `CHARACTER_SHAPES`): blob, pebble, squircle, tablet, wedge, hex,
cloud, teardrop.

### 3.3 The springs

`tc(x)` makes a spring `{x, v, t}`; `xl(s, ω, ζ, dt)` integrates it
(critically-damped form) at up to 120 substeps per frame. The springs and
what they drive:

| spring | ω / ζ | drives |
| --- | --- | --- |
| `fe` | 5 / .9 | face rotation (degrees) |
| `ke` | 3.5 / 1 | face x offset |
| `be` | 4 / 1 | face y offset (the bob) |
| `Ne` | 10 / .8 | face uniform scale |
| `Ae` | 26 / 1 | eye height (blink) |
| `oe` | 9 / .85 | eye width/pop |
| `ve`, `ge` | 13 / 1 | eye glance x, y (the "look around") |
| `xe` | 7–12 / 1 | eye-pose crossfade between two `u3` poses |
| `rn` | 6.2 / 1 | a full turn (nod/spin around the vertical axis) |
| `rt` | 14 / 1 | accumulated spin for morph entries |
| `Le` | 14 / 1 | body → circle morph for an overlay (0…1) |
| `Me` | 11 / 1 | overlay-to-overlay crossfade |
| `Je` | 10 / 1 | shape-to-shape morph (0…1) |
| `Sn` | 9 / .55 | notify badge |
| `vn` | 6 / 1 | humming rings |

Each frame (`tn`, byte 942200) integrates them, then `mn` writes the DOM:
face group `transform = translate(114.27+x, 114.27+y) rotate(θ·tiltScale +
spin) scale(s) translate(-114.27,-114.27)`; each eye's `d` (the crossfaded
`u3` pose outline) and `transform` (placed by `face`, clamped by `spanAt`,
projected onto a sphere by the pose matrix when `eyeTopology`, plus glance,
gaze, blink scale); the body `d` (morphed ring or the shape path).

### 3.4 The state table, `Gr` (byte 923500)

Forty states (`OnboardingCharacterState` in the reconstruction is exact):
lifecycle sleeping, waking, idle, listening, thinking, searching, working;
reactions excited, surprised, suspicious, angry, drowsy, happy, curious,
confused, bored, proud, shy, sad, laughing, scared, playful, celebrate; morphs
orbit, radar, progress; product spawning, humming, loading, dictating,
writing, sending, receiving, uploading, notifying, alerting, dragging,
bouncing, powering-down. For each, `Gr` sets the spring **targets** as
functions of time, e.g. idle: `rot = sin(t·.5)·1.5 + sin(t·.17)·.6, x =
sin(t·.27), y = sin(t·.85)·1.2, scale = 1 + sin(t·.85)·.007`; searching:
`rot = ±13 swing at 1.3 rad/s, x = ±7, y = ±3`, a nod every 4–7 s; working:
a 1.6 Hz pulse, `rot 4±2.5, x 3, y 1.5+3·max(0,pulse)`, a nod every 6–9 s;
excited: a 2.2 Hz hop of −10 px with a squash-and-stretch scale; drowsy: a
scripted head-drop-and-catch every 1.5–3.5 s; dragging: a 3.4 s pick-up/
carry/drop cycle; celebrate: a nine-turn `spinWild`; the morph states
(orbit… powering-down) zero the face and hand over to an overlay (§3.6). On
top of the targets: eye poses `g1e[state]` (a list of indices into `u3`,
49 poses × two eye outlines, byte 848544) re-picked every `VBe[state]` ms
(idle 9–16 s, searching 1–1.8 s…); blinks `ks()` every `w_t[state]` ms
(idle 6–14 s, none while sleeping/drowsy/orbit…); glances `ve/ge` re-aimed
every state-specific 0.45–6 s; an idle poke every 9–18 s in happy/excited/
proud/playful (`ts`: nod, double nod, `spinBounce`, `spinDizzy`, a 16-particle
burst); and for `sleeping` the eyes close to 8 % height.

### 3.5 Pokes and gaze

`spin()` → `pn(turns)` (the `rn` spring, a turn about the vertical axis,
which `turnAt` renders as a 3D roll for solid shapes); `bounce()` → `ai()`
(a four-hop decay of 48/28/14/6 px over 1.35 s); `burst()` → 22 particles.
Click on a mark cycles spin → bounce → burst (`Mpt`, `eqe`). `emphasis` (hover
on the chat mark, `setMarkEmphasis`) raises eye pop to 1.32 and blink height
to 1.18 through `O.current`. Gaze: `gazeTarget` becomes an offset of up to
±22 px x / ±14 px y for the eyes, smoothed at `Rn(.16)` per frame. Reduced
motion (`Fo()`): the loop still writes once with all springs at rest and the
first pose of the state, then idles.

### 3.6 Morph overlays, `A_t` (byte 919600)

`thinking→dots, orbit, radar, progress, spawning→gather, dictating→wave,
sending→send, receiving→receive, uploading→dock, bouncing→ball,
loading→whirl, powering-down→standby, writing→pencil, alerting→bang`. On
entry the body morphs to a circle (`Le`), the viewBox zooms out by
`__t[overlay]` (dots 1.5, whirl 1.45, standby 1.75…), and the hidden
elements draw the overlay each frame: `za` two thinking dots orbiting with a
"pop" wave; `$a` five orbit parts on a tilted ellipse; `Ms` three expanding
radar rings; `oi` a progress ring with `stroke-dasharray`; `_r` five parts
gathering in; `ua` a four-node wave; `No`/`Eo` a send/receive bead on a
diagonal with a pulse ring; `Ho` two docking beads; `hl` a pencil glyph
writing a trailing stroke; `cd` a bang glyph; `Bt` a standby glow. `progress`
and `spawning` show for 2.5 s / 2 s and rest 1.5 s (`y_t`, `Fhe`, `k_t`).

### 3.7 Particles, `E_t` (byte 909400)

Two `<g>` layers behind and in front of the face. Bursts (`f`): 20 confetti
(rounded rects, circles, 18 % yellow stars) in the six `k1e` colours with
gravity and drag, life .45–.85 s. Belts (`I`, while spinning fast or
humming/loading): orbiting beads on tilted rings with `linearGradient`
trails split into front/back halves by their z. All DOM-created SVG
elements, removed when dead.

### 3.8 Pause and lifecycle

`paused` freezes the springs' targets at rest; once every spring has settled
and no particle lives, the rAF loop **stops** (`ss = 0`) and restarts on
un-pause (`H.current`). `spinSignal > 0` triggers a spin. Unmount cancels the
frame and clears particles.

## 4. Where the chat's state comes from

`mct({rosterAgent, surfaceFacts})` (byte 2302969): `awaitingUserResponse !=
null → idle`; else `wbe(rosterAgent)`: not running → idle, `isComposingMessage`
→ thinking, else `nln(currentActivity)`: null → working, `{kind:"tool",
tool:"SendToAgent"}` → sending, else the activity's verb (`dse`, byte
2301000, which also gives the sidebar its verb text and icon) through `tln`:
thinking→thinking; searching, browsing, reading, connecting→searching;
writing, coding, running-commands, on-its-computer, on-your-computer,
working→working; generating→loading; messaging, waiting→orbit. If the roster
agent is idle, the same is asked of `surfaceFacts` (the facts the chat's
typing mark holds while a bubble is live: `isRunning:true, isComposingMessage:
mode==="typing", currentActivity`). The chat's typing mark (byte 5243000)
also sets `spawning` for a brand-new agent's first bubble (`dJn`, 2 s), and
on hover asks for emphasis. The activity itself is minted by the host
(`source/host/sand-activity.ts`, sent on the roster).

## 5. Onboarding (byte 5385191 → 5395000)

Identical to the reconstruction, and now confirmed on the bytes: four
placements from a pure function of step and three beat counters (`QBn` hero,
`eqn` teammates, `tqn`), CSS transitions of `transform`/`opacity` with spring
easings baked into `linear()` (`rqn`: standard 175/26, slow 100/20, bounce
175/18.5, exit 300 ms), the cast rendered by `mqn` as `sd` at 80 px with
`isFollowingPointer` while gazing, `paused` under reduced motion, a click
that calls `spin()`, and the demo cursor glyph `uqn` as a child of the hero.
The `tools` step bob is the one CSS keyframe (`dqn`, `--cast-bob-amp`). The
create step's preview (`Pqn`, 64 px, `happy`), the shape radios (22 px,
`paused`), the sidebar preview (`Jj.lg`, `paused`) and the suggestion cards
(`sd` at `yqn`, `idle`) each draw their own `sd`. The **landing** page's black
mark (`ujn = 64`) cycles a mood every 1.2 s: idle, then one of curious,
happy, playful, excited, listening, proud, laughing, shy (`pjn`).

## 6. What is CSS, for completeness

Three things only: the onboarding cast's tools-step bob keyframe, the step
enter/exit fades and suggestion-card slide, and the sidebar's "settle
sentinel" (a span with a short keyframe, `data-settle-sentinel`, used only to
know when a row may pause its mark after returning to idle). The mark's own
stylesheet is the atomic classes named in §2; there is no
`.sand-grok-bot-mark` rule.

## 7. What a redesign has to keep, and where it lands

**Built 23 September 2026 as option 2 below**: `orb-marks-measured.md` is the
record of what shipped and what is measured.

The animation is the `$_t` loop on the face group `A` plus the overlays,
particles and pokes; the identity is `color` + `shape` with the hash
defaults; the plumbing is `sd` → `$_t` and the mirror registry. A new look
enters the shipped window as a **package-time patch of this chunk**
(`scripts/lib/router-renderer-patch.mjs`, which already rewrites it for the
Simeon name and the Settings extension), anchored on the strings above. Two
ways, with a real trade-off:

1. **Keep the mirror architecture: draw the new body in SVG.** Replace the
   body path's fill (`Rke` / the ink gradient) with an SVG-native liquid
   (feTurbulence + feDisplacementMap over gradient blobs, animated by the
   same loop), keep the clipPath, hide the eyes. Everything else, mirrors
   included, keeps working unchanged. The look approximates the shader.
2. **The founder's WebGL orb, exactly.** `<cloud-orb>` is a canvas, and a
   `<use>` cannot mirror a canvas or a `<foreignObject>`; so `wct` is patched
   to return `null` (no agent is "staged", every site draws its own `sd`),
   and inside `$_t` the body path becomes a `<foreignObject>` holding the
   `<cloud-orb>`, still inside group `A` and still clipped by the shape's
   clipPath. Bob, tilt, scale, spin, pokes, particles, overlays and shape
   morphs then apply to the orb for free; the eyes are hidden; the shader's
   own outline is set to "none" so the SVG clip gives any of the 19 shapes.
   The founder's element already shares one GL context across instances and
   blits per element, which is what a sidebar of forty needs. State can also
   reach the shader (speed, swirl) from `data-grok-state` on the wrapper.

Option 2 is the one that gives the look the founder chose. What it costs is
the one-animator-per-agent economy: every visible mark runs its own springs
(cheap) and its own blit (the shared context does the work once per element
per frame).

## 8. Not measured

Frame cost of forty `<cloud-orb>` blits per frame at sidebar size on the
founder's Mac; whether Chromium in Electron renders `<foreignObject>` inside
a clipPath'd group with a transform correctly at every size (it does in the
page tested here at 1×; the app runs at 2×); the exact anchor strings for the
patch, which are written when the patch is.
