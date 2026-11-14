/**
 * The file extensions the engine knows as pictures, videos and sounds, and
 * the media type each one stands for. An extension is written in these
 * tables the way `extensionOf` gives it: with its dot, in small letters.
 *
 * The tables are plain objects that the rest of the engine reads as they are
 * at the moment it asks.
 */

/**
 * The extension of a file name or of a path: its last dot and what follows,
 * in small letters, or "" when it has none. Only what comes after the last
 * slash of either kind is the name, and a dot that starts the name (".env")
 * belongs to it and opens no extension.
 */
export function extensionOf(name: string): string {
  const lastSlash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
  const lastDot = name.lastIndexOf(".");
  // No dot after the last slash, or the dot is the name's first character.
  if (lastDot <= lastSlash + 1) return "";
  return name.slice(lastDot).toLowerCase();
}

/** The pictures that are pictures everywhere: shown, attached, and handed to a model as such. */
export const IMAGE_MIME_FROM_EXTENSION: Readonly<Record<string, string>> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

/** A phone's own picture formats: the app can show them, and nothing else here counts them as pictures. */
export const CLIENT_NATIVE_IMAGE_MIME_FROM_EXTENSION: Readonly<Record<string, string>> = {
  ".heic": "image/heic",
  ".heif": "image/heif",
};

/** The extension a picture of each type is saved under. An icon goes by two types. */
export const EXTENSION_FROM_IMAGE_MIME: Readonly<Record<string, string>> = {
  "image/avif": ".avif",
  "image/bmp": ".bmp",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
};

export const VIDEO_MIME_FROM_EXTENSION: Readonly<Record<string, string>> = {
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".ogv": "video/ogg",
  ".webm": "video/webm",
};

export const AUDIO_MIME_FROM_EXTENSION: Readonly<Record<string, string>> = {
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".oga": "audio/ogg",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
  ".weba": "audio/webm",
};
