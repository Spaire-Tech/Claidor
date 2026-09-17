# Switzer

Two weights of Switzer, the face the founder's evening canvas of
15 September sets the app in (`docs/product/design/canvas-2026-09-15-type.html`):

| File | Weight | Bytes |
|---|---|---|
| `Switzer-Regular.woff2` | 400 | 16,728 |
| `Switzer-Medium.woff2` | 500 | 19,564 |

Lifted from the canvas bundle as delivered, byte for byte. Copyright
2015–2021 Indian Type Foundry; Switzer is a trademark of the Indian Type
Foundry. Served by Fontshare under the ITF Free Font License, which
covers use in apps and products. The license text itself is behind a
JavaScript page at fontshare.com and could not be fetched from here;
before a public release somebody should save a copy beside these files.

Declared in `../tokens.css` (`@font-face`, `font-display: swap`) and
named first in `font.ui` in `../tokens.ts`. No other weight is bundled:
upstream's stylesheet asks the document for weight 445, which the shell
root overrides to 400, because a browser given only 400 and 500 rounds
445 up to Medium.


## Inter

`InterVariable.woff2` is Inter by Rasmus Andersson (rsms.me/inter), under the SIL Open Font Licence 1.1. It is loaded only for the artifacts (`thread/artifacts.css`), whose design is OpenUI's and is set in Inter; the app itself stays in Switzer.
