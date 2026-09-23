# Brief for Claude Design: the agents' faces in Simeon

You are designing the faces of the agents in Simeon, a Mac app where every
conversation is an agent. A face is shown in the sidebar at 16, 22 and
28 px, in the chat header at 36 px, in the avatar editor at 36 and 64 px,
and in onboarding at 40, 64 and 80 px. It is the one thing the person sees
of the agent all day. It must be warm, quiet and expensive-looking. Think
Apple's restraint, not a mascot.

Read every rule below before you draw. The rules exist because the faces
are animated by code that already exists and must not change. A beautiful
face that breaks a rule cannot ship.

## The look

Matte 3D clay characters. Soft, rounded parts. No outlines anywhere. Small
features. One light source, top left, soft. A hair shape sitting on a round
head. Nothing glossy, nothing cartoon-thick, no black strokes, no stickers.
The palette is muted and material-like, not saturated.

Two reference images will be attached by the founder. Match their material
and their restraint, not their exact characters.

Founder's taste notes (fill in before sending):

- What I disliked in the last attempt: …
- What I want to feel when I see them: …
- Faces I like elsewhere (apps, illustrators): …

## Hard rules, from the animation system

1. **Everything is one SVG, viewBox `-15 -15 259 259`.** No raster, no
   embedded image, no filter that needs more than one Gaussian blur, no
   WebGL, no font. Every part is a `<path>`, `<circle>` or `<ellipse>` with
   a flat or gradient fill. Gradients: radial or linear only.
2. **The head is a circle, centre (114.27, 122.27), radius 92.** You may
   not move or reshape it. Hair sits on it. Everything you draw must stay
   inside the box (x and y between −15 and 244).
3. **The eye line is y = 106.27, the eyes are at x = 85.27 and 143.27.** A
   light sclera with a dark pupil. The pupil is what moves with gaze (up to
   ±7 units sideways, ±5 up and down, clipped inside the sclera). The
   whole eye group is what squints: it is scaled vertically between 0.12
   (asleep) and 1.18 (surprised) about the eye line. Design eyes that still
   read at 0.12 (a closed lid) and at 1.18 (wide).
4. **The mouth sits at y ≈ 150.** The code draws it per state; you supply
   the shapes (see the expression table below).
5. **Two moving groups and nothing else moves.** The face group (head,
   hair, ears, brows, nose, mouth, eyes) bobs up and down by 0–7 units and
   tilts by −12° to +12° about the box centre. The eye group translates
   and squints. You cannot add a third motion, a keyframe animation, a
   morph or a transition. A "state" is only: a bob amplitude, a period, a
   tilt, an eye openness, plus whatever static parts you key on the state.
6. **Legibility budget by size.** At 16–28 px the face is exactly five
   parts: head, hair, two eyes, mouth. Brows, nose, ears, blush, an
   accessory: only at 36 px and above. Nothing thinner than 3 units
   (≈0.3 px at 28 px) anywhere.
7. **Eight hair styles, one per key.** The keys are fixed and stored per
   agent: `blob`, `pebble`, `squircle`, `tablet`, `wedge`, `hex`, `cloud`,
   `teardrop`. Each key gets one silhouette. They must tell apart at
   28 px in one colour. You may draw a back part behind the head and a
   front part over it.
8. **Eleven hair colours, one per key, each a light-theme and a dark-theme
   value.** Keys: `black`, `brown`, `red`, `orange`, `yellow`, `green`,
   `cyan`, `blue`, `violet`, `magenta`, `gray`. An agent's colour is stored
   and must keep its name: "cyan" must still read as cyan. On the dark
   theme the app's background is `#1C1C1E`; on light it is white. Black
   hair on the dark theme still has to separate from the background.
9. **Skin: four to six matte tones**, and a fixed table that assigns one
   tone to each of the eleven hair colours (the app cannot store a tone;
   the tone is a function of the colour). Every tone must work with every
   colour it is paired with, and the eleven pairs together should look
   like a diverse team.
10. **Material, stated as numbers.** For the skin and for the hair: the
    gradient type, its centre and radius (in box units) and its three
    stops as "base lightened by X %", "base", "base darkened by Y %". One
    specular highlight: shape, position, size, opacity. One rim: side,
    width, opacity. Two shadows: the hair's cast shadow on the face
    (offset, blur, opacity) and the ground shadow under the head (size,
    offset, opacity). I will implement exactly these numbers.
11. **Themes are CSS.** Do not design anything that needs JavaScript to
    know the theme. Every colour that differs between themes is a pair.
12. **No text, no logos, no brand marks, no photo textures.**

## The expression table you must fill

Forty states exist. For each, the code already has bob, period, tilt and
eye openness. You add the static parts: mouth shape, brow lift and angle
(36 px+), and anything else keyed on the state. Fill this table; leave a
row as "neutral" when the state needs nothing special.

| state | eye openness (given) | mouth | brows | other |
| --- | --- | --- | --- | --- |
| sleeping | .12 | | | |
| waking | .35 | | | |
| idle | 1 | | | |
| listening | 1 | | | |
| thinking | .75 | | | |
| searching | .9 | | | |
| working | 1 | | | |
| loading | .9 | | | |
| excited | 1.08 | smile (required) | | |
| surprised | 1.18 | | | |
| suspicious | .75 | | | |
| angry | .65 | | | |
| drowsy | .25 | | | |
| happy | 1.08 | smile (required) | | |
| curious | 1 | | | |
| confused | .8 | | | |
| bored | .45 | | | |
| proud | 1 | | | |
| shy | .55 | | | |
| sad | .6 | | | |
| laughing | .8 | | | |
| scared | 1.1 | | | |
| playful | 1.05 | | | |
| celebrate | 1.12 | smile (required) | | |
| orbit, radar, progress, spawning, humming, dictating, writing, sending, receiving, uploading, notifying, alerting, dragging, bouncing, powering-down | 1 (powering-down .12) | | | |

The seven states the sidebar actually shows are idle, thinking, working,
searching, excited, celebrate and sleeping. Design those seven first and
best.

## What to deliver

1. **`faces.svg`**: one file, eight faces side by side, each in its own
   `-15 -15 259 259` group, idle state, 36 px detail level, the `blue`
   colour, on a white background. Every part has an `id`: `head`,
   `hair-front`, `hair-back`, `eye-left`, `eye-right`, `pupil-left`,
   `pupil-right`, `mouth`, `brow-left`, `brow-right`, `ear-left`,
   `ear-right`, `nose`, `blush-left`, `blush-right`, `specular`, `rim`,
   `hair-shadow`, `ground-shadow`. Paths absolute, no transforms on parts,
   no `<image>`, no `<text>`.
2. **`faces-spec.md`**: the numbers. The colour table (11 × light/dark),
   the tone table (tones and the colour → tone map), the material numbers
   from rule 10, the expression table above, and the mouth shapes as path
   data at the 259 scale.
3. **`faces-sheet.png`**: all eight styles × eleven colours at 80 px,
   light theme, and the same at 28 px in both themes, so the founder can
   judge before anything is built.
4. **`faces-states.png`**: the seven sidebar states for two styles at
   64 px.

Do not deliver: mockups of the app, a motion video, a design system, or
alternative "explorations" in the final. One direction, finished.
