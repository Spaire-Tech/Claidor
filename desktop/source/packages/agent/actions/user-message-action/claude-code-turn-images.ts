/**
 * The person's pictures for a turn Claude Code runs (the user-message handler's `runOnClaudeCode`), 12
 * November 2026. A picture the person sends travels on the message as a selected image (its bytes, or the
 * blob they were kept under), never in its words; the turn handed Claude Code only the words, so an agent
 * on Claude saw none of them ("None of the 8 reached me"). Each picture is read here and made as small as
 * the engine makes the pictures it sends its own model (`resizeImageBufferIfNeeded`: at most 1024 pixels a
 * side and 1 MB), in the order the person sent them. Its own module so a test can run it without the
 * handler's dependencies.
 */
import { PrivacyCapability } from "../../../redaction/classification.js";
import { resizeImageBufferIfNeeded } from "../../../utils/image-resize.js";

/** A picture as Claude reads one: its type and its bytes in base64. */
export interface ClaudeCodeTurnImage {
  readonly mediaType: string;
  readonly data: string;
}

/** The types Claude reads. */
const READABLE = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
/** The most pictures one turn carries (Claude takes up to 100 a request; one message of the apps' holds 6). */
export const CLAUDE_CODE_TURN_MAX_IMAGES = 20;

export interface ClaudeCodeImageBlobStore {
  getBlob(ctx: unknown, blobId: Uint8Array): Promise<Uint8Array | undefined>;
}

export interface ClaudeCodeTurnImages {
  readonly images: readonly ClaudeCodeTurnImage[];
  /** Where each one is kept, when the engine knows (the file the person's app uploaded). */
  readonly paths: readonly string[];
  /** Pictures that came and could not be read, or were past the most a turn carries. */
  readonly skipped: number;
}

/** A field as written: the turn keeps its message wrapped (`RedactedString`, `RedactedBytes`). */
function plain(value: unknown): unknown {
  if (value !== null && typeof value === "object" && typeof (value as { unwrap?: unknown }).unwrap === "function") {
    return (value as { unwrap(purpose: unknown): unknown }).unwrap(PrivacyCapability.UNSAFE_ALWAYS_ALLOWED);
  }
  return value;
}

const bytesOf = (value: unknown): Uint8Array | undefined => {
  const read = plain(value);
  return read instanceof Uint8Array && read.length > 0 ? read : undefined;
};

/** One picture's bytes: its own, or the blob it was kept under. */
async function pictureBytes(ctx: unknown, blobStore: ClaudeCodeImageBlobStore | undefined, picture: { readonly dataOrBlobId?: { readonly case?: string; readonly value?: unknown } }): Promise<Uint8Array | undefined> {
  const kept = picture.dataOrBlobId;
  switch (kept?.case) {
    case "data": return bytesOf(kept.value);
    case "blobIdWithData": return bytesOf((kept.value as { data?: unknown } | undefined)?.data);
    case "blobId": {
      const id = bytesOf(kept.value);
      return id === undefined || blobStore === undefined ? undefined : bytesOf(await blobStore.getBlob(ctx, id));
    }
    default: return undefined;
  }
}

/** The pictures of the turn's messages, in order, each read and made small enough for Claude. */
export async function claudeCodeTurnImages(ctx: unknown, blobStore: ClaudeCodeImageBlobStore | undefined, messages: readonly unknown[]): Promise<ClaudeCodeTurnImages> {
  const pictures = messages.flatMap((message) => {
    const selected = (message as { selectedContext?: { selectedImages?: unknown } } | undefined)?.selectedContext?.selectedImages;
    return Array.isArray(selected) ? selected as { dataOrBlobId?: { case?: string; value?: unknown }; path?: unknown }[] : [];
  });
  const images: ClaudeCodeTurnImage[] = [];
  const paths: string[] = [];
  let skipped = Math.max(0, pictures.length - CLAUDE_CODE_TURN_MAX_IMAGES);
  for (const picture of pictures.slice(0, CLAUDE_CODE_TURN_MAX_IMAGES)) {
    try {
      const bytes = await pictureBytes(ctx, blobStore, picture);
      if (bytes === undefined) { skipped += 1; continue; }
      const small = await resizeImageBufferIfNeeded(Buffer.from(bytes));
      if (!READABLE.has(small.mimeType)) { skipped += 1; continue; }
      images.push({ mediaType: small.mimeType, data: Buffer.from(small.data).toString("base64") });
      const path = plain(picture.path);
      if (typeof path === "string" && path.trim() !== "") paths.push(path.trim());
    } catch {
      skipped += 1;
    }
  }
  return { images, paths, skipped };
}

/**
 * What the turn's words say of its pictures: how many came, where they are kept (so the agent can use the
 * files, upload them, attach them), and any that could not be read.
 */
export function claudeCodeImagesNote(found: ClaudeCodeTurnImages): string {
  const lines: string[] = [];
  const count = found.images.length;
  if (count > 0) {
    lines.push(count === 1
      ? "The person sent 1 picture with this message; it is shown to you above."
      : `The person sent ${count} pictures with this message; they are shown to you above, in the order sent.`);
    if (found.paths.length > 0) lines.push(`${count === 1 ? "Its file" : "Their files"}, for when you need ${count === 1 ? "it" : "them"} as files (to upload or attach):\n${found.paths.map((path) => `- ${path}`).join("\n")}`);
  }
  if (found.skipped > 0) {
    lines.push(found.skipped === 1
      ? "1 more picture came that couldn't be read here; tell the person if it matters."
      : `${found.skipped} more pictures came that couldn't be read here; tell the person if they matter.`);
  }
  return lines.join("\n");
}
