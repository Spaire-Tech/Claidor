// What the page does as the Windows app quits (the Mac's
// `applicationWillTerminate`, mac/Simeon/MacServices.swift: the chats kept,
// a call hung up and its record written). Each part adds its own with
// `beforeQuit`; the app waits a second at most, then quits anyway.

import type { Desktop } from './desktop'

type Task = () => void | Promise<void>

const tasks = new Set<Task>()

/** Something to do before the app quits; the returned function takes it back. */
export function beforeQuit(task: Task): () => void {
  tasks.add(task)
  return () => tasks.delete(task)
}

/** How long the page takes at most, inside the app's own second. */
export const quittingBudgetMs = 900

/** Runs every task, each given the same budget, and resolves when all are done or the budget is spent. */
export async function runBeforeQuit(
  budgetMs = quittingBudgetMs,
): Promise<void> {
  const running = [...tasks].map(async (task) => {
    try {
      await task()
    } catch {
      // One task failing never holds the others or the quit.
    }
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    Promise.all(running),
    new Promise<void>((done) => {
      timer = setTimeout(done, budgetMs)
    }),
  ])
  clearTimeout(timer)
}

/** The person's answer when an agent still works in the app's browser (decision 3 of docs/app-browser/README.md). */
export type QuitChoice = 'move' | 'stop' | 'cancel'

/** How the page asks (window/QuitAlert.tsx). */
export interface QuitAsk {
  /** Those of the agents with tabs here that are at work now; none, nothing is asked. */
  working(browsing: readonly string[]): {
    readonly ids: string[]
    readonly names: string[]
  }
  /** The alert, and the person's answer. */
  choose(names: readonly string[]): Promise<QuitChoice>
  /** Stop: their tasks stopped before the app quits. */
  stop(ids: readonly string[]): Promise<void>
}

/** Stopping waits this long at most, then the app quits anyway. */
const stopBudgetMs = 3_000

/**
 * Hears the app's `quitting` and answers `readyToQuit` once the tasks are
 * done. With an agent at work in the app's browser, asks first: Move to
 * Simeon's Computer (the app quits; the engine moves the task to the
 * computer when the browser goes), Stop (its task stopped, then quit) or
 * Cancel (the app stays).
 */
export function listenForQuitting(desktop: Desktop, ask?: QuitAsk): () => void {
  return desktop.on('quitting', (detail) => {
    void (async () => {
      const browsing =
        detail !== null && Array.isArray(detail?.browsing)
          ? detail.browsing.filter((one) => typeof one === 'string')
          : []
      const working =
        ask && browsing.length > 0
          ? ask.working(browsing)
          : { ids: [], names: [] }
      if (ask && working.ids.length > 0) {
        await desktop.call('holdQuit').catch(() => {})
        const choice = await ask.choose(working.names)
        if (choice === 'cancel') {
          await desktop.call('cancelQuit').catch(() => {})
          return
        }
        if (choice === 'stop') {
          let timer: ReturnType<typeof setTimeout> | undefined
          await Promise.race([
            ask.stop(working.ids).catch(() => {}),
            new Promise<void>((done) => {
              timer = setTimeout(done, stopBudgetMs)
            }),
          ])
          clearTimeout(timer)
        }
      }
      await runBeforeQuit()
      await desktop.call('readyToQuit').catch(() => {})
    })()
  })
}
