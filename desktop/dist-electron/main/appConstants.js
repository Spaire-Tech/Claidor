"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.APP_TEMP_DIR_NAME = exports.APP_HOME_DIR_NAME = exports.APP_PROTOCOL = exports.LEGACY_DB_FILENAMES = exports.LEGACY_APP_NAMES = exports.DB_FILENAME = exports.APP_ATTENTION_BADGE_COLOR = exports.APP_USER_MODEL_ID = exports.APP_ID = exports.APP_NAME = void 0;
exports.APP_NAME = 'Caisra';
exports.APP_ID = 'caisra';
exports.APP_USER_MODEL_ID = 'com.caisra.app';
exports.APP_ATTENTION_BADGE_COLOR = '#FF3B30';
exports.DB_FILENAME = 'caisra.sqlite';
/**
 * The names this app has had, newest last. An install made under one of
 * these has its user-data directory under that name and its database
 * file named after it; `configureUserDataPath()` moves both forward.
 */
exports.LEGACY_APP_NAMES = ['Faiser'];
exports.LEGACY_DB_FILENAMES = ['faiser.sqlite'];
/** Scheme of the deep link the browser sign-in returns to (`caisra://`). */
exports.APP_PROTOCOL = 'caisra';
/** Folder created under the user's home for their default working directory. */
exports.APP_HOME_DIR_NAME = 'caisra';
/** Folder created under the system temp directory for scratch files. */
exports.APP_TEMP_DIR_NAME = 'caisra';
//# sourceMappingURL=appConstants.js.map