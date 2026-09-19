import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFile(path.join(repoRoot, ...parts), "utf8");

test("the local Docker box pins its backend URL unconditionally", async () => {
  const connector = await read("source", "electron-main", "box", "local-docker-host-connector.ts");

  // getConfiguredBackendUrl falls back to DEFAULT_CURSOR_BACKEND_URL (api2.cursor.sh).
  // Inside the container that fallback is reached whenever SAND_BACKEND_URL is unset,
  // and the credential renewer then sends this account's bearer token to Anysphere.
  assert.match(connector, /"--env", `SAND_BACKEND_URL=\$\{getConfiguredBackendUrl\(\)\}`/);
  assert.match(connector, /import \{ getConfiguredBackendUrl \} from "\.\.\/\.\.\/shared\/node\/cursor-token\.js"/);

  // It must not be gated on the optional 3s inference-credential race: losing that
  // race used to create a container with no SAND_BACKEND_URL at all.
  assert.doesNotMatch(connector, /SAND_BACKEND_URL=\$\{inferenceCredential\.backendUrl\}/);
  const gatedLine = connector
    .split("\n")
    .find(line => line.includes("SAND_DEV_INFERENCE_TOKEN_FILE"));
  assert.ok(gatedLine != null, "the inference token file mount must still exist");
  assert.doesNotMatch(gatedLine, /SAND_BACKEND_URL/);
});

test("host bundle auto-update is opt-in, never opt-out", async () => {
  // resolveHostBundleSource fetches an executable tarball from an Anysphere S3
  // bucket and stages it for the supervisor to swap in. It is the last path by
  // which their server ships running code into this product, so it stays closed
  // unless someone explicitly opens it.
  const source = await read("source", "host", "extensions", "host-upgrade", "host-bundle-source.ts");
  assert.match(source, /public-asphr-vm-daemon-bucket/);

  for (const owner of [["host-upgrade"], ["forever-box"]]) {
    const extension = await read("source", "host", "extensions", ...owner, "extension.ts");
    const line = extension
      .split("\n")
      .find(candidate => candidate.includes("export function isHostBundleAutoUpdateEnabled"));
    assert.ok(line != null, `${owner.join("/")} must define isHostBundleAutoUpdateEnabled`);
    assert.match(line, /return raw === "1" \|\| raw === "true" \|\| raw === "yes";/);
    assert.doesNotMatch(line, /raw !== "0"|!\(raw === "0"/);
  }
});
