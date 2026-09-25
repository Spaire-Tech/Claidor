export const EGRESS_TUNNEL_WS_PORT = 8790;

export interface BoxConnectionInfo {
  readonly baseUrl: string;
  readonly token?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly vncProxy?: unknown;
}

export interface EgressTunnelConfig {
  readonly url: string;
  readonly bearer: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly allowPrivateTargets: boolean;
}

// A proxied box's gateway URL names its port in one of two places. Cursor's
// pod proxy: the first hostname label ends in `-<port>` (`<pod>-1340.…`),
// swapped for `-8790`. Simeon Labs' server (25 September 2026,
// `polar/sand/box_proxy.py`): the path ends in `/p/<port>`
// (`https://api.simeonlabs.com/sand-box/<id>/p/1340`), swapped the same way,
// with the path kept. The label rule is tried first so a Cursor-shaped
// descriptor, or a founder's per-port hostnames (`CLAIDOR_BOX_PUBLIC_URL_TEMPLATE`),
// derive exactly as before.
const PROXY_PATH_PORT = /\/p\/(\d+)\/?$/;

export function deriveEgressTunnelWsUrl(baseUrl: string, podProxied: boolean): string | null {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }
  if (podProxied) {
    const [firstLabel, ...rest] = url.hostname.split(".");
    if (firstLabel != null && /-\d+$/.test(firstLabel)) {
      url.hostname = [firstLabel.replace(/-\d+$/, `-${EGRESS_TUNNEL_WS_PORT}`), ...rest].join(".");
      url.pathname = "/";
    } else if (PROXY_PATH_PORT.test(url.pathname)) {
      url.pathname = url.pathname.replace(PROXY_PATH_PORT, `/p/${EGRESS_TUNNEL_WS_PORT}/`);
    } else {
      return null;
    }
  } else {
    url.port = String(EGRESS_TUNNEL_WS_PORT);
    url.pathname = "/";
  }
  url.protocol = url.protocol === "https:" || url.protocol === "wss:" ? "wss:" : "ws:";
  url.search = "";
  return url.toString();
}

export function boxConnectionToEgressConfig(info: BoxConnectionInfo): EgressTunnelConfig | null {
  if (info.token == null || info.token.length === 0) return null;
  const url = deriveEgressTunnelWsUrl(info.baseUrl, info.vncProxy != null);
  if (url == null) return null;
  return {
    url,
    bearer: info.token,
    ...(info.headers != null ? { headers: info.headers } : {}),
    allowPrivateTargets: false,
  };
}
