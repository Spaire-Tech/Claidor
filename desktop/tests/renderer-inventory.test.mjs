/**
 * The packaged renderer must stay the pinned 0.18.0 artifact, except where the
 * Settings Router patch rewrote it — and there, pinned to the patch's own
 * recorded before and after.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  RENDERER_ROOT,
  readRouterExtension,
  reconcileRendererInventory,
} from "../scripts/lib/renderer-inventory.mjs";

const digest = char => char.repeat(64);
const ORIGINAL = digest("a");
const PATCHED = digest("b");
const UNTOUCHED = digest("c");

const CHUNK = "assets/index-BlqerJhg.js";
const PLAIN = "assets/index-UbX-y3il.js";

function record(overrides = {}) {
  return {
    schemaVersion: 1,
    mode: "original-renderer-settings-extension",
    chunks: [
      {
        role: "panel",
        path: `${RENDERER_ROOT}${CHUNK}`,
        original: { bytes: 100, sha256: ORIGINAL },
        patched: { bytes: 140, sha256: PATCHED },
      },
    ],
    ...overrides,
  };
}

const pinned = [
  { path: PLAIN, bytes: 10, sha256: UNTOUCHED },
  { path: CHUNK, bytes: 100, sha256: ORIGINAL },
];

const asPackaged = (overrides = {}) => relative => ({
  [PLAIN]: { bytes: 10, sha256: UNTOUCHED },
  [CHUNK]: { bytes: 140, sha256: PATCHED },
  ...overrides,
}[relative]);

test("a patched chunk verifies against the patch record, an untouched one against the pin", () => {
  const { patchedPaths, declaredPaths } = reconcileRendererInventory({
    files: pinned,
    patches: readRouterExtension(record()),
    packaged: asPackaged(),
  });
  assert.deepEqual(patchedPaths, [CHUNK]);
  assert.equal(declaredPaths.size, 2);
});

test("a patch that did not start from the pinned bytes is refused", () => {
  // The chain back to the shipped artifact is what the inventory is for. A
  // well-formed record over the wrong original breaks it.
  const patches = readRouterExtension(record({
    chunks: [{
      role: "panel",
      path: `${RENDERER_ROOT}${CHUNK}`,
      original: { bytes: 100, sha256: digest("d") },
      patched: { bytes: 140, sha256: PATCHED },
    }],
  }));
  assert.throws(
    () => reconcileRendererInventory({ files: pinned, patches, packaged: asPackaged() }),
    /did not start from the pinned renderer/,
  );
});

test("packaged bytes that match neither the pin nor the patch are refused", () => {
  assert.throws(
    () => reconcileRendererInventory({
      files: pinned,
      patches: readRouterExtension(record()),
      packaged: asPackaged({ [CHUNK]: { bytes: 141, sha256: digest("e") } }),
    }),
    /differs from its recorded router patch/,
  );
});

test("an untouched file still has to match the pin exactly", () => {
  assert.throws(
    () => reconcileRendererInventory({
      files: pinned,
      patches: readRouterExtension(record()),
      packaged: asPackaged({ [PLAIN]: { bytes: 11, sha256: digest("f") } }),
    }),
    /differs from its checksum inventory/,
  );
});

test("a record naming a chunk the pinned inventory does not have is refused", () => {
  // Everything the inventory lists is packaged exactly as pinned, so the file
  // loop passes clean; the only thing wrong is a record claiming to have
  // patched something that is not in the renderer at all.
  const patches = readRouterExtension(record({
    chunks: [{
      role: "panel",
      path: `${RENDERER_ROOT}assets/not-shipped.js`,
      original: { bytes: 1, sha256: ORIGINAL },
      patched: { bytes: 2, sha256: PATCHED },
    }],
  }));
  assert.throws(
    () => reconcileRendererInventory({
      files: pinned,
      patches,
      packaged: asPackaged({ [CHUNK]: { bytes: 100, sha256: ORIGINAL } }),
    }),
    /absent from the pinned inventory/,
  );
});

test("a duplicate path in the pinned inventory is refused", () => {
  assert.throws(
    () => reconcileRendererInventory({
      files: [...pinned, { path: PLAIN, bytes: 10, sha256: UNTOUCHED }],
      patches: readRouterExtension(record()),
      packaged: asPackaged(),
    }),
    /missing or duplicate path/,
  );
});

test("a malformed or absent patch record stops the build rather than verifying nothing", () => {
  for (const [bad, pattern] of [
    [null, /record is missing/],
    [{ schemaVersion: 2, mode: "original-renderer-settings-extension", chunks: [] }, /unexpected identity/],
    [record({ chunks: [] }), /declares no chunks/],
    [record({ chunks: [{ role: "panel", path: "somewhere/else.js", original: {}, patched: {} }] }), /outside the renderer/],
    [record({ chunks: [{
      role: "panel",
      path: `${RENDERER_ROOT}${CHUNK}`,
      original: { bytes: 100, sha256: ORIGINAL },
      patched: { bytes: 100, sha256: ORIGINAL },
    }] }), /records no change/],
  ]) {
    assert.throws(() => readRouterExtension(bad), pattern);
  }
});
