// The app's identity, in one place.
//
// **Caisra**, the founder's name for it, decided 15 September 2026:
// "Caisra is now the official name I've decided on."
//
// APP_NAME is what `app.setName()` is given, and `configureUserDataPath()`
// joins it onto `appData` — so this constant decides where a person's
// conversations, memory, logins and engine state live. Changing it after
// anyone has installed would orphan all of that in the old directory,
// which is what `LEGACY_APP_NAMES` is for: on startup the old directory is
// moved to the new name, once, and the database file renamed with it.
//
// Note what is deliberately *not* renamed with these: the OpenClaw
// extension and provider id `lobster`, and the `agent:<id>:lobsterai:<session>`
// session-key format in `openclawChannelSessionSync.ts`. The first is
// upstream's and renaming it breaks the runtime; the second is an internal
// format nobody sees, and rewriting it risks session routing for no gain.

export const APP_NAME = 'Caisra';
export const APP_ID = 'caisra';
export const APP_USER_MODEL_ID = 'com.caisra.app';
export const APP_ATTENTION_BADGE_COLOR = '#FF3B30';
export const DB_FILENAME = 'caisra.sqlite';

/**
 * The names this app has had, newest last. An install made under one of
 * these has its user-data directory under that name and its database
 * file named after it; `configureUserDataPath()` moves both forward.
 */
export const LEGACY_APP_NAMES: readonly string[] = ['Faiser'];
export const LEGACY_DB_FILENAMES: readonly string[] = ['faiser.sqlite'];

/** Scheme of the deep link the browser sign-in returns to (`caisra://`). */
export const APP_PROTOCOL = 'caisra';

/** Folder created under the user's home for their default working directory. */
export const APP_HOME_DIR_NAME = 'caisra';

/** Folder created under the system temp directory for scratch files. */
export const APP_TEMP_DIR_NAME = 'caisra';
