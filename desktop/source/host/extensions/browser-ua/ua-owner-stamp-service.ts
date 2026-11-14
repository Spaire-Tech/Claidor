/**
 * A stamp on the cloud computer that says whose it is, for its browser to
 * read: the start of a hash of the signed-in person's id, in a small file
 * at a fixed place. The id itself is never written.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";

import { parseJwtPayload } from "../../../shared/node/simeon-token.js";

export const UA_OWNER_STAMP_PATH = "/tmp/sand-ua-user";
/** How many characters of the hash make the stamp. */
export const UA_OWNER_STAMP_LENGTH = 16;

/** The stamp of the person an access token is for. A token that names no one has none. */
export function uaOwnerStampForAccessToken(accessToken: string): string | null {
  const owner = parseJwtPayload(accessToken)?.sub;
  if (owner == null || owner.length === 0) return null;
  const hash = createHash("sha256").update(owner, "utf8").digest("hex");
  return hash.slice(0, UA_OWNER_STAMP_LENGTH);
}

/**
 * What it hands back writes the stamp of a token's owner: under a temporary
 * name first, then moved into place, and only when it is not the stamp it
 * last wrote. A write that fails is told to the log and tried again the
 * next time; it never fails the caller.
 */
export function createUaOwnerStampWriter(options: { readonly path?: string; readonly log: (message: string) => void }) {
  const file = options.path ?? UA_OWNER_STAMP_PATH;
  const draft = `${file}.tmp`;
  /** The stamp the file is known to hold, once a write has gone through. */
  let written: string | null = null;

  return async (accessToken: string | null): Promise<void> => {
    if (accessToken == null) return;
    const stamp = uaOwnerStampForAccessToken(accessToken);
    if (stamp == null || stamp === written) return;
    try {
      await fs.writeFile(draft, `${stamp}\n`, { encoding: "utf8", mode: 0o644 });
      await fs.rename(draft, file);
      written = stamp;
    } catch (error) {
      options.log(`ua-owner stamp write failed: ${String(error)}`);
    }
  };
}
