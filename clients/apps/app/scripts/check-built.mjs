// The built web app is committed (clients/apps/web/public/app-next), as the
// old one is, so the website deploys it as it is. This builds the source
// again into a scratch folder and fails when the committed files differ:
// a change to the source must be committed with its build (`pnpm build`).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('..', import.meta.url))
const committed = fileURLToPath(
  new URL('../../web/public/app-next', import.meta.url),
)
const scratch = mkdtempSync(join(tmpdir(), 'simeon-app-'))

function files(folder) {
  const found = new Map()
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else
        found.set(
          relative(folder, path),
          createHash('sha256').update(readFileSync(path)).digest('hex'),
        )
    }
  }
  try {
    walk(folder)
  } catch {
    // No committed build yet: every built file is reported missing.
  }
  return found
}

try {
  execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], {
    cwd: here,
    env: { ...process.env, SIMEON_APP_OUT: scratch },
    stdio: 'inherit',
  })
  const built = files(scratch)
  const kept = files(committed)
  const problems = []
  for (const [path, hash] of built) {
    if (!kept.has(path)) problems.push(`missing: ${path}`)
    else if (kept.get(path) !== hash) problems.push(`out of date: ${path}`)
  }
  for (const path of kept.keys()) {
    if (!built.has(path)) problems.push(`left over: ${path}`)
  }
  if (problems.length > 0) {
    console.error(
      'clients/apps/web/public/app-next is not the build of clients/apps/app:',
    )
    for (const problem of problems) console.error(`  ${problem}`)
    console.error('Run `pnpm build` in clients/apps/app and commit the result.')
    process.exitCode = 1
  } else {
    console.log(`The committed build matches the source (${built.size} files).`)
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
