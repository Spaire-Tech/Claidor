# The design of record

The founder's redesign of the app, 13 September 2026. It arrived as a
Claude Design canvas and lived only in a chat upload; it is here so it
survives.

| File | What it is |
|---|---|
| `canvas.html` | the canvas exactly as delivered — a self-unpacking bundle, 2.5 MB, opens in a browser |
| `canvas-template.html` | the same thing unpacked: the markup and all the app logic, readable |
| `cloud-orb.js` | the orb, lifted out of the bundle — 195 lines of self-contained WebGL2 |

`canvas.html` is the original and should not be edited. Read
`canvas-template.html` instead: it is the template and the `text/x-dc`
script that drives it, which together are the whole specification —
every colour, size, radius, shadow and animation, plus the seeded
agents, the connector catalogue, the twelve role agents and the copy.

`cloud-orb.js` is a custom element taking `colors` (five comma-separated
hex values), `seed` and `grain`. It drops into the app as it stands. The
canvas ships four palettes; the founder wants fifteen, picked at random
per agent.

The bundle also carries 22 service logos as webp, png, svg and jpg,
base64 in the manifest. They are extracted in Stage 2b rather than
re-sourced.

What to read alongside this: `../direction.md` for the decisions,
`../plan.md` for how it gets built. Where the canvas and `direction.md`
disagree, `direction.md` wins — it records corrections the founder made
after the canvas was drawn, including striking the second computer and
the cloud computer.
