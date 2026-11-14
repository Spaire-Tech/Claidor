/**
 * What is left out of the cloud computer's kept files, and of a workspace.
 * The lists are read in the order they are written here.
 */

/** Chrome's caches, in every profile. */
const CHROME_PROFILE = "home/box/chrome-profile/*";
export const SAND_BOX_PERSIST_ARCHIVE_EXCLUDES = [
  `${CHROME_PROFILE}/Cache`,
  `${CHROME_PROFILE}/Code Cache`,
  `${CHROME_PROFILE}/GPUCache`,
  `${CHROME_PROFILE}/Service Worker/CacheStorage`,
] as const;

/** A workspace's own list of what to leave out, read after the list below. */
export const SAND_WORKSPACE_IGNORE_FILE_NAME = ".sandignore";

/** What every workspace leaves out before its own list is read. */
export const SAND_BOX_WORKSPACE_DEFAULT_IGNORE_PATTERNS = [
  // Packages, and what the JavaScript tools build, cache and report.
  "node_modules/",
  ".next/",
  ".nuxt/",
  ".svelte-kit/",
  ".turbo/",
  ".parcel-cache/",
  ".cache/",
  "dist/",
  "build/",
  "out/",
  "coverage/",
  // Python.
  "__pycache__/",
  "*.pyc",
  "*.pyo",
  ".venv/",
  "venv/",
  ".pytest_cache/",
  ".mypy_cache/",
  ".ruff_cache/",
  ".tox/",
  ".ipynb_checkpoints/",
  "*.egg-info/",
  ".eggs/",
  // Other build tools.
  "target/",
  ".gradle/",
  // What a crashed program leaves behind.
  "core.[0-9]*",
  "*.core",
] as const;
