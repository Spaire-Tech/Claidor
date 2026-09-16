# Apple's macOS design guidance, as a reference for polishing ours

Retrieved 17 September 2026 from Apple's Human Interface Guidelines,
which developer.apple.com serves as data at
`developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`
(eleven pages: typography, color, layout, buttons, materials, sidebars,
toolbars, windows, menus, app-icons, icons). The numbers and tables below
are Apple's, copied; the reading against our tokens is ours. The full
pages are Apple's text and are not kept in this repository.

The founder, 17 September: *"can you retrieve that and use it as
reference. i'm designing the best i can, and what i want you to do, is
based on those reference, you polish what i did."*

## What could and could not be retrieved

- **Retrieved:** the guideline pages above, with the macOS type scale,
  tracking table, dynamic colour roles, and the rules for layout,
  buttons, windows, sidebars, toolbars and materials.
- **Not retrieved: the macOS 27 UI kit.** It exists only as a Figma
  Community file (`figma.com/community/file/1651309434229735362/macos-27`),
  which needs a Figma account to open or duplicate. No macOS Sketch file
  is published (the Sketch downloads on the resources page are tvOS and
  visionOS only). The founder can open the Figma kit under their own
  account and design on top of it; that is what it is for.
- **Not usable in the app: the SF fonts and SF Symbols.** Apple's font
  licence: *"you may use the Apple Font solely for creating mock-ups of
  user interfaces to be used in software products running on Apple's
  iOS, OS X or tvOS operating systems"* and *"You may not embed the
  Apple Font in any software programs or other products."* SF Symbols
  are licensed for apps on Apple platforms only (their licence ships
  inside the SF Symbols app and was not fetchable here). We ship
  Windows and Linux too, so neither goes in the repository. A Mac build
  may ask for the system font, which is SF, without shipping anything.
- **Colour values:** the HIG's system colour table carries swatches, not
  numbers, in the data; the dynamic colours are roles (`labelColor`,
  `separatorColor`…) that the system resolves. No hex values below.

## Typography (macOS)

Default text size 13 pt; minimum 10 pt. *"Prefer Regular, Medium,
Semibold, or Bold font weights, and avoid Ultralight, Thin, and Light."*

Built-in text styles:

| Text style | Weight | Size | Line height | Emphasized |
|---|---|---|---|---|
| Large Title | Regular | 26 | 32 | Bold |
| Title 1 | Regular | 22 | 26 | Bold |
| Title 2 | Regular | 17 | 22 | Bold |
| Title 3 | Regular | 15 | 20 | Semibold |
| Headline | Bold | 13 | 16 | Heavy |
| Body | Regular | 13 | 16 | Semibold |
| Callout | Regular | 12 | 15 | Semibold |
| Subheadline | Regular | 11 | 14 | Semibold |
| Footnote | Regular | 10 | 13 | Semibold |
| Caption 1 | Regular | 10 | 13 | Medium |
| Caption 2 | Medium | 10 | 13 | Semibold |

Tracking (SF, the part of the table our sizes fall in):

| Size | Tracking (1/1000 em) | Tracking (pt) |
|---|---|---|
| 10 | +12 | +0.12 |
| 11 | +6 | +0.06 |
| 12 | 0 | 0 |
| 13 | −6 | −0.08 |
| 14 | −11 | −0.15 |
| 15 | −16 | −0.23 |
| 16 | −20 | −0.31 |
| 17 | −26 | −0.43 |
| 18 | −25 | −0.44 |
| 20 | −23 | −0.45 |
| 22 | −12 | −0.26 |
| 26 | +8 | +0.22 |

## Colour (macOS)

Dynamic colour roles, each resolved by the system for light, dark and
increased contrast. The ones a chat app touches:

| Role | Use for |
|---|---|
| Label / Secondary / Tertiary / Quaternary label | Text by importance: primary content, a subheading, less, a watermark |
| Placeholder text | A placeholder string in a control |
| Link | A link |
| Separator | A separator between sections |
| Grid | The gridlines of a table |
| Control background | The background of a large element, such as a table |
| Control / Selected control | The surface of a control, and selected |
| Selected content background | Selected content in a key window |
| Unemphasized selected content background | Selected content in a window that is not key |
| Text background | Behind text |
| Window background | The window |
| Under page background | Behind a document's content |
| Control accent | The accent people pick in System Settings |
| Keyboard focus indicator | The ring on the focused control |
| Shadow | The shadow of a raised object |

Rules: *"Make sure all your app's colors work well in light, dark, and
increased contrast contexts."* *"If you define a custom color, make sure
to supply light and dark variants, and an increased contrast option."*
People may change the accent colour system-wide and expect the app's
buttons, selection and sidebar icons to follow it; a fixed-colour
sidebar icon is the exception, used sparingly and for meaning.

## Layout

