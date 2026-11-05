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

/** Hears the app's `quitting` and answers `readyToQuit` once the tasks are done. */
export function listenForQuitting(desktop: Desktop): () => void {
  return desktop.on('quitting', () => {
    void runBeforeQuit().then(() => desktop.call('readyToQuit').catch(() => {}))
  })
}
