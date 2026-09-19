"use strict";
/**
 * Waiting for a page to arrive after the agent does something to it.
 *
 * The old `click` returned "Element clicked." the instant the click was
 * dispatched. On a site like DoorDash nothing navigates when you click:
 * the page fetches in the background and redraws a second later. An agent
 * that reads straight after clicking sees the old page, concludes nothing
 * happened, and gives up — which is precisely what the founder watched.
 *
 * So after a click or a key press the host waits, in three steps:
 *
 *  1. a short window for a navigation to *start* (a real page load);
 *  2. if one started, for it to finish;
 *  3. for the DOM to go quiet — no mutations for `quietMs` — which is the
 *     signal a single-page app gives when its redraw is done.
 *
 * Each step has a ceiling, so a page that never settles (a ticker, an
 * animation) still comes back within a few seconds. The logic is pure and
 * takes its senses as functions, so it can be tested without a browser.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTLE = void 0;
exports.settlePage = settlePage;
exports.domQuietScript = domQuietScript;
exports.DEFAULT_SETTLE = {
    startWindowMs: 400,
    loadTimeoutMs: 8_000,
    quietMs: 500,
    quietTimeoutMs: 4_000,
    pollMs: 25,
};
async function settlePage(senses, options = {}) {
    const opts = { ...exports.DEFAULT_SETTLE, ...options };
    const started = senses.now();
    // 1. Did a navigation begin?
    let navigated = senses.isLoading();
    while (!navigated && senses.now() - started < opts.startWindowMs) {
        await senses.sleep(opts.pollMs);
        navigated = senses.isLoading();
    }
    // 2. If so, let it finish.
    let loaded = true;
    if (navigated) {
        const loadStarted = senses.now();
        while (senses.isLoading()) {
            if (senses.now() - loadStarted >= opts.loadTimeoutMs) {
                loaded = false;
                break;
            }
            await senses.sleep(opts.pollMs);
        }
    }
    // 3. Then wait for the redraw to stop. A navigation that begins *during*
    //    this wait tears the page down under the observer; that rejects,
    //    and we go round once more.
    let quiet = false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            quiet = await senses.domQuiet(opts.quietMs, opts.quietTimeoutMs);
            break;
        }
        catch {
            navigated = true;
            const loadStarted = senses.now();
            while (senses.isLoading()) {
                if (senses.now() - loadStarted >= opts.loadTimeoutMs) {
                    loaded = false;
                    break;
                }
                await senses.sleep(opts.pollMs);
            }
        }
    }
    return { navigated, loaded, quiet, waitedMs: senses.now() - started };
}
/**
 * The script the host runs in the page for `domQuiet`. It resolves `true`
 * after `quietMs` without a mutation, `false` when `maxMs` runs out.
 */
function domQuietScript(quietMs, maxMs) {
    return `new Promise((resolve) => {
    let timer;
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      try { observer.disconnect(); } catch {}
      resolve(value);
    };
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => done(true), ${Math.max(0, quietMs)});
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    timer = setTimeout(() => done(true), ${Math.max(0, quietMs)});
    setTimeout(() => done(false), ${Math.max(quietMs, maxMs)});
  })`;
}
//# sourceMappingURL=agentBrowserSettle.js.map