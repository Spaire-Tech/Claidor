/**
 * Pictures made small enough before a prompt goes to a model. A picture can
 * sit in a person's message, as bytes, or in a tool's result, as base64.
 * Each is handed to `utils/image-resize`, which gives it back as it was or
 * smaller, with the kind it really is. A picture that cannot be handled
 * stays where it is when it is no larger than the size limit; a larger one
 * is left out, with a line of words in its place. Every case writes a line
 * to the log.
 *
 * Nothing that comes in is changed: a message, a list or a piece that needs
 * a change is copied and the copy changed, and whatever needs none comes
 * back itself.
 *
 * Between two pictures the code waits, and others may change a message
 * meanwhile. So that it does then what it always did, the lists of a tool's
 * message, and a picture's size and kind, are read again after each wait
 * rather than kept from before it.
 */
import { BaseMiddleware, type PromptExecutor } from "../base.js";
import { createLogger } from "../../context/logger.js";
import { MAX_IMAGE_SIZE_BYTES, resizeImageBufferIfNeeded } from "../../utils/image-resize.js";

type Loose = Record<string, any>;

const logger = createLogger("@sand/chat-inference/image-resizing-middleware");

/** How many messages have their pictures looked at at the same time. */
export const IMAGE_RESIZE_CONCURRENCY = 4;

type Resized = Awaited<ReturnType<typeof resizeImageBufferIfNeeded>>;

/** Whether what came back is another picture than the one that went in: another size in bytes, or another kind than the one it was named. */
function isAnother(resized: Resized, bytesBefore: number, kindBefore: unknown): boolean {
  return resized.data.length !== bytesBefore || resized.mimeType !== kindBefore;
}

/** The words put in the place of a picture that is left out. */
function leftOut(bytes: number, kind: unknown): Loose {
  return { type: "text", text: `[image omitted: failed to process ${bytes} bytes (${kind ?? "unknown"})]` };
}

/**
 * One message with its pictures made small enough: the message itself when
 * none of them changed, a copy otherwise. Messages that are neither a
 * person's nor a tool's are not looked into.
 */
export async function resizeImagesInMessage(context: any, message: Loose): Promise<Loose> {
  if (message.role === "user") {
    const pieces: unknown = message.content;
    if (!Array.isArray(pieces)) return message;

    const kept: Loose[] = [];
    let anyChanged = false;
    for (const piece of pieces as Loose[]) {
      // Only an image held as bytes is looked at. One given by its address, or as words, passes as it is.
      if (piece.type !== "image" || !(piece.image instanceof Uint8Array)) {
        kept.push(piece);
        continue;
      }
      try {
        const resized = await resizeImageBufferIfNeeded(Buffer.from(piece.image));
        if (!isAnother(resized, piece.image.length, piece.mimeType)) {
          kept.push(piece);
          continue;
        }
        anyChanged = true;
        logger.info(context, "Resized image in user message", {
          originalSize: piece.image.length,
          newSize: resized.data.length,
          newMimeType: resized.mimeType,
        });
        kept.push({ ...piece, image: resized.data, mimeType: resized.mimeType });
      } catch (error) {
        // A line the log refuses lands here too, after the message was marked as changed: its picture is then handled as one that failed.
        if (piece.image.length > MAX_IMAGE_SIZE_BYTES) {
          anyChanged = true;
          logger.error(context, "Failed to resize oversized image, dropping it", error, { originalSize: piece.image.length });
          kept.push(leftOut(piece.image.length, piece.mimeType));
        } else {
          logger.error(context, "Failed to resize image, keeping original", error);
          kept.push(piece);
        }
      }
    }
    return anyChanged ? { ...message, content: kept } : message;
  }

  if (message.role === "tool") {
    if (!Array.isArray(message.content)) return message;

    // The copies are made once, here and for each result; the walks below go over the message's own lists as they are at each step.
    const results = [...message.content] as Loose[];
    let anyChanged = false;
    for (let partIndex = 0; partIndex < message.content.length; partIndex += 1) {
      const result = message.content[partIndex] as Loose;
      if (result.type !== "tool-result" || !Array.isArray(result.experimental_content)) continue;

      const items = [...result.experimental_content] as Loose[];
      let anyItemChanged = false;
      for (let expContentIndex = 0; expContentIndex < result.experimental_content.length; expContentIndex += 1) {
        const item = result.experimental_content[expContentIndex] as Loose;
        if (item.type !== "image" || typeof item.data !== "string") continue;

        let bytes: Buffer;
        try {
          bytes = Buffer.from(item.data, "base64");
        } catch (error) {
          logger.error(context, "Failed to decode base64 image in tool result", error, { partIndex, expContentIndex });
          continue;
        }
        try {
          const resized = await resizeImageBufferIfNeeded(bytes);
          if (isAnother(resized, bytes.length, item.mimeType)) {
            anyItemChanged = true;
            anyChanged = true;
            logger.info(context, "Resized image in tool result", {
              partIndex,
              expContentIndex,
              originalSize: bytes.length,
              newSize: resized.data.length,
              newMimeType: resized.mimeType,
            });
            items[expContentIndex] = { ...item, data: Buffer.from(resized.data).toString("base64"), mimeType: resized.mimeType };
          }
        } catch (error) {
          // As for a person's picture: a line the log refuses lands here, after the marks were set.
          if (bytes.length > MAX_IMAGE_SIZE_BYTES) {
            anyItemChanged = true;
            anyChanged = true;
            logger.error(context, "Failed to resize oversized image in tool result, dropping it", error, { partIndex, expContentIndex, originalSize: bytes.length });
            items[expContentIndex] = leftOut(bytes.length, item.mimeType);
          } else {
            logger.error(context, "Failed to resize image in tool result, keeping original", error, { partIndex, expContentIndex });
          }
        }
      }
      if (anyItemChanged) results[partIndex] = { ...result, experimental_content: items };
    }
    if (anyChanged) return { ...message, content: results };
  }

  return message;
}

