"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SERVER_API_BASE_URL = void 0;
/**
 * Where the app's own server lives.
 *
 * Everything the account needs hangs off this one value: browser sign-in,
 * token exchange/refresh/logout, profile and quota, the model catalogue, the
 * metered proxy, memory sync, and the skill, kit and MCP catalogues.
 *
 * It ends in `/desktop` because that is the prefix the router is mounted
 * under (`server/polar/desktop/endpoints.py`). The paths the app builds on
 * top of it — `/api/auth/exchange`, `/api/user/quota`, `/api/models/available`
 * and the rest — already match the server's exactly, so nothing else moves.
 *
 * Both processes import this so they cannot drift apart. The main process
 * additionally allows a development override; see `libs/endpoints.ts`.
 */
exports.SERVER_API_BASE_URL = 'https://api.claidor.com/desktop';
//# sourceMappingURL=constants.js.map