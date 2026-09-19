/**
 * How a generated picture or video is named in the agent's tool result
 * when the app could not save it to disk.
 *
 * **Why this file exists.** When `persistGeneratedImages` saves an asset,
 * the result line is a short `file://` link and everything is fine. When
 * it saves nothing — the session has no `cwd`, or there is no session id
 * at all — `handleMediaGenerationCallback` used to fall back to putting
 * the *result URL itself* into the message text.
 *
 * That was harmless while the server was NetEase's, because a result URL
 * was a short `https://…` link to a hosted file. It stopped being
 * harmless when the Caisra image route started answering with the picture
 * inline as a `data:image/png;base64,…` URL: roughly 1–2 MB of base64 per
 * picture, interpolated straight into the model's context. One illustrated
 * answer could spend more context than the entire conversation around it.
 *
 * The safe pattern was already in this codebase — the background poller
 * names a picture without linking it — so this is that pattern, pulled
 * out so all five sites share it and so it can be tested.
 *
 * The rule: **a URL goes in the text only if it is a short, ordinary
 * link.** Anything inline, or anything absurdly long, is described
 * instead. Describing is never wrong; linking sometimes is.
 */

/**
 * How long a URL may be before it is described rather than linked.
 *
 * Generous enough for any real link — presigned S3 URLs with a full
 * signature run to a few hundred characters — and far below anything that
 * could be an encoded payload. The exact number matters less than that
 * there is one: the failure this guards against is unbounded, so the
 * guard has to be a bound.
 */
export const MAX_RESULT_URL_LENGTH = 2048;

/**
 * Whether this URL carries its content inside itself rather than pointing
 * at it. `data:` is the one that matters in practice; `blob:` is here
 * because it is equally meaningless written into a model's context.
 */
export function isInlineMediaUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return trimmed.startsWith('data:') || trimmed.startsWith('blob:');
}

/**
 * Whether this URL is safe to write into message text.
 */
export function isLinkableMediaUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (isInlineMediaUrl(trimmed)) return false;
  return trimmed.length <= MAX_RESULT_URL_LENGTH;
}

/**
 * One line of a `Results:` block for a generated asset the app did not
 * save to disk.
 *
 * Keeps the previous wording exactly for a linkable URL, so nothing about
 * the agent's reading of a normal result changes. For an inline one it
 * falls back to naming the asset, which is what the background poller has
 * always done.
 */
export function mediaResultLine(
  url: string,
  index: number,
  mediaType: 'image' | 'video',
): string {
  const label = mediaType === 'image' ? 'Generated image' : 'Generated video';
  if (!isLinkableMediaUrl(url)) {
    return `  - ${label} ${index + 1}`;
  }
  // An image was linked as an inline `![…](…)` and a video as a bare URL.
  // Both are kept as they were: this change is about what happens when a
  // URL cannot be shown, not about re-styling the ones that can.
  return mediaType === 'image'
    ? `  - ![${label} ${index + 1}](${url.trim()})`
    : `  - ${url.trim()}`;
}

/**
 * A whole `Results:` block's lines, in order.
 */
export function mediaResultLines(
  urls: readonly string[],
  mediaType: 'image' | 'video',
): string[] {
  return urls.map((url, index) => mediaResultLine(url, index, mediaType));
}

/**
 * Whether any of these results had to be described rather than linked —
 * so a caller can say why a picture is named but not shown.
 */
export function hasUnlinkableMedia(urls: readonly string[]): boolean {
  return urls.some(url => !isLinkableMediaUrl(url));
}
