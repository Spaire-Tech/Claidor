# The design, as code

Where the canvas lives in the app, and the decisions taken turning it
into something that survives being opened.

Everything is under `desktop/src/renderer/design/`. Nothing else in the
app imports it yet — the Messages shell is the next stage — so this can
be read as a whole before anything depends on it.

```
design/
  tokens.ts              the values, counted out of the canvas
  tokens.css             the same values as custom properties, generated
  generateTokensCss.ts   what generates them
  tokens.test.ts         holds the two in agreement
  logos/                 18 service logos, and the resolver
  orb/
    shaders.ts           the canvas's shaders, verbatim
    cloudOrbElement.ts   the element that runs them
    Orb.tsx              the React component the shell will use
    palette.ts           which orb an agent wears
```

## Tokens

One look, deliberately. The app carries a four-theme skinning system from
upstream under `renderer/theme/`, which the old shell uses. This is not a
fifth theme and does not go through that contract — the canvas is a
single considered design, and putting it behind a skinning layer would
invite the other four to stay.

`tokens.ts` is written by hand and is the source. `tokens.css` is
generated from it and checked in, so the app imports it with no build
step. `tokens.test.ts` fails when they disagree.

The values are counted, not invented. Where the canvas uses a colour 76
times it is a token; where it uses one once — the amber of the approval
triangle — it is still a token, because it has a job.

Custom properties are prefixed `--fsr-`.

## Logos

**Nothing is fetched.** The canvas resolves a logo it has no file for by
asking `icons.duckduckgo.com` and then `www.google.com/s2/favicons`. That
would tell two companies which services the app offers and, on the
installed row, which ones this person uses. The founder's instruction is
to track nothing at all, and an outbound request per card is tracking
whether or not anyone reads the answer. It also makes a screen that
should be instant wait on two third parties.

So a logo is a file we ship or it is nothing — and nothing is already
designed: the canvas draws a monogram tile behind every logo and reveals
it when the image does not load.

The 18 logos in the bundle came out at **1.62 MB**, for icons drawn at
26–42px; one was a 1024×1024 PNG at 634 KB. Re-encoded to 128px webp —
three times the largest drawn size — they are **55 KB**, a thirtieth of
what they were.

**34 of the ~50 services in the catalogue have no logo yet.** They draw
monograms, which is correct rather than broken. Which brand assets we
ship is a licensing question and the founder's call; the list is asserted
in `logos/index.test.ts` so it shrinks deliberately rather than drifting.

## The orb

The shaders are the canvas's, verbatim, and should not be tidied. The
element that runs them is not: the canvas ran four orbs on one screen,
and an app with a sidebar of agents cannot be that simple.

Six differences, each for a fault that would otherwise be found by
opening the app:

| | |
|---|---|
| **A context budget** | Browsers cap live WebGL contexts — Chrome around sixteen — and evict silently past it. Sixteen agents plus a thread header plus the panel is already over. Contexts are counted, capped at ten, and an orb under 56px never takes one: at that size the motion a person sees is the CSS scale pulse on the wrapper, not the shader. |
| **Stopping when unseen** | The canvas's frame loop ran forever. This stops when the orb scrolls out of view. |
| **Giving the context back** | Agents come and go; a deleted one must not hold a context until the next sweep. |
| **Surviving a context loss** | A GPU reset killed the canvas's orb permanently. This rebuilds. |
| **No layout read per frame** | The canvas measured itself every frame, per orb. The size comes from the ResizeObserver already watching. |
| **Reduced motion** | One frame, then still. |

An orb that cannot have a context draws a radial gradient in the same two
colours. At 28px it is indistinguishable.

### Which orb an agent wears

An agent's orb is its face — a person finds Mira in a list by colour
before they read the name. So it must be the same on every launch, on
every machine, and after any reordering.

That rules out `Math.random()` at creation unless the result is stored,
and rules out index-in-list entirely. The palette is derived from the
agent's id, which is already stable and unique. Random in the way that
matters — two agents rarely match, nobody can predict which they get —
and stable in the way that matters more.

Fifteen palettes, as asked. The canvas's four come first and unchanged,
because they have been seen and approved. The other eleven follow the
same construction: a deep base, a neighbouring hue, a third further round
the wheel, a very pale tint that lights the top of the vertical ramp, and
a mid tone for the sweep. A test asserts the pale one really is the
lightest in every palette — a palette whose fourth colour is not renders
as mud.

A seed derived separately from the id decides the shape of the clouds, so
two agents sharing a palette still differ. That is what keeps fifteen
enough for more than fifteen agents.

## What is not here

**The Messages shell.** That is the next stage, and this exists so it has
something to be built against rather than ad-hoc values retrofitted
after.

**Empty, loading and error states.** The canvas shows the app working,
never waiting or failing, and those are most of the states a real person
meets. The rule is set — never an empty state, the agent has already said
something — but the design of it is the founder's and is coming.
`direction.md` §12.

**Sign-in.** One screen, when the shell lands. Not a flow.
