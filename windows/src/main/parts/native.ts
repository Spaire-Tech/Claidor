// After step 7 (6 November 2026): Windows' own parts the page asks for that
// step 7 left for later (docs/web-app/PROGRESS.md, "For Windows"): Windows'
// file dialog with the Mac's words, Windows' alert sound, and pictures from
// other sites read by the app and kept on this PC (native/pictures.ts).
// Its calls are answered here (`handle`, ../bridge.ts) and named in
// clients/apps/app/src/desktop/contract.ts, in its own section. Every
// argument is checked here: it comes from a page.

import { lookup } from 'node:dns/promises'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { type WebContents, dialog, shell } from 'electron'
import { handle, text } from '../bridge'
import type { AppContext } from '../context'
import { type ChosenFile, chosenFileLimit, chosenType, readFileAsk } from '../native/files'
import { PictureShelf } from '../native/pictures'

export function register(context: AppContext): void {
  const isMain = (from: WebContents) => from === context.mainWindow()?.webContents

  // MARK: Windows' file dialog

  handle('chooseFiles', async (from, ask) => {
    const checked = readFileAsk(ask)
    if (!checked) throw new Error('A file dialog’s words and kinds were expected.')
    const window = context.mainWindow()
    if (!window || !isMain(from)) return []
    const answer = await dialog.showOpenDialog(window, {
      title: checked.title,
      properties: checked.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: [{ name: checked.filterName, extensions: checked.extensions }],
    })
    if (answer.canceled) return []
    const chosen: ChosenFile[] = []
    for (const file of answer.filePaths) {
      if (chosen.length >= checked.max) break
      const name = path.basename(file)
      // The dialog's kinds can be typed around ("*.*"): only the kinds asked for come back.
      const type = chosenType(name, checked)
      if (!type) continue
      try {
        const info = await stat(file)
        if (!info.isFile() || info.size > chosenFileLimit) continue
        chosen.push({ name, type, bytes: new Uint8Array(await readFile(file)) })
      } catch {
        // Gone or unreadable meanwhile: left out, as the Mac's panel leaves a file it can't read.
      }
    }
    return chosen
  })

  // MARK: Windows' alert sound

  handle('beep', (from) => {
    if (isMain(from)) shell.beep()
  })

  // MARK: Pictures from other sites, kept on this PC

  const shelf = new PictureShelf(path.join(context.dataFolder, 'pictures'), {
    lookup: async (host) => (await lookup(host, { all: true, verbatim: true })).map((found) => found.address),
    fetch: (url, init) => fetch(url, init),
  })
  handle('remotePicture', async (from, url) => {
    const address = text(url, 4_096)
    if (!isMain(from)) return null
    return shelf.logo(address)
  })
  handle('siteIcon', async (from, site) => {
    const name = text(site, 512)
    if (!isMain(from)) return null
    return shelf.siteIcon(name)
  })
}
