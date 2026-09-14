// The app's identity, in one place.
//
// APP_NAME is what `app.setName()` is given, and `configureUserDataPath()`
// joins it onto `appData` — so this constant decides where a person's
// conversations, memory, logins and engine state live. Changing it after
// anyone has installed orphans all of that in the old directory.
//
// Note what is deliberately *not* renamed with these: the OpenClaw
// extension and provider id `lobster`, and the `agent:<id>:lobsterai:<session>`
// session-key format in `openclawChannelSessionSync.ts`. The first is
// upstream's and renaming it breaks the runtime; the second is an internal
// format nobody sees, and rewriting it risks session routing for no gain.

export const APP_NAME = 'Faiser';
export const APP_ID = 'faiser';
export const APP_USER_MODEL_ID = 'com.faiser.app';
export const APP_ATTENTION_BADGE_COLOR = '#FF3B30';
export const DB_FILENAME = 'faiser.sqlite';

/** Scheme of the deep link the browser sign-in returns to (`faiser://`). */
export const APP_PROTOCOL = 'faiser';

/** Folder created under the user's home for their default working directory. */
export const APP_HOME_DIR_NAME = 'faiser';

/** Folder created under the system temp directory for scratch files. */
export const APP_TEMP_DIR_NAME = 'faiser';
