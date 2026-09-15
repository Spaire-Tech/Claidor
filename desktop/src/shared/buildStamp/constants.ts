/**
 * Which build this is.
 *
 * Every build says version 2026.9.4, because the version only moves when
 * somebody moves it, and nobody does between builds. So when the founder
 * asked "how can i find out what electron im running?" there was no
 * answer: the app carried no commit and no build time, and the only way
 * to tell two builds apart was the modification time of a file inside
 * the bundle. This is the answer. electron-builder writes it into the
 * packaged `package.json` (`scripts/electron-builder-config.cjs`,
 * `extraMetadata`), the log prints it on the first line, and the
 * Support draft carries it.
 */

/** The key in the packaged `package.json`. */
export const BUILD_METADATA_KEY = 'build';

export interface BuildInfo {
  /** Short git commit, or `dev` when running from a checkout. */
  commit: string;
  /** ISO 8601, or empty when running from a checkout. */
  builtAt: string;
}

export const DEV_BUILD: BuildInfo = { commit: 'dev', builtAt: '' };

/** The stamp in a `package.json`, if one was written there. */
export function buildInfoFrom(packageJson: unknown): BuildInfo {
  if (!packageJson || typeof packageJson !== 'object') return DEV_BUILD;
  const stamp = (packageJson as Record<string, unknown>)[BUILD_METADATA_KEY];
  if (!stamp || typeof stamp !== 'object') return DEV_BUILD;
  const { commit, builtAt } = stamp as Record<string, unknown>;
  if (typeof commit !== 'string' || !commit.trim()) return DEV_BUILD;
  return { commit: commit.trim(), builtAt: typeof builtAt === 'string' ? builtAt : '' };
}

/**
 * One line a person can read back: `2026.9.4 (09309433, built 2026-09-15
 * 07:41 UTC)`, or `2026.9.4 (dev checkout)`.
 */
export function describeBuild(version: string, build: BuildInfo): string {
  if (build.commit === DEV_BUILD.commit) return `${version} (dev checkout)`;
  const when = build.builtAt ? `, built ${build.builtAt.replace('T', ' ').replace(/:\d\d(\.\d+)?Z$/, ' UTC')}` : '';
  return `${version} (${build.commit}${when})`;
}
