/**
 * Long tool output kept out of the conversation: it is written to a file
 * under `agent-tools` in the project folder, and the model is told where the
 * file is, how big it is and how many lines it has.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";

import type { Context } from "../context/core.js";
import { McpTextContent, McpToolResultContentItem } from "../proto/generated/agent/v1/mcp_exec_pb.js";
import { OutputLocation, type OutputLocation as OutputLocationMessage } from "../proto/generated/agent/v1/utils_pb.js";
import { WriteArgs } from "../proto/generated/agent/v1/write_exec_pb.js";
import type { WriteExecutor } from "./write.js";

/** The folder the files go to, inside the project folder. */
const FOLDER = "agent-tools";
/** The most that is written to one file: 50 MB of text, counted in characters. */
const MOST_WRITTEN = 50 * 1024 * 1024;

/** Above this many bytes of text, an MCP tool's answer goes to a file. */
export const MCP_TEXT_FILE_THRESHOLD_BYTES = 40_000;
/** Above this many bytes, the output of the tools that write to `agent-tools` goes to a file. */
export const AGENT_TOOLS_FILE_WRITE_THRESHOLD_BYTES = 20_000;

/** A piece that is text and is not in a file yet. */
type PlainText = McpToolResultContentItem & { readonly content: { readonly case: "text"; readonly value: McpTextContent } };

function isPlainText(item: McpToolResultContentItem): item is PlainText {
  return item.content.case === "text" && item.content.value.outputLocation === undefined;
}

/**
 * An MCP tool's answer with its long text moved to a file. Up to
 * `thresholdBytes` of text (all plain text pieces, a blank line between
 * them), or with a threshold of zero or less, the pieces come back as they
 * are. Above it the text is handed to `write`, and one piece that points at
 * the file takes the place of the first text piece; the other text pieces
 * are dropped, and every other piece stays where it was. When `write` has no
 * place to give, nothing comes back.
 */
export async function materializeMcpTextOutput({
  contentItems,
  thresholdBytes,
  write,
}: {
  readonly contentItems: McpToolResultContentItem[];
  readonly thresholdBytes: number;
  readonly write: (aggregateText: string) => Promise<OutputLocationMessage | undefined>;
}): Promise<McpToolResultContentItem[] | undefined> {
  const whole = contentItems
    .filter(isPlainText)
    .map((item) => item.content.value.text)
    .join("\n\n");
  if (thresholdBytes <= 0 || Buffer.byteLength(whole, "utf8") <= thresholdBytes) return contentItems;

  const outputLocation = await write(whole);
  if (outputLocation === undefined) return undefined;

  let pointed = false;
  return contentItems.flatMap((item) => {
    if (!isPlainText(item)) return [item];
    if (pointed) return [];
    pointed = true;
    const pointer = new McpTextContent({ text: "", outputLocation });
    return [new McpToolResultContentItem({ content: { case: "text", value: pointer } })];
  });
}

/** An answer of a kind this code was not written for. The type says there is none. */
function unknownAnswer(answer: never): never {
  throw new Error(`Unhandled result case: ${answer}`);
}

/**
 * Writes `content` (cut to `maxSize` characters, 50 MB of them unless given)
 * to a new file under `agent-tools` in the project folder, and answers with
 * the path the writer says it wrote, the bytes and the lines written. The
 * path is joined the Windows way for `win32` and with forward slashes for
 * every other platform. Nothing comes back when the writer did not write.
 */
export async function writeToAgentToolsFile(
  ctx: Context,
  writeExecutor: WriteExecutor,
  {
    content,
    projectDir,
    osPlatform,
    toolCallId,
    maxSize,
  }: {
    readonly content: string;
    readonly projectDir: string;
    readonly osPlatform: string | undefined;
    readonly toolCallId: string;
    readonly maxSize?: number;
  },
): Promise<OutputLocationMessage | undefined> {
  const fileText = content.slice(0, maxSize ?? MOST_WRITTEN);
  const joined = (osPlatform === "win32" ? path.win32 : path.posix).join(projectDir, FOLDER, `${randomUUID()}.txt`);
  const lines = fileText.split("\n").length;
  const bytes = Buffer.byteLength(fileText, "utf8");

  const answer = await writeExecutor.execute(ctx, new WriteArgs({ path: joined, fileText, toolCallId }));
  const written = answer.result;
  switch (written.case) {
    case "success":
      return new OutputLocation({ filePath: written.value.path, sizeBytes: BigInt(bytes), lineCount: BigInt(lines) });
    case undefined:
    case "permissionDenied":
    case "noSpace":
    case "error":
    case "rejected":
      return undefined;
    default:
      return unknownAnswer(written);
  }
}

/** A size as it is told: in KB with one decimal from 1,024 bytes on, in bytes below that (and for what is no number). */
function sizeTold(sizeBytes: bigint): string {
  const bytes = Number(sizeBytes);
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} bytes`;
}

/** What the model is told of output that went to a file: two lines, the file and then its size and lines. */
export function describeOutputLocation(
  loc: OutputLocationMessage,
  opts?: { readonly leadText?: string },
): string {
  const what = opts?.leadText ?? "Content";
  return `${what} written to file: ${loc.filePath}\nSize: ${sizeTold(loc.sizeBytes)}, ${loc.lineCount} lines`;
}
