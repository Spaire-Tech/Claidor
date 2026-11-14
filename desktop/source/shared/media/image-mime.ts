/**
 * The media type of a file, told from its name alone, and the extension a
 * picture of a given type is saved under. Nothing of the file is read.
 */
import {
  AUDIO_MIME_FROM_EXTENSION,
  CLIENT_NATIVE_IMAGE_MIME_FROM_EXTENSION,
  EXTENSION_FROM_IMAGE_MIME,
  IMAGE_MIME_FROM_EXTENSION,
  VIDEO_MIME_FROM_EXTENSION,
  extensionOf,
} from "./media-extensions.js";

/** What one of the tables says of an extension, as the table is now. */
function typeIn(table: Readonly<Record<string, string>>, extension: string): string | undefined {
  return table[extension];
}

export function imageMimeFromPath(filePath: string): string | undefined {
  return typeIn(IMAGE_MIME_FROM_EXTENSION, extensionOf(filePath));
}

/** The type of a picture the app can show: one of the usual pictures, or else one of a phone's own. */
export function servableImageMimeFromPath(filePath: string): string | undefined {
  const extension = extensionOf(filePath);
  return typeIn(IMAGE_MIME_FROM_EXTENSION, extension) ?? typeIn(CLIENT_NATIVE_IMAGE_MIME_FROM_EXTENSION, extension);
}

/**
 * The extension for a picture's type. Capitals do not matter; anything
 * around the type (a space, a parameter) does, and gives nothing.
 *
 * The table is a plain object, so a type spelled like something every object
 * has ("constructor", "__proto__") finds that thing instead of nothing.
 */
export function extensionFromImageMime(mime: string): string | undefined {
  return EXTENSION_FROM_IMAGE_MIME[mime.toLowerCase()];
}

export function videoMimeFromPath(filePath: string): string | undefined {
  return typeIn(VIDEO_MIME_FROM_EXTENSION, extensionOf(filePath));
}

export function audioMimeFromPath(filePath: string): string | undefined {
  return typeIn(AUDIO_MIME_FROM_EXTENSION, extensionOf(filePath));
}
