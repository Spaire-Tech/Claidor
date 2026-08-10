/**
 * What Next's own runtimes provide and Node does not.
 *
 * Next's middleware asserts that `AsyncLocalStorage` is on `globalThis` —
 * its edge and node runtimes both put it there before any server code
 * loads. Under vitest nothing does, so `src/proxy.test.ts` failed on
 * « AsyncLocalStorage accessed in runtime where it is not available »,
 * which is a fact about the environment the tests ran in rather than about
 * the middleware.
 *
 * It has to be a setup file rather than a line at the top of the test:
 * ES module imports are hoisted, so Next's internals would load — and
 * throw — before any statement in the test file ran.
 */

import { AsyncLocalStorage } from 'node:async_hooks'

globalThis.AsyncLocalStorage ??= AsyncLocalStorage
