export class SandHostBundleSourceError extends Error {}
export const SHORT_GIT_SHA_REGEX = /^[0-9a-f]{7,40}$/;
export const HOST_BUNDLE_PREFIX = "sand-host-bundle";
export const LATEST_VERSION_FILE = "sand-host-bundle-latest.version";
export const VERSION_CACHE_TTL_MS = 10 * 60_000;
export interface HostBundleSource { readonly version: string; loadBundleBytes(): Promise<Uint8Array> }
let cachedVersion: { version: string; at: number } | undefined;
// There is no default bundle origin. A host bundle is executable code swapped
// into the box while it runs; the only origin it may come from is one the
// operator names explicitly. With nothing named, every update path answers
// "no-bundle-source" without a network request.
export function hostBundleBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null { const override = env.SAND_HOST_BUNDLE_S3_BASE_URL?.trim(); return override != null && override.length > 0 ? override.replace(/\/+$/, "") : null; }
export function latestHostBundleVersionUrl(base: string): string { return `${base}/${LATEST_VERSION_FILE}`; }
export function hostBundleTarballUrl(version: string, base: string): string { return `${base}/${HOST_BUNDLE_PREFIX}-${version}.tgz`; }
export function clearHostBundleVersionCache(): void { cachedVersion = undefined; }
export async function fetchLatestHostBundleVersion(fetchFn: typeof fetch = fetch, base: string | null = hostBundleBaseUrl()): Promise<string | undefined> { if (base == null) return undefined; if (cachedVersion != null && Date.now() - cachedVersion.at < VERSION_CACHE_TTL_MS) return cachedVersion.version; try { const response = await fetchFn(latestHostBundleVersionUrl(base)); if (!response.ok) return undefined; const raw = (await response.text()).trim(); if (!SHORT_GIT_SHA_REGEX.test(raw)) return undefined; cachedVersion = { version: raw, at: Date.now() }; return raw; } catch { return undefined; } }
export async function fetchHostBundleTarball(fetchFn: typeof fetch, version: string, base: string | null = hostBundleBaseUrl()): Promise<Uint8Array> { if (base == null) throw new SandHostBundleSourceError("sand host bundle: no bundle origin is configured (SAND_HOST_BUNDLE_S3_BASE_URL)"); if (!SHORT_GIT_SHA_REGEX.test(version)) throw new SandHostBundleSourceError(`sand host bundle: refusing malformed version "${version}"`); const url = hostBundleTarballUrl(version, base), response = await fetchFn(url); if (!response.ok) throw new SandHostBundleSourceError(`sand host bundle: fetch ${url} failed (status ${response.status})`); const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.length === 0) throw new SandHostBundleSourceError(`sand host bundle: fetched empty tarball from ${url}`); return bytes; }
export async function resolveHostBundleSource(fetchFn: typeof fetch = fetch, base: string | null = hostBundleBaseUrl()): Promise<HostBundleSource | undefined> { if (base == null) return undefined; const version = await fetchLatestHostBundleVersion(fetchFn, base); return version == null ? undefined : { version, loadBundleBytes: () => fetchHostBundleTarball(fetchFn, version, base) }; }
