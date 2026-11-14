/**
 * The cloud computer: the tags of its image, the ports its screen is served
 * on, and the address of the viewer that shows that screen.
 */

export const SAND_BOX_IMAGE_TAG_PREFIX = "sand-box-";
export const SAND_BOX_IMAGE_TAG_LATEST = `${SAND_BOX_IMAGE_TAG_PREFIX}latest`;
export const SHORT_GIT_SHA_REGEX = /^[0-9a-f]{7,40}$/;

/** The computer's own screen is served on the first port, a fork's on the second. */
export const SAND_BOX_PRIMARY_NOVNC_PORT = 6080;
export const SAND_BOX_FORK_NOVNC_PORT = 6081;

/** The screen has two viewers. This is the path of the second; the first is `vnc.html`. */
export const SAND_SPECIAL_TREATMENT_NOVNC_PATH = "sand-special-treatment-v1/vnc.html";
const USUAL_VIEWER = "vnc.html";

/** What both the viewer's address and the socket's path carry: the network token and two fixed settings. */
function networkQuery(networkToken: string): string {
  return `network_token=${networkToken}&resume_lower_s=900&resume_upper_s=18000`;
}

/**
 * The address of the screen's viewer under a proxy. It ends with the path
 * of the socket the viewer connects to, made safe to sit inside an address;
 * the socket's path carries the token when there is one. Nothing else is
 * made safe: the proxy and the network token are written as they are given.
 */
export function buildSandBoxNoVncUrl(proxyBaseUrl: string, networkToken: string, token?: string, specialTreatment = false): string {
  const ownToken = token === undefined ? "" : `token=${token}&`;
  const socket = `websockify?${ownToken}${networkQuery(networkToken)}`;
  const viewer = specialTreatment ? SAND_SPECIAL_TREATMENT_NOVNC_PATH : USUAL_VIEWER;
  return `${proxyBaseUrl}/${viewer}?${networkQuery(networkToken)}&path=${encodeURIComponent(socket)}`;
}

/** Whether an address is the second viewer's: a whole address whose path ends with that viewer's path. */
export function isSandSpecialTreatmentNoVncUrl(value: string): boolean {
  let path: string;
  try {
    path = new URL(value).pathname;
  } catch {
    return false;
  }
  return path.endsWith(`/${SAND_SPECIAL_TREATMENT_NOVNC_PATH}`);
}
