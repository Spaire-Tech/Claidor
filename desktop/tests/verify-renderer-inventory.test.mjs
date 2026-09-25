/**
 * `npm run verify` and the package-time renderer patches (25 September 2026).
 * The founder's first verify after the overnight batch failed on
 * `assets/app-icon-C7NKj2u7.png`: verify compared every renderer file with
 * the pinned Grok Bot inventory and knew nothing of the patches the
 * packager records. The resolver layers the record over the inventory.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { expectedRendererInventory } from "../scripts/lib/renderer-expected-inventory.mjs";

const h = (c) => c.repeat(64);
const pinned = [
  { path: "assets/app-icon-C7NKj2u7.png", bytes: 10, sha256: h("a") },
  { path: "assets/index-abc.css", bytes: 20, sha256: h("b") },
  { path: "assets/view-marks.js", bytes: 30, sha256: h("c") },
  { path: "assets/view-settings.js", bytes: 40, sha256: h("d") },
  { path: "assets/untouched.js", bytes: 50, sha256: h("e") },
  { path: "index.html", bytes: 60, sha256: h("f") },
];

test("a file no patch touched keeps the pinned hash; without a record everything is pinned", () => {
  const none = expectedRendererInventory(pinned, null);
  assert.equal(none.get("assets/untouched.js").sha256, h("e"));
  assert.equal(none.get("assets/app-icon-C7NKj2u7.png").source, "pinned");
});

test("the settings chunk, the marks chunk, the stylesheet, the icon and the brand pass layer in order", () => {
  const record = {
    chunks: [{ role: "registry", path: "dist/renderer/assets/view-settings.js", original: { bytes: 40, sha256: h("d") }, patched: { bytes: 41, sha256: h("1") } }],
    marks: {
      chunk: "dist/renderer/assets/view-marks.js", original: { bytes: 30, sha256: h("c") }, patched: { bytes: 31, sha256: h("2") },
      stylesheet: { path: "dist/renderer/assets/index-abc.css", original: { bytes: 20, sha256: h("b") }, patched: { bytes: 21, sha256: h("3") } },
      appIcon: { path: "dist/renderer/assets/app-icon-C7NKj2u7.png", original: { bytes: 10, sha256: h("a") }, patched: { bytes: 11, sha256: h("4") } },
    },
    brand: { files: [
      { path: "dist/renderer/assets/view-settings.js", original: { bytes: 41, sha256: h("1") }, patched: { bytes: 42, sha256: h("5") } },
      { path: "dist/renderer/index.html", original: { bytes: 60, sha256: h("f") }, patched: { bytes: 61, sha256: h("6") } },
    ] },
  };
  const expected = expectedRendererInventory(pinned, record);
  assert.deepEqual(expected.get("assets/app-icon-C7NKj2u7.png"), { bytes: 11, sha256: h("4"), source: "app-icon" });
  assert.deepEqual(expected.get("assets/index-abc.css"), { bytes: 21, sha256: h("3"), source: "marks" });
  assert.deepEqual(expected.get("assets/view-marks.js"), { bytes: 31, sha256: h("2"), source: "marks" });
  assert.deepEqual(expected.get("assets/view-settings.js"), { bytes: 42, sha256: h("5"), source: "brand" }, "the brand pass ran over the settings patch");
  assert.deepEqual(expected.get("index.html"), { bytes: 61, sha256: h("6"), source: "brand" });
  assert.equal(expected.get("assets/untouched.js").source, "pinned");
});

test("a stage that did not start from the previous stage's bytes, or names an unknown file, is refused", () => {
  assert.throws(() => expectedRendererInventory(pinned, { brand: { files: [{ path: "dist/renderer/index.html", original: { bytes: 99, sha256: h("9") }, patched: { bytes: 1, sha256: h("0") } }] } }), /started from/);
  assert.throws(() => expectedRendererInventory(pinned, { chunks: [{ path: "dist/renderer/assets/nope.js", original: null, patched: { bytes: 1, sha256: h("0") } }] }), /pinned inventory lacks/);
});
