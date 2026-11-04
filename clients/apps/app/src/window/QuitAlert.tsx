// The question as the Windows app quits while an agent still works in its
// browser (decision 3 of docs/app-browser/README.md, the Mac's alert to
// come in step 4): "Theo is still working in the browser", Move to
// Simeon's Computer (the default: the app quits and the engine moves the
// task to the computer), Stop and Cancel.

import { useSyncExternalStore } from 'react'
import type { AppStore } from '../core/store'
import type { QuitAsk, QuitChoice } from '../desktop/quitting'
import { t } from '../l10n'
import { Alert } from './Dialogs'

type Asking = {
  readonly names: readonly string[]
  answer(choice: QuitChoice): void
}

let asking: Asking | undefined
const listeners = new Set<() => void>()
const changed = () => {
  for (const listener of [...listeners]) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The page's side of the question: who is at work, the alert, their tasks stopped. */
export function quitAsk(store: () => AppStore | undefined): QuitAsk {
  return {
    working(browsing) {
      const busy = (store()?.agents ?? []).filter(
        (one) => browsing.includes(one.id) && one.isRunning,
      )
      return {
        ids: busy.map((one) => one.id),
        names: busy.map((one) => one.name),
      }
    },
    choose(names) {
      return new Promise<QuitChoice>((done) => {
        asking = {
          names,
          answer(choice) {
            asking = undefined
            changed()
            done(choice)
          },
        }
        changed()
      })
    },
    async stop(ids) {
      const now = store()
      if (now)
        await Promise.all(
          ids.map((id) => now.stopAgentTask(id).catch(() => false)),
        )
    },
  }
}

/** The alert itself, over the window while the question is open. */
export function QuitAlert() {
  const now = useSyncExternalStore(subscribe, () => asking)
  if (!now) return null
  const names = new Intl.ListFormat(
    document.documentElement.lang || undefined,
    { type: 'conjunction' },
  ).format(now.names)
  return (
    <Alert
      title={
        now.names.length === 1
          ? t`${names} is still working in the browser`
          : t`${names} are still working in the browser`
      }
      message={t('The pages on this PC close when you quit Simeon.')}
      action={t("Move to Simeon's Computer")}
      other={t('Stop')}
      onOther={() => now.answer('stop')}
      onAction={() => now.answer('move')}
      onCancel={() => now.answer('cancel')}
    />
  )
}
