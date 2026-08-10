# The design, as given

`markup.html` and `stylesheet.css` are the founder's `Pierce_Workspace.html`
with nothing removed but the embedded font binaries and the bundler's own
wrapper. They are checked in so that « the design says » is a claim anyone
can check rather than something I remember.

The build is measured against these files. If a value in
`clients/apps/web/src/components/Workspace/design.ts` disagrees with a value
here, the file here is right.

## The canvas

The design carries its own screen size, in the bundler's props:

```
data-props="{"$preview":{"width":1440,"height":900}}"
```

**1440 × 900.** That is the size every screen was drawn at and the size to
put a browser at before saying a screen looks right. It is not a maximum
and not a minimum: the root is `height:100vh; width:100%`, so the workspace
fills whatever it is given. It is the size the proportions were chosen for.

## The breakpoint

```js
onResize = () => {
  const n = window.innerWidth < 1240;
  if (n !== this.state.narrow) this.setState({ narrow: n });
};
```

**Narrow below 1240px.** One breakpoint, on the window rather than on any
container, evaluated on mount and on every resize. What it changes:

| | wide | narrow |
|---|---|---|
| chat column, left panel open | `flex: 0 1 430px` | `flex: 0 1 340px` |
| chat column, min-width | `330px` | `280px` |
| chat column, left panel hidden | `flex: 1 1 auto`, inner column `max-width: 720px` | same |
| a split screen's direction | `row` | `column` |
| its main column | `flex: 1 1 0`, own scroll | `flex: 0 0 auto`, page scrolls |
| its side column | `flex: 0 1 300px`, `min-width: 190px`, left border | `flex: 0 0 auto`, no min, top border |
| its list column | `flex: 0 1 280px` | `flex: 0 0 auto` |
| a ribbon | scrolls sideways | wraps (`.ribbon-wrap`) |
| secondary rails and second-line metadata | shown | dropped |

The last row is the one worth naming: `wide` gates whole pieces of
furniture, not just their widths. The mail folder rail, the sender's email
address beside their name — below 1240 they are simply not drawn.

## What the numbers are

Read straight out of `markup.html`; nothing here is rounded.

| | |
|---|---|
| root | `height:100vh; width:100%; padding:18px 18px 0; gap:14px` |
| root type | `'Hanken Grotesk', system-ui, sans-serif` · 14.5px · 1.5 |
| page | `radial-gradient(120% 100% at 20% -10%, #ffffff 0%, #f4f5f7 42%, #e9ebef 72%, #e2e4e9 100%)` |
| panel row | `flex:1; min-height:0; gap:14px` |
| dock row | `flex:0 0 86px; justify-content:center; position:relative` |
| left panel | `rgba(255,255,255,.92)`, `blur(20px) saturate(1.4)`, radius 20 |
| chat panel | `rgba(255,255,255,.74)`, `blur(20px) saturate(1.5)`, radius 20 |
| dock | `gap:4px; padding:7px 10px`, `rgba(255,255,255,.72)`, `blur(30px) saturate(1.6)`, radius 22 |
| dock button | radius 12, padding 8, icon 21px at stroke 1.5 |
| dock button, live | `background:rgba(16,20,28,.08)`, ink `#0b62c4`; otherwise ink `#22252b` |
| composer | radius 999, `padding:9px 9px 9px 16px`, `1px solid #d7d7d3`, `0 6px 22px rgba(16,20,28,.13)` |
| greeting | 25px, `#15171b`, `letter-spacing:-.015em`, mark 44px |

## Two things the stylesheet carries that are easy to lose

`pcIn` and `pcDim` are defined **here**, not in any component. A build that
copies `animation: pcIn .18s ease both` onto an element without shipping
this stylesheet gets no animation at all and no error either — which is
what had happened before this file was checked in.

The scrollbar is styled too: 9px, `rgba(21,23,27,.16)`, an 8px radius and a
3px transparent border clipped to the content box, so it reads as a floating
thumb rather than a channel.
