# The design of record

The founder's redesign of the app. It arrives as a Claude Design canvas
and lives only in a chat upload; it is here so it survives. There are
two, and the later one wins where they differ.

## 15 September 2026 — the sidebar, avatars, voices, the agent panel

| File | What it is |
|---|---|
| `canvas-2026-09-15.html` | the canvas exactly as delivered — a self-unpacking bundle, 2.5 MB, opens in a browser |
| `canvas-2026-09-15-template.html` | the same thing unpacked: the markup and the `text/x-dc` script, readable |
| `cloud-blob.js` | the agent's face, lifted out of the bundle — a soft cloud with eyes, pure SVG, 110 lines |

What changed from 13 September, in the founder's words and the canvas's
code:

- **Twenty-five avatars.** `AVATARS` is twenty-five three-colour
  gradients. An agent's face is a `<cloud-blob>` tinted by one of them;
  its shape is `seed = i * 5 + 2`, so an avatar is one number, 0–24. The
  create screen rolls one when it opens (`setupPalette`) and it is
  stored on the agent — it is not derived from anything.
- **Avatars can be changed.** "Edit avatar" on the create screen opens a
  9-column grid of all twenty-five; the same button in the agent panel
  opens a 5-column one. Any of the twenty-five may be chosen.
- **Voices are spheres.** Each of the seven voices now carries its own
  five-colour palette and seed and is drawn with `<cloud-orb>` — the
  13 September sphere, unchanged (`cloud-orb.js` is byte-identical). An
  agent's face and its voice are two different pictures.
- **A voice is optional at creation.** The button reads "No voice yet /
  Add" until one is picked, then the sphere and "Change".
- **Delete lives in the sidebar.** A trash icon replaces the unread dot
  on the *active* row (only when there is more than one agent). It opens
  the agent panel with the delete question already asked.
- **The agent panel.** A third column, `clamp(236px, 25%, 324px)`, with
  the sidebar narrowing to `clamp(252px, 22%, 300px)` while it is open.
  Header "Agent settings"; a 76px avatar and Edit avatar; Name, Label,
  Description edited live; a Notifications toggle; Delete agent →
  "Delete {name} and this conversation? This can't be undone." with
  Delete / Keep. Opened from the sidebar's trash icon, or by the agent's
  name in the conversation header.
- **Typing is an animation.** In the header, three small dots beside
  the name (`thinkDot`). In the thread, the agent's blob at 26px hopping
  (`thinkHop`) beside a small bubble of three dots (`thinkBubble`).

## 13 September 2026 — the shell

| File | What it is |
|---|---|
| `canvas.html` | the canvas exactly as delivered |
| `canvas-template.html` | unpacked |
| `cloud-orb.js` | the sphere — 195 lines of self-contained WebGL2 |

The whole shell: Messages, the thread, compose, Apps, Settings, the
twelve role agents, the connector catalogue and the copy. Still the
specification for everything the 15 September canvas does not touch.

`cloud-orb.js` takes `colors` (five comma-separated hex values), `seed`
and `grain`. It is now the *voice's* picture and the logo's; the agent
wears the blob.

## Reading these

The `canvas*.html` files are the originals and should not be edited.
Read the `*-template.html` beside each: the template and the script that
drives it are the whole specification — every colour, size, radius,
shadow and animation, plus the seeded agents and the copy.

What to read alongside: `../direction.md` for the decisions, `../review.md`
for what was found wrong and fixed. Where a canvas and `direction.md`
disagree, `direction.md` wins — it records corrections the founder made
after a canvas was drawn.