/**
 * Every message of a list with its pictures made small enough, in the
 * list's order. Up to four messages are worked on at once; each of the four
 * takes the next message nobody has taken when it is done with its own.
 */
export async function resizeImagesInMessages(context: any, messages: readonly Loose[]): Promise<Loose[]> {
  const done = new Array<Loose>(messages.length);
  let next = 0;
  const work = async (): Promise<void> => {
    while (next < messages.length) {
      const at = next;
      next += 1;
      done[at] = await resizeImagesInMessage(context, messages[at]!);
    }
  };
  const atOnce = Math.min(IMAGE_RESIZE_CONCURRENCY, messages.length);
  await Promise.all(Array.from({ length: atOnce }, work));
  return done;
}

/** What an executor's stream hands back: the pieces as they come, and promises for what is known at the end. */
interface StreamResult {
  readonly fullStream: AsyncIterable<Loose>;
  readonly response: Promise<unknown>;
  readonly usage: Promise<unknown>;
  readonly providerMetadata: Promise<unknown>;
  readonly extendedUsage: Promise<unknown>;
  readonly invocationId: Promise<unknown>;
}

/**
 * A wrapper that makes the pictures of the executor below small enough
 * right before each stream. The messages are read at once. When their
 * pictures are done, they replace the ones below, and only then is the
 * executor below asked for its stream. What this hands back at once
 * therefore waits on that: the stream and each promise pass on what the
 * executor below gives, or fail with whatever failed on the way.
 */
export class ImageResizingPromptExecutor extends BaseMiddleware<Loose> {
  override stream(context: any, invocationId?: string, tools?: readonly Loose[], options?: Loose): StreamResult {
    const messages = this.innerExecutor.getMessages();
    const below = (async (): Promise<StreamResult> => {
      const smaller = await resizeImagesInMessages(context, messages);
      this.innerExecutor.clearMessages();
      this.innerExecutor.appendMessages(smaller);
      return this.innerExecutor.stream(context, invocationId, tools, options) as StreamResult;
    })();
    return {
      fullStream: (async function* (): AsyncGenerator<Loose> {
        const streamed = await below;
        yield* streamed.fullStream;
      })(),
      response: below.then((streamed) => streamed.response),
      usage: below.then((streamed) => streamed.usage),
      providerMetadata: below.then((streamed) => streamed.providerMetadata),
      extendedUsage: below.then((streamed) => streamed.extendedUsage),
      invocationId: below.then((streamed) => streamed.invocationId),
    };
  }
}

/** A function that puts the wrapper in front of an executor. */
export function createImageResizingMiddleware(): (executor: PromptExecutor<Loose>) => ImageResizingPromptExecutor {
  return (executor) => new ImageResizingPromptExecutor(executor);
}

export const imageResizingMiddleware = createImageResizingMiddleware();
