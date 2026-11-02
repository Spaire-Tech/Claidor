// What a Windows release writes and in what order it goes up (scripts/release.mjs),
// in the Mac's layout (mac/scripts/release.sh): a folder per version under
// releases/win32-x64/ in the release bucket, then, last, the two files that
// point at it, which the server reads (server/simeon/desktop/releases.py).

/** The bucket's folder for the Windows app (x64; arm64 would be win32-arm64 beside it). */
export const platform = 'win32-x64'

/** The oldest Windows Electron runs on (10), the Mac's `minimum_macos`. */
export const minimumWindows = '10'

/** The company the installer is signed as, and the updater asks of every update: the legal name until it is renamed (CLAUDE.md). */
export const signer = 'Spaire, Inc.'

/** The installer's name, as electron-builder.yml's `artifactName` makes it. */
export function installerName(version) {
  return `Simeon-Setup-${version}.exe`
}

/** A version electron-updater can compare: 1.2.3, with an optional pre-release. */
export function isVersion(value) {
  return typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)
}

/** Whether a certificate is given for signing (electron-builder's own settings; never in the repository). */
export function signingConfigured(env) {
  const link = env.WIN_CSC_LINK || env.CSC_LINK
  return typeof link === 'string' && link.trim() !== ''
}

/**
 * electron-updater's feed (`latest.yml`), in electron-builder's shape: the
 * version, the installer by its name under `folder` (the version's own
 * folder for the pointer beside the folders; nothing for the copy inside
 * it), its sha512 in base64 and its size, and the release's date.
 */
export function feedText({ version, sha512, size, releaseDate, folder }) {
  const url = folder ? `${folder}/${installerName(version)}` : installerName(version)
  return [
    `version: ${version}`,
    'files:',
    `  - url: ${url}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${url}`,
    `sha512: ${sha512}`,
    `releaseDate: '${releaseDate}'`,
    '',
  ].join('\n')
}

/** The sha512 electron-builder wrote in its own `latest.yml`, to check ours says the same. */
export function feedSha512(text) {
  return /^sha512: (\S+)$/m.exec(text)?.[1]
}

/** The record (`release.json`, the Mac's shape), copied to `latest.json` beside the folders: what the server reads. */
export function releaseRecord({ version, build, commit, pubDate, folderUrl, signed, exe, blockmap }) {
  return {
    version,
    build,
    commit,
    platform,
    minimum_windows: minimumWindows,
    pub_date: pubDate,
    signed,
    exe: { url: `${folderUrl}/${installerName(version)}`, sha256: exe.sha256, size: exe.size },
    blockmap: {
      url: `${folderUrl}/${installerName(version)}.blockmap`,
      sha256: blockmap.sha256,
      size: blockmap.size,
    },
  }
}

/**
 * The uploads, in order (the Mac's): the version's folder first (the
 * installer, its blockmap, the record, the feed as it is there); then,
 * once those answer, the feed and the record beside the folders, not
 * cached, so nothing points at a file before it is there.
 */
export function uploads({ version, s3 }) {
  const folder = `${s3}/${platform}/${version}`
  return {
    folder: [
      { file: installerName(version), to: `${folder}/${installerName(version)}`, type: 'application/vnd.microsoft.portable-executable' },
      { file: `${installerName(version)}.blockmap`, to: `${folder}/${installerName(version)}.blockmap`, type: 'application/octet-stream' },
      { file: 'release.json', to: `${folder}/release.json`, type: 'application/json' },
      { file: 'latest.yml', to: `${folder}/latest.yml`, type: 'text/yaml' },
    ],
    checked: [installerName(version), `${installerName(version)}.blockmap`],
    pointers: [
      { file: '../latest.yml', to: `${s3}/${platform}/latest.yml`, type: 'text/yaml', noCache: true },
      { file: '../latest.json', to: `${s3}/${platform}/latest.json`, type: 'application/json', noCache: true },
    ],
  }
}