- Order by importance, top and leading first. Align, and use
  indentation for hierarchy: *"People assume that aligned items are
  related to each other, and … perceive indented items as subordinate."*
- Group with negative space, container shapes or separators.
- Progressive disclosure: disclosure triangles, menus, nested views.
- *"Differentiate controls from content"*: controls on Liquid Glass or a
  scroll edge effect, not a solid band; content extends under sidebars
  and toolbars.
- macOS: *"Avoid placing controls or critical information at the bottom
  of a window. People often move windows so that the bottom edge is
  below the bottom of the screen."* Keep content out from under the
  camera housing at the top edge.

## Buttons

- *"Use a button that has a prominent visual style for the most likely
  action in a view."* *"Keep the number of prominent buttons to one or
  two per view."*
- *"Use style — not size — to visually distinguish the preferred choice
  among multiple options."* Same size, different prominence.
- Avoid button label colours that match colourful content behind them;
  prefer monochrome labels there.
- macOS: the push button is the standard; a trailing ellipsis when a
  button opens another window or view; square buttons hold symbols, not
  text, and sit in a view, not the window frame; about 10 px of padding
  around an image in an image button.

## Windows, sidebars, toolbars

- A macOS window is a frame (title bar, toolbar, rarely a bottom bar)
  and a body. Main, key and inactive windows look different; custom
  windows must follow the system's appearances.
- *"Avoid putting critical information or actions in a bottom bar."*
- Sidebar: content extends beneath it; let people customise and hide
  it; *"show no more than two levels of hierarchy"*; row height, text
  and glyph follow the small, medium or large sidebar size people pick
  in General settings; *"Avoid putting critical information or actions
  at the bottom of a sidebar."*
- Toolbar: in the frame, at the top, items without a bezel; every
  toolbar item also exists as a menu command.

## Materials

- Liquid Glass is for the functional layer: controls and navigation
  that float above content. *"Don't use Liquid Glass in the content
  layer."* Use it sparingly on custom controls.
- Regular glass blurs and adjusts luminosity for legibility; clear glass
  only over rich media, with a 35% dark dimming layer when the content
  is bright.
- Standard materials and vibrant colours for structure under glass;
  thicker for contrast, thinner to keep context.

## Read against ours (`desktop/src/renderer/design/tokens.ts`, `tokens.css`)

What lines up, what does not, and what is a deliberate difference. This
is the checklist for polishing the founder's next design, not a set of
changes made.

| Theirs | Ours | Reading |
|---|---|---|
| Body 13, default size 13, minimum 10 | body 13.5, message 14, small 13, caption 12.5, code 12 | Same neighbourhood. Nothing under 12, so nothing below their minimum. |
| Title 3 15, Title 2 17, Title 1 22, Large Title 26 | base 15, section 16, sidebarTitle 18, dialogTitle 20, detailTitle 25.5 | A step apart at each level; ours is a slightly tighter ladder. |
| Line height 16 on 13 (1.23), 20 on 15, 26 on 22 | 1.4–1.5 in running text, 1.25 on titles | Ours is looser in running text, which suits message bubbles; titles match. |
| Tracking −6/1000 at 13, −11 at 14, −23 at 20 | 0 at text sizes, −.01em on titles | Theirs is SF's own metrics; Switzer is a different face and needs less. Not a mismatch. |
| Regular, Medium, Semibold, Bold; no Light | 400 and 500 shipped, 600 on titles | Consistent. |
| Label / secondary / tertiary / quaternary | ink, muted, faint, disabled | Four levels each. Consistent. |
| Separator, grid | hairline, grid | Consistent, and our grid on the ground is our own idea, not theirs. |
| Accent follows System Settings | accent fixed `#2b6cf5`; primary buttons in ink, not accent | A web app cannot read the system accent. Ours is a fixed identity by design. |
| One or two prominent buttons per view; style not size | One ink pill and paper pills of the same height | Consistent. |
| Light, dark and increased contrast | Light only | The one real gap. Their rule is variants for all three even when shipping one appearance. |
| Nothing critical at the bottom of a window or sidebar | The composer at the bottom of the thread; Apps and the account at the bottom of the sidebar | Deliberate: a chat composer lives at the bottom in every messaging app, and Messages on the Mac does the same. The sidebar bottom is the founder's design. Known deviation, not an oversight. |
| Glass for controls and navigation, never content | Glass on modals and popovers; cards on paper | Consistent. |
| Sidebar hideable, two levels, sized by the system setting | Fixed sidebar, one level, our own row height | Hideable is a fair addition. Two levels is already true. |
| Toolbar items in the frame without a bezel | Top bar with round buttons | Ours sit on the bar, not in the title bar; an Electron window has no native toolbar here. |

## How to use this

When the founder's new design arrives: build it as drawn, then walk it
against the table above and the rules, and say for each line whether
it holds, where it departs and why, and what one change would bring it
closer. Apple's rules are the reference; the founder's design is the
spec.
