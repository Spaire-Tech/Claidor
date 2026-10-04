/**
 * `node:crypto` for the browser bundle: the coordinator's gateway client
 * imports `randomUUID` and nothing else (gateway-client.ts). Browsers have
 * had `crypto.randomUUID` since 2021; the page is always on https or
 * loopback, where it is defined.
 */
export const randomUUID = (): string => crypto.randomUUID();
