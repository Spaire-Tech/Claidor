import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  MCP_TEXT_FILE_THRESHOLD_BYTES,
  materializeMcpTextOutput,
} from "../../packages/agent-exec/agent-tools-file.js";
import { buildTruncatedInlineContent } from "../../packages/agent/tools/mcp/mcp-output-spill.js";
import type { McpResult } from "../../packages/proto/generated/agent/v1/mcp_exec_pb.js";
import { OutputLocation } from "../../packages/proto/generated/agent/v1/utils_pb.js";

export const SAND_SHELL_FILE_OUTPUT_THRESHOLD_BYTES = BigInt(MCP_TEXT_FILE_THRESHOLD_BYTES);
export const MAX_OUTPUT_FILE_SIZE = 1_000_000;
export const AGENT_TOOLS_DIR = ".sand/tools";

export const isLargeOutputSpillEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.SAND_DISABLE_LARGE_OUTPUT_SPILL !== "1";

export function createSandMcpTextSpiller<C>(opts: {
  readonly thresholdBytes?: number;
  readonly uploadTextFile: (ctx: C, path: string, data: Uint8Array) => Promise<void>;
}) {
  const thresholdBytes = opts.thresholdBytes ?? MCP_TEXT_FILE_THRESHOLD_BYTES;
  return async (ctx: C, result: McpResult): Promise<McpResult> => {
    if (result.result.case !== "success") {
      return result;
    }

    const materialized = await materializeMcpTextOutput({
      contentItems: result.result.value.content,
      thresholdBytes,
      write: async aggregateText => {
        try {
          const relativePath = path.posix.join(AGENT_TOOLS_DIR, `${randomUUID()}.txt`);
          const capped = aggregateText.length > MAX_OUTPUT_FILE_SIZE
            ? aggregateText.slice(0, MAX_OUTPUT_FILE_SIZE)
            : aggregateText;
          const data = new TextEncoder().encode(capped);
          await opts.uploadTextFile(ctx, relativePath, data);
          return new OutputLocation({
            filePath: relativePath,
            sizeBytes: BigInt(data.byteLength),
            lineCount: BigInt(capped.split("\n").length),
          });
        } catch {
          return undefined;
        }
      },
    });

    if (materialized === result.result.value.content) {
      return result;
    }

    // The file could not be written. Until 7 October 2026 the whole result
    // then went to the model inline, with no limit at all (an inbox review
    // read 60,000 characters per Gmail call). It is cut at the threshold
    // instead, with a notice saying so.
    const spilled = result.clone();
    if (spilled.result.case === "success") {
      spilled.result.value.content = materialized ?? buildTruncatedInlineContent(spilled.result.value.content);
    }
    return spilled;
  };
}
