/**
 * The MCP catalogue as it lies on disk: a folder of servers, and in each
 * server's folder a folder of tools, one JSON definition per tool.
 */

/** The folder that holds one folder per MCP server. */
export const MCP_DISK_CATALOG_MCPS_DIR = "mcps";

/** The folder, inside a server's own, that holds its tools' definitions. */
export const MCP_DISK_CATALOG_TOOLS_DIR = "tools";

/** The fields a definition may name its tool in. The first that holds a name is the one read. */
const NAME_FIELDS = ["name", "toolName"] as const;

/**
 * The tool's name, read from the text of its definition file. The text must
 * be the JSON of an object, and the name a text that is not empty: anything
 * else gives undefined, a text that is no JSON included.
 */
export function parseMcpToolNameFromDiskDefinitionJson(jsonText: string): string | undefined {
  let definition: unknown;
  try {
    definition = JSON.parse(jsonText);
  } catch {
    return undefined;
  }
  if (typeof definition !== "object" || definition === null) {
    return undefined;
  }
  const fields = definition as Record<string, unknown>;
  for (const field of NAME_FIELDS) {
    const name = fields[field];
    if (typeof name === "string" && name.length > 0) {
      return name;
    }
  }
  return undefined;
}
