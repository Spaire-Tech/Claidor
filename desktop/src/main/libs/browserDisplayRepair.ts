import {
  BrowserDisplayMode,
  type BrowserWebAccessConfig,
} from '../../shared/browserWebAccess/constants';

/**
 * Putting the agent's browser back in the app, on a machine that already
 * has an answer stored.
 *
 * The founder, twice: *"it opens a new browser. It has no notion of its
 * own built-in browser. And I specifically designed that screen for
 * that."* And after the fix: *"the built in browser dont work. the thing
 * STILL opens it from my laptop."*
 *
 * The first fix changed the default to in-app. **A default only applies
 * when nothing is stored.** On an install that had ever opened the old
 * thirteen-tab settings — which this one had — `app_config.browserWebAccess`
 * already held an answer, either an explicit `displayMode: "external"` or
 * a `headless: false` that upstream's normaliser read as the same thing.
 * So the default changed and nothing else did: the config sync kept
 * writing `defaultProfile: "openclaw"`, the engine kept launching its own
 * Chromium, and the panel kept saying the agent was using its own window.
 *
 * This product has no screen that offers the choice. So a stored
 * `external` here is not a preference somebody expressed; it is a
 * leftover from the app this one was carved out of, and it is repaired
 * once, before the first config sync, where it can still change what the
 * gateway starts with.
 *
 * Pure, so the decision can be tested without a store or an engine.
 */

export interface BrowserDisplayRepair {
  /** Whether anything needs writing back. */
  changed: boolean;
  /** The config to store. Identical to the input when `changed` is false. */
  next: Partial<BrowserWebAccessConfig> | undefined;
  /** For the log, in the app's own words. */
  reason?: string;
}

export function repairBrowserDisplayMode(
  stored: Partial<BrowserWebAccessConfig> | undefined,
): BrowserDisplayRepair {
  // Nothing stored is the case the default already handles.
  if (!stored) return { changed: false, next: stored };

  if (stored.displayMode === BrowserDisplayMode.External) {
    return {
      changed: true,
      next: { ...stored, displayMode: BrowserDisplayMode.InApp },
      reason: 'a stored "external" from the old settings screen',
    };
  }

  // No `displayMode` at all, but a `headless: false` that the normaliser
  // used to read as External. The inference is gone, so this would now
  // resolve to in-app on its own — but writing it down means the stored
  // config says what the app does, rather than relying on a default two
  // files away.
  if (stored.displayMode === undefined && stored.headless === false) {
    return {
      changed: true,
      next: { ...stored, displayMode: BrowserDisplayMode.InApp },
      reason: 'a stored `headless: false`, which used to mean external',
    };
  }

  return { changed: false, next: stored };
}
